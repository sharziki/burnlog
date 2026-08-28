/**
 * The questions people actually type before they install something like this.
 *
 * One source for both the rendered section and the FAQPage schema — markup that
 * disagrees with the page it describes is the fastest way to get structured
 * data ignored, and keeping two copies in sync by hand is how that happens.
 *
 * Answers are plain text on purpose: schema.org wants text, and anything that
 * needs a link belongs in the surrounding page, not in an answer.
 */
export const FAQ: { q: string; a: string }[] = [
  {
    q: "Does burnlog see my prompts or my code?",
    a: "No. burnlog stores token counts, the model name, which agent produced them, an opaque dedupe id, and a timestamp. Prompts, completions, file names, file contents, repo names, working directories, and session ids are not part of the schema, so there is nothing to leak. The CLI is MIT-licensed, so you can read exactly what it sends before you run it.",
  },
  {
    q: "Which AI coding agents does it track?",
    a: "Claude Code, Codex, and opencode are read straight from their local session logs. Everything else is covered by burnlog wrap, which counts any command that talks to Anthropic, OpenAI, Google, Mistral, Cohere, OpenRouter, Groq, xAI, DeepSeek, Together, Fireworks, Perplexity, Cerebras, or Ollama over their standard base URLs — including agents that keep no readable log at all.",
  },
  {
    q: "How does burnlog count tokens?",
    a: "Two ways. It reads the usage numbers your agent already wrote to disk, and it reads the usage field off API responses for anything you run under burnlog wrap. The ranked number is input + output + cache writes; cache reads are stored and priced but not ranked, because every agent turn re-reads the whole cached prompt and counting that made the board a measure of session length rather than work. Cached tokens are handled honestly: OpenAI reports cached reads inside prompt_tokens, so they are subtracted before bucketing, and Anthropic splits usage across two streaming events, so both are collected before an event is counted.",
  },
  {
    q: "Is burnlog free?",
    a: "Yes. The leaderboard, ranks, achievements, and the README badge are free, the CLI is open source under the MIT license, and the whole app is self-hostable against your own Postgres. No card, no trial.",
  },
  {
    q: "How do I get on the leaderboard?",
    a: "Run npx @sxnalabs/burnlog. It finds your agents, shows you your numbers before asking for an account, signs you in with GitHub, syncs, and installs a hook so it keeps counting. Sixty seconds, no config file.",
  },
  {
    q: "What are the ranks?",
    a: "Eleven, on a logarithmic ladder: Spark, Ember, Blaze, Inferno, Supernova, Quasar, Singularity, Event Horizon, Heat Death, Vacuum Decay, and Boltzmann. Spark starts at zero and Boltzmann starts at ten trillion tokens, which nobody has reached. Your rank is derived from total tokens burned, so it updates itself on every sync and travels with you onto your profile page and your README badge.",
  },
  {
    q: "Can I put my rank on my GitHub README?",
    a: "Yes. Every account gets an SVG badge that updates itself, plus a dependency-free widget under 4KB for a portfolio or docs site. Profile links also unfurl into generated preview cards on X, Slack, Discord, and iMessage.",
  },
  {
    q: "Does burnlog work with a team?",
    a: "The public board ranks individuals today. Shared boards, budgets, and per-service API keys are built and running on a staging deployment while their UX is settled, so they are coming back to burnlog.net rather than being planned.",
  },
];
