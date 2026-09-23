"use client";

import { useState } from "react";
import { getRank } from "@/lib/ranks";
import { formatTokens } from "@/lib/format";
import type { UserStats } from "@/lib/stats";

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 100;
  const h = 26;
  const max = Math.max(...data, 1);
  if (data.every((v) => v === 0)) {
    return (
      <svg width={w} height={h}>
        <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="#27272A" strokeWidth={1.5} strokeDasharray="4 4" />
      </svg>
    );
  }
  const pts = data.map((v, i) => `${(i / Math.max(data.length - 1, 1)) * w},${h - 2 - (v / max) * (h - 4)}`);
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The board. Two views of one list: all-time and this week. */
export function Board({ users, me }: { users: UserStats[]; me: string | null }) {
  const [weekly, setWeekly] = useState(false);
  const value = (u: UserStats) => (weekly ? u.weeklyTokens : u.totalTokens);
  const rows = users.filter((u) => value(u) > 0).sort((a, b) => value(b) - value(a));

  return (
    <section id="board">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: "#71717A", textTransform: "uppercase" }}>
          Leaderboard
        </div>
        <div style={{ display: "flex", gap: 2, background: "#0C0C0E", border: "1px solid #18181B", borderRadius: 7, padding: 2 }}>
          {([false, true] as const).map((w) => (
            <button
              key={String(w)}
              type="button"
              onClick={() => setWeekly(w)}
              style={{
                padding: "6px 12px",
                borderRadius: 5,
                border: "none",
                cursor: "pointer",
                fontFamily: MONO,
                fontSize: 11,
                fontWeight: 600,
                background: weekly === w ? "#18181B" : "transparent",
                color: weekly === w ? "#F59E0B" : "#52525B",
              }}
            >
              {w ? "This week" : "All time"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ border: "1px solid #18181B", borderRadius: 12, overflow: "hidden", background: "#0B0B0D" }}>
        {rows.length === 0 && (
          <div style={{ padding: 32, textAlign: "center", fontFamily: MONO, fontSize: 12, color: "#52525B" }}>
            Nobody has burned anything {weekly ? "this week" : "yet"}.
          </div>
        )}
        {rows.map((u, i) => {
          const r = getRank(u.totalTokens);
          const mine = u.username === me;
          return (
            <a
              key={u.id}
              href={`/u/${u.username}`}
              className="leaderboard-grid board-row"
              style={{
                display: "grid",
                gridTemplateColumns: "44px minmax(0, 1fr) 110px 100px 140px",
                alignItems: "center",
                gap: 8,
                padding: "12px 16px",
                borderTop: i === 0 ? "none" : "1px solid #141416",
                background: mine ? "rgba(217,119,6,0.07)" : "transparent",
                boxShadow: mine ? "inset 2px 0 0 #D97706" : "none",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 15,
                  fontWeight: 700,
                  color: i === 0 ? "#F59E0B" : i === 1 ? "#E4E4E7" : i === 2 ? "#B45309" : "#3F3F46",
                }}
              >
                {i + 1}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                {u.image ? (
                  <img src={u.image} alt="" width={34} height={34} style={{ borderRadius: "50%", flexShrink: 0 }} />
                ) : (
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: `${r.color}22`,
                      color: r.color,
                      fontFamily: MONO,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {u.avatar}
                  </span>
                )}
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#FAFAFA", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {u.name}
                    {mine && <span style={{ fontFamily: MONO, fontSize: 10, color: "#D97706", marginLeft: 8 }}>you</span>}
                  </span>
                  <span style={{ display: "block", fontFamily: MONO, fontSize: 11, color: "#52525B" }}>
                    @{u.username}
                    {u.streak >= 7 && <span style={{ color: "#D97706" }}> · {u.streak}d streak</span>}
                  </span>
                </span>
              </span>
              <Sparkline data={u.weeklyHistory} color={r.color} />
              <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: "#FAFAFA", textAlign: "right" }}>
                {formatTokens(value(u))}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: r.color, whiteSpace: "nowrap", textAlign: "right" }}>
                {r.icon} {r.name}
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
