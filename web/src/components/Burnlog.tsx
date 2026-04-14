"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { buildDashboardSnapshot, getRankProgress } from "@/lib/dashboard";
import { formatTokens } from "@/lib/format";
import { getRank } from "@/lib/ranks";
import type { UserStats } from "@/lib/stats";

type TabId = "board" | "profiles" | "compare" | "trends" | "challenges" | "connect";

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: "board", label: "Board", hint: "Live benchmark" },
  { id: "profiles", label: "Profiles", hint: "Operator cards" },
  { id: "compare", label: "Compare", hint: "Side-by-side signal" },
  { id: "trends", label: "Trends", hint: "Movement over time" },
  { id: "challenges", label: "Challenges", hint: "Competitive loops" },
  { id: "connect", label: "Connect", hint: "Hook up sources" },
];

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatFullTokens(value: number): string {
  return value.toLocaleString();
}

function profileSummary(user: UserStats): string {
  const topModel = user.topModels[0]?.model ?? "no model data yet";
  return `${formatTokens(user.weeklyTokens)} this week · ${user.streak}d streak · top model ${topModel}`;
}

function compareValue(user: UserStats, field: "weeklyTokens" | "streak" | "tokensPerCommit"): string {
  if (field === "weeklyTokens") return formatTokens(user.weeklyTokens);
  if (field === "streak") return `${user.streak}d`;
  return formatTokens(user.tokensPerCommit);
}

function SourceChips({ user }: { user: UserStats }) {
  if (!user.sources.length) {
    return <div className="empty-state">No sources connected yet. Burnlog is ready once this builder runs the CLI and syncs local usage logs.</div>;
  }

  return (
    <div className="inline-row">
      {user.sources.map((source) => (
        <span className="source-pill" key={`${user.id}-${source.source}`}>
          {source.source}
          <strong style={{ color: "var(--text)" }}>{formatTokens(source.tokens)}</strong>
        </span>
      ))}
    </div>
  );
}

function WeeklySpark({ values }: { values: number[] }) {
  if (!values.length || values.every((value) => value === 0)) {
    return <div className="eyebrow">No weekly movement yet</div>;
  }

  const max = Math.max(...values);
  const height = 46;
  const width = 170;
  const step = width / Math.max(values.length - 1, 1);
  const points = values
    .map((value, index) => {
      const x = index * step;
      const y = height - (value / Math.max(max, 1)) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg aria-label="weekly sparkline" height={height} viewBox={`0 0 ${width} ${height}`} width={width}>
      <polyline
        fill="none"
        points={points}
        stroke="url(#burnGradient)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      <defs>
        <linearGradient id="burnGradient" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Heatmap({ values }: { values: number[] }) {
  const recent = values.slice(-28);
  const max = Math.max(...recent, 0);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
        gap: 6,
      }}
    >
      {recent.map((value, index) => {
        const strength = max > 0 ? value / max : 0;
        return (
          <div
            key={`${index}-${value}`}
            style={{
              aspectRatio: "1 / 1",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.05)",
              background: strength
                ? `rgba(245, 158, 11, ${0.12 + strength * 0.55})`
                : "rgba(255,255,255,0.04)",
            }}
            title={`${value.toLocaleString()} tokens`}
          />
        );
      })}
    </div>
  );
}

