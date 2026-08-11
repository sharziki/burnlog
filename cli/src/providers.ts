import type { BurnEvent } from "./adapters/types.js";

/**
 * The provider registry powering `burnlog wrap`.
 *
 * We deliberately do NOT run a CONNECT/MITM proxy. Intercepting HTTPS would
 * mean generating and trusting a local CA — a big ask for a leaderboard, and
 * a real security footgun. Instead we exploit the fact that every major SDK
 * and agent CLI honours a base-URL environment variable: point those at our
 * local server, forward the request upstream over ordinary HTTPS, and read
 * the token counts out of the response on the way back.
 *
 * Consequence: bytes are relayed untouched, no certificates are involved, and
 * the request body never leaves this process. We parse usage fields only.
 */

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  model?: string;
};

export type Provider = {
  /** Registry id, also the URL prefix: http://127.0.0.1:PORT/<id>/… */
  id: string;
  label: string;
  /** Upstream origin requests are forwarded to. */
  upstream: string;
  /** Env vars set to the local prefix so clients route through us. */
  envVars: string[];
  /** How the burn event is bucketed on the leaderboard. */
  bucket: BurnEvent["provider"];
  /** Pull usage out of a parsed non-streaming JSON response. */
  parse(body: unknown): Usage | null;
  /**
   * Pull usage out of an SSE stream. Receives every `data:` payload already
   * JSON-parsed, in order, and folds them into one usage total.
   */
  parseStream?(events: unknown[]): Usage | null;
};

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

/** OpenAI-compatible: `usage.prompt_tokens` / `usage.completion_tokens`. */
function parseOpenAiShape(body: unknown): Usage | null {
  const root = obj(body);
  const usage = obj(root?.usage);
  if (!usage) return null;

  // The Responses API uses input_tokens/output_tokens; Chat Completions uses
  // prompt_tokens/completion_tokens. Accept either.
  const input = num(usage.prompt_tokens) || num(usage.input_tokens);
  const output = num(usage.completion_tokens) || num(usage.output_tokens);
  const cachedIn =
    num(obj(usage.prompt_tokens_details)?.cached_tokens) ||
    num(obj(usage.input_tokens_details)?.cached_tokens);

  if (input + output + cachedIn === 0) return null;
  return {
    // Cached prompt tokens are reported *inside* prompt_tokens, so subtract
    // them out to avoid double counting against the cache-read bucket.
    inputTokens: Math.max(0, input - cachedIn),
    outputTokens: output,
    cacheCreationTokens: 0,
    cacheReadTokens: cachedIn,
    model: typeof root?.model === "string" ? root.model : undefined,
  };
}

function parseOpenAiStream(events: unknown[]): Usage | null {
  // With stream_options:{include_usage:true} the final chunk carries usage.
  for (let i = events.length - 1; i >= 0; i--) {
    const parsed = parseOpenAiShape(events[i]);
    if (parsed) return parsed;
  }
  return null;
}

const openAiCompatible = (
  id: string,
  label: string,
  upstream: string,
  envVars: string[],
  bucket: BurnEvent["provider"] = "other",
): Provider => ({
  id,
  label,
  upstream,
  envVars,
  bucket,
  parse: parseOpenAiShape,
  parseStream: parseOpenAiStream,
});

