import type { MetadataRoute } from "next";
import { abs } from "@/lib/seo";

/**
 * There was no robots.txt at all, which is why `site:burnlog.net` returns
 * nothing: nothing pointed a crawler at a sitemap, and the sitemap didn't
 * exist either.
 *
 * Disallow is for pages that are real but worthless in an index — a signed-out
 * `/me` is an account sign-in or redirect, `/cli-auth` is a token handshake, and the
 * JSON API is not a search result.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/settings",
          "/me",
          "/cli-auth",
          // The OG image routes render a picture, never a page. They're linked
          // from metadata, which is how they get fetched — they don't need to
          // be crawled as documents.
          "/og/",
        ],
      },
    ],
    sitemap: abs("/sitemap.xml"),
    host: abs("/"),
  };
}
