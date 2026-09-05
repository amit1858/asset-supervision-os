import type { SourceMode } from "@/context/types";
import type { Provenance } from "@/domain/enums";
import type { PersonaId } from "@/personas/types";
import type { GovernedAct } from "@/v2/domain/authority-policy";
import type { FreshnessState } from "@/v2/domain/freshness-state";
import type {
  DecisionLifecycleStatus,
  LifecyclePhase,
} from "@/v2/domain/lifecycle";
import type { TrustClassification } from "@/v2/domain/trust";

/**
 * September 6–7 Reliability experience — the client-safe view-model contracts.
 *
 * These are the ONLY types the presentation components consume. They are pure
 * data: every governed number is already resolved from a governed calculation
 * envelope on the server (never recomputed in a component), and every
 * qualitative field (freshness, trust, provenance, availability) is carried
 * verbatim so a component renders it but never derives it.
 *
 * This module imports NO engine, NO server-only module and NO authority
 * mutation seam, so it is safe for a browser bundle. The server read models
 * under `@/v2/server/reliability/**` construct these shapes; the components
 * under `@/components/v2/reliability/**` render them.
 */

/** One governed metric, resolved from a single `ValueEnvelope` on the server. */
export interface GovernedMetricView {
  readonly key: string;
  readonly label: string;
  /** True only when the underlying envelope is `available`. */
  readonly available: boolean;
  /** Formatted value for display; the honest "Unavailable" sentinel otherwise. */
  readonly display: string;
  /** The raw governed number, or `null` — NEVER defaulted to zero. */
  readonly rawValue: number | null;
  readonly freshness: FreshnessState;
  readonly freshnessLabel: string;
  readonly trust: TrustClassification;
  readonly trustLabel: string;
  readonly provenance: Provenance;
  readonly sourceMode: SourceMode;
  readonly formulaVersion: string;
  /** The instant the value was evaluated at (the envelope's `asOf`). */
  readonly asOf: string;
  readonly evidenceIds: readonly string[];
  /** Present only when `available` is false; explains the absence. */
  readonly unavailableReason: string | null;
}

/**
 * Deterministic assessment context that is NOT a governed calculation record —
 * e.g. model confidence. Labelled distinctly so it is never mistaken for a
 * governed envelope value.
 */
export interface AssessmentContextView {
  readonly label: string;
  readonly display: string;
  readonly rawValue: number | null;
  readonly note: string;
}

/** How one persona stands against the governed act it owns at the current phase. */
export interface AuthorityActorView {
  readonly personaId: PersonaId;
  readonly displayName: string;
  readonly role: string;
  /** The governed act this persona owns at the current phase, or `null` (view-only). */
  readonly act: GovernedAct | null;
  readonly actLabel: string;
  readonly capabilityHeld: boolean;
  readonly policyPermits: boolean;
  readonly eligibleNow: boolean;
  readonly standing: string;
}

/** The current viewer's read-only standing against the next governed act. */
export interface AuthorityViewerView {
  readonly personaId: PersonaId;
  readonly displayName: string;
  readonly canActOnNext: boolean;
  readonly reason: string;
}

export interface AuthorityDecisionView {
  readonly phase: LifecyclePhase;
  readonly phaseLabel: string;
  readonly decisionStatus: DecisionLifecycleStatus;
  readonly decisionStatusLabel: string;
  readonly nextActLabel: string;
  readonly nextActPersonaId: PersonaId;
  readonly nextActPersonaName: string;
  readonly endorsementRequirement: "required" | "not_required" | "undeterminable";
  readonly endorsementRequired: boolean;
  /** The exact governed value passed to `requiresEndorsement` — banner binds here. */
  readonly endorsementBannerValueUsd: number | null;
  readonly endorsementBanner: string;
  readonly actors: readonly AuthorityActorView[];
  readonly viewer: AuthorityViewerView;
  readonly readOnlyNotice: string;
}

export interface LifecycleProjectionEntryView {
  readonly sequence: number;
  readonly eventId: string;
  readonly type: string;
  readonly typeLabel: string;
  readonly actorLabel: string;
  readonly asOf: string;
  readonly summary: string;
  readonly resultingPhase: LifecyclePhase;
  readonly resultingPhaseLabel: string;
}

