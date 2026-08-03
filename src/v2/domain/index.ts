/**
 * Slice 2.1a — governed domain layer barrel.
 *
 * Pure, node-environment, dependency-free and additive under `src/v2/**`. It is
 * never imported by v1 routes or modules.
 *
 * Slice 2.1a delivers the value envelope (E1), the derived trust mapping (C1)
 * and the source-specific freshness policy (`freshness.v1`). Slice 2.1b adds the
 * governed event catalogue, the append-only event log, the deterministic
 * lifecycle reducer and `exposure-threshold.v1`. The calculation ledger and
 * triggers (2.1c), the authority guard and audit trail (2.1d) and the
 * `K201.golden.v1` fixture (2.1e) follow in later slices.
 *
 * The runtime integrity brands used by the event log are deliberately NOT
 * exported: accepted events and aggregates are obtainable only from
 * `createAggregate`, `appendEvent` and `replay`.
 *
 * Only symbols with a concrete use are exported; convenience helpers are not
 * published speculatively.
 */

export type {
  AvailableValueEnvelope,
  EnvelopeStatus,
  MakeAvailableEnvelopeInit,
  MakeEnvelopeInit,
  MakeUnavailableEnvelopeInit,
  MarkUnavailableOptions,
  SupersedeAvailableInit,
  SupersedeInit,
  SupersedeUnavailableInit,
  UnavailableValueEnvelope,
  ValueEnvelope,
} from "./envelope";
export { isAvailable, makeEnvelope, markUnavailable, supersede } from "./envelope";

export type { FreshnessInput, FreshnessState } from "./freshness-state";
export { resolveFreshness } from "./freshness-state";

export type { TrustClassification } from "./trust";
export { TRUST_BY_PROVENANCE, trustFromProvenance } from "./trust";

export type { FreshnessClass } from "./policy/freshness";
export {
  DEFAULT_FRESHNESS_CLASS_BY_SOURCE,
  FRESHNESS_POLICY_VERSION,
  FRESHNESS_WINDOWS_MS,
  freshnessWindowMs,
} from "./policy/freshness";

// --- Slice 2.1b -----------------------------------------------------------

export type {
  DecisionLifecycleStatus,
  EvidenceQuality,
  LifecyclePhase,
  LifecycleSnapshot,
  OperatingState,
  OutcomeValidationStatus,
} from "./lifecycle";
export { PHASE_ORDER, phaseIndex } from "./lifecycle";

export type {
  AssessmentComputedPayload,
  ConditionSignalIngestedPayload,
  DecisionApprovedPayload,
  DecisionRejectedPayload,
  EndorsementDeclinedPayload,
  EndorsementGrantedPayload,
  EventActor,
  GovernedEvent,
  GovernedEventHeader,
  GovernedEventOf,
  GovernedEventPayloads,
  GovernedEventType,
  MaterialsCheckedPayload,
  OutcomeConfirmedPayload,
  OutcomeEvidenceRecordedPayload,
  PreparedEvent,
  ProductionObservationIngestedPayload,
  ProposedEvent,
  RealisedValueRecordedPayload,
  RecommendationGeneratedPayload,
  SpeedReductionExecutedPayload,
  TurnaroundScopeRetainedPayload,
  WorkExecutedPayload,
  WorkOrderPlannedPayload,
} from "./events";
export { GOVERNED_EVENT_TYPES, prepareEvent } from "./events";

export type { RejectionReason } from "./rejection";

export type { RecomputeRequest, RecomputeRequestKind } from "./recompute";

export type { ReduceResult } from "./reducer";
export { initialSnapshot, PERMITTED_PHASES, reduce } from "./reducer";

export type {
  AcceptedGovernedEvent,
  AggregateInit,
  AppendResult,
  GovernedAggregate,
  ReplayResult,
} from "./event-log";
export {
  appendEvent,
  createAggregate,
  GovernedIntegrityError,
  replay,
  toPersistableEvents,
} from "./event-log";

export type { EndorsementRequirement } from "./policy/exposure-threshold";
export {
  EXPOSURE_THRESHOLD_POLICY_VERSION,
  EXPOSURE_THRESHOLD_USD,
  requiresEndorsement,
} from "./policy/exposure-threshold";

// --- Slice 2.1c -----------------------------------------------------------
//
// The calculation ledger. Its runtime integrity brands are deliberately NOT
// exported: an accepted calculation record and a `CalculationLedger` are
// obtainable only from `createLedger`, `appendCalculation`, `executeRecompute`
// and `replayCalculations`. The server-only engine adapter is NOT re-exported
// here — it lives under `src/v2/server/calculations/**` and must stay
// unreachable from any client path.

export type {
  CalculationSubject,
  CalculationSubjectKind,
  LedgerScope,
  LedgerScopeKind,
} from "./calculations/subject";
export {
  CALCULATION_SUBJECT_KINDS,
  isSubjectInScope,
  REQUIRED_SUBJECT_KIND,
  VALID_TRIGGERS,
} from "./calculations/subject";

export type {
  CalculationId,
  CalculationRequestId,
  CalculationSlot,
} from "./calculations/identity";
export {
  calculationIdOf,
  canonicalKey,
  ledgerScopeKeyOf,
  requestIdOf,
  slotKey,
  subjectKey,
} from "./calculations/identity";

export type {
  FormulaFamily,
  FormulaFieldDefinition,
  FormulaReference,
  FormulaSetDefinition,
} from "./calculations/formula";
export {
  DEFAULT_FORMULA_SET_VERSION,
  findFormulaSet,
  FORMULA_SETS,
} from "./calculations/formula";

export type {
  CalculationInputKind,
  CalculationInputReference,
  CalculationInputSnapshot,
  JsonObject,
  JsonValue,
} from "./calculations/inputs";
export {
  makeFullInputSnapshot,
  makeReferencedOnlyInputSnapshot,
} from "./calculations/inputs";

export type {
  CalculationRejectionReason,
  CalculationUnavailableReason,
} from "./calculations/failure";
export {
  CALCULATION_UNAVAILABLE_REASONS,
  FAILURE_ENGINE_THREW,
  UNAVAILABLE_LEAD_TIME_FIT_DEFERRED,
  UNAVAILABLE_NO_ASSESSMENT_ENGINE_FOR_ASSET,
  UNAVAILABLE_NO_ENGINE_DATA,
  UNAVAILABLE_NO_VALIDATED_OUTCOME,
  UNAVAILABLE_WORK_READINESS_DEFERRED,
} from "./calculations/failure";

export type {
  CalculationOutput,
  CalculationOutputField,
  CalculationRecord,
  FailedCalculationOutput,
  ProducedCalculationOutput,
  UnavailableCalculationOutput,
} from "./calculations/record";

export type {
  AcceptedCalculationRecord,
  AppendCalculationResult,
  CalculationLedger,
  ReplayCalculationsResult,
} from "./calculations/ledger";
export {
  appendCalculation,
  createLedger,
  latestAttempt,
  latestProduced,
  replayCalculations,
  toPersistableCalculations,
} from "./calculations/ledger";

export type {
  AssetAssessmentResult,
  DatasetMetadata,
  EngineEvidence,
  EnginePort,
  OutcomeRealisedValueResult,
  ProductionOeeResult,
  ProjectedValueResult,
} from "./calculations/port";

export { executeRecompute } from "./calculations/execute";
