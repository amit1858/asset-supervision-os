# V2 Phase 2 — K-201 Governed Recomputation: Repository-Aware Technical Plan

**Status:** Documentation only. No `src/**`, dependency, configuration, test, or
customer-facing change is authorised by this document. Implementation begins only
after this plan is reviewed and approved.

**Branch:** `copilot/v2-phase-2-k201-planning`
**Baseline:** Phase 1 shell (`08370a5`) → Phase 2 planning checkpoint (`95dd70e`).
**Inputs:** `docs/v2/V2_PHASE_2_PRODUCT_PLAN.md` (approved) and
`docs/v2/V2_PHASE_2_SLICE_2_1_SPEC.md` (approved).

---

## Owner reconciliation — Slice 2.1a as built — 2026-08-02

Slice 2.1a is implemented and committed (`5960e06`, eight files under
`src/v2/domain/**`). Owner review during implementation changed three envelope
contracts from the illustrative signatures drafted below. **The implementation is
authoritative**; this document is corrected to match it.

| # | Drafted below | As built (authoritative) |
|---|---|---|
| 1 | `ValueEnvelope.integrationState?: IntegrationState` | **Removed.** `ValueEnvelope` does not carry integration health. There is no concrete Slice 2.1a consumer, and forcing integration health onto every governed value is wrong. Integration health stays in the existing source/integration model (`src/domain/integration.ts`) and will be exposed by a **separate source/integration assessment** when a consumer is designed. `ValueEnvelope` never imports `IntegrationState`. |
| 2 | `ValueEnvelope.supersededByEventId: string \| null` | **Replaced by forward-only `supersedesId: string \| null`.** A new version records the identity of the version it replaces. A prior envelope is **never** backward-stamped, re-written, or re-emitted as a modified copy; it stays byte-for-byte unchanged and referenceable. Whether a version has itself been superseded is **derived** from the successor relationship in the append-only ledger (Slice 2.1c). |
| 3 | `evidenceType` as the freshness policy selector | **Renamed `freshnessClass`**, a closed union (`condition_signal`, `production_oee`, `cmms_work_order`, `inventory_material`, `turnaround_readiness`, `financial_value`). Precedence: an explicit `freshnessClass` selects the governed window; otherwise a conservative default is derived from `SourceKey`; an ungoverned source resolves to `unknown` and is never guessed. `historian` defaults to `condition_signal` (15 min), so production/OEE callers must state `production_oee` explicitly. `freshness.v1` remains the policy version. |

**The five-axis orthogonality doctrine is unchanged and still governs.** What is
corrected is only *which axes `ValueEnvelope` carries*:

| Axis | Type | Carried by `ValueEnvelope`? |
|---|---|---|
| `sourceMode` | `SourceMode` (`local`\|`snowflake`) | **Yes** |
| `freshness` | `FreshnessState` (`fresh`\|`stale`\|`missing`\|`unknown`, never `synthetic`) | **Yes** |
| `provenance` | `Provenance` | **Yes** |
| `trustClassification` | derived from `provenance` | **Yes** — derived internally; callers cannot supply or override it |
| `integrationState` | `IntegrationState` | **No** — separate source/integration assessment |

Other 2.1a contracts as built: the envelope is a discriminated union on
`status` (`available` with `value: T`, `unavailable` with `value: null` **and** a
non-empty `unavailableReason`); numeric `0` is a legitimate available value; the
envelope object and its defensively-copied `evidenceIds` are frozen, while the
generic payload `T` is stored by reference and is **not** deep-cloned or
deep-frozen; there is no public `markSuperseded` helper, because a second,
divergent copy of a prior version must never exist.

Sections §3 (E1), §10.2, §11, §12.3, §13 and §15.3 below are corrected in place.

---

## 0. Correction to the earlier "presentation-only" assumption

The earlier Phase 2 documents (`docs/V2_PHASE_2_K201_PLAN.md`,
`docs/V2_PHASE_2_INSTRUCTIONS.md`) framed Phase 2 as a **presentation layer only,
no domain change**. That framing is **withdrawn**.

The approved product plan and Slice 2.1 spec require a **governed recomputation
model**: a shared value envelope, a deterministic state machine, a versioned
calculation ledger, an evidence layer, capability-gated transitions, and an
append-only audit trail. These are **genuine domain extensions**, not UI.

What does **not** change:
- The existing deterministic **engines** (`risk`, `oee`, `rots`) remain the only
  place the mathematics lives. The new layer **orchestrates and records** their
  output; it never re-implements a calculation.
- The **v1 seed and its golden K-201 numbers stay byte-for-byte stable**
  (`npm run seed:verify` must remain green and unchanged).
- **No operational write-back**: no CMMS/inventory/Snowflake mutation, no
  autonomous approval or execution. The assistant remains **prepare-only**.
- **v1 routes and modules are untouched.** The new layer is additive under a
  dedicated v2 domain namespace (see §5).

---

## 1. Repository inspection summary (what already exists)

| Area | Module(s) | Provides |
|---|---|---|
| Domain entities | `src/domain/types.ts` | `Asset`, `SensorReading` (measured/statistical), `ConditionEvent`, `ProductionRun`, `DowntimeEvent`, `QualityEvent`, `WorkOrder`, `SparePart`, `InventoryBalance`, `TurnaroundProject`/`TurnaroundWorkPackage`, `Recommendation`, `RecommendationEvidence`, `HumanDecision`, `OperationalOutcome`, `AiInteraction`, `PromptVersion`, `Dataset` |
| Trust primitives | `src/domain/enums.ts` | `Provenance` (measured, deterministic, business_rule, statistical, ai_generated, human), `ValueStatus` (projected, validated, realised), `DecisionType`, `RecommendedDisposition`, `DataFreshness`, `AiAccounting` |
| Source availability | `src/domain/integration.ts` | `SourceState`/`IntegrationState`, per-source freshness, `sourceHasData()` |
| Engines (math) | `src/engines/risk.ts`, `oee.ts`, `rots.ts` | `computeRisk` → health/risk/TTC; `computeOee`/`aggregateOee`/`financialExposure`; `computeRots`/`estimateModelCost`/`usageByProvider` |
| K-201 truth | `src/data/k201-analysis.ts` | `analyzeK201()` — single source of truth binding seed + repository so risk/OEE/exposure never drift |
| Data access | `src/data/repository.ts` | `getRepository()`, `getAsset360(tag)` → `Asset360Model`, `getDataset()` |
| Seed | `src/data/seed.ts`, `generate.ts` | `buildDataset()` deterministic dataset |
| Personas / authority | `src/personas/*` | 21 typed `Capability` values with an `authority` flag (`capabilities.ts`), `personaCan()`, per-persona `approvalAuthority` arrays (`registry.ts`), `PersonaAuthorizationProvider` seam (`authorization.ts`) |
| Assistant boundary | `src/ai/service.ts`, `src/voice/*` | `server-only` `explainAssetRisk`, versioned prompts (`PromptVersion`), voice-boundary tests already forbid client-side model calls / execution |
| V2 surface registry | `src/v2/routes.ts` | 13 routes with per-route `phase2` scope contracts and capability access rules |

