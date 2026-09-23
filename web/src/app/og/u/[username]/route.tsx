import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { getBoard, getUserStats } from "@/lib/stats";
import { getRank } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";
import { estimateCostUsd, formatUsd } from "@/lib/cost";
import { OG, OG_HEADERS, OG_SIZE, markDataUri, ogFonts } from "@/lib/og";

export const runtime = "nodejs";

/**
 * The card that unfurls when a profile link is pasted anywhere, and the image
 * behind "download card". It is the flex, so it leads with the two numbers
 * people post for: the total and the place on the board.
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
            color: OG.gray,
            fontFamily: "Sans",
            fontSize: 42,
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
          backgroundImage: `radial-gradient(800px 480px at 100% 0%, ${rank.color}2E 0%, rgba(9,9,11,0) 70%)`,
          padding: "56px 64px",
          fontFamily: "Sans",
        }}
      >
        {/* brand + place */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={markDataUri(44)} width={44} height={44} alt="" />
            <div style={{ display: "flex", color: OG.white, fontSize: 32, fontWeight: 700, marginLeft: 14 }}>
              burnlog
            </div>
          </div>
          {place > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                fontFamily: "Mono",
                padding: "10px 22px",
                borderRadius: 999,
                border: `2px solid ${OG.amber}`,
                background: "rgba(217,119,6,0.12)",
              }}
            >
              <div style={{ display: "flex", color: OG.amberBright, fontSize: 30, fontWeight: 700 }}>#{place}</div>
              <div style={{ display: "flex", color: OG.gray, fontSize: 22, marginLeft: 10 }}>
                of {burners.length} on the board
              </div>
            </div>
          )}
        </div>

        {/* identity + the number */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              {stats.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={stats.image}
                  width={76}
                  height={76}
                  alt=""
                  style={{ borderRadius: 38, border: `3px solid ${rank.color}` }}
                />
              ) : (
                <div
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 38,
                    border: `3px solid ${rank.color}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: rank.color,
                    fontSize: 28,
                    fontWeight: 700,
                  }}
                >
                  {stats.avatar}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", marginLeft: 20 }}>
                <div style={{ display: "flex", color: OG.white, fontSize: 38, fontWeight: 700, lineHeight: 1.1 }}>
                  {stats.name}
                </div>
                <div style={{ display: "flex", fontFamily: "Mono", fontSize: 22, marginTop: 4 }}>
                  <span style={{ color: OG.gray }}>@{stats.username}</span>
                  <span style={{ color: OG.subtle, margin: "0 12px" }}>·</span>
                  <span style={{ color: rank.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2 }}>
                    {rank.name}
                  </span>
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                fontSize: 188,
                fontWeight: 700,
                letterSpacing: -3,
                lineHeight: 1,
                marginTop: 26,
                backgroundImage: "linear-gradient(180deg, #FDE68A 0%, #F59E0B 55%, #C2410C 100%)",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {formatTokens(stats.totalTokens)}
            </div>
            <div style={{ display: "flex", fontFamily: "Mono", color: OG.light, fontSize: 24, letterSpacing: 4, marginTop: 6 }}>
              TOKENS BURNED WITH AI
            </div>
          </div>

          {/* 12 weeks, one column per week, oldest on the left */}
          <div style={{ display: "flex", marginBottom: 8 }}>
            {weeks.map((days, w) => (
              <div key={w} style={{ display: "flex", flexDirection: "column", marginLeft: w === 0 ? 0 : 5 }}>
                {days.map((v, d) => (
                  <div
                    key={d}
                    style={{
                      display: "flex",
                      width: 20,
                      height: 20,
                      marginTop: d === 0 ? 0 : 5,
                      borderRadius: 4,
                      background: v > 0 ? `rgba(245,158,11,${(0.2 + 0.8 * Math.sqrt(v / peak)).toFixed(2)})` : "#16161A",
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* the supporting numbers */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `1px solid ${OG.border}`,
            paddingTop: 22,
            fontFamily: "Mono",
            fontSize: 21,
          }}
        >
          <div style={{ display: "flex" }}>
            {[
              [formatTokens(stats.weeklyTokens), "this week"],
              [`${stats.streak}d`, "streak"],
              [`~${formatUsd(estimateCostUsd(stats.buckets))}`, "at API prices"],
            ].map(([value, label], i) => (
              <div key={label} style={{ display: "flex", marginLeft: i === 0 ? 0 : 28 }}>
                <span style={{ color: OG.white, fontWeight: 700 }}>{value}</span>
                <span style={{ color: OG.gray, marginLeft: 10 }}>{label}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", color: OG.gray }}>burnlog.net/u/{stats.username}</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts, headers: OG_HEADERS },
  );
}
