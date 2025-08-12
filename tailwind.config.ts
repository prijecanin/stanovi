import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-montserrat)", "ui-sans-serif", "system-ui"]
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem"
      }
    },
  },
  plugins: [],
} satisfies Config;
