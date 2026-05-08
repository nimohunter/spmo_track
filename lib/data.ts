import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Snapshot, SnapshotIndex } from "./types";
import { combineSnapshot } from "./equivalents";

const DATA_DIR = join(process.cwd(), "data");

export async function loadIndex(): Promise<SnapshotIndex> {
  const raw = await readFile(join(DATA_DIR, "index.json"), "utf8");
  return JSON.parse(raw) as SnapshotIndex;
}

export async function loadSnapshot(file: string): Promise<Snapshot> {
  const raw = await readFile(join(DATA_DIR, file), "utf8");
  return JSON.parse(raw) as Snapshot;
}

function isReconstitutionDate(date: string): boolean {
  const month = date.slice(5, 7); // "YYYY-MM-DD" → "MM"
  return month === "05" || month === "11";
}

export async function loadAllSnapshots(): Promise<Snapshot[]> {
  const index = await loadIndex();
  const reconstitution = index.snapshots.filter((s) => isReconstitutionDate(s.date));
  const raw = await Promise.all(reconstitution.map((s) => loadSnapshot(s.file)));
  return raw.map(combineSnapshot);
}

export type WeightSeries = {
  date: string;
  [ticker: string]: number | string | null;
};

export function buildWeightSeries(
  snapshots: Snapshot[],
  topN: number,
  maxLines = 30,
): { tickers: string[]; series: WeightSeries[] } {
  if (snapshots.length === 0) return { tickers: [], series: [] };

  const sorted = [...snapshots].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));

  // Union of every ticker that was in the top N at any snapshot —
  // includes historically-significant names that have since dropped out.
  const everInTop = new Set<string>();
  for (const snap of sorted) {
    for (const h of snap.holdings.slice(0, topN)) {
      if (h.ticker.startsWith("?")) continue; // skip unresolved-CUSIP entries
      everInTop.add(h.ticker);
    }
  }

  // Score = sum of weights across all snapshots. Stocks that were big
  // either consistently (NVDA, META) or recently (MU, GOOG+L) both rank well.
  const score = new Map<string, number>();
  for (const t of everInTop) score.set(t, 0);
  for (const snap of sorted) {
    for (const h of snap.holdings) {
      if (everInTop.has(h.ticker)) {
        score.set(h.ticker, (score.get(h.ticker) ?? 0) + h.weight);
      }
    }
  }
  const tickers = [...everInTop]
    .sort((a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0))
    .slice(0, maxLines);
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
