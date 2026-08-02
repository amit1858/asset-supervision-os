# Asset Supervision OS — Phase 2 Product Plan
## The Complete K-201 Vertical

*Product & Architecture Planning · Physical Operations Intelligence · Approved v1*

> **Scope guard:** Phase 2 applies to `/v2` only. V1 remains protected and unchanged; nothing in this plan merges to the protected `main` branch.

> **⚠️ Owner reconciliation (2026-07-31) — governed figures and policies are fixed in `../V2_PHASE_2_K201_TECHNICAL_PLAN.md`:**
> - **Projected value (scope-specific labels).** K-201 surfaces attach **`$1,094,400`** labelled **"K-201 projected value enabled"**; Portfolio / Value Realisation surfaces show **`$1,449,400`** labelled **"Portfolio projected value enabled — 6 recommendations"**; **value at stake `$1,620,156`** stays structurally & visually distinct. The figure `$1,458,140` and any `× 0.90` factor are **withdrawn**; no engine or seed changed; none presented as AI-created value. (Tech plan §8.)
> - **Approval ≠ endorsement.** Reliability Manager **approves**; Plant Manager **endorses** via a **new** capability `endorse_high_exposure_reliability_decision` when the versioned **`exposure-threshold.v1 = $1,000,000`** policy is crossed (`≥` semantics; K-201 `$1,620,156` crosses it). Neither persona selection nor the assistant grants authority. (Tech plan §9.)
> - **Source mode ≠ freshness (five orthogonal dimensions).** `sourceMode` is typed as the existing **`SourceMode`** (`local`\|`snowflake` — how/where sourced), **not** `IntegrationState`; integration health is assessed **separately** by the source/integration model and is **not** a `ValueEnvelope` field (owner reconciliation — Slice 2.1a as built — 2026-08-02). `freshness` (`fresh|stale|missing|unknown`, never `synthetic`) is temporal relative to `asOf`. `provenance` and derived `trustClassification` are the epistemic/presentation axes. Windows are selected by `freshnessClass`: condition signals 15 min; production/OEE, CMMS, inventory, turnaround, financial 24 h; evaluated against the canonical **`ANCHOR_NOW = 2026-07-27`** clock, passed explicitly (never `Date.now()`). (Tech plan §10.2.)
> - **Domain boundary & trust.** New governance layer under `src/v2/domain/**`, reusing (never forking) existing entities and risk/OEE/ROTS/K-201 engines; `trustClassification` is a derived, non-persisted mapping over `Provenance` that fails safe on unknown input. (Tech plan §4–§5.)

---

## Decisions That Shaped This Plan

Five product decisions anchor this plan. Every requirement below is traceable to one of them. All five of the follow-up open decisions in Section 18 are now resolved.

1. **Scope — depth-first operational spine.** Build Reliability, Maintenance, Materials, Turnaround and OEE/Value to meaningful operational depth. Remaining personas receive strong, useful briefs and appropriate read views rather than shallow standalone dashboards, while Plant Manager and Operations Shift Supervisor still receive credible decision-oriented experiences.
2. **Value model — a real deterministic lifecycle with governed state transitions.** K-201 is modelled as deterministic states and events; only the metrics that logically change from an explicit governed event are recomputed, and the original inputs and calculation version are preserved so every change stays explainable and reproducible. No production database is required — an auditable local state model is sufficient.
3. **Governance — a simulated but genuine policy and audit model.** Capabilities, persona scope, required authority, decision status and audit events live in the domain and are enforced by the application. Persona switching is a demonstration view selector and never grants authority; the assistant may prepare an action, but confirmation routes through governed human control. This is labelled demonstration authorization, not enterprise identity or production RBAC.
4. **Assistant — a deterministic governed assistant.** The server-grounded deterministic provider stays the default so the golden story remains testable and reproducible; provider-neutral boundaries and realistic runtime and value accounting are built, but live inference is never required for the core experience. NVIDIA API, DGX Spark and other providers remain later adapters or clearly labelled cost scenarios, never fabricated actual activity.
5. **Workspaces — shared operational surfaces with persona-specific lenses.** Rather than eight separate applications, Phase 2 builds a connected set of functional workspaces around shared operational objects: asset, signal, assessment, recommendation, decision, work order, material constraint, turnaround scope, outcome and value. Personas differ in briefs, prioritisation, navigation, actions and authority over those shared records.

---

## 1. Phase 2 Objective and User Outcome

Phase 2 makes the K-201 vertical navigable and defensible end to end. Phase 1 delivered the enterprise shell, persona-aware navigation, light and dark themes, capability-gated routes, the governed assistant seam and the Signal-to-Value operational thread. Phase 2 turns that thread into operational workspaces an operator could work inside, without loosening a single trust guarantee.

### User outcome

