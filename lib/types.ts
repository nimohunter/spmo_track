export type Holding = {
  rank: number;
  ticker: string;
  name: string;
  weight: number;
  shares: number | null;
};

export type Snapshot = {
  ticker: "SPMO";
  asOfDate: string;
  fetchedAt: string;
  source: string;
  holdings: Holding[];
};

export type IndexEntry = {
  date: string;
  file: string;
};

export type SnapshotIndex = {
  ticker: "SPMO";
  snapshots: IndexEntry[];
};

export type SP500Entry = {
  ticker: string;
  name: string;
  sector: string;
};

export type SP500List = {
  asOfDate: string;
  source: string;
  fetchedAt: string;
  constituents: SP500Entry[];
};

export type PriceBar = {
  date: string;
  close: number;
};

export type PriceHistory = {
  ticker: string;
  source: string;
  fetchedAt: string;
  bars: PriceBar[];
};

export type RankEntry = {
  rank: number;
  ticker: string;
  name: string;
  sector: string;
  mv: number;
  sigmaDaily: number;
  rawScore: number;
  z: number;
  scoreMul: number;
  inSpmo: boolean;
  currentWeight: number | null;
  expectedWeight: number | null;
  marketCap: number | null;
};

export type MonthlyRanking = {
  asOfDate: string;
  computedAt: string;
  universeSize: number;
  topN: number;
  entries: RankEntry[];
  predictedAdds: string[];
  predictedDrops: string[];
  spmoSnapshotDate: string;
  spmoFullDate: string | null;
  spmoPartialDate: string | null;
};

export type RankingIndexEntry = {
  date: string;
  file: string;
};

export type RankingIndex = {
  rankings: RankingIndexEntry[];
};
