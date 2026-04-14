import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createGroup, joinGroupByCode } from "@/lib/community";
import { requireCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function NewGroupPage() {
  const user = await requireCurrentUser();

  async function createGroupAction(formData: FormData) {
    "use server";
    const currentUser = await requireCurrentUser();
    if (!currentUser) redirect("/settings");

    const name = formData.get("name")?.toString().trim() ?? "";
    const description = formData.get("description")?.toString().trim() ?? "";
    if (!name) redirect("/groups/new");

    const group = await createGroup({
      userId: currentUser.id!,
      name,
      description: description || null,
    });

    revalidatePath("/");
    revalidatePath("/board");
    redirect(`/groups/${group.slug}`);
  }

  async function joinGroupAction(formData: FormData) {
    "use server";
    const currentUser = await requireCurrentUser();
    if (!currentUser) redirect("/settings");

    const inviteCode = formData.get("inviteCode")?.toString().trim() ?? "";
    if (!inviteCode) redirect("/groups/new");
    const group = await joinGroupByCode({ userId: currentUser.id!, inviteCode });
    if (!group) redirect("/groups/new");

    revalidatePath("/");
    revalidatePath("/board");
    redirect(`/groups/${group.slug}`);
  }

  return (
    <div className="settings-shell">
      <div className="page-container form-page-shell">
        <div className="topbar settings-topbar">
          <Link className="landing-brand-inline" href="/">
            <div className="brand-mark minimal-mark">BL</div>
            <div>
              <div className="brand-title mono-title">burnlog</div>
              <div className="brand-subtitle">group creation</div>
            </div>
          </Link>
          <div className="inline-row">
            <Link className="action-chip" href="/board">Board</Link>
          </div>
        </div>

        {user ? (
          <div className="landing-grid-two form-grid">
            <form action={createGroupAction} className="landing-card form-card stack">
              <div>
                <div className="eyebrow">New group</div>
                <h1 className="section-title compact-title">Create a crew.</h1>
                <p className="section-copy minimal-copy">Shared board. invite code. real burn only.</p>
              </div>
              <label className="form-label">
                <span>Name</span>
                <input className="form-input" name="name" placeholder="SXNA Labs" required />
              </label>
              <label className="form-label">
                <span>Description</span>
                <textarea className="form-input form-textarea" name="description" placeholder="Builders shipping with coding agents." rows={4} />
              </label>
              <button className="button-primary" type="submit">Create group</button>
            </form>

            <form action={joinGroupAction} className="landing-card form-card stack">
              <div>
                <div className="eyebrow">Join</div>
                <h2 className="section-title compact-title">Enter invite code.</h2>
                <p className="section-copy minimal-copy">Use a group code. join instantly.</p>
              </div>
              <label className="form-label">
                <span>Invite code</span>
                <input className="form-input" name="inviteCode" placeholder="GRP_ABC123" required />
              </label>
              <button className="button-primary" type="submit">Join group</button>
            </form>
          </div>
        ) : (
          <div className="landing-card form-card stack">
            <div className="eyebrow">Sign in required</div>
            <h1 className="section-title compact-title">Claim a profile first.</h1>
            <p className="section-copy minimal-copy">Groups attach to real operators.</p>
            <Link className="button-primary" href="/settings">Open settings</Link>
          </div>
        )}
      </div>
    </div>
  );
}
