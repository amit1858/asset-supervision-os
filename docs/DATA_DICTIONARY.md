# Asset Supervision OS — Data Dictionary

> Every entity here is **synthetic**. Rows are generated deterministically from
> `SEED = 20260727` (see [`ARCHITECTURE.md`](./ARCHITECTURE.md) §7). This
> dictionary documents the 22 core entities of the `Dataset` shape, mirroring the
> TypeScript interfaces in [`src/domain/types.ts`](../src/domain/types.ts) and the
> enumerations in [`src/domain/enums.ts`](../src/domain/enums.ts).
>
> **Types:** `IsoTimestamp` = ISO-8601 UTC string (e.g. `"2026-07-27T14:30:00.000Z"`).
> `synthetic: true` is a literal marker present on top-level records.
>
> **Provenance-bearing fields** are called out per entity; they let the UI label
> a value as measured, deterministic, business-rule, statistical, AI, or human
> (see the provenance model in [`design-system.md`](./design-system.md)).
>
> **SQL / Snowflake DDL is Phase 2.** The physical schema (tables, keys, types)
> will be authored Snowflake-compatible when the Snowflake-backed `Repository`
> lands; it is intentionally not in Phase 1. Field names below map 1:1 to the
> planned columns.

---

## Enumerations (referenced throughout)

| Enum | Values |
|---|---|
| `AssetOperationalStatus` | `normal, monitor, attention, critical, offline, maintenance, planned_outage` |
| `EventSeverity` | `info, low, medium, high, critical` |
| `DataFreshness` | `live, recent, stale, offline` |
| `Criticality` | `A, B, C, D, E` (A = highest consequence) |
| `WorkOrderStatus` | `draft, planned, scheduled, in_progress, on_hold, completed, cancelled` |
| `WorkOrderType` | `preventive, predictive, corrective, inspection, turnaround` |
| `WorkOrderPriority` | `P1, P2, P3, P4` |
| `Provenance` | `measured, deterministic, business_rule, statistical, ai_generated, human` |
| `DecisionType` | `approved, rejected, modified, deferred` |
| `RecommendedDisposition` | `immediate, planned_maintenance, next_turnaround, monitor` |
| `ValueStatus` | `projected, validated, realised` |
| `DowntimeCategory` | `equipment_failure, planned_maintenance, unplanned_maintenance, changeover, process_upset, feedstock, utilities, no_demand` |
| `QualityDefectCategory` | `off_spec_purity, moisture, contamination, rework, startup_loss` |
| `SensorChannel` | `vibration_overall, bearing_temp_de, bearing_temp_nde, discharge_pressure, suction_pressure, speed_rpm, lube_oil_pressure, seal_gas_flow` |
| `ReadinessDimension` | `engineering, materials, labour, permits` |
| `ReadinessStatus` | `not_started, at_risk, on_track, ready` |
| `TurnaroundStatus` | `planning, scope_freeze, ready, in_execution, complete` |
| `AiProviderId` | `mock, nvidia, dgxspark` |

---

## Site & hierarchy

### 1. `plants` — `Plant`

| Field | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `code` | string | e.g. `"GC-REFINERY"` |
| `name` | string | e.g. `"Gulf Coast Refinery (synthetic)"` |
| `region` | string | e.g. `"US Gulf Coast"` |
| `timezone` | string | IANA tz, e.g. `"America/Chicago"` |
| `synthetic` | `true` | explicit synthetic marker |

### 2. `production_lines` — `ProductionLine`

| Field | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `plantId` | string | FK → `plants.id` |
| `code` | string | e.g. `"HDS-2"` |
| `name` | string | e.g. `"Diesel Hydrotreater Unit 2"` |
| `product` | string | e.g. `"Ultra-low-sulfur diesel"` |
| `designRateUnitsPerHour` | number | nameplate rate |
| `unit` | string | e.g. `"bbl/h"` |

### 3. `asset_hierarchy` — `AssetHierarchyNode`

ISA-95-style functional-location tree (Enterprise > Site > Area > Unit > Equipment).

