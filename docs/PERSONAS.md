# Personas

Asset Supervision OS is built on a **deterministic domain** — engines, data, and
computed risk are the same regardless of who is looking. **Personas** are a
presentation and authorization concern layered on top of that domain. A persona
describes **who** is using the product and **what they are accountable for**, and
it drives three things from a single source of truth (`src/personas/registry.ts`):

- the **navigation** the persona sees (`navItems`),
- the **capabilities** the persona holds (`capabilities`), and
- the **default landing route** and **operational context** the persona prefers.

## Persona selection is not authentication

Choosing a persona changes the *view* and the *capability set in effect*; it does
**not** authenticate anyone. The seam for real authentication is
`PersonaAuthorizationProvider` (`src/personas/authorization.ts`): a future
role-based provider will return the set of personas an authenticated user is
permitted to assume, and the persona selector will offer only those. Capability
checks are always enforced independently — switching persona never bypasses a
capability check.

Phase 2A ships only the `DemoAuthorizationProvider`, which permits **all**
personas and flags itself as `unrestricted` with the mode label
*"Demonstration — unrestricted persona switching."* The UI can therefore mark
free switching clearly as a demonstration convenience.

## Default persona and thread preservation

- The **default persona is the Reliability Manager** (`DEFAULT_PERSONA_ID = "reliability_manager"`).
  It owns the K-201 reliability story used throughout the demo.
- Switching persona **preserves the active asset thread**. If the current context
  has an asset tag (e.g. K-201), the incoming persona lands in its asset-relevant
  view rather than its generic home (see `personaLandingRoute`,
  `src/personas/routing.ts`, and `docs/PERSONA_INFORMATION_ARCHITECTURE.md`).

## What is documented here vs. what the UI renders

This document is the **persona design record**. Some of the fields captured here —
notably a persona's **primary questions**, its **collaborating roles**, the
**expected source systems** it reads, and any static "decisions you own" notes —
are **internal design content and are intentionally NOT rendered in the
operational UI**. The landing layout deliberately omits them
(`src/components/landing/LandingLayout.tsx`). Their intent is instead realised at
runtime through two rendered layers:

1. the **Chief of Staff brief** ("My Brief") — a governed, persona-prioritised
   briefing assembled from real facts (see `docs/CHIEF_OF_STAFF.md`), and
2. the **persona workspace** ("My Workspace") — the operational depth for that
   persona.

The fields that *do* drive the UI are `navItems`, `capabilities`, `defaultRoute`,
and `context`.

## Reading the sections below

Personas are documented in `PERSONA_ORDER`. Capability gates on nav items follow
the rule in `PersonaNavItem`: *the item only appears when the persona holds the
gating capability*. Every nav item below is gated on a capability its own persona
holds, so every listed item renders for that persona. The shared
operational-context defaults (`plantId`, `unitId`, `timeRange`, `shift`) come from
each persona's `context`. The demo plant is `plant-gc` and the demo unit is
`line-hds2`. Capabilities marked **(authority)** are `approvalAuthority` members.

---

## 1. Plant Manager

| Field | Value |
| --- | --- |
| **Display name** | Plant Manager |
| **Persona ID** | `plant_manager` |
| **Operational family** | `leadership` |
| **Description** | Site leadership accountable for safe, reliable, profitable operation of the plant. |
| **Accountability** | Overall plant safety, reliability, production, and financial performance. |
| **Default landing route** | `/plant-overview` |

**Primary questions** *(internal — not rendered in UI)*

- Is the plant safe and stable right now?
- What decisions need my authority today?
- Where is production and margin most at risk?
- Are we ready for the upcoming turnaround?

**Navigation items**

| Label | Route | Capability gate |
| --- | --- | --- |
| Plant Overview | `/plant-overview` | — |
| Reliability | `/reliability` | `view_asset_condition` |
| OEE & Losses | `/oee` | `view_plant_performance` |
| Turnaround | `/turnaround` | — |
| Value Realisation | `/value-realisation` | `view_value_realisation` |

