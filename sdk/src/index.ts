export type Provider = "anthropic" | "openai" | "google" | "other";

export type TrackEvent = {
  /** Random opaque id, unique within your `source`. Used for dedup. */
  requestId: string;
  /** Model name as reported by the provider (e.g. "claude-opus-4-7"). */
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  /** Defaults to now if omitted. */
  timestamp?: Date | string;
  /** Override the instance-level source for this event. */
  source?: string;
};

export type BurnlogOptions = {
  /** Required. Generate one at /settings on your burnlog instance. */
  apiKey: string;
  /** A stable tag for where these events come from. e.g. "my-agent". 1-32 chars [a-z0-9-]. */
  source?: string;
  /** Base URL of the burnlog web app. Defaults to https://burnlog.net. */
  baseUrl?: string;
  /** Max events to batch before flushing. Default 100. */
  maxBatchSize?: number;
  /** Auto-flush interval in ms. Default 5000. */
  flushIntervalMs?: number;
  /** Log internal errors to stderr. Default false. */
  debug?: boolean;
  /** Custom fetch (e.g. for tests). Defaults to global fetch. */
  fetch?: typeof fetch;
};

export type BurnlogFromEnvOptions = Partial<BurnlogOptions>;

type QueuedEvent = {
  requestId: string;
  source: string;
  model: string;
  provider: Provider;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  timestamp: string;
};

export function providerFromModel(model: string): Provider {
  const m = model.toLowerCase();
  if (m.includes("claude")) return "anthropic";
  if (
    m.includes("gpt") ||
    m.includes("o1") ||
    m.includes("o3") ||
    m.includes("o4") ||
    m.startsWith("codex")
  ) {
    return "openai";
  }
  if (m.includes("gemini")) return "google";
  return "other";
}

const DEFAULT_BASE = "https://burnlog.net";
const DEFAULT_BATCH = 100;
const DEFAULT_FLUSH_MS = 5000;

