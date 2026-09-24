"use client";

import { useEffect, useState } from "react";

export type Me = { username: string; name: string | null; image: string | null };

// One request per page load, shared by every component that asks. Pages stay
// static and cacheable; who's looking is worked out in the browser.
let pending: Promise<Me | null> | null = null;

function loadMe(): Promise<Me | null> {
  pending ??= fetch("/api/auth/session", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((s: { user?: { username?: string; name?: string | null; image?: string | null } } | null) =>
      s?.user?.username ? { username: s.user.username, name: s.user.name ?? null, image: s.user.image ?? null } : null,
    )
    .catch(() => null);
  return pending;
}

/** undefined while loading, null when signed out. */
export function useMe(): Me | null | undefined {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    loadMe().then((m) => live && setMe(m));
    return () => {
      live = false;
    };
  }, []);
  return me;
}
