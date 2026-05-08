import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Holding, Snapshot, SnapshotIndex } from "../lib/types.ts";

const TICKER = "SPMO";
const SOURCE_URL = `https://stockanalysis.com/api/symbol/e/${TICKER}/holdings`;
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, "..");
const HOLDINGS_DIR = join(ROOT, "data", "holdings");
const INDEX_PATH = join(ROOT, "data", "index.json");

type RawHolding = {
  no: number;
  n: string;
  s: string;
  as: string;
  sh: string;
};

type RawResponse = {
  date?: string;
  data?: { holdings?: RawHolding[] };
};

function parsePercent(value: string): number {
  const cleaned = value.replace(/[%\s,]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new Error(`Bad percent: ${value}`);
  return n;
}

function parseShares(value: string): number | null {
  const cleaned = value.replace(/[\s,]/g, "");
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseAsOfDate(raw: string | undefined): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new Error(`Bad as-of date: ${raw}`);
  return d.toISOString().slice(0, 10);
}

function normalizeHoldings(raw: RawHolding[]): Holding[] {
  return raw
    .map((r) => ({
      rank: r.no,
      ticker: r.s.replace(/^\$/, ""),
      name: r.n,
      weight: parsePercent(r.as),
      shares: parseShares(r.sh),
    }))
    .sort((a, b) => a.rank - b.rank);
}

async function fetchSnapshot(): Promise<Snapshot> {
  const res = await fetch(SOURCE_URL, {
    headers: {
      "User-Agent": "spmo-track/0.1 (+https://github.com)",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as RawResponse;
  const raw = json.data?.holdings;
  if (!raw || raw.length === 0) throw new Error("No holdings in response");
  return {
    ticker: "SPMO",
    asOfDate: parseAsOfDate(json.date),
    fetchedAt: new Date().toISOString(),
    source: SOURCE_URL,
    holdings: normalizeHoldings(raw),
  };
}

async function readIndex(): Promise<SnapshotIndex> {
  if (!existsSync(INDEX_PATH)) {
    return { ticker: "SPMO", snapshots: [] };
  }
  const raw = await readFile(INDEX_PATH, "utf8");
  return JSON.parse(raw) as SnapshotIndex;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function main(): Promise<void> {
  const snapshot = await fetchSnapshot();
  const fileName = `${snapshot.asOfDate}.json`;
  const filePath = join(HOLDINGS_DIR, fileName);
  await writeJson(filePath, snapshot);

  const index = await readIndex();
  const exists = index.snapshots.some((s) => s.date === snapshot.asOfDate);
  if (!exists) {
    index.snapshots.push({ date: snapshot.asOfDate, file: `holdings/${fileName}` });
    index.snapshots.sort((a, b) => a.date.localeCompare(b.date));
    await writeJson(INDEX_PATH, index);
  }

  const top = snapshot.holdings.slice(0, 5).map((h) => `${h.ticker} ${h.weight.toFixed(2)}%`).join(", ");
  console.log(`Wrote ${fileName} — ${snapshot.holdings.length} holdings. Top: ${top}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
