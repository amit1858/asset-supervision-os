# Asset Supervision OS — /v2 Product Experience Blueprint

> **Phase 0 — Audit & Plan only.** This document is the sole deliverable of Phase 0.
> No customer-facing code has been changed, no routes replaced, no dependencies added,
> nothing deployed or committed. It defines *what* we will rebuild under `/v2`, *why*,
> and *how*, so that implementation phases can proceed against an agreed contract.
>
> **Non-destructive principle.** The `/v2` experience is a **parallel presentation
> layer** that consumes the existing domain types, repositories, deterministic engines,
> persona registry, capability model, Chief-of-Staff service, voice API, and approval
> controls. Business logic is never copied into UI. Existing production routes keep
> working until an explicit, phased cut-over.

---

## 0. Audit summary — what exists today

**Stack.** Next.js 14.2 (App Router) · React 18.3 · TypeScript 5.5 · Tailwind 3.4 ·
Zod · `server-only` truth construction · Vitest · Playwright. `npm` is authoritative
(`package-lock.json`). No UI component libraries — components are hand-built.

**Architecture (clean separation already in place):**

| Layer | Location | Role |
|---|---|---|
| Domain types & enums | `src/domain/` | `types.ts`, `enums.ts`, `integration.ts` (source states), `ai-hierarchy.ts` |
| Deterministic engines | `src/engines/` | `oee.ts`, `risk.ts`, `rots.ts` (each with `.test.ts`) |
| Data (synthetic) | `src/data/` | `seed.ts`, `generate.ts`, `repository.ts` (view models), `k201-analysis.ts`, `shift-metrics.ts`, `asset-classification.ts`, `command-center.ts` |
| Persona system | `src/personas/` | `registry.ts` (single source of truth), `capabilities.ts`, `authorization.ts`, `routing.ts`, `types.ts` |
| Chief of Staff | `src/brief/` | `service.ts` (`buildPersonaBrief`), `types.ts` |
| Voice / assistant | `src/voice/` + `src/app/api/voice/` | provider-neutral, server-grounded, governed |
| AI service | `src/ai/` + `src/app/api/ai/explain` | prompts, providers, grounding |
| Presentation | `src/app/**`, `src/components/**` | shell, pages, UI kit |
| Design tokens | `src/design-system/tokens.css`, `status.ts`; `tailwind.config.ts` | light + dark, semantic status |

**Reusable UI foundations already built** (`src/components/ui/`): `enterprise.tsx`
(`EnterprisePageHeader`, `Tabs`, `SummaryStrip`, `CommandBar`, `FilterBar`, `DetailPanel`,
`EmptyWorkspace`, `ReadOnlyNotice`, `SourceStatus`, `IntegrationBadge`, `SourcePanel`),
`queues.tsx` (`WorkQueue`, `ApprovalQueue`, `ExceptionPanel`, `QueueSection`, `RecordList`),
`Table`, `Badge` (equipment/criticality/status/disposition/readiness/provenance),
`Metric`, `Indicators` (OEE gauge, risk, health, confidence), `Charts`
(sensor trend, loss waterfall, sparkline), `Evidence`, `ApprovalControl`, `CapabilityGate`,
`AI`. Layout: `AppShell` → `Shell` → `TopBar` + `ContextBar` + `SideNavigation` + docked
`VoiceBriefingPanel`. Brief UI: `components/brief/MyBrief.tsx`.

**Tests.** 18 test files across engines, data, domain, personas, brief, voice, and theme
(`src/**/*.test.ts`). The historical "125 passing tests" figure refers to *test cases*,
not files — see **Risks** for why this could not be re-verified in this environment.

**Personas (8, preserved verbatim — do not renumber or rename):**
`plant_manager`, `shift_supervisor`, `reliability_manager`, `reliability_engineer`,
`maintenance_planner`, `materials_coordinator`, `turnaround_manager`, `ai_admin`.
Default persona: `reliability_manager` (owns the K-201 story).

**Current route inventory** (`src/app/**`):
`/` (redirect) · `/plant-overview` · `/shift` · `/reliability` · `/watchlist` ·
`/portfolio` · `/planning` · `/materials` · `/turnaround` · `/turnaround-candidates` ·
`/oee` · `/assets/[tag]` · `/value-realisation` · `/agent-control` ·
`/ai-economics` (308 → `/agent-control?tab=value-cost`) · `/design-system` (internal) ·
`/api/voice/brief-conversation` · `/api/ai/explain`.

---

## 1. What should be retained

Retain **all business logic and governance**, and the *substance* of the experience:

- **Domain model, enums, integration/source-state model** — the vocabulary of the product.
- **Deterministic engines** (OEE, risk, ROTS) and their tests — the source of truth.
- **Repository view models** (`CommandCenterModel`, `Asset360Model`, `RotsModel`,
  `TurnaroundSummary`, shift metrics) — `/v2` pages consume these unchanged.
- **Persona registry + capability + approval-authority model** — nav, brief filtering,
  approvals, and landing routes are all data-driven from here. This is a strong asset;
  keep it as the single source of truth.
- **Chief-of-Staff service** (`buildPersonaBrief`) — deterministic, evidence-backed,
  capability-filtered, per-persona prioritisation of the shared K-201 facts. Keep the
  service; redesign only its *presentation*.
