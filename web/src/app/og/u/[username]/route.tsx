import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { getUserStats } from "@/lib/stats";
import { getRank } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";
import { OG, OG_HEADERS, OG_SIZE, markDataUri } from "@/lib/og";

export const runtime = "nodejs";

/** The card that shows up when a profile link is pasted anywhere. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const user = await prisma.user.findFirst({
    where: { username },
    select: { id: true, name: true, image: true },
  });
  const stats = user ? await getUserStats(user.id) : null;

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
            fontSize: 42,
          }}
        >
          burnlog · no such burner
        </div>
      ),
      { ...OG_SIZE, headers: OG_HEADERS },
    );
  }

  const rank = getRank(stats.totalTokens);
  const peak = Math.max(...stats.weeklyHistory, 1);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: OG.bg,
          padding: 64,
          justifyContent: "space-between",
        }}
      >
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={markDataUri(52)} width={52} height={52} alt="" />
            <div style={{ display: "flex", color: OG.white, fontSize: 34, fontWeight: 700, marginLeft: 16 }}>
              burnlog
            </div>
          </div>
          {/* No rank glyph here: the OG renderer's default font has no
              geometric shapes, and a tofu box is worse than no icon. */}
          <div
            style={{
              display: "flex",
              color: OG.amber,
              fontSize: 20,
              letterSpacing: 3,
              textTransform: "uppercase",
            }}
          >
            {rank.name}
          </div>
        </div>

        {/* identity */}
        <div style={{ display: "flex", alignItems: "center" }}>
          {stats.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={stats.image}
              width={132}
              height={132}
              alt=""
              style={{ borderRadius: 66, border: `3px solid ${OG.border}` }}
            />
          ) : (
            <div
              style={{
                width: 132,
                height: 132,
                borderRadius: 66,
                background: OG.surface,
                border: `3px solid ${OG.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: OG.gray,
                fontSize: 46,
              }}
            >
              {stats.avatar}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 32 }}>
            <div style={{ display: "flex", color: OG.white, fontSize: 62, fontWeight: 700 }}>
              {stats.name}
            </div>
            <div style={{ display: "flex", color: OG.gray, fontSize: 28, marginTop: 6 }}>
              @{stats.username}
            </div>
          </div>
        </div>

        {/* stats + 7-day bars */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex" }}>
            {[
              ["TOTAL BURNED", formatTokens(stats.totalTokens)],
              ["THIS WEEK", formatTokens(stats.weeklyTokens)],
              ["STREAK", `${stats.streak}d`],
            ].map(([label, value], i) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  marginLeft: i === 0 ? 0 : 64,
                }}
              >
                <div style={{ display: "flex", color: OG.subtle, fontSize: 17, letterSpacing: 2 }}>
                  {label}
                </div>
                <div
                  style={{
                    display: "flex",
                    color: i === 0 ? OG.amberBright : OG.white,
                    fontSize: 54,
                    fontWeight: 700,
                    marginTop: 8,
                  }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", height: 108 }}>
            {stats.weeklyHistory.map((v, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  width: 26,
                  marginLeft: i === 0 ? 0 : 10,
                  height: Math.max(6, (v / peak) * 108),
                  background: i === 6 ? OG.amberBright : OG.amber,
                  opacity: i === 6 ? 1 : 0.45,
                  borderRadius: 4,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, headers: OG_HEADERS },
  );
}
