/**
 * Per-tool pages: "how do I track token usage in <agent>".
 *
 * These exist because that is the shape of the query people actually type, and
 * a single landing page can't answer it for nine agents at once.
 *
 * Every claim here is checked against `cli/src/adapters/` and
 * `cli/src/providers.ts`. Where burnlog genuinely can't see something — Cursor
 * on its own subscription is the big one — the page says so. A tracker that
 * overpromises gets uninstalled the first time someone compares its number to
 * their real bill, and "here is exactly what we cannot see" is the single most
 * credible thing a usage tracker can publish.
 */
export type ToolPage = {
  slug: string;
  /** Product name as its makers write it. */
  name: string;
  /** <title>. Kept under ~60 chars. */
  title: string;
  description: string;
  /** One-line answer, above the fold. */
  verdict: string;
  /** How burnlog gets the numbers. */
  method: "log" | "wrap";
  /** The steps a reader follows, in order. Rendered and marked up as HowTo. */
  steps: { name: string; text: string; code?: string }[];
  /** Prose sections, in order. */
  sections: { heading: string; body: string[] }[];
  /** Stated plainly, because the alternative is being found out. */
  limits: string[];
};

const SINK_NOTE =
  "Anything that writes to ~/.burnlog/events/*.jsonl is picked up on the next sync, in any language, without waiting for a burnlog release. That open sink is how a tool burnlog has never heard of still lands on the board.";

