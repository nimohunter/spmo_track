import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  MonthlyRanking,
  PriceHistory,
  RankEntry,
  RankingIndex,
  SP500List,
  Snapshot,
  SnapshotIndex,
} from "../lib/types.ts";
import {
  applyMomentumWeights,
  computeUniverseScores,
  momentumValue,
} from "../lib/momentum.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, "..");
const DATA_DIR = join(ROOT, "data");
const SP500_PATH = join(DATA_DIR, "sp500.json");
const PRICES_DIR = join(DATA_DIR, "prices");
const RANKINGS_DIR = join(DATA_DIR, "rankings");
const RANKINGS_INDEX_PATH = join(DATA_DIR, "rankings-index.json");
const SPMO_INDEX_PATH = join(DATA_DIR, "index.json");
const MCAP_PATH = join(DATA_DIR, "marketcaps.json");
const TOP_N = 100;

type MarketCapFile = {
  fetchedAt: string;
  source: string;
  caps: Record<string, number>;
};

function tickerToFile(ticker: string): string {
  return ticker.replace(/[^A-Za-z0-9]+/g, "_") + ".json";
}

function parseArgs(argv: string[]): { asOf: string } {
  let asOf = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--as-of") asOf = argv[++i];
  }
  return { asOf };
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

type SpmoRef = {
  tickers: Set<string>;
  weights: Map<string, number>;
  fullDate: string | null;
  partialDate: string | null;
};

// Returns the union of (a) the latest full NPORT (≥50 holdings) and (b) any partial
// snapshot that is more recent. The partial top-25 is authoritative for those names,
// so any post-rebalance additions captured there (e.g., MU after March 2026) get
// counted as in-SPMO even when the full NPORT for that period hasn't been released yet.
async function loadSpmoReference(asOf: string): Promise<SpmoRef> {
  const idx = await readJson<SnapshotIndex>(SPMO_INDEX_PATH);
  const candidates = idx.snapshots
    .filter((s) => s.date <= asOf)
    .sort((a, b) => b.date.localeCompare(a.date));

  let full: Snapshot | null = null;
  let partial: Snapshot | null = null;
  for (const c of candidates) {
    if (full && partial) break;
    const snap = await readJson<Snapshot>(join(DATA_DIR, c.file));
    if (snap.holdings.length >= 50) {
      if (!full) full = snap;
    } else if (!partial) {
      partial = snap;
    }
  }

  const tickers = new Set<string>();
  const weights = new Map<string, number>();
  // Prefer the partial (more recent) for weights if it is newer; otherwise full.
  const usePartialAsPrimary =
    partial !== null && (full === null || partial.asOfDate > full.asOfDate);
  if (full) {
    for (const h of full.holdings) {
      const key = normaliseTicker(h.ticker);
      tickers.add(key);
      if (!usePartialAsPrimary) weights.set(key, h.weight);
    }
  }
  if (partial && usePartialAsPrimary) {
    for (const h of partial.holdings) {
      const key = normaliseTicker(h.ticker);
      tickers.add(key);
      weights.set(key, h.weight);
    }
    // Anything in the older full snapshot we don't have a fresher weight for: keep the old weight as best-available
    if (full) {
      for (const h of full.holdings) {
        const key = normaliseTicker(h.ticker);
        if (!weights.has(key)) weights.set(key, h.weight);
      }
    }
  }
  return {
    tickers,
    weights,
    fullDate: full?.asOfDate ?? null,
    partialDate: usePartialAsPrimary ? partial!.asOfDate : null,
  };
}

function normaliseTicker(t: string): string {
  return t.replace(/[.\-/]/g, "").toUpperCase();
}

