#!/usr/bin/env node
/**
 * Spike test against a deployed burnlog.
 *
 *   node scripts/loadcheck.mjs                          # https://burnlog.net
 *   node scripts/loadcheck.mjs http://localhost:3000 40
 *
 * This exists because a build, a typecheck and a smoke test all pass on a site
 * that falls over the moment two people arrive at once. The leaderboard fan-out
 * was seven queries per visitor against a Postgres across the public internet:
 * one request took 0.5s, thirty concurrent took 2.6s at the median, and nothing
 * in CI had an opinion about it. Caching the board fixed it, and this is the
 * measurement that proved both halves.
 *
 * What it is not: a benchmark. It is a shape check. A healthy result is FLAT —
 * the median at high concurrency close to the median at low. A result that
 * climbs with load means every visitor is doing work that should have been done
 * once, and the failure past the edge of this test is not slowness but the
 * connection ceiling.
 *
 * Run it before a launch, after anything that touches a query, and after
 * anything that touches caching.
 */
const BASE = (process.argv[2] ?? "https://burnlog.net").replace(/\/$/, "");
const PEAK = Number(process.argv[3] ?? 100);

// The paths a spike actually lands on. /agent is here because a launch post
// links straight to it, so it eats the same wave the home page does.
const PATHS = ["/", "/agent", "/api/leaderboard"];

const ms = (t) => `${(t / 1000).toFixed(2)}s`;

async function timed(path) {
  const t0 = performance.now();
  try {
    const res = await fetch(BASE + path, { headers: { "user-agent": "burnlog-loadcheck/1" } });
    await res.arrayBuffer();
    return { ok: res.status === 200, status: res.status, t: performance.now() - t0 };
  } catch (err) {
    return { ok: false, status: String(err.message ?? err), t: performance.now() - t0 };
  }
}

async function burst(path, n) {
  const rs = await Promise.all(Array.from({ length: n }, () => timed(path)));
  const times = rs.map((r) => r.t).sort((a, b) => a - b);
  const bad = rs.filter((r) => !r.ok);
  return {
    n,
    median: times[Math.floor(times.length / 2)],
    p95: times[Math.max(0, Math.ceil(times.length * 0.95) - 1)],
    max: times[times.length - 1],
    bad,
  };
}

let failed = false;

for (const path of PATHS) {
  // Warm first. A cold serverless instance is a real cost but it is not the
  // thing being measured, and letting it into the baseline hides the slope.
  await timed(path);

  const low = await burst(path, 5);
  const high = await burst(path, PEAK);
  // Ratio against the low-concurrency median is the whole signal: under 2x is
  // flat enough to survive a front page, past 3x means per-visitor work.
  const slope = high.median / low.median;

  const errs = [...low.bad, ...high.bad];
  // A slope only means something if the endpoint is also slow. Doubling a 90ms
  // response is still 180ms, and flagging it trains you to ignore the tool —
  // which is how a real 8x slope on a real endpoint gets scrolled past.
  const fast = high.median < 400;
  const verdict = errs.length
    ? "FAIL errors"
    : slope > 3 && !fast
      ? "FAIL slope"
      : slope > 2 && !fast
        ? "WARN"
        : "ok";
  if (verdict.startsWith("FAIL")) failed = true;

  console.log(
    `${verdict.padEnd(12)} ${path.padEnd(18)} ` +
      `${low.n}x median ${ms(low.median)}  →  ${high.n}x median ${ms(high.median)} ` +
      `p95 ${ms(high.p95)} max ${ms(high.max)}  slope ${slope.toFixed(2)}x` +
      (errs.length ? `  ${errs.length} non-200` : ""),
  );
  for (const e of errs.slice(0, 3)) console.log(`             ↳ ${e.status}`);
}

console.log(failed ? "\n  not ready — see above" : "\n  flat under load");
process.exit(failed ? 1 : 0);
