import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f7f8fa",
          100: "#eceef2",
          200: "#d5dae2",
          300: "#aab1bd",
          400: "#7d8596",
          500: "#525b6e",
          600: "#3a4255",
          700: "#2a3040",
          800: "#1c2130",
          900: "#121622",
          950: "#0a0d16",
        },
        accent: {
          50: "#eef4ff",
          100: "#d9e6ff",
          200: "#bcd2ff",
          300: "#8fb3ff",
          400: "#5b8aff",
          500: "#3865f5",
          600: "#2449db",
          700: "#1f3bb0",
          800: "#1f348b",
          900: "#1e3070",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      animation: {
        "pulse-soft": "pulseSoft 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 240ms ease-out both",
      },
      keyframes: {
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        fadeIn: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