*Any of the eight personas can open Asset Supervision OS, receive an evidence-backed Chief-of-Staff brief, follow K-201 from a rising-vibration signal to roughly $1.62M of exposure across connected operational workspaces, and take — or govern — the one decision that matters to their role. Every figure carries its trust classification, provenance and freshness; the assistant explains and proposes but never approves or executes; and missing evidence is shown as unavailable.*

The outcome holds only if these guarantees survive contact with real workspaces:

- Measured facts, deterministic calculations, predictions, AI explanations and human decisions stay visibly distinguishable at the point of use.
- Value at stake is never presented as value created by AI, and projected value stays separate from realised value.
- The assistant explains and proposes; it cannot independently approve or execute an operational action.
- Missing evidence is shown as unavailable, never invented, and source, freshness and provenance stay visible.
- Approval authority derives from governed capability rules, and persona switching never confers it.

---

## 2. Persona-by-Persona Jobs to Be Done

Each persona works the same shared operational objects, but with a different job, a different first question, and a different scope of authority.

| Persona | Primary job to be done | Decision authority in scope (K-201) | Brief leads with | Primary workspaces |
|---|---|---|---|---|
| Plant Manager | Keep the plant safe, producing and financially defensible; balance risk, output and cost. | Accountable owner of the K-201 course of action; approves the interim decision and endorses turnaround scope. | Total exposure, production-loss risk, the decision awaiting sign-off, cross-asset changes. | Plant Manager Command, Asset 360, OEE & Loss, Turnaround (read) |
| Operations Shift Supervisor | Run the shift safely; act on the immediate operating recommendation and protect people and equipment now. | Acknowledges and executes the operating-parameter change; logs shift observations; cannot alter turnaround scope. | Active operating recommendation, time-to-critical, this-shift actions, safety constraints. | Shift Supervisor Console, Asset 360 (operate), work order acknowledgement |
| Reliability Manager | Govern reliability risk across the asset base; own assessment-to-decision quality and prioritisation. | Approves the reliability recommendation and its risk basis; sets priority; can escalate to Plant Manager. | Health and risk movements, assessment confidence, proposed vs decided, portfolio risk. | Reliability brief, Assessment & Decision, Asset 360, OEE & Loss (read) |
| Reliability Engineer | Diagnose the failure mode; produce the evidence-backed assessment and the recommended action. | Authors the assessment and recommendation and records evidence and calculation version; cannot self-approve the decision. | Diagnostic evidence, failure mode, time-to-critical basis, evidence gaps. | Assessment & Decision, Asset 360, signal detail |
| Maintenance Planner | Turn an approved decision into an executable, resourced, schedulable work plan. | Creates and readies work orders and confirms execution readiness; cannot approve the reliability decision or authorise expediting spend. | Work required, execution readiness, material blockers, schedule fit. | Maintenance & Work Planning, Materials (read), Asset 360 (read) |
| Materials & Spares Coordinator | Guarantee the right parts are available in time, or make the constraint visible early. | Confirms stock and lead time and raises and tracks expediting; cannot change work scope or the reliability decision. | Part availability, the dry gas seal constraint and lead time, expediting status, at-risk work orders. | Materials & Spares, Maintenance (read), Turnaround (read) |
| Turnaround Manager | Curate turnaround scope so deferred and major work lands in the right event window. | Owns turnaround scope inclusion and retains or releases the K-201 overhaul; cannot approve the interim operating decision. | Scope changes, retained items, lead-time fit to event date, scope risk and cost. | Turnaround Planning, Maintenance (read), Materials (read) |
| AI Control Tower Administrator | Keep the assistant governed, grounded, affordable and trustworthy. | Governs assistant configuration, provider selection and cost scenarios and can disable providers; holds no operational-approval authority. | Runtime health, grounding and provenance coverage, token cost vs value accounting, provider posture. | AI Control Tower, assistant audit, cross-workspace provenance (read) |

---

## 3. End-to-End K-201 Operational Journey

The journey is one continuous thread rendered across workspaces. The same operational objects carry the story, and each persona joins at the point where their authority applies. The eight steps map directly to the deterministic lifecycle in Section 7, and every figure shown is a fixed deterministic synthetic value that changes only through an explicit governed event.

