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
