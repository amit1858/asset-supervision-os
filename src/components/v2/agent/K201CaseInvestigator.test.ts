import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { K201CaseInvestigator } from "./K201CaseInvestigator";

const path = join(
  process.cwd(),
  "src/components/v2/agent/K201CaseInvestigator.tsx",
);
const source = readFileSync(path, "utf8");

describe("K201CaseInvestigator — launcher (server-rendered, drawer closed)", () => {
  const html = renderToStaticMarkup(createElement(K201CaseInvestigator));

  it("renders a prominent above-the-fold launch action", () => {
    expect(html).toContain("Investigate with AI");
    expect(html).toContain("Governed Case Investigator");
    expect(html).toContain("Read-only");
  });

  it("carries the governed subtext and keeps the primary question canonical", () => {
    expect(html).toContain("Trace the governed evidence behind this decision.");
    expect(source).toContain('PRIMARY_QUESTION_ID: AgentQuestionId = "why_action_now"');
  });

  it("advertises a dialog and does not render the drawer body until opened", () => {
    expect(html).toContain('aria-haspopup="dialog"');
    // The drawer is portalled and gated on `open`; its thread body must not leak
    // into the closed, server-rendered launcher markup.
    expect(html).not.toContain("Governed Case Investigator — K-201");
    expect(html).not.toContain("Investigating governed evidence");
  });

  it("opens as an empty investigation workspace and waits for an explicit question", () => {
    expect(source).toContain("const openInvestigator = useCallback(() => {");
    expect(source).not.toMatch(
      /const openInvestigator = useCallback\(\(\) => \{[\s\S]*?void ask\(PRIMARY_QUESTION_ID\)/,
    );
    expect(source).toContain("Choose a question to open the governed K-201 case.");
  });
});

describe("K201CaseInvestigator — governed request contract (source invariants)", () => {
  it("calls only the existing governed K-201 route", () => {
    expect(source).toContain('fetch("/api/agent/k201-case"');
  });

  it("sends only the questionId — never a persona or viewer override", () => {
    expect(source).toContain("JSON.stringify({ questionId })");
    expect(source).not.toContain("viewerId");
    expect(source).not.toContain("personaId");
  });

  it("prevents a duplicate in-flight request", () => {
    expect(source).toContain("inFlight.current");
    expect(source).toContain("if (inFlight.current) return;");
  });

  it("drops a superseded response with a monotonic request token", () => {
    expect(source).toContain("requestToken.current");
    expect(source).toContain("if (token !== requestToken.current) return;");
  });

  it("offers a retry on total failure", () => {
    expect(source).toContain("Try again");
    expect(source).toMatch(/kind: "error"/);
  });

  it("leads with the canonical primary question id", () => {
    expect(source).toContain('PRIMARY_QUESTION_ID: AgentQuestionId = "why_action_now"');
  });

  it("imports no server, engine or mutation module", () => {
    const forbidden = [
      "@/v2/server",
      "@/data",
      "@/agent/tools",
      "@/agent/orchestrator",
      "@/agent/deterministic",
      "command-orchestrator",
      "server-only",
    ];
    for (const spec of forbidden) {
      expect(source.includes(spec), `imports forbidden ${spec}`).toBe(false);
    }
  });

  it("exposes no approve / endorse / schedule / reserve control", () => {
    const lower = source.toLowerCase();
    expect(lower).not.toContain("approve");
    expect(lower).not.toContain("endorse(");
    expect(lower).not.toContain('"schedule"');
    expect(lower).not.toContain("reserve(");
  });
});
