import { cn } from "@/lib/utils";

/** A quiet placeholder block. Pulses unless the visitor prefers reduced motion. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block animate-pulse rounded-md bg-ink/[0.06] motion-reduce:animate-none", className)} />;
}
