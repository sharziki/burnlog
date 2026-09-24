import { Skeleton } from "@/components/ui/skeleton";

/** Shown while a page renders on the server. Shaped like a page, not a spinner. */
export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl px-5 pb-28 pt-14 sm:px-8 sm:pt-20" role="status" aria-label="Loading">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-5 h-11 w-4/5" />
      <Skeleton className="mt-3 h-11 w-3/5" />
      <div className="mt-10 space-y-3">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-11/12" />
        <Skeleton className="h-3.5 w-4/6" />
      </div>
    </main>
  );
}
