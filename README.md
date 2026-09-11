# Asset Supervision OS

**Physical Operations Intelligence** — an executive-grade, industry-neutral platform for
asset-heavy operations (refineries, process plants, manufacturing), demonstrated on a
synthetic refinery. It connects condition monitoring, OEE loss intelligence, turnaround
planning, and AI-value accounting into **one** persona-aware operational picture — not three
disconnected dashboards.

> **All data is synthetic.** Every plant, asset, sensor reading, cost, and recommendation is
> generated deterministically for demonstration. No real or proprietary company data is used.

> **Evidence-backed AI posture.** The deterministic governed narrator is implemented, is the
> default, and runs fully without credentials. NVIDIA structured narration is implemented and
> has produced grounded hosted responses, but endpoint reliability is not sufficient to make it
> the guaranteed demonstration path. The Azure AI Foundry adapter and contract tests are
> implemented; live Azure inference remains unverified. The OpenAI-compatible DGX Spark adapter
> is implemented; local model installation and live DGX inference remain pending.
>
> Provider output is advisory narration only. Deterministic/statistical engines calculate OEE,
> risk, time-to-critical, exposure, and value. Humans retain approval and endorsement authority.
> Any unavailable, invalid, unsupported, or ungrounded provider response is discarded and
> replaced by the deterministic governed narrative. No operational write-back is enabled.
>
> Authenticated users may connect an NVIDIA API key in the current tab from the
> V2 header. The key remains in volatile page memory while navigating within the
> application and is sent only to authenticated same-origin server routes when
> testing or requesting narration. Reloading or closing the tab, signing out, or
> disconnecting clears it. Testing a key does not connect it. The key is never
> written to browser storage, cookies, the repository, or an environment file.
> The server confirms the current governed model through NVIDIA's `/v1/models`
> catalog before testing or narrating. Guest Demo remains deterministic and
> cannot connect a provider.

---

## Quickstart (deterministic local demo)

```bash
npm install
npm run dev
# open http://localhost:3000
```

No credentials are required. The app runs on a **local seeded dataset** with a **mock AI
provider** and an **offline mock voice** experience out of the box. Copy `.env.example` to
`.env.local` only if an operator wants environment-selected providers or Snowflake.
Authenticated users can instead connect NVIDIA session-scoped credentials from
the application without modifying environment configuration. No secrets are
ever committed.

