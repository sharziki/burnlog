import { auth, signIn } from "@/auth";
import { CliAuthClient } from "./CliAuthClient";

export const dynamic = "force-dynamic";

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
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-5 text-center">
      <p className="m-0 text-[13px] text-dim">burnlog · connect</p>
      <h1 className="m-0 mb-5 mt-3 font-display text-[40px] leading-[1.02] text-ink">
        Connect this machine
      </h1>
      {children}
    </main>
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
        <p className="m-0 text-[15px] leading-relaxed text-[#F28B82]">
          Invalid or missing connection request. Run <code className="font-mono">burnlog login</code> from your terminal
          and follow the link it opens.
        </p>
        <a href="/" className="mt-6 text-[14px] text-soft underline decoration-faint underline-offset-4 hover:text-ink">
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
        <p className="m-0 mb-8 text-[15px] leading-relaxed text-soft">
          Sign in with GitHub to connect the burnlog CLI / MCP on this machine.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo });
          }}
        >
          <button type="submit" className="btn btn-primary">
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
