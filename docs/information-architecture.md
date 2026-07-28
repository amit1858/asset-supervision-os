# Asset Supervision OS — Information Architecture

> Five connected views over one shared, evidence-backed dataset. Every role sees
> the *same underlying facts* through the lens relevant to them, with a shared
> audit trail. The views are backed by the repository view models in
> [`src/data/repository.ts`](../src/data/repository.ts)
> (`CommandCenterModel`, `Asset360Model`, `RotsModel`, `TurnaroundSummary`) and
> the deterministic engines. All data is **synthetic**.

---

## 1. The five connected views

| # | View | Backing view model | Primary users | Job to be done |
|---|---|---|---|---|
| 1 | **Operations Command Center** | `CommandCenterModel` | Plant leadership, operations | Triage the whole plant: what needs attention now, aggregate OEE, top loss, active exposure, open recommendations, turnaround readiness, AI ROI. |
| 2 | **Asset 360** | `Asset360Model` | Reliability engineers, planners | Everything about one asset (K-201): sensors & trends, risk, condition events, work orders, spares, the recommendation, its evidence, AI rationale, decision, and linked turnaround work package. |
| 3 | **OEE Loss Intelligence** | `CommandCenterModel.oee` + `Asset360Model.analysis` | Operations teams | Where availability, speed, and quality are lost — the loss tree in units and the financial exposure that follows. |
| 4 | **Turnaround Control Tower** | `TurnaroundSummary` | Turnaround managers | Scope readiness (engineering / materials / labour / permits), critical-path risk, and the asset-driven work packages. |
| 5 | **AI Value & Token Economics** | `RotsModel` | Leadership, platform owners | The cost and *realised* value of the AI: tokens, cost, acceptance funnel, cost-per-accepted, projected vs realised value, ROI, per-provider usage. |

### 1.1 Operations Command Center

Renders `getCommandCenter()`: plant name and generation time; asset
`statusCounts` across all `AssetOperationalStatus` values; the sorted
`attentionAssets` list (assets in attention/critical/monitor/maintenance or with
an open recommendation, ranked by risk then criticality); aggregate `oee` and the
single `topLoss` bucket; `activeExposureUsd` (sum of open/actioned recommendation
value); `openRecommendationCount`; the `turnaround` summary; and the `rots`
metrics. It is the triage surface and the entry point to every other view.

### 1.2 Asset 360

Renders `getAsset360(tag)`: sensor definitions with sorted readings; the `risk`
result and full K-201 `analysis` (for the hero asset); condition events, work
orders, and maintenance history (newest first); relevant `spares` with inventory
balances; the `recommendation` with its `evidence`, the `aiInteraction` that
produced the rationale, the human `decision`, and the `linkedWorkPackage` that
ties the asset to the turnaround.

### 1.3 OEE Loss Intelligence

Presents the deterministic loss tree (availability / performance / quality loss in
units) from the OEE engine and the derived financial exposure. Uses the
time-weighted aggregate OEE (a roll-up, not an average of OEEs) so plant and line
figures reconcile.

### 1.4 Turnaround Control Tower

Renders `getTurnaround()`: the project, per-dimension readiness counts
(`ready`/`total` across engineering, materials, labour, permits), the count of
critical-path packages at risk, and the total work-package count. Work packages
created from an emerging asset risk carry `originatingConditionEventId`, closing
the loop from condition → turnaround scope.

### 1.5 AI Value & Token Economics

Renders `getRots()`: the full `RotsMetrics` (tokens, cost, funnel, efficiency,
projected vs realised value, ROI), per-provider usage, and the interaction /
recommendation / decision records. Enforces the honesty rule — **projected value
is never shown as realised.**

---

## 2. Navigation model

- **Persistent left navigation** lists the five views. It is always present so a
  user can move between the plant-wide triage (Command Center) and any lens
  without losing context.
- **Contextual header** shows where you are (plant, asset tag, turnaround code),
  data freshness, and the synthetic-data marker. On Asset 360 it carries the
  equipment identifier (`.equipment-id`, e.g. `K-201`), criticality chip, and
  operational status.
- **Cross-links** connect the views: an attention asset in the Command Center
  opens its Asset 360; a recommendation links to its turnaround work package; a
  work package links back to the originating condition event; an AI rationale
  links to its token-economics interaction record.

---

## 3. Answering the six key questions

The IA is organised so a user can answer all six questions about any risk, each
backed by an explicit provenance:

| # | Question | Where it is answered | Backed by |
|---|---|---|---|
| 1 | **What needs attention?** | Command Center `attentionAssets`, status counts | operational status, risk score (`deterministic`) |
| 2 | **Why?** | Asset 360 sensor trends, condition events, risk rationale | `measured` + `business_rule` + `statistical` |
| 3 | **What is the operational + financial impact?** | OEE Loss Intelligence loss tree + `financialExposure`; Asset 360 exposure | `deterministic` |
| 4 | **What is the recommended action?** | Asset 360 recommendation `disposition` (immediate / planned / next turnaround / monitor) | `business_rule` |
| 5 | **What is the evidence?** | Asset 360 evidence list; AI rationale grounded only in it | each line carries a `Provenance` |
| 6 | **Who approves?** | Asset 360 decision control → `HumanDecision` (decidedBy, role, decision) | `human` |

The AI's role is confined to question 2/5 phrasing: it *explains* the
deterministic answer using only the supplied evidence and always states that the
recommendation requires human approval.

---

## 4. The K-201 demo flow across the views

K-201 is the hero asset (`Dataset.meta.heroAssetTag = "K-201"`), a
Criticality-A centrifugal compressor. The single shared `analyzeK201` analysis
guarantees every view shows reconciling numbers.

1. **Command Center — triage.** K-201 surfaces at the top of `attentionAssets`
   (highest risk, Criticality A). Status counts, aggregate OEE, top loss, active
   exposure, and open-recommendation count frame the plant. *(What needs
   attention?)*
2. **Asset 360 — diagnose.** Vibration and bearing-temperature trends approach
   their warning/critical thresholds; the risk engine's OLS trend projects days-
   to-critical; condition events, work orders, and spare availability provide
   context. *(Why? What's the evidence?)*
3. **OEE Loss Intelligence — quantify.** The recent-window loss tree plus the
   K-201-attributable unplanned outage and the projected-failure exposure convert
   the risk into dollars. *(Operational + financial impact.)*
4. **Asset 360 — decide the disposition.** The business rules weigh projected
   time-to-critical (≈ trending) against repair lead time (21 d) and the next
   turnaround window (88 d) to recommend immediate vs planned vs next-turnaround.
   *(Recommended action.)*
5. **AI explanation.** On demand, the server-side service produces a plain-language
   rationale grounded **only** in the evidence, ending with the human-approval
   reminder. *(Why, in words.)*
6. **Asset 360 — human decides.** A reliability engineer approves, rejects, or
   modifies; the `HumanDecision` is recorded. *(Who approves?)*
7. **Turnaround Control Tower — close the loop.** The resulting work package
   carries `originatingConditionEventId`, appears in the readiness matrix, and is
   flagged if on the critical path.
8. **AI Value & Token Economics — account.** The interaction's tokens and cost,
   the acceptance funnel, and the outcome's **realised** value (only when
   `valueStatus === "realised"`) feed ROTS — the honest measure of whether the AI
   paid off.
```
