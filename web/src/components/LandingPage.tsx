import Link from "next/link";
import { formatTokens } from "@/lib/format";
import type { LandingSnapshot } from "@/lib/landing";

type LandingPageProps = {
  snapshot: LandingSnapshot;
  currentUsername: string | null;
};

export function LandingPage({ snapshot, currentUsername }: LandingPageProps) {
  const leader = snapshot.leaderboardUsers[0] ?? null;

  return (
    <div className="landing-shell">
      <div className="landing-bg-grid" aria-hidden="true" />
      <div className="page-container landing-container">
        <header className="landing-nav">
          <Link className="landing-brand" href="/">
            <span className="brand-mark minimal-mark">BL</span>
            <span>
              <span className="brand-title mono-title">burnlog</span>
              <span className="brand-subtitle">codeforces for ai-agentic programming</span>
            </span>
          </Link>
          <nav className="landing-nav-links">
            <Link className="landing-nav-link" href="/board">Board</Link>
            <Link className="landing-nav-link" href="/challenges/new">Challenge</Link>
            <Link className="landing-nav-link" href="/groups/new">Group</Link>
            <Link className="landing-nav-link" href="/settings">Connect</Link>
          </nav>
        </header>

        <main className="landing-main">
          <section className="hero-panel hero-panel-upgraded">
            <div className="hero-grid-upgraded">
              <div className="hero-copy-compact">
                <div className="eyebrow accent-eyebrow">Private ingest. Public competition.</div>
                <h1 className="landing-title">See who ships.</h1>
                <p className="landing-copy minimal-copy">Track real coding-agent burn. Keep prompts and code private.</p>
                <div className="landing-cta-row">
                  <Link className="button-primary landing-primary" href="/board">Open leaderboard</Link>
                  <Link className="button-secondary landing-secondary" href={currentUsername ? "/settings" : "/settings"}>
                    {currentUsername ? "My setup" : "Connect logs"}
                  </Link>
                </div>
                <div className="announcement-tape" aria-label="announcements">
                  {snapshot.announcements.map((item) => (
                    <Link className="announcement-pill" href={item.href} key={item.id}>
                      <span className="mono">{item.date}</span>
                      <span>{item.title}</span>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="hero-visual-shell">
                <div className="hero-orbit hero-orbit-1" />
                <div className="hero-orbit hero-orbit-2" />
                <div className="hero-board-card">
                  <div className="hero-board-head">
                    <div>
                      <div className="eyebrow">Live leaderboard</div>
                      <div className="hero-board-title">Top operators</div>
                    </div>
                    <div className="live-dot-wrap"><span className="live-dot" /> live</div>
                  </div>
                  <div className="hero-leaderboard">
                    {snapshot.leaderboardUsers.length ? (
                      snapshot.leaderboardUsers.slice(0, 4).map((user, index) => (
                        <div className="hero-row" key={user.id}>
                          <div className="hero-rank mono">#{index + 1}</div>
                          <div className="hero-user-block">
                            <div className="hero-user-name">@{user.username}</div>
                            <div className="tiny-copy">{user.topModels[0]?.model ?? "waiting"}</div>
                          </div>
                          <div className="hero-user-burn mono">{formatTokens(user.totalTokens)}</div>
                        </div>
                      ))
                    ) : (
                      <div className="empty-state">No operators yet.</div>
                    )}
                  </div>
                  {leader ? (
                    <div className="hero-board-footer">
                      <div className="tiny-copy">leader</div>
                      <div className="hero-footer-stat mono">@{leader.username}</div>
                      <div className="hero-footer-stat mono">{formatTokens(leader.weeklyTokens)} / 7d</div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <section className="metric-strip upgraded-metric-strip" aria-label="Current platform metrics">
            {snapshot.metrics.map((metric) => (
              <div className="metric-tile" key={metric.label}>
                <div className={`metric-value ${metric.tone === "accent" ? "metric-value-accent" : ""}`}>{metric.value}</div>
                <div className="metric-label landing-metric-label">{metric.label}</div>
              </div>
            ))}
          </section>

          <section className="landing-section leaderboard-section">
            <div className="section-head landing-head compact-headline-row">
              <div>
                <div className="eyebrow">Leaderboard</div>
                <h2 className="section-title compact-title">Visible from the landing.</h2>
              </div>
              <Link className="action-chip" href="/board">Full board</Link>
            </div>
            <div className="landing-card leaderboard-card">
              <div className="landing-table-head mono">
                <span>rk</span>
                <span>operator</span>
                <span>weekly</span>
                <span>total</span>
              </div>
              {snapshot.leaderboardUsers.length ? (
                snapshot.leaderboardUsers.map((user, index) => (
                  <div className="landing-table-row" key={user.id}>
                    <span className="mono">#{index + 1}</span>
                    <span>@{user.username}</span>
                    <span className="mono">{formatTokens(user.weeklyTokens)}</span>
                    <span className="mono">{formatTokens(user.totalTokens)}</span>
                  </div>
                ))
              ) : (
                <div className="empty-state">No live standings yet.</div>
              )}
            </div>
          </section>

          <section className="landing-grid-two action-surface-grid">
            <div className="landing-card action-surface-card challenge-surface-card">
              <div className="eyebrow">Challenge</div>
              <h2 className="section-title compact-title">Create a real contest.</h2>
              <p className="section-copy minimal-copy">Title. window. invite code. live board.</p>
              <div className="surface-lines">
                <div className="surface-line"><span>weekly sprint</span><span className="mono">7d</span></div>
                <div className="surface-line"><span>launch duel</span><span className="mono">14d</span></div>
                <div className="surface-line"><span>bugfix race</span><span className="mono">48h</span></div>
              </div>
              <Link className="button-primary" href="/challenges/new">Create challenge</Link>
            </div>

            <div className="landing-card action-surface-card group-surface-card">
              <div className="eyebrow">Group</div>
              <h2 className="section-title compact-title">Create a crew.</h2>
              <p className="section-copy minimal-copy">Shared leaderboard. invite code. member burn.</p>
              <div className="surface-lines">
                <div className="surface-line"><span>studio</span><span className="mono">private</span></div>
                <div className="surface-line"><span>team</span><span className="mono">invite</span></div>
                <div className="surface-line"><span>lab</span><span className="mono">ranked</span></div>
              </div>
              <Link className="button-primary" href="/groups/new">Create group</Link>
            </div>
          </section>

          <section className="landing-grid-two minimal-story-grid" id="case-study">
            <div className="landing-card case-study-card compact-case-card">
              <div className="eyebrow">{snapshot.caseStudy.label}</div>
              <h2 className="section-title compact-title">{snapshot.caseStudy.title}</h2>
              <p className="section-copy minimal-copy">{snapshot.caseStudy.summary}</p>
              <div className="compact-bullet-row">
                {snapshot.caseStudy.bullets.map((bullet) => (
                  <div className="case-mini-chip" key={bullet}>{bullet}</div>
                ))}
              </div>
            </div>
            <div className="landing-card case-study-metrics compact-case-metrics">
              <div className="eyebrow">Snapshot</div>
              <div className="landing-stat-list">
                {snapshot.caseStudy.metrics.map((metric) => (
                  <div className="landing-stat-row" key={metric.label}>
                    <span>{metric.label}</span>
                    <strong className="mono">{metric.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="landing-grid-two community-grid">
            <div className="landing-card community-card">
              <div className="section-head landing-head compact-headline-row">
                <div>
                  <div className="eyebrow">Challenges</div>
                  <h2 className="section-title compact-title">Live or waiting.</h2>
                </div>
                <Link className="action-chip" href="/challenges/new">New</Link>
              </div>
              <div className="community-stack">
                {snapshot.featuredChallenges.length ? (
                  snapshot.featuredChallenges.map((challenge) => (
                    <Link className="community-row" href={`/challenges/${challenge.slug}`} key={challenge.id}>
                      <div>
                        <div className="community-title">{challenge.title}</div>
                        <div className="tiny-copy">{challenge.hostGroup?.name ?? "solo"}</div>
                      </div>
                      <div className="community-meta mono">{challenge.participantCount}</div>
                    </Link>
                  ))
                ) : (
                  <div className="empty-state">No real challenges yet.</div>
                )}
              </div>
            </div>

            <div className="landing-card community-card">
              <div className="section-head landing-head compact-headline-row">
                <div>
                  <div className="eyebrow">Groups</div>
                  <h2 className="section-title compact-title">Crews on the board.</h2>
                </div>
                <Link className="action-chip" href="/groups/new">New</Link>
              </div>
              <div className="community-stack">
                {snapshot.featuredGroups.length ? (
                  snapshot.featuredGroups.map((group) => (
                    <Link className="community-row" href={`/groups/${group.slug}`} key={group.id}>
                      <div>
                        <div className="community-title">{group.name}</div>
                        <div className="tiny-copy">{group.memberCount} members</div>
                      </div>
                      <div className="community-meta mono">{formatTokens(group.totalTokens)}</div>
                    </Link>
                  ))
                ) : (
                  <div className="empty-state">No groups yet.</div>
                )}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
