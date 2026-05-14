import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function notFoundHtml(pathname: string): string {
  const escapedPath = pathname
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>404 · burnlog</title>
    <meta name="robots" content="noindex" />
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        background: #09090b;
        color: #e4e4e7;
        font-family: Inter, system-ui, -apple-system, sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      .card {
        width: min(520px, 100%);
        background: #0c0c0e;
        border: 1px solid #18181b;
        border-radius: 14px;
        padding: 32px 28px;
        box-shadow: 0 24px 80px rgba(0,0,0,0.35);
      }
      .eyebrow {
        font-size: 11px;
        letter-spacing: 1.8px;
        text-transform: uppercase;
        color: #71717a;
        font-family: "IBM Plex Mono", ui-monospace, monospace;
        margin-bottom: 14px;
      }
      .code {
        font-size: 58px;
        line-height: 1;
        font-weight: 800;
        color: #18181b;
        font-family: "IBM Plex Mono", ui-monospace, monospace;
        margin-bottom: 12px;
      }
      h1 {
        margin: 0 0 10px;
        font-size: 20px;
      }
      p {
        margin: 0 0 14px;
        color: #a1a1aa;
        line-height: 1.7;
        font-size: 14px;
      }
      .path {
        margin: 12px 0 22px;
        padding: 10px 12px;
        border-radius: 10px;
        background: #09090b;
        border: 1px solid #18181b;
        color: #71717a;
        font-family: "IBM Plex Mono", ui-monospace, monospace;
        font-size: 11px;
        word-break: break-all;
      }
      a {
        display: inline-block;
        text-decoration: none;
        color: #09090b;
        background: #d97706;
        border: 1px solid #d97706;
        border-radius: 8px;
        padding: 11px 14px;
        font-size: 12px;
        font-weight: 700;
        font-family: "IBM Plex Mono", ui-monospace, monospace;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="eyebrow">burnlog · not found</div>
      <div class="code">404</div>
      <h1>This page does not exist.</h1>
      <p>The requested burnlog profile or matchup could not be resolved.</p>
      <div class="path">${escapedPath}</div>
      <a href="/">Back to burnlog</a>
    </main>
  </body>
</html>`;
}

async function isKnownPage(request: NextRequest): Promise<boolean | null> {
  const pathname = request.nextUrl.pathname;

  let probeUrl: URL | null = null;
  if (pathname.startsWith("/u/")) {
    const username = pathname.slice(3);
    if (!username) return false;
    probeUrl = new URL(`/api/page-check?kind=profile&username=${encodeURIComponent(username)}`, request.url);
  } else if (pathname.startsWith("/h2h/")) {
    const matchup = pathname.slice(5);
    if (!matchup) return false;
    probeUrl = new URL(`/api/page-check?kind=matchup&matchup=${encodeURIComponent(matchup)}`, request.url);
  }

  if (!probeUrl) return null;

  try {
    const probe = await fetch(probeUrl, {
      headers: { "x-burnlog-page-check": "1" },
      cache: "no-store",
    });
    if (probe.status === 200) return true;
    if (probe.status === 404) return false;
    return null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  if (!["GET", "HEAD"].includes(request.method)) {
    return NextResponse.next();
  }

  const accept = request.headers.get("accept") ?? "";
  if (request.method === "GET" && !accept.includes("text/html")) {
    return NextResponse.next();
  }

  const known = await isKnownPage(request);
  if (known === false) {
    if (request.method === "HEAD") {
      return new NextResponse(null, { status: 404 });
    }

    return new NextResponse(notFoundHtml(request.nextUrl.pathname), {
      status: 404,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate",
        "x-robots-tag": "noindex",
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/u/:path*", "/h2h/:path*"],
};
