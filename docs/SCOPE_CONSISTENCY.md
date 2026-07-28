# Financial scope consistency

Several dollar figures appear across Asset Supervision OS. They are **deliberately
different** because they measure different things over different scopes and
timeframes. This document defines each so two differently-scoped values are never
treated as interchangeable. Every figure below is **synthetic** and reproducible
from `SEED = 20260727`.

## The values

| Value | Amount (reset state) | Scope | Timeframe | Definition | Provenance | Status |
| --- | --- | --- | --- | --- | --- | --- |
| **Open-decision value at stake** (Command Center: "Open-decision value at stake"; AI Economics: "Value at stake") | **$2,304,156** | Plant-wide — all unresolved recommendations | Current snapshot | Σ `valueAtStakeUsd` over recommendations with status `open` or `actioned` | Deterministic (per-asset exposure calcs) | At-risk / projected — **not** realised |
| **K-201 continued-operation exposure** (Asset 360: "Value at stake (K-201)") | **$1,620,156** | Single asset **K-201** | 30-day trailing + forward failure scenario | Recent attributable loss **$525,756** + projected 4-day unplanned-failure exposure **$1,094,400** | Deterministic OEE loss tree + failure scenario | Projected / at-risk |
| **Projected AI-enabled value** (AI Economics: "Projected value enabled") | **$1,449,400** | Portfolio of unresolved AI-supported decisions | Forward — *if approved and executed* | Σ `projectedValueEnabledUsd` over unresolved recommendations | Deterministic estimate | **Projected** — never shown as realised |
| **Scoped turnaround cost** (Turnaround: "Scoped cost") | **$1,170,000** | Unit 200 turnaround (3 work packages) | Turnaround window (+88 days) | Σ work-package `estimatedCost` | Engineering estimate | Budgeted **cost** (against an $18,000,000 budget) |
| **Realised value** (everywhere) | **$0 — Not yet available** | Validated outcomes only | After approval + validated outcome | Σ `realisedValue` where `valueStatus = "realised"` | Deterministic from recorded outcomes | Realised (none in the reset state) |

> The previously reported **$1.62M** figure is the **K-201 continued-operation
> exposure** specifically — a single-asset number, not a plant-wide one.

## How they relate (and why they differ)

- **Value at stake ($2.30M) ⊇ K-201 exposure ($1.62M).** The plant-wide figure
  sums exposure across *all* unresolved recommendations (K-201 plus E-205, P-210A,
  F-201, K-202, P-214). K-201 alone is the largest single contributor.
- **Projected AI-enabled value ($1.45M) ≤ value at stake ($2.30M).** "Value at
  stake" is the *exposure a decision addresses*; "projected value enabled" is the
  portion a recommended action is projected to *protect* if executed. Value at
  stake is **not** value created by AI.
- **Scoped turnaround cost ($1.17M) is a cost, not an exposure or a value.** It is
  money the turnaround will *spend*, budgeted against $18M — not comparable to the
  risk-exposure figures above.
- **Realised value is $0 / Not yet available.** No outcome has been validated in
  the deterministic reset state, so realised value and realised ROTS are
  intentionally unavailable. Realised value is recorded **only** after an approved
  action and a validated operational outcome.

## UI rules enforced

- Each figure is labelled with its scope in situ (e.g. "Open-decision value at
  stake — plant-wide", "Value at stake (K-201)").
- Actual inference cost, estimated provider cost, value at stake, projected value
  enabled, and realised value are shown as **separate** fields — never merged.
- Projected value is never presented as realised value; realised reads "Not yet
  available" until a validated outcome exists.
