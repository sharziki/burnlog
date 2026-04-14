import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createChallenge, getGroupsForUser, joinChallengeByCode } from "@/lib/community";
import { requireCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function NewChallengePage() {
  const user = await requireCurrentUser();
  const groups = user ? await getGroupsForUser(user.id!) : [];

  async function createChallengeAction(formData: FormData) {
    "use server";
    const currentUser = await requireCurrentUser();
    if (!currentUser) redirect("/settings");

    const title = formData.get("title")?.toString().trim() ?? "";
    const summary = formData.get("summary")?.toString().trim() ?? "";
    const hostGroupId = formData.get("hostGroupId")?.toString().trim() ?? "";
    const durationDays = Number(formData.get("durationDays")?.toString() ?? "7");
    if (!title) redirect("/challenges/new");

    const startsAt = new Date();
    const endsAt = new Date(Date.now() + Math.max(1, durationDays) * 24 * 60 * 60 * 1000);
    const challenge = await createChallenge({
      userId: currentUser.id!,
      title,
      summary: summary || null,
      hostGroupId: hostGroupId || null,
      startsAt,
      endsAt,
    });

    revalidatePath("/");
    revalidatePath("/board");
    redirect(`/challenges/${challenge.slug}`);
  }

  async function joinChallengeAction(formData: FormData) {
    "use server";
    const currentUser = await requireCurrentUser();
    if (!currentUser) redirect("/settings");

    const inviteCode = formData.get("inviteCode")?.toString().trim() ?? "";
    if (!inviteCode) redirect("/challenges/new");
    const challenge = await joinChallengeByCode({ userId: currentUser.id!, inviteCode });
    if (!challenge) redirect("/challenges/new");

    revalidatePath("/");
    revalidatePath("/board");
    redirect(`/challenges/${challenge.slug}`);
  }

  return (
    <div className="settings-shell">
      <div className="page-container form-page-shell">
        <div className="topbar settings-topbar">
          <Link className="landing-brand-inline" href="/">
            <div className="brand-mark minimal-mark">BL</div>
            <div>
              <div className="brand-title mono-title">burnlog</div>
              <div className="brand-subtitle">challenge creation</div>
            </div>
          </Link>
          <div className="inline-row">
            <Link className="action-chip" href="/board">Board</Link>
          </div>
        </div>

        {user ? (
          <div className="landing-grid-two form-grid">
            <form action={createChallengeAction} className="landing-card form-card stack">
              <div>
                <div className="eyebrow">New challenge</div>
                <h1 className="section-title compact-title">Create a live contest.</h1>
                <p className="section-copy minimal-copy">Windowed burn. live board. optional host group.</p>
              </div>
              <label className="form-label">
                <span>Title</span>
                <input className="form-input" name="title" placeholder="Weekly Sprint" required />
              </label>
              <label className="form-label">
                <span>Summary</span>
                <textarea className="form-input form-textarea" name="summary" placeholder="Fastest shipper wins." rows={4} />
              </label>
              <label className="form-label">
                <span>Duration</span>
                <select className="form-input" defaultValue="7" name="durationDays">
                  <option value="2">48h</option>
                  <option value="7">7 days</option>
                  <option value="14">14 days</option>
                </select>
              </label>
              <label className="form-label">
                <span>Host group</span>
                <select className="form-input" defaultValue="" name="hostGroupId">
                  <option value="">No group</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
              </label>
              <button className="button-primary" type="submit">Create challenge</button>
            </form>

            <form action={joinChallengeAction} className="landing-card form-card stack">
              <div>
                <div className="eyebrow">Join</div>
                <h2 className="section-title compact-title">Enter challenge code.</h2>
                <p className="section-copy minimal-copy">Use an invite. land on the board.</p>
              </div>
              <label className="form-label">
                <span>Invite code</span>
                <input className="form-input" name="inviteCode" placeholder="CHL_ABC123" required />
              </label>
              <button className="button-primary" type="submit">Join challenge</button>
            </form>
          </div>
        ) : (
          <div className="landing-card form-card stack">
            <div className="eyebrow">Sign in required</div>
            <h1 className="section-title compact-title">Claim a profile first.</h1>
            <p className="section-copy minimal-copy">Challenges attach to real operators.</p>
            <Link className="button-primary" href="/settings">Open settings</Link>
          </div>
        )}
      </div>
    </div>
  );
}
