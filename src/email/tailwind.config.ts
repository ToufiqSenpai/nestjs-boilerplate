import { pixelBasedPreset, type TailwindConfig } from "react-email"

export const tailwindConfig = {
  presets: [pixelBasedPreset],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#0f172a",
          secondary: "#475569"
        },
        background: "#f3f4f6",
        surface: "#ffffff"
      }
    }
  }
} satisfies TailwindConfig

export const brandAssets = {
  name: "Acme",
  supportEmail: "support@example.com"
} as const
