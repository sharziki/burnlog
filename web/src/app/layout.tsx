import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { sans, mono } from "./fonts";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "burnlog — private leaderboard for AI token burn",
    template: "%s · burnlog",
  },
  description:
    "Track every token you push through Claude Code, Codex, and other AI coding agents. Rank against friends. Private by default — we store tokens, not your prompts.",
  openGraph: {
    title: "burnlog — private leaderboard for AI token burn",
    description:
      "Track every token you push through Claude Code, Codex, and other AI coding agents.",
    url: siteUrl,
    siteName: "burnlog",
    type: "website",
    images: [{ url: `${siteUrl}/og`, width: 1200, height: 630, alt: "burnlog" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "burnlog — private leaderboard for AI token burn",
    description:
      "Track every token you push through Claude Code, Codex, and other AI coding agents.",
    creator: "@sharziki",
    images: [`${siteUrl}/og`],
  },
  // SVG first for crisp tabs; PNG/ICO for the surfaces that won't take SVG
  // (Safari, some launchers, link-preview scrapers).
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico", sizes: "48x48" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/manifest.json",
  authors: [{ name: "Sharvil Saxena", url: "https://github.com/sharziki" }],
  creator: "SXNA Labs",
  publisher: "SXNA Labs",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#09090B" />
      </head>
      <body>
        <Nav />
        {children}
        <Footer />
      </body>
    </html>
  );
}
