# Asset Supervision OS — Implementation Plan

> A phased plan with explicit, checkable acceptance criteria. Phase 1 is
> complete; Phases 2–4 are planned. Each phase is designed so the app keeps
> running with no credentials (local + mock) throughout. All data remains
> **synthetic**.

Related: [`ARCHITECTURE.md`](./ARCHITECTURE.md),
[`METRIC_DEFINITIONS.md`](./METRIC_DEFINITIONS.md),
[`DATA_DICTIONARY.md`](./DATA_DICTIONARY.md).

---

## Phase 1 — Deterministic core & vertical slice ✅ DONE

**Goal:** a byte-for-byte reproducible, evidence-backed K-201 vertical slice
running fully offline (local data + mock AI), with the deterministic engines
under test.

**Scope delivered**

- Next.js 14 (App Router) + TypeScript + Tailwind scaffolding.
- Design tokens (`src/design-system/tokens.css`) wired to Tailwind
  (`tailwind.config.ts`) and base styles (`src/app/globals.css`).
- Domain model: `src/domain/enums.ts`, `src/domain/types.ts` (22 core entities +
  `Dataset`).
- Seeded, deterministic K-201 dataset (`SEED = 20260727`,
  `ANCHOR_NOW = 2026-07-27`) via `src/data/generate.ts` + memoised
  `src/data/seed.ts`.
- Deterministic engines: OEE (`src/engines/oee.ts`), risk
  (`src/engines/risk.ts`), ROTS (`src/engines/rots.ts`).
- Single shared analysis `src/data/k201-analysis.ts` (no drift between seed and
  render).
- Provider-neutral AI with offline mock default: `src/ai/types.ts`,
  `prompts.ts`, `providers/mock.ts`, `providers/openai-compatible.ts`,
  `index.ts`, `server-only` `service.ts`.
- Repository (`src/data/repository.ts`): `Repository` interface, `LocalRepository`,
  `getRepository()`, and view models (`CommandCenterModel`, `Asset360Model`,
  `RotsModel`, `TurnaroundSummary`).
- The five views (Operations Command Center, Asset 360, OEE Loss Intelligence,
  Turnaround Control Tower, AI Value & Token Economics) plus a `/design-system`
  reference route.
- Unit tests for all deterministic calculations (`oee.test.ts`, `risk.test.ts`,
  `rots.test.ts`, `k201-analysis.test.ts`) and a `seed:verify` script.

**Acceptance criteria (all met)**

- [x] `npm run dev` renders every view with **no** API key and **no** database.
- [x] Dataset is identical across runs/machines; `npm run seed:verify` passes.
- [x] OEE reproduces the canonical example (A=P=Q=0.9 → OEE 0.729; loss tree
      100 / 90 / 81 units) — asserted in `oee.test.ts`.
- [x] `aggregateOee` sums minutes/units before ratios (time-weighted roll-up),
      not an average of OEEs — asserted.
- [x] Risk engine reproduces documented health/probability/consequence/riskScore,
      severity bands (≥70/45/25/10), and disposition rules — asserted in
      `risk.test.ts`.
- [x] K-201 risk/OEE/exposure shown in Asset 360 equal the seeded recommendation
      (single shared `analyzeK201`) — asserted in `k201-analysis.test.ts`.
- [x] ROTS keeps projected vs realised strictly separate; realised counts only
      `valueStatus === "realised"` with non-null `realisedValue`; all ratios
      return `null` on zero denominators — asserted in `rots.test.ts`.
- [x] Mock AI output is deterministic and grounded only in supplied evidence;
      no provider is imported by UI; model calls originate only in `service.ts`
      (`server-only`).
- [x] `AI_PROVIDER=nvidia|dgxspark` with blank keys fails safe to mock.
- [x] `npm run lint`, `npm run typecheck`, and `npm run test` are green.

---

## Phase 2 — Snowflake data source at scale

**Goal:** run the same views against Snowflake without changing UI or engines, and
seed the warehouse with high-volume synthetic data.

**Scope**

- Implement the existing `Repository` interface against Snowflake
  (`DATA_SOURCE=snowflake`), returning the identical view models. `LocalRepository`
  remains the default/offline fallback.
- Snowflake-compatible SQL migrations for all 22 entities (DDL matching the
  [Data Dictionary](./DATA_DICTIONARY.md) field names/types), with keys and
  indexes.
