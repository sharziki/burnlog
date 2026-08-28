import { NextRequest } from "next/server";
import { handlers } from "@/auth";

/**
 * GitHub started returning RFC 9207's `iss` parameter on the OAuth callback,
 * and it breaks sign-in outright on this version of Auth.js.
 *
 * oauth4webapi checks `iss` against the authorization server's issuer:
 *
 *     if (iss && iss !== as.issuer) throw ... 'unexpected "iss" ...'
 *
 * but for a plain OAuth2 provider Auth.js never has a real issuer to compare
 * against — it fills in a placeholder (`issuer: provider.issuer ?? "https://authjs.dev"`,
 * still marked TODO in @auth/core 0.41.x, including the latest 5.0.0-beta.32).
 * So the moment GitHub began sending `iss`, every callback threw
 * CallbackRouteError and every visitor landed on /auth/error?error=Configuration.
 *
 * Dropping the parameter restores exactly the behaviour that worked before
 * GitHub's change: `as.authorization_response_iss_parameter_supported` is unset
 * for GitHub, so with no `iss` present oauth4webapi performs no issuer check at
 * all. Nothing else about the exchange changes — PKCE is still verified, and the
 * code is still redeemed against GitHub over TLS.
 *
 * `iss` exists to stop mix-up attacks, where a malicious authorization server
 * replays a code issued by a different one. That attack needs two providers to
 * confuse; burnlog has exactly one, so there is nothing to mix up. If a second
 * provider is ever added, delete this and set a real `issuer` on each provider
 * instead — then the check does real work and must be kept.
 */
function stripIssuerParam(req: NextRequest): NextRequest {
  const url = new URL(req.url);
  if (!url.searchParams.has("iss")) return req;
  url.searchParams.delete("iss");
  // Callbacks are GETs with no body, so rebuilding on the URL alone is safe.
  return new NextRequest(url, {
    method: req.method,
    headers: req.headers,
  });
}

export async function GET(req: NextRequest) {
  return handlers.GET(stripIssuerParam(req));
}

export const POST = handlers.POST;
