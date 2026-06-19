import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { MonthlyRanking, PriceHistory, Snapshot } from "./types";
import { SHARE_CLASS_GROUPS, type ShareClassGroup } from "./equivalents";
import { loadIndex, loadSnapshot, loadRankingIndex, loadRanking } from "./data";

const DATA_DIR = join(process.cwd(), "data");

// SPMO tracks the S&P 500 Momentum Index, reconstituted after the close of the
// 3rd Friday of March and September. Those are the dates the current positions
// were last established, so we use the most recent one as the cost-basis date:
// the realised gain/loss of a rebalance is measured against where the book was
// set at the prior reconstitution.
function thirdFridayOfMonth(year: number, month: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offsetToFirstFriday = (5 - first.getUTCDay() + 7) % 7;
  const day = 1 + offsetToFirstFriday + 14;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function lastRebalanceDate(asOf: string): string {
  const y = Number(asOf.slice(0, 4));
  const candidates: string[] = [];
  for (let yy = y - 1; yy <= y; yy++) {
    candidates.push(thirdFridayOfMonth(yy, 3));
    candidates.push(thirdFridayOfMonth(yy, 9));
  }
  const past = candidates.filter((d) => d <= asOf).sort();
  return past[past.length - 1];
}

function tickerToFile(ticker: string): string {
  return ticker.replace(/[^A-Za-z0-9]+/g, "_") + ".json";
}

export type GainAction = "drop" | "trim";

export type GainRow = {
  ticker: string;
  name: string;
  action: GainAction;
  ranked: boolean; // false = held but absent from the momentum universe (treated as a drop)
  currentWeight: number; // % of current book
  targetWeight: number; // % if rebalanced today (0 for drops)
  marketValue: number; // shares × today's close
  costValue: number; // shares × close on cost-basis date
  soldFraction: number; // 0..1 of the position sold at rebalance
  proceeds: number; // soldFraction × marketValue
  realizedGain: number; // soldFraction × (marketValue − costValue)
};

export type GainsReport = {
  asOfDate: string;
  snapshotDate: string; // holdings snapshot used for shares
  priceDate: string; // most recent close used as "today"
  costBasisDate: string; // reconstitution date used as entry price
  portfolioValue: number; // market value of the held book at today's prices
  totalRealizedGain: number;
  totalGains: number; // sum of positive realized gains
  totalLosses: number; // sum of negative realized gains (≤ 0)
  totalProceeds: number; // turnover from sells/trims
  sellCount: number;
  dropCount: number;
  trimCount: number;
  rows: GainRow[];
  skipped: string[]; // held names missing price data
};

// Latest holdings snapshot that is a full constituent list (partial top-25
// snapshots don't represent the whole book, so they'd undercount the sells).
async function loadLatestFullSnapshot(asOf: string): Promise<Snapshot | null> {
  const idx = await loadIndex();
  const candidates = idx.snapshots
    .filter((s) => s.date <= asOf)
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const c of candidates) {
    const snap = await loadSnapshot(c.file); // raw, per-class shares (not collapsed)
    if (snap.holdings.length >= 50) return snap;
  }
  return null;
}

