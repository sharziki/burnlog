import type { MetadataRoute } from "next";
import { abs } from "@/lib/seo";
import { isFullSurface } from "@/lib/surface";

/**
 * There was no robots.txt at all, which is why `site:burnlog.net` returns
 * nothing: nothing pointed a crawler at a sitemap, and the sitemap didn't
 * exist either.
 *
 * Disallow is for pages that are real but worthless in an index — a signed-out
 * `/settings` is a sign-in button, `/cli-auth` is a token handshake, and the
 * JSON API is not a search result. Staged routes are added on a core
 * deployment so a crawler doesn't spend its budget collecting 404s.
 */
export default function robots(): MetadataRoute.Robots {
  const staged = ["/challenges", "/companies", "/teams", "/c/", "/h2h/"];

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/settings",
          "/cli-auth",
          // The OG image routes render a picture, never a page. They're linked
          // from metadata, which is how they get fetched — they don't need to
          // be crawled as documents.
          "/og/",
          ...(isFullSurface() ? [] : staged),
        ],
      },
    ],
    sitemap: abs("/sitemap.xml"),
    host: abs("/"),
  };
}
