"use client";

import { useEffect, useState } from "react";
import { useMe } from "@/hooks/useMe";
import type { BoardRow } from "@/components/Leaderboard";

export type Standing = { place: number | null; weekPlace: number | null; total: number; row?: BoardRow };

// One request per page, shared by the board's pinned row and the "you're #N" line.
let pending: Promise<Standing | null> | null = null;

export function useStanding(): Standing | null {
  const me = useMe();
  const [s, setS] = useState<Standing | null>(null);
  useEffect(() => {
    if (!me) return;
    pending ??= fetch("/api/me/standing", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    let live = true;
    pending.then((v) => live && setS(v));
    return () => {
      live = false;
    };
  }, [me]);
  return s;
}
