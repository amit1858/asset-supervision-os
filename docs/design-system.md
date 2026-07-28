# Asset Supervision OS — Design System

> The design system exists to make **trust legible**: an operator must be able to
> tell, at a glance, whether a value is a measured fact, a calculation, a
> prediction, AI text, or a human decision — and how serious, how fresh, and how
> critical it is. Colour is never the only carrier of meaning.
>
> Single source of truth for visual primitives:
> [`src/design-system/tokens.css`](../src/design-system/tokens.css), surfaced to
> Tailwind via [`tailwind.config.ts`](../tailwind.config.ts) and base styling in
> [`src/app/globals.css`](../src/app/globals.css). Every colour is a
> `var(--…)` reference, so a dark "control-room" theme can be added later by
> overriding the variables under `[data-theme="dark"]` **without touching any
> component markup.**

---

## 1. Token categories

### 1.1 Surfaces & borders

| Token | Value | Use |
|---|---|---|
| `--color-canvas` | `#f3f6f9` | app background (cool off-white) |
| `--color-surface` | `#ffffff` | cards, panels |
| `--color-elevated` | `#eef2f7` | subtly raised areas |
| `--color-overlay` | `rgba(16,24,40,0.48)` | modal scrim |
| `--color-border` | `#dce1e9` | default border |
| `--color-border-strong` | `#c1c9d4` | emphasised border |

### 1.2 Text

| Token | Value | Use |
|---|---|---|
| `--color-text-primary` | `#101828` | near-black navy body/headings |
| `--color-text-secondary` | `#475467` | slate (AA on surface) |
| `--color-text-muted` | `#667085` | captions/meta |
| `--color-text-inverted` | `#ffffff` | on dark fills |

### 1.3 Brand / interactive

`--color-brand #1554b4` (industrial blue), `--color-brand-hover #10428f`,
`--color-brand-subtle #e7f0fb`, `--color-brand-text #123f86`.

### 1.4 Status roles (operational status / severity)

Each role ships a **quartet** — fill (`DEFAULT`), `subtle` wash, `border`, and an
accessible `text` colour — so a badge can pair a saturated indicator with
AA-legible text.

| Role | Fill | Meaning |
|---|---|---|
| `healthy` | `#1f8a4c` (green) | nominal / good |
| `attention` | `#b9770f` (amber) | warning / watch |
| `critical` | `#c62f2f` (red) | breach / act now |
| `info` | `#0e7ea8` (cyan) | informational |
| `planned` | `#6d3fd1` (violet) | planned turnaround work |
| `ai` | `#4338ca` (indigo) | AI-generated content (distinct on purpose) |
| `neutralstatus` | `#667085` (grey) | offline / monitor / unknown |

### 1.5 Criticality scale (separate from severity)

Equipment criticality A–E is a **different axis** from event severity and uses
its own ramp:

| Token | Value | Class |
|---|---|---|
| `--criticality-a` | `#9b2226` | A — safety / highest consequence |
| `--criticality-b` | `#b9490f` | B — high |
| `--criticality-c` | `#b9770f` | C — medium |
| `--criticality-d` | `#2f6fae` | D — low |
| `--criticality-e` | `#667085` | E — minimal |

### 1.6 Data freshness

| Token | Value | State |
|---|---|---|
| `--freshness-live` | `#1f8a4c` | live |
| `--freshness-recent` | `#667085` | recent |
| `--freshness-stale` | `#b9770f` | stale |
| `--freshness-offline` | `#c62f2f` | offline |

### 1.7 Chart palette (semantic + categorical)

**Same metric = same colour everywhere.** Vibration `#1554b4`, temperature
`#b9490f`, risk `#c62f2f`, OEE `#1f8a4c`, availability `#1554b4`, performance
`#0e7ea8`, quality `#6d3fd1`, forecast `#6d3fd1`; warning/critical threshold
lines `#b9770f` / `#c62f2f`; grid `#e6eaf0`, axis `#667085`. Ordered,
colourblind-aware categorical series `--chart-1..6`.

### 1.8 Typography

