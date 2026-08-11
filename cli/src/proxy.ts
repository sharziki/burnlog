import { createServer, type IncomingMessage, type ServerResponse, type Server } from "http";
import { randomUUID } from "crypto";
import { PROVIDER_BY_ID, type Provider, type Usage } from "./providers.js";
import type { BurnEvent } from "./adapters/types.js";
import { providerFromModel } from "./adapters/types.js";

/**
 * A local forwarding proxy that counts tokens.
 *
 * Requests arrive as http://127.0.0.1:PORT/<provider-id>/<upstream path>.
 * We stream them to the real provider and stream the response straight back,
 * while keeping a copy of the response body just long enough to read the
 * usage numbers out of it. Nothing about the request is inspected or stored.
 */

/** Stop buffering past this — a huge response isn't worth the memory. */
const MAX_BUFFER_BYTES = 8 * 1024 * 1024;

/** Hop-by-hop headers must not be forwarded (RFC 9110 §7.6.1). */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

export type ProxyOptions = {
  port?: number;
  /** Called for every request where usage could be read. */
  onEvent: (event: BurnEvent) => void;
  /** Called when a request fails to reach the provider. */
  onError?: (message: string) => void;
};

export type RunningProxy = {
  server: Server;
  port: number;
  baseUrl: string;
  close(): Promise<void>;
};

/** Split "/anthropic/v1/messages" into the provider and the upstream path. */
function route(url: string): { provider: Provider; path: string } | null {
  const match = /^\/([a-z0-9-]+)(\/.*)?$/i.exec(url);
  if (!match) return null;
  const provider = PROVIDER_BY_ID.get(match[1].toLowerCase());
  if (!provider) return null;
  return { provider, path: match[2] ?? "/" };
}

function forwardHeaders(req: IncomingMessage, upstreamHost: string): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (HOP_BY_HOP.has(key.toLowerCase())) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  headers.set("host", upstreamHost);
  return headers;
}

/** Pull the `data:` payloads out of an SSE body, JSON-parsed, in order. */
function sseEvents(text: string): unknown[] {
  const out: unknown[] = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      out.push(JSON.parse(payload));
    } catch {
      // Partial or non-JSON frame — nothing to count.
    }
  }
  return out;
}

function readUsage(provider: Provider, contentType: string, body: string): Usage | null {
  if (!body) return null;
  const streaming = contentType.includes("event-stream") || body.startsWith("data:");
  if (streaming) {
    const events = sseEvents(body);
    if (!events.length) return null;
    return provider.parseStream ? provider.parseStream(events) : null;
  }
  try {
    return provider.parse(JSON.parse(body));
  } catch {
    return null;
  }
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  opts: ProxyOptions,
): Promise<void> {
  const target = route(req.url ?? "/");
  if (!target) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unknown provider prefix — see `burnlog wrap --list`" }));
    return;
  }
  const { provider, path } = target;

  // Health probe so `wrap` can confirm the proxy is live before exec'ing.
  if (path === "/__burnlog_health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, provider: provider.id }));
    return;
  }

  const upstreamUrl = new URL(path, provider.upstream);
  // Preserve the upstream base path (e.g. openrouter's /api, groq's /openai).
  const basePath = new URL(provider.upstream).pathname.replace(/\/$/, "");
  if (basePath && !upstreamUrl.pathname.startsWith(basePath)) {
    upstreamUrl.pathname = basePath + upstreamUrl.pathname;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const requestBody = Buffer.concat(chunks);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers: forwardHeaders(req, upstreamUrl.host),
      body: requestBody.length ? requestBody : undefined,
      redirect: "manual",
    });
  } catch (err) {
    opts.onError?.(`${provider.id}: ${err instanceof Error ? err.message : String(err)}`);
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "burnlog proxy could not reach " + provider.label }));
    return;
  }

  const responseHeaders: Record<string, string> = {};
  upstream.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    responseHeaders[key] = value;
  });
  res.writeHead(upstream.status, responseHeaders);

  const contentType = upstream.headers.get("content-type") ?? "";
  let buffered = "";
  let overflowed = false;

  if (upstream.body) {
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // Relay first, always — counting must never delay the caller.
      res.write(value);
      if (!overflowed) {
        buffered += decoder.decode(value, { stream: true });
        if (buffered.length > MAX_BUFFER_BYTES) {
          overflowed = true;
          buffered = "";
        }
      }
    }
  }
  res.end();

  if (overflowed || !upstream.ok) return;

  const usage = readUsage(provider, contentType, buffered);
  if (!usage) return;

  const model = usage.model ?? modelFromRequest(requestBody) ?? provider.id;
  opts.onEvent({
    requestId: randomUUID(),
    source: "proxy",
    model,
    // Trust the model name when it's recognisable (a Claude model served via
    // OpenRouter is still Anthropic burn), else fall back to the endpoint.
    provider: pickBucket(provider, model),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheCreationTokens: usage.cacheCreationTokens,
    cacheReadTokens: usage.cacheReadTokens,
    timestamp: new Date().toISOString(),
  });
}

function pickBucket(provider: Provider, model: string): BurnEvent["provider"] {
  const fromModel = providerFromModel(model);
  return fromModel !== "other" ? fromModel : provider.bucket;
}

/**
 * The model name is the only field we read out of a request body, and only
 * when the response didn't name it. Nothing else is parsed or retained.
 */
function modelFromRequest(body: Buffer): string | undefined {
  if (!body.length || body.length > 4 * 1024 * 1024) return undefined;
  try {
    const parsed = JSON.parse(body.toString("utf8")) as { model?: unknown };
    return typeof parsed.model === "string" ? parsed.model : undefined;
  } catch {
    return undefined;
  }
}

export function startProxy(opts: ProxyOptions): Promise<RunningProxy> {
  const server = createServer((req, res) => {
    handle(req, res, opts).catch((err) => {
      opts.onError?.(err instanceof Error ? err.message : String(err));
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    // Loopback only — this proxy relays your API keys upstream and must never
    // be reachable from the network.
    server.listen(opts.port ?? 0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      resolve({
        server,
        port,
        baseUrl,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}
