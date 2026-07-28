# Asset Supervision OS — Metric Definitions

> All data is **synthetic**. This document specifies every calculation **as
> implemented** in `src/engines/`. A reader must be able to reproduce every
> number by hand. Engines keep full precision; rounding shown here is the
> display convention unless a formula explicitly rounds (`Math.round`).

Source of truth:
- OEE — [`src/engines/oee.ts`](../src/engines/oee.ts)
- Risk — [`src/engines/risk.ts`](../src/engines/risk.ts)
- Return on Token Spend (ROTS) — [`src/engines/rots.ts`](../src/engines/rots.ts)
- K-201 wiring / constants — [`src/data/k201-analysis.ts`](../src/data/k201-analysis.ts), [`src/data/constants.ts`](../src/data/constants.ts)

All engine outputs are provenance **`deterministic`**, except the linear-trend
projection (`projectedDaysToCritical` and its derived `trendFactor`), which is
provenance **`statistical`**.

---

## 1. OEE (Overall Equipment Effectiveness)

`computeOee(inputs) → OeeResult`

### 1.1 Inputs (`OeeInputs`)

| Input | Unit | Provenance |
|---|---|---|
| `plannedProductionMinutes` | minutes | measured |
| `downtimeMinutes` | minutes | measured |
| `idealRateUnitsPerHour` | units/hour | business input |
| `totalUnitsProduced` | units | measured |
| `goodUnits` | units | measured |

Guard: if `plannedProductionMinutes <= 0`, an all-zero `OeeResult` is returned.

### 1.2 Components

```
RunTime (min)         = max(0, PlannedProductionMinutes − DowntimeMinutes)
Availability          = clamp01(RunTime / PlannedProductionMinutes)

TheoreticalMax (units)= IdealRateUnitsPerHour × RunTime[min] / 60
rawPerformance        = TheoreticalMax > 0 ? TotalUnitsProduced / TheoreticalMax : 0
Performance           = clamp01(rawPerformance)      // capped ≤ 1; rawPerformance preserved

Quality               = TotalUnitsProduced > 0 ? clamp01(GoodUnits / TotalUnitsProduced) : 0

OEE                   = Availability × Performance × Quality
```

- `clamp01(n)` = `min(1, max(0, n))`, and `NaN → 0`.
- **`rawPerformance` is preserved uncapped** for data-quality checks (a value
  > 1 signals a bad ideal rate or mis-recorded output); `Performance` used in
  OEE is the clamped value.

### 1.3 Loss tree (in production units, against the plant ideal)

```
availabilityLossUnits = max(0, IdealRateUnitsPerHour × DowntimeMinutes / 60)
performanceLossUnits  = max(0, TheoreticalMax − TotalUnitsProduced)
qualityLossUnits      = max(0, TotalUnitsProduced − GoodUnits)
totalLossUnits        = availabilityLossUnits + performanceLossUnits + qualityLossUnits
```

Note the loss tree is **not** a strict decomposition of a single baseline: the
availability loss is measured against the *planned* window's ideal, while
performance loss is measured against the *run-time* theoretical max. Each answers
"how many units did this bucket cost?" and is designed to drive the loss-
intelligence view.

### 1.4 Aggregation (`aggregateOee(runs)`)

**Time-weighted roll-up, NOT an average of OEEs.** Minutes and units are summed
first, then ratios are computed on the totals:

```
sum plannedProductionMinutes, downtimeMinutes, totalUnitsProduced, goodUnits
idealRateUnitsPerHour = max across runs   // shared plant ideal
then computeOee(summed)
```

Empty input → all-zero result.

### 1.5 Financial exposure (`financialExposure`)

```
financialExposure = max(0, lossUnits) × max(0, contributionMarginPerUnit)
```

Deterministic. Contribution margin is a **business input**, not a prediction
(K-201 demo uses `CONTRIBUTION_MARGIN_PER_BBL = 12` USD/bbl).

### 1.6 Worked example (canonical)

Inputs: `plannedProductionMinutes = 600`, `downtimeMinutes = 60`,
`idealRateUnitsPerHour = 100`, `totalUnitsProduced = 810`, `goodUnits = 729`.

| Step | Calculation | Result |
|---|---|---|
| RunTime | 600 − 60 | **540 min (9 h)** |
| Availability | 540 / 600 | **0.90** |
| TheoreticalMax | 100 × 540 / 60 | **900 units** |
| Performance | 810 / 900 | **0.90** |
| Quality | 729 / 810 | **0.90** |
| **OEE** | 0.9 × 0.9 × 0.9 | **0.729** |