`--font-sans` (Geist Sans → Inter → system) and `--font-mono` (Geist Mono →
platform mono). Tailwind adds metric display sizes `metric-lg` (1.75rem/600) and
`metric` (1.375rem/600). Equipment IDs use `.equipment-id` (mono, 600, tabular).
Operational figures use **tabular numerals** (`.tabular-nums` / `font-feature-
settings: "tnum"`) so digits align in columns.

### 1.9 Radius, shadow, motion, spacing

- **Radius** (restrained): `--radius-sm 3px`, `--radius 5px`, `--radius-md 7px`,
  `--radius-lg 10px`.
- **Shadow** (subtle): `--shadow-subtle`, `--shadow-card`, `--shadow-panel`,
  `--shadow-focus` (3px brand ring at 35% alpha).
- **Motion**: `--motion-fast 120ms`, `--motion-base 200ms`, `--motion-slow 320ms`
  (all disabled under `prefers-reduced-motion`).
- **Spacing**: reference scale `--space-1 4px … --space-7 48px` (Tailwind spacing
  also available). `--focus-ring #1554b4`. Content max width `1440px`.

---

## 2. Status hierarchy — four SEPARATE concepts

The model deliberately keeps four distinct axes distinct (see
[`src/domain/enums.ts`](../src/domain/enums.ts)). **One badge or colour must never
be overloaded to represent all of them.**

| Concept | Enum | Answers | Token family |
|---|---|---|---|
| **Operational status** | `AssetOperationalStatus` (`normal, monitor, attention, critical, offline, maintenance, planned_outage`) | What state is the equipment in? | status roles |
| **Event severity** | `EventSeverity` (`info, low, medium, high, critical`) | How serious is this condition/alert? | status roles |
| **Data freshness** | `DataFreshness` (`live, recent, stale, offline`) | How trustworthy/recent is the data? | freshness tokens |
| **Work-order status** | `WorkOrderStatus` (`draft…cancelled`) | Where is the work in its lifecycle? | neutral + status |

Equipment **criticality** (A–E) is a fifth, orthogonal axis (a property of the
asset, not a live state) with its own colour ramp.

---

## 3. Provenance model — the trust primitive

Every value shown to a user must be attributable to one `Provenance`. The UI
renders each differently so measured facts, calculations, predictions, model
text, and human judgement are never confused.

| Provenance | Meaning | Visual treatment |
|---|---|---|
| `measured` | Raw observed sensor/operational data | neutral; plain figure |
| `deterministic` | Exact calculation from measured data | neutral; may show formula on hover |
| `business_rule` | Rule / threshold evaluation | status-role colour of the outcome |
| `statistical` | Trend extrapolation / prediction | forecast styling (violet, dashed) — clearly "projected" |
| `ai_generated` | LLM-produced natural-language text | `ai` indigo family + "AI" label |
| `human` | Human decision or annotation | attributed to a named person/role |

Design principle: *distinguish deterministic facts, model inference, and human
decisions.* Projected (statistical/AI) values are **never** styled to look like
measured facts.

---

## 4. Accessibility (WCAG 2.1 AA)

- **Never colour alone.** Severity/criticality are always paired with a label,
  icon, or shape. A diagonal `.pattern-hatch` primitive encodes severity without
  relying on colour.
- **Contrast.** Text colours are chosen for ≥ AA contrast on their intended
  surface; each status role has a dedicated accessible `text` token.
- **Focus states.** `:focus-visible` renders a 2px brand outline with 2px offset
  (WCAG 2.4.7); `--shadow-focus` provides a ring for component-level focus.
- **Reduced motion.** `@media (prefers-reduced-motion: reduce)` collapses all
  animation/transition/scroll to ~0ms and disables the skeleton shimmer.
- **Tabular numerals.** All operational metrics use tabular figures so digits
  align and scan cleanly in tables and KPI tiles.
- **Screen-reader support.** `.sr-only` provides visually-hidden but announced
  text for icon-only or colour-only cues.

---

## 5. Component catalogue

The catalogue is the vocabulary the five views (see
[`information-architecture.md`](./information-architecture.md)) are assembled
from. Each component consumes tokens only — no hard-coded colours.

