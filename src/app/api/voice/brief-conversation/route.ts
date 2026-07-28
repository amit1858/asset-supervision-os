import { NextResponse } from "next/server";
import { runBriefConversation, VoiceConversationError } from "@/voice/server/conversation-service";

/**
 * POST /api/voice/brief-conversation
 *
 * The governed voice truth boundary. Validates size + schema, resolves the
 * authorised persona and context on the server, grounds the answer in the
 * Chief of Staff brief, and returns a concise response with evidence,
 * provenance, sources, and (when applicable) a PROPOSED action + required
 * authority + confirmation route. It never executes an action, and never logs
 * the request body, audio, or operational records.
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
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  try {
    const result = runBriefConversation(body);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof VoiceConversationError) {
      // Fail closed with a safe message — never echo the request body.
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Conversation failed" }, { status: 500 });
  }
}
