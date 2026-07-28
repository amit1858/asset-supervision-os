# Asset Supervision OS — Product Blueprint

> **Physical Operations Intelligence for industrial, asset-heavy operations.**
> All data referenced in demonstrations is **synthetic demonstration data**. No proprietary, confidential, or real company data is used anywhere in this product.

---

## 1. Product Vision

**Asset Supervision OS** is a *Physical Operations Intelligence* platform for organizations whose value creation depends on large, complex, capital-intensive physical assets: refineries, process plants, chemical facilities, and discrete and process manufacturing.

The platform's premise is simple and uncompromising:

> **Physical operations generate enormous volumes of signal — condition data, production data, work-management data, and project data — but that signal is fragmented across systems and rarely converted into trustworthy, evidence-backed decisions. Asset Supervision OS closes that gap without ever pretending to know more than the evidence supports.**

The core of the product is **industry-neutral**. Its data model, reasoning framework, and governance principles apply equally to a hydrocracker, a paper machine, a cement kiln, or an automotive stamping line. To make the value tangible without exposing any customer's data, the product ships with a **synthetic process-plant / refinery demonstration** — a fully fabricated but physically plausible operating environment used to exercise every module end to end.

Asset Supervision OS is deliberately positioned as a **decision-intelligence layer**, not a control system. It observes, reasons, explains, and recommends. Humans decide. Control systems act. That boundary is a feature, not a limitation.

### What makes it different

- **Evidence before inference.** Every conclusion is traceable to either a deterministic calculation or an explicitly labeled model inference.
- **Deterministic where determinism is possible.** OEE, financial exposure, and readiness are computed, not guessed. LLMs are used only where natural-language reasoning and explanation add value.
- **Economic honesty.** The platform measures the cost and the *realised* value of its own AI, and it never represents projected savings as realised savings.
- **Portable intelligence.** The AI layer is provider-neutral and runs with no API key out of the box.

---

## 2. Target Users

| User | Primary questions they bring to the platform |
|------|----------------------------------------------|
| **Reliability engineers** | Which assets are deteriorating, how fast, and why? What is the evidence? |
| **Maintenance planners** | What work must be done, when, with which parts and crews — and what is the risk of deferral? |
| **Turnaround managers** | Is scope ready? Where is the critical-path risk? What schedule and cost exposure am I carrying? |
| **Plant leadership** | What is my operational and financial exposure right now, and are our AI-assisted decisions actually paying off? |
| **Operations teams** | Where are we losing availability, speed, and quality — and what is the highest-value action? |

The platform is designed so each of these users sees the *same underlying facts*, presented through the lens relevant to their role, with a shared audit trail. Reliability, planning, turnaround, operations, and leadership stop arguing about whose numbers are right.

---

## 3. The Four Product Modules

### 3.1 Asset Supervision

The reliability and condition-intelligence core.

- **Asset hierarchy & criticality.** A structured hierarchy (site → area → unit → equipment → component) with criticality ratings driven by safety, environmental, and production consequence.
- **Sensor & condition history.** Time-series condition data (vibration, temperature, pressure, flow, lube-oil analysis, etc.) retained with full history for trend and slope analysis.
- **Anomaly & deterioration detection.** Deterministic detection of threshold breaches *and* deterioration slope (rate-of-change over a rolling window), so slow degradation is caught before it crosses a hard limit.
- **Maintenance risks.** Each deteriorating asset is expressed as a quantified maintenance risk: likelihood of functional failure, consequence, and time-to-action.
- **Evidence-backed recommended actions.** Recommendations are always accompanied by the specific evidence that justifies them — never a bare assertion.
- **Work-order & spare-parts context.** Open and historical work orders, inspection records, and spare-part availability are surfaced alongside the risk so the recommendation is *actionable*, not theoretical.
- **Human approval & audit trail.** Every recommendation is approved, rejected, or modified by an accountable human, and the decision is recorded immutably.

### 3.2 OEE Intelligence

Deterministic production-loss intelligence.

- **Deterministic Availability / Performance / Quality.** OEE and its three factors are *calculated* from production and downtime records, never inferred by a model.
- **OEE loss tree.** A structured decomposition of total loss into availability loss, performance (speed) loss, and quality loss.
- **Downtime & speed-loss attribution.** Downtime events and speed losses are attributed to specific causes and, where possible, to specific assets.
- **Quality loss attribution.** Defect and rework losses are attributed to their process and asset origins.
- **Asset-to-production impact.** The bridge from a physical asset's condition to lost production — the number reliability and operations can both trust.
- **Financial exposure.** Losses translated into monetary exposure using explicit, auditable rates.
- **AI explanations grounded only in calculated evidence.** Natural-language explanations of *why* OEE moved are generated strictly from the computed loss tree — the model narrates the numbers, it does not invent them.

### 3.3 Turnaround OS

Turnaround and major-maintenance-event intelligence.