1. **Signal detected.** Condition monitoring on K-201, a synthetic hydrogen recycle compressor, reports rising vibration and bearing temperature. The signal is a measured fact with source and timestamp; it is not yet an assessment. The Operations Shift Supervisor and Reliability Engineer see it first.
2. **Risk assessed.** The Reliability Engineer's assessment scores health at 52 and deterministic risk at 68, with a projected time-to-critical of approximately 17.93 days. The measured signal, the deterministic score and the prediction remain separately labelled, each carrying its calculation version.
3. **Recommendation proposed.** The assessment yields a recommended course of action: reduce operating speed, inspect the bearing within 48 hours, and retain the full overhaul in the turnaround scope. This is an engineer-and-assistant proposal, not an approval.
4. **Human decision recorded.** The Reliability Manager governs the risk basis and the Plant Manager is the accountable owner; the Shift Supervisor acknowledges and executes the operating change. The decision is recorded with author, authority, timestamp and the evidence it relied on.
5. **Work planned.** The Maintenance Planner converts the approved decision into work orders — a bearing inspection within 48 hours and a scoped overhaul — and assesses execution readiness against people, tools and materials.
6. **Materials checked.** The Materials & Spares Coordinator confirms the dry gas seal is not in stock, with an approximately 35-day lead time, and raises expediting. The constraint becomes visible to planning and turnaround immediately rather than at execution.
7. **Turnaround scope retained.** The Turnaround Manager retains the full overhaul in the turnaround event scope and tests the seal lead time against the event date. Interim mitigation — reduced speed and inspection — holds the asset until the event.
8. **Outcome and value pending.** OEE and production-loss intelligence quantify the exposure at approximately $1,620,156 for K-201 as value at stake. Execution outcome and value validation remain pending; realised value is recognised only once the outcome is confirmed.

No step invents a fact the previous step did not establish, and no figure changes except through an explicit governed event captured in the audit trail.

---

## 4. Information Architecture

### 4.1 Enterprise shell and navigation
The Phase 1 enterprise shell is retained: the persona switcher, global navigation, the operational context bar, light and dark themes and the governed assistant seam. Navigation is capability-gated, so a persona sees the workspaces their capabilities grant, and read-only surfaces are visibly marked as read-only rather than hidden. The connected product stays legible even where a persona cannot act.

### 4.2 Shared operational object model
A single canonical object graph underlies every workspace. Workspaces are views over this graph, never private copies, and each object is versioned and provenance-tagged. The spine runs from asset to value:

- **Asset** — the physical unit under supervision (K-201, a hydrogen recycle compressor).
- **Signal** — a measured condition observation with source and timestamp.
- **Assessment** — health, deterministic risk and time-to-critical derived from signals, with a calculation version.
- **Recommendation** — a proposed course of action linked to the assessment evidence.
- **Decision** — a human-governed record of what was decided, by whom, under which authority.
- **Work Order** — an executable unit of maintenance work with a readiness state.
- **Material Constraint** — a part availability and lead-time record that can block work.
- **Turnaround Scope Item** — work retained for a turnaround event window.
- **Outcome** — the recorded result of executed work, pending until confirmed.
- **Value Record** — value at stake, projected value and realised value, kept distinct.

### 4.3 Operational workspaces
Eight shared surfaces compose the product, complemented by two focused decision mini-workspaces for the Plant Manager and the Operations Shift Supervisor. Each is a view over the object graph, rendered through the active persona lens:

- **Persona briefs** — the Chief-of-Staff brief for the active persona.
- **Asset 360** — the asset, its signals, health and risk, and the active recommendation.
- **Assessment & Decision** — the evidence, the recommendation and the governed decision record.
- **Maintenance & Work Planning** — work orders, readiness and scheduling.
- **Materials & Spares** — part availability, lead times and expediting.
- **Turnaround Planning** — scope curation and lead-time fit to the event.
- **OEE & Loss** — production-loss intelligence and financial exposure.
- **AI Control Tower** — assistant governance, runtime, cost and value accounting.

Two focused decision mini-workspaces sit over the same shared objects: **Plant Manager Command** (endorse the course of action, view exposure and cross-asset risk) and **Shift Supervisor Console** (acknowledge-and-execute the operating change, log shift observations).

### 4.4 Persona lens model
A lens is a configuration over the shared surfaces. It sets the brief content, the default prioritisation, the visible actions and the authority — not a separate application. Switching lens re-renders emphasis and gates actions; it never alters the underlying records and never grants authority.

### 4.5 Chief-of-Staff brief structure
Every persona brief follows the same spine: what changed since the last review, what requires action, why it matters, blockers and dependencies, evidence and source freshness, and a route into the relevant workspace. Content differs by lens; the structure does not, so the product reads as one voice across roles.

### 4.6 Trust, provenance and freshness layer
Every value in the interface carries a trust classification — measured fact, deterministic calculation, prediction, AI explanation or human decision — together with a provenance reference and a freshness indicator. Missing values render as an explicit unavailable state rather than a blank or a zero. The classification is a first-class attribute of the view-model, not a presentation afterthought.

---

## 5. Functional Requirements

Requirements are grouped by shared surface and by cross-cutting capability. Each is written to be independently testable.

**5.1 Persona briefs and enterprise shell**
- **FR-B1** — The shell renders a Chief-of-Staff brief for the active persona using the fixed six-part spine and a route into the relevant workspace.
- **FR-B2** — The brief's what-changed section derives only from recorded lifecycle events, never from free text.
- **FR-B3** — Persona switching re-renders brief content, prioritisation, navigation and available actions without mutating any record or granting authority.
- **FR-B4** — Capability-gated navigation presents granted workspaces as actionable and ungranted ones as read-only per capability, never as dead links.

