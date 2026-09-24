"use client";

import { useEffect, useRef, useState } from "react";
import { formatTokens } from "@/lib/format";

/**
 * Counts a token total up to `value` on mount. Same behaviour as 21st.dev "Number Ticker"
 * (danielpetho) without pulling in an animation library: one rAF loop,
 * ease-out, and the final number is what's server-rendered so there's no flash
 * of zero for crawlers or slow devices.
 */
export function NumberTicker({
  value,
  duration = 1400,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min((t - t0) / duration, 1);
      setShown(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className={className}>{formatTokens(shown)}</span>;
}
