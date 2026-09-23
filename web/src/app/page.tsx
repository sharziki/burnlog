import type { Metadata } from "next";
import { getBoard } from "@/lib/stats";
import { auth, signIn } from "@/auth";
import { formatTokens } from "@/lib/format";
import { Board } from "@/components/Board";
import { CopyPrompt } from "@/components/CopyPrompt";

export const dynamic = "force-dynamic";

// Title and description come from the layout — this is the page they were
// written for. The canonical is the point: burnlog.net is reachable as three
// Vercel aliases, and without this every one of them is a duplicate of the home
// page competing with it.
export const metadata: Metadata = { alternates: { canonical: "/" } };

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

const ghost = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "13px 20px",
  background: "transparent",
  color: "#E4E4E7",
  border: "1px solid #27272A",
  borderRadius: 8,
  fontFamily: MONO,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
} as const;

/**
 * The whole product on one screen: what it is, the two things you do
 * (copy the prompt, sign in), and the board. Everything else is a profile.
 */
export default async function Home() {
  const [users, session] = await Promise.all([getBoard(), auth()]);
  const me = (session?.user as { username?: string } | undefined)?.username ?? null;

  const burners = users.filter((u) => u.totalTokens > 0);
  const total = burners.reduce((s, u) => s + u.totalTokens, 0);
  const week = burners.reduce((s, u) => s + u.weeklyTokens, 0);
  const place = me ? burners.findIndex((u) => u.username === me) + 1 : 0;
  const mine = place ? burners[place - 1] : null;

  async function signInAction() {
    "use server";
    await signIn("github");
  }

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "56px 16px 0" }}>
      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2.5, color: "#D97706", textTransform: "uppercase" }}>
        The leaderboard for AI token burn
      </div>
      <h1 style={{ fontSize: "clamp(38px, 7vw, 60px)", fontWeight: 800, letterSpacing: -2, lineHeight: 1.02, color: "#FAFAFA", margin: "14px 0 0" }}>
        See how hard you ship with AI.
      </h1>
      <p style={{ fontSize: 16, color: "#A1A1AA", lineHeight: 1.6, margin: "18px 0 0", maxWidth: 560 }}>
        Paste one prompt into Claude Code. It installs burnlog, signs you in with GitHub, and syncs your
        token counts. Then you&apos;re on the board, with a card to post.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 28 }}>
        <CopyPrompt />
        {me ? (
          <a href={`/u/${me}`} style={ghost}>
            Your card →
          </a>
        ) : (
          <form action={signInAction}>
            <button type="submit" style={ghost}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.38 7.86 10.9.58.1.79-.25.79-.56 0-.27-.01-1-.02-1.96-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.3-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11 11 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.06.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.41-5.26 5.69.41.36.78 1.06.78 2.15 0 1.55-.01 2.8-.01 3.18 0 .31.21.67.8.56A11.52 11.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
              </svg>
              Sign in with GitHub
            </button>
          </form>
        )}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: "#52525B", marginTop: 14, lineHeight: 1.7 }}>
        Codex, Cursor, Gemini or another agent?{" "}
        <a href="/agent" style={{ color: "#A1A1AA" }}>
          get its prompt
        </a>{" "}
        · or run <code style={{ color: "#A1A1AA" }}>npx @sxnalabs/burnlog</code> · token counts only, never prompts or
        code
      </div>

      {me && (
        <div
          style={{
            marginTop: 36,
            padding: "14px 18px",
            border: "1px solid #27272A",
            borderRadius: 10,
            fontFamily: MONO,
            fontSize: 12,
            color: "#A1A1AA",
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {mine ? (
            <span>
              You&apos;re <strong style={{ color: "#F59E0B" }}>#{place}</strong> of {burners.length} with{" "}
              <strong style={{ color: "#FAFAFA" }}>{formatTokens(mine.totalTokens)}</strong> tokens.
            </span>
          ) : (
            <span>You&apos;re signed in but haven&apos;t synced yet. Paste the prompt into Claude Code.</span>
          )}
          {mine && (
            <a href={`/u/${me}`} style={{ color: "#F59E0B", textDecoration: "none" }}>
              share your card →
            </a>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", margin: "44px 0 18px", fontFamily: MONO, fontSize: 12, color: "#71717A" }}>
        <span>
          <strong style={{ color: "#FAFAFA", fontSize: 18 }}>{formatTokens(total)}</strong> burned
        </span>
        <span>
          <strong style={{ color: "#FAFAFA", fontSize: 18 }}>{formatTokens(week)}</strong> this week
        </span>
        <span>
          <strong style={{ color: "#FAFAFA", fontSize: 18 }}>{burners.length}</strong> burners
        </span>
      </div>

      <Board users={users} me={me} />
    </main>
  );
}
