# Persona Capability Matrix

Authorization in Asset Supervision OS is expressed with **capabilities**, never
with persona-name checks. The capability vocabulary is defined once in
`src/personas/types.ts` (the `Capability` union) with metadata in
`src/personas/capabilities.ts`, and each persona's held capabilities live in
`src/personas/registry.ts`.

## Capability vocabulary (21)

**Authority** capabilities gate approvals, instructions, validation, and runtime
configuration (`authority: true` in `capabilities.ts`). Rows follow the order of
the `CAPABILITIES` record.

| # | Capability ID | Label | Description | Authority |
| --- | --- | --- | --- | :---: |
| 1 | `view_plant_performance` | View & manage plant performance | Plant/unit performance authority: OEE, losses, and financial impact across the unit. | |
| 2 | `view_oee_impact` | View OEE impact (read-only) | Read-only visibility of asset-linked OEE and production impact. | |
| 3 | `view_asset_condition` | View asset condition | See asset health, sensor trends, and condition events. | |
| 4 | `view_work_planning` | View work planning (read-only) | Read-only visibility of work orders, material demand, and planning context. | |
| 5 | `view_value_realisation` | View value realisation | See validated operational outcomes, realised value, decisions supported, and outstanding validation. | |
| 6 | `investigate_failure_mode` | Investigate failure mode | Open technical evidence and failure-mode investigation. | |
| 7 | `create_reliability_recommendation` | Create reliability recommendation | Author an evidence-backed reliability recommendation. | |
| 8 | `approve_reliability_decision` | Approve reliability decision | Approve, modify, or reject a reliability recommendation. | ✓ |
| 9 | `issue_operating_instruction` | Issue operating instruction | Issue an operating instruction to the shift. | ✓ |
| 10 | `create_work_request` | Create work request | Raise a work request against an asset. | |
| 11 | `prepare_work_order` | Prepare work order | Prepare and schedule a work order. | |
| 12 | `manage_job_plan` | Manage job plan | Build and manage job plans and task lists. | |
| 13 | `reserve_spare` | Reserve spare | Reserve a spare part against a work order. | |
| 14 | `expedite_material` | Expedite material | Expedite procurement of a critical material. | |
| 15 | `modify_turnaround_scope` | Modify turnaround scope | Add or change turnaround work packages. | |
| 16 | `approve_turnaround_scope` | Approve turnaround scope | Freeze and approve turnaround scope. | ✓ |
| 17 | `monitor_agent_runs` | Monitor AI runtime activity | Monitor AI runtime activity, inference runs, prompts, and health. | |
| 18 | `review_ai_evidence` | Review AI evidence | Review the evidence grounding an AI explanation. | |
| 19 | `configure_model_runtime` | Configure model runtime | Configure providers, models, and runtimes. | ✓ |
| 20 | `view_token_economics` | View token economics | View Return on Token Spend and AI cost accounting (ledgers, provider pricing). | |
| 21 | `validate_operational_outcome` | Validate operational outcome | Validate an operational outcome and realised value. | ✓ |

## Capability × persona matrix

Columns follow `PERSONA_ORDER`. A ✓ means the persona's `capabilities` array in
the registry contains that capability. This 21 × 8 grid is derived strictly from
each persona's `capabilities` array in `src/personas/registry.ts`.

