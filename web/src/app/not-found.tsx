export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-5 py-24 text-center sm:py-32">
      <p className="m-0 font-mono text-[13px] text-dim">404</p>
      <h1 className="m-0 mt-3 font-display text-[40px] leading-[1.05] text-ink">
        Page not found
      </h1>
      <p className="m-0 mt-4 text-[15px] leading-relaxed text-soft">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <a href="/" className="btn mt-8">
        Back to leaderboard
      </a>
    </main>
  );
}