| Field | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `plantId` | string | FK → `plants.id` |
| `parentId` | string \| null | self-FK; `null` at root |
| `level` | `"site" \| "area" \| "unit" \| "equipment_group"` | tree level |
| `code` | string | node code |
| `name` | string | node name |

### 4. `assets` — `Asset`

| Field | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `tag` | string | equipment identifier, e.g. `"K-201"` |
| `name` | string | display name |
| `plantId` | string | FK → `plants.id` |
| `productionLineId` | string \| null | FK → `production_lines.id` |
| `hierarchyNodeId` | string | FK → `asset_hierarchy.id` |
| `assetType` | string | e.g. `"Centrifugal compressor"` |
| `manufacturer` | string | |
| `model` | string | |
| `criticality` | `Criticality` | A–E; feeds risk consequence weight |
| `operationalStatus` | `AssetOperationalStatus` | current equipment state |
| `commissionedOn` | IsoTimestamp | |
| `synthetic` | `true` | |

---

## Sensor & condition

### (supporting) `sensor_definitions` — `SensorDefinition`

Per-asset sensor metadata that parameterises the risk engine's channel
assessment (part of the `Dataset`, referenced by `sensor_readings`).

| Field | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `assetId` | string | FK → `assets.id` |
| `channel` | `SensorChannel` | measured channel |
| `label` | string | display label |
| `unit` | string | e.g. `"mm/s"`, `"°C"` |
| `warningThreshold` | number | warning band |
| `criticalThreshold` | number | critical band |
| `alarmDirection` | `"above" \| "below"` | direction in which worse |

### 5. `sensor_readings` — `SensorReading`

| Field | Type | Notes |
|---|---|---|
| `sensorId` | string | FK → `sensor_definitions.id` |
| `assetId` | string | FK → `assets.id` |
| `channel` | `SensorChannel` | |
| `timestamp` | IsoTimestamp | |
| `value` | number | reading value |
| `unit` | string | |
| `provenance` | `measured \| statistical` | **provenance** — observed vs synthetically forecast/interpolated |

### 6. `condition_events` — `ConditionEvent`

| Field | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `assetId` | string | FK → `assets.id` |
| `detectedAt` | IsoTimestamp | |
| `channel` | `SensorChannel \| "multi"` | source channel or multi-channel |
| `severity` | `EventSeverity` | |
| `rule` | string | human-readable deterministic rule that fired |
| `detail` | string | |
| `value` | number \| null | value at detection |
| `threshold` | number \| null | threshold crossed |
| `provenance` | `business_rule \| statistical` | **provenance** — rule vs trend detection |
| `acknowledged` | boolean | |

---

## Production / OEE inputs

### 7. `production_runs` — `ProductionRun`

Raw inputs to the OEE engine (see [`METRIC_DEFINITIONS.md`](./METRIC_DEFINITIONS.md) §1).

| Field | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `productionLineId` | string | FK → `production_lines.id` |
| `assetId` | string \| null | constraining asset, if any |
| `periodStart` | IsoTimestamp | |
| `periodEnd` | IsoTimestamp | |
| `plannedProductionMinutes` | number | OEE input (measured) |
| `downtimeMinutes` | number | OEE input (measured) |
| `idealRateUnitsPerHour` | number | plant ideal rate (business input) |
| `totalUnitsProduced` | number | OEE input (measured) |
| `goodUnits` | number | OEE input (measured) |
| `unit` | string | e.g. `"bbl"` |
| `synthetic` | `true` | |

### 8. `downtime_events` — `DowntimeEvent`

| Field | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `productionRunId` | string | FK → `production_runs.id` |
| `productionLineId` | string | FK → `production_lines.id` |
| `assetId` | string \| null | FK → `assets.id` |
| `category` | `DowntimeCategory` | e.g. `equipment_failure` (drives K-201 attributable exposure) |
| `startedAt` | IsoTimestamp | |
| `endedAt` | IsoTimestamp | |
| `minutes` | number | duration |
| `description` | string | |
| `planned` | boolean | planned vs unplanned |

### 9. `quality_events` — `QualityEvent`