**Key finding:** most of the product plan's "shared object model" **already
exists as domain types**. The gap is **not the entities** — it is the *governed
event / state-machine / calculation-versioning / audit* layer that ties them
together and makes recomputation deterministic, triggered, and auditable.

---

## 2. Product requirements mapped to existing modules (reuse)

These requirements are satisfied by **reusing** existing modules with **no new
domain type**, only orchestration/wiring:

| Requirement (product plan / spec) | Existing module reused | Notes |
|---|---|---|
| Deterministic risk / health / TTC (golden: risk 68, health 52, ~17.93 d) | `engines/risk.ts` via `data/k201-analysis.ts` | New layer records the result; does not recompute independently. |
| OEE 91.2% (A 97.9 / P 93.9 / Q 99.1) and financial exposure $1,620,156 | `engines/oee.ts` via `k201-analysis.ts` | Same. |
| Return on Token Spend / AI cost accounting (Admin only) | `engines/rots.ts`, `domain AiInteraction` | Stays inside AI Control Tower per §13 decision. |
| Provenance / trust of each value | `domain/enums.ts` `Provenance` | Maps to spec `trustClassification` (see §4 conflict C1). |
| Value projected ≠ realised | `enums.ts` `ValueStatus`, `OperationalOutcome` | Enforced envelope-side; realised stays 0 until validated. |
| Source freshness / availability (never a number slot) | `domain/integration.ts` | Feeds the envelope `freshness` field. |
| Recommendation with evidence, value-at-stake, projected value, disposition | `Recommendation`, `RecommendationEvidence` | Extended, not replaced (see §4 C2). |
| Human decision (approve/reject/modify/defer) | `HumanDecision`, `DecisionType` | Reused as the record a `DECISION_RECORDED` transition writes. |
| Realised-outcome validation | `OperationalOutcome`, `validate_operational_outcome` capability | Reused for S9 validation. |
| Capability / authority enforcement | `personas/capabilities.ts` (`authority` flag), `registry.ts` `approvalAuthority`, `personaCan()` | Reused as the guard vocabulary for transitions (§4 C4). |
| Prepare-only assistant (never approve/execute) | `ai/service.ts` (`server-only`), `voice/*` boundary tests | Reused; new "prepare action" produces a proposed transition, never applies it. |
| Work order / spare / inventory / turnaround readiness records | `domain/types.ts` (`WorkOrder`, `SparePart`, `InventoryBalance`, `TurnaroundWorkPackage.readiness`) | Reused as read models for S5–S7; **no mutation**. |
| Per-persona home + brief + thread (Phase 1) | `src/v2/routes.ts`, brief service, `thread.ts` | Phase-1 foundation the Phase-2 states surface through. |

---

## 3. Requirements that need NEW domain extensions

These have **no equivalent** in the repository today and are the real Phase 2
domain work. Proposed home: **`src/v2/domain/**`** (see §5), reusing engines and
existing entity types.

| # | Extension | Why it is new | Reuses |
|---|---|---|---|
| E1 | **Shared value envelope** (`id`, `version`, `status`, `trustClassification`, `provenance`, `sourceMode`, `freshness`, `createdByEventId`, forward-only `supersedesId`) | No unified envelope exists; provenance and freshness are separate today | `Provenance`, `DataFreshness`, `ValueStatus` |
| E2 | **Governed event log** (append-only, typed events per transition) | `Recommendation.status` is a mutable field, not event-sourced; there is no event record | Existing entity ids referenced by events |
| E3 | **Deterministic state machine S1–S9** (`SIGNAL_DETECTED` → … → `VALUE_VALIDATION_PENDING`) with a pure `next(state, event)` reducer | No state machine exists anywhere | Engines invoked only on declared triggers |
| E4 | **Calculation-record ledger** (versioned, immutable: `inputsSnapshot`, `engineVersion`, `result`, `previousRecordId`, `supersededBy`, trigger event) | Engines return fresh results; nothing persists a versioned, superseding calc history | `computeRisk`/`computeOee` outputs stored verbatim |
| E5 | **Recompute-trigger rules** (metric → the exact events that may recompute it; Section 3 of the spec) | No trigger model; today values are computed on read | Engine functions |
| E6 | **Transition authority guard** (transition → required `Capability`; exposure-threshold escalation to Plant Manager endorsement) | Capability vocab exists but is not bound to transitions; threshold-driven endorsement is not modelled | `personaCan()`, `authority` flag, `approvalAuthority` |
| E7 | **Append-only audit trail** (who/what/when/which capability/which event, immutable) | `AiInteraction` is cost accounting, not an operational audit log | Persona id + capability + event id |
| E8 | **Prepared-action contract** (assistant/Chief-of-Staff output = a *proposed* transition + evidence, requiring a human governed act to apply) | Assistant is explanation-only today; a structured "prepare" object does not exist | `ai/service.ts` server-only seam, evidence types |
| E9 | **`K201.golden.v1` fixture** binding the introduced assumptions (T0, exposure threshold, effectiveness factor, freshness window) to expected envelopes and transitions | No governed fixture exists; `seed.ts` seeds entities, not a state trajectory | Seed dataset as the entity substrate |

**Engine-reuse rule (must be enforced by tests):** E3/E4/E5 must call
`engines/*` for every number. No arithmetic that reproduces risk, OEE, exposure,
or value may live in the state machine, ledger, or UI.

---

## 4. Conflicts, duplication risks, and numeric discrepancies

