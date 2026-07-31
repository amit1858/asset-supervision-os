# V2 Phase 2.1 — Shared Domain Model and Governed Deterministic State Machine
## Slice Specification

*Product & Architecture Planning · Companion to `V2_PHASE_2_PRODUCT_PLAN.md` · Draft v1 for review*

> **Planning artifact only.** This document specifies behaviour; it does not inspect, edit, test, or commit repository code, and it contains no implementation code. Repository-specific decisions (file/module names, framework choices) are deferred to GitHub Copilot Plan mode after it inspects the codebase.

> **Scope guard.** Slice 2.1 applies to `/v2` only. V1 remains protected and unchanged. K-201 is the golden fixture, but the domain model must remain asset-agnostic and industry-neutral — nothing in the model may hard-code compressor-specific or hydrogen-specific semantics.

> **⚠️ Owner reconciliation (2026-07-31) — this spec is superseded on specific fixture numbers by `../V2_PHASE_2_K201_TECHNICAL_PLAN.md`:**
> 1. **Projected value `$1,458,140` is WITHDRAWN**, along with the `interventionEffectiveness = 0.90` factor. The authoritative **projected value enabled** is **`$1,449,400`** (portfolio ROTS aggregate, existing engines) and the **K-201 recommendation's** projected value is **`$1,094,400`** (`analyzeK201().projectedFailureExposureUsd`). No engine or seed is changed to match this spec. See technical plan §8. Every `$1,458,140` below is struck through and marked *(withdrawn)*.
> 2. **Approval ≠ endorsement.** Reliability Manager **approves** (`approve_reliability_decision`); Plant Manager **endorses** via a **new** capability **`endorse_high_exposure_reliability_decision`** when the exposure-threshold policy is crossed. The two are never the same capability. See technical plan §9.
> 3. **Source mode and freshness are ORTHOGONAL** (owner Decision 4, 2026-07-31, corrected). Do **not** model `fresh|stale|missing|synthetic` as one axis, and do **not** type `sourceMode` as `IntegrationState`. `sourceMode` uses the existing **`SourceMode`** (`local`\|`snowflake`); integration health is a separate optional `integrationState?: IntegrationState`; `freshness` is value-temporal only — `fresh|stale|missing|unknown` — and **never** includes `synthetic`. A synthetic observation may be fresh or stale; synthetic (when a consumer needs it) is expressed via `integrationState`, never via `freshness`/`sourceMode`. Windows are source-specific: sensor 15 min; production/OEE, CMMS, inventory, turnaround, financial 24 h. This supersedes the "24h" and any `synthetic`-as-freshness proposal below. See technical plan §10.2.
> 4. The exposure threshold is a **named, versioned domain policy** — **`exposure-threshold.v1 = USD 1,000,000`**, `≥` semantics (boundary at exactly `$1,000,000` requires endorsement). K-201's `$1,620,156` **crosses** it and requires endorsement. Not a UI conditional. See technical plan §9.
> 5. **Canonical clock.** The only demonstration `asOf` is the repository's existing **`ANCHOR_NOW = "2026-07-27T00:00:00.000Z"`** (`src/data/constants.ts`, surfaced as `generatedAt`). `resolveFreshness()` takes `asOf` explicitly and never calls `Date.now()`. **Fixture note:** the `T0 = 2026-03-02` narrative dates below are illustrative and **superseded** — `K201.golden.v1` must derive timestamps from the real seeded readings anchored at `ANCHOR_NOW` (Slice 2.1e). See technical plan §10.1 and RQ-1.

---

## 0. Purpose, scope and non-goals

**Purpose.** Slice 2.1 establishes the shared operational object model and the governed, deterministic K-201 state machine that every later slice reads from. It is the foundation: get the object graph, the calculation record, the recompute rules, and the audit event exactly right, and the reliability, maintenance, materials, turnaround, OEE/value, and assistant slices become views and actions over a trustworthy core.

**In scope.**
- The canonical operational object model and its relationships.
- The K-201 golden-path state machine with entry criteria, permitted events, required evidence, required capability/persona, deterministic calculations, immutable values, resulting state, audit record, and failure/unavailable states.
- Governed recomputation rules per metric.
- Calculation record, versioning and reproducibility.
- The authority model for the golden path (capability guards used by transitions).
- A deterministic fixture and the expected outputs after each governed event.
- Negative and boundary scenarios.
- Acceptance criteria and deterministic test fixtures in Given/When/Then form.

**Non-goals (later slices).** Workspace UI, brief rendering, the responsive thread, accessibility polish, provider cost-accounting UI, and expediting UI are out of scope here. Slice 2.1 provides the domain, state engine, calculation record, capability-guard evaluation, and audit event that those slices consume.

---

## 1. Shared operational object model and relationships

All objects share a common envelope: a stable `id`, a monotonic `version`, a `status`, a `trustClassification` wherever the object holds a derived value, a `provenance` reference, a `freshness` timestamp, and `createdByEvent` / `supersededByEvent` links. Objects are asset-agnostic; K-201 is one `Asset` instance.

**Trust classification enum:** `measured_fact` · `deterministic_calculation` · `prediction` · `ai_explanation` · `human_decision`.

