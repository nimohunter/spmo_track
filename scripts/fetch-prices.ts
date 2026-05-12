import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PriceBar, PriceHistory, SP500List } from "../lib/types.ts";

const execFileAsync = promisify(execFile);
const UA = "Mozilla/5.0";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, "..");
const SP500_PATH = join(ROOT, "data", "sp500.json");
const PRICES_DIR = join(ROOT, "data", "prices");
const RANGE = "2y";
const REQUEST_DELAY_MS = 250;
const FRESH_HOURS = 24;

type YahooResponse = {
  chart: {
    result?: Array<{
      timestamp?: number[];
      indicators: {
        adjclose?: Array<{ adjclose?: (number | null)[] }>;
        quote: Array<{ close?: (number | null)[] }>;
      };
    }>;
    error?: { code: string; description: string } | null;
  };
};

function toYahooSymbol(ticker: string): string {
  return ticker.replace(/\./g, "-");
}

function tickerToFile(ticker: string): string {
  return ticker.replace(/[^A-Za-z0-9]+/g, "_") + ".json";
}

async function isFresh(path: string): Promise<boolean> {
  if (!existsSync(path)) return false;
  const s = await stat(path);
  const ageHours = (Date.now() - s.mtimeMs) / 3_600_000;
  return ageHours < FRESH_HOURS;
}

const HOSTS = ["query2.finance.yahoo.com", "query1.finance.yahoo.com"];

// Node's fetch (undici) gets 429'd by Yahoo via TLS fingerprinting.
// Shelling out to curl works around it.
async function curlJson(url: string): Promise<{ status: number; body: string }> {
  const { stdout } = await execFileAsync(
    "curl",
    [
      "-s",
      "-A", UA,
      "-H", "Accept: application/json",
      "--max-time", "20",
      "-w", "\n__HTTP_CODE__:%{http_code}",
      url,
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  const marker = stdout.lastIndexOf("\n__HTTP_CODE__:");
  if (marker < 0) return { status: 0, body: stdout };
  const status = Number(stdout.slice(marker + "\n__HTTP_CODE__:".length).trim());
  return { status, body: stdout.slice(0, marker) };
}

async function fetchOne(ticker: string): Promise<PriceHistory> {
  const sym = toYahooSymbol(ticker);
  let lastErr: Error | null = null;
  for (const host of HOSTS) {
    const url = `https://${host}/v8/finance/chart/${encodeURIComponent(
      sym,
    )}?range=${RANGE}&interval=1d&events=history`;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const { status, body } = await curlJson(url);
        if (status === 429) {
          await new Promise((r) => setTimeout(r, Math.min(20_000, 2000 * 2 ** attempt)));
          continue;
        }
        if (status !== 200) {
          lastErr = new Error(`HTTP ${status}: ${body.slice(0, 120)}`);
          break;
        }
        const json = JSON.parse(body) as YahooResponse;
        return parseYahoo(ticker, url, json);
      } catch (e) {
        lastErr = e as Error;
        break;
      }
    }
  }
  throw lastErr ?? new Error("all hosts failed");
}

function parseYahoo(ticker: string, url: string, json: YahooResponse): PriceHistory {
  if (json.chart.error) {
    throw new Error(`Yahoo error: ${json.chart.error.description}`);
  }
  const r = json.chart.result?.[0];
  if (!r || !r.timestamp) throw new Error("Empty result");
  const adj = r.indicators.adjclose?.[0]?.adjclose;
  const raw = r.indicators.quote[0]?.close;
  const closes = adj ?? raw;
  if (!closes) throw new Error("No close array");
  const bars: PriceBar[] = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const c = closes[i];
    if (c == null || !Number.isFinite(c)) continue;
    const date = new Date(r.timestamp[i] * 1000).toISOString().slice(0, 10);
    bars.push({ date, close: Number(c.toFixed(6)) });
  }
  bars.sort((a, b) => a.date.localeCompare(b.date));
  return {
    ticker,
    source: url,
    fetchedAt: new Date().toISOString(),
    bars,
  };
}

function parseArgs(argv: string[]): {
  limit?: number;
  only?: string[];
  force: boolean;
} {
  const out: { limit?: number; only?: string[]; force: boolean } = { force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") out.limit = Number(argv[++i]);
    else if (a === "--only") out.only = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--force") out.force = true;
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const list = JSON.parse(await readFile(SP500_PATH, "utf8")) as SP500List;
  let targets = list.constituents.map((c) => c.ticker);
  if (args.only) targets = targets.filter((t) => args.only!.includes(t));
  if (args.limit) targets = targets.slice(0, args.limit);

  await mkdir(PRICES_DIR, { recursive: true });
  let ok = 0;
  let skipped = 0;
  const failures: Array<{ ticker: string; error: string }> = [];

  for (let i = 0; i < targets.length; i++) {
    const ticker = targets[i];
    const outPath = join(PRICES_DIR, tickerToFile(ticker));
    if (!args.force && (await isFresh(outPath))) {
      skipped++;
      continue;
    }
    try {
      const hist = await fetchOne(ticker);
      await writeFile(outPath, JSON.stringify(hist, null, 2) + "\n", "utf8");
      ok++;
      process.stdout.write(
        `  [${i + 1}/${targets.length}] ${ticker} → ${hist.bars.length} bars\n`,
      );
    } catch (e) {
      const msg = (e as Error).message;
      failures.push({ ticker, error: msg });
      process.stdout.write(`  [${i + 1}/${targets.length}] ${ticker} FAILED: ${msg}\n`);
    }
    if (i < targets.length - 1) {
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
    }
  }

  console.log(`\nDone. ok=${ok} skipped=${skipped} failed=${failures.length}`);
  if (failures.length) {
    console.log("Failures:");
    for (const f of failures) console.log(`  ${f.ticker}: ${f.error}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
