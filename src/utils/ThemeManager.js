export class ThemeManager {
  /**
   * Apply only theme (kept for backward compatibility)
   */
  static apply(theme) {
    if (typeof window === "undefined" || !window.document) return;
    const t =
      theme === "auto" ? ThemeManager.getSystemTheme() : theme || "light";
    document.documentElement.setAttribute("data-theme", t);
  }

  /**
   * Detect system theme (light/dark)
   */
  static getSystemTheme() {
    try {
      if (typeof window === "undefined" || !window.matchMedia) return "light";
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    } catch {
      return "light";
    }
  }

  /**
   * Check if backdrop-filter is supported by the current browser
   */
  static isBackdropSupported() {
    try {
      // Prefer CSS.supports when available
      if (typeof CSS !== "undefined" && CSS.supports) {
        return (
          CSS.supports("backdrop-filter: blur(1px)") ||
          CSS.supports("-webkit-backdrop-filter: blur(1px)")
        );
      }
      // Conservative default to true (Chrome supports it)
      return true;
    } catch {
      return true;
    }
  }

  /**
   * Resolve the effective preset given settings and current theme
   * UX rule: when theme=auto and uiStyle=glass → use Default Frosted on light, Dark Frost on dark
   */
  static resolvePreset(settings, appliedTheme) {
    const uiStyle =
      settings?.uiStyle === "solid" || settings?.uiStyle === "glass"
        ? settings.uiStyle
        : "glass";
    let preset = settings?.glassPreset || "default-frosted";

    if (uiStyle === "glass" && (settings?.theme || "auto") === "auto") {
      preset = appliedTheme === "dark" ? "dark-frost" : "default-frosted";
    }
    return preset;
  }

  /**
   * Apply theme, style, and preset in one call and expose feature detection as data attributes.
   * - data-theme: "light" | "dark"
   * - data-style: "glass" | "solid"
   * - data-preset: "default-frosted" | "aurora-blue" | "mint-glow" | "dark-frost"
   * - data-backdrop: "supported" | "unsupported"
   */
  static applyAll(settings = {}) {
    if (typeof window === "undefined" || !window.document) return;

    // Resolve theme (light/dark) from user setting
    const themeSetting = (settings.theme || "auto").toLowerCase();
    const appliedTheme =
      themeSetting === "auto" ? ThemeManager.getSystemTheme() : themeSetting;

    // Resolve UI style (glass/solid)
    const uiStyle =
      settings.uiStyle === "solid" || settings.uiStyle === "glass"
        ? settings.uiStyle
        : "glass";

    // Resolve preset with UX rule for theme=auto
    const preset = ThemeManager.resolvePreset(settings, appliedTheme);

    const root = document.documentElement;
    root.setAttribute("data-theme", appliedTheme);
    root.setAttribute("data-style", uiStyle);
    root.setAttribute("data-preset", preset);

    // Expose backdrop support for CSS fallbacks if needed
    const supported = ThemeManager.isBackdropSupported();
    root.setAttribute("data-backdrop", supported ? "supported" : "unsupported");
  }
}