- **Governed voice/assistant architecture** — provider-neutral, server-grounded, proposes
  but never executes/approves, honest about freshness and unavailable data.
- **Provenance / trust-boundary model** — measured vs calculated vs statistical/predicted
  vs AI-generated vs human-approved, surfaced via `PROVENANCE` and provenance dots.
- **Design tokens & semantic status system** — enterprise blue, neutral palette, status
  colour only for operational meaning, restrained radii/shadows, tabular numbers, light
  + dark. This already matches the target visual philosophy.
- **The K-201 hydrogen recycle compressor scenario** and the deterministic synthetic data.
- **Approval controls, `CapabilityGate`, `ReadOnlyNotice`** — enforce authority in the UI.
- **The reusable enterprise UI kit** (`enterprise.tsx`, `queues.tsx`, tables, badges,
  charts) — evolve, don't discard.

## 2. What should be retired

Retire (in the `/v2` experience; do not delete from production until cut-over):

- **`/design-system` as a reachable customer route.** Keep it as an internal/dev-only
  gallery (e.g. non-navigable, `noindex`, or moved out of the customer app), never in
  customer navigation. It is already absent from persona `navItems` — formalise this.
- **Inconsistent per-page hand-rolled layout scaffolding.** Several pages re-implement
  their own header/grid/section framing (e.g. `reliability` vs `plant-overview` vs
  `value-realisation`). Retire ad-hoc per-page scaffolding in favour of one canonical
  `/v2` workspace template (see §7).
- **Route/naming ambiguity around AI value.** `/ai-economics` (redirect), the
  `/agent-control?tab=value-cost` tab, and `/value-realisation` overlap conceptually.
  Retire the redirect stub in `/v2` and draw one clear line: **leadership value** vs
  **AI governance/economics** (see §4, §12 route table).
- **"Eight dashboards" feel.** Retire any pattern where a persona home reads as a generic
  card grid disconnected from the others. Replaced by the persona-workspace pattern with a
  persistent operational thread (see §5, §6, §7).
- **Decorative or space-filling card grids** and any oversized-card / excessive-whitespace
  layouts that do not carry operational meaning.

## 3. What should be redesigned

Redesign the *presentation and interaction*, not the logic:

- **Persona home → Persona Workspace.** Each home becomes a dense, role-specific workspace:
  compact Chief-of-Staff brief on top, primary queue/record/timeline workspace visible in
  the **first desktop viewport**, contextual detail panel, and the governed assistant on
  the side. No home should require scrolling to reach the actual work.
- **Chief-of-Staff brief.** Keep it compact (it already collapses detail into a drawer) but
  make it answer the full nine questions explicitly and consistently across personas:
  *what changed · why it matters · what needs attention · what to decide · what next · who
  owns it · by when · what blocks · what evidence.* Standardise the layout so the workspace
  stays visible below it.
- **Global shell.** One `/v2` shell: strong enterprise-blue application header, persistent
  **operational context bar** (plant · unit · asset · date range · decision/work context),
  persona switcher that **preserves context**, left navigation driven by the registry,
  docked assistant that reflows (never covers) the workspace at ≥1280px.
- **Cross-persona thread continuity.** Redesign persona switching so following **K-201**
  across roles keeps plant/unit/asset/date-range/decision/work context (the routing hints
  in `personas/routing.ts` already exist — surface them as an explicit, visible thread).
- **Asset 360.** Redesign into the canonical record page: identity + status header, the
  Signal→…→Value thread as a first-class timeline, sensors/trends, risk, condition events,
  work orders, spares, the recommendation with evidence, the AI rationale (clearly labelled
  AI-generated), the human decision, and the linked turnaround package.
- **Tables, queues, timelines, detail panels.** Standardise selected/hover/focus/disabled/
  stale/offline/restricted states across every list and record.
- **AI value split.** Redesign into two coherent destinations: leadership **Value
  Realisation** (validated outcomes, realised value, outstanding validation — no token
  ledgers) and **AI Control Tower** (agent health, model runtime, token economics,
  projected-vs-realised, ROTS).

---

## 4. Proposed /v2 information architecture

`/v2` is a **route namespace**, not a fork of logic. Structure:

```
/v2                                  → redirect to active persona workspace (registry-driven)
/v2/plant                            → Plant Manager workspace
/v2/shift                            → Shift Supervisor workspace
/v2/reliability                      → Reliability Manager workspace (command center)
/v2/watchlist                        → Reliability Engineer workspace
/v2/planning                         → Maintenance Planner workbench
/v2/materials                        → Materials & Spares workspace
/v2/turnaround                       → Turnaround Control Tower
/v2/agent-control                    → AI Control Tower (tabs: agents · runtime · value & cost)

Shared operational surfaces (context-preserving, reachable from many personas):
/v2/assets/[tag]                     → Asset 360 (canonical record; K-201 hero)
/v2/oee                              → OEE & Loss Intelligence
/v2/portfolio                        → Asset Risk Portfolio
/v2/turnaround-candidates            → Emerging turnaround candidates
/v2/value-realisation                → Leadership Value Realisation (validated outcomes)

APIs & governance reused as-is:
/api/voice/brief-conversation        → governed assistant (unchanged)
/api/ai/explain                      → grounded AI explanation (unchanged)
```