function BoardView({ users, currentUsername }: { users: UserStats[]; currentUsername: string | null }) {
  const snapshot = buildDashboardSnapshot(users, currentUsername);
  const currentUser = snapshot.currentUser;
  const heroUser = currentUser ?? snapshot.users[0] ?? null;
  const heroRank = heroUser ? getRank(heroUser.totalTokens) : null;
  const heroProgress = heroUser ? getRankProgress(heroUser.totalTokens) : null;

  return (
    <>
      <section className="hero-grid">
        <div className="panel hero-copy">
          <div className="eyebrow">AI-native builder benchmark</div>
          <h1 className="hero-title mono">Measure real coding-agent intensity, not just talk.</h1>
          <p className="hero-text">
            Burnlog turns local coding-agent usage into a private-by-default benchmark surface. Token burn is the hook.
            Consistency, tool mix, and operator profile are what make it useful.
          </p>
          <div className="inline-row hero-kicker">
            <span className="status-pill status-live">Private by default</span>
            <span className="status-pill status-warming">Share by choice</span>
            <span className="status-pill status-warming">Recruiting signal</span>
          </div>
        </div>

        <div className="panel hero-side">
          <div className="section-header" style={{ marginBottom: 12 }}>
            <div>
              <div className="eyebrow">Operator snapshot</div>
              <h2 className="section-title" style={{ marginTop: 8 }}>{heroUser ? `@${heroUser.username}` : "Waiting for first burner"}</h2>
            </div>
            {heroRank ? (
              <span className="rank-pill" style={{ borderColor: `${heroRank.color}44`, color: heroRank.color }}>
                {heroRank.icon} {heroRank.name}
              </span>
            ) : null}
          </div>

          {heroUser ? (
            <div className="stack">
              <div>
                <div className="metric-value">{formatTokens(heroUser.totalTokens)}</div>
                <div className="metric-note">total burn · {profileSummary(heroUser)}</div>
              </div>

              {heroProgress ? (
                <div className="stack" style={{ gap: 10 }}>
                  <div className="inline-row" style={{ justifyContent: "space-between" }}>
                    <span className="metric-label">rank progress</span>
                    <span className="eyebrow">{heroProgress.next ? `${heroProgress.current} → ${heroProgress.next}` : `${heroProgress.current} maxed`}</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${heroProgress.ratio * 100}%` }} />
                  </div>
                  <div className="metric-note">
                    {snapshot.nextRank && heroUser.id === currentUser?.id
                      ? `${formatTokens(snapshot.nextRank.gap)} until ${snapshot.nextRank.name}`
                      : "Track burn, streak, and source mix from one surface."}
                  </div>
                </div>
              ) : null}

              <SourceChips user={heroUser} />
            </div>
          ) : (
            <div className="empty-state">Run the CLI, sync your first logs, and this panel becomes your shareable operator snapshot.</div>
          )}
        </div>
      </section>

      <section className="metric-strip">
        <div className="metric-card">
          <div className="metric-label">Total burned</div>
          <div className="metric-value">{formatTokens(snapshot.metrics.totalBurned)}</div>
          <div className="metric-note">Across every connected builder in this board.</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Active burners</div>
          <div className="metric-value">{snapshot.metrics.activeBurners}</div>
          <div className="metric-note">Builders with non-zero burn in the last 7 days.</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Median weekly burn</div>
          <div className="metric-value">{formatTokens(snapshot.metrics.medianWeekly)}</div>
          <div className="metric-note">Useful sanity check against one giant outlier.</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Consistency leader</div>
          <div className="metric-value">{snapshot.metrics.streakLeader ? `${snapshot.metrics.streakLeader.streak}d` : "0d"}</div>
          <div className="metric-note">
            {snapshot.metrics.streakLeader ? `Currently @${snapshot.metrics.streakLeader.username}` : "Waiting for first streak."}
          </div>
        </div>
      </section>

      <section className="content-grid">
        <div className="stack">
          <div className="panel section-panel">
            <div className="section-header">
              <div>
                <div className="eyebrow">Leaderboard</div>
                <h2 className="section-title">Main board</h2>
                <p className="section-copy">Raw burn is visible, but the surrounding stats keep this from turning into a pure waste contest.</p>
              </div>
              {currentUser ? <div className="eyebrow">You rank #{snapshot.users.findIndex((user) => user.id === currentUser.id) + 1}</div> : null}
            </div>

            {snapshot.users.length ? (
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Builder</th>
                    <th>Total burn</th>
                    <th>7d burn</th>
                    <th>Streak</th>
                    <th>Tok / commit</th>
                    <th>Rank</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.users.map((user, index) => {
                    const rank = getRank(user.totalTokens);
                    const isCurrent = currentUser?.id === user.id;
                    return (
                      <tr className="leaderboard-row" key={user.id}>
                        <td className="mono" style={{ color: isCurrent ? "var(--accent)" : "var(--text-muted)" }}>
                          {index + 1}
                        </td>
                        <td>
                          <div className="user-cell">
                            <div className="avatar">{user.avatar}</div>
                            <div>
                              <div className="user-name">{user.name}{isCurrent ? " · you" : ""}</div>
                              <div className="user-handle">@{user.username}</div>
                            </div>
                          </div>
                        </td>
                        <td className="mono" style={{ color: "var(--text)" }}>{formatFullTokens(user.totalTokens)}</td>
                        <td className="mono">{formatTokens(user.weeklyTokens)}</td>
                        <td className="mono">{user.streak}d</td>
                        <td className="mono">{compareValue(user, "tokensPerCommit")}</td>
                        <td>
                          <span className="rank-pill" style={{ borderColor: `${rank.color}33`, color: rank.color }}>
                            {rank.icon} {rank.name}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="empty-state">No builders are on the board yet. Connect a source from the Connect tab and sync your first logs.</div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="panel section-panel">
            <div className="eyebrow">Current profile</div>
            <h2 className="section-title" style={{ marginTop: 8 }}>{currentUser ? currentUser.name : "Sign in to claim your profile"}</h2>
            <p className="section-copy">
              {currentUser
                ? `You're sitting in the ${snapshot.percentile}th percentile with ${formatTokens(currentUser.totalTokens)} burned so far.`
                : "Settings lets you mint an API key, connect the CLI, and turn this board into a real profile rather than anonymous leaderboard rows."}
            </p>
            {currentUser ? (
              <div className="stack" style={{ gap: 10, marginTop: 18 }}>
                <div className="stat-line"><span>Weekly burn</span><strong className="mono" style={{ color: "var(--text)" }}>{formatTokens(currentUser.weeklyTokens)}</strong></div>
                <div className="stat-line"><span>Streak</span><strong className="mono" style={{ color: "var(--text)" }}>{currentUser.streak}d</strong></div>
                <div className="stat-line"><span>Connected sources</span><strong className="mono" style={{ color: "var(--text)" }}>{currentUser.sources.length}</strong></div>
                <div className="stat-line"><span>Top model</span><strong className="mono" style={{ color: "var(--text)" }}>{currentUser.topModels[0]?.model ?? "—"}</strong></div>
              </div>
            ) : (
              <div className="inline-row" style={{ marginTop: 18 }}>
                <Link className="button-primary" href="/settings">Open settings</Link>
              </div>
            )}
          </div>

          <div className="panel section-panel">
            <div className="eyebrow">Provider mix</div>
            <h2 className="section-title" style={{ marginTop: 8 }}>Where the burn lives</h2>
            <p className="section-copy">This makes the board feel like instrumentation, not just a flex table.</p>
            <div className="provider-bars" style={{ marginTop: 18 }}>
              {snapshot.providerMix.map((entry) => (
                <div className="provider-row" key={entry.label}>
                  <span>{entry.label}</span>
                  <div className="provider-track">
                    <div className="provider-bar" style={{ width: `${entry.value * 100}%` }} />
                  </div>
                  <span className="mono">{formatPercent(entry.value)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel section-panel">
            <div className="eyebrow">Challenges preview</div>
            <h2 className="section-title" style={{ marginTop: 8 }}>What matters this week</h2>
            <div className="stack" style={{ marginTop: 18, gap: 12 }}>
              {snapshot.challenges.slice(0, 2).map((challenge) => (
                <div className="panel-muted card-pad" key={challenge.id}>
                  <div className="inline-row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
                    <strong>{challenge.name}</strong>
                    <span className={`status-pill ${challenge.status === "live" ? "status-live" : "status-warming"}`}>
                      {challenge.status === "live" ? "live" : "warming up"}
                    </span>
                  </div>
                  <div className="metric-note">{challenge.summary}</div>
                  {challenge.leader ? (
                    <div className="stat-line" style={{ marginTop: 8 }}>
                      <span>Leader</span>
                      <strong className="mono" style={{ color: "var(--text)" }}>@{challenge.leader.username} · {challenge.leader.value}</strong>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function ProfilesView({ users, currentUsername }: { users: UserStats[]; currentUsername: string | null }) {
  const snapshot = buildDashboardSnapshot(users, currentUsername);
  return (
    <div className="panel section-panel">
      <div className="section-header">
        <div>
          <div className="eyebrow">Profiles</div>
          <h2 className="section-title">Operator cards</h2>
          <p className="section-copy">Each profile should feel credible enough to share with a teammate or recruiter, not like a game profile.</p>
        </div>
        <div className="eyebrow">{snapshot.totalUsers} builders indexed</div>
      </div>

      {snapshot.users.length ? (
        <div className="profile-grid">
          {snapshot.users.map((user) => {
            const rank = getRank(user.totalTokens);
            const progress = getRankProgress(user.totalTokens);
            return (
              <div className="panel-muted card-pad" key={user.id}>
                <div className="profile-card-top">
                  <div className="user-cell">
                    <div className="avatar">{user.avatar}</div>
                    <div>
                      <div className="user-name">{user.name}{user.username === currentUsername ? " · you" : ""}</div>
                      <div className="user-handle">@{user.username}</div>
                    </div>
                  </div>
                  <span className="rank-pill" style={{ borderColor: `${rank.color}33`, color: rank.color }}>
                    {rank.icon} {rank.name}
                  </span>
                </div>

                <p className="section-copy" style={{ marginTop: 0 }}>{user.bio ?? "No bio set yet. Burnlog still captures the work profile through burn, consistency, and tool mix."}</p>
                <div style={{ margin: "14px 0" }}>
                  <WeeklySpark values={user.weeklyHistory} />
                </div>
                <div className="stack" style={{ gap: 0 }}>
                  <div className="stat-line"><span>Total burn</span><strong className="mono" style={{ color: "var(--text)" }}>{formatFullTokens(user.totalTokens)}</strong></div>
                  <div className="stat-line"><span>7d burn</span><strong className="mono" style={{ color: "var(--text)" }}>{formatTokens(user.weeklyTokens)}</strong></div>
                  <div className="stat-line"><span>Streak</span><strong className="mono" style={{ color: "var(--text)" }}>{user.streak}d</strong></div>
                  <div className="stat-line"><span>Tok / commit</span><strong className="mono" style={{ color: "var(--text)" }}>{formatTokens(user.tokensPerCommit)}</strong></div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <div className="inline-row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                    <span className="metric-label">rank path</span>
                    <span className="eyebrow">{progress.next ? `${progress.current} → ${progress.next}` : `${progress.current} maxed`}</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${progress.ratio * 100}%` }} />
                  </div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <SourceChips user={user} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">No profiles yet. Connect a source and run your first sync to make the first operator card appear.</div>
      )}
    </div>
  );
}

function CompareView({ users, currentUsername }: { users: UserStats[]; currentUsername: string | null }) {
  const snapshot = buildDashboardSnapshot(users, currentUsername);
  const left = snapshot.currentUser ?? snapshot.users[0] ?? null;
  const right = snapshot.users.find((user) => user.id !== left?.id) ?? null;

  if (!left) {
    return <div className="empty-state">No builders available yet. Sync at least one profile before comparing operator signal.</div>;
  }

  const cards = [
    { label: "Total burn", left: formatFullTokens(left.totalTokens), right: right ? formatFullTokens(right.totalTokens) : "Need another builder" },
    { label: "7d burn", left: formatTokens(left.weeklyTokens), right: right ? formatTokens(right.weeklyTokens) : "Need another builder" },
    { label: "Streak", left: `${left.streak}d`, right: right ? `${right.streak}d` : "Need another builder" },
    { label: "Tok / commit", left: formatTokens(left.tokensPerCommit), right: right ? formatTokens(right.tokensPerCommit) : "Need another builder" },
  ];

  return (
    <div className="stack">
      <div className="panel section-panel">
        <div className="section-header">
          <div>
            <div className="eyebrow">Compare</div>
            <h2 className="section-title">Two operators, one benchmark frame</h2>
            <p className="section-copy">This is the recruiting-friendly view: same categories, same framing, no fake productivity theatre.</p>
          </div>
        </div>

        <div className="profile-grid">
          {[left, right].map((user, idx) => (
            <div className="panel-muted card-pad" key={user?.id ?? `empty-${idx}`}>
              {user ? (
                <>
                  <div className="profile-card-top">
                    <div className="user-cell">
                      <div className="avatar">{user.avatar}</div>
                      <div>
                        <div className="user-name">{user.name}{user.username === currentUsername ? " · you" : ""}</div>
                        <div className="user-handle">@{user.username}</div>
                      </div>
                    </div>
                    <span className="rank-pill" style={{ borderColor: `${getRank(user.totalTokens).color}33`, color: getRank(user.totalTokens).color }}>
                      {getRank(user.totalTokens).icon} {getRank(user.totalTokens).name}
                    </span>
                  </div>
                  <WeeklySpark values={user.weeklyHistory} />
                  <div className="stack" style={{ gap: 0, marginTop: 14 }}>
                    <div className="stat-line"><span>Top model</span><strong className="mono" style={{ color: "var(--text)" }}>{user.topModels[0]?.model ?? "—"}</strong></div>
                    <div className="stat-line"><span>Connected sources</span><strong className="mono" style={{ color: "var(--text)" }}>{user.sources.length}</strong></div>
                    <div className="stat-line"><span>Profile note</span><strong className="mono" style={{ color: "var(--text)" }}>{user.bio ?? "No bio"}</strong></div>
                  </div>
                </>
              ) : (
                <div className="empty-state">Need a second connected builder before Burnlog can do a real side-by-side compare.</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="panel section-panel">
        <div className="section-header">
          <div>
            <div className="eyebrow">Signal breakdown</div>
            <h2 className="section-title">Same metrics, cleaner story</h2>
          </div>
        </div>
        <div className="info-grid">
          {cards.map((card) => (
            <div className="panel-muted card-pad" key={card.label}>
              <div className="metric-label">{card.label}</div>
              <div className="stat-line" style={{ marginTop: 10 }}><span>{left.username}</span><strong className="mono" style={{ color: "var(--text)" }}>{card.left}</strong></div>
              <div className="stat-line"><span>{right?.username ?? "slot 2"}</span><strong className="mono" style={{ color: "var(--text)" }}>{card.right}</strong></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TrendsView({ users, currentUsername }: { users: UserStats[]; currentUsername: string | null }) {
  const snapshot = buildDashboardSnapshot(users, currentUsername);
  const focus = snapshot.currentUser ?? snapshot.users[0] ?? null;

  return (
    <div className="stack">
      <div className="panel section-panel">
        <div className="section-header">
          <div>
            <div className="eyebrow">Trends</div>
            <h2 className="section-title">Movement, not just rank</h2>
            <p className="section-copy">Trend surfaces keep Burnlog from becoming a static all-time table. They answer whether someone is accelerating, consistent, or fading.</p>
          </div>
        </div>

        {focus ? (
          <div className="content-grid">
            <div className="panel-muted card-pad">
              <div className="metric-label">28-day activity heatmap</div>
              <div style={{ marginTop: 16 }}>
                <Heatmap values={focus.heatmap} />
              </div>
              <p className="section-copy" style={{ marginBottom: 0, marginTop: 14 }}>
                Recent cadence for @{focus.username}. This makes consistency visually obvious even before you read the numbers.
              </p>
            </div>

            <div className="stack">
              <div className="panel-muted card-pad">
                <div className="metric-label">Weekly movement</div>
                <div style={{ marginTop: 14 }}>
                  <WeeklySpark values={focus.weeklyHistory} />
                </div>
                <div className="stat-line" style={{ marginTop: 12 }}><span>Current 7d burn</span><strong className="mono" style={{ color: "var(--text)" }}>{formatTokens(focus.weeklyTokens)}</strong></div>
                <div className="stat-line"><span>Lifetime burn</span><strong className="mono" style={{ color: "var(--text)" }}>{formatFullTokens(focus.totalTokens)}</strong></div>
              </div>

              <div className="panel-muted card-pad">
                <div className="metric-label">Model concentration</div>
                <div className="stack" style={{ gap: 0, marginTop: 10 }}>
                  {focus.topModels.slice(0, 4).map((model) => (
                    <div className="stat-line" key={model.model}><span>{model.model}</span><strong className="mono" style={{ color: "var(--text)" }}>{formatTokens(model.tokens)}</strong></div>
                  ))}
                  {!focus.topModels.length ? <div className="empty-state">No model data yet.</div> : null}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="empty-state">No trend data yet. Sync one profile and Burnlog can start showing movement over time.</div>
        )}
      </div>

      <div className="panel section-panel">
        <div className="section-header">
          <div>
            <div className="eyebrow">Board narrative</div>
            <h2 className="section-title">What the board is doing right now</h2>
          </div>
        </div>
        <div className="info-grid">
          <div className="panel-muted card-pad">
            <strong>Top weekly burner</strong>
            <p className="section-copy">{snapshot.metrics.topWeeklyBurner ? `@${snapshot.metrics.topWeeklyBurner.username} is pacing the board with ${formatTokens(snapshot.metrics.topWeeklyBurner.weeklyTokens)} in the last 7 days.` : "No weekly movement yet."}</p>
          </div>
          <div className="panel-muted card-pad">
            <strong>Median weekly burn</strong>
            <p className="section-copy">Median matters because it keeps one giant user from becoming the only story on the product.</p>
            <div className="metric-value" style={{ fontSize: "2rem" }}>{formatTokens(snapshot.metrics.medianWeekly)}</div>
          </div>
          <div className="panel-muted card-pad">
            <strong>Active burners</strong>
            <p className="section-copy">Shows whether the network is actually alive right now or just carrying stale historical stats.</p>
            <div className="metric-value" style={{ fontSize: "2rem" }}>{snapshot.metrics.activeBurners}</div>
          </div>
          <div className="panel-muted card-pad">
            <strong>Consistency leader</strong>
            <p className="section-copy">{snapshot.metrics.streakLeader ? `@${snapshot.metrics.streakLeader.username} currently owns the streak narrative at ${snapshot.metrics.streakLeader.streak} days.` : "No streak leader yet."}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChallengesView({ users, currentUsername }: { users: UserStats[]; currentUsername: string | null }) {
  const snapshot = buildDashboardSnapshot(users, currentUsername);
  return (
    <div className="stack">
      <div className="panel section-panel">
        <div className="section-header">
          <div>
            <div className="eyebrow">Challenges</div>
            <h2 className="section-title">Competitive loops with real telemetry</h2>
            <p className="section-copy">These stay grounded in actual board data. If the board is sparse, challenges stay honest instead of faking momentum.</p>
          </div>
        </div>
        <div className="challenge-grid">
          {snapshot.challenges.map((challenge) => (
            <div className="panel-muted card-pad" key={challenge.id}>
              <div className="inline-row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
                <strong>{challenge.name}</strong>
                <span className={`status-pill ${challenge.status === "live" ? "status-live" : "status-warming"}`}>
                  {challenge.status === "live" ? "live" : "warming up"}
                </span>
              </div>
              <p className="section-copy" style={{ marginTop: 0 }}>{challenge.summary}</p>
              <div className="stack" style={{ gap: 0, marginTop: 10 }}>
                <div className="stat-line"><span>Metric</span><strong className="mono" style={{ color: "var(--text)" }}>{challenge.metricLabel}</strong></div>
                <div className="stat-line"><span>Leader</span><strong className="mono" style={{ color: "var(--text)" }}>{challenge.leader ? `@${challenge.leader.username} · ${challenge.leader.value}` : "waiting"}</strong></div>
                <div className="stat-line"><span>Runner-up</span><strong className="mono" style={{ color: "var(--text)" }}>{challenge.runnerUp ? `@${challenge.runnerUp.username} · ${challenge.runnerUp.value}` : "need 2+ burners"}</strong></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel section-panel">
        <div className="section-header">
          <div>
            <div className="eyebrow">Why this matters</div>
            <h2 className="section-title">Challenges that help the product thesis</h2>
          </div>
        </div>
        <div className="info-grid">
          <div className="panel-muted card-pad">
            <strong>Weekly burn race</strong>
            <p className="section-copy">Keeps the board alive with a current-time story rather than one immortal all-time winner.</p>
          </div>
          <div className="panel-muted card-pad">
            <strong>Streak builder</strong>
            <p className="section-copy">Adds discipline and consistency as a first-class signal. Recruiters care more about sustained behavior than one spike.</p>
          </div>
          <div className="panel-muted card-pad">
            <strong>Multi-tool operator</strong>
            <p className="section-copy">Rewards breadth across supported coding-agent surfaces, which is closer to real-world AI-native work.</p>
          </div>
          <div className="panel-muted card-pad">
            <strong>Shareable without clown energy</strong>
            <p className="section-copy">The challenge layer stays serious enough to live inside a benchmark product rather than turning into a parody dashboard.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnectView({ users, currentUsername }: { users: UserStats[]; currentUsername: string | null }) {
  const snapshot = buildDashboardSnapshot(users, currentUsername);
  const [copied, setCopied] = useState<string | null>(null);
  const commands = [
    { id: "install", label: "Install the CLI", command: "cd cli && npm install && npm link" },
    { id: "key", label: "Save your API key", command: "burnlog login <api-key>" },
    { id: "sync", label: "Upload local usage", command: "burnlog sync" },
  ];

  async function copyCommand(command: string, id: string) {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1400);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="stack">
      <div className="panel section-panel">
        <div className="section-header">
          <div>
            <div className="eyebrow">Connect</div>
            <h2 className="section-title">Easy path from local logs to live profile</h2>
            <p className="section-copy">Burnlog never needs your repo contents. It only ingests tokens, model, source, and timestamp from local coding-agent session logs.</p>
          </div>
          <Link className="button-primary" href="/settings">Open settings</Link>
        </div>

        <div className="stack">
          {commands.map((item) => (
            <div className="command-block" key={item.id}>
              <div>
                <div className="metric-label">{item.label}</div>
                <div className="command-text" style={{ marginTop: 8 }}>{item.command}</div>
              </div>
              <button className="button-secondary" onClick={() => copyCommand(item.command, item.id)} type="button">
                {copied === item.id ? "Copied" : "Copy"}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="panel section-panel">
        <div className="section-header">
          <div>
            <div className="eyebrow">Supported sources</div>
            <h2 className="section-title">Coding-agent connectors</h2>
            <p className="section-copy">These are the current adapters the CLI understands today. The board marks them connected once your profile has synced usage from that source.</p>
          </div>
        </div>

        <div className="connector-grid">
          {snapshot.connectors.map((connector) => (
            <div className="panel-muted card-pad" key={connector.id}>
              <div className="inline-row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
                <strong>{connector.label}</strong>
                <span className={`status-pill ${connector.connected ? "status-live" : "status-warming"}`}>
                  {connector.connected ? "connected" : "ready"}
                </span>
              </div>
              <div className="stack" style={{ gap: 0 }}>
                <div className="stat-line"><span>Provider</span><strong className="mono" style={{ color: "var(--text)" }}>{connector.provider}</strong></div>
                <div className="stat-line"><span>Local log path</span><strong className="mono" style={{ color: "var(--text)" }}>{connector.logPath}</strong></div>
                <div className="stat-line"><span>Command</span><strong className="mono" style={{ color: "var(--text)" }}>{connector.command}</strong></div>
              </div>
              <p className="section-copy" style={{ marginBottom: 0, marginTop: 12 }}>{connector.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="panel section-panel">
        <div className="section-header">
          <div>
            <div className="eyebrow">Privacy</div>
            <h2 className="section-title">What Burnlog stores</h2>
          </div>
        </div>
        <div className="info-grid">
          <div className="panel-muted card-pad">
            <strong>Stored</strong>
            <p className="section-copy">Token counts, source, model, provider, timestamp, and opaque dedupe IDs.</p>
          </div>
          <div className="panel-muted card-pad">
            <strong>Never stored</strong>
            <p className="section-copy">Project names, prompt contents, filenames, cwd, or repo contents.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Burnlog({ users, currentUsername }: { users: UserStats[]; currentUsername: string | null }) {
  const [tab, setTab] = useState<TabId>("board");
  const snapshot = useMemo(() => buildDashboardSnapshot(users, currentUsername), [users, currentUsername]);

  return (
    <div className="page-shell">
      <div className="page-container">
        <div className="topbar">
          <div className="brand-lockup">
            <div className="brand-mark">BL</div>
            <div>
              <div className="brand-title">Burnlog</div>
              <div className="brand-subtitle">Benchmark surface for AI-native builders</div>
            </div>
          </div>

          <div className="inline-row" style={{ justifyContent: "flex-end" }}>
            <div className="tab-row">
              {TABS.map((item) => (
                <button className={`tab-chip ${tab === item.id ? "active" : ""}`} key={item.id} onClick={() => setTab(item.id)} type="button">
                  {item.label}
                </button>
              ))}
            </div>
            <Link className="action-chip" href="/settings">Settings</Link>
          </div>
        </div>

        <div className="inline-row" style={{ justifyContent: "space-between", marginBottom: 20 }}>
          <div className="eyebrow">{TABS.find((item) => item.id === tab)?.hint}</div>
          <div className="inline-row">
            <span className="status-pill status-live">{snapshot.totalUsers} builders indexed</span>
            {snapshot.metrics.topWeeklyBurner ? (
              <span className="status-pill status-warming">weekly leader @${snapshot.metrics.topWeeklyBurner.username}</span>
            ) : null}
          </div>
        </div>

        {tab === "board" ? <BoardView currentUsername={currentUsername} users={users} /> : null}
        {tab === "profiles" ? <ProfilesView currentUsername={currentUsername} users={users} /> : null}
        {tab === "compare" ? <CompareView currentUsername={currentUsername} users={users} /> : null}
        {tab === "trends" ? <TrendsView currentUsername={currentUsername} users={users} /> : null}
        {tab === "challenges" ? <ChallengesView currentUsername={currentUsername} users={users} /> : null}
        {tab === "connect" ? <ConnectView currentUsername={currentUsername} users={users} /> : null}
      </div>
    </div>
  );
}