| ID | Conflict / risk | Resolution proposed |
|---|---|---|
| **C1** | Spec `trustClassification` (`measured_fact`, `deterministic_calculation`, `prediction`, `ai_explanation`, `human_decision`) vs existing `Provenance` (`measured`, `deterministic`, `business_rule`, `statistical`, `ai_generated`, `human`) | **Do not introduce a second parallel enum.** Define `trustClassification` as a **typed mapping** over the existing `Provenance` (e.g. `statistical → prediction`, `ai_generated → ai_explanation`, `human → human_decision`, `deterministic`/`business_rule → deterministic_calculation`, `measured → measured_fact`). One source of truth; no drift. |
| **C2** | Spec "Decision / Evidence / Outcome" objects vs existing `HumanDecision` / `RecommendationEvidence` / `OperationalOutcome` | **Reuse and extend** the existing types (or wrap them in the envelope). Forking new near-duplicate types is prohibited. |
| **C3** | Spec `AuditEvent` vs existing `AiInteraction` | Keep **separate**: `AiInteraction` = token/cost accounting; new audit trail (E7) = operational governance. Do not overload one for the other. |
| **C4** | Spec authority model (Engineer prepares → Manager approves → Plant Manager endorses above threshold) vs existing `approvalAuthority`/`authority` flag | **RESOLVED (Decision 2).** Approval and endorsement are **distinct governed acts**. Reliability Manager **approves** via existing `approve_reliability_decision`. A **new** authority capability `endorse_high_exposure_reliability_decision` (Plant-Manager-held, `authority: true`) represents the additional endorsement required when the versioned exposure-threshold policy is crossed. `approve_reliability_decision` is **not** reused for endorsement. Neither persona selection nor the assistant grants either authority. See §9 (authority model). |
| **C5 (numeric)** | Spec `projectedValue = $1,458,140` (from effectiveness 0.90) **vs** seed `projectedEnabled = $1,449,400` | **RESOLVED (Decision 1).** `$1,458,140` is **withdrawn**. The authoritative golden **projected value enabled** is `$1,449,400`, produced by the existing engines — no engine or seed is changed to match the copied spec. **Provenance is precise (§8):** `$1,449,400` is the **portfolio ROTS aggregate** (`computeRots().projectedValueEnabledUsd`, sum over unresolved recommendations); the **K-201 recommendation's own** projected value enabled is **`$1,094,400`** (`analyzeK201().projectedFailureExposureUsd`). The `× 0.90` effectiveness factor is withdrawn entirely. See §8 and Remaining Question RQ-1 (which figure the K-201 fixture decision attaches). |
| **C6** | Spec "shared object graph" broadly overlaps existing `domain/types.ts` | Treat existing types as the substrate; the envelope/event/ledger **reference** entity ids rather than copying entity fields. Prevents a shadow domain. |
| **C7** | Where the new layer lives | Recommend **`src/v2/domain/**`** to preserve the strict v1/v2 separation established in Phase 1 and keep v1 determinism untouched. Flag for confirmation (§6 Q4). |

---

## 5. Placement and architecture

```
src/v2/
  domain/
    envelope.ts        # E1 shared value envelope + trustClassification mapping (C1)
    events.ts          # E2 governed event types (append-only)
    state-machine.ts   # E3 pure S1..S9 reducer: next(state, event) -> state
    triggers.ts        # E5 metric -> permitted recompute events
    calculations.ts    # E4 versioned calc-record ledger; wraps engines/* only
    authority.ts       # E6 transition -> required capability + endorsement escalation
    policy/
      exposure-threshold.ts  # named, versioned exposure-threshold policy (Decision 2)
      freshness.ts           # named, versioned source-specific freshness policies (Decision 3)
    audit.ts           # E7 append-only audit trail
    prepare.ts         # E8 prepared-action contract (assistant/CoS -> proposed transition)
    fixtures/
      k201.golden.v1.ts  # E9 governed fixture (assumptions -> expected envelopes/transitions)
  domain/*.test.ts     # node-env pure tests (mirror Phase 1 test convention)
```

Rules:
- Pure, node-environment, dependency-free modules (mirrors Phase 1 `src/v2/*`).
- Every calculation delegates to `engines/*`; the ledger stores results verbatim.
- No import of these modules into v1 routes; v2 surfaces consume them read-only.
- No `server-only` model call outside the existing `ai/service.ts` seam.

---

## 6. Decisions resolved (owner-approved) and remaining questions

**Resolved — these five items are now settled and encoded above/below:**

- **RD-1 Projected value.** Authoritative golden projected value enabled =
  `$1,449,400` (existing engines; no engine/seed change). `$1,458,140` and the
  `× 0.90` factor are **withdrawn**. Exact provenance in §8.
- **RD-2 Approval vs endorsement.** Distinct acts. New capability
  `endorse_high_exposure_reliability_decision` for Plant-Manager endorsement;
  `approve_reliability_decision` stays Reliability-Manager approval. Exposure
  threshold is a named, versioned policy; K-201's `$1,620,156` crosses it and
  requires endorsement. §9.
- **RD-3 Freshness & source dimensions.** No universal 24h window. Source-specific,
  configurable policies evaluated against the deterministic `asOf`. **Five
  orthogonal dimensions** (Decision 4, corrected): `sourceMode: SourceMode`
  (`local`/`snowflake` — how/where sourced); `integrationState: IntegrationState`
  (integration health — a **separate source/integration assessment**, *not* a
  `ValueEnvelope` field; see the 2026-08-02 reconciliation); `freshness:
  FreshnessState` (`fresh`/`stale`/`missing`/`unknown`, **never** `synthetic`);
  `provenance`; derived `trustClassification`. `sourceMode` is **not** typed as
  `IntegrationState`. §10.2.
- **RD-4 Domain boundary.** New governance layer lives under `src/v2/domain/**`;
  reuse (never fork) `Recommendation`, `RecommendationEvidence`, `HumanDecision`,
  `OperationalOutcome`, `Provenance`, and the risk/OEE/ROTS/K-201 engines. §5.
- **RD-5 Trust classification.** Derived **presentation-facing** mapping over
  `Provenance`; never persisted, never authoritative input, no competing enum;
  unknown inputs fail safe. §4 C1, §15.
