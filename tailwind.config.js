/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        primary: "var(--color-primary)",
        "primary-hover": "var(--color-primary-hover)",
        accent: "var(--color-accent)",
        "accent-hover": "var(--color-accent-hover)",
        surface: "var(--color-surface)",
        border: "var(--color-border)",
        "text-main": "var(--color-text-main)",
        "text-muted": "var(--color-text-muted)",
        success: "var(--color-success)",
        danger: "var(--color-danger)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        xs: "0 1px 2px rgba(15, 23, 42, 0.04)",
        card: "0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 2px 6px -1px rgba(15, 23, 42, 0.03)",
        elevated: "0 20px 35px -5px rgba(15, 23, 42, 0.08)",
        modal: "0 25px 50px -12px rgba(15, 23, 42, 0.25)",
      },
      backdropBlur: {
        header: "12px",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(24px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pulseRing: {
          "0%": { transform: "scale(0.95)", boxShadow: "0 0 0 0 rgba(0, 168, 135, 0.4)" },
          "70%": { transform: "scale(1)", boxShadow: "0 0 0 10px rgba(0, 168, 135, 0)" },
          "100%": { transform: "scale(0.95)", boxShadow: "0 0 0 0 rgba(0, 168, 135, 0)" },
        },
      },
      animation: {
        "fade-in": "fadeIn 0.25s ease-out forwards",
        "slide-up": "slideUp 0.30s ease-out forwards",
        "pulse-ring": "pulseRing 2s infinite",
      },
    },
  },
  plugins: [],
};
