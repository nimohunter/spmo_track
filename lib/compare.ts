import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { MonthlyRanking, SP500List } from "./types";
import { loadLatestFullSnapshot, loadRankingIndex, loadRanking } from "./data";
import { canonicalTicker } from "./equivalents";

const DATA_DIR = join(process.cwd(), "data");

type SaPick = { ticker: string; name: string };
type SaList = { year: number; selectedOn: string | null; sourceUrl?: string; picks: SaPick[] };
type SaFile = { source: string; lists: SaList[] };

// How a Seeking Alpha pick relates to SPMO's world:
//  held       — currently in SPMO
//  add        — in the S&P 500 and inside SPMO's momentum top N, but not yet held (likely add)
//  eligible   — in the S&P 500 but ranks below the momentum cutoff (SPMO wouldn't pick it)
//  ineligible — not in the S&P 500 at all, so SPMO can never hold it
export type CompareStatus = "held" | "add" | "eligible" | "ineligible";

export type ComparedPick = {
  ticker: string;
  name: string;
  inSp500: boolean;
  heldBySpmo: boolean;
  spmoWeight: number | null;
  momentumRank: number | null;
  inMomentumTopN: boolean;
  status: CompareStatus;
};

export type ComparedYear = {
  year: number;
  selectedOn: string | null;
  sourceUrl?: string;
  total: number;
  eligibleCount: number; // in the S&P 500
  heldCount: number; // currently in SPMO
  topNCount: number; // in SPMO's momentum top N (held or predicted add)
  picks: ComparedPick[];
};

export type CompareReport = {
  source: string;
  rankingDate: string;
  snapshotDate: string;
  topN: number;
  years: ComparedYear[];
};

export async function loadSeekingAlphaComparison(): Promise<CompareReport | null> {
  const saRaw = await readFile(join(DATA_DIR, "seeking-alpha.json"), "utf8");
  const sa = JSON.parse(saRaw) as SaFile;

  const rankingIndex = await loadRankingIndex();
  if (rankingIndex.rankings.length === 0) return null;
  const latestRef = [...rankingIndex.rankings].sort((a, b) =>
    a.date.localeCompare(b.date),
  )[rankingIndex.rankings.length - 1];
  const ranking: MonthlyRanking = await loadRanking(latestRef.file);

  const sp500 = JSON.parse(
    await readFile(join(DATA_DIR, "sp500.json"), "utf8"),
  ) as SP500List;
  const sp500Set = new Set(sp500.constituents.map((c) => c.ticker));

  const rankByTicker = new Map(ranking.entries.map((e) => [e.ticker, e] as const));

  const snap = await loadLatestFullSnapshot();
  const heldWeight = new Map<string, number>();
  if (snap) {
    for (const h of snap.holdings) heldWeight.set(canonicalTicker(h.ticker), h.weight);
  }

  const years: ComparedYear[] = sa.lists
    .slice()
    .sort((a, b) => a.year - b.year)
    .map((list) => {
      const picks: ComparedPick[] = list.picks.map((p) => {
        const sym = canonicalTicker(p.ticker);
        const inSp500 = sp500Set.has(sym);
        const weight = heldWeight.get(sym) ?? null;
        const heldBySpmo = weight != null;
        const entry = rankByTicker.get(sym);
        const momentumRank = entry?.rank ?? null;
        const inMomentumTopN = entry != null && entry.rank <= ranking.topN;

        let status: CompareStatus;
        if (!inSp500) status = "ineligible";
        else if (heldBySpmo) status = "held";
        else if (inMomentumTopN) status = "add";
        else status = "eligible";

        return {
          ticker: p.ticker,
          name: p.name,
          inSp500,
          heldBySpmo,
          spmoWeight: weight,
          momentumRank,
          inMomentumTopN,
          status,
        };
      });

      return {
        year: list.year,
        selectedOn: list.selectedOn,
        sourceUrl: list.sourceUrl,
        total: picks.length,
        eligibleCount: picks.filter((p) => p.inSp500).length,
        heldCount: picks.filter((p) => p.heldBySpmo).length,
        topNCount: picks.filter((p) => p.inMomentumTopN).length,
        picks,
      };
    });

  return {
    source: sa.source,
    rankingDate: ranking.asOfDate,
    snapshotDate: snap?.asOfDate ?? "n/a",
    topN: ranking.topN,
    years,
  };
}