- **RD-6 asOf clock (Decision 3).** The single demonstration clock is the
  repository's existing canonical seeded instant **`ANCHOR_NOW =
  "2026-07-27T00:00:00.000Z"`** (`src/data/constants.ts`), surfaced as
  `db.meta.generatedAt` and `getRepository().getCommandCenter().generatedAt`. No
  second `asOf` constant is introduced. All freshness functions take `asOf`
  explicitly and never call `Date.now()`. §10.
- **RD-7 Envelope immutability (Decision 6).** `ValueEnvelope`/`supersede` are
  immutable; superseding creates a new envelope; the prior remains referenceable;
  `unavailable` is never `0`/empty; no calculation logic in the envelope. §15.

**Approved fixture-clock rebase (was RQ-1) — Golden fixture clock:**

The old `T0 = 2026-03-02` is **superseded**. `K201.golden.v1` uses the existing
canonical clock `ANCHOR_NOW = "2026-07-27T00:00:00.000Z"` (`src/data/constants.ts`).
Requirements:
- do **not** create another absolute `asOf` constant;
- derive fixture event and evidence timestamps **relative to `ANCHOR_NOW`** (e.g.
  `ANCHOR_NOW − 5 min`), not as hard-coded March dates;
- the **initial golden assessment** must have sensor evidence **within the approved
  15-minute freshness window** (so it resolves `fresh`);
- later stale/fresh scenarios must **advance the explicit `asOf`** value or provide
  later evidence **deterministically** (fixed offsets, no wall-clock);
- **never** use `Date.now()`;
- the old March `T0` is recorded here as superseded (see §10.1 and the SLICE spec
  fixture block, which is annotated superseded).

This is a Slice 2.1e fixture task; it does not block Slice 2.1a.

**Remaining questions:** none blocking Slice 2.1a.

**Resolved since last review (were RQ-1/2/3):**
- Projected-value scope (Decision 1): K-201 surfaces attach **`$1,094,400`**
  ("K-201 projected value enabled"); portfolio/value-realisation surfaces show
  **`$1,449,400`** ("Portfolio projected value enabled — 6 recommendations"). §8.
- Exposure threshold (Decision 2): `exposure-threshold.v1 = USD 1,000,000`,
  `exposure ≥ $1,000,000` requires endorsement (boundary at exactly `$1,000,000`
  requires it); K-201 `$1,620,156` crosses. §9.
- Freshness windows + clock (Decision 3): confirmed; `asOf = ANCHOR_NOW`. §10.

---

## 7. Proposed implementation slices and dependencies

Aligned to product plan §16 and Slice 2.1 §9. **Each slice is domain + tests
first, UI after; no write-back; determinism preserved.**

| Slice | Scope | Depends on | Exit criteria |
|---|---|---|---|
| **2.1a** | E1 envelope + C1 `trustClassification` mapping; unit tests | — | Envelope wraps a value with provenance→classification, freshness, version; tests green |
| **2.1b** | E2 events + E3 state machine (pure S1–S9 reducer) | 2.1a | `next()` deterministic; illegal transitions rejected; negative cases (spec §7) covered |
| **2.1c** | E4 calc ledger wrapping `engines/*`; E5 triggers | 2.1b | Recompute only on declared trigger; versioned/immutable records; golden numbers unchanged |
| **2.1d** | E6 authority guard + threshold escalation; E7 audit trail | 2.1b, personas | Transition blocked without capability; endorsement above threshold; audit append-only |
| **2.1e** | E9 `K201.golden.v1` fixture + Given/When/Then acceptance (spec §8) | 2.1a–d | Full K-201 trajectory S1→S9 reproduces golden envelopes; `seed:verify` still green |
| **2.2+** | Surface states through v2 workspaces (Plant Command, Shift Console, Reliability, etc.) reading the envelopes/events read-only | 2.1a–e | Persona surfaces show governed state; no fabricated values; a11y/visual parity with Phase 1 |
| **2.x** | E8 prepared-action contract wired to existing governed confirmation seam | 2.1b, ai/voice boundary | Assistant proposes a transition; a human governed act applies it; boundary tests green |

**Determinism gates on every slice:** `npm run typecheck`, `npm run lint`,
`npm test`, `npm run seed:verify` (K-201 unchanged), `npm run build`.

---

## 8. Projected value — governed provenance of `$1,449,400` (Decision 1)

`$1,458,140` (= `valueAtStake × 0.90`) is **withdrawn**. No engine or seed is
changed. The authoritative figures come directly from existing engines:

**8.1 K-201 recommendation projected value = `$1,094,400`**
Source: `analyzeK201().projectedFailureExposureUsd` (`src/data/k201-analysis.ts`),
written to the K-201 recommendation as `projectedValueEnabledUsd`
(`src/data/generate.ts`). Formula (all constants in `src/data/constants.ts`):

```
projectedFailureUnits    = K201_UNPLANNED_OUTAGE_DAYS(4) × 24 × LINE.idealRateUnitsPerHour(950)
                         = 91,200 bbl
projectedFailureExposure = financialExposure(91,200, CONTRIBUTION_MARGIN_PER_BBL(12))
                         = 91,200 × 12
                         = $1,094,400
```
Provenance: `deterministic` (engine calculation). Trust class: `deterministic_calculation`.

**8.2 Portfolio projected value enabled = `$1,449,400`**
Source: `computeRots().projectedValueEnabledUsd` (`src/engines/rots.ts`, lines
164–171) = **sum of `projectedValueEnabledUsd` over unresolved recommendations**
(`status ∈ {open, actioned}`). This is what `npm run seed:verify` prints.
Build-up:

| Recommendation | projectedValueEnabledUsd |
|---|---:|
| K-201 (rec-k201) | $1,094,400 |
| E-205 | $138,000 |
| P-210A | $61,000 |
| F-201 | $90,000 |
| K-202 | $44,000 |
| P-214 | $22,000 |
| V-208 (rejected → $0) | — |
| **Portfolio total** | **$1,449,400** |

**8.3 Calculation version.** No version constant exists in the engines today.
The governed layer defines the calculation identity for these figures:
`projected-value-enabled@v1` = { aggregation: `computeRots` unresolved-sum;
K-201 component: `analyzeK201.projectedFailureExposureUsd`; inputs snapshot: the
seeded recommendation set at `asOf`; provenance: `deterministic` }. This id is
recorded in every calculation record (E4) that emits a projected value.

**8.4 Required surface labels and separation (Decision 1).** The three figures are
kept structurally and visually distinct and none is presented as AI-created value:

| Surface | Figure | Required label |
|---|---|---|
| K-201 Asset 360 / recommendation / decision | `$1,094,400` | **"K-201 projected value enabled"** |
| Portfolio / Value Realisation | `$1,449,400` | **"Portfolio projected value enabled — 6 recommendations"** |
| K-201 decision (optional, if shown) | `$1,620,156` | **"Value at stake"** — structurally & visually distinct from projected value |

The withdrawn `$1,458,140` conflated the K-201 single-asset figure with a
portfolio total and applied a spurious 0.90 factor. The reconciled model never
merges the three figures. **RESOLVED:** K-201 surfaces attach `$1,094,400`;
portfolio surfaces show `$1,449,400`.

---

## 9. Authority model — approval vs endorsement (Decision 2)

Approval and endorsement are **distinct governed acts**. Neither is granted by
persona selection or by the assistant.

| Act | Capability | Holder(s) today | New? |
|---|---|---|---|
| Prepare recommendation | `create_reliability_recommendation` | Reliability Engineer | existing |
| **Approve** interim reliability decision | `approve_reliability_decision` (`authority: true`) | Reliability Manager (and Plant Manager) | existing |
| **Endorse** high-exposure decision | **`endorse_high_exposure_reliability_decision`** (`authority: true`) | **Plant Manager only** | **NEW** |
| Validate realised outcome | `validate_operational_outcome` | Reliability Manager | existing |

**New capability (planned, not yet added to `src/**`):**
`endorse_high_exposure_reliability_decision` — added to the `Capability` union
(`src/personas/types.ts`), `CAPABILITIES` metadata with `authority: true`
(`src/personas/capabilities.ts`), and to the **Plant Manager** persona's
`approvalAuthority` only (`src/personas/registry.ts`). It is **not** reused for
approval and **not** assigned to any other persona.

**Exposure-threshold policy (named, versioned) — APPROVED (Decision 2).**
`exposure-threshold.v1 = USD 1,000,000`, a named, versioned **domain policy**
(not a UI conditional): { thresholdUsd: `1_000_000`, appliesTo:
`reliability_decision`, effect: requires `endorse_high_exposure_reliability_decision`
when **`valueAtStakeUsd ≥ thresholdUsd`** }. Semantics: `exposure ≥ $1,000,000`
requires endorsement; `exposure < $1,000,000` does not; the **boundary at exactly
`$1,000,000` requires endorsement** (`≥`, not `>`). K-201's `$1,620,156` therefore
**requires** endorsement. State model: `DecisionApproved` alone →
`PENDING_ENDORSEMENT`; `DecisionEndorsed` (Plant Manager) → `DECISION_RECORDED`.

---

## 10. Source mode and freshness — orthogonal, source-specific, versioned (Decisions 3 & 4)

**Modelling correction (Decision 4): source mode and temporal freshness are
orthogonal dimensions and are never merged.** A synthetic observation may be
`fresh` or `stale` relative to the seeded `asOf`; synthetic stays visibly
labelled regardless of freshness. `missing`, `stale`, and `0` remain different
conditions.

**10.1 Canonical `asOf` clock (Decision 3, task B).** The single demonstration
clock is the repository's **existing** canonical seeded instant — no second
constant is introduced:

| Property | Value |
|---|---|
| Constant | **`ANCHOR_NOW`** |
| Value | **`"2026-07-27T00:00:00.000Z"`** |
| Defined in | `src/data/constants.ts` (line 12; commented "Fixed 'current time' for the demo") |
| Surfaced as | `db.meta.generatedAt` (`src/data/generate.ts:421`, `generatedAt: ANCHOR_NOW`) → `getRepository().getCommandCenter().generatedAt` (`src/data/repository.ts:201`) |
| Related seed | `SEED = 20260727` (`src/data/constants.ts`) |

All freshness functions **accept `asOf` explicitly** (passed from
`generatedAt`/`ANCHOR_NOW`) and **must not call `Date.now()`**.

**10.2 Source mode vs integration state (five orthogonal dimensions — Decision 4,
corrected).** `ValueEnvelope.sourceMode` is typed as the existing **`SourceMode`**
(`"local" | "snowflake"`, `src/context/types.ts`) — *how/where the data was
sourced*. **`IntegrationState` is NOT used as the `sourceMode` type**: it mixes
operational integration conditions (`connected | partial | not_connected | stale |
error | synthetic`) and typing `sourceMode` as `IntegrationState` would reintroduce
the orthogonality problem the correction forbids. Integration health is assessed
**separately**, by the existing source/integration model
(`src/domain/integration.ts`) and a future source/integration assessment — it is
**not** a field of `ValueEnvelope` (owner reconciliation, 2026-08-02). The five
intended independent dimensions, and which of them the envelope carries:

| Dimension | Type | Meaning | On `ValueEnvelope`? |
|---|---|---|---|
| `sourceMode` | `SourceMode` (`local`\|`snowflake`) | how / where the data was sourced | **yes** |
| `integrationState` | `IntegrationState` | health / availability of the source integration | **no** — separate source/integration assessment |
| `freshness` | `FreshnessState` | temporal freshness relative to explicit `asOf` | **yes** |
| `provenance` | `Provenance` | epistemic origin of the value | **yes** |
| `trustClassification` | derived | presentation mapping only (not persisted, not caller-suppliable) | **yes**, derived internally |

In the reset/demo `sourceMode = "local"`; the synthetic label comes from the
source/integration assessment's `integrationState = "synthetic"`, never from
`sourceMode`, `freshness`, or a `ValueEnvelope` field. Presentation reuses
`src/v2/source.ts` (`describeSourceMode`,
`describeRouteSource`). All of `SourceMode`, `IntegrationState`, `SourceState`,
`SourceKey` are **left unchanged** and imported, never redefined.

**10.3 Freshness (value-temporal only).** `freshness.v1` defines per-`freshnessClass`
windows evaluated against `asOf`. `resolveFreshness()` returns a **new** minimal
value-temporal state `FreshnessState = "fresh" | "stale" | "missing" | "unknown"`
and **never returns `synthetic`**.

| `FreshnessClass` (policy selector) | Freshness window | Default for `SourceKey` (existing `integration.ts`) |
|---|---|---|
| `condition_signal` — condition / sensor evidence | **15 minutes** | `historian` (default) |
| `production_oee` — production / OEE evidence | **24 hours** | `historian` (must be stated explicitly) |
| `cmms_work_order` — CMMS / work orders | **24 hours** | `cmms` |
| `inventory_material` — inventory / material evidence | **24 hours** | `inventory`, `procurement` |
| `turnaround_readiness` — turnaround readiness | **24 hours** | `turnaround_scheduling` |
| `financial_value` — financial / value evidence | **24 hours** | derived (calculation); no `SourceKey` default |

The **class**, not the source key, selects the window, because one `SourceKey` can
supply more than one class — the historian supplies both 15-minute condition
signals and 24-hour production/OEE observations. Precedence: an explicit
`freshnessClass` wins; otherwise the conservative default for the `SourceKey`
applies; otherwise no window is governed and the result is `unknown` — never a
guess. `shift_log`, `ai_runtime` and `local_seed` have no governed default.

Evaluation (pure): `missing` when no evidence / no `capturedAt`; `unknown` when
`asOf` or the window cannot be resolved; otherwise `fresh` if
`asOf − capturedAt ≤ window`, else `stale`. `sourceMode` is resolved separately.

**Why a new `FreshnessState` is not a duplicate (task D).** The existing
`DataFreshness` (`"live" | "recent" | "stale" | "offline"`, `src/domain/enums.ts`)
is a **feed-liveness presentation label** with no `missing`/`unknown` and no
`fresh`; it cannot represent "evidence absent." `FreshnessState` is the computed
value-temporal state Decision 4 requires. For presentation it may map to
`DataFreshness`/`describeFreshness()` — but it is not persisted and does not
replace it. No existing type is duplicated; `IntegrationState`, `SourceState`,
`SourceMode`, and `DataFreshness` are all left unchanged.

---

## 11. Slice 2.1a — file-level implementation plan (the only slice detailed here)

**Scope of 2.1a:** the shared value envelope (E1) and the `trustClassification`
derived mapping (C1/RD-5) — pure, node-environment, dependency-free, engine-free
(no calculations yet). This is the contract every later slice consumes.

| Proposed file (NEW, under `src/v2/domain/**`) | Purpose | Reuses (import, never fork) |
|---|---|---|
| `src/v2/domain/envelope.ts` | `ValueEnvelope<T>` type: `id`, `version` (monotonic int), forward-only `supersedesId`, `status` (`available` \| `unavailable`), `value \| null` (+ non-empty `unavailableReason` when unavailable), `trustClassification` (**derived internally; never a caller input**), `provenance`, **`sourceMode: SourceMode`** (`local`\|`snowflake` — how/where sourced), **`freshness: FreshnessState`**, `formulaVersion`, `evidenceIds`, `asOf`, `capturedAt`, `producedAt`, `createdByEventId`; plus pure constructors `makeEnvelope()` / `supersede()` / `markUnavailable()` and the `isAvailable()` guard. **No `integrationState`** — integration health is a separate source/integration assessment (reconciliation, 2026-08-02). **Immutable:** `supersede()` returns a NEW envelope; the prior is never mutated and never backward-stamped, and stays referenceable; `unavailable` is never `0`/empty. **No calculation logic in the envelope.** | `SourceMode` from `@/context/types`; `Provenance` from `@/domain/enums`; `FreshnessState`, `TrustClassification` from siblings |
| `src/v2/domain/trust.ts` | `TrustClassification` type (`measured_fact` \| `deterministic_calculation` \| `prediction` \| `ai_explanation` \| `human_decision` \| `unknown`) + pure `trustFromProvenance(p): TrustClassification` mapping (§4 C1). **Derived only** — never persisted, never authoritative input; unknown/unexpected input **fails safe** to `unknown`. | `Provenance` from `@/domain/enums` |
| `src/v2/domain/freshness-state.ts` | `FreshnessState` (`fresh` \| `stale` \| `missing` \| `unknown`) + pure `resolveFreshness({sourceKey, freshnessClass?, capturedAt, asOf})` reading `freshness.v1` windows (§10). **`asOf` is an explicit required parameter — never `Date.now()`; never returns `synthetic`** (source mode is separate). Data-only in 2.1a; no I/O. | `SourceKey` from `@/domain/integration`; `FreshnessClass` from `./policy/freshness` |
| `src/v2/domain/policy/freshness.ts` | `freshness.v1` (§10) as a named, versioned, typed constant: the `FreshnessClass` union, the window table, the conservative per-`SourceKey` default class, and `freshnessWindowMs()`. | `SourceKey` from `@/domain/integration` |
| `src/v2/domain/index.ts` | Barrel re-export of the above for later slices. | — |
| `src/v2/domain/envelope.test.ts` | Unit tests for envelope construction, supersession immutability (prior unchanged & referenceable), `unavailable ≠ 0`, sourceMode + freshness carried separately. | `vitest` |
| `src/v2/domain/trust.test.ts` | Unit tests: every `Provenance → TrustClassification` pair is deterministic; unknown input fails safe to `unknown`; projected-vs-realised classification separation. | `vitest` |
| `src/v2/domain/freshness-state.test.ts` | Unit tests for source-specific windows, `asOf` explicit, `resolveFreshness` never returns `synthetic` and never infers source mode/integration state/provenance, missing/stale/unknown separation. | `vitest` |

**Not in 2.1a (later slices):** events/state machine (2.1b), calculation ledger &
triggers (2.1c), authority/endorsement guard & audit (2.1d), golden fixture (2.1e).
2.1a introduces **no** capability, **no** engine call, **no** state transition.

---

## 12. Test definitions (required behaviours, authored before code)

Given/When/Then, deterministic, run under the existing vitest node convention.
Full fixture-bound tests land in 2.1e; the contracts below are defined now.

**12.1 Authority separation**
- Given a decision needing approval, When `approve_reliability_decision` is
  evaluated for Reliability Manager, Then it is permitted; When evaluated for a
  persona lacking it, Then rejected and the prepared draft remains.
- Given endorsement is required, When Reliability Manager (approval only) acts,
  Then the decision holds at `PENDING_ENDORSEMENT` — approval never satisfies
  endorsement.
- Given `endorse_high_exposure_reliability_decision`, Then only Plant Manager
  holds it; no other persona and **not** the assistant can satisfy it; persona
  switching does not grant it.

**12.2 Threshold endorsement**
- Given `exposure-threshold.v1` and K-201 `valueAtStake = $1,620,156`, When the
  threshold gate evaluates, Then endorsement is **required** (K-201 crosses it).
- Given `DecisionApproved` only on a threshold-crossing decision, Then state →
  `PENDING_ENDORSEMENT`, not `DECISION_RECORDED`.
- Given `DecisionEndorsed` by Plant Manager, Then state → `DECISION_RECORDED`
  and risk stays `68` (endorsement changes decision state only).
- Given a decision **below** the threshold (`< $1,000,000`), Then approval alone
  records it (no endorsement required).
- **Boundary:** Given exposure **exactly `$1,000,000`**, Then endorsement is
  **required** (`≥` semantics — the boundary requires it).

**12.3 Source mode & freshness (orthogonal — Decision 4)**
- Given a sensor reading `16 min` before `asOf`, Then `stale` (15-min window);
  given `14 min`, Then `fresh`.
- Given a production/OEE reading `23h` / `25h` before `asOf`, Then `fresh` /
  `stale` (24-h window).
- Given `asOf = ANCHOR_NOW ("2026-07-27T00:00:00.000Z")` passed explicitly, Then
  `resolveFreshness` uses it and **never calls `Date.now()`**.
- **`resolveFreshness` never returns `synthetic`** and never infers source mode,
  integration state or provenance — it accepts only `sourceKey`, `capturedAt` (or
  missing), and `asOf`. A synthetic observation may be `fresh` or `stale`.
- Given seed data with a fresh `capturedAt`, Then `freshness = fresh` while
  `sourceMode = "local"` and the separate source/integration assessment reports
  `integrationState = "synthetic"` — the synthetic label lives on that assessment,
  never on `freshness`, `sourceMode`, or a `ValueEnvelope` field.
- Given no evidence, Then `missing` — never `stale`, never `0`.
- Given `asOf`/window unresolvable, Then `unknown` — distinct from `missing`.

**12.3b Trust classification (derived, fail-safe — Decision 5)**
- Given every supported `Provenance` value, Then `trustFromProvenance` maps
  deterministically to a single `TrustClassification`.
- Given an unknown/unexpected input, Then it **fails safe** to `unknown` (never
  throws, never invents a fact-level classification).
- `TrustClassification` is never persisted and never accepted as authoritative
  input.
- Signature is typed honestly as `trustFromProvenance(value: Provenance | unknown)`
  — it recognises supported `Provenance` values and returns `unknown` for anything
  else, rather than pretending a `Provenance`-only argument can hold invalid input.

**12.3c Envelope immutability (Decision 6)**
- Given an envelope, When `supersede()` is called, Then a **new** envelope with
  `version + 1` is returned and the prior envelope is **unchanged** and still
  referenceable.
- Given `markUnavailable()`, Then `status = unavailable`, `value = null` — never
  `0` or a fabricated empty value.
- Envelope carries `sourceMode`, `freshness`, `formulaVersion`, `evidenceIds`,
  `asOf`, `producedAt` explicitly; it contains **no** calculation logic.

**12.4 Immutable calculations** *(contract for 2.1c; envelope immutability tested in 2.1a)*
- Given a calculation record, When superseded, Then a **new** record is appended
  with `previousResult`, `newResult`, `calculationVersion`, `inputs/evidence
  refs`, `triggeringEventId`, `actor`, `timestamp`, `provenance`; the prior
  record is unchanged and still retrievable.
- Given an identical `inputsSnapshot` + `version`, When recomputed, Then the
  result is byte-identical (pure function).
- Given a version bump, Then history is preserved (never overwritten).

**12.5 Projected-vs-realised separation**
- Given the reset dataset, Then `valueAtStake`, `projectedValueEnabled` and
  `realisedValue` resolve as **three separate** figures and never merge across
  view-models.
- Given no confirmed outcome, Then `realisedValue` is `unavailable` and
  `realisedAvailable = false` (never `0` presented as realised).
- Given the golden data, Then K-201 projected = `$1,094,400`, portfolio projected
  = `$1,449,400`, K-201 value at stake = `$1,620,156` — the withdrawn `$1,458,140`
  appears nowhere.

---

## 13. Decision table (owner-approved)

| # | Decision | Encoded in | Requirement / conflict closed |
|---|---|---|---|
| 1 | Scope-specific projected values (Decision 1): K-201 surfaces attach **$1,094,400** ("K-201 projected value enabled"); portfolio surfaces show **$1,449,400** ("Portfolio projected value enabled — 6 recommendations"); value at stake **$1,620,156** kept visually distinct; **$1,458,140** + 0.90 factor withdrawn; none presented as AI-created | §8.4, §12.5 | C5 / RQ-1 resolved |
| 2 | Approval ≠ endorsement; **new** `endorse_high_exposure_reliability_decision` (Plant Manager only); **`exposure-threshold.v1 = $1,000,000`**, `≥` semantics, boundary at exactly $1M requires endorsement, K-201 $1,620,156 crosses; named versioned domain policy, not a UI conditional; neither persona selection nor assistant grants authority | §9, §12.1–12.2 | C4 / RQ-2 resolved |
| 3 | Five orthogonal source/value dimensions (Decision 4, corrected): `sourceMode: SourceMode` (`local`\|`snowflake`, existing type — **not** `IntegrationState`); `integrationState: IntegrationState` as a **separate source/integration assessment**, *not* a `ValueEnvelope` field (reconciliation 2026-08-02); `freshness: FreshnessState` (`fresh`/`stale`/`missing`/`unknown`), never `synthetic`; `provenance`; derived `trustClassification`. Windows sensor 15 min, others 24 h, selected by `freshnessClass`; `asOf = ANCHOR_NOW`, passed explicitly, never `Date.now()` | §10.2, §12.3 | freshness / RQ-3 resolved |
| 4 | New governance layer under `src/v2/domain/**`; reuse, never fork, `Recommendation`/`RecommendationEvidence`/`HumanDecision`/`OperationalOutcome`/`Provenance`/risk/OEE/ROTS/K-201 logic | §5, §11 | C6 / C7 |
| 5 | `trustClassification` is a **derived, presentation-facing** mapping over `Provenance`; never persisted/authoritative; unknown input fails safe to `unknown` | §4 C1, §11, §12.3b | C1 |
| 6 | Governed recompute semantics: approval → decision state only; endorsement → satisfies high-exposure gate; execution evidence → operational state; sensor → risk/health/TTC; production → OEE; material → readiness/schedule-exposure; realised value unavailable until governed confirm-outcome with evidence; every recompute appends an immutable calculation record; history never overwritten | §8.3, §12.4, E3–E5/E7 | governed recompute |
| 7 | `ValueEnvelope`/`supersede` immutable (Decision 6): supersede creates a new envelope; prior unchanged & referenceable; explicit `formulaVersion`/`evidenceIds`/`asOf`/`producedAt`/`sourceMode`/`freshness`; `unavailable ≠ 0`; no calc logic in envelope | §11, §12.3c, §15 | envelope immutability |
| 8 | Canonical `asOf` clock = existing **`ANCHOR_NOW "2026-07-27T00:00:00.000Z"`** (`src/data/constants.ts`, surfaced as `generatedAt`); no second constant introduced | §10.1 | Decision 3 (task B) |

---

## 14. Guardrails (unchanged from Phase 1, restated for the domain layer)

- No dependency, lockfile, or Vercel change.
- No v1 route or module edited; no seed number changed.
- No operational write-back; assistant prepare-only (never approve/endorse/execute/validate).
- New layer additive under `src/v2/domain/**`, engine-reuse enforced by tests.
- Golden values are contract and are produced by existing engines:
  - K-201: risk 68, health 52, ~17.93 d, OEE 91.2%, value at stake $1,620,156,
    **projected $1,094,400**, realised unavailable.
  - Portfolio (ROTS): value at stake $2,304,156, **projected value enabled
    $1,449,400**, realised 0 / unavailable.
  - `$1,458,140` is **withdrawn** and must not appear in any surface, fixture, or test.

---

## 15. Final proposed TypeScript contracts (task C — for review, not yet written to `src/**`)

These are the exact Slice 2.1a contracts. They are illustrative signatures for
approval; no `src/**` file has been created.

**15.1 Source mode & freshness (orthogonal axes)**

```ts
// reused, NOT redefined — SourceKey from src/domain/integration.ts
import type { SourceKey } from "@/domain/integration";

// NEW, minimal — src/v2/domain/freshness-state.ts
export type FreshnessState = "fresh" | "stale" | "missing" | "unknown";

export interface FreshnessInput {
  sourceKey: SourceKey;          // selects the freshness.v1 window
  capturedAt: string | null;     // evidence timestamp; null => missing
  asOf: string;                  // REQUIRED, explicit (= ANCHOR_NOW); never Date.now()
}

// Pure. Accepts only sourceKey / capturedAt / asOf. Never returns "synthetic";
// never infers source mode, integration state, or provenance.
export function resolveFreshness(input: FreshnessInput): FreshnessState;
```

```ts
// src/v2/domain/policy/freshness.ts  — named, versioned window table
export const FRESHNESS_POLICY_VERSION = "freshness.v1" as const;
export const FRESHNESS_WINDOWS_MS: Readonly<Record<SourceKey, number>> = {
  historian: 15 * 60_000,          // condition/sensor: 15 minutes
  // production/OEE, cmms, inventory, procurement, turnaround_scheduling,
  // financial/derived: 24 * 60 * 60_000
  /* … 24h entries … */
};
```

**15.2 Trust classification (derived-only mapping)**

```ts
// src/v2/domain/trust.ts
import type { Provenance } from "@/domain/enums";
// Provenance = "measured" | "deterministic" | "business_rule"
//            | "statistical" | "ai_generated" | "human"

