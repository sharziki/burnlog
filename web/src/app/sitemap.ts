import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { abs } from "@/lib/seo";
import { TOOLS } from "@/lib/tools";
import { COMPARISONS } from "@/lib/comparisons";
import { isFullSurface } from "@/lib/surface";

// Users sign up and burn tokens continuously, so a sitemap baked at build time
// would be wrong within the hour.
export const dynamic = "force-dynamic";

/**
 * Every public URL, with profiles as the long tail.
 *
 * Profiles are the pages worth indexing at volume: one per burner, each with a
 * unique title, real numbers, and a rank. The static pages are here mostly so
 * the file is a complete answer to "what is on this site".
 *
 * Staged routes are omitted on a core deployment — they 404 there, and a
 * sitemap full of 404s is a crawl-budget bonfire.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: abs("/"), lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: abs("/embed"), lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: abs("/tools"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    // The prompt page is the primary onboarding route now, so it ranks above
    // the tool index it links into.
    { url: abs("/agent"), lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    // The per-agent pages answer "how do I track token usage in <agent>",
    // which is the query shape with the intent behind it.
    ...TOOLS.map((t) => ({
      url: abs(`/tools/${t.slug}`),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.9,
    })),
    // Comparison pages target "<rival> alternative" and "burnlog vs <rival>",
    // which are lower volume than the category head terms and far easier to win.
    ...COMPARISONS.map((c) => ({
      url: abs(`/vs/${c.slug}`),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    { url: abs("/privacy"), lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: abs("/security"), lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: abs("/terms"), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  if (isFullSurface()) {
    staticRoutes.push(
      { url: abs("/challenges"), lastModified: now, changeFrequency: "daily", priority: 0.7 },
      { url: abs("/companies"), lastModified: now, changeFrequency: "weekly", priority: 0.5 },
      { url: abs("/teams"), lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    );
  }

  // `lastBurnDate` is a "YYYY-MM-DD" string kept for streak maths, which makes
  // it a free lastModified — no aggregate over BurnEvent needed.
  // Only burners who have actually burned. An account that signed in and never
  // synced renders a profile full of zeroes, and submitting a pile of those is
  // how a small site teaches Google it publishes thin pages.
  const users = await prisma.user.findMany({
    where: { username: { not: null }, burnEvents: { some: {} } },
    select: { username: true, lastBurnDate: true, createdAt: true },
  });

  const profiles: MetadataRoute.Sitemap = users.map((u) => ({
    url: abs(`/u/${u.username}`),
    lastModified: u.lastBurnDate ? new Date(`${u.lastBurnDate}T00:00:00Z`) : u.createdAt,
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  return [...staticRoutes, ...profiles];
}
