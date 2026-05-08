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
];

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
