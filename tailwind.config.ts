import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./hooks/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#090D16",
        panel: "#0D1321",
        elevated: "#111A2C",
        hairline: "#1C2740",
        "hairline-focus": "#2A3B5E",
        "text-hi": "#E8EEF9",
        "text-mid": "#8A97B2",
        "text-dim": "#4A5670",
        mint: "#3DFFA2",
        amber: "#FFB454",
        rose: "#FF5470",
        ice: "#54C7FF",
        violet: "#B28CFF",
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        sans: ['"Inter"', "system-ui", "-apple-system", "sans-serif"],
      },
      boxShadow: {
        "glow-mint": "0 0 12px rgba(61,255,162,0.45)",
        "glow-amber": "0 0 12px rgba(255,180,84,0.45)",
        "glow-violet": "0 0 12px rgba(178,140,255,0.45)",
      },
    },
  },
  plugins: [],
};

export default config;