`/` redirects to the **active persona's** landing page (default: Reliability Manager). Switch
personas from **"Viewing as…"** in the top bar; navigation, landing page, and the Chief of
Staff brief change immediately, and the active asset thread is preserved across the switch.

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server (http://localhost:3000) |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (next/core-web-vitals) |
| `npm test` | Vitest — deterministic engine/data/persona/voice tests |
| `npm run seed:verify` | Print the K-201 story numbers & confirm determinism |

---

## Personas

Eight typed personas drive navigation, capabilities, landing pages, and briefs from a central
registry (`src/personas/registry.ts`) — never from persona-name conditionals in components.
Persona selection is a **view** concern, not authentication; a `PersonaAuthorizationProvider`
seam will later restrict which personas an authenticated user may assume.

| Persona | Landing | Owns |
| --- | --- | --- |
| Plant Manager | `/plant-overview` | Plant Executive Overview, Value Realisation |
| Operations Shift Supervisor | `/shift` | Shift Command Center |
| Reliability Manager *(default)* | `/reliability` | Reliability Command Center, Asset Risk Portfolio, OEE, Turnaround Candidates |
| Reliability Engineer | `/watchlist` | Asset Watchlist, Asset 360 |
| Maintenance Planner | `/planning` | Planning Workbench |
| Materials & Spares Coordinator | `/materials` | Material Exceptions |
| Turnaround Manager | `/turnaround` | Turnaround Control Tower |
| AI Control Tower Administrator | `/agent-control` | Agent Control Tower (AI Runtime Activity, Value & Cost, Model Runtime) |

Authorization uses **21 capabilities** (`src/personas/capabilities.ts`). Components gate on
capabilities via `personaCan` / `useCan` / `Can` / `RestrictedAction` — actions are
**available**, **read-only with explanation**, or **hidden**. Switching persona never grants a
capability outside the selected persona's definition. See
[docs/PERSONAS.md](docs/PERSONAS.md),
[docs/PERSONA_CAPABILITY_MATRIX.md](docs/PERSONA_CAPABILITY_MATRIX.md), and
[docs/PERSONA_INFORMATION_ARCHITECTURE.md](docs/PERSONA_INFORMATION_ARCHITECTURE.md).

---

## Chief of Staff briefing model

Every persona landing has two layers: **My Brief** (Chief of Staff) and **My Workspace**
(operational depth). The Chief of Staff is a role-aware briefing/orchestration **layer** — not
a persona, chatbot, or source of truth. Deterministic systems establish facts; the briefing
service (`src/brief/service.ts`) **prioritises and assembles governed facts** per persona from
the same seeded data visible on screen.

Each brief answers: what changed, why it matters, what to do, who owns it, and when it is due —
with a compact metric strip, the primary decision/action, and a key blocker visible in the
first viewport. Every brief item links to **evidence** with **provenance** (measured /
calculated / predicted / AI-explained / human-decided) and **source freshness**; unavailable
source-dependent sections are labelled rather than fabricated. Different personas receive a
different **prioritisation of the same K-201 facts**. See
[docs/CHIEF_OF_STAFF.md](docs/CHIEF_OF_STAFF.md).

---

## Governed voice foundation

Voice is a **governed conversational interface over the same brief** — not a decorative
overlay. Two entry points: a header action ("Ask Asset Supervision OS") and "Discuss brief"
inside My Brief. The assistant docks beside the workspace at ≥1280px (content reflows, nothing
covered) and is a focus-trapped modal overlay below that.

- **One truth path, on the server.** Grounding runs only in a `server-only` service behind
  `POST /api/voice/brief-conversation`. The browser never bundles `buildPersonaBrief` or the
  seeded dataset (enforced by a dependency-graph test). The endpoint validates size + schema,
  resolves the authorised persona/capabilities server-side (client-supplied authority claims
  are ignored), and **fails closed** on invalid persona, unknown asset, malformed context, or
  authorization mismatch.
- **Never autonomous.** The assistant may summarise governed facts but cannot approve, modify,
  expedite, create work, or change operations. An operational request becomes a **proposed
  action** (target, consequence, required authority) that routes to the existing
  `RestrictedAction`/approval control for explicit human confirmation.
- **Provider-neutral & offline.** A deterministic mock conversation provider runs with no
  credentials; `SpeechInputProvider` / `SpeechOutputProvider` interfaces are in place for a
  future live provider. In this phase the microphone is **not connected**: selecting it neither
  requests permission nor fabricates a transcript — it shows an honest notice and returns focus
  to text/suggestions. No audio is captured or stored.

---

## The K-201 demonstration (hero case)

A critical hydrogen recycle compressor whose vibration and bearing temperature deteriorate over
90 synthetic days. The deterministic engines produce (reproducible from `SEED = 20260727`):

| Signal | Value |
| --- | --- |
| Overall vibration (latest) | **8.99 mm/s** (warning 7.1, critical 11.2) |
| Bearing temp DE (latest) | **91.4 °C** (warning 85) |
| Risk score / health | **68 / 100** · health **52 / 100** |
| Projected time-to-critical | **~18 days** → precedes 21-day repair lead time |
| Recommended disposition | **Immediate** (deterministic rule) |
| 30-day unit OEE | **91.2%** (A 97.9 / P 93.9 / Q 99.1) |
| Financial exposure | **$1,620,156** |

The AI layer only **explains** these numbers, grounded in evidence, and every recommendation
**requires human approval** — never an autonomous action.

---

## Architecture summary

```
Presentation — App Router pages · persona-aware shell (TopBar + ContextBar + SideNav)
   │  server components pass data in; the browser never calls a model or grounds a brief
Personas & capabilities  (src/personas — registry, capabilities, authorization seam)
Chief of Staff briefs    (src/brief — server-only service assembles governed facts)
Voice (governed)         (client panel/state) → POST /api/voice/brief-conversation
   │                                            └ src/voice/server (server-only truth boundary)
Repository layer  (src/data/repository.ts — Repository interface; server-only)
Deterministic engines  (src/engines: oee, risk, rots)
Provider-neutral AI  (src/ai: mock | nvidia | dgxspark)  ← server-only service
Data source  (src/data seeded dataset  |  Snowflake, Phase 2)
```

- **Deterministic first.** OEE, risk, financial exposure, and token-value math are exact
  calculations (`src/engines`), unit-tested. AI is used only where language is needed.
- **Server truth boundary.** Truth construction (`brief/service`, `data/*`, voice conversation)
  is `server-only`; it never enters the client bundle.
- **Model portability.** `getAiProvider()` returns a mock, an NVIDIA OpenAI-compatible adapter,
  or a DGX Spark endpoint via `AI_PROVIDER`. UI never imports a provider.
- **Provenance & value discipline.** Every figure is tagged measured / calculated /
  business-rule / predicted / AI-generated / human. **Projected** vs **realised** value are
  kept strictly separate and realised value is never shown before a validated outcome.
- **Responsive shell.** The TopBar + ContextBar form one sticky region whose measured height
  drives the sidebar offset (CSS fallback before JS; no first-paint shift, CLS < 0.05).
- **Determinism.** A fixed `SEED` and `ANCHOR_NOW` make the entire demo byte-for-byte
  reproducible.

Data & AI selection via env: `DATA_SOURCE=local|snowflake`, `AI_PROVIDER=mock|nvidia|dgxspark`.

---

## Current application capabilities

- **1130/1130 tests across 88 files** and **HTTP QA 88/88**.
- A read-only **eight-asset portfolio** using the existing canonical synthetic records.
- Four cross-route, persona-guided journeys for Plant Manager, Reliability Manager, Materials &
  Spares Coordinator, and Turnaround Manager.
- Governed K-201 Case Investigator with citation validation, authority boundaries, and safe
  deterministic fallback.
- Turnaround, OEE and loss-intelligence, materials readiness, and value-realisation workspaces.
- Honest unavailable/not-assessed states and prominent synthetic-data disclosure.

## Verification commands

```bash
npm run typecheck     # strict tsc --noEmit
npm run lint          # ESLint, next/core-web-vitals
npm test              # Vitest (1130 tests across 88 files)
npm run seed:verify   # deterministic: true + K-201 story numbers
npm run build         # production build (Next.js App Router)
```

Browser/visual QA harnesses (Playwright; screenshots written under the gitignored `qa/`):
`scripts/qa-voice-polish.mjs`, `scripts/qa-hardening.mjs`, `scripts/qa-voice-shell.mjs`,
`scripts/qa-screenshots.mjs`.

Deployed-preview smoke test (routes, themes, persona switch, Chief of Staff brief, governed
voice, and a check that no third-party host is contacted). The target URL is supplied at run
time — no credentials or deployment IDs are embedded:

```bash
QA_BASE_URL="https://<your-preview>.vercel.app" npm run qa:preview
```


---

## Documentation

| Doc | Contents |
| --- | --- |
| [docs/PRODUCT_BLUEPRINT.md](docs/PRODUCT_BLUEPRINT.md) | Vision, modules, users, guardrails |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, AI portability, determinism, security |
| [docs/PERSONAS.md](docs/PERSONAS.md) | The eight personas |
| [docs/PERSONA_CAPABILITY_MATRIX.md](docs/PERSONA_CAPABILITY_MATRIX.md) | 21 capabilities × 8 personas |
| [docs/PERSONA_INFORMATION_ARCHITECTURE.md](docs/PERSONA_INFORMATION_ARCHITECTURE.md) | Navigation, landing routes, ownership |
| [docs/CHIEF_OF_STAFF.md](docs/CHIEF_OF_STAFF.md) | Briefing model, trust boundaries |
| [docs/DEMO_STORY.md](docs/DEMO_STORY.md) | End-to-end K-201 presenter narrative |
| [docs/METRIC_DEFINITIONS.md](docs/METRIC_DEFINITIONS.md) | Exact OEE / risk / ROTS formulas |
| [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md) | All 22 core entities |
| [docs/SCOPE_CONSISTENCY.md](docs/SCOPE_CONSISTENCY.md) | Scope/timeframe/provenance of each $ figure |
| [docs/design-system.md](docs/design-system.md) | Tokens, status model, themes, accessibility |
| [docs/information-architecture.md](docs/information-architecture.md) | Views & navigation |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | Phased plan with acceptance criteria |
| [PHASE_2A_CHECKPOINT.md](PHASE_2A_CHECKPOINT.md) | Phase 2A scope, decisions, limitations, Phase 2B |

Snowflake-compatible DDL for all 22 entities: [db/migrations/snowflake/001_core_schema.sql](db/migrations/snowflake/001_core_schema.sql).

---

## Tech

Next.js 14 (App Router) · TypeScript (strict) · Tailwind (CSS-variable design tokens, light +
dark) · Vitest · Zod · Playwright (visual QA). Snowflake is the intended data & analytics
platform (Phase 2). Development environment: Claude Code.
