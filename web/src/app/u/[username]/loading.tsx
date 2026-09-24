import { Skeleton } from "@/components/ui/skeleton";

/** The profile's own shape while it loads: who, the numbers, the card. */
export default function ProfileLoading() {
  return (
    <main className="mx-auto max-w-3xl px-5 pb-28 pt-14 sm:px-8 sm:pt-20" role="status" aria-label="Loading profile">
      <div className="flex items-start gap-5">
        <Skeleton className="size-16 shrink-0 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="mt-3 h-3.5 w-1/2" />
          <Skeleton className="mt-3 h-3.5 w-4/5" />
        </div>
      </div>
      <div className="mt-12 grid grid-cols-2 gap-8 border-t border-line pt-8 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-7 w-24" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-12 aspect-[1200/630] w-full rounded-xl" />
    </main>
  );
}