**5.2 Asset 360**
- **FR-A1** — Asset 360 presents K-201 identity, current signals, health (52), deterministic risk (68) and time-to-critical (approximately 17.93 days), each with trust classification and freshness.
- **FR-A2** — Asset 360 surfaces the active recommendation and links to the Assessment & Decision record; when the user is already in Asset 360 it must not present an action inviting them to open Asset 360.
- **FR-A3** — A signal with no current reading renders as unavailable with its last-known timestamp, never as a zero.

**5.3 Assessment & Decision**
- **FR-D1** — The workspace shows the assessment evidence, the derived scores with calculation version, and the proposed recommendation as distinct, labelled artifacts.
- **FR-D2** — A decision can be committed only by a persona whose capability grants the required authority for that decision type; others see a prepared, non-committable draft.
- **FR-D3** — Recording a decision captures author, authority, timestamp, decision status and the evidence references it relied on.
- **FR-D4** — The assistant may prepare a decision draft, but commitment requires an explicit human governed confirmation.

**5.4 Maintenance & Work Planning**
- **FR-M1** — An approved decision generates work orders (inspection within 48 hours; scoped overhaul) each with an explicit readiness state.
- **FR-M2** — Work order readiness reflects material constraints; an unavailable part sets readiness to blocked with the blocking reason shown.
- **FR-M3** — The planner can ready, schedule and sequence work orders but cannot approve the reliability decision or authorise expediting spend.

**5.5 Materials & Spares**
- **FR-S1** — The workspace shows part availability and lead time for K-201 work, including the dry gas seal as not in stock with an approximately 35-day lead time.
- **FR-S2** — The coordinator can raise and track an expediting request; expediting changes status and provenance but never the reliability decision or the work scope.
- **FR-S3** — A material constraint propagates to affected work orders and turnaround scope items as a visible blocker.

**5.6 Turnaround Planning**
- **FR-T1** — The workspace lists turnaround scope items and shows the retained K-201 overhaul with its source decision.
- **FR-T2** — The manager can retain or release a scope item; the seal lead time is tested against the event date and flagged when it does not fit.
- **FR-T3** — Scope changes are recorded as governed events with author and authority.

**5.7 OEE & Loss**
- **FR-O1** — The workspace links K-201 condition and the decision to production-loss and OEE impact, presenting exposure of approximately $1,620,156 as value at stake.
- **FR-O2** — Value at stake, projected value and realised value are shown as separate labelled figures; realised value is empty until an outcome is confirmed.
- **FR-O3** — Every figure carries its trust classification and the calculation version that produced it.

**5.8 AI Control Tower**
- **FR-C1** — The tower shows assistant runtime health, grounding and provenance coverage, and token cost against value accounting for the deterministic provider.
- **FR-C2** — Provider selection exposes the deterministic provider as default and other providers as later adapters or clearly labelled cost scenarios, never as fabricated actual activity.
- **FR-C3** — The administrator can configure or disable providers but holds no operational-approval authority.

**5.9 Cross-cutting capability, trust and audit**
- **FR-X1** — Every displayed value resolves a trust classification, provenance reference and freshness indicator from the view-model.
- **FR-X2** — Every governed action writes an immutable audit event; the audit trail is queryable per object and per persona.
- **FR-X3** — Capability rules are evaluated in the application layer; the interface never exposes a committable action a persona lacks authority for.

---

## 6. Data and View-Model Requirements

The domain layer holds the source of truth; view-models project it for each workspace and lens. Phase 2 requires an auditable local state model, not a production database.

- **6.1 Canonical entities and fields.** Each entity from the shared object model carries a stable identifier, a version, a trust classification wherever it holds a value, a provenance reference, a freshness timestamp and a status. Relationships are explicit references, so the graph can be traversed from signal to value without duplicating data.
- **6.2 Trust classification and provenance.** Trust classification is an enumerated attribute: measured fact, deterministic calculation, prediction, AI explanation or human decision. Provenance references the producing source — sensor, calculation, model or person — and the event that set the value. Freshness records when the value was last established and, for measured facts, the reading time.
- **6.3 Calculation versioning and reproducibility.** Every deterministic calculation records its calculation version and its inputs. Recomputation is pure and reproducible: the same inputs and version yield the same output. When a governed event changes an input, the prior inputs and version are retained.
- **6.4 View-models per workspace.** Each workspace consumes a view-model shaped to its job, not the raw entities. A view-model resolves trust, provenance and freshness for every field it exposes, applies the persona lens for prioritisation and action visibility, and never lets one workspace mutate another's records directly — mutations flow only through governed events.
- **6.5 Deterministic K-201 seed data.** The seed fixes the demonstration values: health 52, deterministic risk 68, time-to-critical approximately 17.93 days, the dry gas seal not in stock with an approximately 35-day lead time, and exposure of approximately $1,620,156. These values are the deterministic baseline and change only through a governed event.