**Navigation model.** Persona `navItems` from the registry render the left nav (with an
optional `/v2` href mapping layer so existing registry entries are reused without editing
business data). Capability-gated items stay hidden unless the persona holds the capability.
The **global context bar** (plant/unit/asset/date/decision) sits above all workspaces and
is the connective tissue that makes this one product, not eight dashboards.

**Clarified AI boundary (resolves the current overlap):**

| Destination | Audience | Shows | Never shows |
|---|---|---|---|
| `/v2/value-realisation` | Leadership | Validated outcomes, realised value, decisions supported, outstanding validation | Token ledgers, prompt versions, provider pricing, model runtime |
| `/v2/agent-control` | AI Admin | Agent health, model runtime, token economics, projected vs realised, ROTS | Approval authority over operational actions |

---

## 5. Cross-persona operational thread

The product must let a user follow **one continuous thread** — the K-201 hydrogen recycle
compressor — across personas without losing context. The thread mirrors the domain:

```
Signal (vibration ↑ above warning band)
  → Condition change (high-vibration trip, 12 days ago)
    → Risk assessment (deterministic risk score; projected time-to-critical)
      → Recommended intervention (reliability recommendation + evidence + AI rationale)
        → Human decision (approve / modify / reject — capability-gated)
          → Work order (WO-48231 inspection, WO-48102 seal)
            → Spare availability (dry gas seal: 0 on hand, 35-day lead — blocker)
              → Scheduled execution (planning workbench; 48-hour window)
                → Operational outcome (validated / not yet validated)
                  → Realised value (recognised only after validation)
```

**How the thread is preserved:**

- A **persistent context object** (plant `plant-gc`, unit `line-hds2`, asset `K-201`,
  date range, active decision/work item) lives in the context bar and in the URL/query.
- **Persona switching** uses `personas/routing.ts` (`personaLandingRoute` +
  `ASSET_ENTRY`) so, e.g., Engineer on `/v2/assets/K-201` → switch to Planner → lands on
  `/v2/planning?asset=K-201`, not a generic home.
- A visible **"You are following: K-201"** thread indicator (built on the existing
  `AssetThreadNotice` / `AssetContextSync` landing components) shows the current stage and
  the owning persona for the next step.
- Every brief item, queue row, and record **links back into the thread** (`/v2/assets/K-201`,
  `/v2/planning?asset=K-201`, `/v2/materials?asset=K-201`, `/v2/turnaround?asset=K-201`).

**Persona → thread-stage ownership (who acts next):**

| Stage | Accountable persona |
|---|---|
| Signal / condition response | Shift Supervisor |
| Risk assessment / failure mode | Reliability Engineer |
| Intervention decision (approve) | Reliability Manager (Plant Manager for high value/scope) |
| Job planning / execution readiness | Maintenance Planner |
| Spare availability / expedite | Materials & Spares Coordinator |
| Turnaround scope | Turnaround Manager |
| Value realisation / validation | Plant Manager / Reliability Manager |
| AI grounding & economics | AI Control Tower Administrator |

---

## 6. Page hierarchy for every persona

Every persona workspace follows the same skeleton (see §7) so the product feels unified:
**Context bar → Chief-of-Staff brief → primary workspace (queues/records/timeline) →
detail panel → governed assistant**. Persona-specific content:

**Plant Manager — `/v2/plant`**
- Brief: *Executive Morning Brief* — one decision awaiting authority, turnaround readiness,
  realised value availability.
- Workspace: plant status summary strip (reconciling counts) · decisions requiring my
  authority · attention assets (risk-ranked) · turnaround readiness · value at stake.
- Records: → Asset 360, → OEE, → Turnaround, → Value Realisation.
- KPIs: Plant OEE · Open-decision value at stake · Turnaround readiness · Assets critical.

**Operations Shift Supervisor — `/v2/shift`**
- Brief: *Shift Opening Brief* — K-201 needs an operating response this shift.
- Workspace: unit status now · active deviations · operating actions this shift (issue
  operating instruction) · open work requests · shift handover.
- Honesty: shift-grain OEE marked *unavailable* (not connected).
- KPIs: Unit availability · Active deviations · Open work requests · Shift OEE (unavailable).

**Reliability Manager — `/v2/reliability`**
- Brief: *Reliability Daily Brief* — a K-201 decision requires approval; projected
  time-to-critical inside the repair lead time.
- Workspace: **decisions requiring attention (approval queue)** · time-critical asset risks
  · maintenance execution readiness · material exceptions · emerging turnaround candidates ·
  production/OEE impact.
- KPIs: Decisions requiring attention · Time-critical risks · Risk portfolio · Value at stake.

**Reliability Engineer — `/v2/watchlist`**
- Brief: *Asset Watch Brief* — K-201 priority watch; complete inspection + attach evidence.
- Workspace: watchlist (deteriorating trends) · projected time-to-critical · drafted
  recommendations · evidence capture. Primary record: Asset 360.
- KPIs: Watchlist assets · Deteriorating trends · Time-to-critical · Drafted recommendations.

