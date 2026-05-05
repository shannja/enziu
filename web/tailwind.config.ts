import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // ENZIU Brand Colors - Simplified
        brand: {
          // Primary gradient colors
          yellow: "#ffde59",
          orange: "#ff914d",
          // Amber variant
          amber: "#ffb753",
          amberLight: "#FFD54F",
          amberDark: "#FF8F00",
          // Core neutrals
          black: "#151515",
          white: "#FAFAFA",
          // Grade colors
          grade: {
            a: "#22C55E",
            b: "#84CC16",
            c: "#EAB308",
            d: "#F97316",
            f: "#EF4444",
          },
        },
      },
      backgroundImage: {
        // Primary brand gradient
        "brand-gradient": "linear-gradient(90deg, #ffde59 0%, #ff914d 100%)",
        "brand-gradient-br": "linear-gradient(135deg, #ffde59 0%, #ff914d 100%)",
        "brand-gradient-reverse": "linear-gradient(90deg, #ff914d 0%, #ffde59 100%)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { transform: "translateY(20px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "gradient-shift": {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out",
        "slide-up": "slide-up 0.4s ease-out",
        "gradient-shift": "gradient-shift 3s ease infinite",
      },
      boxShadow: {
        "gradient": "0 8px 20px rgba(255, 145, 77, 0.3)",
        "gradient-sm": "0 4px 12px rgba(255, 145, 77, 0.2)",
      },
    },
  },
  plugins: [],
};

export default config;