# How much MU will SPMO hold after the September 2026 rebalance?

**Our answer: MU gets trimmed from ~10.5% down to the 9% cap.**
A widely-repeated alternative answer — "down to ~4.8–5%" — is based on a
misreading of the index's weight-cap rule. This note explains both readings
and shows which one matches how SPMO actually behaves.

---

## Background: what the public methodology actually says

SPMO tracks the S&P 500 Momentum Index. The official rule (S&P DJI,
*S&P Momentum Indices Methodology*, "Constituent Weightings", verbatim):

> **Weighting Method:** "Product of the securities market capitalization
> in the eligible index universe and the momentum score, subject to any
> applicable security and sector constraints."
>
> **Maximum Security Weight Constraint:** "Lower of 9% and three times
> its market capitalization."

Note the second sentence: a *weight* can't be three times a dollar
amount, so it must mean "3× the stock's market-cap **weight**" — but the
document never says weight **in what**. That one ambiguity decides
everything:

| Reading | "Market-cap weight" measured against | MU's cap today |
|---|---|---|
| A — parent index | the whole S&P 500 (MU ≈ 1.5%) | 3 × 1.5% ≈ **4.4–5%** |
| B — momentum basket (ours) | the 100 selected momentum stocks (MU > 3%) | 3 × >3% > 9%, so **9%** binds |

Reading A gives the "~4.8%" answer. Reading B gives 9%. Both are
arithmetically correct — they just start from different readings of an
ambiguous sentence. The public document alone cannot settle it.

## The tiebreaker: what SPMO actually did in March 2026

Since the text is ambiguous, the fund's real behavior is the evidence.
We can reconstruct the weights SPMO set at the March 20, 2026 rebalance:
take the May 8 full holdings file (real share counts) and reprice every
position at March 20 closing prices.

**Result: SPMO set MU at ≈ 6.35% of the fund on rebalance day** — while
MU's market cap (≈ $489B) was only **0.79%** of the S&P 500 (≈ $62T).
Under Reading A its cap would have been **3 × 0.79% = 2.37%**; the actual
position is 2.7× above that.

And MU is not a one-off. Checking the entire reconstructed March book:
**40 of 99 positions exceed their Reading-A cap**, many by 2–2.7×
(SNDK 1.40% vs a 0.51% cap, STX 1.19% vs 0.45%, LRCX 3.45% vs 1.37%,
even mega-cap JNJ 5.41% vs 2.76%). If Reading A were the rule, S&P would
have violated its own methodology on 40% of the index. **Reading A is
impossible; Reading B fits every position** — and Reading B is exactly
how `lib/momentum.ts` computes it.

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

## Appendix: the check, reproducible

The verification behind "40 of 99 positions violate Reading A". Method:

1. **Reconstruct SPMO's book at the March 20, 2026 close** — take the
   real share counts from the May 8 Invesco full-holdings file and
   reprice every position at its March 20 close. (Creations/redemptions
   between the two dates scale all positions roughly proportionally, so
   relative weights are preserved.)
2. **Estimate each stock's March 20 market cap** — scale today's cap by
   the price ratio `close(Mar 20) / close(today)`.
3. **Compare** each reconstructed weight against its Reading-A cap,
   `3 × (stock's mcap ÷ total S&P 500 mcap)`.

Top violators (of 40 total, threshold = cap + 0.10pp):

| Ticker | Weight set in March | Reading-A cap | Ratio |
|---|---:|---:|---:|
| SNDK | 1.40% | 0.51% | 2.75× |
| MU   | 6.35% | 2.37% | 2.68× |
| STX  | 1.19% | 0.45% | 2.68× |
| NEM  | 1.30% | 0.50% | 2.60× |
| WDC  | 1.33% | 0.51% | 2.60× |
| LRCX | 3.45% | 1.37% | 2.51× |
| CIEN | 0.57% | 0.26% | 2.19× |
| FIX  | 0.48% | 0.23% | 2.05× |
| LHX  | 0.63% | 0.31% | 2.01× |
| JNJ  | 5.41% | 2.76% | 1.96× |

To re-run (from the repo root, requires up-to-date `data/`):

```python
import json

def close_on(t, date):
    try: bars = json.load(open(f'data/prices/{t}.json'))['bars']
    except FileNotFoundError: return None
    prior = [b for b in bars if b['date'] <= date]
    return prior[-1]['close'] if prior else None

REB, TODAY = '2026-03-20', '2026-09-03'
mcaps = json.load(open('data/marketcaps.json'))['caps']
sp = [c['ticker'] for c in json.load(open('data/sp500.json'))['constituents']]

# each stock's market cap on rebalance day, scaled from today by price ratio
mar_mcap = {}
for t in sp:
    now, mar = close_on(t, TODAY), close_on(t, REB)
    if t in mcaps and now and mar:
        mar_mcap[t] = mcaps[t] * mar / now
tot_mar = sum(mar_mcap.values())

# SPMO's book on rebalance day: May 8 share counts x Mar 20 closes
snap = json.load(open('data/holdings/2026-05-08.json'))
vals = {h['ticker']: h['shares'] * close_on(h['ticker'], REB)
        for h in snap['holdings'] if h['shares'] and close_on(h['ticker'], REB)}
tot = sum(vals.values())

viol = []
for t, v in vals.items():
    if t not in mar_mcap: continue
    w = v / tot * 100
    cap_a = 3 * mar_mcap[t] / tot_mar * 100  # Reading A: 3x share of full S&P 500
    if w > cap_a + 0.10:
        viol.append((t, w, cap_a, w / cap_a))
for t, w, c, r in sorted(viol, key=lambda x: -x[3]):
    print(f'{t:6} set={w:5.2f}%  capA={c:5.2f}%  {r:.2f}x over')
print(f'{len(viol)} of {len(vals)} positions exceed the Reading-A cap')
```

Approximations: whole-company caps instead of float-adjusted (small for
these names), and the mcap price-scaling ignores share-count changes
since March (buybacks/dilution, typically <2%). Neither comes anywhere
near explaining a 2–2.7× violation across 40 names.

---

*Data: `data/holdings/2026-05-08.json` (share counts),
`data/prices/*.json` (adjusted closes), `data/marketcaps.json` (Yahoo),
`data/rankings/2026-09-03.json` (model output: MU expectedWeight = 9.0).
Methodology quote: S&P DJI, "S&P Momentum Indices Methodology" (March
2026 edition), Constituent Weightings, p.8 —
https://www.spglobal.com/spdji/en/documents/methodologies/methodology-sp-momentum-indices.pdf
(via web.archive.org; spglobal.com blocks scripted downloads).
Written 2026-09-03.*
