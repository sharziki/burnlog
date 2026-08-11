import { ImageResponse } from "next/og";
import { formatRemaining, formatScore, getChallenge } from "@/lib/challenges";
import { formatTokens } from "@/lib/format";
import { OG, OG_HEADERS, OG_SIZE, markDataUri } from "@/lib/og";

export const runtime = "nodejs";

const PLACE_COLOR = ["#D97706", "#A1A1AA", "#92400E"];

/** The card that makes a challenge invite link worth clicking. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const challenge = await getChallenge({ inviteCode: code });

  if (!challenge) {
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
          burnlog · challenge not found
        </div>
      ),
      { ...OG_SIZE, headers: OG_HEADERS },
    );
  }

  const ended = challenge.status === "ended";
  const top = challenge.standings.slice(0, 4);
  const pot = challenge.standings.reduce((s, r) => s + r.tokens, 0);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: OG.bg,
          padding: 60,
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={markDataUri(46)} width={46} height={46} alt="" />
            <div style={{ display: "flex", color: OG.white, fontSize: 30, fontWeight: 700, marginLeft: 14 }}>
              burnlog
            </div>
            {/* Glyphs are omitted on OG cards — the renderer's default font
                has no geometric shapes and renders them as tofu. */}
            <div style={{ display: "flex", color: OG.subtle, fontSize: 22, marginLeft: 18 }}>
              {challenge.typeLabel}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              color: ended ? OG.gray : "#10B981",
              fontSize: 21,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            {ended ? "settled" : formatRemaining(challenge.msRemaining)}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", color: OG.white, fontSize: 62, fontWeight: 700 }}>
            {challenge.name.slice(0, 34)}
          </div>
          <div style={{ display: "flex", color: OG.gray, fontSize: 24, marginTop: 10 }}>
            {challenge.standings.length} burning · {formatTokens(pot)} in the pot · hosted by @
            {challenge.hostUsername}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {top.map((s) => (
            <div
              key={s.userId}
              style={{
                display: "flex",
                alignItems: "center",
                borderTop: `1px solid ${OG.border}`,
                paddingTop: 14,
                paddingBottom: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: 44,
                  color: s.qualified && s.place <= 3 ? PLACE_COLOR[s.place - 1] : OG.subtle,
                  fontSize: 30,
                  fontWeight: 700,
                }}
              >
                {s.place}
              </div>
              {s.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.image}
                  width={46}
                  height={46}
                  alt=""
                  style={{ borderRadius: 23, border: `2px solid ${OG.border}` }}
                />
              ) : (
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 23,
                    background: OG.surface,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: OG.gray,
                    fontSize: 18,
                  }}
                >
                  {s.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div style={{ display: "flex", color: OG.light, fontSize: 30, marginLeft: 20 }}>
                @{s.username}
              </div>
              <div
                style={{
                  display: "flex",
                  marginLeft: "auto",
                  color: s.qualified ? OG.amberBright : OG.subtle,
                  fontSize: 30,
                  fontWeight: 700,
                }}
              >
                {s.qualified ? `${formatScore(challenge.type, s.score)} ${challenge.unit}` : "—"}
              </div>
            </div>
          ))}
          {top.length === 0 && (
            <div style={{ display: "flex", color: OG.subtle, fontSize: 28 }}>
              Nobody has joined yet. Be first.
            </div>
          )}
        </div>
      </div>
    ),
    { ...OG_SIZE, headers: OG_HEADERS },
  );
}
