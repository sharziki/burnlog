import Link from "next/link";
import { formatTokens } from "@/lib/format";
import type { LandingSnapshot } from "@/lib/landing";
import type { UserStats } from "@/lib/stats";

type LandingPageProps = {
  snapshot: LandingSnapshot;
  currentUsername: string | null;
};

function FeaturedOperatorCard({ user, rank }: { user: UserStats; rank: number }) {
  return (
    <div className="landing-card operator-card">
      <div className="operator-card-top">
        <div>
          <div className="eyebrow">rank #{rank}</div>
          <h3 className="operator-name">@{user.username}</h3>
        </div>
        <div className="operator-avatar">{user.avatar}</div>
      </div>
      <p className="section-copy operator-bio">{user.bio ?? "Private-by-default operator profile."}</p>
      <div className="landing-stat-list compact-stat-list">
        <div className="landing-stat-row"><span>total burn</span><strong className="mono">{formatTokens(user.totalTokens)}</strong></div>
        <div className="landing-stat-row"><span>weekly burn</span><strong className="mono">{formatTokens(user.weeklyTokens)}</strong></div>
        <div className="landing-stat-row"><span>streak</span><strong className="mono">{user.streak}d</strong></div>
        <div className="landing-stat-row"><span>sources</span><strong className="mono">{user.sources.length}</strong></div>
      </div>
    </div>
  );
}

