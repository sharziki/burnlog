"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { buildDashboardSnapshot, getRankProgress } from "@/lib/dashboard";
import { formatTokens } from "@/lib/format";
import { getRank } from "@/lib/ranks";
import type { UserStats } from "@/lib/stats";

type TabId = "board" | "profiles" | "compare" | "trends" | "challenges" | "connect";

type TabDefinition = { id: TabId; label: string; hint: string };

const ALL_TABS: TabDefinition[] = [
  { id: "board", label: "Board", hint: "Live standings" },
  { id: "profiles", label: "Profiles", hint: "Operator cards" },
  { id: "compare", label: "Compare", hint: "Head-to-head" },
  { id: "trends", label: "Trends", hint: "Activity shape" },
  { id: "challenges", label: "Challenges", hint: "Contest rails" },
  { id: "connect", label: "Connect", hint: "Ingest setup" },
];

function formatFullTokens(value: number): string {
  return value.toLocaleString();
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function Heatmap({ values }: { values: number[] }) {
  const recent = values.slice(-28);
  const max = Math.max(...recent, 0);
  return (
    <div className="heatmap-grid">
      {recent.map((value, index) => {
        const strength = max > 0 ? value / max : 0;
        return (
          <div
            key={`${index}-${value}`}
            className="heat-cell"
            style={{ background: strength ? `rgba(245, 158, 11, ${0.12 + strength * 0.58})` : "rgba(255,255,255,0.04)" }}
            title={`${value.toLocaleString()} tokens`}
          />
        );
      })}
    </div>
  );
}

function WeeklySpark({ values }: { values: number[] }) {
  if (!values.length || values.every((value) => value === 0)) {
    return <div className="tiny-copy">No activity yet</div>;
  }

  const max = Math.max(...values);
  const height = 38;
  const width = 152;
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
      <polyline fill="none" points={points} stroke="#f59e0b" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
    </svg>
  );
}

function SourceBadges({ user }: { user: UserStats }) {
  if (!user.sources.length) return <span className="tiny-copy">0 sources</span>;
  return (
    <div className="inline-row compact-row">
      {user.sources.slice(0, 3).map((source) => (
        <span className="data-chip" key={`${user.id}-${source.source}`}>
          {source.source}
        </span>
      ))}
    </div>
  );
}

function Header({
  tabs,
  tab,
  setTab,
  totalUsers,
  weeklyLeader,
}: {
  tabs: TabDefinition[];
  tab: TabId;
  setTab: (tab: TabId) => void;
  totalUsers: number;
  weeklyLeader: string | null;
}) {
  return (
    <header className="comp-shell-header">
      <div className="comp-brand-row">
        <Link className="comp-brand-row landing-brand-inline" href="/">
          <div className="brand-mark minimal-mark">BL</div>
          <div>
            <div className="brand-title mono-title">burnlog</div>
            <div className="brand-subtitle">live operator board</div>
          </div>
        </Link>
      </div>

      <div className="header-right">
        <div className="header-stats mono">
          <span>{totalUsers} tracked</span>
          <span>{weeklyLeader ? `weekly lead @${weeklyLeader}` : "awaiting live traffic"}</span>
        </div>
        <nav className="tab-row comp-tabs">
          {tabs.map((item) => (
            <button className={`tab-chip ${tab === item.id ? "active" : ""}`} key={item.id} onClick={() => setTab(item.id)} type="button">
              {item.label}
            </button>
          ))}
          <Link className="action-chip" href="/settings">Settings</Link>
        </nav>
      </div>
    </header>
  );
}

