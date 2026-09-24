import localFont from "next/font/local";
import { JetBrains_Mono } from "next/font/google";

/**
 * Switzer for everything you read, JetBrains Mono for numbers and code.
 * Switzer is self-hosted (Fontshare, ITF Free Font License — free for
 * commercial and web use); JetBrains Mono is OFL, bundled by next/font at build.
 */
export const sans = localFont({
  src: [
    { path: "../../public/fonts/switzer-400.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/switzer-500.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/switzer-600.woff2", weight: "600", style: "normal" },
    { path: "../../public/fonts/switzer-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

export const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});
