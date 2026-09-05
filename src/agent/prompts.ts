import "server-only";
import type { Citation, ClaimKind } from "./types";
import { AGENT_SUBJECT, CLAIM_KINDS } from "./types";

/**
 * Versioned prompt construction (server-only).
 *
 * The model is a NARRATOR over governed evidence, never an authority. The system
 * prompt binds it to the read-only contract; the user prompt hands it the exact
 * citation ids/labels/values it is permitted to ground on and the strict JSON
 * shape it must return. The model may only reference citation ids that appear in
 * the evidence block, may not introduce a number that is not in a cited value,
 * and may not claim to act. Anything else is discarded by validation.
 */

export const AGENT_PROMPT_KEY = "k201-case-investigator";
export const AGENT_PROMPT_VERSION = "2026-09-10.v1";

export interface RenderedPrompt {
  readonly promptKey: string;
  readonly promptVersion: string;
  readonly system: string;
  readonly user: string;
}

const CLAIM_KIND_LIST: readonly ClaimKind[] = CLAIM_KINDS;

const SYSTEM = [
  "You are the Asset Supervision OS case investigator for a single asset: K-201, a hydrogen recycle compressor.",
  "You are READ-ONLY. You investigate governed evidence, explain why an intervention is warranted, and route decisions to the accountable humans.",
  "",
  "Hard rules — violating any one causes your entire answer to be discarded:",
  "1. Ground every claim ONLY in the numbered evidence provided. Reference evidence by its exact `id`.",
  "2. Never state a number that does not appear verbatim in a cited evidence value.",
  "3. Never claim to approve, endorse, reject, validate, reserve, schedule, create or order anything. You cannot act.",
  "4. Never invent evidence, ids, timestamps, or authority. If evidence is missing, say so plainly.",
  "5. Do not restate or invent the recommendation, authority routing, timestamps, or calculation identities — the system attaches those. You produce only the situation summary and the grounded claims.",
  "",
  "Return STRICT JSON only, matching this shape:",
  "{",
  '  "situationSummary": string,',
  '  "claims": [ { "id": string, "text": string, "kind": <one of ' +
    CLAIM_KIND_LIST.join(" | ") +
    ">, \"citationIds\": string[] } ]",
  "}",
  "Every claim MUST include at least one citationId drawn from the evidence block.",
].join("\n");

function evidenceBlock(citations: readonly Citation[]): string {
  if (citations.length === 0) {
    return "(no evidence is available for your persona; you must not fabricate any)";
  }
  return citations
    .map(
      (c) =>
        `- id: ${c.id}\n  label: ${c.label}\n  value: ${c.value}\n  provenance: ${c.provenance}\n  source: ${c.sourceType}${c.observedAt ? `\n  observedAt: ${c.observedAt}` : ""}`,
    )
    .join("\n");
}

export function renderAgentPrompt(args: {
  question: string;
  citations: readonly Citation[];
}): RenderedPrompt {
  const user = [
    `Asset: ${AGENT_SUBJECT.assetTag} — ${AGENT_SUBJECT.assetName}`,
    `Case: ${AGENT_SUBJECT.caseId}`,
    "",
    `Question: ${args.question}`,
    "",
    "Governed evidence you may cite (use the exact ids):",
    evidenceBlock(args.citations),
    "",
    "Write a concise, executive situationSummary and a set of grounded claims that answer the question using ONLY this evidence. Return STRICT JSON.",
  ].join("\n");

  return {
    promptKey: AGENT_PROMPT_KEY,
    promptVersion: AGENT_PROMPT_VERSION,
    system: SYSTEM,
    user,
  };
}
