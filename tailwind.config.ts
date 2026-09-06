import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        /* ── shadcn/ui tokens (pure shadcn, no theme bridge) ─ */
        border:      "var(--border)",
        input:       "var(--input)",
        ring:        "var(--ring)",
        background:  "var(--background)",
        foreground:  "var(--foreground)",
        primary: {
          DEFAULT:     "var(--primary)",
          foreground:  "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT:     "var(--secondary)",
          foreground:  "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT:     "var(--destructive)",
          foreground:  "var(--destructive-foreground, var(--background))",
        },
        muted: {
          DEFAULT:     "var(--muted)",
          foreground:  "var(--muted-foreground)",
        },
        accent: {
          DEFAULT:     "var(--accent)",
          foreground:  "var(--accent-foreground)",
        },
        popover: {
          DEFAULT:     "var(--popover)",
          foreground:  "var(--popover-foreground)",
        },
        card: {
          DEFAULT:     "var(--card)",
          foreground:  "var(--card-foreground)",
        },
        chart: {
          "1": "var(--chart-1)",
          "2": "var(--chart-2)",
          "3": "var(--chart-3)",
          "4": "var(--chart-4)",
          "5": "var(--chart-5)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
        /* ── Legacy theme tokens (kept until *Legacy.tsx is gone) ── */
        theme: {
          page:    "hsl(var(--bg))",
          surface: "hsl(var(--surface))",
          raised:  "hsl(var(--surface-raised))",
          overlay: "hsl(var(--surface-overlay))",
          fg:      "hsl(var(--fg))",
          muted:   "hsl(var(--fg-muted))",
          subtle:  "hsl(var(--fg-subtle))",
          border:  "var(--border)",
          strong:  "hsl(var(--border-strong))",
          primary: "var(--primary)",
          ring:    "var(--ring)",
          input:   "hsl(var(--input-bg))",
          "input-border": "hsl(var(--input-border))",
          /* sidebar */
          "sidebar-bg":     "hsl(var(--sidebar-bg))",
          "sidebar-border": "var(--sidebar-border)",
          "sidebar-active": "hsl(var(--sidebar-active-bg))",
          "sidebar-active-fg": "hsl(var(--sidebar-active-fg))",
          "sidebar-hover":  "hsl(var(--sidebar-hover-bg))",
          /* semantic */
          "success-bg": "hsl(var(--success-bg))",
          "success-fg": "hsl(var(--success-fg))",
          "warning-bg": "hsl(var(--warning-bg))",
          "warning-fg": "hsl(var(--warning-fg))",
          "danger-bg":  "hsl(var(--danger-bg))",
          "danger-fg":  "hsl(var(--danger-fg))",
          "info-bg":    "hsl(var(--info-bg))",
          "info-fg":    "hsl(var(--info-fg))",
          "purple-bg":  "hsl(var(--purple-bg))",
          "purple-fg":  "hsl(var(--purple-fg))",
        },
        brand: {
          50:  "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
        },
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to:   { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to:   { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up":   "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
