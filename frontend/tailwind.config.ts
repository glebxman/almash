import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        forest: {
          DEFAULT: "#8B7CFF",
          deep: "#1B1828",
        },
        coral: "#FF6D57",
        cream: "#F7F3EA",
        mist: "#ECE8FF",
        ink: "#17151F",
        sand: "#D6F15C",
        lilac: "#C4B5FF",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      fontFamily: {
        display: ["Manrope", "system-ui", "sans-serif"],
        sans: ["Manrope", "system-ui", "sans-serif"],
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(16px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        softpulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        bouncein: {
          "0%": { opacity: "0", transform: "translateY(28px) scale(0.86)" },
          "60%": { opacity: "1", transform: "translateY(-8px) scale(1.04)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(-2deg)" },
          "50%": { transform: "rotate(3deg)" },
        },
        wave: {
          "0%, 100%": { transform: "rotate(0deg)" },
          "50%": { transform: "rotate(-28deg)" },
        },
        pop: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.2)" },
        },
      },
      animation: {
        rise: "rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) both",
        softpulse: "softpulse 2.4s ease-in-out infinite",
        bouncein: "bouncein 0.55s cubic-bezier(0.22, 1.2, 0.36, 1) both",
        wiggle: "wiggle 0.7s ease-in-out infinite",
        wave: "wave 0.8s ease-in-out infinite",
        pop: "pop 1.4s ease-in-out infinite",
        "pop-once": "pop 0.35s cubic-bezier(0.22, 1.4, 0.36, 1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