function BoardView({ users, currentUsername }: { users: UserStats[]; currentUsername: string | null }) {
  const snapshot = buildDashboardSnapshot(users, currentUsername);
  const currentUser = snapshot.currentUser ?? snapshot.users[0] ?? null;
  const currentRank = currentUser ? getRank(currentUser.totalTokens) : null;
  const currentProgress = currentUser ? getRankProgress(currentUser.totalTokens) : null;

  return (
    <div className="comp-layout">
      <section className="panel section-panel standings-panel">
        <div className="section-head minimal-head">
          <div>
            <div className="eyebrow">Standings</div>
            <h1 className="section-title compact-title">Global leaderboard</h1>
          </div>
          <div className="mono tiny-copy">real ingest only · no placeholder operators</div>
        </div>

        {snapshot.users.length ? (
          <table className="leaderboard-table comp-table">
            <thead>
              <tr>
                <th>rk</th>
                <th>user</th>
                <th>rating</th>
                <th>7d</th>
                <th>streak</th>
                <th>tok/event</th>
                <th>trend</th>
                <th>tier</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.users.map((user, index) => {
                const rank = getRank(user.totalTokens);
                const isCurrent = currentUser?.id === user.id;
                return (
                  <tr className={`leaderboard-row ${isCurrent ? "leaderboard-current" : ""}`} key={user.id}>
                    <td className="mono emphasis-cell">{index + 1}</td>
                    <td>
                      <div className="user-line">
                        <div className="avatar compact-avatar">{user.avatar}</div>
                        <div>
                          <div className="user-name">{user.username}{user.username === currentUsername ? " *" : ""}</div>
                          <div className="tiny-copy">{user.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="mono strong-cell">{formatFullTokens(user.totalTokens)}</td>
                    <td className="mono">{formatTokens(user.weeklyTokens)}</td>
                    <td className="mono">{user.streak}d</td>
                    <td className="mono">{formatTokens(user.tokensPerCommit)}</td>
                    <td><WeeklySpark values={user.weeklyHistory} /></td>
                    <td>
                      <span className="rank-pill compact-pill" style={{ borderColor: `${rank.color}33`, color: rank.color }}>
                        {rank.icon} {rank.name}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            No operators have synced yet. Generate an API key in settings, run burnlog sync from the machine with your local agent
            logs, and the board will populate from real events.
          </div>
        )}
      </section>

      <aside className="right-rail">
        <div className="panel section-panel rail-card">
          <div className="eyebrow">Focus operator</div>
          <div className="rail-primary mono">{currentUser ? formatTokens(currentUser.totalTokens) : "0"}</div>
          <div className="tiny-copy">{currentUser ? `@${currentUser.username}` : "connect your profile to claim the first slot"}</div>
          {currentRank ? (
            <div className="inline-row compact-row" style={{ marginTop: 10 }}>
              <span className="rank-pill compact-pill" style={{ borderColor: `${currentRank.color}33`, color: currentRank.color }}>
                {currentRank.icon} {currentRank.name}
              </span>
              <span className="tiny-copy">{snapshot.percentile ? `${snapshot.percentile}th percentile` : ""}</span>
            </div>
          ) : null}
          {currentProgress ? (
            <>
              <div className="progress-bar slim-progress" style={{ marginTop: 14 }}>
                <div className="progress-fill" style={{ width: `${currentProgress.ratio * 100}%` }} />
              </div>
              <div className="tiny-copy" style={{ marginTop: 8 }}>
                {snapshot.nextRank ? `${formatTokens(snapshot.nextRank.gap)} to ${snapshot.nextRank.name}` : "top tier reached"}
              </div>
            </>
          ) : null}
        </div>

        <div className="panel section-panel rail-card">
          <div className="eyebrow">Board state</div>
          <div className="stack compact-stack" style={{ marginTop: 10 }}>
            <div className="stat-line compact-line"><span>tracked operators</span><strong className="mono strong-cell">{snapshot.totalUsers}</strong></div>
            <div className="stat-line compact-line"><span>weekly leader</span><strong className="mono strong-cell">{snapshot.metrics.topWeeklyBurner ? `@${snapshot.metrics.topWeeklyBurner.username}` : "—"}</strong></div>
            <div className="stat-line compact-line"><span>median 7d</span><strong className="mono strong-cell">{formatTokens(snapshot.metrics.medianWeekly)}</strong></div>
            <div className="stat-line compact-line"><span>streak lead</span><strong className="mono strong-cell">{snapshot.metrics.streakLeader ? `${snapshot.metrics.streakLeader.streak}d` : "0d"}</strong></div>
          </div>
        </div>

        <div className="panel section-panel rail-card">
          <div className="eyebrow">Contest readiness</div>
          {snapshot.totalUsers > 1 ? (
            <div className="stack compact-stack" style={{ marginTop: 10 }}>
              {snapshot.challenges.slice(0, 3).map((challenge) => (
                <div className="contest-card" key={challenge.id}>
                  <div className="contest-top">
                    <strong>{challenge.name}</strong>
                    <span className={`status-pill compact-pill ${challenge.status === "live" ? "status-live" : "status-warming"}`}>{challenge.status === "live" ? "live" : "soon"}</span>
                  </div>
                  <div className="tiny-copy">{challenge.summary}</div>
                  <div className="tiny-copy mono" style={{ marginTop: 8 }}>
                    {challenge.leader ? `leader @${challenge.leader.username} · ${challenge.leader.value}` : "waiting for entries"}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ marginTop: 10 }}>
              Challenges unlock once at least two real operators are on the board. Burnlog will not fake a contest bracket just to make
              the UI look busy.
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function ProfilesView({ users, currentUsername }: { users: UserStats[]; currentUsername: string | null }) {
  const snapshot = buildDashboardSnapshot(users, currentUsername);
  return (
    <section className="panel section-panel">
      <div className="section-head minimal-head">
        <div>
          <div className="eyebrow">Profiles</div>
          <h2 className="section-title compact-title">Tracked operators</h2>
        </div>
      </div>
      {snapshot.users.length ? (
        <div className="profile-grid compact-grid">
          {snapshot.users.map((user) => {
            const rank = getRank(user.totalTokens);
            return (
              <div className="panel-muted card-pad compact-card" key={user.id}>
                <div className="profile-card-top compact-top">
                  <div className="user-line">
                    <div className="avatar compact-avatar">{user.avatar}</div>
                    <div>
                      <div className="user-name">{user.username}{user.username === currentUsername ? " *" : ""}</div>
                      <div className="tiny-copy">{user.name}</div>
                    </div>
                  </div>
                  <span className="rank-pill compact-pill" style={{ borderColor: `${rank.color}33`, color: rank.color }}>{rank.icon} {rank.name}</span>
                </div>
                <div className="rail-primary mono small-rating">{formatFullTokens(user.totalTokens)}</div>
                <div className="tiny-copy">{user.bio ?? "No bio set yet."}</div>
                <div style={{ marginTop: 12 }}><WeeklySpark values={user.weeklyHistory} /></div>
                <div className="stack compact-stack" style={{ marginTop: 12 }}>
                  <div className="stat-line compact-line"><span>7d</span><strong className="mono strong-cell">{formatTokens(user.weeklyTokens)}</strong></div>
                  <div className="stat-line compact-line"><span>streak</span><strong className="mono strong-cell">{user.streak}d</strong></div>
                  <div className="stat-line compact-line"><span>tok/event</span><strong className="mono strong-cell">{formatTokens(user.tokensPerCommit)}</strong></div>
                </div>
                <div style={{ marginTop: 10 }}><SourceBadges user={user} /></div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">No operator profiles yet.</div>
      )}
    </section>
  );
}

function CompareView({ users, currentUsername }: { users: UserStats[]; currentUsername: string | null }) {
  const snapshot = buildDashboardSnapshot(users, currentUsername);
  const left = snapshot.currentUser ?? snapshot.users[0] ?? null;
  const right = snapshot.users.find((user) => user.id !== left?.id) ?? null;

  if (!left || !right) {
    return (
      <section className="panel section-panel">
        <div className="section-head minimal-head">
          <div>
            <div className="eyebrow">Compare</div>
            <h2 className="section-title compact-title">Head-to-head</h2>
          </div>
        </div>
        <div className="empty-state">Need at least two real operators before head-to-head comparison makes sense.</div>
      </section>
    );
  }

  return (
    <section className="panel section-panel">
      <div className="section-head minimal-head">
        <div>
          <div className="eyebrow">Compare</div>
          <h2 className="section-title compact-title">Head-to-head</h2>
        </div>
      </div>
      <div className="profile-grid compact-grid">
        {[left, right].map((user) => (
          <div className="panel-muted card-pad compact-card" key={user.id}>
            <div className="profile-card-top compact-top">
              <div className="user-line">
                <div className="avatar compact-avatar">{user.avatar}</div>
                <div>
                  <div className="user-name">{user.username}</div>
                  <div className="tiny-copy">{user.name}</div>
                </div>
              </div>
              <span className="rank-pill compact-pill" style={{ borderColor: `${getRank(user.totalTokens).color}33`, color: getRank(user.totalTokens).color }}>{getRank(user.totalTokens).name}</span>
            </div>
            <div className="rail-primary mono small-rating">{formatFullTokens(user.totalTokens)}</div>
            <div className="stack compact-stack" style={{ marginTop: 12 }}>
              <div className="stat-line compact-line"><span>7d</span><strong className="mono strong-cell">{formatTokens(user.weeklyTokens)}</strong></div>
              <div className="stat-line compact-line"><span>streak</span><strong className="mono strong-cell">{user.streak}d</strong></div>
              <div className="stat-line compact-line"><span>sources</span><strong className="mono strong-cell">{user.sources.length}</strong></div>
              <div className="stat-line compact-line"><span>tok/event</span><strong className="mono strong-cell">{formatTokens(user.tokensPerCommit)}</strong></div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TrendsView({ users, currentUsername }: { users: UserStats[]; currentUsername: string | null }) {
  const snapshot = buildDashboardSnapshot(users, currentUsername);
  const focus = snapshot.currentUser ?? snapshot.users[0] ?? null;
  return (
    <section className="panel section-panel">
      <div className="section-head minimal-head">
        <div>
          <div className="eyebrow">Trends</div>
          <h2 className="section-title compact-title">Activity and model mix</h2>
        </div>
      </div>
      {focus ? (
        <div className="content-grid trends-grid">
          <div className="panel-muted card-pad compact-card">
            <div className="metric-label">28d heatmap</div>
            <div style={{ marginTop: 14 }}><Heatmap values={focus.heatmap} /></div>
          </div>
          <div className="panel-muted card-pad compact-card">
            <div className="metric-label">7d line</div>
            <div style={{ marginTop: 14 }}><WeeklySpark values={focus.weeklyHistory} /></div>
            <div className="stack compact-stack" style={{ marginTop: 12 }}>
              <div className="stat-line compact-line"><span>current 7d</span><strong className="mono strong-cell">{formatTokens(focus.weeklyTokens)}</strong></div>
              <div className="stat-line compact-line"><span>lifetime</span><strong className="mono strong-cell">{formatFullTokens(focus.totalTokens)}</strong></div>
            </div>
          </div>
          <div className="panel-muted card-pad compact-card">
            <div className="metric-label">Provider split</div>
            <div className="provider-bars compact-stack" style={{ marginTop: 12 }}>
              {snapshot.providerMix.map((entry) => (
                <div className="provider-row compact-provider" key={entry.label}>
                  <span>{entry.label}</span>
                  <div className="provider-track"><div className="provider-bar" style={{ width: `${entry.value * 100}%` }} /></div>
                  <span className="mono">{formatPercent(entry.value)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="panel-muted card-pad compact-card">
            <div className="metric-label">Model pool</div>
            <div className="stack compact-stack" style={{ marginTop: 12 }}>
              {focus.topModels.slice(0, 4).map((model) => (
                <div className="stat-line compact-line" key={model.model}><span>{model.model}</span><strong className="mono strong-cell">{formatTokens(model.tokens)}</strong></div>
              ))}
              {!focus.topModels.length ? <div className="tiny-copy">No model data yet</div> : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="empty-state">No activity yet.</div>
      )}
    </section>
  );
}

function ChallengesView({ users, currentUsername }: { users: UserStats[]; currentUsername: string | null }) {
  const snapshot = buildDashboardSnapshot(users, currentUsername);
  return (
    <section className="panel section-panel">
      <div className="section-head minimal-head">
        <div>
          <div className="eyebrow">Challenges</div>
          <h2 className="section-title compact-title">Contest board</h2>
        </div>
      </div>
      {snapshot.totalUsers > 1 ? (
        <div className="challenge-grid compact-grid">
          {snapshot.challenges.map((challenge) => (
            <div className="panel-muted card-pad compact-card contest-card" key={challenge.id}>
              <div className="contest-top">
                <strong>{challenge.name}</strong>
                <span className={`status-pill compact-pill ${challenge.status === "live" ? "status-live" : "status-warming"}`}>{challenge.status === "live" ? "live" : "soon"}</span>
              </div>
              <div className="tiny-copy">{challenge.summary}</div>
              <div className="stack compact-stack" style={{ marginTop: 12 }}>
                <div className="stat-line compact-line"><span>metric</span><strong className="mono strong-cell">{challenge.metricLabel}</strong></div>
                <div className="stat-line compact-line"><span>leader</span><strong className="mono strong-cell">{challenge.leader ? `@${challenge.leader.username} · ${challenge.leader.value}` : "waiting"}</strong></div>
                <div className="stat-line compact-line"><span>runner-up</span><strong className="mono strong-cell">{challenge.runnerUp ? `@${challenge.runnerUp.username} · ${challenge.runnerUp.value}` : "need 2+ users"}</strong></div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">Challenges appear automatically once the board has enough real operators to compare.</div>
      )}
    </section>
  );
}

function ConnectView({ users, currentUsername }: { users: UserStats[]; currentUsername: string | null }) {
  const snapshot = buildDashboardSnapshot(users, currentUsername);
  const [copied, setCopied] = useState<string | null>(null);
  const commands = [
    { id: "install", label: "install", command: "cd cli && npm install && npm link" },
    { id: "key", label: "login", command: "burnlog login <api-key>" },
    { id: "sync", label: "sync", command: "burnlog sync" },
  ];

  async function copyCommand(command: string, id: string) {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1200);
    } catch {}
  }

  return (
    <section className="panel section-panel">
      <div className="section-head minimal-head">
        <div>
          <div className="eyebrow">Connect</div>
          <h2 className="section-title compact-title">Attach local agent logs</h2>
        </div>
        <Link className="action-chip" href="/settings">Open settings</Link>
      </div>
      <div className="connector-grid compact-grid">
        <div className="panel-muted card-pad compact-card">
          <div className="metric-label">Commands</div>
          <div className="stack compact-stack" style={{ marginTop: 12 }}>
            {commands.map((item) => (
              <div className="command-block compact-command" key={item.id}>
                <div>
                  <div className="tiny-copy mono">{item.label}</div>
                  <div className="command-text">{item.command}</div>
                </div>
                <button className="button-secondary compact-button" onClick={() => copyCommand(item.command, item.id)} type="button">
                  {copied === item.id ? "copied" : "copy"}
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="panel-muted card-pad compact-card">
          <div className="metric-label">Supported sources</div>
          <div className="stack compact-stack" style={{ marginTop: 12 }}>
            {snapshot.connectors.map((connector) => (
              <div className="stat-line compact-line" key={connector.id}>
                <span>{connector.label}</span>
                <strong className="mono strong-cell">{connector.connected ? "connected" : "ready"}</strong>
              </div>
            ))}
          </div>
          <div className="tiny-copy" style={{ marginTop: 10 }}>
            Burnlog uploads totals and metadata only. No code, repo names, prompts, or working paths.
          </div>
        </div>
      </div>
    </section>
  );
}

export function Burnlog({ users, currentUsername }: { users: UserStats[]; currentUsername: string | null }) {
  const snapshot = useMemo(() => buildDashboardSnapshot(users, currentUsername), [users, currentUsername]);
  const tabs = useMemo(
    () => ALL_TABS.filter((item) => (snapshot.totalUsers > 1 ? true : item.id !== "compare" && item.id !== "challenges")),
    [snapshot.totalUsers],
  );
  const [tab, setTab] = useState<TabId>("board");
  const activeTab = tabs.some((item) => item.id === tab) ? tab : "board";

  return (
    <div className="page-shell competition-shell">
      <div className="page-container comp-container">
        <Header
          tabs={tabs}
          tab={activeTab}
          setTab={setTab}
          totalUsers={snapshot.totalUsers}
          weeklyLeader={snapshot.metrics.topWeeklyBurner?.username ?? null}
        />

        <div className="subhead-row">
          <div className="eyebrow">{tabs.find((item) => item.id === activeTab)?.hint}</div>
          <div className="mono tiny-copy">rating = total burn · contests only appear when the board has enough real traffic</div>
        </div>

        {activeTab === "board" ? <BoardView currentUsername={currentUsername} users={users} /> : null}
        {activeTab === "profiles" ? <ProfilesView currentUsername={currentUsername} users={users} /> : null}
        {activeTab === "compare" ? <CompareView currentUsername={currentUsername} users={users} /> : null}
        {activeTab === "trends" ? <TrendsView currentUsername={currentUsername} users={users} /> : null}
        {activeTab === "challenges" ? <ChallengesView currentUsername={currentUsername} users={users} /> : null}
        {activeTab === "connect" ? <ConnectView currentUsername={currentUsername} users={users} /> : null}
      </div>
    </div>
  );
}