| Object | Purpose | Key fields | Key relationships |
|---|---|---|---|
| **Asset** | The physical unit under supervision, industry-neutral. | `id`, `tag` (K-201), `class` (rotating/static/…), `criticality`, `site`, `operatingState` | 1‑to‑many → Measurement, Assessment, WorkOrder, TurnaroundScopeItem |
| **Measurement / condition signal** | A single measured observation of a monitored parameter. | `id`, `assetId`, `parameter` (vibration, bearingTemp…), `value`, `unit`, `readingTime`, `source`, `trustClassification=measured_fact` | many → Asset; referenced by Assessment as evidence |
| **Assessment** | Health and condition state derived from measurements at a point in time. | `id`, `assetId`, `health`, `deterministicRisk`, `calculationId`, `calculationVersion`, `trustClassification=deterministic_calculation`, `basisMeasurementIds[]` | derives from Measurement; produces Risk projection; cited by Recommendation |
| **Risk projection** | Forward-looking projection (time-to-critical) from the assessment. | `id`, `assessmentId`, `timeToCriticalDays`, `criticalDate`, `trustClassification=prediction`, `calculationId`, `calculationVersion` | belongs to Assessment; cited by Recommendation |
| **Recommendation** | A proposed course of action linked to evidence. | `id`, `assessmentId`, `actions[]` (reduceSpeed, inspect48h, retainOverhaul), `rationale`, `preparedBy`, `trustClassification=ai_explanation`\|`human_decision` per field | cites Assessment + Risk projection; input to Decision |
| **Decision** | The governed human record of what was decided. | `id`, `recommendationId`, `status` (proposed/approved/endorsed/recorded/rejected), `decidedBy`, `authorityContext`, `decidedAt`, `evidenceRefs[]`, `trustClassification=human_decision` | consumes Recommendation; requires Approval + Endorsement; unlocks WorkOrder |
| **Approval and endorsement** | Discrete authority acts on a Decision. | `id`, `decisionId`, `type` (approval\|endorsement), `actorPersona`, `capabilityEvaluated`, `result` (granted/rejected), `reason`, `at` | many → Decision; each writes an Audit event |
| **Work order and job plan** | An executable unit of maintenance work with a readiness state. | `id`, `assetId`, `sourceDecisionId`, `type` (corrective/preventive), `jobPlan[]`, `readiness` (ready/blocked/scheduled), `blockingReason`, `dueBy` | from Decision; depends on Material requirement; may map to TurnaroundScopeItem |
| **Material requirement, inventory position, reservation** | The parts a job needs, what is on hand, and what is committed. | requirement: `id`, `workOrderId`, `partNo`, `qty`; inventory: `partNo`, `onHandQty`, `leadTimeDays`, `source`; reservation: `id`, `requirementId`, `qty`, `status` | requirement → WorkOrder; inventory ← Material events; reservation ties the two |
| **Turnaround scope item** | Work retained for a turnaround event window. | `id`, `assetId`, `sourceDecisionId`, `workOrderId`, `eventDate`, `leadTimeFit` (fits/at_risk), `scopeCost` | from Decision/WorkOrder; tested against Material lead time |
| **Execution event** | A record that work (or an operating change) was performed. | `id`, `subjectId` (workOrder\|asset), `action`, `performedByPersona`, `performedAt`, `result` (done/pending) | drives operatingState and Outcome |
| **Operational outcome** | The result of executed work, pending until confirmed. | `id`, `executionEventId`, `status` (pending/confirmed), `confirmedBy`, `evidenceRefs[]` | from Execution event; gates realised value |
| **Value-at-stake / projected / realised value** | Three distinct value figures, never merged. | `valueAtStake`, `projectedValue`, `realisedValue` (each: `amount`\|`unavailable`, `trustClassification`, `calculationId`, `calculationVersion`) | value at stake ← Assessment/loss model; projected ← Decision; realised ← confirmed Outcome |
| **Calculation record** | The reproducibility ledger for every derived value. | `id`, `calculationId`, `version`, `inputsSnapshot`, `previousResult`, `newResult`, `triggeringEventId`, `at`, `provenanceClassification`, `evidenceRefs[]`, `actor`, `authorityContext` | referenced by every derived object; immutable |
| **Evidence reference** | A typed pointer to the source backing a value or decision. | `id`, `kind` (measurement/document/calculation/observation), `targetId`, `capturedAt`, `freshness` | attached to Assessment, Decision, Outcome, Calculation record |
| **Audit event** | The append-only trace of every governed action. | `id`, `type`, `objectId`, `actorPersona`, `capabilityEvaluated`, `beforeStatus`, `afterStatus`, `result` (committed/rejected/attempted), `at` | append-only; sole source for brief "what changed" |

**Relationship spine (golden traversal):** `Asset → Measurement → Assessment → Risk projection → Recommendation → Decision → (Approval + Endorsement) → Work order → Material requirement/inventory/reservation → Turnaround scope item → Execution event → Operational outcome → Value records`. Every derived node also references a **Calculation record** and one or more **Evidence references**, and every state change emits an **Audit event**.

---

## 2. K-201 golden-path state machine

Nine canonical states. Each transition fires on one explicit governed event, is guarded by a capability, requires named evidence, triggers only the declared deterministic calculations, and leaves listed values unchanged. Every successful transition writes an Audit event; every guard/evidence failure writes an `attempted` Audit event and holds state.

### S1 — `SIGNAL_DETECTED` — "Signal detected"
- **Entry criteria:** a new Measurement for the asset is ingested.
- **Permitted events:** `SignalIngested`; `AssessmentRequested`.
- **Required evidence:** at least one Measurement with `readingTime` within the freshness window.
- **Required capability / accountable persona:** none to observe; `assessment.author` (Reliability Engineer) to advance.
- **Deterministic calculations triggered:** none (signal freshness only).
- **Values that must not change:** any prior Assessment, Decision, or Value record.
- **Resulting state:** `RISK_ASSESSED` on `AssessmentComputed`.
- **Audit record:** `SIGNAL_INGESTED` (measured fact, no authority).
- **Unavailable / failure state:** no fresh Measurement → `EVIDENCE_UNAVAILABLE`; health/risk render `unavailable`, never zero.