export function LandingPage({ snapshot, currentUsername }: LandingPageProps) {
  return (
    <div className="landing-shell">
      <div className="landing-bg-grid" aria-hidden="true" />
      <div className="page-container landing-container">
        <header className="landing-nav">
          <Link className="landing-brand" href="/">
            <span className="brand-mark minimal-mark">BL</span>
            <span>
              <span className="brand-title mono-title">burnlog</span>
              <span className="brand-subtitle">real standings for ai-agentic programming</span>
            </span>
          </Link>
          <nav className="landing-nav-links">
            <a className="landing-nav-link" href="#announcements">Announcements</a>
            <a className="landing-nav-link" href="#case-study">Case study</a>
            <Link className="landing-nav-link" href="/board">Board</Link>
            <Link className="landing-nav-link" href="/settings">Connect</Link>
          </nav>
        </header>

        <main className="landing-main">
          <section className="hero-panel">
            <div className="hero-layout">
              <div>
                <div className="eyebrow accent-eyebrow">Private-by-default ingest · public standings</div>
                <h1 className="landing-title">See who actually ships with coding agents.</h1>
                <p className="landing-copy">
                  Burnlog turns local coding-agent logs into a real operator board without uploading prompts, repo names, cwd paths,
                  or source code. No fake leaderboard padding. No vanity screenshots pretending to be truth.
                </p>
                <div className="landing-cta-row">
                  <Link className="button-primary landing-primary" href="/board">Open live board</Link>
                  <Link className="button-secondary landing-secondary" href="/settings">
                    {currentUsername ? "Open my settings" : "Connect my setup"}
                  </Link>
                </div>
                <div className="hero-note mono">built for builders who want a public signal without leaking private work</div>
              </div>

              <div className="hero-preview-card">
                <div className="eyebrow">Live board preview</div>
                {snapshot.featuredUsers[0] ? (
                  <>
                    <div className="hero-preview-head">
                      <div>
                        <div className="hero-preview-rank mono">rank #1</div>
                        <div className="hero-preview-user">@{snapshot.featuredUsers[0].username}</div>
                      </div>
                      <div className="operator-avatar">{snapshot.featuredUsers[0].avatar}</div>
                    </div>
                    <div className="hero-preview-total mono">{formatTokens(snapshot.featuredUsers[0].totalTokens)}</div>
                    <div className="landing-stat-list compact-stat-list">
                      <div className="landing-stat-row"><span>weekly burn</span><strong className="mono">{formatTokens(snapshot.featuredUsers[0].weeklyTokens)}</strong></div>
                      <div className="landing-stat-row"><span>sources</span><strong className="mono">{snapshot.featuredUsers[0].sources.length}</strong></div>
                      <div className="landing-stat-row"><span>top model</span><strong className="mono">{snapshot.featuredUsers[0].topModels[0]?.model ?? "pending"}</strong></div>
                    </div>
                  </>
                ) : (
                  <div className="empty-state" style={{ marginTop: 16 }}>
                    No live operator yet. This preview populates automatically once a real profile syncs.
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="metric-strip" aria-label="Current platform metrics">
            {snapshot.metrics.map((metric) => (
              <div className="metric-tile" key={metric.label}>
                <div className={`metric-value ${metric.tone === "accent" ? "metric-value-accent" : ""}`}>{metric.value}</div>
                <div className="metric-label landing-metric-label">{metric.label}</div>
              </div>
            ))}
          </section>

          <section className="landing-grid-two">
            <div className="landing-card narrative-card">
              <div className="eyebrow">Why it exists</div>
              <h2 className="section-title compact-title">Codeforces, but for AI-native building work.</h2>
              <p className="section-copy">
                Most people can claim they use Claude Code, Codex, or whatever comes next. Burnlog is the surface that shows who
                actually logs the reps, maintains a streak, and keeps a visible operating history.
              </p>
            </div>
            <div className="landing-card narrative-card">
              <div className="eyebrow">Privacy model</div>
              <h2 className="section-title compact-title">We upload burn telemetry, not your work.</h2>
              <p className="section-copy">
                Burnlog stores token totals, provider, model, source, and timestamp. It does not store prompt text, repo names,
                paths, filenames, or source code. That boundary is the whole point.
              </p>
            </div>
          </section>

          <section className="landing-section" id="announcements">
            <div className="section-head landing-head">
              <div>
                <div className="eyebrow">Announcements</div>
                <h2 className="section-title">Product updates</h2>
              </div>
              <div className="tiny-copy">Short changelog. No fake launch theatre.</div>
            </div>
            <div className="landing-grid-three">
              {snapshot.announcements.map((item) => (
                <article className="landing-card announcement-card" key={item.id}>
                  <div className="announcement-date mono">{item.date}</div>
                  <h3 className="announcement-title">{item.title}</h3>
                  <p className="section-copy">{item.summary}</p>
                  <Link className="announcement-link" href={item.href}>{item.cta}</Link>
                </article>
              ))}
            </div>
          </section>

          <section className="landing-section" id="case-study">
            <div className="landing-case-study">
              <div className="landing-card case-study-card">
                <div className="eyebrow">{snapshot.caseStudy.label}</div>
                <h2 className="section-title">{snapshot.caseStudy.title}</h2>
                <p className="section-copy">{snapshot.caseStudy.summary}</p>
                <div className="case-study-bullets">
                  {snapshot.caseStudy.bullets.map((bullet) => (
                    <div className="case-study-bullet" key={bullet}>{bullet}</div>
                  ))}
                </div>
              </div>
              <div className="landing-card case-study-metrics">
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
            </div>
          </section>

          <section className="landing-section">
            <div className="section-head landing-head">
              <div>
                <div className="eyebrow">Current board</div>
                <h2 className="section-title">Featured operators</h2>
              </div>
              <Link className="action-chip" href="/board">View full standings</Link>
            </div>
            {snapshot.featuredUsers.length ? (
              <div className="landing-grid-three">
                {snapshot.featuredUsers.map((user, index) => (
                  <FeaturedOperatorCard key={user.id} rank={index + 1} user={user} />
                ))}
              </div>
            ) : (
              <div className="landing-card empty-landing-state">
                <h3 className="announcement-title">No operators have synced yet.</h3>
                <p className="section-copy">
                  Burnlog stays honest when the board is empty. Connect the CLI, generate a key, run sync, and the first real
                  profile will appear here automatically.
                </p>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
