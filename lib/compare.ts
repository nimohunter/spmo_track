import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { PriceHistory, SP500List } from "./types";
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
  returnSincePick: number | null; // buy at selectedOn close, priced at latest close
};

// Portfolio performance since the list's selection date. Buys settle at the
// first close on/after selectedOn; values use the latest adjusted close, so
// dividends are included. Cap weights use each pick's market cap at the buy
// date (today's cap back-scaled by price ratio — approximate but close).
export type YearPerformance = {
  from: string; // actual buy date used (first trading day on/after selectedOn)
  through: string; // last price date
  equalWeight: number; // 10% in each pick
  capWeight: number; // weights ∝ market cap at buy date
  spmo: number; // SPMO over the same window
  pricedCount: number; // picks with price data (both portfolios use these)
  series: PerformancePoint[]; // daily cumulative return of all three portfolios
};

export type PerformancePoint = {
  date: string;
  equal: number; // % return since buy
  cap: number;
  spmo: number;
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
  performance: YearPerformance | null;
};

export type CompareReport = {
  source: string;
  momentumNote?: string;
  strongMomentumPct: number; // the STRONG_MOMENTUM threshold, as a percent
  snapshotDate: string;
  years: ComparedYear[];
};

async function loadBars(ticker: string): Promise<PriceHistory["bars"] | null> {
  const file = join(DATA_DIR, "prices", ticker.replace(/[^A-Za-z0-9]+/g, "_") + ".json");
  if (!existsSync(file)) return null;
  const hist = JSON.parse(await readFile(file, "utf8")) as PriceHistory;
  return hist.bars.length ? hist.bars : null;
}

// Growth factor (price / buy price) per axis date, forward-filling gaps so a
// pick that didn't trade on a given day carries its last known price.
function growthOnAxis(
  bars: PriceHistory["bars"],
  axis: string[],
  selectedOn: string,
): { buyPrice: number; lastPrice: number; growth: number[] } | null {
  const buyIdx = bars.findIndex((b) => b.date >= selectedOn);
  if (buyIdx < 0 || bars[buyIdx].close <= 0) return null;
  const buyPrice = bars[buyIdx].close;
  const growth: number[] = [];
  let i = buyIdx;
  let last = buyPrice;
  for (const date of axis) {
    while (i < bars.length && bars[i].date <= date) {
      last = bars[i].close;
      i++;
    }
    growth.push(last / buyPrice);
  }
  return { buyPrice, lastPrice: last, growth };
}

async function computePerformance(
  picks: Array<{ ticker: string }>,
  selectedOn: string,
  mcaps: Record<string, number>,
): Promise<{ perf: YearPerformance | null; returns: Map<string, number> }> {
  const returns = new Map<string, number>();
  const spmoBars = await loadBars("SPMO");
  if (!spmoBars) return { perf: null, returns };
  const axis = spmoBars.filter((b) => b.date >= selectedOn).map((b) => b.date);
  if (axis.length < 2) return { perf: null, returns };

  const spmoG = growthOnAxis(spmoBars, axis, selectedOn);
  if (!spmoG) return { perf: null, returns };

  const held: Array<{ ticker: string; growth: number[]; mcapAtBuy: number | null }> = [];
  for (const p of picks) {
    const bars = await loadBars(p.ticker);
    const g = bars ? growthOnAxis(bars, axis, selectedOn) : null;
    if (!g) continue;
    returns.set(p.ticker, g.growth[g.growth.length - 1] - 1);
    // Market cap at the buy date ≈ today's cap scaled back by the price ratio.
    const mcapNow = mcaps[p.ticker];
    held.push({
      ticker: p.ticker,
      growth: g.growth,
      mcapAtBuy: mcapNow ? mcapNow * (g.buyPrice / g.lastPrice) : null,
    });
  }
  if (held.length === 0) return { perf: null, returns };

  const capTotal = held.reduce((a, h) => a + (h.mcapAtBuy ?? 0), 0);
  const series: PerformancePoint[] = axis.map((date, i) => {
    const equal = held.reduce((a, h) => a + h.growth[i], 0) / held.length;
    const cap =
      capTotal > 0
        ? held.reduce((a, h) => a + (h.mcapAtBuy ?? 0) * h.growth[i], 0) / capTotal
        : equal;
    return {
      date,
      equal: (equal - 1) * 100,
      cap: (cap - 1) * 100,
      spmo: (spmoG.growth[i] - 1) * 100,
    };
  });
  const final = series[series.length - 1];

  return {
    perf: {
      from: axis[0],
      through: final.date,
      equalWeight: final.equal / 100,
      capWeight: final.cap / 100,
      spmo: final.spmo / 100,
      pricedCount: held.length,
      series,
    },
    returns,
  };
}

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

  const mcaps = existsSync(join(DATA_DIR, "marketcaps.json"))
    ? (
        JSON.parse(await readFile(join(DATA_DIR, "marketcaps.json"), "utf8")) as {
          caps: Record<string, number>;
        }
      ).caps
    : {};

  const years: ComparedYear[] = [];
  for (const list of sa.lists.slice().sort((a, b) => a.year - b.year)) {
    const { perf, returns } = list.selectedOn
      ? await computePerformance(list.picks, list.selectedOn, mcaps)
      : { perf: null, returns: new Map<string, number>() };

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
        returnSincePick: returns.get(p.ticker) ?? null,
      };
    });

    years.push({
      year: list.year,
      selectedOn: list.selectedOn,
      sourceUrl: list.sourceUrl,
      total: picks.length,
      eligibleCount: picks.filter((p) => p.inSp500).length,
      heldCount: picks.filter((p) => p.heldBySpmo).length,
      strongMomentumCount: picks.filter((p) => p.mom12m != null && p.mom12m >= STRONG_MOMENTUM)
        .length,
      picks,
      performance: perf,
    });
  }

  return {
    source: sa.source,
    momentumNote: sa.momentumNote,
    strongMomentumPct: STRONG_MOMENTUM * 100,
    snapshotDate: snap?.asOfDate ?? "n/a",
    years,
  };
}