### S2 — `RISK_ASSESSED` — "Risk assessed"
- **Entry criteria:** a valid Measurement basis exists.
- **Permitted events:** `AssessmentComputed`; `RecommendationRequested`; `NewMeasurementIngested` (recompute).
- **Required evidence:** `basisMeasurementIds[]` present and fresh.
- **Required capability / accountable persona:** Reliability Engineer (author) — prepares only.
- **Deterministic calculations triggered:** `health`, `deterministicRisk` (Assessment); `timeToCriticalDays`, `criticalDate` (Risk projection); `valueAtStake` (loss model). Calculation version set.
- **Values that must not change:** the source Measurements (immutable once recorded).
- **Resulting state:** `DECISION_PROPOSED` on `RecommendationGenerated`.
- **Audit record:** `ASSESSMENT_COMPUTED` with calculation record id.
- **Unavailable / failure state:** stale/partial evidence → assessment marked `low_confidence`/`unavailable`; no fabricated score.

### S3 — `DECISION_PROPOSED` — "Decision proposed"
- **Entry criteria:** an Assessment + Risk projection exist.
- **Permitted events:** `RecommendationGenerated`; `DecisionApprovalRequested`.
- **Required evidence:** Recommendation cites `assessmentId` and Risk projection.
- **Required capability / accountable persona:** Reliability Engineer or assistant — **prepare only**.
- **Deterministic calculations triggered:** none (linking only).
- **Values that must not change:** health, risk, time-to-critical, value at stake.
- **Resulting state:** `DECISION_RECORDED` after both `DecisionApproved` and `DecisionEndorsed`.
- **Audit record:** `RECOMMENDATION_GENERATED` (ai_explanation/human proposal).
- **Unavailable / failure state:** assistant attempts to approve/commit → blocked, `attempted` audit, state held.

### S4 — `DECISION_RECORDED` — "Human decision recorded"
- **Entry criteria:** Decision `approved` by Reliability Manager **and** `endorsed` by Plant Manager (endorsement required because `valueAtStake` crosses the governed exposure threshold).
- **Permitted events:** `DecisionApproved`; `DecisionEndorsed`; `WorkPlanningRequested`.
- **Required evidence:** approval + endorsement acts, each with capability evaluated; decision `evidenceRefs[]` populated.
- **Required capability / accountable persona:** `decision.approve` (Reliability Manager) + `decision.endorse` (Plant Manager).
- **Deterministic calculations triggered:** `decision.status → recorded`; `projectedValue` attaches to the Decision (projection, `prediction`). **No sensor-derived recompute.**
- **Values that must not change:** health, `deterministicRisk`, `timeToCriticalDays`, `valueAtStake` — approval changes decision status only, not the sensor-derived risk.
- **Resulting state:** `WORK_PLANNED` on `WorkOrdersCreated`.
- **Audit record:** `DECISION_APPROVED`, `DECISION_ENDORSED`, `DECISION_RECORDED`.
- **Unavailable / failure state:** approval without required endorsement → `PENDING_ENDORSEMENT`; decision not recorded; `attempted` audit.

### S5 — `WORK_PLANNED` — "Work planned"
- **Entry criteria:** a recorded Decision exists.
- **Permitted events:** `WorkOrdersCreated`; `SpeedReductionExecuted`; `MaterialCheckRequested`.
- **Required evidence:** work orders reference `sourceDecisionId`; job plans defined.
- **Required capability / accountable persona:** Maintenance Planner (plan/ready); Shift Supervisor (execute the operating change).
- **Deterministic calculations triggered:** `workOrder.readiness` from labour/tools/materials; `scheduleFit`. On `SpeedReductionExecuted`: `asset.operatingState → reduced_speed`.
- **Values that must not change:** health, risk, time-to-critical (speed reduction changes operating state only; risk recomputes **only** from new measurements).
- **Resulting state:** `MATERIALS_CHECKED` on `MaterialAvailabilityConfirmed`.
- **Audit record:** `WORK_ORDERS_CREATED`; `SPEED_REDUCTION_EXECUTED`.
- **Unavailable / failure state:** job plan missing a required part definition → readiness `blocked (definition_incomplete)`.

### S6 — `MATERIALS_CHECKED` — "Materials checked"
- **Entry criteria:** work orders exist with material requirements.
- **Permitted events:** `MaterialAvailabilityConfirmed`; `ExpediteRaised`; `TurnaroundScopeRequested`.
- **Required evidence:** inventory position (on-hand, lead time) with source; the dry gas seal record.
- **Required capability / accountable persona:** Materials & Spares Coordinator.
- **Deterministic calculations triggered:** `workOrder.readiness` (seal not in stock → overhaul `blocked (materials)`); `scheduleExposure` from lead time vs due window; constraint propagation to dependent objects.
- **Values that must not change:** the reliability Decision, work scope, health, risk.
- **Resulting state:** `TURNAROUND_SCOPE_RETAINED` on `TurnaroundScopeRetained`.
- **Audit record:** `MATERIAL_AVAILABILITY_CONFIRMED`; `EXPEDITE_RAISED`.
- **Unavailable / failure state:** part data absent → `unavailable` (never assumed in stock); lead time exceeds intervention window → `at_risk` flag.

