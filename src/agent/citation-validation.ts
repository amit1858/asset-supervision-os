import "server-only";
import type { Citation, ProviderDraft } from "./types";

/**
 * Citation validation (server-only).
 *
 * A provider answer is accepted ONLY if every claim is grounded in the exact
 * evidence the executed tools produced. Any failure discards the WHOLE provider
 * answer — we never selectively strip a bad claim — and the deterministic
 * response is returned instead. This is the guarantee that a model can never
 * introduce an ungrounded number, an invented citation, or a self-action.
 *
 * Rules enforced:
 *  1. Every claim cites at least one citation id (no ungrounded claims).
 *  2. Every cited id exists in the executed evidence bundle (no invented ids).
 *  3. Every significant number in a claim's text appears verbatim in one of
 *     that claim's cited citation values (no ungrounded numbers).
 *  4. No self-action / mutation language anywhere in the draft (the agent
 *     never claims to have acted or that it will act).
 */

export interface ValidationOk {
  readonly valid: true;
}
export interface ValidationFail {
  readonly valid: false;
  readonly reason: string;
}
export type ValidationResult = ValidationOk | ValidationFail;

/**
 * A "significant" number: currency, a decimal, a percentage, or a 2+ digit
 * integer — but NOT a digit that is part of an identifier such as `K-201`,
 * `HDS-2`, `wo-1` or `value-at-stake.v1`. The lookarounds exclude any token
 * adjacent to a word character or hyphen.
 */
export const SIGNIFICANT_NUMBER_RE =
  /(?<![\w-])\$?\d[\d,]*(?:\.\d+)?%?(?![\w-])/g;

/** Phrases that betray the agent claiming to act or mutate. */
const SELF_ACTION_RE =
  /\bI\s+(?:have\s+)?(?:will\s+)?(?:approved?|endorsed?|rejected?|validated?|reserved?|expedited?|scheduled?|created?|ordered?|updated?|changed?|committed?|dispatched?)\b/i;
const IMPERATIVE_MUTATION_RE =
  /\b(?:click|press|submit)\s+(?:to\s+)?(?:approve|endorse|reject|reserve|schedule|create|order|commit)\b/i;

function normalise(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

export function extractSignificantNumbers(text: string): string[] {
  return text.match(SIGNIFICANT_NUMBER_RE) ?? [];
}

export function validateProviderDraft(
  draft: ProviderDraft,
  citations: readonly Citation[],
): ValidationResult {
  const byId = new Map<string, Citation>();
  for (const c of citations) byId.set(c.id, c);

  // Rule 4 — no self-action language anywhere in the draft.
  const allText = [draft.situationSummary, ...draft.claims.map((c) => c.text)].join("\n");
  if (SELF_ACTION_RE.test(allText) || IMPERATIVE_MUTATION_RE.test(allText)) {
    return { valid: false, reason: "Draft contains self-action or mutation language." };
  }

  if (draft.claims.length === 0) {
    return { valid: false, reason: "Draft has no claims." };
  }

  for (const claim of draft.claims) {
    // Rule 1 — grounded.
    if (claim.citationIds.length === 0) {
      return { valid: false, reason: `Claim "${claim.id}" cites no evidence.` };
    }

    // Rule 2 — cited ids exist.
    const citedValues: string[] = [];
    for (const id of claim.citationIds) {
      const c = byId.get(id);
      if (!c) {
        return {
          valid: false,
          reason: `Claim "${claim.id}" cites unknown evidence id "${id}".`,
        };
      }
      citedValues.push(c.value);
    }

    // Rule 3 — every significant number is backed by a cited value.
    const haystack = normalise(citedValues.join(" "));
    for (const token of extractSignificantNumbers(claim.text)) {
      if (!haystack.includes(normalise(token))) {
        return {
          valid: false,
          reason: `Claim "${claim.id}" states unsupported number "${token}".`,
        };
      }
    }
  }

  return { valid: true };
}