export const PROVIDERS: Provider[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    upstream: "https://api.anthropic.com",
    envVars: ["ANTHROPIC_BASE_URL"],
    bucket: "anthropic",
    parse(body) {
      const root = obj(body);
      const usage = obj(root?.usage);
      if (!usage) return null;
      const u = {
        inputTokens: num(usage.input_tokens),
        outputTokens: num(usage.output_tokens),
        cacheCreationTokens: num(usage.cache_creation_input_tokens),
        cacheReadTokens: num(usage.cache_read_input_tokens),
        model: typeof root?.model === "string" ? root.model : undefined,
      };
      return u.inputTokens + u.outputTokens + u.cacheCreationTokens + u.cacheReadTokens > 0
        ? u
        : null;
    },
    parseStream(events) {
      // Anthropic splits usage: message_start carries the input side,
      // message_delta carries the final output count.
      const acc: Usage = {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      };
      for (const e of events) {
        const ev = obj(e);
        if (!ev) continue;
        if (ev.type === "message_start") {
          const msg = obj(ev.message);
          const usage = obj(msg?.usage);
          if (usage) {
            acc.inputTokens += num(usage.input_tokens);
            acc.cacheCreationTokens += num(usage.cache_creation_input_tokens);
            acc.cacheReadTokens += num(usage.cache_read_input_tokens);
            acc.outputTokens += num(usage.output_tokens);
          }
          if (typeof msg?.model === "string") acc.model = msg.model;
        } else if (ev.type === "message_delta") {
          const usage = obj(ev.usage);
          if (usage) {
            // message_delta reports the running output total, not a delta.
            acc.outputTokens = Math.max(acc.outputTokens, num(usage.output_tokens));
          }
        }
      }
      const total =
        acc.inputTokens + acc.outputTokens + acc.cacheCreationTokens + acc.cacheReadTokens;
      return total > 0 ? acc : null;
    },
  },
  {
    id: "openai",
    label: "OpenAI",
    upstream: "https://api.openai.com",
    envVars: ["OPENAI_BASE_URL", "OPENAI_API_BASE"],
    bucket: "openai",
    parse: parseOpenAiShape,
    parseStream: parseOpenAiStream,
  },
  {
    id: "google",
    label: "Google Gemini",
    upstream: "https://generativelanguage.googleapis.com",
    envVars: ["GOOGLE_GEMINI_BASE_URL", "GEMINI_BASE_URL"],
    bucket: "google",
    parse(body) {
      const root = obj(body);
      const meta = obj(root?.usageMetadata);
      if (!meta) return null;
      const cached = num(meta.cachedContentTokenCount);
      const prompt = num(meta.promptTokenCount);
      const out = num(meta.candidatesTokenCount) + num(meta.thoughtsTokenCount);
      if (prompt + out + cached === 0) return null;
      return {
        inputTokens: Math.max(0, prompt - cached),
        outputTokens: out,
        cacheCreationTokens: 0,
        cacheReadTokens: cached,
        model: typeof root?.modelVersion === "string" ? root.modelVersion : undefined,
      };
    },
    parseStream(events) {
      // Every Gemini chunk repeats cumulative usageMetadata — take the last.
      for (let i = events.length - 1; i >= 0; i--) {
        const parsed = this.parse(events[i]);
        if (parsed) return parsed;
      }
      return null;
    },
  },
  {
    id: "mistral",
    label: "Mistral",
    upstream: "https://api.mistral.ai",
    envVars: ["MISTRAL_BASE_URL"],
    bucket: "other",
    parse: parseOpenAiShape,
    parseStream: parseOpenAiStream,
  },
  {
    id: "cohere",
    label: "Cohere",
    upstream: "https://api.cohere.com",
    envVars: ["CO_API_URL", "COHERE_BASE_URL"],
    bucket: "other",
    parse(body) {
      const root = obj(body);
      const tokens = obj(obj(root?.meta)?.tokens) ?? obj(obj(root?.usage)?.tokens);
      if (!tokens) return parseOpenAiShape(body);
      const input = num(tokens.input_tokens);
      const output = num(tokens.output_tokens);
      if (input + output === 0) return null;
      return { inputTokens: input, outputTokens: output, cacheCreationTokens: 0, cacheReadTokens: 0 };
    },
  },
  openAiCompatible("openrouter", "OpenRouter", "https://openrouter.ai/api", ["OPENROUTER_BASE_URL"]),
  openAiCompatible("groq", "Groq", "https://api.groq.com/openai", ["GROQ_BASE_URL"]),
  openAiCompatible("xai", "xAI", "https://api.x.ai", ["XAI_BASE_URL"]),
  openAiCompatible("deepseek", "DeepSeek", "https://api.deepseek.com", ["DEEPSEEK_BASE_URL"]),
  openAiCompatible("together", "Together", "https://api.together.xyz", ["TOGETHER_BASE_URL"]),
  openAiCompatible("fireworks", "Fireworks", "https://api.fireworks.ai/inference", [
    "FIREWORKS_BASE_URL",
  ]),
  openAiCompatible("perplexity", "Perplexity", "https://api.perplexity.ai", ["PERPLEXITY_BASE_URL"]),
  openAiCompatible("cerebras", "Cerebras", "https://api.cerebras.ai", ["CEREBRAS_BASE_URL"]),
  {
    id: "ollama",
    label: "Ollama (local)",
    upstream: process.env.BURNLOG_OLLAMA_UPSTREAM ?? "http://127.0.0.1:11434",
    envVars: ["OLLAMA_HOST"],
    bucket: "other",
    parse(body) {
      const root = obj(body);
      if (!root) return null;
      // Native Ollama shape; the /v1 endpoints use the OpenAI shape instead.
      const input = num(root.prompt_eval_count);
      const output = num(root.eval_count);
      if (input + output === 0) return parseOpenAiShape(body);
      return {
        inputTokens: input,
        outputTokens: output,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        model: typeof root.model === "string" ? root.model : undefined,
      };
    },
  },
];

export const PROVIDER_BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

/** Env vars pointing every known client at the local proxy. */
export function proxyEnv(baseUrl: string, only?: string[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const p of PROVIDERS) {
    if (only && only.length && !only.includes(p.id)) continue;
    for (const key of p.envVars) {
      // Ollama's client expects a bare host, not a path-prefixed URL.
      env[key] = p.id === "ollama" ? `${baseUrl}/${p.id}` : `${baseUrl}/${p.id}`;
    }
  }
  return env;
}