### S7 — `TURNAROUND_SCOPE_RETAINED` — "Turnaround scope retained"
- **Entry criteria:** an overhaul work order derived from the Decision exists; a fixed turnaround event date is known.
- **Permitted events:** `TurnaroundScopeRetained`; `TurnaroundScopeReleased`; `ExecutionRequested`.
- **Required evidence:** scope item references `sourceDecisionId`/`workOrderId`; seal lead time.
- **Required capability / accountable persona:** Turnaround Manager.
- **Deterministic calculations triggered:** `leadTimeFit` = seal availability vs `eventDate` → `fits` (slim slack) or `at_risk`; `scopeCost`.
- **Values that must not change:** health, risk, time-to-critical, value at stake.
- **Resulting state:** `EXECUTION_OUTCOME_PENDING` on `ExecutionRecorded`.
- **Audit record:** `TURNAROUND_SCOPE_RETAINED`.
- **Unavailable / failure state:** seal availability after `eventDate` → `leadTimeFit=at_risk`, scope flagged, no silent pass.

### S8 — `EXECUTION_OUTCOME_PENDING` — "Execution / outcome pending"
- **Entry criteria:** interim work (inspection) executed or scheduled.
- **Permitted events:** `ExecutionRecorded`; `ConfirmOutcomeRequested`.
- **Required evidence:** Execution event(s) with performer and time.
- **Required capability / accountable persona:** Shift Supervisor / Maintenance Planner (record execution).
- **Deterministic calculations triggered:** `outcome.status = pending`. **Realised value stays `unavailable`.**
- **Values that must not change:** value at stake, projected value; nothing is realised yet.
- **Resulting state:** `VALUE_VALIDATION_PENDING` on `ConfirmOutcome` (governed; not fired by default in the golden path).
- **Audit record:** `EXECUTION_RECORDED`.
- **Unavailable / failure state:** default golden state — realised value `unavailable/pending`.

### S9 — `VALUE_VALIDATION_PENDING` — "Value validation pending"
- **Entry criteria:** a confirmed Operational outcome with supporting evidence.
- **Permitted events:** `ConfirmOutcome` (with evidence); `ReopenOutcome`.
- **Required evidence:** outcome `evidenceRefs[]` present; confirmer identity.
- **Required capability / accountable persona:** Reliability Manager / Plant Manager (confirm-outcome).
- **Deterministic calculations triggered:** `realisedValue` recognised; `projected vs realised` reconciled (variance recorded).
- **Values that must not change:** the historical `valueAtStake` and `projectedValue` (kept as separate figures; realised does not overwrite them).
- **Resulting state:** terminal for Slice 2.1 (`OUTCOME_VALIDATED`).
- **Audit record:** `OUTCOME_CONFIRMED`; `REALISED_VALUE_RECOGNISED`.
- **Unavailable / failure state:** confirm-outcome without supporting evidence → **rejected**, realised value stays `unavailable`, `attempted` audit.

---

## 3. Governed recomputation rules by metric

Different values change at different lifecycle points. A metric recomputes **only** on its declared trigger; no ambient recalculation.

| Metric | Recomputes on | Does NOT change on | Class |
|---|---|---|---|
| `health`, `deterministicRisk` | `NewMeasurementIngested` (fresh measurement) | approval, endorsement, speed-reduction execution, material events | deterministic_calculation |
| `timeToCriticalDays` / `criticalDate` | `NewMeasurementIngested` (via reassessment) | decision status changes, execution, materials | prediction |
| `decision.status` | `DecisionApproved`, `DecisionEndorsed`, `DecisionRejected` | new measurements (status ≠ risk) | human_decision |
| `asset.operatingState` | `SpeedReductionExecuted` and other Execution events | assessment/approval alone | measured_fact |
| `workOrder.readiness`, `scheduleExposure` | `MaterialAvailabilityConfirmed`, `ExpediteRaised`, `ReservationChanged` | reliability decision, risk score | deterministic_calculation |
| `OEE`, `lossAttribution` | `ProductionObservationIngested` | approval, materials, turnaround scope | deterministic_calculation |
| `leadTimeFit` | material lead-time events vs `eventDate` | approval, execution | deterministic_calculation |
| `valueAtStake` | `AssessmentComputed` and inputs it depends on | approval, execution, materials | deterministic_calculation |
| `projectedValue` | `DecisionRecorded` (projection attaches) | new measurements | prediction |
| `realisedValue` | `ConfirmOutcome` **with supporting evidence** only | everything else (stays `unavailable`/pending) | deterministic_calculation over confirmed outcome |

**Cardinal rule:** approval changes decision status but does **not** independently change sensor-derived risk; execution of the speed reduction changes operational state but does **not** by itself recompute risk; only new measurements recompute health, risk and projected time-to-critical.

---

## 4. Versioning and reproducibility

Every derived value writes a **Calculation record** before its new value is exposed. Records are immutable and append-only; a new computation supersedes by reference, never by overwrite.

| Field | Meaning |
|---|---|
| `calculationId` | Stable identity of the calculation kind (e.g., `risk.v`, `ttc.v`, `oee.v`, `valueAtStake.v`). |
| `version` | Version of the calculation logic used. A version change is itself a governed event and is recorded. |
| `inputsSnapshot` | The exact inputs (measurement ids + values, parameters) used, frozen at compute time. |
| `previousResult` | The prior result, or `none` for first compute. |
| `newResult` | The result now exposed. |
| `triggeringEventId` | The governed event that caused the compute. |
| `at` | Timestamp of computation. |
| `provenanceClassification` | Trust class of the result (measured_fact / deterministic_calculation / prediction). |
| `evidenceRefs[]` | Evidence backing the inputs. |
| `actor`, `authorityContext` | Who/what triggered it and under which capability (system, engineer, manager). |

**Reproducibility guarantees.**
- Given the same `inputsSnapshot` and `version`, recomputation yields the same `newResult` (pure function).
- Historical results and observations are **immutable**; a correction is a new record superseding the old, with both retained.
- Any exposed figure can be traced to the Calculation record, its inputs, its triggering event, and its evidence.
- Baseline, current projection, and realised outcome are stored as separate values and never coalesced.

