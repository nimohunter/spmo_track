import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  MonthlyRanking,
  RankingIndex,
  Snapshot,
  SnapshotIndex,
} from "./types";
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

// SPMO follows the S&P 500 Momentum Index, which rebalances after the close of
// the 3rd Friday of March and September. The May 31 / Nov 30 NPORT filings are
// the first regulatory snapshots after each rebalance and show the new
// constituent set; Feb 28 / Aug 31 NPORTs are mid-cycle (weights drift only).
// For non-NPORT files (e.g. daily Invesco snapshots) we keep the earliest
// snapshot in each rebalance period — anything later in the same period is
// the same constituents with just drift, so it'd clutter the chart.
function thirdFridayOfMonth(year: number, month: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offsetToFirstFriday = (5 - first.getUTCDay() + 7) % 7;
  const day = 1 + offsetToFirstFriday + 14;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function postRebalanceSnapshotDates(allDates: string[]): Set<string> {
  if (allDates.length === 0) return new Set();
  const years = allDates.map((d) => Number(d.slice(0, 4)));
  const yearStart = Math.min(...years) - 1;
  const yearEnd = Math.max(...years) + 1;
  const rebDates: string[] = [];
  for (let y = yearStart; y <= yearEnd; y++) {
    rebDates.push(thirdFridayOfMonth(y, 3));
    rebDates.push(thirdFridayOfMonth(y, 9));
  }

  const byPeriod = new Map<string, string[]>();
  for (const date of allDates) {
    let periodStart = "0000-00-00";
    for (const reb of rebDates) {
      if (reb < date) periodStart = reb;
      else break;
    }
    if (!byPeriod.has(periodStart)) byPeriod.set(periodStart, []);
    byPeriod.get(periodStart)!.push(date);
  }
  const markers = new Set<string>();
  for (const dates of byPeriod.values()) {
    dates.sort();
    markers.add(dates[0]);
  }
  return markers;
}

export async function loadAllSnapshots(): Promise<Snapshot[]> {
  const index = await loadIndex();
  const markers = postRebalanceSnapshotDates(index.snapshots.map((s) => s.date));
  const kept = index.snapshots.filter((s) => markers.has(s.date));
  const raw = await Promise.all(kept.map((s) => loadSnapshot(s.file)));
  return raw.map(combineSnapshot);
}

const RANKING_INDEX_PATH = join(DATA_DIR, "rankings-index.json");

export async function loadRankingIndex(): Promise<RankingIndex> {
  if (!existsSync(RANKING_INDEX_PATH)) return { rankings: [] };
  const raw = await readFile(RANKING_INDEX_PATH, "utf8");
  return JSON.parse(raw) as RankingIndex;
}

export async function loadRanking(file: string): Promise<MonthlyRanking> {
  const raw = await readFile(join(DATA_DIR, file), "utf8");
  return JSON.parse(raw) as MonthlyRanking;
}

export async function loadAllRankings(): Promise<MonthlyRanking[]> {
  const index = await loadRankingIndex();
  return Promise.all(index.rankings.map((r) => loadRanking(r.file)));
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
