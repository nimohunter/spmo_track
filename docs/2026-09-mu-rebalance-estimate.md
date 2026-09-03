# How much MU will SPMO hold after the September 2026 rebalance?

**Our answer: MU gets trimmed from ~10.5% down to the 9% cap.**
A widely-repeated alternative answer — "down to ~4.8–5%" — is based on a
misreading of the index's weight-cap rule. This note explains both readings
and shows which one matches how SPMO actually behaves.

---

## Background: how the weight cap works

SPMO tracks the S&P 500 Momentum Index. At each rebalance (3rd Friday of
March and September), every stock's weight is set to:

```
weight ∝ momentum score × market cap
capped at:  min( 9%,  3 × the stock's market-cap weight )
```

The question that decides everything: **3× the stock's market-cap weight
of *what*?**

| Reading | "Market-cap weight" measured against | MU's cap today |
|---|---|---|
| A — parent index | the whole S&P 500 (MU ≈ 1.5%) | 3 × 1.5% ≈ **4.4–5%** |
| B — momentum basket (ours) | the 100 selected momentum stocks (MU > 3%) | 3 × >3% > 9%, so **9%** binds |

Reading A gives the "~4.8%" answer. Reading B gives 9%. Both are
arithmetically correct — they just start from different rules.

## The tiebreaker: what SPMO actually did in March 2026

We don't have to guess. MU was *added* to SPMO at the March 20, 2026
rebalance, and we can reconstruct the weight it was given: take the
May 8 full holdings file (real share counts) and reprice every position
at March 20 closing prices.

**Result: SPMO set MU at ≈ 6.35% of the fund on rebalance day.**

Now test each reading against that fact:

- MU's market cap on March 20 was ≈ **$489B**, only **0.79%** of the
  S&P 500 (≈ $62T). Under Reading A, MU's cap would have been
  **3 × 0.79% = 2.37%**. A 6.35% position would be a rule violation
  by a factor of 2.7×. **Reading A is impossible.**
- Under Reading B, MU's cap in March was well above 6.35%, so a 6.35%
  position is perfectly legal. **Reading B fits.**

So the cap is measured inside the momentum basket, not against the full
S&P 500 — which is exactly how `lib/momentum.ts` computes it.

## Why MU is above 9% right now (and why that's normal)

Caps only apply **on rebalance day**. Between rebalances, weights simply
drift with prices. MU was set at ~6.35% in March, then the stock roughly
doubled over the summer (market cap $489B → ~$1.08T), dragging its weight
up to **10.46% as of Aug 27** — the same drift that has NVDA sitting at
9.24%. Nothing is "broken"; the fund just hasn't rebalanced yet.

## What happens on September 18

- MU's momentum score is pinned at the winsorization maximum (z = +3),
  so it stays a top constituent.
- Its uncapped weight would far exceed 9%, so the **9% cap binds**.
- SPMO therefore sells MU down from ~10.5%+ to **9%** — a forced sale of
  roughly **1.5–2 percentage points** of the fund, not the ~6 points the
  "4.8%" estimate implies.

## Caveats

- The index uses **float-adjusted** market caps on a **reference date**
  shortly before Sep 18; we use whole-company caps as of today. For MU
  (nearly 100% float) the difference is small.
- MU's price between now and the reference date moves both its score and
  its cap. But flipping the answer from "9%" to "~5%" would require MU's
  share of the momentum basket to drop below 3% — nowhere close.
- The exact official number arrives when S&P publishes the pro-forma
  constituents a few days before the rebalance.

---

*Data: `data/holdings/2026-05-08.json` (share counts),
`data/prices/*.json` (adjusted closes), `data/marketcaps.json` (Yahoo),
`data/rankings/2026-09-03.json` (model output: MU expectedWeight = 9.0).
Written 2026-09-03.*