---

## 5. Authority model for the golden path

Authority is a property of the action, evaluated against the active persona's capabilities. Persona switching is a demonstration view selector and **never** grants authority. All authorization is labelled demonstration authorization.

| Persona | Prepares | Approves / endorses | Executes | Cannot |
|---|---|---|---|---|
| Reliability Engineer | Assessment, Risk projection, Recommendation | — | — | approve/endorse the decision; self-commit |
| Reliability Manager | — | **Approves** the interim reliability decision (risk basis) | — | endorse in place of Plant Manager where threshold requires it; execute work |
| Plant Manager | — | **Endorses** because the governed exposure threshold is crossed | — | author the technical assessment |
| Maintenance Planner | Work orders, job plans, readiness | — | Records work execution | approve reliability decision; authorise expediting spend |
| Materials & Spares Coordinator | Material constraint, expedite | — | — | change work scope or the reliability decision |
| Turnaround Manager | Turnaround scope item | Retains/releases scope (scope authority) | — | approve the interim operating decision |
| Operations Shift Supervisor | Shift observations | — | **Executes** the operating-parameter change (reduce speed); acknowledges work | alter turnaround scope; approve the decision |
| AI Control Tower Admin | Assistant/provider config | — | — | any operational approval/endorsement/execution/validation |
| **Assistant (AI)** | **Explains or proposes only** | — | — | **approve, endorse, execute or validate an outcome** |

**Golden-path authority sequence:** Reliability Engineer prepares assessment + recommendation → Reliability Manager **approves** → Plant Manager **endorses** (threshold crossed) → Maintenance Planner prepares executable work → Shift Supervisor **executes** speed reduction → Materials Coordinator manages the seal constraint → Turnaround Manager governs scope retention → (optional, governed) Reliability Manager / Plant Manager **confirm outcome** to recognise realised value.

---

## 6. Deterministic fixture definition

All dates, sensor values, speeds, the exposure threshold, and the intervention-effectiveness factor below are **introduced fixture assumptions** for reproducibility (see Section: Assumptions). The five golden figures — health 52, risk 68, time-to-critical ≈ 17.93 days, OEE 91.2%, exposure $1,620,156 — are fixed and authoritative.

**Fixture constants (`K201.golden.v1`):**

```
asset:                K-201  (class: rotating / centrifugal compressor; industry-neutral model)
# ⚠️ SUPERSEDED (owner Decision 3): the canonical asOf clock is the repository's existing
# ANCHOR_NOW = "2026-07-27T00:00:00.000Z" (src/data/constants.ts). The T0/2026-03-xx dates
# below are illustrative only; K201.golden.v1 (Slice 2.1e) must rebase to ANCHOR_NOW and derive
# timestamps from the real seeded readings so the golden assessment uses fresh evidence.
seedReferenceDate T0: 2026-03-02T08:00:00Z          # SUPERSEDED by ANCHOR_NOW (2026-07-27) — illustrative
inspectByDeadline:    2026-03-04T08:00:00Z          # T0 + 48h (rebase to ANCHOR_NOW)
timeToCriticalDays:   17.93                          # displayed as "≈ 18 days"
criticalDate:         2026-03-20T06:19:00Z           # T0 + 17.93 days (rebase to ANCHOR_NOW)
sealLeadTimeDays:     35                              # dry gas seal, not in stock
sealOrderDate:        2026-03-02  (at T0)             # rebase to ANCHOR_NOW
sealAvailableDate:    2026-04-06                      # T0 + 35 days (rebase to ANCHOR_NOW)
turnaroundEventDate:  2026-04-10                      # FIXED
turnaroundSlackDays:  4                               # sealAvailable → event (slim slack, "fits")
exposureThresholdUSD: 1,000,000                       # CONFIRMED governed exposure-threshold.v1 (≥ semantics; boundary at $1M requires endorsement); K-201 $1,620,156 crosses (tech plan §9)
interventionEffectiveness: 0.90                       # WITHDRAWN — the 0.90 projected-value factor is removed (tech plan §8)

baseline sensors:
  vibrationVelocityRMS: 7.1 mm/s   (30-day baseline 4.4 mm/s, rising; measured_fact)
  bearingTemperature:   92 °C      (baseline 78 °C, rising; measured_fact)
  operatingSpeed:       100% MCS   (reduced to 85% MCS on SpeedReductionExecuted)

baseline derived (at AssessmentComputed):
  health:               52          (deterministic_calculation)
  deterministicRisk:    68          (deterministic_calculation)
  OEE:                  91.2%       (deterministic_calculation from production observation)
  valueAtStake:         $1,620,156  (deterministic_calculation; NOT value created by AI)

value figures:
  projectedValue:  ~~valueAtStake × interventionEffectiveness = $1,458,140~~  *(WITHDRAWN)* → K-201 governed projected value = **$1,094,400** = analyzeK201().projectedFailureExposureUsd (tech plan §8.1); portfolio projected value enabled = **$1,449,400** (tech plan §8.2). Attaches at DecisionRecorded (prediction/deterministic).
  realisedValue:   unavailable / pending                                    (until ConfirmOutcome with evidence)
```

**Expected outputs after each governed event (golden path):**

