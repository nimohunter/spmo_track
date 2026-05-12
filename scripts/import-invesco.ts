import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import type { Holding, Snapshot, SnapshotIndex } from "../lib/types.ts";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, "..");
const HOLDINGS_DIR = join(ROOT, "data", "holdings");
const INDEX_PATH = join(ROOT, "data", "index.json");

// Invesco's monthly-holdings CSV looks like:
//   ﻿Ticker,Company,Share/ Par,% TNA,Class of shares,CUSIP,Market value
//   "NVDA","NVIDIA Corp","7,659,415.00","9.01%","Common Stock","67066G104","$1,648,306,108"
//   ...
//   # as of 2026-05-08
//
// Non-equity rows ("Currency", "Money Market Fund, Taxable", "Uninvestible Cash") get filtered out.

const EQUITY_CLASSES = new Set([
  "Common Stock",
  "Real Estate Investment Trust",
  "ADR",
]);

type Row = {
  ticker: string;
  name: string;
  shares: number | null;
  weight: number;
  cusip: string;
  className: string;
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseNumber(s: string): number | null {
  const cleaned = s.replace(/[$,\s]/g, "").replace(/%$/, "");
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseCsv(raw: string): { asOfDate: string; rows: Row[] } {
  const text = raw.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/);
  let asOfDate = "";
  const rows: Row[] = [];
  let headerSeen = false;

  for (const line of lines) {
    if (!line.trim()) continue;
    const asOfMatch = line.match(/#\s*as of\s*(\d{4}-\d{2}-\d{2})/i);
    if (asOfMatch) {
      asOfDate = asOfMatch[1];
      continue;
    }
    if (!headerSeen) {
      if (/Ticker/i.test(line) && /Company/i.test(line)) {
        headerSeen = true;
      }
      continue;
    }
    const cols = parseCsvLine(line);
    if (cols.length < 5) continue;
    const [ticker, name, shares, weight, className, cusip] = cols;
    rows.push({
      ticker: ticker.trim(),
      name: name.trim(),
      shares: parseNumber(shares),
      weight: parseNumber(weight) ?? 0,
      cusip: (cusip ?? "").trim(),
      className: className.trim(),
    });
  }

  if (!asOfDate) {
    throw new Error("Could not find '# as of YYYY-MM-DD' line in CSV");
  }
  return { asOfDate, rows };
}

function buildSnapshot(asOfDate: string, rows: Row[], sourceFile: string): Snapshot {
  const equity = rows.filter((r) => EQUITY_CLASSES.has(r.className) && r.ticker);
  equity.sort((a, b) => b.weight - a.weight);
  const holdings: Holding[] = equity.map((r, i) => ({
    rank: i + 1,
    ticker: r.ticker,
    name: r.name,
    weight: Number(r.weight.toFixed(4)),
    shares: r.shares,
  }));
  return {
    ticker: "SPMO",
    asOfDate,
    fetchedAt: new Date().toISOString(),
    source: `invesco-csv:${basename(sourceFile)}`,
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

async function findCsv(arg: string | undefined): Promise<string> {
  if (arg) return arg;
  const files = await readdir(HOLDINGS_DIR);
  const csvs = files.filter((f) => /invesco.*\.csv$/i.test(f));
  if (csvs.length === 0) {
    throw new Error(`No Invesco CSV found in ${HOLDINGS_DIR}. Pass path as argument.`);
  }
  csvs.sort();
  return join(HOLDINGS_DIR, csvs[csvs.length - 1]);
}

async function main(): Promise<void> {
  const csvPath = await findCsv(process.argv[2]);
  console.log(`Reading ${csvPath}`);
  const raw = await readFile(csvPath, "utf8");
  const { asOfDate, rows } = parseCsv(raw);
  const snapshot = buildSnapshot(asOfDate, rows, csvPath);
  const filePath = join(HOLDINGS_DIR, `${asOfDate}.json`);
  const existed = existsSync(filePath);
  await writeJson(filePath, snapshot);

  const index = await readIndex();
  const knownDates = new Set(index.snapshots.map((s) => s.date));
  if (!knownDates.has(asOfDate)) {
    index.snapshots.push({ date: asOfDate, file: `holdings/${asOfDate}.json` });
    index.snapshots.sort((a, b) => a.date.localeCompare(b.date));
    await writeJson(INDEX_PATH, index);
  }

  const top = snapshot.holdings.slice(0, 5).map((h) => `${h.ticker} ${h.weight.toFixed(2)}%`).join(", ");
  console.log(
    `${existed ? "Replaced" : "Wrote"} holdings/${asOfDate}.json — ` +
      `${snapshot.holdings.length} holdings · top 5: ${top}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
