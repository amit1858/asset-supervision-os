# V2 Phase 2 — Governed K-201 Vertical (Implementation Plan)

Status: **Planning checkpoint** · Branch: `copilot/v2-phase-2-k201-planning`
(from Phase 1 commit `08370a5`)
Scope of this document: **planning only.** No customer-facing source, engine,
repository, route, or dependency is changed in this checkpoint. This plan is the
scope contract for the Phase 2 build that follows; it is authored against the
foundations that already exist and invents no metrics, APIs, or integrations.

---

## 1. Objective

Turn the honest Phase 1 placeholders into the **first complete, governed vertical
slice** — the K-201 hydrogen-recycle-compressor story — end to end across the
Signal → Value operational thread, reusing every existing engine and repository.
Phase 2 delivers depth on a small number of surfaces, not breadth across all
thirteen. K-201 is the reference story; the components must remain
**asset-agnostic and data-driven** (blueprint decision §6).

The vertical must let a user follow K-201 from a condition signal to a human
decision, a planned work order, spare readiness, turnaround linkage, and realised
value — while retaining plant, unit, asset, time-range, and decision context.

## 2. Non-negotiable guardrails (carried from Phase 0–1 decisions)

- **Presentation layer only.** New depth consumes existing domain types,
  repository, deterministic engines, persona registry, capability model, Chief of
  Staff service, and voice API. No business logic is copied into components
  (blueprint §11, decision §3).
- **No customer-facing v1 change.** v1 routes remain the production experience
  until an approved, route-by-route cut-over. Phase 2 stays under `/v2/**`.
- **Registry is the source of truth** for personas, navigation, capabilities, and
  authority. No second hard-coded navigation model (decision §3).
- **Context in the URL, persona/theme in cookies, ephemeral UI in client state**
  (decision §5). No authoritative operational state in browser storage.
- **Determinism preserved.** `seed:verify` must continue to report the protected
  K-201 values unchanged (see §9). No engine constant is retuned for visuals.
- **Governed actions only** (decision §7). The assistant and Chief of Staff may
  *recommend or prepare* an action; every operational action routes to the
  existing governed confirmation/approval control. No assistant-side approval,
  autonomous execution, CMMS/inventory/Snowflake mutation, or write-back.
- **Honest source posture.** Each surface continues to declare `seeded` /
  `derived` / `not_connected`; unavailable data is labelled, never faked. The
  measured / calculated / predicted / AI-generated / human-approved distinction
  stays visible.
- **AI value split** (decision §1). Value Realisation (plant manager) shows
  validated outcomes and projected-vs-realised value only. Token usage, provider
  cost, model runtime, and Return on Token Spend stay inside the AI Control Tower.
- **No new libraries, live APIs, Snowflake connection, or live speech.**

## 3. Reused foundations (no forking)

| Concern | Existing API to consume |
| --- | --- |
| Canonical asset record | `getRepository().getAsset360(tag)` → `Asset360Model` |
| Deterministic risk | `computeRisk(...)`, `linearSlope(...)` (`src/engines/risk.ts`) |
| OEE & loss / exposure | `computeOee`, `aggregateOee`, `financialExposure` (`src/engines/oee.ts`) |
| Return on Token Spend | `computeRots`, `estimateModelCost`, `usageByProvider` (`src/engines/rots.ts`) |
| K-201 scenario analysis | `analyzeK201(...)` (`src/data/k201-analysis.ts`) |
| Chief of Staff brief | `buildPersonaBrief(personaId, ctx)` (`src/brief/service.ts`) |
| Asset classification | `criticalityOf`, `conditionStatusOf`, `isInCriticalCondition` |
| Dataset / determinism | `getDataset()`, `buildDataset(seed)`, `getRepository()` |
| Shell, context, thread, assistant | Phase 1 `src/components/v2/*`, `src/v2/*`, `OperationalContext`, `VoiceProvider` |

Each `V2_ROUTES[].phase2` string in `src/v2/routes.ts` remains the per-surface
scope contract; this plan sequences and grounds those contracts.

## 4. Delivery order (thin vertical first, then fan out)

Phase 2 is sequenced so the K-201 thread is walkable end-to-end as early as
possible, then the owning persona homes are deepened around it.

1. **2.1 — Asset 360 (`/v2/assets/[tag]`)** — the spine of the vertical.
2. **2.2 — Reliability Command Center (`/v2/reliability`)** — the decision surface.
3. **2.3 — Planning Workbench (`/v2/planning`) + Material Exceptions
   (`/v2/materials`)** — execution readiness and spare availability for K-201.
4. **2.4 — Value Realisation (`/v2/value-realisation`)** — projected-vs-realised
   value for the K-201 decision (plant-manager, value split enforced).
5. **2.5 — Cross-thread continuity pass** — verify context and the Signal→Value
   thread stay intact across the four surfaces above.

Remaining persona homes and shared surfaces (shift, watchlist, turnaround,
agent-control, oee, portfolio, turnaround-candidates) stay as Phase 1
placeholders until a later phase; they must not regress.

## 5. Surface-by-surface plan

### 2.1 Asset 360 — `/v2/assets/[tag]` (owner: Reliability Engineer)
- **Job:** the canonical asset record — identity, condition, the Signal→Value
  thread, and the governed recommendation.