| # | Governed event | Resulting state | Values that CHANGE | Values that MUST stay | Audit |
|---|---|---|---|---|---|
| E1 | `AssessmentComputed` | RISK_ASSESSED | health=52, risk=68, TTC=17.93d, valueAtStake=$1,620,156, OEE=91.2% | prior measurements immutable | ASSESSMENT_COMPUTED |
| E2 | `RecommendationGenerated` | DECISION_PROPOSED | recommendation linked | health/risk/TTC/value | RECOMMENDATION_GENERATED |
| E3 | `DecisionApproved` (Rel. Mgr) | PENDING_ENDORSEMENT | decision.status=approved | risk 68 (unchanged by approval) | DECISION_APPROVED |
| E4 | `DecisionEndorsed` (Plant Mgr) | DECISION_RECORDED | decision.status=recorded, projectedValue attaches (~~$1,458,140~~ *withdrawn* → K-201 **$1,094,400**, tech plan §8) | health/risk/TTC/valueAtStake | DECISION_ENDORSED, DECISION_RECORDED |
| E5 | `SpeedReductionExecuted` (Shift) | WORK_PLANNED* | operatingState=reduced_speed (85% MCS) | health/risk/TTC (await new measurement) | SPEED_REDUCTION_EXECUTED |
| E6 | `WorkOrdersCreated` (Planner) | WORK_PLANNED | inspectionWO=ready, overhaulWO=pending | decision, risk | WORK_ORDERS_CREATED |
| E7 | `MaterialAvailabilityConfirmed` (Materials) | MATERIALS_CHECKED | overhaulWO.readiness=blocked(materials), scheduleExposure set | decision, scope, risk | MATERIAL_AVAILABILITY_CONFIRMED |
| E8 | `TurnaroundScopeRetained` (T/A Mgr) | TURNAROUND_SCOPE_RETAINED | leadTimeFit=fits (4-day slack), scopeCost set | health/risk/value | TURNAROUND_SCOPE_RETAINED |
| E9 | `ExecutionRecorded` (inspection) | EXECUTION_OUTCOME_PENDING | outcome.status=pending | valueAtStake, projectedValue; realisedValue=unavailable | EXECUTION_RECORDED |
| E10 | `ConfirmOutcome` *(optional, governed)* | VALUE_VALIDATION_PENDING → OUTCOME_VALIDATED | realisedValue recognised; projected-vs-realised variance | valueAtStake, projectedValue retained separately | OUTCOME_CONFIRMED, REALISED_VALUE_RECOGNISED |

\* E5 may occur while in WORK_PLANNED; it changes `operatingState` without advancing risk. Default golden path stops at E9 with realised value pending; E10 is available to demonstrate realised value on request.

---

## 7. Negative and boundary scenarios

| Scenario | Trigger | Expected system behaviour |
|---|---|---|
| Missing sensor evidence | Assessment requested with no fresh Measurement | State holds at `EVIDENCE_UNAVAILABLE`; health/risk render `unavailable`, never zero; `attempted` audit. |
| Stale evidence | Measurement older than freshness window | Assessment flagged `low_confidence`/`stale`; no silent use; freshness surfaced. |
| Approval without required endorsement | `DecisionApproved` but exposure > threshold and no `DecisionEndorsed` | Decision stays `PENDING_ENDORSEMENT`; not recorded; downstream planning locked; `attempted` audit. |
| Attempted assistant execution | Assistant emits `DecisionEndorsed` / `SpeedReductionExecuted` | Rejected at guard; no state change; `attempted` audit with `actorPersona=assistant`. |
| Insufficient capability | Persona lacking `decision.approve` fires `DecisionApproved` | Rejected; prepared draft remains; `attempted` audit; persona switch does not elevate. |
| Material lead time exceeds window | Seal available after `turnaroundEventDate` (or after intervention window) | `leadTimeFit=at_risk` / readiness `blocked`; scope flagged; no silent pass. |
| Calculation version change | `calculationId` version bumped | New Calculation record with new `version`; prior results retained and immutable; change audited. |
| Recomputation failure | Recompute throws / inputs invalid | Last good value retained and marked `stale`; failure audited; no partial/fabricated value exposed. |
| Outcome confirmation without evidence | `ConfirmOutcome` with empty `evidenceRefs[]` | Rejected; realised value stays `unavailable`; `attempted` audit. |
| Duplicate or out-of-order event | Same event id replayed, or event for a not-yet-entered state | Idempotent no-op for duplicates (no second audit/calc); out-of-order rejected with `invalid_transition`; state unchanged. |

---

## 8. Acceptance criteria and deterministic test fixtures (Given / When / Then)

All tests run against the `K201.golden.v1` fixture with the deterministic provider.

**8.1 Unit — calculations and reproducibility**
- **Given** the baseline sensor inputs, **When** the assessment computes, **Then** health=52, risk=68, TTC=17.93 days, valueAtStake=$1,620,156, each with a Calculation record and provenance class.
- **Given** an identical `inputsSnapshot` and `version`, **When** recomputed, **Then** the result is byte-identical (pure function).
- **Given** an existing Calculation record, **When** a new computation supersedes it, **Then** the previous record remains immutable and retrievable.

**8.2 State-transition**
- **Given** `RISK_ASSESSED`, **When** `RecommendationGenerated`, **Then** state → `DECISION_PROPOSED` and no metric changes.
- **Given** `DECISION_PROPOSED` with exposure > threshold, **When** `DecisionApproved` only, **Then** state → `PENDING_ENDORSEMENT` (not `DECISION_RECORDED`).
- **Given** `PENDING_ENDORSEMENT`, **When** `DecisionEndorsed` by Plant Manager, **Then** state → `DECISION_RECORDED`, projectedValue attaches (~~$1,458,140~~ *withdrawn* → K-201 **$1,094,400**, tech plan §8), and risk stays 68.
- **Given** `WORK_PLANNED`, **When** `SpeedReductionExecuted`, **Then** operatingState=reduced_speed and health/risk/TTC are unchanged.
- **Given** `MATERIALS_CHECKED` with the seal not in stock, **When** availability is confirmed, **Then** overhaul readiness=blocked(materials) and inspection readiness=ready independently.
- **Given** `TURNAROUND_SCOPE_RETAINED`, **When** lead time is tested, **Then** leadTimeFit=fits with 4-day slack.
- **Given** the default golden path ends at `EXECUTION_OUTCOME_PENDING`, **Then** realisedValue=unavailable.

