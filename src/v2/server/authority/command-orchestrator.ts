import "server-only";

import type { PersonaId } from "@/personas/types";
// Mutation entry points are imported DIRECTLY from the governed-case module, not
// from the client-reachable `@/v2/domain` barrel (which re-exports read-only
// types/accessors only). This module is `server-only`, so it is the approved
// path that reaches the state-changing case boundary.
import {
  recordGovernedDecision,
  recordGovernedFact,
} from "@/v2/domain/governed-case";
import type {
  CaseResult,
  GovernedAct,
  GatedPayload,
  GovernedCase,
  GovernedEvent,
  HumanCommandContext,
  SystemCommandContext,
} from "@/v2/domain";
import {
  DemonstrationCapabilityResolver,
  getCapabilityResolver,
} from "./capability-resolver";

/**
 * Slice 2.2 — server-only command orchestration.
 *
 * This is the ONLY place a trusted `GovernedCommandContext` is assembled. It
 * constructs the authorization descriptor from the server capability resolver
 * and forwards the caller-supplied, request-scoped `attemptedAt`, `asOf` and
 * `requestId`. Browser code cannot reach this module (`server-only`), so it
 * cannot invoke the domain boundary with a fabricated principal, persona or
 * authorization descriptor.
 *
 * Time and identity are injected explicitly by the request handler; this module
 * never reads a clock or generates a random value.
 */

export interface HumanDecisionRequest {
  readonly principalId: string;
  readonly personaId: PersonaId;
  readonly act: GovernedAct;
  readonly payload: GatedPayload;
  readonly rationale: string;
  /** Request-scoped canonical instants, injected by the route handler. */
  readonly attemptedAt: string;
  readonly asOf: string;
  readonly requestId: string;
}

export interface SystemFactRequest {
  readonly systemId: string;
  readonly event: GovernedEvent;
  readonly attemptedAt: string;
  readonly asOf: string;
  readonly requestId: string;
}

export function orchestrateHumanDecision(
  governed: GovernedCase,
  request: HumanDecisionRequest,
  resolver: DemonstrationCapabilityResolver = getCapabilityResolver(),
): CaseResult {
  const context: HumanCommandContext = {
    kind: "human",
    principalId: request.principalId,
    personaId: request.personaId,
    authorization: resolver.descriptor(),
    attemptedAt: request.attemptedAt,
    asOf: request.asOf,
    requestId: request.requestId,
  };
  return recordGovernedDecision(
    governed,
    context,
    { act: request.act, payload: request.payload, rationale: request.rationale },
    resolver,
  );
}

export function orchestrateSystemFact(
  governed: GovernedCase,
  request: SystemFactRequest,
): CaseResult {
  const context: SystemCommandContext = {
    kind: "system",
    systemId: request.systemId,
    attemptedAt: request.attemptedAt,
    asOf: request.asOf,
    requestId: request.requestId,
  };
  return recordGovernedFact(governed, context, request.event);
}
