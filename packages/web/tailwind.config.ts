import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#0a0c14",
          card: "#12141e",
          elevated: "#1a1d2a",
          hover: "#161923",
        },
        border: {
          subtle: "#1e2130",
          medium: "#252836",
        },
        text: {
          primary: "#ffffff",
          secondary: "#c8cad2",
          muted: "#8b8fa7",
          dimmed: "#6b7085",
        },
        cat: {
          brand: "#4ade80",
          highintent: "#38bdf8",
          generic: "#facc15",
          competitor: "#f87171",
          retargeting: "#a78bfa",
          pmax: "#f97316",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