export interface AuditEntryView {
  readonly auditId: string;
  readonly action: string;
  readonly actorLabel: string;
  readonly at: string;
  readonly summary: string;
}

export interface SignalSensorView {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly latestDisplay: string;
  /** Governed warning threshold (seed sensor definition), or `null`. */
  readonly warningThreshold: number | null;
  /** Governed critical threshold (seed sensor definition), or `null`. */
  readonly criticalThreshold: number | null;
  /** Latest raw reading value, or `null` — never defaulted to zero. */
  readonly latestValue: number | null;
  /** Instant of the latest reading, or `null`. */
  readonly latestAt: string | null;
  readonly points: readonly { readonly t: string; readonly v: number }[];
}

/**
 * One horizon on the operational-horizon comparison. Each is derived from a
 * governed record; the comparison itself is a labelled comparison of governed
 * records, NOT a new calculation.
 */
export interface HorizonMarkerView {
  readonly key: string;
  readonly label: string;
  /** Days from the assessment instant, exactly as the governed record holds it. */
  readonly days: number | null;
  readonly display: string;
  readonly sourceNote: string;
  /**
   * The absolute UTC instant this horizon falls on, or `null`. Presentation-only:
   * it is anchored to the governed assessment `asOf` plus the governed day offset;
   * no governed envelope stores it. Components format it with `formatUtcDate`.
   */
  readonly absoluteDate: string | null;
  /**
   * `"governed"` when the absolute date equals a governed record date (e.g. the
   * turnaround spare-available date); `"presentation-derived"` when it is the
   * anchor plus a governed day offset; `null` when no absolute date applies.
   */
  readonly absoluteDateKind: "governed" | "presentation-derived" | null;
}

export interface OperationalHorizonView {
  readonly available: boolean;
  readonly markers: readonly HorizonMarkerView[];
  readonly comparisonMessage: string;
  /** The instant the comparison is anchored to (the assessment `asOf`). */
  readonly anchoredAt: string;
}

export interface SignalNarrativeView {
  readonly headline: string;
  readonly detail: string;
  readonly sensors: readonly SignalSensorView[];
  readonly conditionEvents: readonly {
    readonly at: string;
    readonly label: string;
    readonly detail: string;
  }[];
}

export interface RecommendationView {
  readonly available: boolean;
  readonly title: string | null;
  readonly summary: string | null;
  readonly interventionType: string | null;
  readonly statusLabel: string;
}

export interface WorkReadinessView {
  readonly workOrderId: string;
  readonly materialsLabel: string;
  readonly materialsDisplay: string;
  readonly bufferLabel: string;
  readonly bufferDisplay: string;
  readonly metrics: readonly GovernedMetricView[];
  readonly freshness: FreshnessState;
  readonly freshnessLabel: string;
  /** ISO instant of the governed work-readiness record (`asOf`). */
  readonly evaluatedAt: string | null;
}

export interface TurnaroundFitView {
  readonly available: boolean;
  readonly fitLabel: string;
  readonly fitDisplay: string;
  readonly availableDate: string | null;
  readonly metrics: readonly GovernedMetricView[];
  readonly freshness: FreshnessState;
  readonly freshnessLabel: string;
  /** ISO instant of the governed turnaround-fit record (`asOf`). */
  readonly evaluatedAt: string | null;
}

export interface EvidenceLineageRowView {
  readonly key: string;
  readonly label: string;
  readonly provenance: Provenance;
  readonly trustLabel: string;
  readonly formulaVersion: string;
  readonly sourceMode: SourceMode;
  readonly evidenceIds: readonly string[];
  readonly asOf: string;
}

export interface DecisionAuditView {
  readonly entries: readonly AuditEntryView[];
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly nextGovernedAction: string;
}

