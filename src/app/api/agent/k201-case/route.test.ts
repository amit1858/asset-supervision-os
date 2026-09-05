import { describe, it, expect, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined }),
}));

import { POST } from "./route";

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/agent/k201-case", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

describe("POST /api/agent/k201-case", () => {
  it("rejects a malformed JSON body with 400", async () => {
    const res = await POST(post("{ not json"));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown question id with 400", async () => {
    const res = await POST(post(JSON.stringify({ questionId: "drop_tables" })));
    expect(res.status).toBe(400);
  });

  it("rejects an oversized declared payload with 413", async () => {
    const res = await POST(post(JSON.stringify({ questionId: "why_action_now" }), {
      "content-length": "999999",
    }));
    expect(res.status).toBe(413);
  });

  it("answers a valid governed question with a schema-shaped K-201 response", async () => {
    const res = await POST(post(JSON.stringify({ questionId: "why_action_now" })));
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect((json.subject as { assetTag: string }).assetTag).toBe("K-201");
    expect(json.generationStatus).toBe("deterministic");
    // persona is resolved on the server (default reliability_manager), never from the body
    expect((json.viewer as { personaId: string }).personaId).toBe("reliability_manager");
  });

  it("ignores a persona supplied in the request body (server-trusted persona only)", async () => {
    const res = await POST(
      post(JSON.stringify({ questionId: "why_action_now", viewerId: "plant_manager" })),
    );
    const json = (await res.json()) as Record<string, unknown>;
    expect((json.viewer as { personaId: string }).personaId).toBe("reliability_manager");
  });
});
