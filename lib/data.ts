import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Snapshot, SnapshotIndex } from "./types";

const DATA_DIR = join(process.cwd(), "data");

export async function loadIndex(): Promise<SnapshotIndex> {
  const raw = await readFile(join(DATA_DIR, "index.json"), "utf8");
  return JSON.parse(raw) as SnapshotIndex;
}

export async function loadSnapshot(file: string): Promise<Snapshot> {
  const raw = await readFile(join(DATA_DIR, file), "utf8");
  return JSON.parse(raw) as Snapshot;
}

export async function loadAllSnapshots(): Promise<Snapshot[]> {
  const index = await loadIndex();
  return Promise.all(index.snapshots.map((s) => loadSnapshot(s.file)));
}

export type WeightSeries = {
  date: string;
  [ticker: string]: number | string | null;
};

export function buildWeightSeries(
  snapshots: Snapshot[],
  topN: number
): { tickers: string[]; series: WeightSeries[] } {
  if (snapshots.length === 0) return { tickers: [], series: [] };

  const sorted = [...snapshots].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
  const latest = sorted[sorted.length - 1];
  const tickers = latest.holdings.slice(0, topN).map((h) => h.ticker);
  const tickerSet = new Set(tickers);

  const series: WeightSeries[] = sorted.map((snap) => {
    const row: WeightSeries = { date: snap.asOfDate };
    for (const t of tickerSet) row[t] = null;
    for (const h of snap.holdings) {
      if (tickerSet.has(h.ticker)) row[h.ticker] = h.weight;
    }
    return row;
  });

  return { tickers, series };
}
