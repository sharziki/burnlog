import type { ReactNode } from "react";
import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.NODE_ENV === "production" ? "https://burnlog.net" : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "burnlog — private AI coding telemetry for teams",
    template: "%s · burnlog",
  },
  description:
    "Privacy-first AI coding telemetry for teams. Works with Claude Code today, supports manual Codex log sync, and offers SDK + MCP paths for custom agents.",
  openGraph: {
    title: "burnlog — private AI coding telemetry for teams",
    description:
      "Privacy-first AI coding telemetry across Claude Code, Codex, and custom agents.",
    url: siteUrl,
    siteName: "burnlog",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "burnlog — private AI coding telemetry for teams",
    description:
      "Privacy-first AI coding telemetry across Claude Code, Codex, and custom agents.",
    creator: "@sharziki",
  },
  icons: { icon: "/favicon.svg" },
  manifest: "/manifest.json",
  authors: [{ name: "Sharvil Saxena", url: "https://github.com/sharziki" }],
  creator: "SXNA Labs",
  publisher: "SXNA Labs",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#09090B" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Instrument+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Nav />
        {children}
        <Footer />
      </body>
    </html>
  );
}
