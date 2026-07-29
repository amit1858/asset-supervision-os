# V2 Phase 1 — Enterprise Shell, Navigation & Operational Context

Status: **Complete** · Branch: `copilot/v2-phase-1-enterprise-shell` (from `0e4fbd5`)
Scope: parallel `/v2` presentation layer only. No existing route, component,
engine, repository, middleware, layout, or dependency was modified.

---

## 1. Delivered scope

Phase 1 stands up the **enterprise shell and the operational thread** for the
rebuilt experience under `/v2`, reusing every existing foundation. It delivers:

- A parallel V2 application shell (top bar, shared context bar, persona-aware
  side navigation) that mirrors the v1 layout contract.
- Persona-aware navigation derived entirely from the typed persona registry and
  mapped into the `/v2` namespace — no second navigation model.
- The **Signal → Value operational thread** as a persistent, context-preserving
  navigation seam across all eight personas, anchored on the active asset.
- The real Chief of Staff **My Brief** on every persona home (the governed
  assistant seam travels with it, unchanged).
- Honest Phase 2 placeholders for every surface (job-to-be-done, accountable
  persona, planned depth, source posture) — no fabricated operational content.
- Capability-gated access on every route, decided by the existing capability
  model, with an explained restricted state.
- 34 new pure tests, a Playwright QA script, and a browserless HTTP smoke.

Phase 1 deliberately does **not** build the detailed per-persona workspaces —
those are Phase 2, against the same deterministic engines.

## 2. Architecture & reuse

The rebuild is a **presentation layer**, not a fork of logic. New code consumes
existing foundations directly:

| Concern | Reused foundation |
| --- | --- |
| Personas, nav, capabilities, authority | `src/personas/registry.ts`, `capabilities.ts`, `authorization.ts`, `routing.ts` |
| Shared operational context (client + server + cookies) | `src/context/OperationalContext.tsx`, `context/server.ts`, `context/types.ts` |
| Chief of Staff brief | `src/brief/service.ts` via `MyBrief` |
| Governed assistant (server truth boundary) | `src/voice/VoiceContext.tsx`, `VoiceBriefingPanel`, `/api/voice/brief-conversation` |
| Enterprise UI kit, icons, tokens | `src/components/ui/enterprise.tsx`, `layout/icons.tsx`, design tokens |
| Deterministic data | `src/data/repository.ts`, `data/seed.ts` |

New **pure logic** lives in `src/v2/` (node-testable, no JSX): `routes.ts`,
`nav.ts`, `access.ts`, `thread.ts`, `source.ts`. New **presentation** lives in
`src/components/v2/` and route entry points in `src/app/v2/`. No business logic
is duplicated into components.

## 3. Route map (v1 → v2)

| Existing route | Accountable persona | Proposed /v2 route | Primary job | Source of truth |
| --- | --- | --- | --- | --- |
| `/plant-overview` | Plant Manager | `/v2/plant` | Decision awaiting authority, readiness, realised value | seeded dataset |
| `/shift` | Shift Supervisor | `/v2/shift` | Unit status & operating response this shift | seeded dataset |
| `/reliability` | Reliability Manager | `/v2/reliability` | Approval queue, time-critical risk, readiness | seeded dataset |
| `/watchlist` | Reliability Engineer | `/v2/watchlist` | Deteriorating trends & drafted recommendations | seeded dataset |
| `/planning` | Maintenance Planner | `/v2/planning` | Approved work → ready job plans, blockers | seeded dataset |
| `/materials` | Materials Coordinator | `/v2/materials` | Material-blocked work, critical spares, expedites | seeded dataset |
| `/turnaround` | Turnaround Manager | `/v2/turnaround` | Scope readiness, critical-path risk, freeze | seeded dataset |
| `/agent-control` | AI Control Tower Admin | `/v2/agent-control` | Agent health, runtime, value & cost (ROTS) | seeded dataset |
| `/assets/[tag]` | Reliability Engineer | `/v2/assets/[tag]` | Canonical asset record + Signal→Value thread | repository `getAsset360` |
| `/oee` | Reliability Manager | `/v2/oee` | OEE & largest production losses | seeded dataset |
| `/portfolio` | Reliability Manager | `/v2/portfolio` | Deterministic asset-risk ranking | seeded dataset |
| `/turnaround-candidates` | Turnaround Manager | `/v2/turnaround-candidates` | Emerging candidates from condition events | seeded dataset |
| `/value-realisation` | Plant Manager | `/v2/value-realisation` | Validated outcomes & realised value (no token ledgers) | seeded dataset |