**8.3 Authorization**
- **Given** the assistant persona, **When** it attempts `DecisionEndorsed`, **Then** the guard rejects it, state holds, and an `attempted` audit is written.
- **Given** a persona without `decision.approve`, **When** it fires `DecisionApproved`, **Then** rejected and the prepared draft remains.
- **Given** persona switching from Reliability Engineer to Plant Manager, **Then** no record or authority changes as a result of the switch itself.

**8.4 Audit**
- **Given** any successful transition, **Then** exactly one append-only Audit event records actor, persona, capability evaluated, before/after status, timestamp.
- **Given** a rejected action, **Then** an `attempted` Audit event is written and no object status changes.
- **Given** a duplicate event id, **Then** no second Audit or Calculation record is created.

**8.5 Provenance**
- **Given** any exposed value, **Then** it resolves a trust classification, a provenance reference, and a freshness timestamp.
- **Given** a prediction (TTC) and a measured fact (bearing temperature), **Then** their classifications differ and are distinguishable without colour.
- **Given** missing evidence, **Then** the field is `unavailable`/`pending`, never zero or fabricated.

**8.6 Cross-workspace consistency**
- **Given** health=52 in Asset 360's view-model, **Then** the same value and Calculation record id appear wherever health is shown (single source, no divergence).
- **Given** the seal constraint, **Then** the same `at_risk`/`blocked` status propagates identically to the work order and the turnaround scope item.
- **Given** valueAtStake, projectedValue and realisedValue, **Then** all consuming view-models render them as three separate figures and never merge them.

---

## 9. Dependencies for later slices and implementation-ready breakdown

**Provides to later slices.** Slice 2.1 exposes: the canonical object graph and view-model contracts; the deterministic state engine and event log; the Calculation record + versioning ledger; capability-guard evaluation (consumed fully by Slice 2.2); the append-only Audit event (sole source for the brief "what changed"); and the `K201.golden.v1` fixture.

**Downstream dependencies.**
- **2.2 Capability, approval & audit** — extends the guard evaluation and audit event into the full prepare/confirm UI; depends on the authority model and Audit event here.
- **2.3 Reliability spine** — Asset 360 and Assessment & Decision are view-models over Assessment, Risk projection, Recommendation, Decision defined here.
- **2.4 Maintenance & materials** — Work order readiness and material constraint recompute rules originate here.
- **2.5 Turnaround, OEE & value** — turnaround scope, OEE/loss recompute, and the three value figures originate here.
- **2.6 Assistant & Control Tower** — grounds on the Calculation record + provenance; cost accounting is a labelled scenario over this data.
- **2.7 Briefs, responsive & mini-workspaces** — Plant Manager Command and Shift Supervisor Console read the Decision, exposure, and Audit "what changed" defined here.

**Implementation-ready breakdown (behaviour, not repository layout — Copilot decides files after inspecting the code):**
1. Define the shared object model and view-model contracts (Section 1), asset-agnostic, with the shared envelope.
2. Implement the deterministic state engine: states S1–S9, permitted events, entry criteria, guards.
3. Implement the Calculation record ledger with versioning, input snapshots, and immutability (Section 4).
4. Implement per-metric recompute functions bound to their triggers only (Section 3).
5. Implement capability-guard evaluation and the authority model used by transitions (Section 5).
6. Implement the append-only Audit event writer (committed / rejected / attempted).
7. Encode the `K201.golden.v1` deterministic fixture and the expected-output table (Section 6).
8. Implement the negative/boundary handling (Section 7) as first-class states/flags, not exceptions.
9. Provide the Given/When/Then fixtures (Section 8) as the slice's test suite; keep the V1 baseline suite green.

---

## Preserved product rules

- Historical observations and calculations are immutable.
- Baseline, current projection and realised outcome are separate values.
- Missing evidence produces `unavailable`/`pending` states, never fabricated values.
- Value at stake is not value created by AI.
- Projected value is not realised value.
- Representative inference costs must be labelled "scenario, not billed."
- K-201 is the golden fixture, but the model remains asset-agnostic and industry-neutral.
- V1 remains protected; Phase 2 applies only to `/v2`.

---

## Closeout

### Decisions encoded
- Golden path requires **both** Reliability Manager approval **and** Plant Manager endorsement, gated by the exposure threshold that $1.62M crosses.
- Turnaround date is fixed with a **slim 4-day slack** over the 35-day seal lead time (`fits`).
- Realised value stays **pending by default**; a governed `ConfirmOutcome` (with evidence) is available to demonstrate it.
- Approval changes decision status only; **speed-reduction execution changes operating state only**; only new measurements recompute health/risk/TTC.
- The assistant may explain or propose but can never approve, endorse, execute or validate.

