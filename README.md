# SPMO Tracker

Two views on the Invesco S&P 500 Momentum ETF (SPMO):

1. **`/`** — actual holdings over time. Top 20 weight changes between rebalances, full distribution per snapshot, and a delta vs. previous filing.
2. **`/ranking`** — *simulated* S&P 500 Momentum ranking computed from scratch over the entire S&P 500 universe, with predicted constituent adds/drops and per-stock expected weight if SPMO rebalanced today.

Static Next.js site rendered at build time; data lives in this repo as JSON and gets refreshed by GitHub Actions.

## How the ranking is computed

For each stock in the current S&P 500:

1. **Momentum Value (MV)** = `price(M-2) / price(M-14) - 1` — 12-month return lagged by 2 months (the standard short-term-reversal exclusion).
2. **σ daily** = standard deviation of daily returns over the same M-14 → M-2 window.
3. **Raw score** = `MV / σ_daily` — risk-adjusted momentum.
4. **Z** = z-score across the S&P 500 universe, winsorized at ±3.
5. **Score multiplier** = `1 + Z` (if Z > 0) or `1 / (1 - Z)` (if Z < 0) — keeps weights strictly positive.
6. **Expected weight** for the top 100 = `scoreMul × marketCap`, normalized to 100% and iteratively capped at `min(9%, 3 × pure-mcap-weight)` per stock.

The top 100 by score multiplier are the predicted SPMO constituents. Diff against actual SPMO holdings to get "predicted adds" and "predicted drops."

## Rebalance calendar

SPMO follows the S&P 500 Momentum Index, which **rebalances at the close of the 3rd Friday of March and September**. Constituents don't change between rebalances (only weights drift with prices).

NPORT filings happen quarterly (Feb / May / Aug / Nov), but only the **May 31** and **Nov 30** filings show a fresh constituent set — they're the first post-rebalance snapshots. The Feb / Aug filings are mid-cycle and just show weight drift. The chart on `/` filters to the *earliest* snapshot in each rebalance period to keep the visualization aligned with real index changes.

## Data sources

| What | Where | Cadence |
|---|---|---|
| SPMO actual holdings (full ~100, monthly) | Invesco CSV (manual download) | once per month |
| SPMO actual holdings (top 25, daily) | `stockanalysis.com/api` | scheduled GH Action |
| SPMO historical holdings (full ~100, quarterly) | SEC NPORT filings via EDGAR | one-time backfill |
| S&P 500 constituents | Wikipedia | manual / on demand |
| Daily prices (2y adjusted closes) | Yahoo Finance chart API | manual / on demand |
| Market caps | `stockanalysis.com/api` | manual / on demand |

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # static production build
```

### Data pipeline

```bash
# SPMO holdings (only the fetch is on a cron; the others are manual)
npm run fetch                                       # top-25 daily from stockanalysis.com
npm run import:invesco                              # parses any data/holdings/invesco*.csv
npm run backfill                                    # one-time: SEC NPORT history

# Ranking inputs (run when stale; price fetch ~2 min, mcap fetch ~2 min)
npm run fetch:sp500                                 # refresh S&P 500 constituent list
npm run fetch:prices                                # daily closes for all ~500 names
npm run fetch:mcaps                                 # market caps for all ~500 names

# Compute the ranking
npm run compute:rankings                            # writes data/rankings/YYYY-MM-DD.json
npm run compute:rankings -- --as-of 2025-09-21      # backtest a past date
```

### Refreshing the Invesco holdings

Invesco's site is geo-blocked for non-US IPs, so the CSV is fetched manually:

1. Visit the [SPMO product page](https://www.invesco.com/us/en/financial-products/etfs/invesco-sp-500-momentum-etf.html) and download the Daily/Monthly Holdings CSV.
2. Drop the file into `data/holdings/` (any filename matching `invesco*.csv`).
3. Run `npm run import:invesco`. It parses the `# as of YYYY-MM-DD` line and writes `data/holdings/YYYY-MM-DD.json` in the standard `Snapshot` shape, updating `data/index.json`.

## Deploying

This repo auto-deploys to Vercel on every push to `main` via `.github/workflows/deploy.yml`.

**Required GitHub secrets** (Settings → Secrets and variables → Actions):

| Secret | Where to get it |
|---|---|
| `VERCEL_TOKEN` | Create at https://vercel.com/account/tokens |
| `VERCEL_ORG_ID` | `.vercel/project.json` → `orgId` |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` → `projectId` |

The workflow uses the three-step Vercel CLI flow (`vercel pull` → `vercel build` → `vercel deploy --prebuilt --prod`), so the build runs in the GitHub runner and Vercel just receives the prebuilt output.

The `fetch-holdings.yml` cron also commits to `main`, which then triggers `deploy.yml` — so new SPMO snapshots rebuild and redeploy the site automatically.

## Project layout

```
app/
  page.tsx                  Top 20 chart, distribution, latest-holdings table
  ranking/page.tsx          Full S&P 500 momentum ranking + predicted rebalance
components/
  WeightChart.tsx           Recharts line chart with isolate-on-legend-click
  SnapshotDistribution.tsx  Per-date weight bar chart
  RankingTable.tsx          Sortable/filterable 500-row table (client)
lib/
  data.ts                   Snapshot + ranking loaders; rebalance-period filter
  momentum.ts               MV / σ / score / iterative weight-capping algorithm
  equivalents.ts            Combine GOOG+GOOGL, BRK.A+BRK.B
  types.ts                  Shared types
scripts/
  fetch-holdings.ts         SPMO top-25 daily snapshot (stockanalysis.com)
  fetch-sp500-list.ts       Scrape Wikipedia S&P 500 constituents
  fetch-prices.ts           Yahoo chart API → 2y daily closes per ticker
  fetch-marketcaps.ts       stockanalysis.com → market caps
  compute-rankings.ts       Run the full score + weighting pipeline
  import-invesco.ts         Parse Invesco CSV → Snapshot JSON
  backfill-edgar.ts         One-time SEC NPORT backfill
data/
  index.json                Snapshot manifest
  holdings/                 Per-date SPMO holdings JSON
  prices/                   Per-ticker daily price history
  rankings/                 Per-date ranking output
  rankings-index.json       Ranking manifest
  sp500.json                Current S&P 500 constituent list
  marketcaps.json           Per-ticker market caps
.github/workflows/
  fetch-holdings.yml        Scheduled fetch + commit
  deploy.yml                Build + deploy to Vercel on every push to main
```

## Notes & limitations

- **Float-adjusted market cap is approximated by total market cap.** The official S&P methodology weights by float-adjusted mcap; small differences exist for stocks with large insider/restricted holdings. For the purposes of "what would SPMO rank today?" this is close enough.
- **Yahoo Finance** is unofficial and occasionally rate-limits or shifts its response shape. The fetcher shells out to `curl` to work around TLS-fingerprinting blocks against Node's `fetch`.
- **Invesco daily CSV is manual.** Their CDN blocks non-US IPs (geo-block at Fastly edge). If you have a US-IP CI environment or VPN, automation is possible.
- **Mid-rebalance daily Invesco snapshots are treated as post-rebalance constituents** by the chart filter — the earliest snapshot per rebalance period wins. Once the official May 31 / Nov 30 NPORT lands, it'll be excluded because the earlier Invesco daily already covers the same constituent set.
- **Score returns will diverge slightly from S&P's own numbers** because we use Yahoo's adjusted close (split + dividend) without S&P's exact total-return methodology, and we don't model the exact rebalance day's prices.
