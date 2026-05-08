import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Palette mirrored from the Coffee Cup Leaderboard screenshot.
        cream: {
          50: "#FAF7EF",
          100: "#F4F1EA",
          200: "#E8E2D0",
          300: "#D6CDB4",
        },
        coffee: {
          50: "#F5EDE0",
          400: "#A98562",
          600: "#8B6F47",
          800: "#5C4830",
          900: "#3B2D1E",
        },
        // Foundry-ish slate / accent
        foundry: {
          blue: "#1F77B4",
          slate: "#1F2937",
        },
      },
      fontFamily: {
        // Foundry's UI uses Inter; the leaderboard header looks more serifed.
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Helvetica", "Arial"],
        serif: ["ui-serif", "Georgia", "Cambria", "Times New Roman", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
