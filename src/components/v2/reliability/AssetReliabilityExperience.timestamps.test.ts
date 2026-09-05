import { describe, it, expect } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Vitest transforms .tsx with the classic JSX runtime (React.createElement),
// but the rendered components use the automatic runtime and import no React.
// Expose React globally so the classic-runtime factory resolves at render time.
(globalThis as unknown as { React: typeof React }).React = React;
import { getK201ReliabilityView } from "@/v2/server/reliability/asset-reliability-view";
import { formatUtcDate, formatUtcInstant } from "@/v2/reliability/view-types";
import { AssetReliabilityExperience } from "./AssetReliabilityExperience";

/**
 * September 10 visual-acceptance correction — timestamp presentation.
 *
 * The K-201 Asset 360 experience must never render a raw canonical ISO instant
 * in visible text: every visible instant is routed through the shared
 * client-safe `formatUtcInstant` (and dates through `formatUtcDate`). These are
 * presentation-only guarantees — the underlying governed view values, evidence
 * IDs and asOf instants are unchanged, and the assessment (06:00 UTC) instant
 * stays distinct from the materials/turnaround (12:00 UTC) instants.
 */

// A full canonical ISO instant, e.g. 2026-07-27T06:00:00.000Z.
const ISO_INSTANT = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;

/** Visible text only: drop every tag (and its attributes, keys, dateTime, SVG). */
function visibleText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

describe("AssetReliabilityExperience — timestamp presentation (K-201 Asset 360)", () => {
  const view = getK201ReliabilityView("reliability_manager");
  const html = renderToStaticMarkup(createElement(AssetReliabilityExperience, { view }));
  const text = visibleText(html);

  it("renders NO raw canonical ISO timestamp in visible text", () => {
    const leaked = text.match(ISO_INSTANT);
    expect(leaked ? `leaked ISO: ${leaked.slice(0, 5).join(", ")}` : "clean").toBe("clean");
  });

  it("routes the assessment header instant through the shared formatter", () => {
    expect(text).toContain(formatUtcInstant(view.evaluatedAt));
    expect(formatUtcInstant(view.evaluatedAt)).toContain("06:00 UTC");
  });

  it("routes every signal condition-event `at` through the shared formatter", () => {
    expect(view.signal.conditionEvents.length).toBeGreaterThan(0);
    for (const e of view.signal.conditionEvents) {
      expect(text).toContain(formatUtcInstant(e.at));
    }
  });

  it("routes every lifecycle-projection `asOf` through the shared formatter", () => {
    expect(view.lifecycleProjection.length).toBeGreaterThan(0);
    for (const e of view.lifecycleProjection) {
      expect(text).toContain(formatUtcInstant(e.asOf));
    }
  });

  it("routes every evidence-lineage `asOf` through the shared formatter", () => {
    expect(view.evidenceLineage.length).toBeGreaterThan(0);
    for (const r of view.evidenceLineage) {
      expect(text).toContain(formatUtcInstant(r.asOf));
    }
  });

  it("routes work-readiness and turnaround instants through the shared formatter", () => {
    for (const wr of view.workReadiness) {
      expect(text).toContain(formatUtcInstant(wr.evaluatedAt));
    }
    expect(text).toContain(formatUtcInstant(view.turnaround.evaluatedAt));
  });

  it("keeps assessment (06:00 UTC) distinct from readiness/turnaround (12:00 UTC)", () => {
    const assessment = formatUtcInstant(view.evaluatedAt);
    const readiness = formatUtcInstant(view.workReadiness[0]!.evaluatedAt);
    const turnaround = formatUtcInstant(view.turnaround.evaluatedAt);
    expect(assessment).toContain("06:00 UTC");
    expect(readiness).toContain("12:00 UTC");
    expect(turnaround).toContain("12:00 UTC");
    expect(assessment).not.toBe(readiness);
    expect(text).toContain(assessment);
    expect(text).toContain(readiness);
  });

  it("formats the turnaround earliest-available DATE via the shared date formatter", () => {
    if (view.turnaround.availableDate !== null) {
      expect(text).toContain(formatUtcDate(view.turnaround.availableDate));
      // The raw YYYY-MM-DD form must not appear as visible text.
      expect(text).not.toContain(view.turnaround.availableDate);
    }
  });

  it("does not change underlying governed view values (presentation-only)", () => {
    // Underlying instants remain exact canonical ISO on the model.
    expect(view.evaluatedAt).toBe("2026-07-27T06:00:00.000Z");
    for (const wr of view.workReadiness) {
      expect(wr.evaluatedAt).toBe("2026-07-27T12:00:00.000Z");
    }
    expect(view.turnaround.evaluatedAt).toBe("2026-07-27T12:00:00.000Z");
    for (const e of view.lifecycleProjection) {
      expect(e.asOf).toMatch(ISO_INSTANT);
    }
    for (const r of view.evidenceLineage) {
      expect(r.asOf).toMatch(ISO_INSTANT);
    }
    // Evidence IDs and the golden exposure display are untouched by the fix.
    const exposureRow = view.evidenceLineage.find((r) => r.key === "exposure")!;
    expect(exposureRow.asOf).toBe("2026-07-27T06:00:00.000Z");
    expect(text).toContain("$1,620,156");
  });
});