Loss tree:

| Bucket | Calculation | Units |
|---|---|---|
| Availability loss | 100 × 60 / 60 | **100** |
| Performance loss | 900 − 810 | **90** |
| Quality loss | 810 − 729 | **81** |
| Total loss | 100 + 90 + 81 | **271** |

Financial exposure @ $12/unit: `271 × 12 = $3,252`.

---

## 2. Asset Risk

`computeRisk(inputs) → RiskResult`. Pipeline: *per-channel assessment → health
score → probability × consequence → risk score → recommended disposition*.
Constants: `HORIZON_DAYS = 60`; criticality weights `A=1.0, B=0.8, C=0.6,
D=0.4, E=0.2`; default `referenceExposureUsd = 1,000,000`; default
`repairLeadTimeDays = 21`.

### 2.1 Per-channel severity (0–1)

For each channel (given `warningThreshold`, `criticalThreshold`,
`alarmDirection`, and an oldest-first `series`), the latest value is compared to
thresholds:

```
breachedCritical = alarmDir "above" ? latest ≥ critical : latest ≤ critical
breachedWarning  = alarmDir "above" ? latest ≥ warning  : latest ≤ warning

nominal = alarmDir "above" ? warning × 0.5 : warning × 1.5   // baseline

if breachedCritical:  severity = 1
elif breachedWarning: severity = 0.4 + 0.6 × clamp01(|(latest − warning)/(critical − warning)|)
else:                 severity = 0.4 × clamp01((latest − nominal)/(warning − nominal))
```

So **0 = nominal baseline, ≈0.4 at the warning threshold, 1 at critical.**
Provenance: `measured` inputs → `business_rule` evaluation.

### 2.2 Trend projection (statistical)

`linearSlope(points)` is an ordinary least-squares (OLS) fit over `(day, value)`:

```
slope = (n·Σxy − Σx·Σy) / (n·Σxx − (Σx)²)      // n < 2 or zero denom → slope 0
```

Projection to the critical threshold, only if the channel is *worsening* in the
alarm direction and not already critical:

```
worsening = alarmDir "above" ? slope > 1e-9 : slope < −1e-9
if worsening and not breachedCritical:
    projectedDaysToCritical = (critical − latest) / slope     // only if > 0 and finite
elif breachedCritical:
    projectedDaysToCritical = 0
else: null
```

At the asset level, `projectedDaysToCritical = min(...)` across channels that
have a projection (else `null`). Provenance: `statistical`.

### 2.3 Overall severity, health, probability, consequence, risk

```
overallSeverity = max(channel.severity)

trendFactor     = projectedDaysToCritical !== null
                  ? clamp01(1 − projectedDaysToCritical / 60)
                  : 0

healthScore     = round( 100 × clamp01(1 − (0.55 × overallSeverity + 0.15 × trendFactor)) )

probabilityOfFailure = clamp01( 0.8 × overallSeverity + 0.2 × trendFactor )

criticalityWeight    = { A:1.0, B:0.8, C:0.6, D:0.4, E:0.2 }[criticality]
normalizedFinancial  = clamp01( financialExposureUsd / referenceExposureUsd )
consequence          = clamp01( 0.6 × criticalityWeight + 0.4 × normalizedFinancial )

riskScore   = round( 100 × probabilityOfFailure × consequence )     // 0–100
```

**Severity bands** (`EventSeverity` from `riskScore`):

| riskScore | band |
|---|---|
| ≥ 70 | `critical` |
| ≥ 45 | `high` |
| ≥ 25 | `medium` |
| ≥ 10 | `low` |
| else | `info` |

**Confidence** (0–1, capped below certainty) reflects data density and breach
clarity:

```
dataDensity   = clamp01( totalPoints / (channels × 60) )
breachClarity = anyCriticalBreach ? 1 : anyWarningBreach ? 0.7 : 0.4
confidence    = clamp01( 0.5 + 0.3 × dataDensity + 0.15 × breachClarity − 0.15 )
```

### 2.4 Recommended disposition (business rules, in order)

Evaluated top-down; first match wins (`repairLeadTimeDays` default 21):

