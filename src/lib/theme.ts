/** Theme preference model, shared by the switcher and its tests. */
export type ThemePref = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "aso-theme";

/** Resolve a stored preference + OS signal into the concrete applied theme. */
export function resolveTheme(
  pref: ThemePref,
  systemPrefersDark: boolean,
): "light" | "dark" {
  if (pref === "dark") return "dark";
  if (pref === "light") return "light";
  return systemPrefersDark ? "dark" : "light";
}

/** Normalise an unknown stored value into a valid preference (default system). */
export function normalizeThemePref(value: string | null | undefined): ThemePref {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : "system";
}