### Assumptions introduced (fixture only — confirm or adjust)
- Seed reference date `T0 = 2026-03-02` — **SUPERSEDED** by canonical `ANCHOR_NOW = 2026-07-27` (Decision 3); rebase fixture in 2.1e.
- Seal available `2026-04-06`; fixed turnaround date `2026-04-10`; slim slack `4 days` — rebase relative to `ANCHOR_NOW`.
- ~~Exposure threshold for Plant Manager endorsement = **$1,000,000**.~~ *(CONFIRMED as the governed value: named, versioned `exposure-threshold.v1 = $1,000,000`, `≥` semantics, boundary at $1M requires endorsement; K-201 `$1,620,156` crosses it; tech plan §9.)*
- ~~Intervention-effectiveness factor = **0.90**, giving projected value **$1,458,140**.~~ *(WITHDRAWN — the 0.90 factor and `$1,458,140` are removed. Governed K-201 projected = **$1,094,400** ("K-201 projected value enabled"); portfolio projected value enabled = **$1,449,400** ("Portfolio projected value enabled — 6 recommendations"); existing engines, no seed change; tech plan §8.)*
- Baseline sensor values (vibration 7.1 mm/s, bearing temp 92 °C, speed 100%→85% MCS) and OEE 91.2% are representative synthetic inputs consistent with the fixed golden figures.

### Unresolved questions
1. ~~Confirm the **exposure threshold** ($1,000,000) and the **intervention-effectiveness factor** (0.90).~~ *(RESOLVED — `exposure-threshold.v1 = $1,000,000` confirmed; 0.90/$1,458,140 withdrawn; tech plan §8–§9.)*
2. ~~Confirm the **freshness window** for measurements (proposed 24h).~~ *(RESOLVED — source-specific policy, orthogonal to source mode: sensor 15 min; production/OEE/CMMS/inventory/turnaround/financial 24 h; `freshness = fresh|stale|missing|unknown` (never `synthetic`); tech plan §10.)*
3. ~~Single factor vs avoided-loss build-up for `projectedValue`.~~ *(RESOLVED — governed engine value; K-201 decision attaches `$1,094,400`; portfolio surfaces show `$1,449,400`; tech plan §8.4.)*
4. **Open:** fixture clock rebase — `K201.golden.v1` must derive timestamps from the real seeded readings anchored at `ANCHOR_NOW` (2026-07-27) so the golden assessment uses fresh evidence (tech plan RQ-1, Slice 2.1e).

### Acceptance-criteria checklist
- [ ] Baseline assessment reproduces health 52, risk 68, TTC 17.93 d (≈18 d), OEE 91.2%, exposure $1,620,156 with calculation records.
- [ ] Approval without endorsement holds at `PENDING_ENDORSEMENT`; endorsement records the decision and attaches the governed projected value (~~$1,458,140~~ *withdrawn* → K-201 **$1,094,400**, tech plan §8).
- [ ] Speed-reduction execution changes operating state only; risk stays 68.
- [ ] Seal not in stock blocks the overhaul while the inspection stays ready; constraint propagates identically to the turnaround scope item.
- [ ] Lead-time fit resolves to `fits` with 4-day slack against the 2026-04-10 event.
- [ ] Realised value stays `unavailable` until a governed `ConfirmOutcome` with evidence.
- [ ] Assistant execution/approval attempts are rejected and audited as `attempted`.
- [ ] Every governed action writes exactly one append-only audit event; duplicates are idempotent.
- [ ] Historical calculations are immutable across a version change.
- [ ] The three value figures never merge across view-models.
- [ ] V1 remains untouched; baseline suite passes.

### Handoff for GitHub Copilot (Plan mode)

```
Plan (do not implement yet) Slice 2.1 for Asset Supervision OS under /v2 only, on a new branch off copilot/v2-phase-1-enterprise-shell. Do not modify V1 or the protected main branch.

Objective: a shared, asset-agnostic operational object model plus a deterministic, governed K-201 state machine that later slices read from. Inspect the /v2 codebase first and propose where each concern lives; do not assume filenames.

Build the object model in Section 1 (shared envelope: id, version, status, trustClassification, provenance, freshness, event links). Implement states S1–S9 (Section 2) with entry criteria, permitted events, capability guards, required evidence, declared calculations, immutable values, resulting state, audit record, and failure/unavailable states. Bind per-metric recompute to its trigger only (Section 3): approval changes decision status only; speed-reduction changes operating state only; only new measurements recompute health/risk/TTC; realised value stays unavailable until a governed ConfirmOutcome with evidence.

Add the Calculation record ledger (Section 4): calculationId, version, inputsSnapshot, previous/new result, triggering event, timestamp, provenance class, evidence refs, actor/authority; historical records immutable. Enforce the authority model (Section 5): Reliability Engineer prepares; Reliability Manager approves; Plant Manager endorses because the exposure threshold is crossed; the assistant can only explain or propose; persona switching never grants authority; label all as demonstration authorization.

Encode the K201.golden.v1 fixture (Section 6) and reproduce the expected-output-per-event table exactly. Implement the negative/boundary cases (Section 7) as first-class states, not exceptions. Deliver the Given/When/Then suite (Section 8) — unit, state-transition, authorization, audit, provenance, cross-workspace consistency — and keep the V1 baseline suite green.

Confirm the open fixture numbers before finalising: the **exposure-threshold value** for `exposure-threshold.v1` (configured so K-201 `$1,620,156` requires endorsement). The `interventionEffectiveness = 0.90` factor and `$1,458,140` are **withdrawn** — projected value is the existing-engine result (K-201 `$1,094,400`; portfolio `$1,449,400`; tech plan §8). Freshness is **source-specific** (sensor 15 min; others 24 h; tech plan §10), not a single window. Return a plan of modules, data shapes, and test files for review; write no implementation code until the plan is approved. Do not claim to have inspected, edited, tested, or committed code you have not actually run.
```

---

*Companion plan: `V2_PHASE_2_PRODUCT_PLAN.md` (the approved 19-section Phase 2 plan). This specification details Slice 2.1 only and does not begin any later slice.*
