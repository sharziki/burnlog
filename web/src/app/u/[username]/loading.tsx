import { Skeleton } from "@/components/ui/skeleton";

/** The profile's own shape while it loads. */
export default function ProfileLoading() {
  return (
    <main className="mx-auto max-w-5xl px-5 pb-24 pt-10 sm:px-8 sm:pt-14" role="status" aria-label="Loading profile">
      <div className="flex items-start gap-5">
        <Skeleton className="size-14 shrink-0 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="mt-3 h-3.5 w-1/2" />
          <Skeleton className="mt-3 h-3.5 w-4/5" />
        </div>
      </div>
      <Skeleton className="mt-8 h-10 w-44 rounded-lg" />
      <div className="mt-8 grid grid-cols-2 gap-8 border-y border-line py-8">
        {[0, 1].map((i) => (
          <div key={i}>
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-12 w-36 max-w-full" />
          </div>
        ))}
      </div>
    </main>
  );
}
