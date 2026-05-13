import { signIn } from "@/auth";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div
      style={{
        minHeight: "calc(100vh - 180px)",
        display: "grid",
        placeItems: "center",
        padding: "48px 24px 72px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#0C0C0E",
          border: "1px solid #18181B",
          borderRadius: 18,
          padding: 32,
          boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
        }}
      >
        <div style={{ fontSize: 12, color: "#D97706", fontWeight: 700, letterSpacing: 1.8, textTransform: "uppercase", marginBottom: 12 }}>
          Burnlog access
        </div>
        <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.1, color: "#FAFAFA" }}>Sign in and start tracking.</h1>
        <p style={{ margin: "14px 0 24px", fontSize: 15, lineHeight: 1.65, color: "#A1A1AA" }}>
          Connect GitHub, install the CLI, sync your local token counts, and join the live leaderboard without uploading prompt content.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "14px 18px",
              borderRadius: 10,
              border: "none",
              background: "#D97706",
              color: "#09090B",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Continue with GitHub
          </button>
        </form>
        <div style={{ marginTop: 18, fontSize: 12, color: "#71717A", lineHeight: 1.6 }}>
          Local-first. Open source CLI. Burnlog stores counts, not prompts.
        </div>
      </div>
    </div>
  );
}
