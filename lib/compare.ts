import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SP500List } from "./types";
import { loadLatestFullSnapshot } from "./data";
import { canonicalTicker } from "./equivalents";

const DATA_DIR = join(process.cwd(), "data");

// A pick is "strong momentum" if its 12-mo (2-mo-lagged) return at the pick
// date exceeded this — used only to count how momentum-heavy each year's list is.
const STRONG_MOMENTUM = 0.5;

type SaPick = { ticker: string; name: string; mom12m: number | null };
type SaList = { year: number; selectedOn: string | null; sourceUrl?: string; picks: SaPick[] };
type SaFile = { source: string; momentumNote?: string; lists: SaList[] };

// How a Seeking Alpha pick relates to SPMO's universe:
//  held       — currently in SPMO
//  eligible   — in the S&P 500 but not held by SPMO
//  ineligible — not in the S&P 500 at all, so SPMO can never hold it
export type CompareStatus = "held" | "eligible" | "ineligible";

export type ComparedPick = {
  ticker: string;
  name: string;
  inSp500: boolean;
  heldBySpmo: boolean;
  spmoWeight: number | null;
  mom12m: number | null; // SPMO momentum value at the pick date
  status: CompareStatus;
};

export type ComparedYear = {
  year: number;
  selectedOn: string | null;
  sourceUrl?: string;
  total: number;
  eligibleCount: number; // in the S&P 500
  heldCount: number; // currently in SPMO
  strongMomentumCount: number; // mom12m ≥ STRONG_MOMENTUM at pick date
  picks: ComparedPick[];
};

export type CompareReport = {
  source: string;
  momentumNote?: string;
  strongMomentumPct: number; // the STRONG_MOMENTUM threshold, as a percent
  snapshotDate: string;
  years: ComparedYear[];
};

export async function loadSeekingAlphaComparison(): Promise<CompareReport | null> {
  const sa = JSON.parse(
    await readFile(join(DATA_DIR, "seeking-alpha.json"), "utf8"),
  ) as SaFile;

  const sp500 = JSON.parse(
    await readFile(join(DATA_DIR, "sp500.json"), "utf8"),
  ) as SP500List;
  const sp500Set = new Set(sp500.constituents.map((c) => c.ticker));

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
        const status: CompareStatus = !inSp500 ? "ineligible" : heldBySpmo ? "held" : "eligible";
        return {
          ticker: p.ticker,
          name: p.name,
          inSp500,
          heldBySpmo,
          spmoWeight: weight,
          mom12m: p.mom12m,
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
        strongMomentumCount: picks.filter((p) => p.mom12m != null && p.mom12m >= STRONG_MOMENTUM)
          .length,
        picks,
      };
    });

  return {
    source: sa.source,
    momentumNote: sa.momentumNote,
    strongMomentumPct: STRONG_MOMENTUM * 100,
    snapshotDate: snap?.asOfDate ?? "n/a",
    years,
  };
}
