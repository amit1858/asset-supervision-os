# Phase 2A Checkpoint — Persona Shell & Governed Briefing Foundation

Status: **approved**. This checkpoint captures the state committed as
`feat: complete persona shell and governed briefing foundation`.

All data is synthetic and deterministic (`SEED = 20260727`). No external providers, persistence,
or write-back are enabled.

---

## Delivered scope

### Phase 1 (foundation, carried in this checkpoint)
- Deterministic engines: OEE, asset risk, Return on Token Spend (`src/engines`), unit-tested.
- Seeded K-201 dataset and repository layer (`src/data`), Snowflake-compatible DDL for all 22
  entities (`db/migrations/snowflake/001_core_schema.sql`).
- Provider-neutral AI (`src/ai`: mock | nvidia | dgxspark) behind a `server-only` service;
  UI never calls a model.
- Design system (CSS-variable tokens, **light + dark themes**, status/provenance model,
  accessibility) and the connected views.

### Phase 2A (this phase)
- **Persona architecture.** Central typed registry of 8 personas; **21 capabilities** with an
  `authority` flag; a `PersonaAuthorizationProvider` seam (demo = unrestricted). Capability
  checks (`personaCan` / `useCan` / `Can` / `RestrictedAction`), never persona-name
  conditionals.
- **Enterprise shell.** Two-tier header (enterprise-blue/deep-navy TopBar + ContextBar) as one
  sticky region; measured `--shell-header-h` with a CSS first-paint fallback; 224px sidebar;
  collapsible search; persona selector with preserved accessible name; compact theme control.
- **Shared operational context** (persona, plant, unit, asset, time range, shift, route, source,
  freshness), cookie-persisted, with cross-persona **asset-thread preservation**.
- **Chief of Staff briefs.** `My Brief` + `My Workspace` on every landing; deterministic,
  persona-prioritised, evidence-linked, with source freshness and labelled unavailable sections.
- **Governed voice foundation.** Panel with the full state lifecycle; grounding on a
  `server-only` truth boundary via `POST /api/voice/brief-conversation`; proposed-action
  confirmation routed to existing approval controls; deterministic mock provider; honest,
  unconnected mock microphone (no permission, no capture, no audio).
- **Corrections folded in.** Reconciling Command Center counts; criticality-vs-condition
  separation; shift-grain vs 30-day benchmark; actual-vs-estimated AI accounting with realised
  value gated on validated outcomes; business-readable labels; enterprise visual pass.

---

## Architecture decisions

1. **Server truth boundary.** `buildPersonaBrief`, the seeded dataset, the repository, and the
   voice conversation provider are `import "server-only"`. The client bundle contains none of
   them (verified by a static dependency-graph test and by grepping `.next/static`). Voice
   grounds only over the API.
2. **Fail closed.** The voice endpoint validates request size + Zod schema, ignores unknown
   keys (so client `authority`/`capabilities` claims are discarded), resolves persona and
   capability server-side, and returns 4xx on invalid persona, unauthorized persona, unknown
   asset, or missing question. Missing evidence returns an explicit unavailable response — never
   fabrication.
3. **Never autonomous.** Voice converts operational requests into proposed actions; the only
   confirmation path remains the existing capability/approval controls. No action is executed
   or recorded as completed.
4. **Data-driven personas.** Navigation, capabilities, KPIs, landing routes, brief prioritisation,
   and voice suggestions all derive from the persona registry.
5. **Measured, stable shell.** One sticky region; sidebar offset from a measured CSS variable
   with a viewport-aware fallback so first paint has no overlap and no layout shift
   (CLS < 0.05); ResizeObserver refines with a change-guard and unmount cleanup.
6. **Provenance & value discipline.** Every figure is tagged (measured/calculated/business-rule/
   predicted/AI/human). Projected and realised value are separate; realised value is unavailable
   until a validated outcome exists.
7. **Determinism.** Fixed `SEED` + `ANCHOR_NOW`; the whole demo (including briefs and voice
   answers) is byte-for-byte reproducible. `seed:verify` runs under the `react-server` condition
   so `server-only` modules load in the Node script.

---

## Verification results

| Gate | Result |
| --- | --- |
| `npm run typecheck` (strict) | Pass |
| `npm run lint` | Pass (0 warnings/errors) |
| `npm test` | **125 passed / 125** (18 files) |
| `npm run seed:verify` | `deterministic: true` · K-201 story numbers intact |
| `npm run build` | Pass (App Router, incl. `POST /api/voice/brief-conversation`) |
| Client bundle audit | Seed data + `buildPersonaBrief` absent from `.next/static` |
| Playwright — hardening | 20/20 assertions, 0 console errors, CLS < 0.05, sidebar flush |
| Playwright — voice polish | 42/42 assertions, 0 console errors/warnings |

Test coverage highlights: deterministic engines (OEE/risk/ROTS), K-201 analysis, reconciling
Command Center counts, criticality-vs-condition, shift-grain guard, integration/source states,
AI inference-vs-agent terminology, persona definitions/capabilities/routing, brief grounding
and per-persona prioritisation, voice server-service fail-closed + determinism + serialization,
voice client dependency-graph boundary, business-readable display, and theme token compliance.

---

## Known limitations (not yet enabled)

- **No live voice/speech.** The microphone is a demo affordance only — no Web Speech, NVIDIA
  Riva, recording, or audio storage. `SpeechInput/Output` interfaces are ready for a live
  provider.
- **No external model calls.** Mock provider only; NVIDIA/DGX are priced *estimated scenarios*,
  never actual activity.
- **No persistence / write-back.** Approvals and voice-proposed actions are surfaced for human
  confirmation but are not persisted, and nothing writes back to CMMS/ERP/turnaround systems.
- **No database.** The repository runs on the in-memory seed; Snowflake DDL exists but no
  connection is wired.
- **Single-asset briefs.** Briefs center on the seeded K-201 scenario; multi-asset briefs and
  true "since last review" deltas need a temporal event store.
- **Focus containment** in the overlay uses a Tab-cycling handler + scrim rather than native
  `inert` on the background.

---

## Planned Phase 2B direction

- Implement `SnowflakeRepository` against the existing `Repository` interface + migrations;
  move seeded data behind the datastore.
- Persist human decisions, outcomes, and audit trail; enable realised-value validation so
  realised ROTS becomes populated through a governed flow.
- Introduce a live `BriefConversationProvider` and `SpeechInput/Output` adapter behind the
  existing server boundary and capability checks (still human-confirmed, still non-autonomous).
- Broaden briefs to multi-asset with temporal change detection ("what changed since last
  review") backed by an event store.
- Expand the AI execution hierarchy (workflow/execution/step/tool-call) from typed
  placeholders toward real, governed agent runs — with tool calls behind adapters and human
  approval steps.
- RBAC-backed `PersonaAuthorizationProvider` deriving permitted personas from authenticated
  roles.

---

*No deployment, push, pull request, or external service connection is part of this checkpoint.*