- **Build (from `Asset360Model`):** identity/status header (tag, name, criticality,
  condition), Signal→…→Value timeline, sensor trend(s), deterministic risk and
  projected time-to-critical, condition events, linked work orders, spare posture,
  the recommendation **with AI rationale clearly labelled as AI-generated**, the
  human decision state, and any linked turnaround package.
- **Governance:** the recommendation is a proposal; the only action affordance is
  the existing governed **review/approve** route. Access gated by
  `view_asset_condition` (already enforced).
- **Data honesty:** fields the seed does not populate render as explicitly
  unavailable, not zero.

### 2.2 Reliability Command Center — `/v2/reliability` (owner: Reliability Manager)
- **Job:** decisions requiring attention, time-critical risks, execution
  readiness, and production impact.
- **Build:** approval queue (K-201 decision first), time-critical risk list,
  maintenance readiness, material exceptions summary, emerging turnaround
  candidates, and OEE impact — each row linking into the relevant surface with
  context preserved.
- **Governance:** approve/modify/reject routes to the existing governed control;
  the brief may prepare but not approve.

### 2.3 Planning Workbench + Material Exceptions
- **Planning (`/v2/planning`, Maintenance Planner):** approved work to plan,
  job-plan readiness, parts-constrained orders, schedulable-this-week, execution
  blockers. Prepared actions (reserve spare / prepare work order) route to the
  governed confirmation only.
- **Materials (`/v2/materials`, Materials Coordinator):** material-blocked work,
  critical spares below reorder, open expedites, reservations against upcoming
  work. The K-201 "dry gas seal not in stock" blocker is the reference thread.
- **Governance:** no inventory mutation, no write-back; expedite/reserve are
  prepared-only and confirmed through the existing control.

### 2.4 Value Realisation — `/v2/value-realisation` (owner: Plant Manager)
- **Job:** validated outcomes and realised value, separated from projected value.
- **Build:** validated outcomes, decisions supported, projected-vs-realised value,
  and outstanding validation for the K-201 decision. Realised value stays
  explicitly unavailable until a validated outcome exists (`realisedAvailable`).
- **Value split:** **no token, cost, model-runtime, or ROTS content here** — those
  remain in the AI Control Tower (decision §1). Gated by `view_value_realisation`.

### 2.5 Cross-thread continuity
- Walk K-201 across 2.1–2.4 confirming plant/unit/asset/time-range/decision
  context and the active thread stage persist, and that persona switches change
  the view but never authority.

## 6. Shared interaction patterns to reuse/extend

Tables/queues, record + detail-panel, timeline, evidence disclosure, status
chips (operational meaning only), the governed recommendation card, and the
proposed-action → governed-confirmation seam. Prefer shared tokens/layout over
route-specific CSS. Extend registry metadata only if a genuinely new navigation
attribute is required (decision §3).

## 7. Accessibility & responsive

Desktop-first, fully usable at 1024px; keyboard and focus behaviour consistent
with the Phase 1 shell (the persona-selector focus contract fixed in Phase 1.1 is
the baseline). Selected/hover/focus/disabled/stale/offline/restricted states
explicit; tabular numerals for operational metrics; status conveyed by text +
tone, never colour alone. Light/dark parity maintained.

## 8. Testing & QA strategy

- **Pure logic first:** any new `src/v2/*` selector/derivation ships with node
  `*.test.ts` (the existing harness, no jsdom). Keep shell-guard invariants (no
  `PersonaId` string literals, no external URLs in shell components).
- **Determinism:** `seed:verify` unchanged; add assertions that read from the
  engines rather than hard-coding values in components.
- **Visual QA:** extend `scripts/qa-v2-shell.mjs` (Edge `channel:"msedge"`) to
  cover the newly-deepened surfaces; keep `qa:v2:http` green. Screenshots stay
  under `qa/**` (gitignored).
- **Full baseline each gate:** `typecheck`, `lint`, `test`, `seed:verify`,
  `build`, `qa:v2`, `qa:v2:http`.

## 9. Protected determinism (must remain unchanged)

K-201: risk **68**, health **52**, projected **~17.93 days** to critical, OEE
**91.2%** (A 97.9 / P 93.9 / Q 99.1), total exposure **$1,620,156**, disposition
**immediate / high**. Value split: `valueAtStake` and `projectedEnabled` shown;
`realised` stays unavailable until validated. Protected commits `94a89d0` /
`559d89a` and the Phase 1 branch remain untouched.

## 10. Acceptance criteria for Phase 2

- K-201 is walkable end-to-end across 2.1–2.4 with context and thread preserved.
- Every surface reads from the existing engines/repository; no fabricated metric.
- All prepared actions route to the existing governed confirmation; no write-back.
- AI value split honoured (no economics outside the AI Control Tower).
- Determinism and protected values unchanged; full baseline + Edge visual QA green.
- No v1/customer-facing source changed; no PR/merge/deploy in the build phase
  until explicitly approved.

## 11. Risks & open decisions

- **Seed depth vs. K-201:** the seed is richest for K-201; multi-asset surfaces
  must still render honestly (labelled unavailable) without asset-tag conditionals
  in generic components.
- **Governed-action routing target:** confirm the exact existing confirmation
  route each prepared action should link to before building 2.3.
- **Scope of 2.x per gate:** whether Planning and Materials (2.3) ship together or
  as two gates — recommend together to keep the K-201 blocker thread coherent.
- **Out-of-scope v1 polish** (favicon 404, brief count pluralisation) remains
  deferred and must not be pulled into Phase 2.
