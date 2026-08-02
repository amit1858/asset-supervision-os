/**
 * Slice 2.1b — governed recompute REQUESTS.
 *
 * A recompute request is an OUTBOUND value returned alongside an accepted
 * event. It is never an event, is never appended to the log, and is never
 * executed here: the state machine asks for a calculation, it does not perform
 * one. Slice 2.1c owns the calculation ledger that consumes these requests and
 * produces the resulting `ValueEnvelope`, which can re-enter the log only as a
 * future governed event.
 *
 * Each kind is bound to its own trigger; no trigger recomputes everything.
 */

export type RecomputeRequestKind =
  /** Health / risk / time-to-critical. Only condition signals trigger it. */
  | "asset_assessment"
  /** OEE / availability / performance / quality. Only production observations. */
  | "oee_reconciliation"
  /** Projected value enabled by a decision that has just been recorded. */
  | "decision_projected_value"
  /** Work-order and materials readiness. */
  | "work_readiness"
  /** Whether the retained scope still fits the turnaround lead time. */
  | "turnaround_lead_time_fit"
  /** Realised value, requested only once an outcome has been confirmed. */
  | "realised_value";

export interface RecomputeRequest {
  readonly kind: RecomputeRequestKind;
  readonly assetId: string;
  /** The accepted governed event that justified the request. */
  readonly requestedByEventId: string;
  /** Explicit evaluation instant carried from the event; never `Date.now()`. */
  readonly asOf: string;
}

export function makeRecomputeRequest(request: RecomputeRequest): RecomputeRequest {
  return Object.freeze({ ...request });
}
