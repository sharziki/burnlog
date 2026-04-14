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
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 16,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        <div style={{ fontSize: 13, color: "#6B7280", letterSpacing: 2, textTransform: "uppercase" }}>
          burnlog · settings
        </div>
        <form
          action={async () => {
            "use server";
            await signIn("github");
          }}
        >
          <button
            type="submit"
            style={{
              padding: "12px 24px",
              background: "#D97706",
              color: "#000",
              border: "none",
              borderRadius: 8,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13,
            }}
          >
            Sign in with GitHub
          </button>
        </form>
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