| Field | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `productionRunId` | string | FK → `production_runs.id` |
| `productionLineId` | string | FK → `production_lines.id` |
| `category` | `QualityDefectCategory` | |
| `occurredAt` | IsoTimestamp | |
| `defectiveUnits` | number | |
| `description` | string | |

---

## Maintenance & materials

### 10. `work_orders` — `WorkOrder`

| Field | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `number` | string | e.g. `"WO-48231"` |
| `assetId` | string | FK → `assets.id` |
| `type` | `WorkOrderType` | |
| `status` | `WorkOrderStatus` | lifecycle status |
| `priority` | `WorkOrderPriority` | P1–P4 |
| `title` | string | |
| `description` | string | |
| `createdAt` | IsoTimestamp | |
| `scheduledStart` | IsoTimestamp \| null | |
| `requiredSpareIds` | string[] | FKs → `spare_parts.id` |
| `estimatedCost` | number | |
| `currency` | string | e.g. `"USD"` |

### 11. `maintenance_history` — `MaintenanceHistoryRecord`

| Field | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `assetId` | string | FK → `assets.id` |
| `performedAt` | IsoTimestamp | |
| `workOrderNumber` | string \| null | links to a `work_orders.number` |
| `activity` | string | |
| `findings` | string | |
| `technician` | string | |
| `laborHours` | number | |

### 12. `spare_parts` — `SparePart`

| Field | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `partNumber` | string | |
| `description` | string | |
| `category` | string | |
| `unitCost` | number | |
| `currency` | string | |
| `leadTimeDays` | number | procurement lead time |
| `criticalSpare` | boolean | |

### 13. `inventory_balances` — `InventoryBalance`

| Field | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `sparePartId` | string | FK → `spare_parts.id` |
| `storeroom` | string | |
| `onHandQty` | number | |
| `reservedQty` | number | |
| `reorderPoint` | number | |
| `updatedAt` | IsoTimestamp | |

---

## Turnaround

### 14. `turnaround_projects` — `TurnaroundProject`

| Field | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `code` | string | e.g. `"TA-2026-U200"` |
| `name` | string | |
| `plantId` | string | FK → `plants.id` |
| `status` | `TurnaroundStatus` | |
| `windowStart` | IsoTimestamp | |
| `windowEnd` | IsoTimestamp | |
| `scopeFreezeDate` | IsoTimestamp | |
| `budget` | number | |
| `currency` | string | |
| `synthetic` | `true` | |

### 15. `turnaround_work_packages` — `TurnaroundWorkPackage`

| Field | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `turnaroundProjectId` | string | FK → `turnaround_projects.id` |
| `code` | string | |
| `title` | string | |
| `assetId` | string \| null | FK → `assets.id` |
| `discipline` | string | |
| `status` | `"scoped" \| "engineering" \| "materials" \| "ready" \| "executed"` | package lifecycle |
| `readiness` | `Record<ReadinessDimension, ReadinessStatus>` | readiness per engineering/materials/labour/permits |
| `plannedStart` | IsoTimestamp | |
| `plannedFinish` | IsoTimestamp | |
| `estimatedCost` | number | |
| `originatingConditionEventId` | string \| null | FK → `condition_events.id`; **links Asset ↔ Turnaround** when created from an emerging risk |
| `onCriticalPath` | boolean | |

### 16. `work_package_dependencies` — `WorkPackageDependency`

| Field | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `predecessorId` | string | FK → `turnaround_work_packages.id` |
| `successorId` | string | FK → `turnaround_work_packages.id` |
| `type` | `"finish_to_start" \| "start_to_start" \| "finish_to_finish"` | dependency type |
| `lagDays` | number | lag between predecessor/successor |

---

## Recommendations, evidence, decisions, outcomes

### 17. `recommendations` — `Recommendation`

