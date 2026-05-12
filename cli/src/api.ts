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
