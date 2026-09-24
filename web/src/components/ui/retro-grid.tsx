import { cn } from "@/lib/utils";

/** Perspective grid scrolling toward the viewer. Adapted from 21st.dev "Hero Section Dark" (kinfe123). */
export function RetroGrid({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden [perspective:220px] opacity-40", className)}
    >
      <div className="absolute inset-0 [transform:rotateX(65deg)]">
        <div className="animate-grid [background-image:linear-gradient(to_right,rgba(245,158,11,0.28)_1px,transparent_0),linear-gradient(to_bottom,rgba(245,158,11,0.28)_1px,transparent_0)] [background-repeat:repeat] [background-size:56px_56px] [height:300vh] [inset:0%_0px] [margin-left:-200%] [transform-origin:100%_0_0] [width:600vw] motion-reduce:animate-none" />
      </div>
      <div className="absolute inset-0 bg-linear-to-t from-bg via-bg/80 to-transparent" />
    </div>
  );
}
