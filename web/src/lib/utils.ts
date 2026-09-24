import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach the merger burnlog's colour names; without them it can't tell `text-dim`
// (a colour) from `text-xs` (a size) and drops the wrong one.
const twMerge = extendTailwindMerge({
  extend: { theme: { color: ["bg", "surface", "line", "ink", "soft", "dim", "faint", "accent"] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
