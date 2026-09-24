"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Radio-group segmented control with a sliding thumb. Ported from 21st.dev
 * "Segmented Control" (ddoemonn): same structure and keyboard model, but the
 * thumb is a CSS transform instead of a Motion spring, so it ships no
 * animation library.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const n = options.length;

  function go(i: number) {
    const next = (i + n) % n;
    refs.current[next]?.focus();
    onChange(options[next].value);
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("relative inline-grid rounded-lg border border-line p-[3px]", className)}
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute inset-y-[3px] left-[3px] rounded-md bg-ink/[0.09] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        style={{ width: `calc((100% - 6px) / ${n})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={i === index}
          tabIndex={i === index ? 0 : -1}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowDown") (e.preventDefault(), go(i + 1));
            if (e.key === "ArrowLeft" || e.key === "ArrowUp") (e.preventDefault(), go(i - 1));
          }}
          className={cn(
            "relative cursor-pointer rounded-md border-0 bg-transparent px-3 py-1 text-[13px] transition-colors",
            i === index ? "text-ink" : "text-dim hover:text-soft",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
