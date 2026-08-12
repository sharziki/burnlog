import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { formatTokens } from "@/lib/format";
import { OG, OG_HEADERS, OG_SIZE, markDataUri } from "@/lib/og";

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
    burned = agg._sum.totalTokens ?? 0;
    burners = users;
  } catch {
    // Leave the stat strip out rather than fail the image.
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: OG.bg,
          padding: 72,
          justifyContent: "space-between",
          // A warm bloom off the top-right, echoing the app's glow.
          backgroundImage:
            "radial-gradient(900px 500px at 85% -10%, rgba(217,119,6,0.18) 0%, rgba(9,9,11,0) 70%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markDataUri(64)} width={64} height={64} alt="" />
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 20 }}>
            <div style={{ display: "flex", color: OG.white, fontSize: 40, fontWeight: 700, lineHeight: 1 }}>
              burnlog
            </div>
            <div
              style={{
                display: "flex",
                color: OG.subtle,
                fontSize: 17,
                letterSpacing: 5,
                marginTop: 8,
              }}
            >
              TOKEN BURN TRACKER
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              color: OG.white,
              fontSize: 78,
              fontWeight: 800,
              letterSpacing: -3,
              lineHeight: 1.04,
            }}
          >
            See how hard you ship with AI.
          </div>
          <div style={{ display: "flex", color: OG.gray, fontSize: 27, marginTop: 20, maxWidth: 900 }}>
            Every token your agents burn — counted, ranked, and put on a board
            against everyone else plugged in.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {burned > 0 ? (
              <>
                <div style={{ display: "flex", color: OG.amberBright, fontSize: 38, fontWeight: 700 }}>
                  {formatTokens(burned)}
                </div>
                <div style={{ display: "flex", color: OG.gray, fontSize: 24, marginLeft: 12 }}>
                  tokens burned by {burners} developer{burners === 1 ? "" : "s"}
                </div>
              </>
            ) : (
              <div style={{ display: "flex", color: OG.gray, fontSize: 24 }}>
                Claude Code · Codex · Cursor · 14 providers
              </div>
            )}
          </div>
          <div
            style={{
              display: "flex",
              color: OG.amber,
              fontSize: 24,
              border: `1px solid ${OG.border}`,
              borderRadius: 10,
              padding: "12px 22px",
              background: OG.surface,
            }}
          >
            npx @sxnalabs/burnlog
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, headers: OG_HEADERS },
  );
}