async function main(): Promise<void> {
  const { asOf } = parseArgs(process.argv.slice(2));
  const list = await readJson<SP500List>(SP500_PATH);
  const spmo = await loadSpmoReference(asOf);
  const spmoTickers = spmo.tickers;
  const mcaps: Record<string, number> = existsSync(MCAP_PATH)
    ? (await readJson<MarketCapFile>(MCAP_PATH)).caps
    : {};

  type Row = { ticker: string; name: string; sector: string; raw: number; mv: number; sigmaDaily: number };
  const rows: Row[] = [];
  let missing = 0;
  let badData = 0;

  for (const c of list.constituents) {
    const path = join(PRICES_DIR, tickerToFile(c.ticker));
    if (!existsSync(path)) {
      missing++;
      continue;
    }
    const hist = await readJson<PriceHistory>(path);
    const mv = momentumValue(hist.bars, asOf);
    if (!mv) {
      badData++;
      continue;
    }
    rows.push({
      ticker: c.ticker,
      name: c.name,
      sector: c.sector,
      raw: mv.rawScore,
      mv: mv.mv,
      sigmaDaily: mv.sigmaDaily,
    });
  }

  if (rows.length < 100) {
    throw new Error(`Only ${rows.length} valid rows — too few to compute z-scores`);
  }

  const scored = computeUniverseScores(rows);
  scored.sort((a, b) => b.scoreMul - a.scoreMul);

  const topInputs: Array<{ scoreMul: number; mcap: number }> = [];
  for (let i = 0; i < Math.min(TOP_N, scored.length); i++) {
    topInputs.push({
      scoreMul: scored[i].scoreMul,
      mcap: mcaps[scored[i].ticker] ?? 0,
    });
  }
  const expectedWeights = applyMomentumWeights(topInputs);
  let expectedMissing = 0;
  for (let i = 0; i < topInputs.length; i++) {
    if (topInputs[i].mcap <= 0) expectedMissing++;
  }

  const entries: RankEntry[] = scored.map((r, i) => {
    const key = normaliseTicker(r.ticker);
    const currentWeight = spmo.weights.get(key) ?? null;
    const expectedWeight =
      i < expectedWeights.length ? Number((expectedWeights[i] * 100).toFixed(4)) : null;
    const marketCap = mcaps[r.ticker] ?? null;
    return {
      rank: i + 1,
      ticker: r.ticker,
      name: r.name,
      sector: r.sector,
      mv: Number(r.mv.toFixed(6)),
      sigmaDaily: Number(r.sigmaDaily.toFixed(6)),
      rawScore: Number(r.raw.toFixed(6)),
      z: Number(r.z.toFixed(4)),
      scoreMul: Number(r.scoreMul.toFixed(4)),
      inSpmo: spmoTickers.has(key),
      currentWeight,
      expectedWeight,
      marketCap,
    };
  });

  const top = entries.slice(0, TOP_N);
  const predictedAdds = top.filter((e) => !e.inSpmo).map((e) => e.ticker);
  const predictedDrops = entries
    .filter((e) => e.inSpmo && e.rank > TOP_N)
    .map((e) => e.ticker);

  const latestSpmoDate =
    (spmo.partialDate && spmo.fullDate
      ? spmo.partialDate > spmo.fullDate
        ? spmo.partialDate
        : spmo.fullDate
      : spmo.partialDate ?? spmo.fullDate) ?? "";

  const ranking: MonthlyRanking = {
    asOfDate: asOf,
    computedAt: new Date().toISOString(),
    universeSize: entries.length,
    topN: TOP_N,
    entries,
    predictedAdds,
    predictedDrops,
    spmoSnapshotDate: latestSpmoDate,
    spmoFullDate: spmo.fullDate,
    spmoPartialDate: spmo.partialDate,
  };

  const fileName = `${asOf}.json`;
  await writeJson(join(RANKINGS_DIR, fileName), ranking);

  const index = existsSync(RANKINGS_INDEX_PATH)
    ? await readJson<RankingIndex>(RANKINGS_INDEX_PATH)
    : { rankings: [] };
  const filtered = index.rankings.filter((r) => r.date !== asOf);
  filtered.push({ date: asOf, file: `rankings/${fileName}` });
  filtered.sort((a, b) => a.date.localeCompare(b.date));
  await writeJson(RANKINGS_INDEX_PATH, { rankings: filtered });

  console.log(
    `Wrote rankings/${fileName}: universe=${entries.length}, top${TOP_N}, ` +
      `missing=${missing}, badData=${badData}, mcapMissing=${expectedMissing}, ` +
      `predictedAdds=${predictedAdds.length}, predictedDrops=${predictedDrops.length}, ` +
      `spmoFull=${spmo.fullDate ?? "none"}, spmoPartial=${spmo.partialDate ?? "none"}`,
  );
  if (top.length) {
    const t5 = top.slice(0, 5).map((e) => `${e.ticker} z=${e.z.toFixed(2)}`).join(", ");
    console.log(`Top 5: ${t5}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
