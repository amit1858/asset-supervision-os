import type { Config } from "tailwindcss";

/**
 * Tailwind is wired to CSS variables defined in `src/app/globals.css`.
 * Every color is a `var(--...)` reference so a dark "control-room" theme can be
 * added later by overriding the variables under a `[data-theme="dark"]` scope,
 * without touching component markup.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--color-canvas)",
        surface: "var(--color-surface)",
        elevated: "var(--color-elevated)",
        overlay: "var(--color-overlay)",
        border: {
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)",
        },
        text: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          muted: "var(--color-text-muted)",
          inverted: "var(--color-text-inverted)",
        },
        brand: {
          DEFAULT: "var(--color-brand)",
          hover: "var(--color-brand-hover)",
          subtle: "var(--color-brand-subtle)",
          text: "var(--color-brand-text)",
        },
        header: {
          bg: "var(--color-header-bg)",
          fg: "var(--color-header-fg)",
          muted: "var(--color-header-muted)",
          border: "var(--color-header-border)",
        },
        // Operational status / severity roles. Each has a fill, a subtle
        // background wash, a border, and an accessible text color.
        healthy: {
          DEFAULT: "var(--color-healthy)",
          subtle: "var(--color-healthy-subtle)",
          border: "var(--color-healthy-border)",
          text: "var(--color-healthy-text)",
        },
        attention: {
          DEFAULT: "var(--color-attention)",
          subtle: "var(--color-attention-subtle)",
          border: "var(--color-attention-border)",
          text: "var(--color-attention-text)",
        },
        critical: {
          DEFAULT: "var(--color-critical)",
          subtle: "var(--color-critical-subtle)",
          border: "var(--color-critical-border)",
          text: "var(--color-critical-text)",
        },
        info: {
          DEFAULT: "var(--color-info)",
          subtle: "var(--color-info-subtle)",
          border: "var(--color-info-border)",
          text: "var(--color-info-text)",
        },
        planned: {
          DEFAULT: "var(--color-planned)",
          subtle: "var(--color-planned-subtle)",
          border: "var(--color-planned-border)",
          text: "var(--color-planned-text)",
        },
        ai: {
          DEFAULT: "var(--color-ai)",
          subtle: "var(--color-ai-subtle)",
          border: "var(--color-ai-border)",
          text: "var(--color-ai-text)",
        },
        neutralstatus: {
          DEFAULT: "var(--color-neutral)",
          subtle: "var(--color-neutral-subtle)",
          border: "var(--color-neutral-border)",
          text: "var(--color-neutral-text)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        "metric-lg": ["1.75rem", { lineHeight: "2rem", fontWeight: "600" }],
        "metric": ["1.375rem", { lineHeight: "1.75rem", fontWeight: "600" }],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        subtle: "var(--shadow-subtle)",
        card: "var(--shadow-card)",
        panel: "var(--shadow-panel)",
        focus: "var(--shadow-focus)",
      },
      transitionDuration: {
        fast: "var(--motion-fast)",
        base: "var(--motion-base)",
        slow: "var(--motion-slow)",
      },
      maxWidth: {
        content: "1440px",
      },
    },
  },
  plugins: [],
};

export default config;
