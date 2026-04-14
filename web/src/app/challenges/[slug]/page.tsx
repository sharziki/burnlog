import Link from "next/link";
import { notFound } from "next/navigation";
import { getChallengeBySlug } from "@/lib/community";
import { formatTokens } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ChallengePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const challenge = await getChallengeBySlug(slug);
  if (!challenge) notFound();

  return (
    <div className="settings-shell">
      <div className="page-container form-page-shell stack">
        <div className="topbar settings-topbar">
          <Link className="landing-brand-inline" href="/">
            <div className="brand-mark minimal-mark">BL</div>
            <div>
              <div className="brand-title mono-title">burnlog</div>
              <div className="brand-subtitle">challenge</div>
            </div>
          </Link>
          <div className="inline-row">
            <Link className="action-chip" href="/board">Board</Link>
            <Link className="action-chip" href="/challenges/new">New challenge</Link>
          </div>
        </div>

        <section className="landing-card detail-hero-card">
          <div className="eyebrow">Challenge</div>
          <h1 className="section-title">{challenge.title}</h1>
          <p className="section-copy minimal-copy">{challenge.summary ?? "Burn window with a live board."}</p>
          <div className="metric-strip upgraded-metric-strip detail-metric-strip">
            <div className="metric-tile"><div className="metric-value metric-value-accent">{challenge.board.length}</div><div className="metric-label">operators</div></div>
            <div className="metric-tile"><div className="metric-value mono">{challenge.status}</div><div className="metric-label">status</div></div>
            <div className="metric-tile"><div className="metric-value mono">{new Date(challenge.endsAt).toLocaleDateString()}</div><div className="metric-label">ends</div></div>
            <div className="metric-tile"><div className="metric-value mono">{challenge.inviteCode}</div><div className="metric-label">invite</div></div>
          </div>
        </section>

        <div className="landing-grid-two community-grid">
          <section className="landing-card leaderboard-card">
            <div className="section-head compact-headline-row">
              <div>
                <div className="eyebrow">Board</div>
                <h2 className="section-title compact-title">Challenge standings</h2>
              </div>
            </div>
            <div className="landing-table-head mono">
              <span>rk</span>
              <span>operator</span>
              <span>weekly</span>
              <span>challenge</span>
            </div>
            {challenge.board.length ? challenge.board.map((row, index) => (
              <div className="landing-table-row" key={row.user.id}>
                <span className="mono">#{index + 1}</span>
                <span>@{row.user.username}</span>
                <span className="mono">{formatTokens(row.user.weeklyTokens)}</span>
                <span className="mono">{formatTokens(row.tokens)}</span>
              </div>
            )) : <div className="empty-state">No joined operators yet.</div>}
          </section>

          <section className="landing-card community-card">
            <div className="section-head compact-headline-row">
              <div>
                <div className="eyebrow">Info</div>
                <h2 className="section-title compact-title">Contest meta</h2>
              </div>
            </div>
            <div className="community-stack">
              <div className="community-row static-row"><div><div className="community-title">Host</div><div className="tiny-copy">group</div></div><div className="community-meta">{challenge.hostGroup?.name ?? "solo"}</div></div>
              <div className="community-row static-row"><div><div className="community-title">Created by</div><div className="tiny-copy">operator</div></div><div className="community-meta">@{challenge.createdBy.username ?? "unknown"}</div></div>
              <div className="community-row static-row"><div><div className="community-title">Window</div><div className="tiny-copy">start → end</div></div><div className="community-meta mono">{new Date(challenge.startsAt).toLocaleDateString()} → {new Date(challenge.endsAt).toLocaleDateString()}</div></div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
