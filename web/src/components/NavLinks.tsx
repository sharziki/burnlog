"use client";

import { usePathname } from "next/navigation";

const MONO = 'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

const NAV_LINKS: [string, string][] = [
  ["/", "leaderboard"],
  ["/agent", "setup"],
];

/**
 * Nav links with the current section marked.
 *
 * Split into a client component purely because knowing the active route needs
 * `usePathname`; the surrounding header stays a server component so the
 * session lookup isn't pushed to the client.
 */
export function NavLinks() {
  const pathname = usePathname() ?? "/";

  return (
    <nav style={{ display: "flex", gap: 4, justifySelf: "center" }} className="nav-links">
      {NAV_LINKS.map(([href, label]) => {
        // "/" would prefix-match everything, so it has to match exactly;
        // everything else marks its whole subtree.
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <a
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            style={{
              position: "relative",
              fontFamily: MONO,
              fontSize: 11,
              color: active ? "#FAFAFA" : "#71717A",
              background: active ? "#131316" : "transparent",
              padding: "8px 10px",
              borderRadius: 6,
              textDecoration: "none",
            }}
          >
            {label}
            {active && (
              // An underline as well as the colour shift — colour alone is a
              // weak signal on a dark UI, and it isn't accessible on its own.
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: 10,
                  right: 10,
                  bottom: 2,
                  height: 1.5,
                  borderRadius: 1,
                  background: "#D97706",
                }}
              />
            )}
          </a>
        );
      })}
    </nav>
  );
}
