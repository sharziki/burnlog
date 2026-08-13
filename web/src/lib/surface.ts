/**
 * Which product surface this deployment shows.
 *
 * `full` is everything; `core` is the public leaderboard, progression (ranks,
 * achievements, profiles), and the share surfaces (badge, widget, /embed).
 * Everything still in the oven — clubs, challenges, companies, pricing,
 * head-to-head — is hidden on a `core` deployment and lives on staging until
 * its UX is settled.
 *
 * The default is `full`, deliberately: local dev, previews, and anyone
 * self-hosting get the whole app without configuring anything. Only
 * burnlog.net opts down, by setting `BURNLOG_SURFACE=core` in Vercel.
 *
 * This hides *surface*, not data. The APIs stay live on a core deployment
 * because the CLI and the MCP server drive challenges and clubs without ever
 * loading a page, and a half-gated API would break `burnlog challenge new` on
 * the machine of anyone pointed at production.
 */
import { notFound } from "next/navigation";

export type Surface = "core" | "full";

export function getSurface(): Surface {
  return process.env.BURNLOG_SURFACE === "core" ? "core" : "full";
}

/** True when the staged features should be visible. */
export function isFullSurface(): boolean {
  return getSurface() === "full";
}

/**
 * Guard for a staged page. 404 rather than redirect: a redirect to `/` reads
 * as a broken link, while a 404 is the honest answer — on this deployment the
 * page does not exist. Call it before any data loading.
 */
export function requireFullSurface(): void {
  if (!isFullSurface()) notFound();
}
