/**
 * Slice 2.1b — deterministic rejection vocabulary.
 *
 * Kept in its own module so both the reducer and the append boundary can use it
 * without a circular import. Every rejection is a closed, testable constant;
 * free-text detail is carried separately and is never the decision axis.
 */

export type RejectionReason =
  // append boundary / runtime integrity
  | "invalid_aggregate"
  | "malformed_event"
  | "invalid_event_id"
  | "invalid_aggregate_id"
  | "aggregate_mismatch"
  | "duplicate_ignored"
  // ordering
  | "invalid_sequence"
  | "non_contiguous_sequence"
  // time
  | "invalid_timestamp"
  | "occurred_at_after_as_of"
  | "as_of_regression"
  // payload / envelope
  | "invalid_payload"
  | "invalid_envelope"
  | "envelope_as_of_mismatch"
  | "subject_reference_mismatch"
  // actor
  | "actor_not_permitted"
  // lifecycle
  | "event_not_permitted_in_phase"
  | "invalid_transition"
  | "recommendation_id_reuse"
  | "lifecycle_regression"
  // replay only
  | "duplicate_in_replay";