export async function computeRebalanceGains(asOf?: string): Promise<GainsReport | null> {
  const rankingIndex = await loadRankingIndex();
  if (rankingIndex.rankings.length === 0) return null;
  const latestRef = [...rankingIndex.rankings].sort((a, b) =>
    a.date.localeCompare(b.date),
  )[rankingIndex.rankings.length - 1];
  const ranking: MonthlyRanking = await loadRanking(latestRef.file);

  const effectiveAsOf = asOf ?? ranking.asOfDate;
  const snap = await loadLatestFullSnapshot(effectiveAsOf);
  if (!snap) return null;

  const costBasisDate = lastRebalanceDate(effectiveAsOf);

  // Map each dual-class member to its combined entity (the form the ranking uses).
  const memberToGroup = new Map<string, ShareClassGroup>();
  for (const g of SHARE_CLASS_GROUPS) for (const m of g.members) memberToGroup.set(m, g);

  // Ranking entries keyed by their display ticker (combined for dual-class).
  const rankByKey = new Map(ranking.entries.map((e) => [e.ticker, e] as const));

  // Collapse the held book into entities matching the ranking's grouping.
  type Entity = { key: string; name: string; members: { ticker: string; shares: number }[] };
  const entities = new Map<string, Entity>();
  for (const h of snap.holdings) {
    const group = memberToGroup.get(h.ticker);
    const key = group ? group.combinedTicker : h.ticker;
    const name = group ? group.combinedName : h.name;
    if (!entities.has(key)) entities.set(key, { key, name, members: [] });
    entities.get(key)!.members.push({ ticker: h.ticker, shares: h.shares ?? 0 });
  }

  // Load every member's price history once.
  const priceCache = new Map<string, PriceHistory | null>();
  const allTickers = [...entities.values()].flatMap((e) => e.members.map((m) => m.ticker));
  await Promise.all(
    [...new Set(allTickers)].map(async (t) => {
      const path = join(DATA_DIR, "prices", tickerToFile(t));
      const hist = existsSync(path)
        ? (JSON.parse(await readFile(path, "utf8")) as PriceHistory)
        : null;
      priceCache.set(t, hist);
    }),
  );

  // Value each entity at today's close and at the cost-basis date.
  type Valued = Entity & { marketValue: number; costValue: number };
  const valued: Valued[] = [];
  const skipped: string[] = [];
  let portfolioValue = 0;
  let priceDate = "";
  for (const e of entities.values()) {
    let marketValue = 0;
    let costValue = 0;
    let ok = true;
    for (const m of e.members) {
      const ph = priceCache.get(m.ticker);
      if (!ph || ph.bars.length === 0) {
        ok = false;
        break;
      }
      const last = ph.bars[ph.bars.length - 1];
      const costBar = ph.bars.findLast((b) => b.date <= costBasisDate);
      if (!costBar) {
        ok = false;
        break;
      }
      marketValue += m.shares * last.close;
      costValue += m.shares * costBar.close;
      if (last.date > priceDate) priceDate = last.date;
    }
    if (!ok) {
      skipped.push(e.key);
      continue;
    }
    portfolioValue += marketValue;
    valued.push({ ...e, marketValue, costValue });
  }

  // Determine target weight per entity and realise gains on whatever gets sold.
  const rows: GainRow[] = [];
  let totalRealizedGain = 0;
  let totalGains = 0;
  let totalLosses = 0;
  let totalProceeds = 0;
  let dropCount = 0;
  let trimCount = 0;

  for (const e of valued) {
    const entry = rankByKey.get(e.key);
    const ranked = !!entry;
    // Held names outside the top N (or absent from the universe) are dropped → target 0.
    const targetWeight =
      entry && entry.expectedWeight != null && entry.rank <= ranking.topN
        ? entry.expectedWeight
        : 0;
    const targetValue = (targetWeight / 100) * portfolioValue;
    if (e.marketValue <= targetValue + 1e-6) continue; // held flat or bought more → no sell

    const soldFraction = (e.marketValue - targetValue) / e.marketValue;
    const realizedGain = soldFraction * (e.marketValue - e.costValue);
    const proceeds = soldFraction * e.marketValue;
    const action: GainAction = targetWeight <= 0 ? "drop" : "trim";

    rows.push({
      ticker: e.key,
      name: e.name,
      action,
      ranked,
      currentWeight: portfolioValue > 0 ? (e.marketValue / portfolioValue) * 100 : 0,
      targetWeight,
      marketValue: e.marketValue,
      costValue: e.costValue,
      soldFraction,
      proceeds,
      realizedGain,
    });

    totalRealizedGain += realizedGain;
    totalProceeds += proceeds;
    if (realizedGain >= 0) totalGains += realizedGain;
    else totalLosses += realizedGain;
    if (action === "drop") dropCount++;
    else trimCount++;
  }

  // Biggest realized gain first; the client table can re-sort by any column.
  rows.sort((a, b) => b.realizedGain - a.realizedGain);

  return {
    asOfDate: effectiveAsOf,
    snapshotDate: snap.asOfDate,
    priceDate,
    costBasisDate,
    portfolioValue,
    totalRealizedGain,
    totalGains,
    totalLosses,
    totalProceeds,
    sellCount: rows.length,
    dropCount,
    trimCount,
    rows,
    skipped,
  };
}
