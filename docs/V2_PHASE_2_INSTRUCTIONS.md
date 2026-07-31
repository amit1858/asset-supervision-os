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

- **Allowed:** new files under `src/v2/**`, `src/components/v2/**`,
  `src/app/v2/**`; new `src/v2/*.test.ts`; QA scripts under `scripts/**`;
  documentation under `docs/**`.
- **Extend, don't fork:** consume the existing engines, repository, registry,
  capability model, brief service, and voice API. Do not copy business logic into
  components. Do not retune engine constants for visual effect.

## 4. What you must not change

- Any v1 / customer-facing route, component, layout, middleware, engine,
  repository, or the persona registry's authority model.
- Determinism: the seed and protected K-201 values (see the plan §9).
- The governed-action boundary: no assistant-side approval, no autonomous
  execution, no CMMS/inventory/Snowflake mutation, no write-back, no live speech,
  no live external APIs, no Snowflake connection, no new dependencies.
- The AI value split: no token/cost/runtime/ROTS content outside the AI Control
  Tower.

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