/** The complete Asset 360 + Assessment & Decision view for one asset. */
export interface AssetReliabilityView {
  readonly tag: string;
  readonly assetName: string;
  readonly evaluatedAt: string;
  readonly assessmentMetrics: readonly GovernedMetricView[];
  readonly assessmentContext: AssessmentContextView;
  readonly oee: GovernedMetricView;
  readonly oeeBreakdown: readonly GovernedMetricView[];
  readonly signal: SignalNarrativeView;
  readonly recommendation: RecommendationView;
  readonly workReadiness: readonly WorkReadinessView[];
  readonly turnaround: TurnaroundFitView;
  readonly authority: AuthorityDecisionView;
  readonly lifecycleProjection: readonly LifecycleProjectionEntryView[];
  readonly decisionAudit: DecisionAuditView;
  readonly evidenceLineage: readonly EvidenceLineageRowView[];
  /** Governed operational-horizon comparison (failure vs lead time vs turnaround). */
  readonly horizon: OperationalHorizonView;
}

/** A single row in the reliability workspace priority queue. */
export interface ReliabilityPriorityRowView {
  readonly tag: string;
  readonly assetName: string;
  readonly href: string;
  readonly healthDisplay: string;
  /** Raw governed health score (0–100), or `null` — drives the proportion visual. */
  readonly healthValue: number | null;
  readonly riskDisplay: string;
  /** Raw governed risk score (0–100), or `null` — drives the proportion visual. */
  readonly riskValue: number | null;
  readonly timeToCriticalDisplay: string;
  readonly exposureDisplay: string;
  readonly decisionStatusLabel: string;
  readonly nextActLabel: string;
  readonly freshnessLabel: string;
}

export interface ReliabilityWorkspaceView {
  readonly evaluatedAt: string;
  readonly summary: readonly {
    readonly label: string;
    readonly value: string;
    readonly hint: string;
  }[];
  readonly priorities: readonly ReliabilityPriorityRowView[];
  readonly emptyTitle: string;
  readonly emptyDescription: string;
}

// ---------------------------------------------------------------------------
// Pure presentation formatters — deterministic, no clock, no governed math.
// They format already-governed numbers; they never derive an operational value.
// ---------------------------------------------------------------------------

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export const UNAVAILABLE_DISPLAY = "Unavailable";

export function formatUsd(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? UNAVAILABLE_DISPLAY
    : USD.format(value);
}

export function formatPercent(ratio: number | null, digits = 1): string {
  return ratio === null || !Number.isFinite(ratio)
    ? UNAVAILABLE_DISPLAY
    : `${(ratio * 100).toFixed(digits)}%`;
}

export function formatScore(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? UNAVAILABLE_DISPLAY
    : String(value);
}

/** Time-to-critical: an approximate ~2-decimal day count. */
export function formatDays(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? UNAVAILABLE_DISPLAY
    : `≈${value.toFixed(2)} days`;
}

export function formatWholeDays(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? UNAVAILABLE_DISPLAY
    : `${value} days`;
}

const UTC_INSTANT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * Deterministic UTC instant label, e.g. "27 July 2026, 06:00 UTC".
 *
 * Fixed to the UTC zone with no clock read, so it renders identically on every
 * machine. Assembled from parts to guarantee the exact "d MMMM yyyy, HH:mm UTC"
 * shape regardless of locale punctuation.
 */
export function formatUtcInstant(iso: string | null): string {
  if (iso === null) return UNAVAILABLE_DISPLAY;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return UNAVAILABLE_DISPLAY;
  const parts = UTC_INSTANT.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} UTC`;
}

const UTC_DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * Deterministic UTC calendar-date label, e.g. "14 August 2026" — the date-only
 * companion to `formatUtcInstant`. Fixed to the UTC zone with no clock read, so
 * it renders identically on every machine.
 */
export function formatUtcDate(iso: string | null): string {
  if (iso === null) return UNAVAILABLE_DISPLAY;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return UNAVAILABLE_DISPLAY;
  const parts = UTC_DATE.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")}`;
}

const FRESHNESS_LABEL: Record<FreshnessState, string> = {
  fresh: "Fresh",
  stale: "Stale",
  missing: "No evidence",
  unknown: "Not yet observable",
};

export function freshnessLabel(state: FreshnessState): string {
  return FRESHNESS_LABEL[state];
}

const TRUST_LABEL: Record<TrustClassification, string> = {
  measured_fact: "Measured fact",
  deterministic_calculation: "Deterministic calculation",
  prediction: "Statistical prediction",
  ai_explanation: "AI explanation",
  human_decision: "Human decision",
  unknown: "Unclassified",
};

export function trustLabel(trust: TrustClassification): string {
  return TRUST_LABEL[trust];
}
