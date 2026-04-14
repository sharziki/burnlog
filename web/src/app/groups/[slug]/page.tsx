import Link from "next/link";
import { notFound } from "next/navigation";
import { getGroupBySlug } from "@/lib/community";
import { formatTokens } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function GroupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const group = await getGroupBySlug(slug);
  if (!group) notFound();

  return (
    <div className="settings-shell">
      <div className="page-container form-page-shell stack">
        <div className="topbar settings-topbar">
          <Link className="landing-brand-inline" href="/">
            <div className="brand-mark minimal-mark">BL</div>
            <div>
              <div className="brand-title mono-title">burnlog</div>
              <div className="brand-subtitle">group</div>
            </div>
          </Link>
          <div className="inline-row">
            <Link className="action-chip" href="/board">Board</Link>
            <Link className="action-chip" href="/groups/new">New group</Link>
          </div>
        </div>

        <section className="landing-card detail-hero-card">
          <div className="eyebrow">Group</div>
          <h1 className="section-title">{group.name}</h1>
          <p className="section-copy minimal-copy">{group.description ?? "Shared operator board."}</p>
          <div className="metric-strip upgraded-metric-strip detail-metric-strip">
            <div className="metric-tile"><div className="metric-value metric-value-accent">{group.rankedMembers.length}</div><div className="metric-label">members</div></div>
            <div className="metric-tile"><div className="metric-value">{formatTokens(group.rankedMembers.reduce((sum, item) => sum + item.user.totalTokens, 0))}</div><div className="metric-label">burn</div></div>
            <div className="metric-tile"><div className="metric-value">{group.createdBy.username ?? "—"}</div><div className="metric-label">captain</div></div>
            <div className="metric-tile"><div className="metric-value mono">{group.inviteCode}</div><div className="metric-label">invite</div></div>
          </div>
        </section>

        <div className="landing-grid-two community-grid">
          <section className="landing-card leaderboard-card">
            <div className="section-head compact-headline-row">
              <div>
                <div className="eyebrow">Members</div>
                <h2 className="section-title compact-title">Group board</h2>
              </div>
            </div>
            <div className="landing-table-head mono">
              <span>rk</span>
              <span>operator</span>
              <span>role</span>
              <span>total</span>
            </div>
            {group.rankedMembers.length ? group.rankedMembers.map((item, index) => (
              <div className="landing-table-row" key={item.user.id}>
                <span className="mono">#{index + 1}</span>
                <span>@{item.user.username}</span>
                <span>{item.role}</span>
                <span className="mono">{formatTokens(item.user.totalTokens)}</span>
              </div>
            )) : <div className="empty-state">No members yet.</div>}
          </section>

          <section className="landing-card community-card">
            <div className="section-head compact-headline-row">
              <div>
                <div className="eyebrow">Challenges</div>
                <h2 className="section-title compact-title">Attached contests</h2>
              </div>
              <Link className="action-chip" href="/challenges/new">New challenge</Link>
            </div>
            <div className="community-stack">
              {group.challenges.length ? group.challenges.map((challenge) => (
                <Link className="community-row" href={`/challenges/${challenge.slug}`} key={challenge.id}>
                  <div>
                    <div className="community-title">{challenge.title}</div>
                    <div className="tiny-copy">{challenge.status}</div>
                  </div>
                  <div className="community-meta mono">{new Date(challenge.endsAt).toLocaleDateString()}</div>
                </Link>
              )) : <div className="empty-state">No group challenges yet.</div>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
