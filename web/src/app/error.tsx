"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-md px-5 py-24 text-center sm:py-32">
      <h1 className="m-0 font-display text-[40px] leading-[1.05] text-ink">Oops</h1>
      <p className="m-0 mt-4 text-[15px] leading-relaxed text-soft">Something went wrong loading this page.</p>
      {error.digest && <p className="m-0 mt-3 font-mono text-[12px] text-faint">error id: {error.digest}</p>}
      <button type="button" onClick={reset} className="btn mt-8">
        Try again
      </button>
    </main>
  );
}