**Capabilities:** `view_plant_performance` · `view_oee_impact` · `view_asset_condition` · `view_value_realisation` · `review_ai_evidence` · `approve_reliability_decision` **(authority)** · `approve_turnaround_scope` **(authority)** · `validate_operational_outcome` **(authority)**

> The Plant Manager holds `view_value_realisation`, not `view_token_economics`.
> Their AI-value view is validated outcomes and realised value — not token
> ledgers, prompts, pricing, or the model runtime.

**KPIs:** Plant OEE · Open-decision value at stake · Turnaround readiness · Assets in critical condition

**Collaborators** *(internal — not rendered in UI):* Reliability Manager · Turnaround Manager · Operations Shift Supervisor · AI Control Tower Administrator

**Read/write scope**

- **Read:** plant, assets, oee, turnaround, recommendations, value_realisation
- **Write:** decisions, outcomes, turnaround_approvals

**Preferred context:** plant `plant-gc` · time range `90d`

---

## 2. Operations Shift Supervisor

| Field | Value |
| --- | --- |
| **Display name** | Operations Shift Supervisor |
| **Persona ID** | `shift_supervisor` |
| **Operational family** | `operations` |
| **Description** | Front-line operations leader running the unit safely through the current shift. |
| **Accountability** | Safe, stable operation and response during the active shift. |
| **Default landing route** | `/shift` |

**Primary questions** *(internal — not rendered in UI)*

- What is happening on my unit right now?
- What needs an operating response this shift?
- Which assets are deviating from normal?
- What must I hand over to the next shift?

**Navigation items**

| Label | Route | Capability gate |
| --- | --- | --- |
| Shift Command | `/shift` | — |
| Asset Condition | `/assets/K-201` | `view_asset_condition` |
| OEE & Losses | `/oee` | `view_plant_performance` |

**Capabilities:** `view_plant_performance` · `view_asset_condition` · `issue_operating_instruction` **(authority)** · `create_work_request` · `review_ai_evidence`

**KPIs:** Unit availability · Active deviations · Open work requests · Shift OEE

**Collaborators** *(internal — not rendered in UI):* Plant Manager · Reliability Engineer · Maintenance Planner

**Read/write scope**

- **Read:** plant, assets, oee, condition_events
- **Write:** operating_instructions, work_requests

**Preferred context:** plant `plant-gc` · unit `line-hds2` · time range `shift` · shift `Day shift (06:00–18:00)`

---

## 3. Reliability Manager

*Default persona — owns the K-201 reliability story.*

| Field | Value |
| --- | --- |
| **Display name** | Reliability Manager |
| **Persona ID** | `reliability_manager` |
| **Operational family** | `reliability` |
| **Description** | Owns the asset reliability program and the reliability recommendation queue. |
| **Accountability** | Asset risk portfolio, reliability decisions, and reliability-driven value. |
| **Default landing route** | `/reliability` |

**Primary questions** *(internal — not rendered in UI)*

- Which decisions require my attention now?
- Which asset risks are time-critical?
- Is maintenance execution ready to act?
- Which risks belong in the next turnaround?

**Navigation items**

| Label | Route | Capability gate |
| --- | --- | --- |
| Reliability Command Center | `/reliability` | — |
| Asset Risk Portfolio | `/portfolio` | `view_asset_condition` |
| OEE Loss Intelligence | `/oee` | `view_plant_performance` |
| Turnaround Candidates | `/turnaround-candidates` | — |
| Asset 360 | `/assets/K-201` | `view_asset_condition` |

**Capabilities:** `view_plant_performance` · `view_asset_condition` · `investigate_failure_mode` · `create_reliability_recommendation` · `approve_reliability_decision` **(authority)** · `review_ai_evidence` · `validate_operational_outcome` **(authority)** · `create_work_request`

**KPIs:** Decisions requiring attention · Time-critical risks · Asset risk portfolio · Reliability value at stake

**Collaborators** *(internal — not rendered in UI):* Reliability Engineer · Maintenance Planner · Turnaround Manager · Plant Manager

**Read/write scope**

- **Read:** plant, assets, oee, turnaround, recommendations, ai
- **Write:** recommendations, decisions, outcomes, work_requests

**Preferred context:** plant `plant-gc` · unit `line-hds2` · time range `30d`

