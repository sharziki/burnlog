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
      "burnlog counts Cursor usage straight from Cursor's own usage records, including the models on your subscription — with the login already on your machine, and without sending it anywhere but cursor.com.",
    verdict:
      "Counted exactly, subscription included. burnlog reads Cursor's own usage records — the same ones on your Cursor dashboard — using the Cursor login already on your machine.",
    method: "log",
    steps: [
      {
        name: "Paste the prompt into your agent",
        text: "Copy the setup prompt from burnlog.net and paste it into any coding agent. It installs the CLI, shows you your numbers first, and asks before anything is uploaded.",
      },
      {
        name: "Or run it yourself",
        text: "burnlog finds every agent on the machine, reads its usage, and offers GitHub sign-in.",
        code: "npx @sxnalabs/burnlog",
      },
      {
        name: "Keep it current",
        text: "Installs a hook so future sessions sync themselves.",
        code: "burnlog install",
      },
    ],
    sections: [
      {
        heading: "Where the numbers come from",
        body: [
          "Cursor's included models run on Cursor's servers, so the token accounting was never on your disk. It is on Cursor's usage dashboard, per request: model, input, output, cache reads and writes. That is the only honest source for those tokens, so it is the one burnlog reads.",
          "The CLI takes the login Cursor already stored on your machine, asks cursor.com for your usage events, and turns each one into a count. The login is sent only to cursor.com. burnlog never stores it, logs it, or uploads it — only the token counts go to burnlog.",
        ],
      },
      {
        heading: "Your own API key works too",
        body: [
          "If you point Cursor at your own provider key, those calls show up in Cursor's usage records as well. For anything outside Cursor on your own key, burnlog wrap counts at the wire across 14 providers without installing a certificate or decrypting anything.",
        ],
      },
    ],
    limits: [
      "Cursor has to be signed in on the machine that syncs. If its saved login has expired, open Cursor once and sync again.",
      "Team seats report personal usage; usage attributed only to a team may not appear.",
    ],
  },
  {
    slug: "gemini-cli",
    name: "Gemini CLI",
    title: "Track Gemini CLI token usage",
    description:
      "Gemini CLI saves every chat with its token counts under ~/.gemini. burnlog reads them — history included — and puts you on the board.",
    verdict:
      "Counted from disk, history included. Gemini CLI records tokens for every turn in its saved chats; burnlog reads those and nothing else.",
    method: "log",
    steps: [
      {
        name: "Paste the prompt into your agent",
        text: "Copy the setup prompt from burnlog.net and paste it into any coding agent. It installs the CLI, shows you your numbers first, and asks before anything is uploaded.",
      },
      {
        name: "Or run it yourself",
        text: "burnlog finds every agent on the machine, reads its usage, and offers GitHub sign-in.",
        code: "npx @sxnalabs/burnlog",
      },
      {
        name: "Keep it current",
        text: "Installs a hook so future sessions sync themselves.",
        code: "burnlog install",
      },
    ],
    sections: [
      {
        heading: "What burnlog reads",
        body: [
          "Gemini CLI stores each session under ~/.gemini/tmp (or $GEMINI_CLI_HOME) with a usage block per model turn: input, output, cached and thinking tokens. burnlog takes the counts and the model name. The conversation itself is never read into the upload.",
          "Cached input is split out from fresh input, and thinking tokens count as output, so a Gemini number means the same thing as a Claude or Codex one on the board.",
        ],
      },
    ],
    limits: [
      "Sessions only count if Gemini CLI saved them. Chats cleared with Gemini's own cleanup are gone before burnlog can see them.",
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
      "opencode writes a usage record for every assistant message to disk. burnlog reads those — any provider, history included.",
    verdict:
      "Counted from disk, any provider, history included. opencode records tokens for every assistant message; burnlog reads them.",
    method: "log",
    steps: [
      {
        name: "Paste the prompt into your agent",
        text: "Copy the setup prompt from burnlog.net and paste it into any coding agent. It installs the CLI, shows you your numbers first, and asks before anything is uploaded.",
      },
      {
        name: "Or run it yourself",
        text: "burnlog finds every agent on the machine, reads its usage, and offers GitHub sign-in.",
        code: "npx @sxnalabs/burnlog",
      },
      {
        name: "Keep it current",
        text: "Installs a hook so future sessions sync themselves.",
        code: "burnlog install",
      },
    ],
    sections: [
      {
        heading: "What burnlog reads",
        body: [
          "opencode keeps one JSON file per message under ~/.local/share/opencode/storage. Assistant messages carry input, output, reasoning and cache counts, plus the model and provider. burnlog reads those fields and skips the message text.",
          "Because opencode records the provider itself, a Claude, GPT or local model run through opencode is attributed correctly on your profile.",
        ],
      },
    ],
    limits: [
      "Messages from before opencode started recording tokens have nothing to count.",
    ],
  },
];

export function getTool(slug: string): ToolPage | undefined {
  return TOOLS.find((t) => t.slug === slug);
}
