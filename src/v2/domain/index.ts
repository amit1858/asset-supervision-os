/**
 * Slice 2.1a — governed domain layer barrel.
 *
 * Pure, node-environment, dependency-free and additive under `src/v2/**`. It is
 * never imported by v1 routes or modules.
 *
 * Slice 2.1a delivers only the value envelope (E1), the derived trust mapping
 * (C1) and the source-specific freshness policy (`freshness.v1`). It introduces
 * no capability, no engine call and no state transition; events and the state
 * machine (2.1b), the calculation ledger and triggers (2.1c), the authority
 * guard and audit trail (2.1d) and the `K201.golden.v1` fixture (2.1e) follow in
 * later slices.
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
