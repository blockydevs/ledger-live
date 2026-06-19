import type { Config } from "tailwindcss";
import { ledgerLivePreset } from "@ledgerhq/lumen-design-core";

const config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@ledgerhq/lumen-ui-react/dist/lib/**/*.{js,ts,jsx,tsx}",
    "../../features/**/src/**/*.{ts,tsx}",
  ],
  presets: [ledgerLivePreset],
  theme: {
    extend: {
      keyframes: {
        "search-placeholder-slide-in": {
          from: { transform: "translateY(48px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "search-placeholder-slide-out": {
          "0%": { transform: "translateY(0)", opacity: "1" },
          "75%": { transform: "translateY(-75%)", opacity: "0" },
          "100%": { transform: "translateY(-100%)", opacity: "0" },
        },
      },
      animation: {
        "search-placeholder-slide-in":
          "search-placeholder-slide-in 400ms cubic-bezier(0, 0, 0.58, 1) forwards",
        "search-placeholder-slide-out":
          "search-placeholder-slide-out 400ms cubic-bezier(0, 0, 0.58, 1) forwards",
      },
    },
  },
} satisfies Config;

export default config;
