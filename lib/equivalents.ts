import type { Holding, Snapshot } from "./types";

export type ShareClassGroup = {
  combinedTicker: string;
  combinedName: string;
  members: string[];
};

export const SHARE_CLASS_GROUPS: ShareClassGroup[] = [
  {
    combinedTicker: "GOOG+L",
    combinedName: "Alphabet Inc. (Class A + C combined)",
    members: ["GOOGL", "GOOG"],
  },
  {
    combinedTicker: "BRK",
    combinedName: "Berkshire Hathaway (Class A + B combined)",
    members: ["BRK.A", "BRK.B"],
  },
  {
    combinedTicker: "FOX+A",
    combinedName: "Fox Corporation (Class A + B combined)",
    members: ["FOXA", "FOX"],
  },
  {
    combinedTicker: "NWS+A",
    combinedName: "News Corp (Class A + B combined)",
    members: ["NWSA", "NWS"],
  },
];

// Companies that changed their ticker symbol. SPMO's holdings feed can keep
// reporting the old symbol after a rename, while our S&P 500 universe (sourced
// from Wikipedia) already uses the new one — so the two never reconcile and the
// name looks both "dropped" (gains) and "added" (ranking) at once. Map the old
// symbol to the current one to link them. Keyed old → current.
export const TICKER_ALIASES: Record<string, string> = {
  BK: "BNY", // BNY Mellon renamed BK → BNY
};

export function canonicalTicker(ticker: string): string {
  return TICKER_ALIASES[ticker] ?? ticker;
}

export function combineShareClasses(holdings: Holding[]): Holding[] {
  const memberToGroup = new Map<string, ShareClassGroup>();
  for (const g of SHARE_CLASS_GROUPS) {
    for (const m of g.members) memberToGroup.set(m, g);
  }

  const grouped = new Map<string, Holding>();
  const passthrough: Holding[] = [];

  for (const h of holdings) {
    const group = memberToGroup.get(h.ticker);
    if (!group) {
      passthrough.push(h);
      continue;
    }
    const existing = grouped.get(group.combinedTicker);
    if (existing) {
      existing.weight += h.weight;
    } else {
      grouped.set(group.combinedTicker, {
        rank: h.rank,
        ticker: group.combinedTicker,
        name: group.combinedName,
        weight: h.weight,
        shares: null,
      });
    }
  }

  const merged = [...passthrough, ...grouped.values()]
    .map((h) => ({ ...h, weight: Number(h.weight.toFixed(4)) }))
    .sort((a, b) => b.weight - a.weight)
    .map((h, i) => ({ ...h, rank: i + 1 }));

  return merged;
}

export function combineSnapshot(snap: Snapshot): Snapshot {
  return { ...snap, holdings: combineShareClasses(snap.holdings) };
}