1. `hasCriticalBreach && riskScore ≥ 45` → **`immediate`**
2. If `projectedDaysToCritical !== null`:
   - `projectedDaysToCritical ≤ repairLeadTimeDays` → **`immediate`** (can't even procure/execute in time)
   - `daysToNextTurnaround !== null && daysToNextTurnaround < projectedDaysToCritical` → **`next_turnaround`**
   - `projectedDaysToCritical ≤ 60` → **`planned_maintenance`**
3. `riskScore ≥ 25` → **`planned_maintenance`**
4. else → **`monitor`**

### 2.5 Worked example

One vibration channel, `alarmDirection = "above"`, `warning = 7.1`,
`critical = 11.2`, latest `= 8.6`, OLS `slope = 0.05` mm/s per day; asset
`criticality = "A"`; `financialExposureUsd = 750,000`;
`referenceExposureUsd = 1,500,000`; `repairLeadTimeDays = 21`;
`daysToNextTurnaround = 88`.

| Step | Calculation | Result |
|---|---|---|
| Severity (warning band) | 0.4 + 0.6 × clamp01((8.6−7.1)/(11.2−7.1)) = 0.4 + 0.6 × 0.3659 | **0.6195** |
| projectedDaysToCritical | (11.2 − 8.6) / 0.05 | **52 days** |
| trendFactor | clamp01(1 − 52/60) | **0.1333** |
| healthScore | round(100 × (1 − (0.55×0.6195 + 0.15×0.1333))) = round(63.9) | **64** |
| probabilityOfFailure | 0.8×0.6195 + 0.2×0.1333 | **0.5223** |
| normalizedFinancial | 750,000 / 1,500,000 | **0.50** |
| consequence | 0.6×1.0 + 0.4×0.50 | **0.80** |
| **riskScore** | round(100 × 0.5223 × 0.80) = round(41.8) | **42** |
| Severity band | 42 ≥ 25 | **medium** |
| Disposition | no critical breach; 52 > 21; 88 < 52 false; 52 ≤ 60 | **planned_maintenance** |

---

## 3. Return on Token Spend (ROTS)

`computeRots(inputs) → RotsMetrics`. Governs the economics of the AI. **All
ratios return `null` on a zero denominator (never divide-by-zero).** The central
rule is enforced structurally: **projected value and realised value come from
different fields and are never merged.**

### 3.1 Model cost (`estimateModelCost`)

```
cost = inputTokens/1e6 × inputPerMillion + outputTokens/1e6 × outputPerMillion
     (rounded to 6 decimals / micro-dollar precision)
```

`MODEL_RATES` (USD; synthetic, representative):

| Model | input / 1e6 | output / 1e6 |
|---|---|---|
| `mock/deterministic-explainer` | 0 | 0 |
| `meta/llama-3.1-70b-instruct` | 0.35 | 0.40 |
| `meta/llama-3.1-8b-instruct` | 0.06 | 0.06 |
| *(unknown model → default)* | 0.50 | 0.50 |

The **mock provider is intentionally zero-cost** — the offline demo consumes no
paid tokens.

### 3.2 Totals & funnel

```
totalInputTokens / totalOutputTokens = Σ over interactions
totalTokens      = totalInputTokens + totalOutputTokens
totalCostUsd     = Σ estimatedCostUsd (rounded 6 dp)
averageLatencyMs = round(Σ latencyMs / interactions)   // 0 if none

decidedCount     = # human decisions
acceptedCount    = # decisions where decision ∈ {approved, modified}
rejectedCount    = # decisions where decision = rejected
actionedCount    = # operational outcomes recorded
resolvedEventCount = # outcomes where resolved = true
recommendationsWithAi = distinct recommendationIds referenced by interactions
```

### 3.3 Efficiency & conversion (null-safe)

```
acceptanceRate                   = accepted / decided
costPerAcceptedRecommendation    = totalCost / accepted
costPerResolvedEvent             = totalCost / resolved
recommendationToActionConversion = actioned / accepted
```

### 3.4 Value (projected vs realised — strictly separate)

```
projectedValueUsd = Σ outcome.estimatedValue                     // all outcomes
realisedValueUsd  = Σ outcome.realisedValue
                    WHERE outcome.valueStatus === "realised" AND realisedValue !== null
validatedValueUsd = Σ outcome.estimatedValue WHERE valueStatus === "validated"

projectedValuePer1kTokens = totalTokens > 0 ? projectedValue/totalTokens × 1000 : null
realisedValuePer1kTokens  = totalTokens > 0 ? realisedValue /totalTokens × 1000 : null
```

> **Realised value counts ONLY outcomes with `valueStatus === "realised"` and a
> non-null `realisedValue`.** Projected value is a separate field and is **never
> shown as realised.** This is the platform's "economic honesty" guarantee.

### 3.5 ROI

```
estimatedRoi = (projectedValue − totalCost) / totalCost      // null if cost = 0
realisedRoi  = (realisedValue  − totalCost) / totalCost      // null if cost = 0
```

### 3.6 Per-provider roll-up (`usageByProvider`)

Groups interactions by `provider` → `{ interactions, totalTokens, costUsd }`
(cost accumulated at 6-dp precision). Feeds the token-economics view.

### 3.7 Worked example

Two interactions on `meta/llama-3.1-70b-instruct`: totals `inputTokens = 2400`,
`outputTokens = 600` → `totalTokens = 3000`.

Cost: `2400/1e6 × 0.35 + 600/1e6 × 0.40 = 0.00084 + 0.00024 = $0.00108`.

Decisions: 3 decided → 2 approved + 1 rejected (0 modified) → `accepted = 2`.
Outcomes: 2 actioned, 1 resolved; both carry `estimatedValue = 125,000` →
`projectedValue = 250,000`; one is `valueStatus = "realised"` with
`realisedValue = 90,000`.

| Metric | Calculation | Result |
|---|---|---|
| acceptanceRate | 2 / 3 | **0.667** |
| costPerAcceptedRecommendation | 0.00108 / 2 | **$0.00054** |
| costPerResolvedEvent | 0.00108 / 1 | **$0.00108** |
| recommendationToActionConversion | 2 / 2 | **1.0** |
| projectedValuePer1kTokens | 250,000 / 3000 × 1000 | **$83,333.33** |
| realisedValuePer1kTokens | 90,000 / 3000 × 1000 | **$30,000.00** |
| estimatedRoi | (250,000 − 0.00108)/0.00108 | **≈ 231,481,480** |
| realisedRoi | (90,000 − 0.00108)/0.00108 | **≈ 83,333,332** |

(The enormous ROI reflects near-zero token cost; the point of ROTS is that
cost-per-accepted and **realised** value are tracked honestly, not that ROI is
impressive.) Had there been 0 decisions, `acceptanceRate` would be `null`, not
`Infinity` or `NaN`.

---

## 4. Provenance summary

| Value | Provenance |
|---|---|
| Sensor readings, run/downtime/quality inputs | `measured` |
| OEE components & loss tree, financial exposure, ROTS metrics, model cost | `deterministic` |
| Channel severity / threshold breach evaluation, recommended disposition | `business_rule` |
| `projectedDaysToCritical`, `trendFactor` (OLS trend) | `statistical` |
| AI explanation text (`aiRationale`) | `ai_generated` |
| Approve / reject / modify decisions | `human` |
```

---

## ROTS accounting correction (Phase 1.5)

The Return-on-Token-Spend model separates **actual** activity from **estimated**
scenarios, and **projected** value from **realised** value. See
`src/engines/rots.ts` (`RotsMetrics`) and `docs/SCOPE_CONSISTENCY.md`.

- **Actual activity** — only `AiInteraction`s with `accounting === "actual"`
  contribute to `actualTokens` / `actualCostUsd`. In the offline demo the only
  actual provider is the **mock** (cost **$0.00**). No NVIDIA/DGX activity is
  recorded as actual.
- **Estimated scenarios** — `estimatedScenarios[]` price the *actual* token
  volume against NVIDIA / DGX Spark rate cards for comparison only, labelled
  "Estimated scenario". They are never summed into actual totals.
- **Value taxonomy** — `valueAtStakeUsd` (exposure under decision, not
  AI-created), `projectedValueEnabledUsd` (value an action would protect if
  executed), `realisedValueUsd` (validated outcomes only). `realisedAvailable`
  is `false` until a validated outcome exists, so realised value and realised
  ROTS read **"Not yet available"** in the reset state.
- **Ratios** — `projectedValuePer1kTokens` and (when available)
  `realisedValuePer1kTokens` per 1,000 actual tokens. Because actual external
  cost is `$0.00`, cost-based ROI multiples are not meaningful and are
  intentionally **not** featured; the primary narrative is
  *"$X estimated inference cost supporting a decision with $Y at stake."*

**Primary narrative rule:** *Value at stake is not value created by AI. Realised
value is recorded only after an approved action and a validated operational
outcome.*
