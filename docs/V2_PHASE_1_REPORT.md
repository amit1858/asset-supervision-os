# V2 Phase 1 — Enterprise Shell, Navigation & Operational Context

Status: **Complete** · Branch: `copilot/v2-phase-1-enterprise-shell` (from `0e4fbd5`)
Scope: parallel `/v2` presentation layer only. No existing route, component,
engine, repository, middleware, layout, or dependency was modified.

> **Phase 1.1 addendum (Windows / Edge visual QA):** the browser QA that could
> not run on the original restricted ARM64 machine has now been executed on
> Windows using the locally installed Microsoft Edge (no Chromium download). See
> §10. One targeted V2-shell accessibility fix resulted; no V1 code changed.

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
  controls (search overlay, assistant panel). The **persona selector** was
  hardened in Phase 1.1: it declared `role="listbox"`/`role="option"` but
  previously had no Escape-to-close, no focus return, and no arrow-key movement.
  It now closes on **Escape** and returns focus to its trigger, moves focus to
  the selected option on open, and supports **Up/Down** roving between options —
  matching the governed assistant's focus contract (see §10).
- Navigation uses `aria-current`, the thread uses `aria-current="step"`, and the
  restricted state explains the missing authority in text (not colour alone).
- Status/source tone carries operational meaning only; numbers are tabular.
- No horizontal overflow at 1024–1920px, headings clear the sticky header, and
  the sidebar sits flush beneath it — all verified by browser assertions in §10.

## 8. Known limitations

- **Browser QA screenshots are now captured (Phase 1.1).** Playwright browser
  binaries still cannot be downloaded on the restricted ARM64 machine, so the QA
  script was updated to drive the locally installed **Microsoft Edge** via
  `channel: "msedge"` (with a portable Chromium fallback and explicit-Edge-path
  fallback). The full matrix and assertions passed **410/410** — see §10. The
  browserless `scripts/qa-v2-http.mjs` (`npm run qa:v2:http`) remains as a
  network-independent smoke and passed **32/32**.
- **Pre-existing (out-of-scope) observations, not changed here:**
  - No `favicon.ico` ships in `src/app`, so the browser's automatic favicon
    request returns 404 on both v1 and v2. This is an app-level gap, not a v2
    shell defect; the QA asserts on precise responses and ignores this one.
  - The reused v1 Chief-of-Staff brief renders non-pluralised counts
    (e.g. "2 changes · 1 items"). Fixing it would modify customer-facing v1 code,
    which is prohibited in this phase; recorded for a future v1 polish pass.
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

## 10. Windows / Edge visual QA (Phase 1.1)

### 10.1 Environment & browser
- **OS/runtime:** Windows (ARM64), Node v24.16.0, npm 11.13.0, lockfileVersion 3.
- **Browser:** locally installed **Microsoft Edge**, launched by Playwright via
  `chromium.launch({ channel: "msedge" })` — **no Chromium binary was
  downloaded**. `scripts/qa-v2-shell.mjs` now resolves a browser in this order:
  (1) Edge channel, (2) a bundled Chromium binary if already present, (3) a
  standard-path Edge executable, else it fails with an actionable message. Base
  URL, port, output dir and "reuse running server" are all env-configurable.
- **Server under test:** production `next start` on a private local port.

### 10.2 Screenshot matrix (full-size, `qa/v2-phase1/windows/`, gitignored)
- **10 routes × 4 viewports × 2 themes = 80 full-page screenshots**, plus **7
  interaction-state captures** (87 total).
- Viewports: **1920×1080, 1440×900, 1280×800, 1024×768** (desktop-first, usable
  at 1024).
- Routes use the **real** v2 paths (`/v2/plant`, not `/plant-overview`):
  plant, shift, reliability, watchlist, planning, materials, turnaround,
  agent-control, assets/K-201, oee.
- Interaction states: assistant closed, assistant open, persona selector open,
  keyboard focus after Escape, restricted (materials → OEE), Phase-2 placeholder
  (portfolio), and asset context preserved across a persona switch (dark).

### 10.3 Automated browser assertions — **410/410 passed**
Per page in the matrix: HTTP 200 + expected content; **no** console errors,
hydration warnings, or ResizeObserver loops; **no** horizontal overflow; heading
clears the sticky header; sidebar flush beneath the header. Global/state checks:
Chief-of-Staff brief and operational thread render; assistant exposes **no**
approve/execute affordance; **Escape closes the assistant and returns focus**;
persona selector retains its accessible name; asset (K-201) context preserved on
persona switch; restricted route shows the honest restriction; and **no
third-party network hosts** were contacted (governed truth boundary stays
same-origin).

### 10.4 Human visual review (full-size screenshots)
- **Enterprise credibility:** restrained enterprise-blue header, neutral surface,
  no gradients/glassmorphism, no oversized decorative cards. Reads as a mature
  operations platform.
- **Hierarchy & density:** clear breadcrumb → persona/role eyebrow → title →
  brief → operational thread → planned workspace. Metric labels are small-caps
  with **tabular numerals** ($1,620,156 · 68/100 · ~18 days).
- **Cross-persona thread:** the Signal→Value thread persists K-201 and marks the
  active persona's stage on every surface (verified on plant, reliability, and
  the asset record).
- **Light/dark parity:** dark theme is a consistent deep-navy treatment with
  matching structure and contrast; no theme-only regressions observed.
- **Responsive:** at 1024px the search field collapses to an icon, the thread
  compresses with truncation, and brief metrics stay legible with no overflow;
  1280/1440/1920 progressively relax density.
- **Governance surfaces:** the assistant panel shows DEMO + "Audio is not
  recorded", persona-aware context, grounded prompt copy, and no execute/approve
  control. The restricted state states accountability and "changes your view,
  not your authority".

### 10.5 Correction applied (Gate 7 — V2 shell only)
- **`src/components/v2/V2PersonaSelector.tsx`:** added Escape-to-close with focus
  return to the trigger, focus-into-selected-option on open, and Up/Down roving
  between options. This was surfaced by the keyboard-focus capture (the menu had
  remained open after Escape) and closes an accessibility gap versus the
  assistant. No other component was touched; the shell-guard test (no PersonaId
  literals / no external URLs in shell components) still passes.

### 10.6 Files changed in Phase 1.1
- `scripts/qa-v2-shell.mjs` — Edge channel + fallbacks, 4 viewports, expanded
  interaction states and assertions, precise response-based error detection,
  output to `qa/v2-phase1/windows/`.
- `src/components/v2/V2PersonaSelector.tsx` — accessibility fix above.
- `docs/V2_PHASE_1_REPORT.md` — this addendum.
- **No v1 / customer-facing source changed.** Screenshots are gitignored (`/qa/`).

### 10.7 Post-fix verification
`tsc --noEmit` ✓ · `next lint` ✓ (0 warnings) · `vitest run` ✓ **159/159** ·
`seed:verify` ✓ (K-201 risk 68 / health 52 / 17.93 days / OEE 91.2% /
exposure $1,620,156 — unchanged) · `next build` ✓ · `qa:v2` (Edge) ✓ **410/410**
· `qa:v2:http` ✓ **32/32**.

### 10.8 Remaining risks before Phase 2
- Visual QA depends on a locally installed Edge (or Chromium); the restricted
  ARM64 machine still cannot download Playwright browsers. Documented in the
  script's fallback error.
- App-level favicon 404 and the v1 brief pluralisation remain for a future v1
  polish pass (not in v2 scope).
- Phase 1 surfaces remain honest placeholders pending the Phase 2 workspaces.