| Field | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `assetId` | string | FK → `assets.id` |
| `createdAt` | IsoTimestamp | |
| `title` | string | |
| `summary` | string | deterministic summary of the action |
| `disposition` | `RecommendedDisposition` | from the risk engine |
| `severity` | `EventSeverity` | |
| `confidence` | number | 0–1, from the deterministic risk engine |
| `aiRationale` | string \| null | **provenance `ai_generated`** — NL rationale grounded in evidence only |
| `aiInteractionId` | string \| null | FK → `ai_interactions.id` that produced `aiRationale` |
| `evidenceIds` | string[] | FKs → `recommendation_evidence.id` |
| `estimatedValue` | number | |
| `currency` | string | |
| `status` | `"open" \| "decided" \| "actioned" \| "closed"` | recommendation lifecycle |

### 18. `recommendation_evidence` — `RecommendationEvidence`

A single piece of evidence backing a recommendation. This is the trust spine —
every recommendation is traceable to labelled evidence.

| Field | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `recommendationId` | string | FK → `recommendations.id` |
| `label` | string | e.g. `"Overall vibration"` |
| `value` | string | display value |
| `provenance` | `Provenance` | **provenance** — full enum; classifies each evidence line |
| `sourceType` | string | source record kind (sensor, run, work order, …) |
| `sourceId` | string \| null | pointer back to the source record |
| `observedAt` | IsoTimestamp \| null | when observed |

### 19. `human_decisions` — `HumanDecision`

| Field | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `recommendationId` | string | FK → `recommendations.id` |
| `decidedBy` | string | **provenance `human`** — accountable person |
| `role` | string | decider's role |
| `decision` | `DecisionType` | approved / rejected / modified / deferred |
| `decidedAt` | IsoTimestamp | |
| `note` | string | |
| `modifiedDisposition` | `RecommendedDisposition` \| null | set when `decision = modified` |

### 20. `operational_outcomes` — `OperationalOutcome`

Feeds ROTS value accounting.

| Field | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `recommendationId` | string | FK → `recommendations.id` |
| `decisionId` | string | FK → `human_decisions.id` |
| `assetId` | string | FK → `assets.id` |
| `recordedAt` | IsoTimestamp | |
| `resolved` | boolean | drives `resolvedEventCount` |
| `description` | string | |
| `estimatedValue` | number | **projected** value (never counted as realised) |
| `realisedValue` | number \| null | counted only when `valueStatus === "realised"` |
| `valueStatus` | `ValueStatus` | `projected \| validated \| realised` — gates realised value |
| `currency` | string | |

---

## AI accounting (Return on Token Spend)

### 21. `ai_interactions` — `AiInteraction`

| Field | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `createdAt` | IsoTimestamp | |
| `provider` | `AiProviderId` | `mock \| nvidia \| dgxspark` |
| `model` | string | model id (drives rate card) |
| `useCase` | string | |
| `promptVersionId` | string | FK → `prompt_versions.id` (auditability) |
| `inputTokens` | number | |
| `outputTokens` | number | |
| `estimatedCostUsd` | number | **provenance `deterministic`** — from rate card |
| `latencyMs` | number | may be synthetic/deterministic (mock) |
| `recommendationId` | string \| null | FK → `recommendations.id` |
| `evidenceIds` | string[] | grounding set supplied to the model |
| `outputSummary` | string | truncated output text |

### 22. `prompt_versions` — `PromptVersion`

| Field | Type | Notes |
|---|---|---|
| `id` | string | PK, e.g. `"pv_asset_risk_explanation_1_0_0"` |
| `key` | string | e.g. `"asset_risk_explanation"` |
| `version` | string | semver, e.g. `"1.0.0"` |
| `useCase` | string | |
| `template` | string | prompt template text |
| `createdAt` | IsoTimestamp | |
| `active` | boolean | active version flag |

> In Phase 1, prompts live in code (`src/ai/prompts.ts`) but carry the same
> identity/version fields as this entity; Phase 3 persists them.

---

## Dataset envelope — `Dataset.meta`

The `Dataset` object bundles all arrays above plus a `meta` block:

| Field | Type | Notes |
|---|---|---|
| `generatedAt` | IsoTimestamp | derived from `ANCHOR_NOW` |
| `seed` | number | `20260727` |
| `synthetic` | `true` | whole-dataset marker |
| `heroAssetTag` | string | `"K-201"` — the demo hero asset |
```
