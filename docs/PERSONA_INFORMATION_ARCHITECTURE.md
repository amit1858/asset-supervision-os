# Persona Information Architecture

How Asset Supervision OS routes each persona: left-nav maps, landing routes,
ownership of existing functionality, redirects/deep links, and the shared
operational context that threads across persona switches. Everything here is
derived from `src/personas/registry.ts`, `src/personas/routing.ts`,
`src/context/types.ts`, `middleware.ts`, and `src/app/page.tsx`.

## Navigation map

Left-nav items per persona (in registry order). Items marked *(gated: …)* only
render when the persona holds the named capability.

### Plant Manager (`plant_manager`)

| Label | Route |
| --- | --- |
| Plant Overview | `/plant-overview` |
| Reliability *(gated: `view_asset_condition`)* | `/reliability` |
| OEE & Losses *(gated: `view_plant_performance`)* | `/oee` |
| Turnaround | `/turnaround` |
| Value Realisation *(gated: `view_value_realisation`)* | `/value-realisation` |

> The Plant Manager no longer carries an *AI Value & Cost* item. AI token
> economics has moved entirely into the Agent Control Tower (AI Administrator
> only). The Manager's *Value Realisation* item is restricted to validated
> outcomes, realised value, decisions supported, and outstanding validation — it
> does **not** expose token ledgers, prompts, provider pricing, or the model
> runtime.

### Operations Shift Supervisor (`shift_supervisor`)

| Label | Route |
| --- | --- |
| Shift Command | `/shift` |
| Asset Condition *(gated: `view_asset_condition`)* | `/assets/K-201` |
| OEE & Losses *(gated: `view_plant_performance`)* | `/oee` |

### Reliability Manager (`reliability_manager`)

| Label | Route |
| --- | --- |
| Reliability Command Center | `/reliability` |
| Asset Risk Portfolio *(gated: `view_asset_condition`)* | `/portfolio` |
| OEE Loss Intelligence *(gated: `view_plant_performance`)* | `/oee` |
| Turnaround Candidates | `/turnaround-candidates` |
| Asset 360 *(gated: `view_asset_condition`)* | `/assets/K-201` |

### Reliability Engineer (`reliability_engineer`)

| Label | Route |
| --- | --- |
| Asset Watchlist | `/watchlist` |
| Asset 360 *(gated: `view_asset_condition`)* | `/assets/K-201` |
| OEE Impact *(gated: `view_oee_impact`)* | `/oee` |

> The Engineer holds `view_oee_impact` (read-only asset-linked OEE) but **not**
> `view_plant_performance`, so their OEE item is a read-only *OEE Impact* view of
> `/oee`, not the plant-performance management view.

### Maintenance Planner (`maintenance_planner`)

| Label | Route |
| --- | --- |
| Planning Workbench | `/planning` |
| Asset 360 *(gated: `view_asset_condition`)* | `/assets/K-201` |
| Material Exceptions *(gated: `reserve_spare`)* | `/materials` |

### Materials & Spares Coordinator (`materials_coordinator`)

| Label | Route |
| --- | --- |
| Material Exceptions | `/materials` |
| Planning Context *(gated: `view_work_planning`)* | `/planning` |

> The Coordinator holds `view_work_planning` (read-only planning context) but
> **not** `prepare_work_order`, so their link to `/planning` is a read-only
> *Planning Context* view, not the Planner's editable workbench.

### Turnaround Manager (`turnaround_manager`)

| Label | Route |
| --- | --- |
| Turnaround Control Tower | `/turnaround` |
| Turnaround Candidates | `/turnaround-candidates` |
| OEE Loss Intelligence *(gated: `view_plant_performance`)* | `/oee` |

### AI Control Tower Administrator (`ai_admin`)

| Label | Route |
| --- | --- |
| Agent Control Tower | `/agent-control` |
| Value & Cost *(gated: `view_token_economics`)* | `/agent-control?tab=value-cost` |
| Model Runtime *(gated: `configure_model_runtime`)* | `/agent-control?tab=runtime` |

## Agent Control Tower tabs

The Agent Control Tower (`/agent-control`) is a tabbed page. Its tab keys and
labels (`src/app/agent-control/page.tsx`) are:

| Tab key | Label | Content |
| --- | --- | --- |
| `agent-runs` | **AI Runtime Activity** | The **Inference Ledger** — model/inference calls made by the mock deterministic explainer, gated on `monitor_agent_runs`. In Phase 2A these are **inference calls**, not autonomous or tool-using agent runs; no agent runs are recorded. |
| `value-cost` | **Value & Cost** | Return on Token Spend, estimated provider scenarios, and the interaction ledger (AI Administrator only), gated on `view_token_economics`. |
| `runtime` | **Model Runtime** | Provider-neutral model runtime configuration, gated on `configure_model_runtime`. |

The default tab is `agent-runs` (AI Runtime Activity).

## Landing routes

Each persona's `defaultRoute` and the page it lands on.

