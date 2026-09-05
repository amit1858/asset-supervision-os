import type {
  EvidenceLineageRowView,
  GovernedMetricView,
} from "@/v2/reliability/view-types";

/**
 * September 9 Value Realisation experience — client-safe view-model contracts.
 *
 * This workspace deliberately renders TWO semantically distinct representations
 * side by side without implying one is less valid:
 *
 *  - `GovernedMetricView` — a value backed by a governed calculation envelope
 *    (e.g. decision exposure). It carries formulaVersion, asOf, provenance,
 *    trust and freshness, all read verbatim from the envelope.
 *
 *  - `SourceFactView` — a read-only seeded or repository-derived fact that has
 *    NO governed calculation envelope (e.g. the Return-on-Token-Spend portfolio
 *    aggregates, the port's recommendation projected value, the port's realised
 *    availability). It carries a source identity and record IDs, but is NEVER
 *    assigned a fabricated formulaVersion, freshness, provenance or trust
 *    classification, and is never dressed up as a "deterministic calculation"
 *    merely for visual consistency.
 *
 * This module imports NO engine, NO server-only module and NO authority-mutation
 * seam, so it is safe for a browser bundle.
 */

export type {
  EvidenceLineageRowView,
  GovernedMetricView,
} from "@/v2/reliability/view-types";

/**
 * A read-only fact sourced directly from the seeded dataset or a repository
 * aggregate, with no governed calculation envelope behind it. It must never be
 * given envelope-only metadata.
 */
export interface SourceFactView {
  readonly key: string;
  readonly label: string;
  readonly available: boolean;
  readonly display: string;
  /** The raw number, or `null` — NEVER defaulted to zero. */
  readonly rawValue: number | null;
  /**
   * Neutral, user-facing identity of the source, shown on the card face
   * (e.g. "Portfolio value aggregate · source record"). This is deliberately
   * NOT a token-economics term; the underlying technical ledger/function
   * identity lives in `provenanceIdentity` and is only surfaced inside the
   * collapsed provenance disclosure.
   */
  readonly sourceIdentity: string;
  /**
   * The exact technical source/function identity (e.g. the Return-on-Token-Spend
   * ledger or the engine-port projection). Provenance only — never presented on
   * the operational value cards as a headline metric attribution.
   */
  readonly provenanceIdentity: string;
  /** IDs of the underlying source records, when the source exposes them. */
  readonly sourceRecordIds: readonly string[];
  /** Dataset or record timestamp, only when genuinely available; else `null`. */
  readonly recordAsOf: string | null;
  /** Present only when `available` is false; explains the absence honestly. */
  readonly unavailableReason: string | null;
  /** Short qualifier, e.g. "conditional — if executed" or "exposure to loss". */
  readonly qualifier: string;
}

/** One recommendation row, with its TRUE governed-funnel stage (seeded fact). */
export interface OutstandingOutcomeRowView {
  readonly id: string;
  readonly assetTag: string | null;
  readonly description: string;
  readonly projectedDisplay: string;
  /** The recommendation's raw lifecycle status, shown verbatim for audit. */
  readonly status: string;
  /**
   * Coarse funnel stage derived from the recommendation status, its governed
   * decision and any operational outcome — never a hardcoded blanket value.
   */
  readonly stage:
    | "awaiting_decision"
    | "accepted_outcome_pending"
    | "outcome_validated"
    | "rejected_closed"
    | "closed";
  /** Human-readable stage label (e.g. "Accepted — outcome pending validation"). */
  readonly statusLabel: string;
}

/** One technical source/provenance identity, surfaced only in the disclosure. */
export interface SourceProvenanceRowView {
  readonly key: string;
  readonly label: string;
  /** The exact technical ledger/function identity — provenance, not a metric. */
  readonly provenanceIdentity: string;
  /** Count of underlying source records, when the source exposes them. */
  readonly recordCount: number;
}

/** The complete Value Realisation workspace view. */
export interface ValueRealisationView {
  /** Envelope-backed governed metric — the authority/endorsement-driving figure. */
  readonly decisionExposure: GovernedMetricView;
  /** Repository aggregate (ROTS) — portfolio exposure to potential loss/value. */
  readonly valueAtStake: SourceFactView;
  /** Port fact — projected value enabled by the K-201 recommendation only. */
  readonly k201Projected: SourceFactView;
  /** Repository aggregate (ROTS) — projected value enabled across the portfolio. */
  readonly portfolioProjected: SourceFactView;
  /** Repository aggregate (ROTS) — realised value; unavailable until validated. */
  readonly realised: SourceFactView;
  readonly decisionsSupported: SourceFactView;
  readonly validatedOutcomes: SourceFactView;
  readonly outstandingValidation: SourceFactView;
  readonly outstandingRows: readonly OutstandingOutcomeRowView[];
  /** Exact count of recommendations backing the table (the whole population). */
  readonly recommendationCount: number;
  /** Count of recommendations whose projected value is included (open|actioned). */
  readonly projectedContributingCount: number;
  /** Scope sentence for the recommendations table — distinct populations. */
  readonly recommendationScopeNote: string;
  /** Scope sentence for the decision-throughput panel — distinct populations. */
  readonly throughputScopeNote: string;
  /** Technical source identities, shown only inside the provenance disclosure. */
  readonly sourceProvenance: readonly SourceProvenanceRowView[];
  /** The exact realised-value sentence; realised is never rendered as zero. */
  readonly realisedNotice: string;
  /** Copy clarifying projected values are conditional. */
  readonly conditionalNotice: string;
  /** Copy excluding token ledgers / AI economics (governed elsewhere). */
  readonly scopeNotice: string;
  readonly evidenceLineage: readonly EvidenceLineageRowView[];
}