export type TrustClassification =
  | "measured_fact"              // measured
  | "deterministic_calculation" // deterministic | business_rule
  | "prediction"                // statistical
  | "ai_explanation"            // ai_generated
  | "human_decision"            // human
  | "unknown";                  // fail-safe for unexpected input

// Pure, total, deterministic. Recognises supported Provenance values; returns
// "unknown" for anything else (never throws). Derived only: never persisted,
// never authoritative input. Typed honestly to admit boundary runtime input:
export function trustFromProvenance(value: Provenance | unknown): TrustClassification;
```

**15.3 ValueEnvelope (immutable)**

```ts
// src/v2/domain/envelope.ts
import type { SourceMode } from "@/context/types";       // "local" | "snowflake"
import type { Provenance } from "@/domain/enums";
import type { FreshnessState } from "./freshness-state";
import type { TrustClassification } from "./trust";

export type EnvelopeStatus = "available" | "unavailable";

// As built: a discriminated union on `status`, so an unavailable value always has
// value === null AND a non-empty reason, and an available value never carries one.
export interface ValueEnvelope<T> {
  readonly id: string;                      // identity of THIS version
  readonly version: number;                 // monotonic; supersede => +1
  readonly supersedesId: string | null;     // forward-only link to the replaced version
  readonly status: EnvelopeStatus;
  readonly value: T | null;                 // null when unavailable (never 0/fabricated)
  readonly unavailableReason?: string;      // required & non-empty when unavailable
  readonly trustClassification: TrustClassification; // DERIVED; never a caller input
  readonly provenance: Provenance;
  readonly sourceMode: SourceMode;          // how/where sourced (local|snowflake)
  readonly freshness: FreshnessState;       // temporal, relative to asOf (separate axis)
  readonly formulaVersion: string;          // e.g. "projected-value-enabled@v1"
  readonly evidenceIds: readonly string[];
  readonly asOf: string;                    // = ANCHOR_NOW
  readonly capturedAt: string | null;
  readonly producedAt: string;
  readonly createdByEventId: string;
}
// NOTE: there is deliberately NO `integrationState` field (integration health is a
// separate source/integration assessment) and NO `supersededByEventId` — a prior
// envelope is never backward-stamped. Whether a version has been superseded is
// derived from the successor relationship in the append-only ledger (Slice 2.1c).

