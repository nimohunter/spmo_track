# SPMO Top 20 Tracker

Track the Invesco S&P 500 Momentum ETF (SPMO) top 20 holdings and how their weights change over time. Snapshots are collected by a scheduled GitHub Action and committed to this repo as JSON, then rendered as a static Next.js site on Vercel.

## How it works

```
GitHub Actions cron ──► fetch from stockanalysis.com ──► commit data/holdings/YYYY-MM-DD.json
                                                                  │
                                                                  ▼
                                                     Vercel rebuilds the static site
```

- Schedule: twice yearly, a few days after SPMO's semi-annual rebalance (March 25 & September 25 UTC). Edit `.github/workflows/fetch-holdings.yml` to run more frequently.
- Data source: `https://stockanalysis.com/api/symbol/e/SPMO/holdings` (returns top ~25 holdings; covers our top 20).
- Storage: JSON files in `data/holdings/` plus an `index.json` manifest. No database.

## Local development

```bash
npm install
npm run fetch       # pull a fresh snapshot from stockanalysis.com
npm run backfill    # one-time: pull historical quarterly snapshots from SEC EDGAR
npm run dev         # http://localhost:3000
npm run build       # static production build
```

### Historical backfill

`scripts/backfill-edgar.ts` pulls SPMO's quarterly N-PORT filings from SEC EDGAR (CIK 1378872, series S000050154) over the past 3 years. Tickers are missing from N-PORT XML, so it resolves them via the free OpenFIGI API (ISIN → ticker). The result: 12 quarter-end snapshots covering 2023-05-31 through the most recent fiscal-quarter filing, plus daily snapshots from `npm run fetch` going forward.

## Deploying to Vercel

1. Push this repo to GitHub.
2. Import the repo in Vercel (new project). Framework preset: **Next.js**.
3. No env vars required.
4. Deploy.

For the GitHub Action's commits to trigger Vercel rebuilds, the default Vercel ↔ GitHub integration handles it — no extra setup. The Action commits with the built-in `GITHUB_TOKEN` (no PAT needed) thanks to `permissions: contents: write` in the workflow.

## Tracking more frequently

Edit the `schedule` block in `.github/workflows/fetch-holdings.yml`:

```yaml
schedule:
  - cron: "0 12 * * *"   # daily at 12:00 UTC
  # - cron: "0 12 * * 1" # Mondays at 12:00 UTC
```

Trigger an immediate run from the **Actions** tab → *Fetch SPMO Holdings* → *Run workflow*.

## Project layout

```
app/                 Next.js App Router pages
  page.tsx           Top 20 chart + holdings table
components/
  WeightChart.tsx    Recharts line chart (client component)
lib/
  data.ts            Snapshot loading + series builder
  types.ts           Shared types
scripts/
  fetch-holdings.ts  Holdings fetcher (run by GH Actions)
data/
  index.json         Manifest of snapshots
  holdings/          One JSON per snapshot date
.github/workflows/
  fetch-holdings.yml Scheduled cron + commit
```

## Notes & limitations

- The public `stockanalysis.com` endpoint is unofficial and could change. If it breaks, options include the SEC EDGAR N-PORT filings (quarterly, lagged) or a paid API like Financial Modeling Prep.
- History begins on the first day this Action runs — there is no historical backfill from this data source.
- The chart pins the current top-20 tickers and plots their weights backward. Names that were once in the top 20 but have since dropped out are not shown.
