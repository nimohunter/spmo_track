import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SP500List } from "../lib/types.ts";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, "..");
const SP500_PATH = join(ROOT, "data", "sp500.json");
const OUT_PATH = join(ROOT, "data", "marketcaps.json");
const DELAY_MS = 500;
const FRESH_HOURS = 24;
const BATCH_SIZE = 100;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

type MarketCapFile = {
  fetchedAt: string;
  source: string;
  caps: Record<string, number>;
};

type QuoteResponse = {
  quoteResponse?: {
    result?: Array<{ symbol?: string; marketCap?: number }>;
  };
};

// Yahoo uses dashes where the index list uses dots (BRK.B -> BRK-B).
function toYahooSymbol(ticker: string): string {
  return ticker.replace(/\./g, "-");
}

// Yahoo's quote API requires a session cookie plus a matching "crumb" token.
async function getSession(): Promise<{ cookie: string; crumb: string }> {
  const res = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": UA },
    redirect: "manual",
  });
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  if (!cookie) throw new Error("No Yahoo session cookie");
  const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Cookie: cookie },
  });
  const crumb = (await crumbRes.text()).trim();
  if (!crumbRes.ok || !crumb || crumb.includes("<")) {
    throw new Error(`Bad crumb response: ${crumbRes.status} ${crumb.slice(0, 60)}`);
  }
  return { cookie, crumb };
}

async function fetchBatch(
  session: { cookie: string; crumb: string },
  tickers: string[],
): Promise<Record<string, number>> {
  const bySymbol = new Map(tickers.map((t) => [toYahooSymbol(t), t]));
  const symbols = [...bySymbol.keys()].join(",");
  const url =
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}` +
    `&fields=marketCap&crumb=${encodeURIComponent(session.crumb)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Cookie: session.cookie },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as QuoteResponse;
  const out: Record<string, number> = {};
  for (const q of json.quoteResponse?.result ?? []) {
    const ticker = q.symbol ? bySymbol.get(q.symbol) : undefined;
    if (ticker && typeof q.marketCap === "number" && q.marketCap > 0) {
      out[ticker] = q.marketCap;
    }
  }
  return out;
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

  const session = await getSession();
  const caps: Record<string, number> = { ...existing };
  let ok = 0;
  const missing: string[] = [];

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    const got = await fetchBatch(session, batch);
    for (const t of batch) {
      if (got[t] != null) {
        caps[t] = got[t];
        ok++;
      } else {
        missing.push(t);
      }
    }
    process.stdout.write(
      `  [${Math.min(i + BATCH_SIZE, targets.length)}/${targets.length}] batch ok=${Object.keys(got).length}\n`,
    );
    if (i + BATCH_SIZE < targets.length) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  const out: MarketCapFile = {
    fetchedAt: new Date().toISOString(),
    source: "https://query1.finance.yahoo.com/v7/finance/quote",
    caps,
  };
  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");

  console.log(`\nDone. ok=${ok} missing=${missing.length}, total caps stored=${Object.keys(caps).length}`);
  if (missing.length) console.log("Missing: " + missing.slice(0, 15).join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