| Component | Role |
|---|---|
| **Status badge** | Renders one axis (operational / severity / freshness / WO status) with colour **plus** label/icon. |
| **Criticality chip** | A–E chip using the criticality ramp; distinct from severity. |
| **Provenance tag** | Labels a value's provenance (measured / deterministic / statistical / AI / human). |
| **Freshness indicator** | live / recent / stale / offline dot + label. |
| **Metric tile / KPI** | Large tabular figure with label, delta, and provenance. |
| **Loss-tree bar** | Availability / performance / quality loss in units, semantic colours. |
| **Trend chart** | Time series with warning/critical threshold lines and a dashed forecast segment. |
| **Evidence list** | Labelled evidence lines, each with a provenance tag and source pointer. |
| **Recommendation card** | Disposition, severity, confidence, evidence, AI rationale, decision control. |
| **AI rationale panel** | `ai` indigo styling, "AI" label, grounded-in-evidence note, human-approval reminder. |
| **Decision control** | Approve / reject / modify, recording an accountable human decision. |
| **Readiness matrix** | Turnaround readiness across engineering / materials / labour / permits. |
| **Data table** | Tabular-numeral columns, sortable, status/criticality-aware. |
| **Skeleton** | Loading shimmer (auto-disabled under reduced motion). |

---

## 6. The AI trust pattern

Every AI-generated recommendation surface **must** show all of the following —
this is the non-negotiable pattern for presenting model output:

1. **The deterministic numbers first** — risk score, health score, disposition
   come from the engines, not the model.
2. **The evidence set** — the exact labelled evidence lines the model was allowed
   to use, each with its provenance.
3. **A distinct AI treatment** — `ai` indigo family and an explicit "AI" label so
   the text is never mistaken for a measured fact.
4. **A grounding statement** — the rationale is grounded only in the evidence
   above (the model is instructed to invent nothing).
5. **A human-approval reminder** — the recommendation is **not** an autonomous
   action and requires an accountable human decision.
6. **Cost/accounting linkage** — the interaction (provider, model, tokens, cost,
   prompt version) is captured for Return-on-Token-Spend.

This mirrors the enforcement in [`src/ai/prompts.ts`](../src/ai/prompts.ts) and
[`src/ai/service.ts`](../src/ai/service.ts): the model receives only evidence,
must not fabricate, and must never present its output as an autonomous control
action.
```

---

## Themes (light & dark)

Both themes are driven **entirely by semantic CSS variables** in
`src/design-system/tokens.css`. There are **no** separate page components or
duplicated styles for dark mode — only token *values* change under
`[data-theme="dark"]`.

- **Default:** light. **Switcher:** top header (Light / Dark / System), persisted
  to `localStorage["aso-theme"]`; System follows the OS `prefers-color-scheme`
  live.
- **No flash:** an inline script in the root layout (`<head>`) sets
  `document.documentElement.dataset.theme` before first paint from the stored
  preference or the OS signal. `<html suppressHydrationWarning>` covers the
  attribute mutation.
- **Resolution logic** is a pure, tested helper: `src/lib/theme.ts`
  (`resolveTheme`, `normalizeThemePref`), covered by `src/lib/theme.test.ts`.

### Dark direction (industrial control-room)

- Canvas dark navy/charcoal (`#0f141b`); cards slightly elevated slate
  (`#161c25` / `#1e2632`); clear surface/section separation via borders.
- Primary text off-white (`#e7ecf3`, never pure `#fff`); readable secondary/muted.
- Restrained saturation. Status/severity **meanings preserved**
  (green=healthy, amber=attention, red=critical, violet=planned, indigo=AI).
- Charts, gridlines, thresholds, tooltips, table borders, focus ring, badges,
  alerts, and the synthetic-data banner all recalibrate through their tokens.

### Accessibility (both themes)

- Targets WCAG 2.1 AA contrast; text tokens chosen for ≥4.5:1 on their surfaces.
- Status never by color alone — every badge pairs color with a label **and** a
  shape symbol.
- Visible `:focus-visible` ring (`--focus-ring`) in both themes; reduced-motion
  respected; charts carry `<title>`/`sr-only` text equivalents.

### Theme audit

- No hard-coded hex colors or non-semantic Tailwind color utilities remain in
  customer-facing components (`src/components`, `src/app`) — verified by grep.
- Intentional hard-coded colors live only in `src/design-system/tokens.css`
  (the token definitions themselves).
