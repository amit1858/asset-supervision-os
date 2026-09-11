import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createVolatileCredentialVault } from "./model-connection-memory";

describe("volatile model credential memory", () => {
  it("supports connect and disconnect without serialization", () => {
    const vault = createVolatileCredentialVault();
    expect(vault.get()).toBeNull();
    vault.set("nvapi-representative-secret-value");
    expect(vault.get()).toBe("nvapi-representative-secret-value");
    vault.clear();
    expect(vault.get()).toBeNull();
  });

  it("starts empty after a reload-equivalent new instance", () => {
    const first = createVolatileCredentialVault();
    first.set("nvapi-representative-secret-value");
    const reloaded = createVolatileCredentialVault();
    expect(reloaded.get()).toBeNull();
  });

  it("has no browser or server persistence mechanism", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/components/auth/model-connection-memory.ts",
      ),
      "utf8",
    );
    for (const forbidden of [
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "document.cookie",
      "process.env",
      "fetch(",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