---

## 7. State Transitions and Decision Lifecycle

The K-201 lifecycle is a deterministic state machine. Each transition is fired by an explicit governed event, guarded by a capability, and recomputes only the metrics that logically depend on the change.

| State | Trigger event | Guarding authority | What recomputes |
|---|---|---|---|
| Signal Detected | Signal ingested from condition monitoring | None (measured fact) | Signal freshness; no derived metric yet |
| Risk Assessed | Assessment computed | Reliability Engineer (author) | Health, deterministic risk, time-to-critical; calculation version set |
| Decision Proposed | Recommendation generated | Reliability Engineer / assistant (prepare only) | Recommendation linked to evidence; no metric change |
| Decision Recorded | Human decision committed | Reliability Manager (risk) + Plant Manager (accountable) | Decision status; downstream planning unlocked |
| Work Planned | Work orders created and readied | Maintenance Planner | Work order readiness; schedule fit |
| Materials Checked | Availability confirmed or expediting raised | Materials & Spares Coordinator | Work order readiness (blocked); constraint propagation |
| Turnaround Scope Retained | Scope item retained for event | Turnaround Manager | Lead-time fit to event date; scope cost |
| Execution / Outcome Pending | Work executed (result pending) | Shift Supervisor / Planner | Outcome status pending; nothing realised yet |
| Value Validation Pending | Outcome confirmed and value validated | Reliability Manager / Plant Manager | Realised value recognised; projected vs realised reconciled |

**State-machine invariants**

- A metric changes only through a transition's declared recompute; there is no ambient recalculation.
- Original inputs and the calculation version are retained across every transition, so earlier figures remain reconstructable.
- A guard failure blocks the transition and records the attempt, not a change.
- The assistant can advance nothing past a human-guarded transition.

---

## 8. Preventive-Maintenance and Spare-Part Requirements

Maintenance and materials are where a decision becomes executable or stalls. Phase 2 models both as first-class objects so readiness and constraints are visible before execution rather than discovered during it.

- **8.1 Preventive maintenance model.** K-201 carries a preventive-maintenance plan alongside the corrective work the assessment triggers. The plan defines recurring tasks and their intervals; the interim decision — reduce speed and inspect within 48 hours — sits as corrective work linked to the assessment, while the full overhaul is retained for the turnaround. Preventive and corrective work stay distinguishable, and both trace to their originating object.
- **8.2 Work order readiness.** Every work order resolves a readiness state from three inputs: labour, tools and materials. Readiness is derived, not entered, and when any input is missing it is blocked with the specific reason. The 48-hour inspection can be ready while the overhaul is blocked by the seal, and the two states are shown independently.
- **8.3 Spare-part and materials constraint.** The dry gas seal is modelled as a material constraint: not in stock, an approximately 35-day lead time, linked to the overhaul work order and the turnaround scope item. The constraint is a provided fact with provenance, not an AI inference, and it renders as a blocker wherever the dependent work appears. If a required part's data is absent, it shows as unavailable rather than assumed in stock.
- **8.4 Expediting.** The Materials & Spares Coordinator can raise an expediting request against the constraint. Expediting updates the constraint's status and provenance and can shorten the projected availability, but it never alters the reliability decision or the work scope, and its effect on readiness is recomputed only when the expedite is recorded as a governed event.

---

## 9. OEE and Financial-Impact Linkage

The financial layer connects a physical condition to money without ever crediting the money to the assistant.

- **9.1 OEE and production-loss model.** OEE and production-loss intelligence translate K-201's condition and the chosen course of action into availability, performance and quality effects. Production loss is a deterministic calculation over the seed inputs, classified as such, with its calculation version visible.
- **9.2 Exposure calculation.** The exposure figure of approximately $1,620,156 for K-201 is the value at stake — the loss avoided or incurred depending on the outcome — not value created by the assistant. It derives from the production-loss model and the decision, and it recomputes only when a governed event changes an input it depends on.
- **9.3 Projected versus realised value.** Value at stake, projected value and realised value are three separate figures. Value at stake exists from assessment; projected value attaches to the decision; realised value is recognised only after an outcome is confirmed and validated, and it stays empty until then. The interface never merges them, and never presents projected value as realised.

---

## 10. Human Approval and Audit Requirements

Approval is the product's spine of trust. Phase 2 implements a simulated but genuine policy model: capabilities and authority are enforced by the application, and every governed action leaves an immutable trace.