function parseIntegerEnv(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

type TrackResponseOptions = { source?: string; requestId?: string; timestamp?: Date | string };

export class Burnlog {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly source: string;
  private readonly maxBatchSize: number;
  private readonly debug: boolean;
  private readonly fetchFn: typeof fetch;
  private queue: QueuedEvent[] = [];
  private inFlight: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  static fromEnv(opts: BurnlogFromEnvOptions = {}): Burnlog {
    const env = typeof process === "undefined" ? undefined : process.env;
    return new Burnlog({
      apiKey: opts.apiKey ?? env?.BURNLOG_API_KEY ?? "",
      source: opts.source ?? env?.BURNLOG_SOURCE ?? "custom",
      baseUrl: opts.baseUrl ?? env?.BURNLOG_API_URL ?? DEFAULT_BASE,
      maxBatchSize: opts.maxBatchSize ?? parseIntegerEnv(env?.BURNLOG_MAX_BATCH_SIZE) ?? DEFAULT_BATCH,
      flushIntervalMs: opts.flushIntervalMs ?? parseIntegerEnv(env?.BURNLOG_FLUSH_INTERVAL_MS) ?? DEFAULT_FLUSH_MS,
      debug: opts.debug ?? parseBooleanEnv(env?.BURNLOG_DEBUG) ?? false,
      fetch: opts.fetch,
    });
  }

  constructor(opts: BurnlogOptions) {
    if (!opts.apiKey) throw new Error("burnlog: apiKey is required");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    this.source = opts.source ?? "custom";
    this.maxBatchSize = Math.max(1, opts.maxBatchSize ?? DEFAULT_BATCH);
    this.debug = opts.debug ?? false;
    this.fetchFn = opts.fetch ?? globalThis.fetch;
    if (!this.fetchFn) {
      throw new Error("burnlog: global fetch is not available; pass opts.fetch");
    }

    const flushMs = opts.flushIntervalMs ?? DEFAULT_FLUSH_MS;
    if (flushMs > 0) {
      this.timer = setInterval(() => {
        void this.flush().catch((e) => this.log(e));
      }, flushMs);
      // Don't keep the event loop alive just for the flush timer.
      (this.timer as unknown as { unref?: () => void }).unref?.();
    }

    // Best-effort flush on process exit (node only).
    if (typeof process !== "undefined" && typeof process.once === "function") {
      const onExit = (): void => {
        void this.close().catch(() => {});
      };
      process.once("beforeExit", onExit);
    }
  }

  /** Enqueue a burn event. Never throws. */
  track(event: TrackEvent): void {
    if (this.closed) {
      this.log(new Error("burnlog: track() called after close()"));
      return;
    }
    try {
      const q = this.normalize(event);
      this.queue.push(q);
      if (this.queue.length >= this.maxBatchSize) {
        void this.flush().catch((e) => this.log(e));
      }
    } catch (e) {
      this.log(e);
    }
  }

  /** Convenience: extract usage from an Anthropic Messages response. */
  trackAnthropic(
    response: {
      id?: string;
      model?: string;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
      };
    },
    opts: { source?: string; requestId?: string; timestamp?: Date | string } = {},
  ): void {
    const u = response.usage;
    if (!response.id || !response.model || !u) return;
    this.track({
      requestId: opts.requestId ?? response.id,
      model: response.model,
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      timestamp: opts.timestamp,
      source: opts.source,
    });
  }

  /** Convenience: extract usage from an OpenAI Chat / Responses API object. */
  trackOpenAI(
    response: {
      id?: string;
      model?: string;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        prompt_tokens?: number;
        completion_tokens?: number;
        // Responses API cached tokens
        input_tokens_details?: { cached_tokens?: number };
      };
    },
    opts: { source?: string; requestId?: string; timestamp?: Date | string } = {},
  ): void {
    const u = response.usage;
    if (!response.id || !response.model || !u) return;
    const input = u.input_tokens ?? u.prompt_tokens ?? 0;
    const output = u.output_tokens ?? u.completion_tokens ?? 0;
    const cached = u.input_tokens_details?.cached_tokens ?? 0;
    this.track({
      requestId: opts.requestId ?? response.id,
      model: response.model,
      inputTokens: input,
      outputTokens: output,
      cacheCreationTokens: 0,
      cacheReadTokens: cached,
      timestamp: opts.timestamp,
      source: opts.source,
    });
  }

  /** Convenience: auto-detect common provider response shapes and track them. */
  trackResponse(
    response: {
      id?: string;
      model?: string;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        prompt_tokens?: number;
        completion_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
        input_tokens_details?: { cached_tokens?: number };
      };
    },
    opts: TrackResponseOptions = {},
  ): void {
    const usage = response?.usage;
    if (!response?.id || !response?.model || !usage) return;

    const hasOpenAIShape =
      usage.prompt_tokens != null ||
      usage.completion_tokens != null ||
      usage.input_tokens_details?.cached_tokens != null;

    if (hasOpenAIShape) {
      this.trackOpenAI(response, opts);
      return;
    }

    const input = usage.input_tokens ?? 0;
    const output = usage.output_tokens ?? 0;
    const cacheCreation = usage.cache_creation_input_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    if (input + output + cacheCreation + cacheRead === 0) return;

    this.track({
      requestId: opts.requestId ?? response.id,
      model: response.model,
      inputTokens: input,
      outputTokens: output,
      cacheCreationTokens: cacheCreation,
      cacheReadTokens: cacheRead,
      timestamp: opts.timestamp,
      source: opts.source,
    });
  }

  /** Force-flush all queued events. Resolves once the server has accepted them. */
  async flush(): Promise<void> {
    if (this.inFlight) await this.inFlight;
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.maxBatchSize);
    this.inFlight = this.send(batch).finally(() => {
      this.inFlight = null;
    });
    await this.inFlight;
    // If more events accumulated, drain.
    if (this.queue.length >= this.maxBatchSize || (this.closed && this.queue.length > 0)) {
      await this.flush();
    }
  }

  /** Stop the timer and flush remaining events. Safe to await in cleanup code. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    while (this.queue.length > 0) {
      await this.flush();
    }
  }

  private normalize(event: TrackEvent): QueuedEvent {
    if (!event.requestId) throw new Error("burnlog: track() requires requestId");
    if (!event.model) throw new Error("burnlog: track() requires model");
    const ts =
      event.timestamp == null
        ? new Date().toISOString()
        : event.timestamp instanceof Date
          ? event.timestamp.toISOString()
          : String(event.timestamp);
    return {
      requestId: event.requestId,
      source: event.source ?? this.source,
      model: event.model,
      provider: providerFromModel(event.model),
      inputTokens: Math.max(0, Math.floor(event.inputTokens ?? 0)),
      outputTokens: Math.max(0, Math.floor(event.outputTokens ?? 0)),
      cacheCreationTokens: Math.max(0, Math.floor(event.cacheCreationTokens ?? 0)),
      cacheReadTokens: Math.max(0, Math.floor(event.cacheReadTokens ?? 0)),
      timestamp: ts,
    };
  }

  private async send(events: QueuedEvent[]): Promise<void> {
    try {
      const res = await this.fetchFn(`${this.baseUrl}/api/ingest`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ events }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`burnlog: ingest failed ${res.status} ${text.slice(0, 200)}`);
      }
    } catch (e) {
      // Put them back at the front of the queue so we retry on next flush.
      this.queue.unshift(...events);
      throw e;
    }
  }

  private log(e: unknown): void {
    if (!this.debug) return;
    const msg = e instanceof Error ? e.message : String(e);
    if (typeof process !== "undefined" && process.stderr) {
      process.stderr.write(`[burnlog] ${msg}\n`);
    } else {
      // eslint-disable-next-line no-console
      console.error(`[burnlog] ${msg}`);
    }
  }
}

export default Burnlog;
