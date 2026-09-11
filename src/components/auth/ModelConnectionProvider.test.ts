import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(process.cwd(), "src/components/auth/ModelConnectionProvider.tsx"),
  "utf8",
);
const authSource = readFileSync(
  join(process.cwd(), "src/components/auth/AuthSessionProvider.tsx"),
  "utf8",
);

describe("ModelConnectionProvider security and lifecycle invariants", () => {
  it("keeps the credential in volatile memory and never browser persistence", () => {
    expect(source).toContain("createVolatileCredentialVault");
    expect(source).not.toContain("value={apiKey}");
    expect(source).toContain("inputRef.current.value");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
    expect(source).not.toContain("indexedDB");
    expect(source).not.toContain("document.cookie");
  });

  it("clears credentials on disconnect, sign-out and page lifecycle end", () => {
    expect(source).toContain("credentialVaultRef.current?.clear()");
    expect(source).toContain('window.addEventListener(SIGN_OUT_EVENT, clear)');
    expect(source).toContain('window.addEventListener("pagehide", clear)');
    expect(source).toContain('status === "unauthenticated"');
    expect(authSource).toMatch(
      /signOut: \(\) => \{[\s\S]*?notifyModelConnectionSignOut\(\)[\s\S]*?nextAuthSignOut\(\)/,
    );
  });

  it("sends the key only to same-origin server endpoints with no-store", () => {
    expect(source).toContain('fetch("/api/ai/model-connection"');
    expect(source).toContain("[API_KEY_HEADER]: apiKey");
    expect(source).toContain('cache: "no-store"');
    expect(source).not.toContain("integrate.api.nvidia.com");
  });

  it("distinguishes tested from connected", () => {
    expect(source).toContain("Connection test succeeded.");
    expect(source).toContain("The key is not connected until you select");
    expect(source).toContain("Connect for this session");
    expect(source).toContain("Connected until reload");
  });

  it("renders only safe categorized upstream diagnostics", () => {
    expect(source).toContain("Safe diagnostic:");
    expect(source).toContain("diagnostics.category");
    expect(source).toContain("diagnostics.pathname");
    expect(source).toContain("diagnostics.requestId");
    expect(source).not.toContain("raw upstream");
  });

  it("states the exact tab-scoped credential lifetime", () => {
    expect(source).toContain(
      "NVIDIA-assisted narration for this tab until you reload, sign out, or disconnect.",
    );
    expect(source).toContain("while you navigate");
    expect(source).toContain("Reloading or closing the tab");
    expect(source).toContain("Testing the key does not connect");
  });

  it("uses the accessible drawer with explicit credential labels and close text", () => {
    expect(source).toContain('title="Connect your model"');
    expect(source).toContain('closeLabel="Close model connection"');
    expect(source).toContain('htmlFor="nvidia-session-api-key"');
    expect(source).toContain("Show NVIDIA API key");
    expect(source).toContain("Hide NVIDIA API key");
  });
});
