import "server-only";

import type { ValueEnvelope } from "@/v2/domain/envelope";
import type { EventActor, GovernedEventOf } from "@/v2/domain/events";
import type { LifecycleSnapshot } from "@/v2/domain/lifecycle";
import { initialSnapshot, reduce } from "@/v2/domain/reducer";

/**
 * September 6–7 Reliability experience — the deterministic K-201 governed
 * lifecycle PROJECTION.
 *
 * This builds a small, honest sequence of governed FACTS from the seeded
 * evidence and reduces them through the SAME governed reducer the rest of the
 * system uses. It is emphatically NOT a persisted audit trail and it appends
 * nothing through the gated authority seam: it is a read-only projection of
 * "what the governed evidence already implies", used to explain, on the Asset
 * 360 screen, how K-201 reaches a proposed decision awaiting a human.
 *
 * Every identity is injected and deterministic — no clock, no randomness, no
 * UUID. All four facts carry SYSTEM attribution (ingestion/derivation), never a
 * persona and never the assistant. The projection stops at `DECISION_PROPOSED`
 * with `decisionStatus = "proposed"`: no human decision is fabricated.
 */

export const K201_PROJECTION_ACTOR: EventActor = Object.freeze({
  kind: "system",
  systemId: "reliability-evidence-projection",
});

export const K201_AGGREGATE_ID = "case-k201";
export const K201_ASSET_ID = "asset-k201";
export const K201_SIGNAL_ID = "sig-k201";
export const K201_OBSERVATION_ID = "obs-hds2";
export const K201_ASSESSMENT_ID = "asm-k201";
export const K201_RECOMMENDATION_ID = "rec-k201";

export interface K201Projection {
  readonly events: readonly [
    GovernedEventOf<"ConditionSignalIngested">,
    GovernedEventOf<"ProductionObservationIngested">,
    GovernedEventOf<"AssessmentComputed">,
    GovernedEventOf<"RecommendationGenerated">,
  ];
  /** The final derived snapshot (phase `DECISION_PROPOSED`, status `proposed`). */
  readonly snapshot: LifecycleSnapshot;
  /** The derived snapshot AFTER each event, aligned to `events` by index. */
  readonly stepSnapshots: readonly LifecycleSnapshot[];
}

interface ProjectionInput {
  /** The governed exposure envelope from the `asset_assessment` calculation. */
  readonly valueAtStake: ValueEnvelope<number>;
  /** The instant every projected fact is evaluated at (the assessment `asOf`). */
  readonly evaluatedAt: string;
  /** Evidence timestamp of the underlying condition readings. */
  readonly signalCapturedAt: string | null;
  /** Identities of the condition readings this signal ingested. */
  readonly readingIds: readonly string[];
  /** Identities of the production runs the observation ingested. */
  readonly runIds: readonly string[];
}

function header(sequence: number, evaluatedAt: string) {
  return {
    eventId: `proj-${K201_AGGREGATE_ID}-${sequence}`,
    aggregateId: K201_AGGREGATE_ID,
    sequence,
    occurredAt: evaluatedAt,
    asOf: evaluatedAt,
    actor: K201_PROJECTION_ACTOR,
  } as const;
}

/**
 * Build and reduce the four-fact K-201 projection.
 *
 * Throws if the reducer rejects any fact — that would mean the seeded evidence
 * no longer supports a governed proposed decision, which a test asserts against
 * so the failure is loud rather than silently rendered.
 */
export function buildK201Projection(input: ProjectionInput): K201Projection {
  const { valueAtStake, evaluatedAt, signalCapturedAt, readingIds, runIds } = input;

  const conditionSignal: GovernedEventOf<"ConditionSignalIngested"> = {
    ...header(1, evaluatedAt),
    type: "ConditionSignalIngested",
    payload: {
      signalId: K201_SIGNAL_ID,
      assetId: K201_ASSET_ID,
      capturedAt: signalCapturedAt,
      readingIds,
    },
  };

  const productionObservation: GovernedEventOf<"ProductionObservationIngested"> = {
    ...header(2, evaluatedAt),
    type: "ProductionObservationIngested",
    payload: {
      observationId: K201_OBSERVATION_ID,
      assetId: K201_ASSET_ID,
      runIds,
    },
  };

  const assessmentComputed: GovernedEventOf<"AssessmentComputed"> = {
    ...header(3, evaluatedAt),
    type: "AssessmentComputed",
    payload: {
      assessmentId: K201_ASSESSMENT_ID,
      assetId: K201_ASSET_ID,
      valueAtStake,
    },
  };

  const recommendationGenerated: GovernedEventOf<"RecommendationGenerated"> = {
    ...header(4, evaluatedAt),
    type: "RecommendationGenerated",
    payload: {
      recommendationId: K201_RECOMMENDATION_ID,
      assessmentId: K201_ASSESSMENT_ID,
    },
  };

  const events = [
    conditionSignal,
    productionObservation,
    assessmentComputed,
    recommendationGenerated,
  ] as const;

  let snapshot = initialSnapshot(K201_AGGREGATE_ID, K201_ASSET_ID);
  const stepSnapshots: LifecycleSnapshot[] = [];
  for (const event of events) {
    const result = reduce(snapshot, event);
    if (!result.ok) {
      throw new Error(
        `K-201 projection rejected at sequence ${event.sequence} (${event.type}): ${result.reason}`,
      );
    }
    snapshot = result.snapshot;
    stepSnapshots.push(snapshot);
  }

  return Object.freeze({
    events,
    snapshot,
    stepSnapshots: Object.freeze(stepSnapshots),
  });
}
