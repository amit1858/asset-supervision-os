# V2 Phase 2 — Build Instructions & Guardrails

Status: **Planning checkpoint** · Branch: `copilot/v2-phase-2-k201-planning`
(from Phase 1 commit `08370a5`)

This is the operating manual for the Phase 2 build. It is instruction-only and
changes no application code. Pair it with `docs/V2_PHASE_2_K201_PLAN.md` (the
scope contract). If any instruction here conflicts with a Phase 0–1 product
decision, the product decision wins — stop and confirm.

---

## 1. Environment contract

- Node **24.x**, npm **11.13.0**, package-lock **v3**. Windows-first (PowerShell:
  no `&&`; use `;` and `if ($?) { ... }`).
- Public npm registry only; do not reintroduce a private mirror or edit the
  lockfile except for an explicitly justified, approved dependency change.
- Before building each gate, run: `node --version`, `npm --version`,
  `git branch --show-current`, `git status`, then `npm ci`.

## 2. Branch & Git safety

- Work only on the approved Phase 2 build branch when implementation starts. This
  planning checkpoint lives on `copilot/v2-phase-2-k201-planning`.
- Never commit or push to `main`. Never amend protected commits `94a89d0` /
  `559d89a`. Do not touch the Phase 1 branch history.
- No PR, merge, deploy, or Vercel change without explicit approval.
- Keep commits scoped and message-clear; include the standard Co-authored-by
  trailer.

## 3. What you may change

- **Allowed:** new files under `src/v2/**` (including a new **`src/v2/domain/**`**
  governed-recomputation layer — value envelope, S1–S9 state machine, versioned
  calculation ledger, evidence, transition authority guards, append-only audit),
  `src/components/v2/**`, `src/app/v2/**`; new `src/v2/*.test.ts`; QA scripts
  under `scripts/**`; documentation under `docs/**`.
- **Extend, don't fork:** consume the existing engines, repository, registry,
  capability model, brief service, and voice API. The new `src/v2/domain/**` layer
  **delegates every calculation to `engines/*`** (it records and orders results;
  it never re-implements risk/OEE/ROTS/value math) and **references** existing
  domain entity ids rather than copying entity fields. Do not copy business logic
  into components. Do not retune engine constants for visual effect. See
  `docs/V2_PHASE_2_K201_TECHNICAL_PLAN.md`.

> **Correction:** an earlier draft framed Phase 2 as "presentation layer only /
> no domain change." That is withdrawn. Phase 2 **does** add the governed domain
> layer above, additively under `src/v2/domain/**`, while keeping v1 and the seed
> untouched.

## 4. What you must not change

- Any v1 / customer-facing route, component, layout, middleware, engine, or
  repository. **Determinism of the existing engines/seed is inviolable** — no
  engine constant or seed number is retuned to match a copied spec.
- The persona registry's authority model — **except** the one owner-approved
  additive extension in Decision 2: a **new** authority capability
  `endorse_high_exposure_reliability_decision` (`authority: true`) added to the
  `Capability` union (`src/personas/types.ts`), `CAPABILITIES`
  (`src/personas/capabilities.ts`), and the **Plant Manager**'s `approvalAuthority`
  only (`src/personas/registry.ts`). No existing capability's meaning or
  assignment changes; `approve_reliability_decision` is **not** reused for
  endorsement. Persona switching still never grants authority.
- Determinism: the seed and protected K-201 values (see the plan §9). Golden:
  K-201 projected `$1,094,400`, portfolio projected value enabled `$1,449,400`;
  `$1,458,140` is withdrawn and must not appear anywhere.
- The governed-action boundary: no assistant-side approval, **no
  endorsement/execution/validation by the assistant**, no CMMS/inventory/Snowflake
  mutation, no write-back, no live speech, no live external APIs, no Snowflake
  connection, no new dependencies.
- The AI value split: no token/cost/runtime/ROTS content outside the AI Control
  Tower.

New governed-domain policies are **versioned constants** under
`src/v2/domain/policy/**` — `exposure-threshold.v1 = $1,000,000` (`≥` semantics;
K-201 `$1,620,156` crosses it) and source-specific freshness — see
`V2_PHASE_2_K201_TECHNICAL_PLAN.md` §9–§10. **Source mode and freshness are
orthogonal:** `sourceMode` is typed as the existing `SourceMode`
(`local`\|`snowflake`), **not** `IntegrationState`; integration health is a
separate source/integration assessment and is **not** a `ValueEnvelope` field
(owner reconciliation — Slice 2.1a as built — 2026-08-02); `freshness`
(`fresh|stale|missing|unknown`, **never** `synthetic`) is temporal. A synthetic
observation may be fresh or stale; synthetic disclosure is expressed by that
separate integration assessment. Windows are selected by `freshnessClass`:
condition signals 15 min; production/OEE, CMMS,
inventory, turnaround, financial 24 h, evaluated against the canonical
`ANCHOR_NOW = "2026-07-27T00:00:00.000Z"` clock passed explicitly (never
`Date.now()`).

## 5. Context & state rules

- Shareable operational context (plant, unit, asset, time range, shift, selected
  record, tab) lives in the **URL/query**. Persona and theme persist in
  **cookies** for server-readable first render. Only ephemeral UI (open drawers,
  expanded evidence, unsent assistant text) lives in client state.
- Navigation, capability gating, and the operational thread come from
  `src/v2/{nav,access,thread,routes}.ts` — driven by the registry, not hard-coded.

## 6. Definition of done per surface

1. Reads real values from the engines/repository; unavailable data labelled, not
   faked; source posture (`seeded`/`derived`/`not_connected`) shown honestly.
2. Provenance visible: measured / calculated / predicted / AI-generated /
   human-approved distinctions preserved; AI rationale labelled.
3. Every action is prepared-only and routes to the existing governed confirmation.
4. Accessible (keyboard/focus/contrast), responsive to 1024px, light/dark parity,
   tabular numerals, status by text+tone not colour alone.
5. New pure logic covered by node tests; shell-guard invariants intact.
6. Full baseline green: `typecheck`, `lint`, `test`, `seed:verify`, `build`,
   `qa:v2` (Edge `channel:"msedge"`), `qa:v2:http`.

## 7. Per-gate checklist (repeat for each 2.x)

- [ ] Confirm branch, clean tree, `npm ci` leaves the lockfile unchanged.
- [ ] Build the surface from the plan's scope contract for that route.
- [ ] Add/adjust node tests; keep guards passing.
- [ ] Run the full baseline + Edge visual QA; capture screenshots under `qa/**`.
- [ ] Human-review full-size screenshots for enterprise quality and honesty.
- [ ] Apply targeted `src/components/v2/**` / shared-token fixes only.
- [ ] Re-verify; report changed files, results, and Git status. Stop for review.

## 8. Commit hygiene / never stage

Do not stage or commit: `node_modules`, `.next`, `qa/**` screenshots, `.env*`,
`.npmrc`, temporary npm caches, QA screenshots, credentials/tokens, Vercel files,
or local tool metadata. Scan staged content for secrets, personal filesystem
paths, and deployment URLs before every commit.

## 9. Escalation

Stop and confirm before: adding any dependency, changing the lockfile, touching
v1 or the registry authority model, wiring a governed-action target, or anything
that would alter a protected determinism value. When in doubt, prefer a smaller,
reversible change and ask.
