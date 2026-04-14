import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";
import { SettingsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  const user = session?.user as
    | { id?: string; username?: string; name?: string; image?: string }
    | undefined;

  if (!user?.id) {
    return (
      <div className="settings-shell">
        <div className="page-container">
          <div className="topbar settings-topbar">
            <Link className="landing-brand-inline" href="/">
              <div className="brand-mark minimal-mark">BL</div>
              <div>
                <div className="brand-title mono-title">burnlog</div>
                <div className="brand-subtitle">connect your operator profile</div>
              </div>
            </Link>
            <div className="inline-row">
              <Link className="action-chip" href="/board">Open board</Link>
            </div>
          </div>

          <div className="hero-grid">
            <div className="panel hero-copy">
              <div className="eyebrow">Claim your profile</div>
              <h1 className="hero-title mono">Connect local coding-agent logs without exposing your repo.</h1>
              <p className="hero-text">
                Sign in with GitHub to generate an upload key, claim your username, and turn your private local burn history into a
                real public standing.
              </p>
              <form
                action={async () => {
                  "use server";
                  await signIn("github");
                }}
              >
                <button className="button-primary" type="submit">Sign in with GitHub</button>
              </form>
            </div>

            <div className="panel hero-side">
              <div className="eyebrow">Local development</div>
              <h2 className="section-title" style={{ marginTop: 8 }}>Bootstrap before OAuth is configured</h2>
              <p className="section-copy">
                For local development only, you can mint a user and API key directly from Prisma. This is a setup shortcut, not a
                hidden demo mode.
              </p>
              <div className="command-block" style={{ marginTop: 18 }}>
                <div className="command-text">npm run db:seed -- sharziki "Sharvil Saxena"</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SettingsClient
      username={user.username ?? ""}
      name={user.name ?? ""}
      signOutAction={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    />
  );
}
