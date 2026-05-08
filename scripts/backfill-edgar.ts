import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Holding, Snapshot, SnapshotIndex } from "../lib/types.ts";

const TRUST_CIK = "1378872";
const SPMO_SERIES_ID = "S000050154";
const UA = "spmo-track research/0.1 shoda9784@gmail.com";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, "..");
const HOLDINGS_DIR = join(ROOT, "data", "holdings");
const INDEX_PATH = join(ROOT, "data", "index.json");
const ID_MAP_PATH = join(ROOT, "data", "identifiers.json");
const YEARS_BACK = 3;

type IdMap = Record<string, string>;

type RawHolding = {
  name: string;
  isin: string | null;
  cusip: string | null;
  weight: number;
  shares: number | null;
  assetCat: string | null;
};

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

function getTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : null;
}

function getTagAll(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function listSpmoFilings(): Promise<string[]> {
  const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${SPMO_SERIES_ID}&type=NPORT&dateb=&owner=include&count=40&output=atom`;
  const xml = await fetchText(url);
  const accs = Array.from(xml.matchAll(/<accession-number>([^<]+)<\/accession-number>/g)).map(
    (m) => m[1],
  );
  return accs;
}

function parseHoldings(xml: string): RawHolding[] {
  const out: RawHolding[] = [];
  for (const inner of getTagAll(xml, "invstOrSec")) {
    const name = decodeXml(getTag(inner, "name") ?? "");
    const cusip = getTag(inner, "cusip");
    const isinMatch = inner.match(/<isin\s+value="([^"]+)"/);
    const isin = isinMatch ? isinMatch[1] : null;
    const pctRaw = getTag(inner, "pctVal");
    const sharesRaw = getTag(inner, "balance");
    const units = getTag(inner, "units");
    const assetCat = getTag(inner, "assetCat");
    if (!pctRaw) continue;
    const weight = Number(pctRaw);
    if (!Number.isFinite(weight)) continue;
    const shares = units === "NS" && sharesRaw ? Number(sharesRaw) : null;
    out.push({ name, isin, cusip, weight, shares, assetCat });
  }
  return out;
}

async function parseFiling(accession: string): Promise<{
  asOfDate: string;
  filingDate: string;
  source: string;
  raw: RawHolding[];
}> {
  const accNoDash = accession.replace(/-/g, "");
  const url = `https://www.sec.gov/Archives/edgar/data/${TRUST_CIK}/${accNoDash}/primary_doc.xml`;
  const xml = await fetchText(url);
  const asOfDate = getTag(xml, "repPdDate");
  if (!asOfDate) throw new Error(`No repPdDate in ${accession}`);
  return {
    asOfDate,
    filingDate: new Date().toISOString(),
    source: url,
    raw: parseHoldings(xml),
  };
}

async function loadIdMap(): Promise<IdMap> {
  if (!existsSync(ID_MAP_PATH)) return {};
  return JSON.parse(await readFile(ID_MAP_PATH, "utf8")) as IdMap;
}

async function saveIdMap(map: IdMap): Promise<void> {
  await writeJson(ID_MAP_PATH, map);
}

async function lookupTickers(isins: string[], existing: IdMap): Promise<IdMap> {
  const todo = Array.from(new Set(isins.filter((id) => !(id in existing))));
  if (todo.length === 0) return existing;
  console.log(`OpenFIGI: resolving ${todo.length} new ISINs...`);
  const out: IdMap = { ...existing };
  const BATCH = 10;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH).map((id) => ({
      idType: "ID_ISIN",
      idValue: id,
      exchCode: "US",
    }));
    const res = await fetch("https://api.openfigi.com/v3/mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify(batch),
    });
    if (res.status === 429) {
      console.log("  rate-limited, sleeping 30s...");
      await new Promise((r) => setTimeout(r, 30000));
      i -= BATCH;
      continue;
    }
    if (!res.ok) throw new Error(`OpenFIGI ${res.status}: ${await res.text()}`);
    const arr = (await res.json()) as Array<{ data?: Array<{ ticker?: string }>; warning?: string }>;
    arr.forEach((r, idx) => {
      const isin = todo[i + idx];
      const t = r.data?.[0]?.ticker;
      if (t) out[isin] = t.replace(/\//g, ".");
    });
    process.stdout.write(`  resolved ${Math.min(i + BATCH, todo.length)}/${todo.length}\r`);
    if (i + BATCH < todo.length) await new Promise((r) => setTimeout(r, 2500));
  }
  process.stdout.write("\n");
  return out;
}

function buildSnapshot(
  parsed: { asOfDate: string; source: string; raw: RawHolding[] },
  idMap: IdMap,
): Snapshot {
  const equity = parsed.raw.filter((h) => h.assetCat === "EC" || h.assetCat === null);
  const sorted = [...equity].sort((a, b) => b.weight - a.weight);
  const holdings: Holding[] = sorted.map((h, i) => {
    const resolved = h.isin ? idMap[h.isin] : undefined;
    const ticker = resolved ?? `?${(h.cusip ?? h.isin ?? h.name).slice(0, 8)}`;
    return {
      rank: i + 1,
      ticker,
      name: h.name,
      weight: Number(h.weight.toFixed(4)),
      shares: h.shares,
    };
  });
  return {
    ticker: "SPMO",
    asOfDate: parsed.asOfDate,
    fetchedAt: new Date().toISOString(),
    source: parsed.source,
    holdings,
  };
}

async function readIndex(): Promise<SnapshotIndex> {
  if (!existsSync(INDEX_PATH)) return { ticker: "SPMO", snapshots: [] };
  return JSON.parse(await readFile(INDEX_PATH, "utf8")) as SnapshotIndex;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function withinYears(date: string, years: number): boolean {
  const d = new Date(date);
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - years);
  return d >= cutoff;
}

async function main(): Promise<void> {
  const accessions = await listSpmoFilings();
  console.log(`Found ${accessions.length} SPMO NPORT filings.`);

  const parsed: Array<{ asOfDate: string; source: string; raw: RawHolding[] }> = [];
  for (const acc of accessions) {
    try {
      const p = await parseFiling(acc);
      if (!withinYears(p.asOfDate, YEARS_BACK)) continue;
      console.log(`  ${acc}: as-of ${p.asOfDate}, ${p.raw.length} positions`);
      parsed.push(p);
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      console.warn(`  ${acc}: ${(e as Error).message}`);
    }
  }

  const allIsins = parsed.flatMap((p) => p.raw.map((h) => h.isin).filter((x): x is string => !!x));
  let idMap = await loadIdMap();
  idMap = await lookupTickers(allIsins, idMap);
  await saveIdMap(idMap);

  const index = await readIndex();
  const knownDates = new Set(index.snapshots.map((s) => s.date));
  let added = 0;
  for (const p of parsed) {
    const snap = buildSnapshot(p, idMap);
    const fileName = `${snap.asOfDate}.json`;
    await writeJson(join(HOLDINGS_DIR, fileName), snap);
    if (!knownDates.has(snap.asOfDate)) {
      index.snapshots.push({ date: snap.asOfDate, file: `holdings/${fileName}` });
      knownDates.add(snap.asOfDate);
      added++;
    }
  }
  index.snapshots.sort((a, b) => a.date.localeCompare(b.date));
  await writeJson(INDEX_PATH, index);
  console.log(`Wrote ${parsed.length} snapshots (${added} new in index).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
