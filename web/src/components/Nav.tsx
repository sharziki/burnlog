import { auth, signIn } from "@/auth";
import { NotificationBell } from "./NotificationBell";
import { Logo } from "./Logo";
import { NavLinks } from "./NavLinks";

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

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
        // Three equal columns rather than flex: it centres the links against
        // the *header*, not against whatever width the logo and account
        // controls happen to leave over.
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        borderBottom: "1px solid #18181B",
        position: "relative",
        // The header creates a stacking context, so anything it contains —
        // notably the notification dropdown — is confined to this z-index no
        // matter how high its own is. The page content also sits at 1 and
        // comes later in the DOM, so at parity it painted over the dropdown.
        // Lift the whole header above the content instead.
        zIndex: 50,
      }}
    >
      <a href="/" style={{ textDecoration: "none", justifySelf: "start" }}>
        <Logo size={32} />
      </a>

      <NavLinks />

      {user?.username ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifySelf: "end" }}>
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
          style={{ justifySelf: "end" }}
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
