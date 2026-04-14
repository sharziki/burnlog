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
          <div className="topbar">
            <div className="brand-lockup">
              <div className="brand-mark">BL</div>
              <div>
                <div className="brand-title">Burnlog</div>
                <div className="brand-subtitle">Settings and connection flow</div>
              </div>
            </div>
          </div>

          <div className="hero-grid">
            <div className="panel hero-copy">
              <div className="eyebrow">Claim your profile</div>
              <h1 className="hero-title mono">Mint an API key, connect the CLI, and own your benchmark.</h1>
              <p className="hero-text">
                Burnlog keeps the board public-facing enough to be interesting, but private enough to avoid shipping your actual repo context.
                Sign in with GitHub to generate your API key and turn local coding-agent usage into a real profile.
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
              <div className="eyebrow">Local dev shortcut</div>
              <h2 className="section-title" style={{ marginTop: 8 }}>Seed without OAuth</h2>
              <p className="section-copy">
                For local-only demo work, Burnlog also supports bootstrapping a user and API key directly from Prisma. This keeps local iteration fast while the production path stays GitHub-auth based.
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