- **10.1 Capability and authority model.** Capabilities map personas to the actions and authority they hold over each object and decision type. Required authority is a property of the action, not the person; the application evaluates whether the active persona's capabilities satisfy it. Persona switching changes the capability set for the demonstration view only and never elevates authority.
- **10.2 Approval flow.** A governed action moves through prepare, then confirm. The assistant or an authorised persona can prepare; only a persona holding the required authority can confirm. A confirm that fails the capability check is rejected and recorded as an attempt. The reduce-speed decision, the turnaround retention and any expedite each route through this flow with their own required authority.
- **10.3 Immutable audit trail.** Every prepared, confirmed, rejected or attempted action writes an immutable audit event carrying actor, persona, capability evaluated, object, before-and-after status and timestamp. The trail is append-only and queryable per object and per persona, and it is the sole source for the brief's what-changed section.
- **10.4 Demonstration-authorization labelling.** All authorization in Phase 2 is labelled demonstration authorization. It is not enterprise identity, single sign-on or production RBAC, and the interface states this plainly so no viewer mistakes the governed demonstration for real access control.

---

## 11. Assistant Behavior and Safety Boundaries

The assistant is a governed participant, not an operator.

- **11.1 Deterministic governed assistant.** The default assistant is the server-grounded deterministic provider. Given the K-201 scenario it returns the same grounded answers every time, so the golden story stays testable and reproducible. Live inference is never required for the core experience.
- **11.2 Prepare, never approve.** The assistant can explain evidence, summarise a brief and prepare a decision or action draft. It cannot confirm, approve or execute anything; every action it prepares halts at the governed human confirmation.
- **11.3 Grounding and trust classification.** Assistant output is grounded in the object graph and carries the same trust classification as the data it cites. Where evidence is missing, the assistant reports it as unavailable rather than filling the gap, and it never presents a prediction as a measured fact.
- **11.4 Provider-neutral seam and cost accounting.** A provider-neutral boundary lets other runtimes attach later as adapters. Runtime, token and value accounting are modelled realistically for the deterministic provider; alternative providers such as NVIDIA API and DGX Spark appear only as clearly labelled cost scenarios, never as fabricated actual activity.
- **11.5 Hard boundaries.** The assistant cannot alter records directly, cannot change a figure outside a governed event, cannot grant or assume authority, and cannot bypass a capability guard. These boundaries are enforced by the application, not by prompt convention.

---

## 12. Responsive Experience Requirements

The product must stay legible and defensible from wide desktop down to narrow widths.

- **12.1 The operational thread.** The eight-step operational thread must not merely compress at narrow widths. It becomes focused and interactive: at reduced width it collapses to the current step with clear next and previous affordances and a compact progress indicator, so the thread stays readable rather than cramped. On wide viewports it may render the full ribbon.
- **12.2 Workspace responsiveness.** Each workspace reflows from multi-column to single-column without losing trust chips, provenance or actions. Tables become scrollable or stacked rather than truncated, and no figure loses its classification when the layout narrows.
- **12.3 Breakpoint behaviour.** Defined breakpoints cover wide desktop, laptop, tablet and narrow. Primary actions remain reachable at every breakpoint, and the persona brief keeps its six-part structure at all widths. Empty placeholder space carried over from Phase 1 is replaced with meaningful workspace content at every breakpoint.

---

## 13. Accessibility Requirements

Accessibility is a trust requirement here, not only a compliance one: a trust cue that some users cannot perceive is not a trust cue.

- **13.1 Standards and structure.** The product targets WCAG 2.1 AA. Semantic structure, headings and landmarks are correct, every control has an accessible name, and the reading order matches the visual order across workspaces.
- **13.2 Trust cues beyond colour.** Trust classification and freshness are never conveyed by colour alone. Each carries a text label or an icon with text, so measured fact, prediction and human decision stay distinguishable without colour perception.
- **13.3 Keyboard and focus.** Every action, persona switch and workspace navigation is fully keyboard operable, with a visible focus indicator and a logical tab order. The governed confirmation is reachable and operable by keyboard.
- **13.4 Motion and theming.** Light and dark themes both meet contrast requirements. Motion in the operational thread respects reduced-motion preferences, and no essential information is conveyed only through animation.

---

## 14. Acceptance Criteria

Acceptance criteria are written to be verified directly. Each references the requirement or trust principle it protects.

