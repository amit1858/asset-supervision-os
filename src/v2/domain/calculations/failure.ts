/**
 * Slice 2.1c — the deterministic calculation failure vocabulary.
 *
 * Three outcomes are kept strictly apart, because collapsing them is how a
 * ledger starts lying:
 *
 * - REJECTED — the request or record was not admissible. Nothing is appended,
 *   the identical ledger reference comes back, and no engine is invoked when
 *   the rejection is decidable before execution.
 * - UNAVAILABLE — the question was admissible and was genuinely asked, but no
 *   governed value exists. This IS appended, because "we looked and there is
 *   nothing" is an auditable fact. It is never `0`.
 * - FAILED — an engine threw. This is appended too, so an outage is visible
 *   rather than silently absent, and it never fabricates or overwrites a value.
 *
 * Neither an unavailable nor a failed attempt ever supersedes a previously
 * produced result: the produced head survives untouched.
 */

export type CalculationRejectionReason =
  // runtime integrity
  | "invalid_ledger"
  | "malformed_calculation"
  // request admissibility
  | "unknown_calculation_kind"
  | "recompute_trigger_mismatch"
  | "calculation_subject_kind_mismatch"
  | "request_subject_asset_mismatch"
  | "missing_subject_identity"
  | "subject_out_of_ledger_scope"
  // identity
  | "calculation_identity_mismatch"
  | "calculation_request_identity_conflict"
  | "duplicate_calculation_ignored"
  // ordering and time
  | "invalid_sequence"
  | "non_contiguous_sequence"
  | "invalid_timestamp"
  | "calculation_as_of_regression"
  // inputs
  | "invalid_input_snapshot"
  // output, formula and envelope
  | "invalid_envelope"
  | "envelope_as_of_mismatch"
  | "malformed_engine_output"
  | "formula_set_not_registered"
  | "formula_field_mismatch"
  | "formula_version_mismatch"
  // supersession
  | "invalid_supersession"
  // replay only
  | "duplicate_calculation_in_replay";

/**
 * Governed reasons for an appended UNAVAILABLE calculation. Each is a closed
 * constant so a consumer can branch on it without parsing prose.
 */
export const UNAVAILABLE_NO_ASSESSMENT_ENGINE_FOR_ASSET =
  "no_governed_assessment_engine_for_asset" as const;

export const UNAVAILABLE_WORK_READINESS_DEFERRED =
  "deferred_to_slice_2_1c_1_work_readiness_engine" as const;

export const UNAVAILABLE_LEAD_TIME_FIT_DEFERRED =
  "deferred_to_slice_2_1c_1_lead_time_fit_engine" as const;

export const UNAVAILABLE_NO_VALIDATED_OUTCOME =
  "no_validated_outcome_recorded" as const;

export const UNAVAILABLE_NO_ENGINE_DATA = "engine_returned_no_data" as const;

/** The single governed reason for an appended FAILED calculation. */
export const FAILURE_ENGINE_THREW = "engine_execution_failed" as const;

export type CalculationUnavailableReason =
  | typeof UNAVAILABLE_NO_ASSESSMENT_ENGINE_FOR_ASSET
  | typeof UNAVAILABLE_WORK_READINESS_DEFERRED
  | typeof UNAVAILABLE_LEAD_TIME_FIT_DEFERRED
  | typeof UNAVAILABLE_NO_VALIDATED_OUTCOME
  | typeof UNAVAILABLE_NO_ENGINE_DATA;

export const CALCULATION_UNAVAILABLE_REASONS: readonly CalculationUnavailableReason[] =
  Object.freeze([
    UNAVAILABLE_NO_ASSESSMENT_ENGINE_FOR_ASSET,
    UNAVAILABLE_WORK_READINESS_DEFERRED,
    UNAVAILABLE_LEAD_TIME_FIT_DEFERRED,
    UNAVAILABLE_NO_VALIDATED_OUTCOME,
    UNAVAILABLE_NO_ENGINE_DATA,
  ] as const);