- **Turnaround projects & work packages.** A structured model of a turnaround: the event, its work packages, and their scope.
- **Scope readiness.** A live readiness view per work package.
- **Engineering / materials / labour / permit readiness.** Readiness broken out by dimension, so the actual blocker is visible rather than a single opaque status.
- **Dependencies & critical-path risks.** Inter-package dependencies and the critical-path items most likely to slip the event.
- **Schedule & cost exposure.** Quantified exposure to schedule slip and cost overrun.
- **Linking emerging asset risks to turnaround scope.** A newly detected asset risk from Asset Supervision can be routed directly into turnaround scope as a candidate work package — closing the loop between "we found a problem" and "here is when and how we fix it."
- **Execution monitoring & variance explanations.** During execution, actuals are compared to plan and variances are explained.

### 3.4 Return on Token Spend (ROTS)

The economic conscience of the platform. Every AI interaction is instrumented.

**Captured per interaction:**

| Field | Meaning |
|-------|---------|
| Provider | Which AI provider served the call |
| Model | Specific model/version |
| Use case | The reasoning task (e.g., condition explanation, turnaround variance) |
| Input tokens / Output tokens | Measured token counts |
| Estimated model cost | Cost derived from tokens and model rates |
| Latency | Response time |
| Recommendation | What the AI proposed |
| Evidence used | The specific deterministic evidence supplied to the model |
| Acceptance / rejection | The human decision |
| Action taken | What actually happened operationally |
| Estimated value | Projected value of the action |
| Realised value | Value confirmed after the fact |
| Value status | **projected / validated / realised** |

**Metrics:**

- Cost per accepted recommendation
- Cost per resolved operational event
- Projected value per 1,000 tokens
- Realised value per 1,000 tokens
- Recommendation acceptance rate
- Recommendation-to-action conversion rate
- Estimated AI ROI
- Realised AI ROI

> **Core principle: never represent projected savings as realised savings.** Projected, validated, and realised value are distinct states, always displayed distinctly. Leadership always knows the difference between what the AI *might* have saved and what it *demonstrably* saved.

---

## 4. Model Portability Principles

The AI layer is designed to be **portable, auditable, and replaceable** — never a lock-in.

1. **Provider-neutral AI interface.** All AI calls go through a single abstraction. Modules do not know or care which provider answers.
2. **Mock provider works with no API key.** The default provider is a deterministic mock. The entire product — every module, every view — runs end to end with no external dependency and no API key.
3. **Optional NVIDIA API-compatible adapter.** An adapter implements the same interface against an NVIDIA API-compatible endpoint, enabled by configuration.
4. **Interface capable of later calling a model hosted on DGX Spark.** The same interface is explicitly designed to later target a model hosted on **DGX Spark**, without changes to any module or view.
5. **Never call a model from UI components.** UI renders state and captures decisions. All AI calls happen behind the interface, server-side of the boundary — never from a view.
6. **Versioned & auditable prompts.** Prompts are versioned artifacts. Every interaction records the prompt version used.
7. **Deterministic calculations wherever an LLM is unnecessary.** If a number can be computed, it is computed. The LLM is reserved for language, explanation, and synthesis — not arithmetic.

---

## 5. The Five Connected Product Views

The four modules surface through five connected views. They share one data model and one audit trail; navigating between them never changes the underlying facts.

1. **Operations Command Center** — the single pane of glass. Current operational and financial exposure, top asset risks, OEE at a glance, turnaround readiness summary, and AI value snapshot. The starting point of every session.
2. **Asset 360** — the deep view of a single asset: hierarchy, criticality, condition history, deterioration, associated risks, work orders, spares, and recommended actions with evidence.
3. **OEE Loss Intelligence** — the loss tree, downtime/speed/quality attribution, asset-to-production impact, and financial exposure, with grounded AI explanations.
4. **Turnaround Control Tower** — turnaround projects, work packages, multi-dimensional readiness, dependencies, critical-path risk, and schedule/cost exposure.
5. **AI Value & Token Economics** — the ROTS view: interactions, costs, acceptance and conversion, and projected vs. realised value.

---

## 6. Trust & Governance Principles

Trust is the product. The platform enforces these principles everywhere:

- **Three clearly distinguished classes of statement.**
  - **Deterministic fact** — computed from data by explicit logic.
  - **Model inference** — produced by an LLM, always labeled as such.
  - **Human decision** — an approval, rejection, or modification by an accountable person.
- **Every recommendation shows *why*.** No recommendation appears without the evidence that produced it.
- **Human decision authority.** The platform recommends; humans decide. No recommendation becomes an action without a human.
- **Audit trail.** Every recommendation, every piece of evidence, every decision, and every AI interaction is recorded and reviewable.

---

## 7. Non-Goals / Guardrails

These are deliberate limits, not gaps.

- **No autonomous control actions.** The platform never writes to a control system, actuates equipment, or takes any physical action. It informs decisions; it does not make them.
- **No invented precision.** The platform does not fabricate false confidence. If evidence is thin, that is stated. Numbers are only as precise as their inputs allow.
- **Synthetic demonstration data is clearly labeled.** All demonstration data is fabricated and labeled as such throughout the product.
- **Industry-neutral core.** The core carries no assumptions tied to a single industry; the refinery demonstration is an illustration, not a constraint.
- **No proprietary or real company data.** The product ships and demonstrates with synthetic data only. No confidential, proprietary, or real company data is included or required.
