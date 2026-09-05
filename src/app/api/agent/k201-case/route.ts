import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readOperationalContext } from "@/context/server";
import { investigateK201Case } from "@/agent/orchestrator";
import { AGENT_QUESTIONS, isAgentQuestionId } from "@/agent/types";

/**
 * POST /api/agent/k201-case
 *
 * The governed K-201 case investigator boundary. It resolves the authorised
 * persona on the SERVER (never from the request body), dispatches a read-only
 * tool plan, grounds the answer in governed evidence, and returns a structured,
 * citation-validated response. It executes no action, mutates nothing, and never
 * echoes or logs the request body. The provider is selected server-side from the
 * environment; a client cannot choose or influence the model.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 4096;

export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return NextResponse.json({ error: "Request too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BYTES) {
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    }
    body = raw.length === 0 ? {} : JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  const questionId = (body as { questionId?: unknown } | null)?.questionId;
  if (!isAgentQuestionId(questionId)) {
    return NextResponse.json({ error: "Unknown question" }, { status: 400 });
  }

  const question = AGENT_QUESTIONS.find((q) => q.id === questionId)!.prompt;
  const ctx = readOperationalContext();

  try {
    const response = await investigateK201Case({
      viewerId: ctx.personaId,
      questionId,
      question,
      requestId: randomUUID(),
    });
    return NextResponse.json(response);
  } catch {
    // Fail closed — never echo the request body or internal detail.
    return NextResponse.json({ error: "Investigation failed" }, { status: 500 });
  }
}