| Capability | Plant Manager | Operations Shift Supervisor | Reliability Manager | Reliability Engineer | Maintenance Planner | Materials & Spares Coord. | Turnaround Manager | AI Control Tower Admin |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `view_plant_performance` | ✓ | ✓ | ✓ | | | | ✓ | |
| `view_oee_impact` | ✓ | | | ✓ | | | | |
| `view_asset_condition` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| `view_work_planning` | | | | | | ✓ | | |
| `view_value_realisation` | ✓ | | | | | | | |
| `investigate_failure_mode` | | | ✓ | ✓ | | | | |
| `create_reliability_recommendation` | | | ✓ | ✓ | | | | |
| `approve_reliability_decision` ✓ | ✓ | | ✓ | | | | | |
| `issue_operating_instruction` ✓ | | ✓ | | | | | | |
| `create_work_request` | | ✓ | ✓ | ✓ | ✓ | | | |
| `prepare_work_order` | | | | | ✓ | | | |
| `manage_job_plan` | | | | | ✓ | | | |
| `reserve_spare` | | | | | ✓ | ✓ | | |
| `expedite_material` | | | | | | ✓ | | |
| `modify_turnaround_scope` | | | | | | | ✓ | |
| `approve_turnaround_scope` ✓ | ✓ | | | | | | ✓ | |
| `monitor_agent_runs` | | | | | | | | ✓ |
| `review_ai_evidence` | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ |
| `configure_model_runtime` ✓ | | | | | | | | ✓ |
| `view_token_economics` | | | | | | | | ✓ |
| `validate_operational_outcome` ✓ | ✓ | | ✓ | | | | | |

*A ✓ next to a capability name in the leftmost column marks an **authority**
capability.*

### Approval authority subsets [^authority]

[^authority]: Each persona's `approvalAuthority` is the subset of its capabilities
that constitute approval/authority actions:
**Plant Manager** — `approve_reliability_decision`, `approve_turnaround_scope`, `validate_operational_outcome`;
**Operations Shift Supervisor** — `issue_operating_instruction`;
**Reliability Manager** — `approve_reliability_decision`, `validate_operational_outcome`;
**Reliability Engineer** — none;
**Maintenance Planner** — none;
**Materials & Spares Coordinator** — none;
**Turnaround Manager** — `approve_turnaround_scope`;
**AI Control Tower Administrator** — `configure_model_runtime`.

## Read visibility vs. authority

Several capabilities grant **read-only visibility** into a domain without granting
the **authority** to act in it. These are deliberately distinct capabilities so a
persona can *see* context it needs without acquiring an authority it should not
hold:

- **Reliability Engineer** holds `view_oee_impact` (read-only asset-linked OEE and
  production impact) but **not** `view_plant_performance` (the plant/unit
  performance-management authority). The Engineer can read OEE impact for the
  assets they investigate; they cannot manage plant performance.
- **Materials & Spares Coordinator** holds `view_work_planning` (read-only work
  orders, material demand, and planning context) but **not** `prepare_work_order`.
  The Coordinator can see the planning context that drives material demand; they
  cannot prepare or schedule work orders (that authority stays with the
  Maintenance Planner). The Coordinator retains `reserve_spare` and
  `expedite_material`.
- **Plant Manager** holds `view_value_realisation` (validated outcomes, realised
  value, decisions supported, outstanding validation) but **not**
  `view_token_economics` — the Manager sees value realisation, not the token
  ledgers, prompts, or provider pricing that live with the AI Administrator.

None of the read-only visibility capabilities are authority capabilities
(`authority: false`).

## Enforcement

Components check **capabilities, never persona names**. The active persona is read
from the shared operational context, and capability checks flow through a single
set of helpers:

- **`personaCan(id, capability)`** (`src/personas/registry.ts`) — the pure check:
  does this persona's `capabilities` array include the capability.
- **`useCan()`** (`src/context/useCan.ts`) — a client hook bound to the active
  persona; returns `(capability) => boolean`.
- **`<Can capability=…>`** (`src/components/ui/CapabilityGate.tsx`) — renders
  children only when the active persona holds the capability (optional fallback).
- **`<RestrictedAction capability=… mode=…>`** — a capability-gated action with
  three outcomes matching the spec:
  - **available** → renders the action;
  - **read-only-with-explanation** (`mode="explain"`, the default) → renders a
    disabled control explaining that it requires the named capability;
  - **hidden** (`mode="hide"`) → renders nothing.

Because every check derives from the selected persona's definition, **switching
persona never grants a capability outside that persona's definition** — it only
changes which persona's capability set is in effect. Persona selection remains a
view/authorization concern and is enforced independently of the
`PersonaAuthorizationProvider` seam described in `docs/PERSONAS.md`.
