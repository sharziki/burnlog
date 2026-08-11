import localFont from "next/font/local";

/**
 * Self-hosted so builds (including the Docker image) never need network
 * access to a font CDN, and so there's no third-party request at runtime.
 * Latin subsets only — the whole set is under 100KB.
 */

export const sans = localFont({
  src: [
    {
      path: "../../public/fonts/instrument-sans-400700.woff2",
      weight: "400 700",
      style: "normal",
    },
  ],
  variable: "--font-sans",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

export const mono = localFont({
  src: [
    { path: "../../public/fonts/ibm-plex-mono-400.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/ibm-plex-mono-500.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/ibm-plex-mono-600.woff2", weight: "600", style: "normal" },
    { path: "../../public/fonts/ibm-plex-mono-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});
