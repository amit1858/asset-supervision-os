# Chief of Staff

The **Chief of Staff** is the briefing/orchestration layer that sits above each
persona's workspace. This document describes it as implemented in
`src/brief/types.ts` (the typed structures) and `src/brief/service.ts` (the
deterministic `buildPersonaBrief` assembler), and rendered by
`src/components/brief/MyBrief.tsx` inside `src/components/landing/LandingLayout.tsx`.

## What it is (and is not)

The Chief of Staff is a **role-aware briefing/orchestration LAYER above each
persona's workspace**. It is:

- **NOT a persona** — it does not appear in `PERSONA_ORDER` and holds no
  capabilities of its own.
- **NOT a chatbot** — there is no conversational surface; it renders a structured,
  governed brief.
- **NOT a source of truth** — it *prioritises and assembles* facts that
  deterministic systems and source records already establish. The rendered header
  says as much: *"Chief of Staff (governed facts, not a source of truth)."*

Its job is to answer, per persona, *"what changed, what needs my attention, and
what should I do next"* — with every item traceable to evidence or an explicit
source status.

## The two landing layers

Each persona landing page is composed of two stacked layers
(`LandingLayout.tsx`):

1. **My Brief** — the Chief of Staff layer. A governed, persona-prioritised brief
   (`MyBrief.tsx`) built by `buildPersonaBrief(personaId, ctx)`.
2. **My Workspace** — the operational depth for that persona (the page's own
   content: queues, tables, metrics).

Internal persona-design content (primary questions, collaborating roles, expected
source systems, static "decisions you own") is intentionally **not** rendered in
either layer; its intent is realised through the brief and the workspace. See
`docs/PERSONAS.md`.

## Per-persona briefs

Every persona receives a differently **prioritised** view of the *same* governed
K-201 facts. Brief titles and review periods come from `PERSONA_BRIEF_CONFIG` in
`src/brief/service.ts`:

| Persona | Brief title | Period kind | "Since" label |
| --- | --- | --- | --- |
| Plant Manager | **Executive Morning Brief** | `day` | Since the previous leadership review |
| Operations Shift Supervisor | **Shift Opening Brief** | `shift` | Since the previous handover |
| Reliability Manager | **Reliability Daily Brief** | `daily_review` | Since the previous daily review |
| Reliability Engineer | **Asset Watch Brief** | `daily_review` | Since the previous daily review |
| Maintenance Planner | **Planning Brief** | `planning_cycle` | Since the previous planning cycle |
| Materials & Spares Coordinator | **Material Readiness Brief** | `material_review` | Since the previous material review |
| Turnaround Manager | **Turnaround Readiness Brief** | `readiness_review` | Since the previous readiness review |
| AI Control Tower Administrator | **AI Operations Brief** | `operational_review` | Since the previous operational review |

`BriefPeriodKind` is the closed union `day | shift | daily_review |
planning_cycle | material_review | readiness_review | operational_review`.

## Typed structures

All structures are defined in `src/brief/types.ts` (`SourceState` in
`src/domain/integration.ts`, `Provenance` in `src/domain/enums.ts`).

### `PersonaBrief`

The top-level object returned by `buildPersonaBrief`.

| Field | Type | Meaning |
| --- | --- | --- |
| `personaId` | `PersonaId` | The persona this brief is prioritised for. |
| `title` | `string` | e.g. "Reliability Daily Brief". |
| `assetTag` | `string \| null` | The asset thread the brief is anchored to (defaults to the K-201 hero). |
| `period` | `BriefPeriod` | The review window. |
| `summary` | `BriefSummary` | Headline + bullet points. |
| `changes` | `BriefChange[]` | What changed since the last review. |
| `actions` | `BriefAction[]` | Prioritised, capability-gated actions. |
| `decisions` | `BriefDecision[]` | Decisions awaiting this persona's authority. |
| `blockers` | `BriefBlocker[]` | Blockers and their dependencies. |
| `riskValue` | `BriefRiskValue[]` | Risk/value context tiles (each with provenance). |
| `sources` | `SourceState[]` | Source freshness/availability for the brief. |
| `unavailableSections` | `string[]` | Sections that cannot be produced because a source is unavailable. |
| `generatedAt` | `string` | When the brief was assembled. |

### `BriefPeriod`

| Field | Type | Meaning |
| --- | --- | --- |
| `kind` | `BriefPeriodKind` | The review cadence. |
| `sinceLabel` | `string` | e.g. "Since previous handover". |

### `BriefSummary`

| Field | Type | Meaning |
| --- | --- | --- |
| `headline` | `string` | One-line summary of the situation. |
| `points` | `string[]` | Supporting bullet points. |

### `BriefChange`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `string` | Stable id. |
| `summary` | `string` | What changed. |
| `detail?` | `string` | Optional elaboration. |
| `evidence` | `BriefEvidence[]` | Backing evidence (always present). |

### `BriefAction`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `string` | Stable id. |
| `title` | `string` | The action to take. |
| `why` | `string` | Rationale. |
| `dueBy` | `string \| null` | Due date, if any. |
| `owner` | `BriefOwner \| null` | Accountable owner. |
| `consequenceOfInaction` | `string \| null` | What happens if ignored. |
| `capability` | `Capability \| null` | Capability required to perform the action; gates the control. `null` = always shown. |
| `href` | `string \| null` | Deep link to act. |
| `priority` | `number` | Sort order (ascending). |
| `evidence` | `BriefEvidence[]` | Backing evidence. |

