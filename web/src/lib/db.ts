import { PrismaClient } from "@prisma/client";

/**
 * Prisma client, and the connection pool the whole app's latency hangs on.
 *
 * Production Postgres runs on sxna-runtime-01 and is reached over the public
 * internet, so every query costs a real network round trip. `connection_limit=1`
 * is set in DATABASE_URL deliberately — one connection per serverless instance,
 * so a traffic spike can't exhaust Postgres's 100-connection ceiling.
 *
 * The cost of that was invisible until it wasn't. A pool of one means every
 * query in a request runs strictly one at a time, however they were written:
 * the profile page's `Promise.all` of four calls is really a queue, and
 * `getLeaderboard()` alone contributes six queries to it. Round trips that
 * should overlap instead add up, and under any concurrency they stop being slow
 * and start being fatal — the logs for a failed sign-in show eight queries
 * dying at once with "Timed out fetching a new connection from the connection
 * pool (timeout: 15, connection limit: 1)". That is also what the intermittent
 * "client-side exception" flashes were: a server component's query timing out
 * mid-navigation, the error boundary painting, then a retry succeeding.
 *
 * So the pool is widened here rather than in the secret, which keeps the URL
 * itself untouched and this reasoning next to the number. Five per instance
 * against a 100-connection ceiling still leaves room for twenty concurrent
 * instances, well past anything this traffic produces, and BURNLOG_DB_POOL
 * moves it without a redeploy of the secret if that ever stops being true.
 *
 * The real fix is a pooler (PgBouncer) in front of Postgres, which would make
 * the ceiling stop mattering. This is the change that doesn't need one.
 */
function tunedUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    const limit = process.env.BURNLOG_DB_POOL ?? "5";
    // Overwrite rather than default-if-absent: the value already in the URL is
    // the 1 being corrected, so a "don't clobber" guard would be a no-op.
    url.searchParams.set("connection_limit", limit);
    if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "20");
    return url.toString();
  } catch {
    // A URL Prisma can parse but WHATWG can't — hand it back untouched rather
    // than take the database down over a query-string tweak.
    return raw;
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const url = tunedUrl();
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(url ? { datasources: { db: { url } } } : {}),
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

// Cached in production too. A warm serverless instance re-evaluating this module
// used to build a second client — and a second pool — while the first one's
// connections were still open, which is the last thing a one-connection budget
// can afford.
globalForPrisma.prisma = prisma;
