import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { formatTokens } from "@/lib/format";
import { OG, OG_HEADERS, OG_SIZE, markDataUri, ogFonts } from "@/lib/og";

export const runtime = "nodejs";

/**
 * The site-wide OG card — what unfurls when burnlog.net itself is shared.
 *
 * Pulls live totals so the card is social proof rather than a static banner:
 * "10.5B tokens burned" is a far better hook than a tagline alone. Falls back
 * to the tagline if the query fails, because a broken database should never
 * turn into a broken link preview.
 */
export async function GET() {
  let burned = 0;
  let burners = 0;
  try {
    const [agg, users] = await Promise.all([
      prisma.burnEvent.aggregate({ _sum: { totalTokens: true } }),
      prisma.user.count({ where: { username: { not: null } } }),
    ]);
    burned = Number(agg._sum.totalTokens ?? 0);
    burners = users;
  } catch {
    // Leave the stat strip out rather than fail the image.
  }

  const fonts = await ogFonts();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: OG.bg,
          padding: "64px 72px 56px",
          fontFamily: "Sans",
          color: OG.ink,
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markDataUri(34, OG.bg)} width={34} height={34} alt="" />
          <div style={{ display: "flex", fontSize: 28, fontWeight: 700, marginLeft: 12, letterSpacing: -0.5 }}>burnlog</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontFamily: "Sans", fontWeight: 600, fontSize: 104, lineHeight: 1, letterSpacing: -4 }}>
            Every token you burn, ranked.
          </div>
          <div style={{ display: "flex", fontSize: 28, color: OG.soft, marginTop: 24 }}>
            The leaderboard for AI coding — one prompt into your agent and you are on it.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `1px solid ${OG.line}`,
            paddingTop: 26,
            fontSize: 24,
            color: OG.dim,
          }}
        >
          <div style={{ display: "flex" }}>
            {burned > 0
              ? `${formatTokens(burned)} tokens burned by ${burners} developer${burners === 1 ? "" : "s"}`
              : "Claude Code · Codex · Cursor and 50 more agents"}
          </div>
          <div style={{ display: "flex", fontFamily: "Mono", fontSize: 20 }}>burnlog.net</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts, headers: OG_HEADERS },
  );
}
