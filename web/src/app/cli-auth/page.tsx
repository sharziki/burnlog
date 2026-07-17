import { auth, signIn } from "@/auth";
import { CliAuthClient } from "./CliAuthClient";

export const dynamic = "force-dynamic";

const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

function parsePort(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) return null;
  return n;
}

function parseState(value: string | undefined): string | null {
  if (!value) return null;
  // opaque nonce minted by the CLI; keep it tight to avoid open-redirect abuse
  if (!/^[A-Za-z0-9._-]{8,128}$/.test(value)) return null;
  return value;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "70vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 18,
        fontFamily: MONO,
        padding: 24,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 10, color: "#52525B", letterSpacing: 2, textTransform: "uppercase" }}>
        burnlog · connect
      </div>
      {children}
    </div>
  );
}

export default async function CliAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ port?: string; state?: string }>;
}) {
  const sp = await searchParams;
  const port = parsePort(sp.port);
  const state = parseState(sp.state);

  if (port === null || state === null) {
    return (
      <Shell>
        <p style={{ color: "#F87171", maxWidth: 420 }}>
          Invalid or missing connection request. Run <code>burnlog login</code> from your terminal
          and follow the link it opens.
        </p>
        <a href="/" style={{ color: "#D97706" }}>
          ← back to burnlog
        </a>
      </Shell>
    );
  }

  const session = await auth();
  const user = session?.user as { id?: string; username?: string | null } | undefined;

  if (!user?.id) {
    const redirectTo = `/cli-auth?port=${port}&state=${encodeURIComponent(state)}`;
    return (
      <Shell>
        <p style={{ color: "#A1A1AA", maxWidth: 420 }}>
          Sign in with GitHub to connect the burnlog CLI / MCP on this machine.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo });
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
              fontFamily: MONO,
              fontSize: 13,
            }}
          >
            Sign in with GitHub
          </button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell>
      <CliAuthClient port={port} state={state} username={user.username ?? "your account"} />
    </Shell>
  );
}
