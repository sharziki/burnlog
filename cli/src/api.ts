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

export type AuthCheckResult =
  | { ok: true; rank: RankResponse }
  | {
      ok: false;
      kind: "invalid_key" | "rate_limited" | "api_error" | "unreachable";
      message: string;
      status?: number;
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
  const result = await fetchRankChecked(apiUrl, apiKey);
  return result.ok ? result.rank : null;
}

export async function fetchRankChecked(
  apiUrl: string,
  apiKey: string,
): Promise<AuthCheckResult> {
  try {
    const res = await fetch(`${apiUrl}/api/me/rank`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });

    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      const body =
        typeof data === "object" && data !== null
          ? (data as { error?: unknown; message?: unknown })
          : {};
      const code = typeof body.error === "string" ? body.error : undefined;
      const message =
        typeof body.message === "string"
          ? body.message
          : text.trim() || `request failed with ${res.status}`;

      if (code === "invalid_key" || res.status === 401) {
        return { ok: false, kind: "invalid_key", message, status: res.status };
      }
      if (code === "rate_limited" || res.status === 429) {
        return { ok: false, kind: "rate_limited", message, status: res.status };
      }
      return { ok: false, kind: "api_error", message, status: res.status };
    }

    return { ok: true, rank: data as RankResponse };
  } catch (error) {
    return {
      ok: false,
      kind: "unreachable",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
