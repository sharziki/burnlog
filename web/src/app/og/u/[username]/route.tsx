import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { getBoard, getUserStats } from "@/lib/stats";
import { getRank } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";
import { OG, OG_HEADERS, OG_SIZE, markDataUri, ogFonts } from "@/lib/og";

export const runtime = "nodejs";

/**
 * The card that unfurls when a profile link is pasted anywhere, and the image
 * behind "download card". Same system as the site: flat near-black, ivory,
 * a serif for the number, orange only for the place on the board.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const user = await prisma.user.findFirst({ where: { username }, select: { id: true } });
  const [stats, board, fonts] = await Promise.all([
    user ? getUserStats(user.id) : null,
    getBoard(),
    ogFonts(),
  ]);

  if (!stats) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: OG.bg,
            color: OG.dim,
            fontFamily: "Sans",
            fontSize: 40,
          }}
        >
          burnlog · no such burner
        </div>
      ),
      { ...OG_SIZE, fonts, headers: OG_HEADERS },
    );
  }

  const rank = getRank(stats.totalTokens);
  const burners = board.filter((u) => u.totalTokens > 0);
  const place = burners.findIndex((u) => u.username === username) + 1;
  const peak = Math.max(...stats.heatmap, 1);
  const weeks = Array.from({ length: 12 }, (_, w) => stats.heatmap.slice(w * 7, w * 7 + 7));

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
          padding: "60px 72px 52px",
          fontFamily: "Sans",
          color: OG.ink,
        }}
      >
        {/* brand · place */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={markDataUri(34, OG.bg)} width={34} height={34} alt="" />
            <div style={{ display: "flex", fontSize: 28, fontWeight: 700, marginLeft: 12, letterSpacing: -0.5 }}>burnlog</div>
          </div>
          {place > 0 && (
            <div style={{ display: "flex", alignItems: "baseline", fontSize: 26, color: OG.soft }}>
              <span style={{ fontFamily: "Mono", fontWeight: 700, color: place === 1 ? OG.accent : OG.ink }}>#{place}</span>
              <span style={{ marginLeft: 10 }}>of {burners.length} on the board</span>
            </div>
          )}
        </div>

        {/* the number */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontFamily: "Sans", fontWeight: 600, fontSize: 210, lineHeight: 0.9, letterSpacing: -16 }}>
              {formatTokens(stats.totalTokens)}
            </div>
            <div style={{ display: "flex", fontSize: 26, color: OG.soft, marginTop: 18 }}>
              tokens burned with AI · {formatTokens(stats.weeklyTokens)} this week · {stats.streak}-day streak
            </div>
          </div>
          <div style={{ display: "flex", marginBottom: 12 }}>
            {weeks.map((days, w) => (
              <div key={w} style={{ display: "flex", flexDirection: "column", marginLeft: w === 0 ? 0 : 4 }}>
                {days.map((v, d) => (
                  <div
                    key={d}
                    style={{
                      display: "flex",
                      width: 13,
                      height: 13,
                      marginTop: d === 0 ? 0 : 4,
                      borderRadius: 2,
                      background:
                        v === peak && v > 0
                          ? OG.accent
                          : v > 0
                            ? `rgba(237,234,227,${(0.14 + 0.6 * Math.sqrt(v / peak)).toFixed(2)})`
                            : "rgba(237,234,227,0.06)",
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* who */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `1px solid ${OG.line}`,
            paddingTop: 26,
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            {stats.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={stats.image} width={48} height={48} alt="" style={{ borderRadius: 24 }} />
            ) : (
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  background: "rgba(237,234,227,0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "Mono",
                  fontSize: 18,
                  color: OG.soft,
                }}
              >
                {stats.avatar}
              </div>
            )}
            <div style={{ display: "flex", fontSize: 26, marginLeft: 16 }}>{stats.name}</div>
            <div style={{ display: "flex", fontSize: 24, color: OG.dim, marginLeft: 14 }}>
              @{stats.username} · {rank.name}
            </div>
          </div>
          <div style={{ display: "flex", fontFamily: "Mono", fontSize: 20, color: OG.dim }}>burnlog.net/u/{stats.username}</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts, headers: OG_HEADERS },
  );
}