export const TOOLS: ToolPage[] = [
  {
    slug: "claude-code",
    name: "Claude Code",
    title: "Track Claude Code token usage",
    description:
      "Count every token Claude Code burns, straight from its own session logs, and rank it on a public leaderboard. No API key, no proxy, no prompts leaving your machine.",
    verdict:
      "Read directly from the session logs Claude Code already writes. Nothing to configure, and it works retroactively on history you've already accumulated.",
    method: "log",
    steps: [
      {
        name: "Run burnlog",
        text: "It finds ~/.claude/projects, reads the JSONL session logs already on disk, and shows you your total before it asks for anything.",
        code: "npx @sxnalabs/burnlog",
      },
      {
        name: "Sign in with GitHub",
        text: "Only once you've seen your own numbers. Signing in is what puts them on the public board under your handle.",
      },
      {
        name: "Let the hook keep it current",
        text: "burnlog installs a session-end hook, so every future Claude Code session syncs itself. There is nothing to remember to run.",
      },
    ],
    sections: [
      {
        heading: "Where the numbers come from",
        body: [
          "Claude Code writes one JSONL line per assistant message into ~/.claude/projects/<project>/<session>.jsonl, and each of those lines carries a usage object. burnlog reads the four buckets Anthropic reports separately — input, output, cache creation, and cache read — and keeps them separate all the way to the leaderboard.",
          "That separation is the whole reason a cost estimate can be trusted. Cache reads are an order of magnitude cheaper than fresh input tokens, so a tracker that adds the buckets together and multiplies by one flat rate will overstate a cache-heavy account severalfold. burnlog prices each bucket at its own rate.",
          "Because it reads files that already exist, your first run counts history you accumulated before you had ever heard of burnlog.",
        ],
      },
      {
        heading: "What leaves your machine",
        body: [
          "Token counts, the model name, the fact that the source was Claude Code, an opaque dedupe id, and a timestamp. That is the whole payload.",
          "The prompts, the completions, the file names, the file contents, the repo name, the working directory, and the session id are all read past and never uploaded — there is no column for any of them in the schema. The CLI is MIT-licensed, so this is checkable rather than promised.",
        ],
      },
    ],
    limits: [
      "Claude Code has to have written the session to disk. A session still open in another terminal syncs when it ends, not mid-flight.",
      "If you've cleared ~/.claude/projects, those tokens are gone for everyone, burnlog included.",
    ],
  },
  {
    slug: "codex",
    name: "Codex",
    title: "Track Codex CLI token usage",
    description:
      "Count every token OpenAI's Codex CLI burns by reading its own rollout logs, then rank it against every other burner. Tokens only — never prompts or code.",
    verdict:
      "Read directly from ~/.codex/sessions. Like Claude Code, it needs no key and no proxy, and it counts the history you already have.",
    method: "log",
    steps: [
      {
        name: "Run burnlog",
        text: "It walks ~/.codex/sessions/**/*.jsonl, reads the usage each rollout recorded, and prints your total.",
        code: "npx @sxnalabs/burnlog",
      },
      {
        name: "Sign in and sync",
        text: "GitHub sign-in puts the total on the board. The same run uploads it.",
      },
    ],
    sections: [
      {
        heading: "Getting the cached tokens right",
        body: [
          "OpenAI reports cached tokens inside prompt_tokens, not beside it: the cached count is a subset of the number you already have. Add the two and you have counted your cache reads twice, at the full input price.",
          "burnlog subtracts before bucketing, which is not a detail — on a long Codex session, cache reads routinely outweigh fresh input, and double counting them is the difference between an estimate you can quote and a number that just looks impressive.",
        ],
      },
      {
        heading: "Codex and Claude Code together",
        body: [
          "Most people run both. burnlog reads both in the same pass, tags each event with the agent that produced it, and shows the split on your profile, so 'which agent am I actually burning through' stops being a guess.",
          SINK_NOTE,
        ],
      },
    ],
    limits: [
      "Codex has to be the local CLI writing rollout files. Usage spent inside a hosted Codex surface never touches your disk, so nothing local can see it.",
    ],
  },
  {
    slug: "cursor",
    name: "Cursor",
    title: "Track Cursor token usage",
    description:
      "What a local tracker can and can't see in Cursor, and how burnlog counts the part it can — honestly, including the case where the answer is that it can't.",
    verdict:
      "Depends entirely on whose key you're spending. Your own API key, counted exactly. Cursor's included subscription, not countable by anything on your machine — and any tracker claiming otherwise is guessing.",
    method: "wrap",
    steps: [
      {
        name: "Point Cursor at your own API key",
        text: "In Cursor's settings, supply your own provider key and override the base URL. This is the mode where the requests leave your machine on a path you control.",
      },
      {
        name: "Start the burnlog proxy",
        text: "wrap runs a loopback server, sets the standard base-URL variables at it, forwards upstream over ordinary HTTPS, and reads the usage field off each response.",
        code: "burnlog wrap -- <your command>",
      },
      {
        name: "Sync",
        text: "Events land in ~/.burnlog/events first, so counting keeps working with no network and no account, and upload when you next sync.",
      },
    ],
    sections: [
      {
        heading: "Why the subscription case is impossible, for everyone",
        body: [
          "When you use Cursor's included models, Cursor's servers call the provider with Cursor's key. Your machine sends a request to Cursor and gets an answer back; the token accounting happens somewhere you have no access to. No local tool can count those tokens, because the numbers were never on your computer to begin with.",
          "Cursor's own dashboard is the only honest source for that spend. If a tracker shows you a confident Cursor number while you're on the subscription, it is inferring it — usually by counting characters and dividing — and that estimate will not match your bill.",
          "burnlog would rather show you nothing than show you a number it made up.",
        ],
      },
      {
        heading: "The part that does work",
        body: [
          "Run Cursor against your own key and every call becomes countable, exactly, from the provider's own usage field — the same number the provider will bill you for. That covers 14 providers: Anthropic, OpenAI, Google, Mistral, Cohere, OpenRouter, Groq, xAI, DeepSeek, Together, Fireworks, Perplexity, Cerebras, and Ollama.",
          "wrap is deliberately not a man-in-the-middle proxy. It installs no certificate authority and decrypts nothing — it sets the base-URL environment variables the SDKs already read and forwards over normal HTTPS. Nothing about your machine's trust store changes.",
        ],
      },
    ],
    limits: [
      "Cursor's included subscription models cannot be counted locally, by burnlog or by anything else.",
      "Tab completions billed as part of the subscription fall in the same category.",
    ],
  },
  {
    slug: "gemini-cli",
    name: "Gemini CLI",
    title: "Track Gemini CLI token usage",
    description:
      "Google's Gemini CLI keeps no usage log burnlog can read, so burnlog counts it at the wire instead — exactly, from Google's own usage field.",
    verdict:
      "Counted through burnlog wrap. One prefix on the command you were going to run anyway, and every call is measured from the response Google sends back.",
    method: "wrap",
    steps: [
      {
        name: "Prefix the command",
        text: "wrap sets GOOGLE_GEMINI_BASE_URL and GEMINI_BASE_URL at a loopback server for the lifetime of that command, and unsets them after.",
        code: "burnlog wrap -- gemini",
      },
      {
        name: "Work normally",
        text: "Requests forward to Google over ordinary HTTPS. The usage field on each response is read on the way back, then bucketed by model.",
      },
      {
        name: "Sync when you're done",
        text: "Events are written to the local sink as they happen, so an offline session still counts and uploads later.",
        code: "burnlog sync",
      },
    ],
    sections: [
      {
        heading: "Why there's no log to read",
        body: [
          "Some agents write their usage to a readable file, and burnlog reads it. Gemini CLI does not, which leaves exactly two options: guess, or measure the traffic. burnlog measures.",
          "The measurement is the provider's own accounting, not an estimate — the same usage object Google computes the bill from. A tokenizer-based approximation would be wrong in both directions and would drift with every model revision.",
        ],
      },
      {
        heading: "It's the same mechanism for everything else",
        body: [
          "wrap is agent-agnostic: aider, opencode, a Python script, a cron job, a homegrown agent. If it reads the standard base-URL variables — and virtually every SDK does — its tokens can be counted without that tool knowing burnlog exists.",
          SINK_NOTE,
        ],
      },
    ],
    limits: [
      "A command has to be started under wrap. Something already running keeps its old environment, so it isn't counted until it's restarted.",
      "Gemini usage spent inside Google's web UI never passes through your machine.",
    ],
  },
  {
    slug: "aider",
    name: "aider",
    title: "Track aider token usage",
    description:
      "aider spends your own API keys, which makes it the easiest case: burnlog counts every call exactly, across whichever provider you point it at.",
    verdict:
      "Counted through burnlog wrap, on whichever provider aider is configured against — including two providers in the same session.",
    method: "wrap",
    steps: [
      {
        name: "Run aider under wrap",
        text: "Every provider variable aider might read is pointed at the loopback server at once, so it doesn't matter which one it picks.",
        code: "burnlog wrap -- aider",
      },
      {
        name: "Check the numbers",
        text: "Your own burn over the last six months, split by model — a read, so it reports without uploading anything.",
        code: "burnlog me",
      },
    ],
    sections: [
      {
        heading: "Multi-provider sessions count correctly",
        body: [
          "aider is commonly run with a strong model for edits and a cheap one for everything else, sometimes across two providers at once. wrap sets every supported base URL simultaneously, so both sides are counted, each priced at its own model's rate.",
          "Anthropic streaming needs particular care: usage arrives split across two events, with input on message_start and the output total — not a delta — on message_delta. Reading only one of them undercounts every streamed response, which is most of them.",
        ],
      },
      {
        heading: "What you get for it",
        body: [
          "A rank on the public board, a rank ladder from Spark to Supernova, achievements earned from real usage, and a README badge that updates itself.",
          "It's free, the CLI is MIT-licensed, and the whole app self-hosts against your own Postgres if you'd rather keep the board private.",
        ],
      },
    ],
    limits: [
      "Only calls made under wrap are counted; aider run bare is invisible until the next wrapped session.",
    ],
  },
  {
    slug: "opencode",
    name: "opencode",
    title: "Track opencode token usage",
    description:
      "opencode runs on your own API keys, so burnlog counts it at the wire — exactly, from each provider's own usage field, with no adapter needed.",
    verdict:
      "Counted through burnlog wrap. No adapter, no waiting for burnlog to add support for the model you switched to this morning.",
    method: "wrap",
    steps: [
      {
        name: "Run it under wrap",
        text: "The proxy covers 14 providers at once, so a mid-session model switch stays counted.",
        code: "burnlog wrap -- opencode",
      },
      {
        name: "Sync and check your rank",
        text: "sync uploads; status prints where you landed on the board.",
        code: "burnlog sync && burnlog status",
      },
    ],
    sections: [
      {
        heading: "Why the proxy beats an adapter here",
        body: [
          "A log-reading adapter has to be written per tool, and it breaks whenever that tool changes its format. The wire does not change: providers keep reporting usage in the same field because their own billing depends on it.",
          "So burnlog reads logs where a stable format exists — Claude Code, Codex, Hermes — and reads the wire for everything else. New agent, new model, new provider endpoint: still counted, still without a release.",
        ],
      },
      {
        heading: "Or skip both",
        body: [
          SINK_NOTE,
          "That is a documented file format, not an internal detail: append a line, run burnlog sync, and it's on the board.",
        ],
      },
    ],
    limits: [
      "Only wrapped commands are counted.",
      "Local models through Ollama are counted for tokens, and priced at zero — because they cost you hardware and electricity, not API dollars.",
    ],
  },
];

export function getTool(slug: string): ToolPage | undefined {
  return TOOLS.find((t) => t.slug === slug);
}