`/v2` redirects to the active persona's landing (asset thread preserved). The
`/design-system` showcase is intentionally **not** a `/v2` route (decision §4);
a test enforces its absence from navigation.

## 4. Context, persona & thread behaviour

- **Context persistence (decision §5):** the shared operational context (plant,
  unit, time range, shift, active asset, persona, theme) is read server-side from
  cookies and provided to the client tree — no authoritative state lives only in
  the browser. The context bar is reused unchanged, so selections persist across
  `/v2` navigations and persona switches.
- **Persona switch:** `V2PersonaSelector` lists only authorization-permitted
  personas, preserves the active asset thread, and routes to the persona's `/v2`
  landing via `v2LandingRoute` (a v2 mapping of the existing `personaLandingRoute`).
  Switching persona changes the **view**, never authority.
- **Operational thread:** `buildOperationalThread(tag, persona)` produces the
  eight ordered stages (Signal → Value + governed AI) with the accountable
  persona and a context-preserving `/v2` link for each. It is **asset-agnostic**
  (K-201 is the first reference story, not a special case) and fabricates no
  events, approvals, or outcomes. The stage the current persona owns is marked.

## 5. Assistant integration

The governed assistant is **reused, not rebuilt**. `V2ShellClient` wraps the tree
in the existing `VoiceProvider` and renders the existing `VoiceBriefingPanel`;
`MyBrief` carries its `DiscussBriefButton` seam. All assistant traffic continues
to the server-only `/api/voice/brief-conversation` boundary. The assistant can
propose but never executes or approves an action (decision §7) — no approval or
write-back path was added.

## 6. Verification results

| Gate | Result |
| --- | --- |
| `tsc --noEmit` (strict) | ✓ pass |
| `next lint` | ✓ no warnings or errors |
| `vitest run` | ✓ **159/159** (was 125; **+34** new V2 tests across 5 files) |
| `seed:verify` | ✓ deterministic — K-201 risk 68 / health 52 / 17.93 days / OEE 91.2% / exposure $1,620,156 (unchanged) |
| `next build` | ✓ 19 v1 routes intact **+ 14 new /v2 routes**; `/api/*` remain server-rendered |
| V2 HTTP smoke (`qa:v2:http`) | ✓ **32/32** — every route 200 + expected content, access gating correct, no third-party hosts |
| Existing v1 source changed | **none** (only `package.json` gained 2 QA script entries) |

New tests: `src/v2/routes.test.ts` (7), `nav.test.ts` (9), `access.test.ts` (9),
`thread.test.ts` (6), `shell-guards.test.ts` (3).

## 7. Accessibility findings

- Keyboard/focus and dismissal behaviour is inherited from the reused header
  controls (search overlay, persona selector, assistant panel).
- Navigation uses `aria-current`, the thread uses `aria-current="step"`, and the
  restricted state explains the missing authority in text (not colour alone).
- Status/source tone carries operational meaning only; numbers are tabular.
- No horizontal overflow at 1024px in the HTTP smoke render; full desktop-first
  layout at 1440px. (Pixel-level focus-ring/contrast review is deferred to the
  browser QA below.)

## 8. Known limitations

- **Browser QA screenshots not captured in this environment.** Playwright browser
  binaries could not be downloaded on this restricted ARM64 machine
  (`npx playwright install chromium` does not complete). `scripts/qa-v2-shell.mjs`
  is committed and ready (personas × viewports × themes, assistant/persona-selector
  captures, console/overflow/external-host assertions) and should be run on a
  network-capable machine via `npm run qa:v2`. The browserless
  `scripts/qa-v2-http.mjs` (`npm run qa:v2:http`) was used as the Phase 1
  substitute and passed 32/32.
- Phase 1 surfaces are honest **placeholders** — the detailed workspaces are
  Phase 2.

## 9. Phase 2 entry point

Build the per-persona workspaces behind the placeholders, starting with the
**Reliability Command Center (`/v2/reliability`)** and **Asset 360
(`/v2/assets/[tag]`)** as the K-201 vertical, consuming the existing engines
(risk, OEE, ROTS) and repository. Each `V2_ROUTES[].phase2` string is the scope
contract for its surface. Reuse the shell, context, thread, and assistant
delivered here; do not fork logic into components. Existing v1 routes remain the
production experience until a route-by-route cut-over is approved.
