import type { BurnEvent } from "./adapters/index.js";

export type IngestResponse = {
  ok: boolean;
  inserted: number;
  skipped: number;
  user?: string;
  error?: string;
};

export type RankResponse = {
  ok: boolean;
  username: string;
  rank: string;
  rankIcon: string;
  totalTokens: number;
  position: number;
  totalUsers: number;
};

export type ClubBudget = {
  id: string;
  name: string;
  slug: string;
  monthlyTokens: number;
  monthlyBudgetTokens: number;
  monthlyBudgetUsedPct: number;
  budgetStatus: "unset" | "ok" | "warning" | "over";
};

export type ClubsResponse = {
  ok: boolean;
  username: string | null;
  clubs: ClubBudget[];
  error?: string;
};

export async function ingest(
  apiUrl: string,
  apiKey: string,
  events: BurnEvent[],
): Promise<IngestResponse> {
  const res = await fetch(`${apiUrl}/api/ingest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ events }),
  });
  const text = await res.text();
  let data: IngestResponse;
  try {
    data = JSON.parse(text) as IngestResponse;
  } catch {
    throw new Error(`ingest failed: ${res.status} ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(data.error ?? `ingest failed: ${res.status}`);
  return data;
}

export async function fetchRank(
  apiUrl: string,
  apiKey: string,
): Promise<RankResponse | null> {
  try {
    const res = await fetch(`${apiUrl}/api/me/rank`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as RankResponse;
  } catch {
    return null;
  }
}

export async function fetchClubs(apiUrl: string, apiKey: string): Promise<ClubsResponse> {
  const res = await fetch(`${apiUrl}/api/me/clubs`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const text = await res.text();
  let data: ClubsResponse;
  try {
    data = JSON.parse(text) as ClubsResponse;
  } catch {
    throw new Error(`clubs failed: ${res.status} ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(data.error ?? `clubs failed: ${res.status}`);
  return data;
}

export async function fetchClubReport(
  apiUrl: string,
  apiKey: string,
  clubId: string,
  opts: { from?: string; to?: string } = {},
): Promise<string> {
  const params = new URLSearchParams();
  if (opts.from) params.set("from", opts.from);
  if (opts.to) params.set("to", opts.to);
  const query = params.toString();
  const res = await fetch(`${apiUrl}/api/clubs/${clubId}/report${query ? `?${query}` : ""}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`report failed: ${res.status} ${text.slice(0, 200)}`);
  return text;
}

export type RedeemResult =
  | { ok: true; key: string; username: string }
  | { ok: false; error: "invalid_code" | "expired_code" | "rate_limited" | "failed"; status: number; detail?: string };

/** Trade a one-time setup code (from burnlog.net) for an api key. */
export async function redeemConnectCode(apiUrl: string, code: string, label?: string): Promise<RedeemResult> {
  const res = await fetch(`${apiUrl}/api/connect/redeem`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(label ? { code, label } : { code }),
  });
  const text = await res.text();
  let data: { key?: string; username?: string; error?: string } = {};
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    // non-JSON body (proxy error page); fall through on status
  }
  if (res.ok && data.key && data.username) return { ok: true, key: data.key, username: data.username };
  if (res.status === 410 || data.error === "expired_code") return { ok: false, error: "expired_code", status: res.status };
  if (res.status === 429) return { ok: false, error: "rate_limited", status: res.status };
  if (res.status === 400 || data.error === "invalid_code") return { ok: false, error: "invalid_code", status: res.status };
  return { ok: false, error: "failed", status: res.status, detail: data.error };
}