---

## 4. Reliability Engineer

| Field | Value |
| --- | --- |
| **Display name** | Reliability Engineer |
| **Persona ID** | `reliability_engineer` |
| **Operational family** | `reliability` |
| **Description** | Investigates asset condition and failure modes and drafts recommendations. |
| **Accountability** | Technical assessment of asset condition and failure modes. |
| **Default landing route** | `/watchlist` |

**Primary questions** *(internal — not rendered in UI)*

- Which assets on my watchlist are deteriorating?
- What is the failure mode and the evidence?
- How fast is the trend approaching critical?
- What should I recommend, and with what evidence?

**Navigation items**

| Label | Route | Capability gate |
| --- | --- | --- |
| Asset Watchlist | `/watchlist` | — |
| Asset 360 | `/assets/K-201` | `view_asset_condition` |
| OEE Impact | `/oee` | `view_oee_impact` |

**Capabilities:** `view_asset_condition` · `view_oee_impact` · `investigate_failure_mode` · `create_reliability_recommendation` · `review_ai_evidence` · `create_work_request`

> **Read visibility vs. authority:** the Engineer holds `view_oee_impact`
> (read-only asset-linked OEE and production impact) but **not**
> `view_plant_performance`. They can read OEE impact for the assets they
> investigate; they cannot manage plant performance. `approvalAuthority` is empty.

**KPIs:** Watchlist assets · Deteriorating trends · Projected time-to-critical · Drafted recommendations

**Collaborators** *(internal — not rendered in UI):* Reliability Manager · Maintenance Planner · Operations Shift Supervisor

**Read/write scope**

- **Read:** assets, condition_events, oee, recommendations, ai
- **Write:** recommendations, work_requests

**Preferred context:** plant `plant-gc` · unit `line-hds2` · time range `90d`

---

## 5. Maintenance Planner

| Field | Value |
| --- | --- |
| **Display name** | Maintenance Planner |
| **Persona ID** | `maintenance_planner` |
| **Operational family** | `maintenance` |
| **Description** | Turns approved work into ready-to-execute job plans and schedules. |
| **Accountability** | Work order preparation, job plans, and execution readiness. |
| **Default landing route** | `/planning` |

**Primary questions** *(internal — not rendered in UI)*

- What work is approved and needs planning?
- Which job plans are missing parts or labour?
- What can be scheduled this week?
- What is blocking execution readiness?

**Navigation items**

| Label | Route | Capability gate |
| --- | --- | --- |
| Planning Workbench | `/planning` | — |
| Asset 360 | `/assets/K-201` | `view_asset_condition` |
| Material Exceptions | `/materials` | `reserve_spare` |

**Capabilities:** `view_asset_condition` · `create_work_request` · `prepare_work_order` · `manage_job_plan` · `reserve_spare` · `review_ai_evidence`

**KPIs:** Work orders to plan · Job-plan readiness · Parts-constrained orders · Scheduled this week

**Collaborators** *(internal — not rendered in UI):* Reliability Manager · Materials & Spares Coordinator · Operations Shift Supervisor

**Read/write scope**

- **Read:** assets, work_orders, spares, inventory
- **Write:** work_orders, job_plans, spare_reservations

**Preferred context:** plant `plant-gc` · unit `line-hds2` · time range `7d`

---

## 6. Materials & Spares Coordinator

| Field | Value |
| --- | --- |
| **Display name** | Materials & Spares Coordinator |
| **Persona ID** | `materials_coordinator` |
| **Operational family** | `materials` |
| **Description** | Ensures critical spares and materials are available when work needs them. |
| **Accountability** | Spare availability, reservations, and material expedites. |
| **Default landing route** | `/materials` |

**Primary questions** *(internal — not rendered in UI)*

- Which work is blocked by materials?
- Which critical spares are below reorder point?
- What must be expedited, and by when?
- What is reserved against upcoming work?

**Navigation items**

| Label | Route | Capability gate |
| --- | --- | --- |
| Material Exceptions | `/materials` | — |
| Planning Context | `/planning` | `view_work_planning` |