| Persona | Default landing route | Landing page |
| --- | --- | --- |
| Plant Manager | `/plant-overview` | Plant Executive Overview |
| Operations Shift Supervisor | `/shift` | Shift Command Center |
| Reliability Manager | `/reliability` | Reliability Command Center |
| Reliability Engineer | `/watchlist` | Asset Watchlist |
| Maintenance Planner | `/planning` | Planning Workbench |
| Materials & Spares Coordinator | `/materials` | Material Exceptions |
| Turnaround Manager | `/turnaround` | Turnaround Control Tower |
| AI Control Tower Administrator | `/agent-control` | Agent Control Tower |

## Ownership of existing functionality

Previously-shared views now have clear persona ownership:

| Owner persona | View(s) owned | Route(s) |
| --- | --- | --- |
| Plant Manager | Value Realisation | `/value-realisation` |
| Reliability Manager | Reliability Command Center (formerly the Operations Command Center at `/`), Asset Risk Portfolio, OEE Loss Intelligence, Turnaround Candidates | `/reliability`, `/portfolio`, `/oee`, `/turnaround-candidates` |
| Reliability Engineer | Asset 360 | `/assets/[tag]` |
| Turnaround Manager | Turnaround Control Tower | `/turnaround` |
| AI Control Tower Administrator | Agent Control Tower — the former *AI Value & Token Economics* is now the **Value & Cost** tab | `/agent-control` (`?tab=value-cost`) |

- The Reliability Command Center is the relocated Operations Command Center that
  used to live at `/`; `/` is now a persona-aware redirect (see below).
- **AI token economics is no longer surfaced to operational personas at all.** It
  lives entirely inside the Agent Control Tower's *Value & Cost* tab, gated on
  `view_token_economics`, which only the AI Administrator holds. The Plant
  Manager's leadership view of AI-enabled value is the separate `/value-realisation`
  page (validated outcomes and realised value — not token ledgers, prompts,
  pricing, or runtime).

## Routing and deep links

| Path | Behaviour |
| --- | --- |
| `/` | Redirects to the **active persona's default landing** — via `middleware.ts` reading the `aso-persona` cookie, with a server-side fallback in `src/app/page.tsx` (`readOperationalContext` → `personaDefaultRoute`) if middleware is bypassed. Falls back to the Reliability Manager when no valid persona cookie is present. |
| `/ai-economics` | **308** permanent redirect to `/agent-control?tab=value-cost`, so bookmarked deep links keep working. Handled in `middleware.ts`; `src/app/ai-economics/page.tsx` performs the same redirect as a fallback. |
| `/value-realisation` | Preserved — the Plant Manager's Value Realisation page (validated outcomes, realised value). |
| `/assets/[tag]` | Preserved — Asset 360 deep links still resolve. |
| `/oee` | Preserved — OEE Loss Intelligence / OEE Impact. |
| `/turnaround` | Preserved — Turnaround Control Tower. |

The middleware `matcher` is scoped to `["/", "/ai-economics"]`; all other routes
pass through untouched.

## Shared operational context

A single typed context — the "operational thread" — persists as the user moves
between personas and views. Its shape is `OperationalContextState`
(`src/context/types.ts`):

| Field | Type | Meaning |
| --- | --- | --- |
| `personaId` | `PersonaId` | The active persona. |
| `plantId` | `string` | Active plant (demo default `plant-gc`). |
| `unitId` | `string \| null` | Active unit (demo default `line-hds2`). |
| `assetTag` | `string \| null` | **Active asset thread** (equipment tag), preserved across persona switches. |
| `timeRange` | `TimeRangeKey` | One of `7d`, `30d`, `90d`, `shift`. |
| `shift` | `string \| null` | Active shift label, when relevant. |
| `sourceMode` | `SourceMode` | Underlying data source: `local` or `snowflake`. |
| `dataFreshness` | `DataFreshness` | `live`, `recent`, `stale`, or `offline`. |

*Theme* (light/dark) is a related presentation preference, but it is a separate
concern managed by the theme system (`src/lib/theme.ts` / `ThemeSwitcher`), not a
field of `OperationalContextState`. The persona and context are persisted via the
`aso-persona` and `aso-ctx` cookies.

### Cross-persona thread preservation

When an asset is the active thread, switching persona lands the incoming persona
in its **asset-relevant** view rather than its generic home. This is computed by
`personaLandingRoute(personaId, { assetTag })` (`src/personas/routing.ts`):

| Persona | Landing with active `assetTag` (e.g. `K-201`) |
| --- | --- |
| Reliability Engineer | `/assets/K-201` |
| Reliability Manager | `/assets/K-201` |
| Operations Shift Supervisor | `/assets/K-201` |
| Maintenance Planner | `/planning?asset=K-201` |
| Materials & Spares Coordinator | `/materials?asset=K-201` |
| Turnaround Manager | `/turnaround?asset=K-201` |
| Plant Manager | *(no asset entry — falls back to `/plant-overview`)* |
| AI Control Tower Administrator | *(no asset entry — falls back to `/agent-control`)* |

Personas with no asset-specific entry (`ASSET_ENTRY` in `routing.ts`) fall back to
their `defaultRoute`. When no asset is active, every persona simply lands on its
default route.

**Worked example:** a Reliability Engineer investigating **K-201** switches to the
Maintenance Planner and lands in the **Planning Workbench focused on K-201**
(`/planning?asset=K-201`) — the asset thread is carried across the switch rather
than dropping the user on the Planner's generic home.