- Python high-volume synthetic data generator that populates Snowflake with
  many plants/lines/assets/readings while preserving the deterministic K-201
  hero slice.
- Connection config and credentials via environment variables only.

**Acceptance criteria**

- [ ] `DATA_SOURCE=snowflake` renders all five views with numbers reconciling to
      the same engines; `DATA_SOURCE=local` still runs with no credentials.
- [ ] No changes required in `src/app`, `src/engines`, or view-model consumers to
      switch data source (interface parity proven).
- [ ] SQL migrations create every entity and load without error on Snowflake; a
      documented `migrate` + `seed` command exists.
- [ ] Python generator produces ≥ N plants / ≥ M assets / ≥ K sensor readings
      (target volumes documented) and reproduces the K-201 slice values.
- [ ] Query performance for Command Center and Asset 360 meets a documented
      latency budget on the high-volume dataset.
- [ ] Engine parity test: OEE/risk/ROTS over Snowflake rows equal the local
      results for K-201.
- [ ] No secrets committed; Snowflake credentials read from `process.env`.

---

## Phase 3 — Live models, prompt persistence, approval write-back & audit

**Goal:** move from mock explanations to live NVIDIA / DGX Spark models, persist
prompts and decisions, and make the audit trail durable.

**Scope**

- Live integration of the NVIDIA and DGX Spark OpenAI-compatible providers
  through the existing `AiProvider` seam (no caller changes).
- Persist `prompt_versions` (from code to the datastore) with active-version
  selection and reproducibility.
- Approval write-back: `HumanDecision` and `OperationalOutcome` persisted, driving
  recommendation status transitions.
- Durable audit trail: every `AiInteraction` (provider, model, tokens, cost,
  latency, prompt version, evidence set) stored and queryable for ROTS.

**Acceptance criteria**

- [ ] With valid keys, `AI_PROVIDER=nvidia` / `dgxspark` produce grounded
      explanations via live endpoints; with blank keys the app fails safe to mock.
- [ ] Every stored `AiInteraction` references a persisted `PromptVersion`; the
      exact prompt used is reproducible.
- [ ] Approve / reject / modify persists a `HumanDecision` and updates
      recommendation `status`; realised outcomes update ROTS realised value.
- [ ] Realised value is still gated on `valueStatus === "realised"`; projected is
      never written as realised.
- [ ] Audit trail is queryable end to end (recommendation → evidence →
      interaction → decision → outcome).
- [ ] No model call is made without an explicit API key; keys never reach the
      client bundle (server-only enforced).
- [ ] lint / typecheck / test remain green; live calls are covered by mocked
      integration tests.

---

## Phase 4 — Condition monitoring at scale, deeper turnaround logic & RBAC

**Goal:** scale beyond the single hero asset and add role-based governance.

**Scope**

- Multi-asset condition monitoring: per-asset channel assessment, event
  detection, and risk scoring across the full asset population (not just K-201).
- Deeper turnaround logic: dependency-aware scheduling (`WorkPackageDependency`
  finish-to-start / start-to-start / finish-to-finish with lag), critical-path
  computation, and readiness roll-ups.
- RBAC: role-scoped access and approval authority (reliability engineer,
  planner, turnaround manager, leadership) with enforced decision permissions.

**Acceptance criteria**

- [ ] Condition/risk pipeline runs for every asset; Command Center attention list
      reflects real multi-asset risk (not hard-coded to the hero).
- [ ] Critical-path and readiness are computed from `WorkPackageDependency` and
      package readiness, and reconcile with `TurnaroundSummary`.
- [ ] RBAC prevents unauthorised approvals; every decision records the accountable
      role and is enforced server-side.
- [ ] Performance targets met at the Phase-4 asset volume (documented budgets).
- [ ] Provenance, "never colour alone", and the AI trust pattern hold across all
      new surfaces.
- [ ] lint / typecheck / test green, including scale and RBAC tests.

---

## Cross-cutting invariants (all phases)

- The app always runs with **no credentials** via local data + mock AI.
- Determinism of the K-201 slice (fixed `SEED` + `ANCHOR_NOW`) is preserved.
- UI never imports an AI provider; model calls originate only in the `server-only`
  service.
- Projected value is never presented as realised.
- All secrets are environment variables; nothing sensitive is committed.
- All data is synthetic.
```
