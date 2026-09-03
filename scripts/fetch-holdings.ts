import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Holding, Snapshot, SnapshotIndex } from "../lib/types.ts";

const TICKER = "SPMO";
// stockanalysis.com dropped the /api/symbol JSON endpoint (2026-09); the holdings
// table now ships in the page's SvelteKit data payload, devalue-serialized.
const SOURCE_URL = `https://stockanalysis.com/etf/${TICKER.toLowerCase()}/holdings/__data.json`;
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

type SvelteKitData = {
  nodes?: Array<{ data?: unknown[] } | null>;
};

// Hydrate one value from a SvelteKit/devalue flat array: objects and arrays
// hold indices into the array; primitives are leaves.
function hydrate(arr: unknown[], idx: number): unknown {
  const v = arr[idx];
  if (Array.isArray(v)) return v.map((i) => hydrate(arr, i as number));
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v).map(([k, i]) => [k, hydrate(arr, i as number)]),
    );
  }
  return v;
}

function extractPayload(json: SvelteKitData): { date?: string; holdings: RawHolding[] } {
  for (const node of json.nodes ?? []) {
    const data = node?.data;
    if (!data || !Array.isArray(data)) continue;
    const root = data[0];
    if (!root || typeof root !== "object" || !("holdings" in root)) continue;
    const rootObj = root as Record<string, number>;
    const holdings = hydrate(data, rootObj.holdings) as RawHolding[];
    const date =
      "date" in rootObj ? (hydrate(data, rootObj.date) as string) : undefined;
    return { date, holdings };
  }
  throw new Error("No holdings node in SvelteKit payload");
}

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
  // Format in local time: "Aug 27, 2026" parses as local midnight, and
  // toISOString() would shift it back a day in timezones east of UTC.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  const json = (await res.json()) as SvelteKitData;
  const { date, holdings: raw } = extractPayload(json);
  if (!raw || raw.length === 0) throw new Error("No holdings in response");
  return {
    ticker: "SPMO",
    asOfDate: parseAsOfDate(date),
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