**Capabilities:** `view_asset_condition` · `view_work_planning` · `reserve_spare` · `expedite_material`

> **Read visibility vs. authority:** the Coordinator holds `view_work_planning`
> (read-only work orders, material demand, and planning context) but **not**
> `prepare_work_order`. Their *Planning Context* link is a read-only view; work
> orders are prepared by the Maintenance Planner. They keep `reserve_spare` and
> `expedite_material`. `approvalAuthority` is empty.

**KPIs:** Material-blocked work · Critical spares below reorder · Open expedites · Longest lead time

**Collaborators** *(internal — not rendered in UI):* Maintenance Planner · Turnaround Manager · Reliability Manager

**Read/write scope**

- **Read:** spares, inventory, work_orders
- **Write:** spare_reservations, expedites

**Preferred context:** plant `plant-gc` · time range `30d`

---

## 7. Turnaround Manager

| Field | Value |
| --- | --- |
| **Display name** | Turnaround Manager |
| **Persona ID** | `turnaround_manager` |
| **Operational family** | `turnaround` |
| **Description** | Owns turnaround scope, readiness, and execution for the plant. |
| **Accountability** | Turnaround scope, readiness, schedule, and cost. |
| **Default landing route** | `/turnaround` |

**Primary questions** *(internal — not rendered in UI)*

- Is scope frozen and ready by the freeze date?
- Which packages are on the critical path and at risk?
- Which emerging asset risks belong in scope?
- Where is schedule and cost exposure?

**Navigation items**

| Label | Route | Capability gate |
| --- | --- | --- |
| Turnaround Control Tower | `/turnaround` | — |
| Turnaround Candidates | `/turnaround-candidates` | — |
| OEE Loss Intelligence | `/oee` | `view_plant_performance` |

**Capabilities:** `view_plant_performance` · `view_asset_condition` · `modify_turnaround_scope` · `approve_turnaround_scope` **(authority)** · `review_ai_evidence`

**KPIs:** Scope readiness · Critical-path at risk · Scoped cost vs budget · Days to scope freeze

**Collaborators** *(internal — not rendered in UI):* Reliability Manager · Materials & Spares Coordinator · Plant Manager

**Read/write scope**

- **Read:** turnaround, assets, work_orders, spares
- **Write:** turnaround_scope, turnaround_approvals

**Preferred context:** plant `plant-gc` · time range `90d`

---

## 8. AI Control Tower Administrator

| Field | Value |
| --- | --- |
| **Display name** | AI Control Tower Administrator |
| **Persona ID** | `ai_admin` |
| **Operational family** | `ai_governance` |
| **Description** | Governs the AI agents, model runtime, prompt versions, and token economics. |
| **Accountability** | AI agent health, model runtime configuration, and AI value governance. |
| **Default landing route** | `/agent-control` |

**Primary questions** *(internal — not rendered in UI)*

- Are the agents healthy and grounded in evidence?
- What is the actual vs estimated cost of AI?
- Which providers/models are configured?
- Is projected value being separated from realised?

**Navigation items**

| Label | Route | Capability gate |
| --- | --- | --- |
| Agent Control Tower | `/agent-control` | — |
| Value & Cost | `/agent-control?tab=value-cost` | `view_token_economics` |
| Model Runtime | `/agent-control?tab=runtime` | `configure_model_runtime` |

**Capabilities:** `monitor_agent_runs` · `review_ai_evidence` · `configure_model_runtime` **(authority)** · `view_token_economics`

> The Agent Control Tower's default tab is **AI Runtime Activity**, whose table is
> the **Inference Ledger**. In Phase 2A the recorded activity is **inference
> calls** by the mock deterministic explainer — not autonomous or tool-using agent
> runs. See `docs/PERSONA_INFORMATION_ARCHITECTURE.md` for the tab map.

**KPIs:** Actual AI cost · Estimated provider cost · Acceptance rate · Agent run health

**Collaborators** *(internal — not rendered in UI):* Plant Manager · Reliability Manager

**Read/write scope**

- **Read:** ai, prompts, interactions, recommendations
- **Write:** model_runtime, prompt_versions

**Preferred context:** plant `plant-gc` · time range `30d`
