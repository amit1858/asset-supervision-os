import "server-only";

import type {
  BriefAction,
  BriefBlocker,
  BriefDecision,
  BriefRiskValue,
  PersonaBrief,
} from "@/brief/types";
import { toV2Href } from "@/v2/nav";

/**
 * September 8 acceptance correction — the V2 presentation of the shared
 * Chief-of-Staff brief.
 *
 * The brief SERVICE (`buildPersonaBrief`) is shared with V1 and must not change,
 * so the V2 experience applies a pure, deterministic PRESENTATION transform to
 * an already-built brief. It changes wording and hrefs only; it never fabricates,
 * reorders or removes a governed fact, and it reads no clock.
 *
 * It corrects three things for the V2 surfaces:
 *   1. Financial terminology — the $1,620,156 governed figure is the DECISION
 *      EXPOSURE that resolves the endorsement policy, never "value at stake".
 *   2. The maintenance story — the dry gas seal blocks the seal REPLACEMENT
 *      (WO-2), not the 48-hour bearing inspection (WO-1).
 *   3. Read-only authority — imperative approval language becomes status, and
 *      governed-decision links point into the V2 governed case.
 *
 * Matching is by stable id / exact string, so an upstream wording change simply
 * no-ops rather than mis-corrects.
 */

const HEADLINE_MAP: Record<string, string> = {
  "K-201 repair is blocked on a dry gas seal with a 35-day lead time.":
    "K-201 seal replacement is blocked by a dry gas seal shortage with a 35-day lead time.",
  // Read-only, persona-safe restatement of the imperative "requires your
  // approval" headline. The ≈18-day critical horizon (governed TTC) and 35-day
  // seal lead time are the same governed values already narrated in the brief;
  // this is presentation-only rewording, not a new source of truth.
  "A K-201 decision requires your approval; projected time-to-critical is inside the repair lead time.":
    "K-201 requires a governed decision; the ≈18-day critical horizon is earlier than the 35-day seal lead time.",
};

const POINT_MAP: Record<string, string> = {
  "Approve, modify, or reject the K-201 intervention.":
    "The K-201 intervention is proposed and awaiting a governed reliability decision.",
  "Lead time threatens the 48-hour intervention.":
    "Lead time threatens the seal replacement (WO-2), not the 48-hour bearing inspection (WO-1).",
};

const SEAL_BLOCKER_DETAIL =
  "0 on hand with a 35-day lead time — this blocks the dry gas seal replacement (WO-2), not the 48-hour bearing inspection (WO-1). The seal aligns with the turnaround overhaul.";

const SEAL_ACTION_WHY =
  "The dry gas seal is out of stock (35-day lead); it constrains the seal replacement (WO-2) and its turnaround alignment — the 48-hour bearing inspection (WO-1) is not materials-blocked.";

const SEAL_ACTION_CONSEQUENCE = "Seal replacement blocked on materials.";

function correctRiskValue(rv: BriefRiskValue): BriefRiskValue {
  if (rv.label === "Value at stake (K-201)") {
    return { ...rv, label: "Decision exposure" };
  }
  return rv;
}

function correctBlocker(b: BriefBlocker): BriefBlocker {
  if (b.id === "blk-seal") {
    return { ...b, detail: SEAL_BLOCKER_DETAIL };
  }
  return b;
}

function correctAction(a: BriefAction): BriefAction {
  if (a.id === "act-expedite-seal") {
    return { ...a, why: SEAL_ACTION_WHY, consequenceOfInaction: SEAL_ACTION_CONSEQUENCE };
  }
  return a;
}

function correctDecision(d: BriefDecision): BriefDecision {
  return d.href ? { ...d, href: toV2Href(d.href) } : d;
}

/**
 * Present a persona brief for the V2 experience. Pure and deterministic: returns
 * a new brief with corrected wording and V2 decision links; the governed facts,
 * their order and their evidence are untouched.
 */
export function presentBriefForV2(brief: PersonaBrief): PersonaBrief {
  return {
    ...brief,
    summary: {
      headline: HEADLINE_MAP[brief.summary.headline] ?? brief.summary.headline,
      points: brief.summary.points.map((p) => POINT_MAP[p] ?? p),
    },
    riskValue: brief.riskValue.map(correctRiskValue),
    blockers: brief.blockers.map(correctBlocker),
    actions: brief.actions.map(correctAction),
    decisions: brief.decisions.map(correctDecision),
  };
}
