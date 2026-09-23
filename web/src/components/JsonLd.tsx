import { PUBLISHER, SITE_DESCRIPTION, SITE_NAME, SITE_URL, abs } from "@/lib/seo";

/**
 * Structured data, rendered server-side.
 *
 * Everything here describes something that is actually true on the page.
 * Notably absent: `aggregateRating` and `review`, which are the two schema
 * types people fake to win stars in the SERP and the two Google most reliably
 * issues manual actions over.
 */
function Ld({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // The payload is built from our own data, not user input, and JSON.stringify
      // escapes the quotes. `</script>` inside a string is the one sequence that
      // could break out, so it's neutralised.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

/** Site-wide: who this is, what the product is. Rendered once, in the layout. */
export function SiteJsonLd() {
  return (
    <>
      <Ld
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          "@id": abs("/#website"),
          name: SITE_NAME,
          url: SITE_URL,
          description: SITE_DESCRIPTION,
          publisher: {
            "@type": "Organization",
            name: PUBLISHER.name,
            url: PUBLISHER.url,
          },
        }}
      />
      <Ld
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          "@id": abs("/#app"),
          name: SITE_NAME,
          url: SITE_URL,
          description: SITE_DESCRIPTION,
          applicationCategory: "DeveloperApplication",
          applicationSubCategory: "Developer Tools",
          operatingSystem: "macOS, Linux, Windows",
          softwareHelp: "https://github.com/sharziki/burnlog",
          downloadUrl: "https://www.npmjs.com/package/@sxnalabs/burnlog",
          installUrl: "https://www.npmjs.com/package/@sxnalabs/burnlog",
          license: "https://opensource.org/licenses/MIT",
          author: { "@type": "Organization", name: PUBLISHER.name, url: PUBLISHER.url },
          // Free, and saying so in schema is what puts "Free" in the result.
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          featureList: [
            "Token usage tracking for Claude Code, Codex, Gemini CLI and other AI coding agents",
            "Public leaderboard ranked by tokens burned",
            "Rank ladder from Spark to Supernova",
            "Achievements earned from real usage",
            "Embeddable README badge and widget",
          ],
        }}
      />
    </>
  );
}

export function ProfileJsonLd({
  username,
  name,
  image,
  bio,
  github,
  twitter,
  website,
  totalTokens,
  rank,
}: {
  username: string;
  name: string | null;
  image: string | null;
  bio: string | null;
  github: string | null;
  twitter: string | null;
  website: string | null;
  totalTokens: number;
  rank: string;
}) {
  const sameAs = [
    github ? `https://github.com/${github}` : null,
    twitter ? `https://x.com/${twitter}` : null,
    website,
  ].filter((x): x is string => Boolean(x));

  return (
    <Ld
      data={{
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        url: abs(`/u/${username}`),
        dateModified: new Date().toISOString(),
        mainEntity: {
          "@type": "Person",
          name: name ?? username,
          alternateName: `@${username}`,
          url: abs(`/u/${username}`),
          ...(image ? { image } : null),
          ...(bio ? { description: bio } : null),
          ...(sameAs.length ? { sameAs } : null),
        },
        // The two numbers the page exists to state, in a form a machine can read.
        about: {
          "@type": "Thing",
          name: `${totalTokens.toLocaleString("en-US")} AI tokens burned · rank ${rank}`,
        },
        isPartOf: { "@id": abs("/#website") },
      }}
    />
  );
}