// Pure constructors — no calculation logic, no mutation of prior versions.
export function makeEnvelope<T>(init: /* … */ unknown): ValueEnvelope<T>;
export function supersede<T>(prev: ValueEnvelope<T>, next: /* … */ unknown): ValueEnvelope<T>; // returns NEW; prev unchanged
export function markUnavailable<T>(prev: ValueEnvelope<T>, reason: string, opts: /* … */ unknown): ValueEnvelope<T>; // value=null, status="unavailable"
export function isAvailable<T>(e: ValueEnvelope<T>): boolean; // type guard
// There is no `markSuperseded` helper: a second, divergent copy of a prior version
// must never exist.
```

**Immutability as built.** The envelope object is frozen and `evidenceIds` is
defensively copied and frozen. The generic payload `T` is stored **by reference**
— it is neither cloned, deep-frozen nor mutated — so deep immutability of `T` is
**not** claimed and caller-owned payload objects remain caller-owned.

**No-duplication confirmation (task D):** `SourceMode` (`local|snowflake`),
`IntegrationState`, `SourceKey`, `SourceState`, `Provenance`, `ValueStatus`, and
`DataFreshness` (`live|recent|stale|offline`) are all **left unchanged**, and
imported where actually used (2.1a imports `SourceMode`, `Provenance` and
`SourceKey`; `IntegrationState` and `ValueStatus` are referenced by the wider
model but are not envelope fields). `sourceMode` uses the existing `SourceMode`
(not `IntegrationState`,
which would reintroduce the orthogonality problem). Only three genuinely new, minimal
types are introduced — `FreshnessState` (value-temporal, adds `missing`/`unknown`
absent from `DataFreshness`), `FreshnessClass` (the `freshness.v1` policy selector)
and `TrustClassification` (derived presentation
mapping) — each justified in §10.3 and §4 C1.
