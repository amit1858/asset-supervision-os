import type { AiProvider, AiGenerationRequest, AiGenerationResult } from "../types";
import { approxTokens } from "../types";

/**
 * Deterministic, offline mock provider.
 *
 * Requires no API key and produces a grounded explanation built ONLY from the
 * evidence supplied in the request — it never introduces outside facts. Output
 * and token/latency accounting are fully deterministic so the demo is
 * byte-for-byte repeatable.
 */
export class MockAiProvider implements AiProvider {
  readonly id = "mock" as const;
  readonly model = "mock/deterministic-explainer";

  isAvailable(): boolean {
    return true;
  }

  async generate(request: AiGenerationRequest): Promise<AiGenerationResult> {
    const text = this.compose(request);
    const inputTokens = approxTokens(request.system + "\n" + request.user);
    const outputTokens = approxTokens(text);
    // Synthetic but deterministic latency (no wall-clock dependency).
    const latencyMs = 180 + (inputTokens + outputTokens) * 2;

    return {
      text,
      provider: this.id,
      model: this.model,
      inputTokens,
      outputTokens,
      latencyMs,
    };
  }

  /** Build grounded prose from the structured evidence only. */
  private compose(request: AiGenerationRequest): string {
    const ev = request.evidence;
    if (ev.length === 0) {
      return "Insufficient evidence was supplied to generate an explanation.";
    }

    const find = (needle: string) =>
      ev.find((e) => e.label.toLowerCase().includes(needle));

    const asset = find("asset")?.value ?? "the asset";
    const risk = find("risk score");
    const dispositionMatch = request.user.match(
      /disposition \(deterministic\):\s*([a-z_]+)/i,
    );
    const disposition =
      find("disposition")?.value ?? dispositionMatch?.[1] ?? "a reviewed action";
    const vibration = find("vibration");
    const temp = find("bearing");
    const projection = find("projected");
    const exposure = find("exposure") ?? find("financial");

    const sentences: string[] = [];

    if (risk) {
      sentences.push(
        `${asset} carries an elevated deterministic risk score (${risk.value}), driven primarily by measured condition data rather than estimation.`,
      );
    }

    const conditionBits: string[] = [];
    if (vibration) conditionBits.push(`vibration at ${vibration.value}`);
    if (temp) conditionBits.push(`bearing temperature at ${temp.value}`);
    if (conditionBits.length > 0) {
      sentences.push(
        `Condition signals show ${conditionBits.join(
          " and ",
        )}, both tracked against their warning and critical thresholds.`,
      );
    }

    if (projection) {
      sentences.push(
        `At the current deterioration rate, the trend projects toward the critical threshold in ${projection.value}.`,
      );
    }

    if (exposure) {
      sentences.push(
        `The calculated financial exposure of continued operation is ${exposure.value}.`,
      );
    }

    sentences.push(
      `The recommended disposition is to ${disposition.replace(
        /_/g,
        " ",
      )}. This recommendation is grounded only in the evidence above and requires human approval before any action is taken; it is not an autonomous control action.`,
    );

    return sentences.join(" ");
  }
}