**Maintenance Planner — `/v2/planning`**
- Brief: *Planning Brief* — K-201 work needs job plans; one item parts-constrained.
- Workspace: approved work to plan · job-plan readiness · parts-constrained orders ·
  schedulable this week · execution blockers. Reserve spare; prepare work order.
- KPIs: WOs to plan · Job-plan readiness · Parts-constrained · Scheduled this week.

**Materials & Spares Coordinator — `/v2/materials`**
- Brief: *Material Readiness Brief* — K-201 repair blocked on a dry gas seal (35-day lead).
- Workspace: material-blocked work · critical spares below reorder · open expedites ·
  reservations against upcoming work. Expedite material; reserve spare.
- KPIs: Material-blocked work · Critical spares below reorder · Open expedites · Longest lead.

**Turnaround Manager — `/v2/turnaround`**
- Brief: *Turnaround Readiness Brief* — K-201 overhaul is critical-path; readiness at risk
  on materials.
- Workspace: scope readiness (engineering/materials/labour/permits) · critical-path at risk
  · emerging candidates to scope · schedule/cost exposure · days to scope freeze.
- KPIs: Scope readiness · Critical-path at risk · Scoped cost vs budget · Days to freeze.

**AI Control Tower Administrator — `/v2/agent-control`**
- Brief: *AI Operations Brief* — activity healthy and offline; actual cost $0 with estimated
  scenarios; realised value not yet available.
- Workspace tabs: **Agents** (run health, grounding review) · **Runtime** (providers,
  models, prompt versions) · **Value & Cost** (ROTS, tokens, acceptance funnel, projected
  vs realised).
- KPIs: Actual AI cost · Estimated provider cost · Acceptance rate · Agent run health.

---

## 7. Shared enterprise interaction patterns

One canonical set of patterns, reused across all `/v2` pages (evolve the existing kit):

- **Workspace template** — `AppShell(v2)` → context bar → `EnterprisePageHeader` (eyebrow =
  persona · family; title; meta = plant + "as of") → `MyBrief` (compact) → `SummaryStrip`
  (reconciling counts) → 8/4 primary-workspace / detail-panel grid → docked assistant.
- **Queues** (`WorkQueue`, `ApprovalQueue`, `ExceptionPanel`, `QueueSection`, `RecordList`)
  — consistent row anatomy: reference (equipment id) · primary · secondary (badges) ·
  trailing metric · row link into the thread. Every queue has an explicit empty state.
- **Approval control** — capability-gated; records the active persona; **proposes, never
  auto-executes**; shows evidence and value at stake. `CapabilityGate` / `ReadOnlyNotice`
  render a clear restricted state when the persona lacks authority.
- **Record / detail panel** (`DetailPanel`) — right-hand contextual detail that updates with
  selection; never a modal for primary work.
- **Timeline** — the Signal→…→Value thread rendered as an ordered, evidence-linked timeline
  on Asset 360 and referenced (collapsed) elsewhere.
- **Evidence & provenance** — provenance dots inline; full evidence in a drawer; every claim
  traceable via `href` to its record. Trust boundary always legible: measured · calculated ·
  predicted · AI-generated · human-approved.
- **Source freshness / integration state** — `SourcePanel` / `SourceStatus` /
  `IntegrationBadge`; unavailable data is stated honestly, never faked.
- **Interaction states — standardised everywhere:** selected · hover · focus-visible ·
  disabled · stale · offline · restricted. Tabular numbers for all operational metrics.
- **Governed assistant** — `DiscussBriefButton` / docked `VoiceBriefingPanel`; persona- and
  context-aware; answers the sanctioned question set; proposes actions requiring human
  confirmation; explicit about freshness and unavailable data.

---

## 8. Proposed visual system

Reuse and tighten the existing token system (`design-system/tokens.css`, `status.ts`,
`tailwind.config.ts`) — it already encodes the target philosophy. Principles:

- **Palette:** restrained industrial/enterprise **blue** (`--color-brand #1554b4`; header
  `#123f86`) on a cool neutral canvas (`#f3f6f9`); status colour used **only** for
  operational meaning (healthy/attention/critical/info/planned/AI/neutral).
- **No gradients · no glassmorphism · no playful AI visual language · no oversized cards ·
  no yellow/beige page theme · no space-filling card grids.**
- **Density:** high information density without clutter; strong table/queue/record/timeline/
  detail-panel patterns; compact headers and brief.
- **Type:** Geist Sans / Geist Mono; **tabular numbers** for every operational metric.
- **Shape:** restrained radii (3–10px) and subtle shadows; borders do most of the
  separation work (especially in dark).
- **Themes:** consistent light and **control-room dark** (already implemented via
  `[data-theme]`); status meanings preserved across both; text never pure white on dark.
- **Criticality vs severity** kept as distinct scales (equipment criticality A–E vs event
  severity) — do not conflate.
- **References for maturity only** (not to copy): Salesforce Lightning, ServiceNow, SAP
  Fiori, Microsoft Dynamics, Snowflake, industrial reliability tools.

## 9. Responsive behaviour

- **Desktop-first, fully usable at 1024px.** Primary workspace must be usable and the brief
  must not push the workspace below the fold at common desktop heights.
