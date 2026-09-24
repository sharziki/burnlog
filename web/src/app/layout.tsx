import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { sans, mono, serif } from "./fonts";
import { SiteJsonLd } from "@/components/JsonLd";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/seo";
import "./globals.css";

const siteUrl = SITE_URL;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: SITE_TITLE,
    template: "%s · burnlog",
  },
  description: SITE_DESCRIPTION,
  // Not a ranking factor since 2009, but Bing still reads them and they cost
  // nothing. The list is what the site is actually about, not a keyword dump.
  keywords: [
    "AI token leaderboard",
    "Claude Code usage tracker",
    "Claude Code token usage",
    "Codex token tracker",
    "AI coding usage analytics",
    "token burn leaderboard",
    "AI agent token tracking",
  ],
  // Deliberately no `alternates.canonical` here: metadata is inherited, so a
  // canonical in the layout would point every page at "/". Each page sets its
  // own; a missing canonical is a much smaller problem than a wrong one.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Let Google use the full snippet, the big image, and the whole video —
      // the defaults are conservative and cost you SERP real estate.
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: siteUrl,
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
    images: [{ url: `${siteUrl}/og`, width: 1200, height: 630, alt: "burnlog" }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    creator: "@sharziki",
    site: "@sharziki",
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
    <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#0B0B0A" />
      </head>
      <body>
        <SiteJsonLd />
        <Nav />
        {children}
        <Footer />
      </body>
    </html>
  );
}
