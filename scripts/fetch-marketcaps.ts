import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SP500List } from "../lib/types.ts";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, "..");
const SP500_PATH = join(ROOT, "data", "sp500.json");
const OUT_PATH = join(ROOT, "data", "marketcaps.json");
const DELAY_MS = 250;
const FRESH_HOURS = 24;

type MarketCapFile = {
  fetchedAt: string;
  source: string;
  caps: Record<string, number>;
};

const SUFFIX: Record<string, number> = {
  T: 1e12,
  B: 1e9,
  M: 1e6,
  K: 1e3,
};

function parseMcap(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const trimmed = s.trim().replace(/[$,\s]/g, "");
  const m = trimmed.match(/^(-?\d+(?:\.\d+)?)([TBMK])?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  const mult = m[2] ? SUFFIX[m[2].toUpperCase()] ?? 1 : 1;
  return Number.isFinite(n) ? n * mult : null;
}

async function fetchOne(ticker: string): Promise<number | null> {
  // stockanalysis.com uses dotted symbols (BRK.B, BF.B) directly, unlike Yahoo.
  const url = `https://stockanalysis.com/api/symbol/s/${encodeURIComponent(ticker)}/overview`;
  const res = await fetch(url, {
    headers: { "User-Agent": "spmo-track research/0.1 shoda9784@gmail.com" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { data?: { marketCap?: string } };
  return parseMcap(json.data?.marketCap);
}

function parseArgs(argv: string[]): { force: boolean; only?: string[]; limit?: number } {
  const out: { force: boolean; only?: string[]; limit?: number } = { force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") out.force = true;
    else if (a === "--only") out.only = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--limit") out.limit = Number(argv[++i]);
  }
  return out;
}

async function isFresh(path: string): Promise<boolean> {
  if (!existsSync(path)) return false;
  const s = await stat(path);
  return (Date.now() - s.mtimeMs) / 3_600_000 < FRESH_HOURS;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.force && (await isFresh(OUT_PATH))) {
    console.log(`${OUT_PATH} is fresh (< ${FRESH_HOURS}h). Use --force to refetch.`);
    return;
  }
  const list = JSON.parse(await readFile(SP500_PATH, "utf8")) as SP500List;
  let targets = list.constituents.map((c) => c.ticker);
  if (args.only) targets = targets.filter((t) => args.only!.includes(t));
  if (args.limit) targets = targets.slice(0, args.limit);

  const existing: Record<string, number> = existsSync(OUT_PATH)
    ? (JSON.parse(await readFile(OUT_PATH, "utf8")) as MarketCapFile).caps
    : {};

  const caps: Record<string, number> = { ...existing };
  let ok = 0;
  let failed = 0;
  const failures: string[] = [];

  for (let i = 0; i < targets.length; i++) {
    const ticker = targets[i];
    try {
      const mc = await fetchOne(ticker);
      if (mc != null) {
        caps[ticker] = mc;
        ok++;
        if ((i + 1) % 50 === 0 || i === targets.length - 1) {
          process.stdout.write(`  [${i + 1}/${targets.length}] ${ticker} mcap=${(mc / 1e9).toFixed(1)}B\n`);
        }
      } else {
        failed++;
        failures.push(`${ticker}: unparseable`);
      }
    } catch (e) {
      failed++;
      failures.push(`${ticker}: ${(e as Error).message}`);
    }
    if (i < targets.length - 1) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  const out: MarketCapFile = {
    fetchedAt: new Date().toISOString(),
    source: "https://stockanalysis.com/api/symbol/s/{TICKER}/overview",
    caps,
  };
  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");

  console.log(`\nDone. ok=${ok} failed=${failed}, total caps stored=${Object.keys(caps).length}`);
  if (failures.length) {
    console.log("Failures (first 10):");
    for (const f of failures.slice(0, 10)) console.log("  " + f);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