- **Breakpoints:** `<1024px` single-column stack (brief → workspace → detail collapses into
  an expandable panel; assistant becomes an overlay); `1024–1279px` two-column workspace,
  assistant as overlay; **`≥1280px` assistant docks and reflows** the main content
  (`xl:pr-[400px]`) so it never covers decision/blocker/workspace context.
- **Sticky regions:** TopBar + ContextBar are one measured sticky header; the sidebar and
  detail panel offset from its measured height (`--shell-header-h`).
- **Tables/queues** scroll within their container rather than blowing out the page; column
  priority collapses gracefully on narrow widths.

## 10. Accessibility approach

- **Colour never alone** — every status pairs colour with label/icon/shape (WCAG 2.1 AA).
- **Contrast** — text tokens meet AA on their surfaces in both themes; verify AI/planned
  subtle backgrounds.
- **Keyboard** — full keyboard operability for nav, queues, tabs, approval controls,
  assistant; visible `focus-visible` ring (`--shadow-focus`); logical tab order; no traps.
- **Semantics** — landmark roles (`header`, `nav[aria-label]`, `main`, `aside`),
  `aria-current="page"` on active nav, breadcrumb `nav`, `sr-only` labels on provenance dots,
  accessible names on icon-only controls.
- **Motion** — respect `prefers-reduced-motion`; motion is subtle and functional only.
- **No-flash theming** — retained (inline pre-paint theme script).
- **Assistant** — messages announced politely; restricted/unavailable states conveyed in
  text, not colour alone.

## 11. Migration strategy from /v2 to primary routes

Non-destructive, reversible, phased:

1. **Parallel build.** Ship `/v2/**` alongside existing routes. Both consume the same
   repositories/engines/registry/brief/voice. Existing routes remain the default. A small
   `/v2` href-mapping layer reuses registry `navItems` without editing persona business data.
2. **Internal validation.** Run existing Vitest + Playwright/visual QA against `/v2`; add
   `/v2` coverage. Confirm parity of facts (same numbers, same provenance) with v1.
3. **Opt-in preview.** Allow entering `/v2` (e.g. a preview switch) while `/` still redirects
   to v1 persona homes. Gather feedback per persona.
4. **Cut-over (phase-gated).** When a persona's `/v2` workspace reaches acceptance,
   repoint that persona's landing (registry `defaultRoute` / `routing.ts` / middleware) to
   the `/v2` route. Keep 308 redirects from old paths → `/v2` for bookmarks (mirror the
   existing `/ai-economics` redirect pattern).
5. **Promote.** Once all personas are cut over and stable, optionally alias `/v2/*` to the
   canonical paths and retire v1 pages. `/design-system` stays internal-only throughout.
6. **Rollback.** Because logic is shared and v1 pages are untouched until the final step,
   any cut-over is reversible by repointing the landing back to v1.

**Protected during migration:** commits `94a89d0` and `559d89a` are never amended; `main`
is never checked out or pushed to directly; Vercel configuration is untouched; the lockfile
is not modified without an explicit, justified dependency change.

## 12. Acceptance criteria

**Experience**
- [ ] Every persona `/v2` home shows a compact Chief-of-Staff brief **and** a working
      primary workspace within the first 1440×900 and 1024px viewports (no scroll to reach work).
- [ ] The brief answers all nine questions (changed / why / attention / decide / next /
      owner / by when / blocks / evidence) consistently across all eight personas.
- [ ] A user can follow **K-201** across all relevant personas without losing plant, unit,
      asset, date range, decision, or work context.
- [ ] No page reads as a generic dashboard/card grid; no design-system route in customer nav.

**Governance & trust**
- [ ] Approvals are capability-gated, record the active persona, and never auto-execute.
- [ ] Every metric/claim carries provenance and links to evidence; trust boundary legible.
- [ ] Unavailable data is stated honestly (source/integration state), never fabricated.
- [ ] The assistant is persona/context-aware, proposes but never executes/approves, and is
      explicit about freshness.

**Visual & interaction**
- [ ] Matches the visual system in §8 (enterprise blue/neutral, no gradients/glass, status
      colour only for meaning, tabular numbers) in both light and dark.
- [ ] Standardised selected/hover/focus/disabled/stale/offline/restricted states on every
      list, record, and control.

**Quality & non-destruction**
- [ ] Existing routes keep working throughout `/v2` development.
- [ ] `npm run typecheck`, `npm test`, `npm run build` pass (once the lockfile blocker in
      §13 is resolved).
- [ ] AA accessibility: colour-not-alone, keyboard operability, visible focus, contrast.
- [ ] No business logic copied into UI components; `/v2` consumes existing services only.

## 13. Risks and open product decisions

**Environment / technical risk — RESOLVED in Phase 0.5.**
- **Lockfile drift.** `npm ci` failed because `package-lock.json` was out of sync: the
  floating transitive chain `unrs-resolver` (dev) → optional `@unrs/resolver-binding-wasm32-wasi`
  → `@napi-rs/wasm-runtime ^1.1.4` now resolves to a build requiring `@emnapi/core@1.11.2`
  and `@emnapi/runtime@1.11.2`, which were **absent** from the lock (it pinned nested
  `@emnapi/*@1.10.0`). These are **dev-only, optional (wasm)** transitive packages. Repaired
  in Phase 0.5 via a **lockfile-only** reconciliation (`npm install --package-lock-only
  --ignore-scripts`) — no `package.json` change, no direct-dependency change. See the Phase
  0.5 recovery report for the full diff and baseline verification.

