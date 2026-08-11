import { auth, signIn } from "@/auth";
import { NotificationBell } from "./NotificationBell";
import { Logo } from "./Logo";

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

const NAV_LINKS: [string, string][] = [
  ["/", "leaderboard"],
  ["/challenges", "challenges"],
  ["/teams", "teams"],
];

export async function Nav() {
  const session = await auth();
  const user = session?.user as
    | { username?: string; image?: string }
    | undefined;

  return (
    <header
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "32px 24px 24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: "1px solid #18181B",
        position: "relative",
        zIndex: 1,
      }}
    >
      <a href="/" style={{ textDecoration: "none" }}>
        <Logo size={32} />
      </a>

      <nav style={{ display: "flex", gap: 4, marginLeft: 28, marginRight: "auto" }} className="nav-links">
        {NAV_LINKS.map(([href, label]) => (
          <a
            key={href}
            href={href}
            style={{
              fontFamily: MONO,
              fontSize: 11,
              color: "#71717A",
              padding: "8px 10px",
              borderRadius: 6,
              textDecoration: "none",
            }}
          >
            {label}
          </a>
        ))}
      </nav>

      {user?.username ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <NotificationBell />
          <a
            href={`/u/${user.username}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 11,
              color: "#E4E4E7",
              padding: "8px 12px",
              border: "1px solid #18181B",
              borderRadius: 6,
              fontFamily: MONO,
              textDecoration: "none",
            }}
          >
            {user.image && (
              <img
                src={user.image}
                alt=""
                width={22}
                height={22}
                style={{ borderRadius: "50%" }}
              />
            )}
            @{user.username}
          </a>
        </div>
      ) : (
        <form
          action={async () => {
            "use server";
            await signIn("github");
          }}
        >
          <button
            type="submit"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 11,
              color: "#D97706",
              padding: "8px 12px",
              border: "1px solid #18181B",
              borderRadius: 6,
              fontFamily: MONO,
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Sign in
          </button>
        </form>
      )}
    </header>
  );
}