| Area | Acceptance criterion (testable) | Verifies |
|---|---|---|
| Brief | Opening any persona shows a six-part Chief-of-Staff brief whose what-changed items each map to a recorded lifecycle event. | FR-B1, FR-B2 |
| Persona | Switching persona changes brief, prioritisation, navigation and actions but leaves every record and every authority unchanged. | FR-B3 |
| Asset 360 | K-201 shows health 52, risk 68 and time-to-critical approximately 17.93 days, each with a trust classification and freshness. | FR-A1 |
| Self-reference | While in Asset 360, no action invites the user to open Asset 360. | FR-A2 |
| Unavailable | A signal with no reading shows unavailable with its last-known time, never a zero. | FR-A3 |
| Decision guard | A persona without the required authority cannot commit the decision, sees a prepared draft, and the attempt is audited. | FR-D2, FR-X3 |
| Decision record | A committed decision stores author, authority, timestamp, status and evidence references. | FR-D3 |
| Assistant | The assistant can prepare but cannot commit any decision or action; commitment halts at human confirmation. | FR-D4 |
| Readiness | The overhaul work order is blocked by the seal while the 48-hour inspection is ready, shown independently. | FR-M2 |
| Materials | The dry gas seal shows not in stock with an approximately 35-day lead time and propagates as a blocker to dependent work. | FR-S1, FR-S3 |
| Value | Value at stake (approximately $1,620,156), projected value and realised value appear as separate figures; realised is empty before outcome. | FR-O2 |
| Recompute | A metric changes only after a governed event, and the prior inputs and calculation version remain retrievable. | Section 7 |
| Audit | Every governed action appears in the append-only audit trail with actor, persona and the status change. | FR-X2 |
| Responsive | At narrow width the eight-step thread becomes a focused single-step view with next and previous, not a compressed ribbon. | Section 12 |
| Accessibility | Trust classification is distinguishable without colour, and every action is keyboard operable at every breakpoint. | Section 13 |

---

## 15. Test and Visual-QA Matrix

The matrix pairs each test layer with what it proves. The deterministic assistant and fixed seed make the end-to-end golden journey reproducible, and V1 regression protection is explicit.

| Layer | Scope | What it proves | Notes |
|---|---|---|---|
| Unit | Domain model, calculations, capability rules | Deterministic outputs, guard evaluation, recompute purity | Calc version and seed fixtures |
| Unit | View-model resolvers | Trust, provenance and freshness resolved for every field | Classification snapshot per field |
| Integration | State-machine transitions | Each transition fires only on its event and recomputes only declared metrics | Event-driven fixtures |
| Integration | Approval and audit | Prepare, confirm, reject and attempt produce the correct audit events | Append-only assertion |
| Component | Workspaces and brief | Correct lens rendering and no self-referential Asset 360 action | Per-persona render tests |
| End-to-end | K-201 golden journey | The signal-to-value thread reproduces the seed figures across workspaces | Deterministic assistant |
| Visual QA | Windows Edge, light and dark | Layout, thread focus behaviour, no empty placeholder space, favicon present | Wide, laptop, tablet, narrow |
| Accessibility | Automated and keyboard | WCAG 2.1 AA checks, keyboard path, colour-independent trust cues | Automated scan plus manual pass |
| Regression | V1 protection | V1 remains untouched and the baseline suite still passes | `main` protected; 159 baseline tests |

---

## 16. Delivery Slices and Checkpoints

Delivery is sliced so each slice ships a defensible increment behind a checkpoint. V1 stays protected throughout, and no slice merges to the protected `main` branch.

| Slice | Focus | Checkpoint / exit criteria |
|---|---|---|
| 2.0 Hardening & hygiene | Favicon 404, pluralisation defect, remove self-referential Asset 360 action, focused responsive thread | Hygiene fixes merged; thread focused at narrow width; V1 untouched; baseline tests green |
| 2.1 Domain & state core | Shared object model, deterministic state machine, calculation versioning, K-201 seed | Golden figures reproduce from seed; transitions recompute only declared metrics |
| 2.2 Capability, approval & audit | Capability rules, prepare and confirm flow, immutable audit, demonstration-authorization labelling | Decision guard enforced; audit append-only; persona switch grants no authority |
| 2.3 Reliability spine | Asset 360 and Assessment & Decision workspaces | K-201 shows health, risk and time-to-critical with trust chips; decision recorded end to end |
| 2.4 Maintenance & materials | Work planning, readiness, materials constraint, expediting | Overhaul blocked by the seal; inspection ready; constraint propagates to dependents |
| 2.5 Turnaround, OEE & value | Turnaround scope, OEE & Loss, value separation | Overhaul retained; exposure approximately $1.62M as value at stake; projected vs realised separate |
| 2.6 Assistant & Control Tower | Deterministic assistant, provider-neutral seam, runtime and cost/value accounting | Assistant prepares only; alternative providers labelled as cost scenarios |
| 2.7 Briefs, responsive & a11y | Persona briefs, Plant Manager and Shift Supervisor decision mini-workspaces, breakpoints, accessibility, Windows Edge visual QA | Briefs six-part at all widths; WCAG 2.1 AA; visual QA sign-off |

Each checkpoint is a demonstrable slice of the K-201 journey, not a horizontal layer. A slice is done only when its exit criteria hold, its tests are green, and V1 remains protected and unchanged.

---

## 17. Explicitly Excluded Scope

