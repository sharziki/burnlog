import { NextResponse, type NextRequest } from "next/server";
import { isFullSurface } from "@/lib/surface";

/**
 * Surface gate for staged features.
 *
 * The pages call `requireFullSurface()` too, but a page-level `notFound()`
 * lands *after* the dynamic response has been committed, so the visitor gets
 * the 404 page under a 200. Catching it here — before rendering starts — is
 * what makes the status honest. Rewriting to a path with no route is the way
 * to reach the app's own not-found page with a real 404: middleware can't set
 * a status on a rewrite, but an unmatched path 404s on its own.
 *
 * `matcher` has to be a literal, so the staged prefixes are listed twice: once
 * here for the runtime check and once below for the matcher. Keep them in step.
 */
const STAGED = ["/challenges", "/companies", "/teams", "/c/", "/h2h/"];

export function middleware(req: NextRequest) {
  if (isFullSurface()) return NextResponse.next();

  const { pathname } = req.nextUrl;
  const staged = STAGED.some((p) =>
    p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!staged) return NextResponse.next();

  return NextResponse.rewrite(new URL("/_staged", req.url));
}

export const config = {
  matcher: ["/challenges/:path*", "/companies/:path*", "/teams/:path*", "/c/:path*", "/h2h/:path*"],
};
