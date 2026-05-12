import type { PriceBar } from "./types";

// S&P 500 Momentum Index methodology:
//   1. Momentum Value (MV) per stock:   price(M-2) / price(M-14) - 1
//      (12-month return, lagged by 2 months to neutralize short-term reversal)
//   2. σ_daily = std dev of daily returns over the same M-14 → M-2 window
//   3. Risk-adjusted MV = MV / σ_daily   (per-stock raw score)
//   4. Z = winsorize(z-score across universe, ±3)
//   5. Score multiplier:
//        Z > 0  → 1 + Z
//        Z < 0  → 1 / (1 - Z)
//        Z = 0  → 1
//   6. Weight ∝ Score × Float-Adj Mcap, capped at min(9%, 3× mcap weight)
// Selection: top 100 by score multiplier (== top 100 by Z, same ordering).

const WINSORIZE_CAP = 3;
const MOMENTUM_LAG_MONTHS = 2;
const MOMENTUM_WINDOW_MONTHS = 12;

export type MomentumValue = {
  mv: number;
  sigmaDaily: number;
  rawScore: number;
};

export function findClosestIndex(bars: PriceBar[], targetDate: string): number {
  let lo = 0;
  let hi = bars.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].date <= targetDate) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  return dt.toISOString().slice(0, 10);
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return NaN;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function dailyReturnsSlice(bars: PriceBar[], startIdx: number, endIdx: number): number[] {
  const out: number[] = [];
  for (let i = startIdx + 1; i <= endIdx; i++) {
    const prev = bars[i - 1].close;
    const curr = bars[i].close;
    if (prev > 0 && Number.isFinite(curr) && Number.isFinite(prev)) {
      out.push(curr / prev - 1);
    }
  }
  return out;
}

export function momentumValue(
  bars: PriceBar[],
  asOfDate: string,
): MomentumValue | null {
  if (bars.length < 40) return null;
  const dateStart = addMonths(asOfDate, -(MOMENTUM_WINDOW_MONTHS + MOMENTUM_LAG_MONTHS));
  const dateEnd = addMonths(asOfDate, -MOMENTUM_LAG_MONTHS);

  const idxStart = findClosestIndex(bars, dateStart);
  const idxEnd = findClosestIndex(bars, dateEnd);
  if (idxStart < 0 || idxEnd < 0 || idxEnd <= idxStart) return null;

  const pStart = bars[idxStart].close;
  const pEnd = bars[idxEnd].close;
  if (pStart <= 0 || pEnd <= 0) return null;

  const mv = pEnd / pStart - 1;
  const rets = dailyReturnsSlice(bars, idxStart, idxEnd);
  if (rets.length < 60) return null;
  const sigmaDaily = stdDev(rets);
  if (!Number.isFinite(sigmaDaily) || sigmaDaily <= 0) return null;

  return { mv, sigmaDaily, rawScore: mv / sigmaDaily };
}

export type UniverseScore = {
  ticker: string;
  raw: number;
  z: number;
  scoreMul: number;
};

export function computeUniverseScores<T extends { ticker: string; raw: number }>(
  inputs: T[],
): Array<T & UniverseScore> {
  const xs = inputs.map((x) => x.raw);
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance =
    xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  return inputs.map((row) => {
    const zRaw = sd > 0 ? (row.raw - mean) / sd : 0;
    const z = Math.max(-WINSORIZE_CAP, Math.min(WINSORIZE_CAP, zRaw));
    const scoreMul = z > 0 ? 1 + z : z < 0 ? 1 / (1 - z) : 1;
    return { ...row, z, scoreMul };
  });
}

const MAX_WEIGHT = 0.09;
const CAP_MULTIPLE = 3;

// Iteratively cap-and-redistribute weights per S&P 500 Momentum methodology:
//   1. Raw weight ∝ scoreMul × mcap, normalized to 100%
//   2. Per-stock cap = min(9%, 3 × pure-mcap weight within the top-N basket)
//   3. Any stock over its cap is locked to the cap; freed weight is redistributed
//      to unlocked stocks proportional to their raw value. Repeat until converged.
export function applyMomentumWeights(
  inputs: Array<{ scoreMul: number; mcap: number }>,
): number[] {
  const n = inputs.length;
  if (n === 0) return [];

  const totalMcap = inputs.reduce((a, x) => a + x.mcap, 0);
  if (totalMcap <= 0) return inputs.map(() => 0);

  const caps = inputs.map((x) =>
    Math.min(MAX_WEIGHT, CAP_MULTIPLE * (x.mcap / totalMcap)),
  );

  const raw = inputs.map((x) => Math.max(0, x.scoreMul) * x.mcap);
  const rawTotal = raw.reduce((a, b) => a + b, 0);
  if (rawTotal <= 0) return inputs.map(() => 0);

  const weights = raw.map((r) => r / rawTotal);
  const fixed = new Array(n).fill(false);

  for (let iter = 0; iter < 100; iter++) {
    const violators: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!fixed[i] && weights[i] > caps[i] + 1e-12) violators.push(i);
    }
    if (violators.length === 0) break;

    for (const i of violators) {
      weights[i] = caps[i];
      fixed[i] = true;
    }

    let capSum = 0;
    let unfixedRawSum = 0;
    for (let i = 0; i < n; i++) {
      if (fixed[i]) capSum += weights[i];
      else unfixedRawSum += raw[i];
    }
    const remaining = Math.max(0, 1 - capSum);
    if (unfixedRawSum > 0) {
      for (let i = 0; i < n; i++) {
        if (!fixed[i]) weights[i] = (raw[i] / unfixedRawSum) * remaining;
      }
    }
  }
  return weights;
}