- No production database, enterprise identity, single sign-on or real RBAC; authorization is demonstration only.
- No live AI inference in the core path; NVIDIA API and DGX Spark remain later adapters or clearly labelled cost scenarios.
- No second asset or additional vertical; K-201 is the sole seeded instance this phase.
- No real sensor, historian, CMMS, ERP or turnaround-system integrations; data is the deterministic seed.
- No write-back to any external system of record; all actions are local governed events.
- No mobile-native application; responsive web only.
- No multi-tenant, organisation or user administration beyond the demonstration persona switcher.
- No changes to V1; `main` stays protected and unchanged.

---

## 18. Product Decisions (Now Resolved)

The five decisions below were confirmed after the draft and are now resolved. Each records the decision taken; the requirements, information architecture and delivery slices above reflect them.

1. **Turnaround event date anchor.** Fix a seed event date that leaves the seal a slim slack, so the approximately 35-day lead time tests as a meaningful fits-with-limited-slack rather than a trivial pass.
2. **Authority for the interim decision.** The Reliability Manager approves the risk basis, with Plant Manager endorsement required above an exposure threshold that $1.62M crosses; both authorities appear in the golden path.
3. **Realised-value demonstration.** Keep the outcome pending as the default golden state, and include a governed confirm-outcome event so realised value can be demonstrated on request without fabricating it.
4. **Peripheral persona depth.** The Plant Manager and Operations Shift Supervisor each receive a dedicated decision-oriented mini-workspace over the shared objects, not a single inline action. This adds two focused surfaces to Phase 2 scope.
5. **Cost-scenario realism.** The Control Tower uses representative public price points for the labelled provider scenarios, tagged "scenario, not billed," never presented as actual spend.

---

## 19. Implementation Handoff Prompt for GitHub Copilot

Copy the block below into GitHub Copilot in the private repository to begin Phase 2. It is self-contained and encodes the trust boundaries defined above.

```
You are implementing Phase 2 of Asset Supervision OS in the private repository amit1858/asset-supervision-os, on a new branch off copilot/v2-phase-1-enterprise-shell (commit 08370a5). Work only under /v2. Do not modify V1 and do not merge to the protected main branch.

Build the complete K-201 vertical as shared operational surfaces with persona-specific lenses, not eight separate applications. Model the domain around shared objects: asset, signal, assessment, recommendation, decision, work order, material constraint, turnaround scope item, outcome and value. Workspaces are views over one object graph. The Plant Manager and Operations Shift Supervisor each get a dedicated decision mini-workspace over these shared objects.

Implement K-201 as a deterministic state machine in this order: Signal Detected, Risk Assessed, Decision Proposed, Decision Recorded, Work Planned, Materials Checked, Turnaround Scope Retained, Execution/Outcome Pending, Value Validation Pending. Each transition fires only on an explicit governed event, is guarded by a capability, and recomputes only the metrics that logically depend on it. Preserve original inputs and calculation version on every change. Use an auditable local state model; no production database.

Seed the fixed K-201 values and keep them consistent: health 52, deterministic risk 68, time-to-critical approximately 17.93 days, dry gas seal not in stock with an approximately 35-day lead time, exposure approximately $1,620,156. These change only through a governed event.

Enforce the trust model everywhere: every value carries a trust classification (measured fact, deterministic calculation, prediction, AI explanation, human decision), a provenance reference and a freshness indicator; missing evidence renders as unavailable, never invented or zero. Keep value at stake, projected value and realised value separate; realised value is empty until an outcome is confirmed. Never present value at stake as value created by AI.

Implement a simulated but genuine policy and audit model: capabilities, persona scope, required authority and decision status live in the domain and are enforced by the application. Persona switching is a demonstration view selector and never grants authority. Label all authorization as demonstration authorization, not enterprise identity or production RBAC. Every governed action writes an immutable, append-only audit event.

Keep the assistant deterministic and governed: the server-grounded deterministic provider is the default and must reproduce the golden journey. Build provider-neutral boundaries; NVIDIA API, DGX Spark and other providers are later adapters or clearly labelled cost scenarios, never fabricated actual activity. The assistant may prepare an action but never confirm, approve or execute; confirmation routes through governed human control.

Deliver slice by slice, starting with slice 2.0 (favicon 404, pluralisation defect, remove the self-referential Asset 360 action, and make the eight-step thread focused and interactive at narrow widths). Meet the acceptance criteria and the responsive and accessibility requirements, validate against the test and visual-QA matrix including Windows Edge in light and dark, and keep the V1 baseline suite passing. Work in small, reviewable commits with tests. Report what you changed, why, and how you verified it, and do not claim to have inspected, edited, tested or committed code you have not actually run.
```

---

*Companion specification: `V2_PHASE_2_SLICE_2_1_SPEC.md` details the Slice 2.1 domain model and governed deterministic state machine.*