**Product decisions — RECORDED (accepted, Phase 0.5).**
1. **AI value split — ACCEPTED.** Plant Manager receives *Value Realisation* (validated
   outcomes, decisions supported, projected vs realised value, outstanding validation).
   Token usage, provider cost, model runtime, inference ledgers, and Return on Token Spend
   remain inside the **AI Control Tower Administrator** experience. Technical AI economics
   are **not** exposed in routine operational navigation. (Retire the `/ai-economics` stub
   in `/v2`.)
2. **Routing & migration — ACCEPTED.** Build the new experience under `/v2/**`. Existing
   routes remain untouched until `/v2` passes product, visual, accessibility, and regression
   review. **No feature flag** during the initial parallel build. Cut-over happens route by
   route after approval.
3. **Navigation — ACCEPTED.** The typed **persona registry remains the single source of
   truth**. Do **not** create a second, hard-coded `/v2` navigation system. Extend registry
   metadata only when `/v2` requires a genuinely new navigation attribute.
4. **Design-system route — ACCEPTED.** Preserve design-system components, documentation,
   tokens, and reusable components for development. `/design-system` must **not** remain a
   normal customer-facing production route; propose a development-only or explicitly guarded
   internal showcase mechanism in the relevant implementation phase. Do not remove the
   underlying tokens or components.
5. **Context persistence — ACCEPTED.** **URL/query parameters** carry shareable operational
   context (plant, unit, asset, time range, shift, selected record, relevant tab).
   **Cookies** may persist persona and theme for server-readable initial render. **Client
   state** is limited to ephemeral UI state (open drawers, expanded evidence, unsent
   assistant text). Authoritative operational state is **never** placed only in browser
   storage.
6. **Multi-asset direction — ACCEPTED.** **K-201 remains the first complete vertical
   reference story.** New `/v2` components and services must be **asset-agnostic and
   data-driven** — no asset-tag conditionals in generic UI components. Multi-asset portfolio
   and brief structures must be supported by **contracts**, even if the seed initially
   provides richer evidence for K-201.
7. **Proposed actions — ACCEPTED.** The assistant and Chief of Staff may recommend or prepare
   an action, but every operational action must route to an **existing governed confirmation
   or approval** experience. **No** assistant-side approval, autonomous execution, CMMS
   mutation, inventory mutation, Snowflake mutation, or operational write-back in this phase.

---

## Appendix A — Route-by-route comparison

Format: **Existing route → accountable persona → current problem → proposed /v2 route →
primary job to be done → source of truth.**

| Existing route | Accountable persona | Current problem | Proposed /v2 route | Primary job to be done | Source of truth |
|---|---|---|---|---|---|
| `/` | all (router) | Bare redirect only | `/v2` | Land the active persona in their workspace, context-aware | `personas/registry` + `routing.ts`, middleware |
| `/plant-overview` | Plant Manager | Home leans toward summary cards; work not first-viewport | `/v2/plant` | Decide what needs my authority; see plant risk & readiness | `getCommandCenter()` |
| `/shift` | Shift Supervisor | Shift-grain gaps not clearly framed; layout ad-hoc | `/v2/shift` | Run the unit safely this shift; act on deviations | shift metrics + `getCommandCenter()` |
| `/reliability` | Reliability Manager | Strong page but bespoke scaffolding; density inconsistent with peers | `/v2/reliability` | Approve/triage reliability decisions; manage risk portfolio | `getCommandCenter()`, risk engine |
| `/watchlist` | Reliability Engineer | Needs tighter evidence-capture flow into recommendation | `/v2/watchlist` | Investigate deteriorating assets; draft evidence-backed recs | `Asset360Model`, risk engine |
| `/portfolio` | Reliability Manager | Overlaps with reliability home; role/scope unclear | `/v2/portfolio` | Rank and manage the full asset-risk portfolio | `getCommandCenter()`, risk engine |
| `/planning` | Maintenance Planner | Execution-readiness/blocker framing inconsistent | `/v2/planning` | Turn approved work into ready-to-execute job plans | work orders, spares, inventory |
| `/materials` | Materials & Spares Coordinator | Expedite/blocker linkage to work not always explicit | `/v2/materials` | Ensure spares available when work needs them; expedite | spare parts, inventory balances |
| `/turnaround` | Turnaround Manager | Readiness/critical-path density can improve | `/v2/turnaround` | Freeze scope, manage readiness & critical path | `TurnaroundSummary` |
| `/turnaround-candidates` | Reliability & Turnaround Managers | Ownership shared; entry unclear | `/v2/turnaround-candidates` | Promote emerging asset risks into turnaround scope | turnaround work packages (condition-originated) |
| `/oee` | Operations (shared) | Loss-tree/exposure link to assets can tighten | `/v2/oee` | See where availability/speed/quality are lost, in $ | OEE engine + `CommandCenterModel.oee` |
| `/assets/[tag]` | Reliability Eng/Mgr, Planner (shared) | The record page; thread not yet first-class | `/v2/assets/[tag]` | Everything about one asset; the Signal→Value thread | `getAsset360(tag)` |
| `/value-realisation` | Plant/Reliability leadership | Overlaps conceptually with agent-control value tab | `/v2/value-realisation` | Realised value from validated outcomes (no token ledgers) | `getRots()`, operational outcomes |
| `/agent-control` | AI Control Tower Admin | Value/cost vs leadership value boundary blurred | `/v2/agent-control` | Govern agents, runtime, and token economics | `getRots()`, AI runtime |
| `/ai-economics` | AI Admin | Redirect stub — dead concept in customer IA | (retire; folded into `/v2/agent-control?tab=value-cost`) | — | — |
| `/design-system` | internal/dev | Reachable customer route; must not be in nav | (internal-only, not customer nav) | Component gallery for developers | design tokens / UI kit |
| `/api/voice/brief-conversation` | all (governed assistant) | — (reuse as-is) | unchanged | Governed, grounded conversational answers | voice server + repositories |
| `/api/ai/explain` | all (governed AI) | — (reuse as-is) | unchanged | Grounded AI explanation of evidence | AI service + grounding |