### `BriefDecision`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `string` | Stable id. |
| `title` | `string` | The decision. |
| `owner` | `BriefOwner` | Decision owner. |
| `dueBy` | `string \| null` | Due date, if any. |
| `valueAtStakeUsd` | `number \| null` | Value at stake. |
| `disposition` | `string \| null` | Recommended disposition, if any. |
| `requiresCapability` | `Capability` | Only personas holding this capability receive the decision to make. |
| `href` | `string \| null` | Deep link to review & approve. |
| `evidence` | `BriefEvidence[]` | Backing evidence. |

### `BriefBlocker`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `string` | Stable id. |
| `summary` | `string` | The blocker. |
| `dependency` | `string` | What it depends on (e.g. "Procurement / Inventory"). |
| `detail?` | `string` | Optional elaboration. |
| `evidence` | `BriefEvidence[]` | Backing evidence. |

### `BriefEvidence`

The single governed fact backing a brief item — always traceable.

| Field | Type | Meaning |
| --- | --- | --- |
| `label` | `string` | What the fact is. |
| `value` | `string` | Its value. |
| `provenance` | `Provenance` | How the fact was produced (see trust boundaries). |
| `sourceType` | `string` | The originating source/engine. |
| `href?` | `string` | Optional deep link to the evidence. |
| `observedAt?` | `string \| null` | When it was observed. |

### `BriefOwner`

| Field | Type | Meaning |
| --- | --- | --- |
| `name` | `string` | Owner name. |
| `role` | `string` | Owner role. |

### `BriefRiskValue`

| Field | Type | Meaning |
| --- | --- | --- |
| `label` | `string` | Metric label. |
| `value` | `string` | Formatted value. |
| `provenance` | `Provenance` | How the value was produced. |

### `SourceState` (source status)

From `src/domain/integration.ts`. Presents source **availability** as an explicit
state — never as a metric value.

| Field | Type | Meaning |
| --- | --- | --- |
| `key` | `SourceKey` | `historian \| cmms \| shift_log \| procurement \| inventory \| turnaround_scheduling \| ai_runtime \| local_seed`. |
| `label` | `string` | Human label (e.g. "Historian / PI", "CMMS / EAM"). |
| `state` | `IntegrationState` | `connected \| partial \| not_connected \| stale \| error \| synthetic`. |
| `note?` | `string` | Optional note. |

`defaultSourceStates(keys)` marks `local_seed` as **`synthetic`** and every
external system as **`not_connected`** — the Phase 2A reality. `sourceHasData`
treats `connected`, `partial`, and `synthetic` as able to supply factual records.

## Trust boundaries

The brief exists to keep the trust model explicit:

- **Deterministic systems establish facts.** Risk engines and exact calculations
  produce governed values.
- **Source systems provide records.** CMMS, historian, ERP, procurement, etc.
  supply operational records — and their availability is stated, not faked.
- **The brief prioritises governed facts.** `buildPersonaBrief` re-orders and
  filters existing facts per persona; it does not originate them.
- **An LLM may summarise, but is not the source of truth.** Natural-language text
  is one provenance among several and never replaces the underlying fact.
- **Every brief item links to evidence or a source status.** `BriefEvidence` is
  attached to changes, actions, decisions, and blockers; `sources`/`SourceState`
  cover availability. Nothing is fabricated.
- **Unavailable source-dependent sections are labelled.** When a source cannot
  supply a section, it is listed in `unavailableSections` (e.g. "Shift OEE /
  availability — shift-grain production data not connected") rather than shown as
  a blank or invented number.
- **Observed facts, calculated risk, forecast, recommendation, and AI narrative
  are kept separate.** This is carried by `Provenance`: `measured` (observed data),
  `deterministic` (exact calculation), `business_rule` (rule/threshold),
  `statistical` (forecast/trend extrapolation), `ai_generated` (LLM narrative),
  and `human` (human judgement). The UI tags each value with its provenance.

## How `buildPersonaBrief` enforces this (Phase 2A)

`buildPersonaBrief(personaId, ctx)` renders a **deterministic K-201 brief from
seeded data** — persona-prioritised, provider-neutral, and requiring no
credentials:

- **Facts come from the repository**, not the model: `getAsset360("K-201")`,
  `getRots()`, and `getCommandCenter()`. Recommendation evidence is mapped 1:1
  into `BriefEvidence` (traceable to `/assets/K-201`).
- **Shared facts, per-persona prioritisation.** A single catalogue of
  evidence-backed changes, actions, decisions, blockers, and risk/value tiles is
  assembled; `PERSONA_BRIEF_CONFIG` selects and orders which items each persona
  sees.
- **Actions are filtered to the persona's capabilities.** An action appears only
  when `a.capability === null || personaCan(personaId, a.capability)`.
- **Decisions reach only authorised personas.** A decision appears only when
  `personaCan(personaId, d.requiresCapability)`. For example, the K-201
  intervention decision requires `approve_reliability_decision`, so only the Plant
  Manager and Reliability Manager receive it to make.
- **Sources are declared, not assumed.** `sources` comes from
  `defaultSourceStates(config.sourceKeys)` — `local_seed` synthetic, everything
  else not connected — and source-dependent gaps are surfaced through
  `unavailableSections`.
- **Provider-neutral, no credentials.** All actual AI activity uses the offline
  mock explainer at $0; NVIDIA/DGX figures in the brief are labelled estimated
  scenarios, never realised value. Realised value stays unavailable until an
  outcome is validated.
