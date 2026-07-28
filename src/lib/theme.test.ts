import { describe, it, expect } from "vitest";
import { resolveTheme, normalizeThemePref, THEME_STORAGE_KEY } from "./theme";

describe("resolveTheme", () => {
  it("honours an explicit light/dark preference regardless of OS", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("dark", true)).toBe("dark");
  });

  it("follows the OS preference when set to system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("normalizeThemePref", () => {
  it("passes through valid preferences", () => {
    expect(normalizeThemePref("light")).toBe("light");
    expect(normalizeThemePref("dark")).toBe("dark");
    expect(normalizeThemePref("system")).toBe("system");
  });

  it("defaults unknown / missing values to system", () => {
    expect(normalizeThemePref(null)).toBe("system");
    expect(normalizeThemePref(undefined)).toBe("system");
    expect(normalizeThemePref("neon")).toBe("system");
  });

  it("uses a stable storage key", () => {
    expect(THEME_STORAGE_KEY).toBe("aso-theme");
  });
});