---

## Appendix B — Phase 0 report

**Files/areas inspected:** `package.json`; `middleware.ts`; `src/app/**` (layout, root
redirect, `plant-overview`, `shift`, `reliability`, `watchlist`, `portfolio`, `planning`,
`materials`, `turnaround`, `turnaround-candidates`, `oee`, `assets/[tag]`,
`value-realisation`, `agent-control`, `ai-economics`, `design-system`, `api/voice`,
`api/ai`); `src/personas/**` (`registry`, `routing`, `types`, `capabilities`,
`authorization`); `src/brief/service.ts` + `types.ts`; `src/domain/**`; `src/engines/**`;
`src/data/**`; `src/voice/**`; `src/ai/**`; `src/components/**` (layout shell, `ui/enterprise`,
`ui/queues`, `brief/MyBrief`, landing, voice); `src/design-system/tokens.css`; test inventory;
existing docs (`information-architecture.md`, IA/persona docs).

**Architecture understood:** clean layering — data/engines/domain → repository view models →
persona registry & capability model → Chief-of-Staff brief → server-grounded governed voice
→ presentation. Persona behaviour, navigation, brief filtering, approvals, and landing are
all **data-driven from the registry**. Trust boundaries and provenance are first-class.

**Reusable foundations:** all engines, repositories, domain model, persona/capability model,
brief service, voice API, approval controls, design tokens (light+dark), and the enterprise
UI kit (`enterprise.tsx`, `queues.tsx`, tables, badges, charts, indicators, evidence).

**Product inconsistencies found:** ad-hoc per-page layout scaffolding; AI-value routing
overlap (`/ai-economics` ↔ agent-control value tab ↔ `/value-realisation`); `/design-system`
reachable as a route; persona homes can read as separate dashboards; cross-persona thread
exists in routing but is not surfaced as a first-class, visible thread.

**Proposed route map:** see §4 and Appendix A.

**Implementation phases (proposed, post-approval):** Phase 1 — `/v2` shell + context bar +
registry-driven nav + workspace template. Phase 2 — Reliability + Asset 360 + the K-201
thread (hero path). Phase 3 — remaining persona workspaces. Phase 4 — OEE, Value Realisation,
Agent Control. Phase 5 — assistant polish, a11y/visual QA, `/v2` tests. Phase 6 — phased
cut-over per §11.

**Unresolved decisions:** the lockfile resync authorisation (§13 blocking) and product
decisions 1–7 in §13.

**Git status at end of Phase 0:** branch `amit1858-enterprise-experience-rebuild` (renamed
for this rebuild; not `main`); working tree contained only this new document; origin =
`https://github.com/amit1858/asset-supervision-os.git` (private). No commit, no push, no
deploy, no dependency/lockfile change, no customer-facing code edited.

---

## Appendix C � Phase 0.5 Environment & Lockfile Recovery Report

