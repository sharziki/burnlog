import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Pill button with a spinning conic border. Adapted from the CTA in 21st.dev
 * "Hero Section Dark" (kinfe123), recoloured to burnlog's flame.
 */
export function GlowButton({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <span className="relative inline-flex overflow-hidden rounded-full p-[1.5px]">
      <span
        aria-hidden
        className="absolute inset-[-1000%] animate-[spin_2.4s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#FDE68A_0%,#EA580C_50%,#FDE68A_100%)] motion-reduce:animate-none"
      />
      <button
        {...props}
        className={cn(
          "relative inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-bg/95 px-7 py-3.5 font-mono text-sm font-semibold text-ink backdrop-blur-3xl transition-colors",
          "bg-linear-to-tr from-amber/5 via-flame/20 to-transparent hover:via-flame/30 disabled:cursor-wait",
          className,
        )}
      >
        {children}
      </button>
    </span>
  );
}
