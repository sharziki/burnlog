/**
 * One place for the strings search engines read.
 *
 * They were scattered across layout, profile metadata, and the OG routes, each
 * with its own wording, which is exactly how a site ends up describing itself
 * three different ways to three different crawlers.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://burnlog.net";
export const SITE_NAME = "burnlog";

/** ≤60 chars, or Google truncates it in the result. */
export const SITE_TITLE = "burnlog — AI token leaderboard for Claude Code & Codex";

/** ≤160 chars, same reason. Leads with the query, not the brand. */
export const SITE_DESCRIPTION =
  "Track every token you burn in Claude Code, Codex, Gemini CLI and 14 providers. Public leaderboard, ranks, and a README badge. Tokens only — never prompts or code.";

export const PUBLISHER = {
  name: "SXNA Labs",
  url: "https://sxnalabs.com",
} as const;

/** Absolute URL for a site path. Structured data may not use relative URLs. */
export function abs(path: string): string {
  return new URL(path, SITE_URL).toString();
}