**Root cause.** `npm ci` failed on a stale lockfile. The dev-only, optional wasm chain
`unrs-resolver` (via eslint-config-next's TS import resolver) ? `@unrs/resolver-binding-wasm32-wasi`
? `@napi-rs/wasm-runtime ^1.1.4` resolves to a build requiring `@emnapi/core@1.11.2` and
`@emnapi/runtime@1.11.2`, which were absent from `package-lock.json` (it pinned nested
`@emnapi/*@1.10.0`). Genuine transitive lockfile drift � not this-platform missing binaries,
not an npm-version defect.

- **Node:** v24.16.0 � **npm:** 11.13.0 � **lockfileVersion:** 3 � packageManager/engines: absent.
- **Repair (lockfile-only):** `npm install --package-lock-only --ignore-scripts`. No manual
  lockfile edits; no `package.json` change; no direct-dependency add/remove/upgrade; no
  `npm audit fix`; no `--force`/`--legacy-peer-deps`.
- **package-lock diff:** 1 file, +26/-14 lines. **Added:** `@emnapi/core@1.11.2`,
  `@emnapi/runtime@1.11.2` (both dev + optional). **Removed:** none. **Version changes:**
  none. **Integrity/resolution changes to existing packages:** none. Remaining hunks only
  recompute npm's internal `"peer": true` flags. Direct dependencies unchanged; lockfileVersion
  unchanged.
- **package.json:** byte-identical (SHA-256 unchanged).
- **npm ci:** success (added 468 packages). Warnings are deprecation/advisory only
  (inflight, glob@10, @humanwhocodes/object-schema, eslint@8.57.1 EOL, next@14.2.33 advisory);
  no lifecycle install scripts in the project; `node_modules` git-ignored.
- **Baseline:** typecheck ? (0) � lint ? (no warnings/errors) � **tests 125 passed / 18 files** ?
  � seed:verify `deterministic: true`, K-201 values unchanged (vibration 8.99 mm/s, bearing
  91.4 �C, risk 68, projected 17.93 d, OEE 91.2%, exposure $1,620,156, ROTS mock $0) �
  build ? (19 routes, all server-rendered; voice + AI APIs server-side).
- **Git:** HEAD still `559d89a` (protected `94a89d0`/`559d89a` intact); tracked change =
  `package-lock.json` only; untracked = this blueprint. No commit, push, or deploy; no
  customer-facing code changed; Vercel untouched.

**Standardisation recommendation (CORRECTED in Phase 0.6).** The earlier note that Node 24
is non-LTS/unsupported by Vercel was incorrect. As of July 2026 Node 24 is LTS, is Vercel's
default for new projects, and Node 20 is EOL (Vercel deprecating Node 20 for new deployments
on 1 Oct 2026). Standardise on **Node 24.x + npm 11.13.0 + lockfileVersion 3**, pinned in
Phase 0.6 via `"engines": { "node": "24.x" }` and `"packageManager": "npm@11.13.0"`.
Separately note (not changed here): lockfile `resolved` URLs point to a private Azure DevOps mirror
(`*.pkgs.visualstudio.com`), which a public Vercel build cannot reach � flag for the
deployment/registry decision before any cut-over.

---

## Appendix D — Phase 0.6 runtime standardisation & registry report

**Runtime contract (applied).** `package.json` now pins `"engines": { "node": "24.x" }` and
`"packageManager": "npm@11.13.0"`. `engines.node` controls the Vercel Node major (Vercel will
select a supported Node 24 patch, not necessarily the local `24.16.0`); `packageManager`
documents/standardises the npm version. No dependencies, scripts, name, or version changed.

**Environment.** Node v24.16.0 · npm 11.13.0 · lockfileVersion 3 · Windows **ARM64**.

**Baseline re-verification (all green).** typecheck ✓ · lint ✓ (0 warnings/errors) ·
**125/125 tests (18 files)** · seed deterministic ✓ (K-201 unchanged: risk 68, health 52,
17.93 days-to-critical, OEE 91.2%, exposure $1,620,156) · build ✓ (19 routes; `/api/ai/explain`
and `/api/voice/brief-conversation` remain server-side, 0 B client). No customer-facing source
changed.

**Lockfile diff (narrow & verified).** Only two changes vs HEAD: (1) root `engines` metadata;
(2) the Phase 0.5 emnapi repair (`@emnapi/core@1.11.2`, `@emnapi/runtime@1.11.2`, dev/optional).
Version lines added: 2 (both emnapi); version lines removed: 0 → **zero drift** to existing
packages. Remaining churn is npm re-normalising `"peer": true` key ordering. lockfileVersion
stays 3.

**Registry portability — BLOCKED (key remaining risk).** Registry-host counts are unchanged:
**576 private `*.pkgs.visualstudio.com` refs, 0 public `registry.npmjs.org`**. The supported
normalisation (`npm install --package-lock-only --ignore-scripts --registry=…npmjs.org
--replace-registry-host=always`) was a no-op because the already-satisfied pinned tree reports
"up to date" and npm does not re-resolve existing `resolved` URLs. Root environmental cause:
this Windows **ARM64** corporate machine cannot reach `registry.npmjs.org` directly — TLS
handshake fails ("Could not create SSL/TLS secure channel"); **all** npm traffic is forced
through the private Microsoft mirror. Therefore a *valid, verified* public-registry lockfile
(npmjs URLs + integrity) **cannot be produced on this machine**. Per Gate 3's stop-condition, no
manual URL/integrity rewrite or lockfile deletion was performed. **Recommended remediation:**
run the host normalisation in an environment with public npmjs access (a CI runner or an
off-corporate-network machine), then commit that portable lockfile before any Vercel cut-over.

**Security audit (`npm audit --json`, read-only; no fix run).** 29 findings: 1 critical, 23
high, 5 moderate. **Production dependencies:** only **`next@14.2.33`** (high; fix = next 16 =
major). **All other findings are dev/build tooling** (transitive of `eslint@8.57.1` EOL,
`vitest@2.1.2`, `playwright`, `postcss`, `tsx`, `@vitejs/plugin-react`, esbuild/vite chain).
Direct-dep fixes requiring a major upgrade: eslint→10, eslint-config-next→16, next→16,
vitest→4. Non-major fixes available: `@vitejs/plugin-react`→4.7.0, `tsx`→4.23.1, `playwright`.
**Deferred as future technical work** (not mixed into the v2 rebuild): Next.js 14→major upgrade
and ESLint 8 EOL migration.
