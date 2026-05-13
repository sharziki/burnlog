import { auth } from "@/auth";
import { NotificationBell } from "./NotificationBell";

const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = '"Instrument Sans", system-ui, -apple-system, sans-serif';

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
      <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="32" height="32" rx="6" fill="url(#burnGrad)" />
          <path
            d="M16 6c0 0-5.5 5-5.5 10.5C10.5 20.09 12.91 23 16 23s5.5-2.91 5.5-6.5C21.5 11 16 6 16 6z"
            fill="#09090B"
            opacity="0.85"
          />
          <path
            d="M16 12c0 0-3 3-3 6 0 1.66 1.34 3 3 3s3-1.34 3-3c0-3-3-6-3-6z"
            fill="#D97706"
          />
          <path
            d="M16 16c0 0-1.5 1.5-1.5 3 0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5c0-1.5-1.5-3-1.5-3z"
            fill="#FCD34D"
          />
          <defs>
            <linearGradient id="burnGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
              <stop stopColor="#D97706" />
              <stop offset="1" stopColor="#92400E" />
            </linearGradient>
          </defs>
        </svg>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#FAFAFA", letterSpacing: -0.5, fontFamily: SANS }}>
            burnlog
          </div>
          <div
            style={{
              fontSize: 10,
              color: "#52525B",
              letterSpacing: 2,
              textTransform: "uppercase",
              marginTop: 2,
              fontFamily: MONO,
            }}
          >
            token burn tracker
          </div>
        </div>
      </a>

      {user?.username ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <NotificationBell />
          <a
            href="/settings"
            style={{
              fontSize: 11,
              color: "#D97706",
              padding: "8px 12px",
              border: "1px solid #18181B",
              borderRadius: 6,
              fontFamily: MONO,
              textDecoration: "none",
            }}
          >
            Settings
          </a>
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
        <a
          href="/login"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            color: "#09090B",
            padding: "9px 13px",
            border: "1px solid #D97706",
            borderRadius: 8,
            fontFamily: MONO,
            background: "#D97706",
            cursor: "pointer",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Sign in with GitHub
        </a>
      )}
    </header>
  );
}
