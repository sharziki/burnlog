import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  const user = session?.user as { id?: string } | undefined;

  if (user?.id) {
    redirect("/");
  }

  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 16,
        fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#52525B",
          letterSpacing: 2,
          textTransform: "uppercase",
        }}
      >
        burnlog · sign in
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
            color: "#09090B",
            border: "none",
            borderRadius: 8,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
            fontSize: 13,
          }}
        >
          Sign in with GitHub
        </button>
      </form>
    </div>
  );
}
