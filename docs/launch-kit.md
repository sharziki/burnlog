# Launch kit

Drafts for the off-site half. On-site SEO is done and shipped; rankings now
depend on links and mentions, and every one of these has to come from you —
a post from an account with no history reads as spam and gets removed, which
is worse than not posting.

Order matters. Search Console first (nothing else compounds until Google can
see the site), then the places that link, then the directories.

---

## 0. Do these first — 15 minutes, no writing

1. **Google Search Console** — https://search.google.com/search-console
   Add `burnlog.net`, verify by DNS TXT in Cloudflare, submit `sitemap.xml`,
   then URL-inspect `/` and request indexing. Until this happens burnlog.net
   is invisible to Google no matter what else is done.
2. **Bing Webmaster Tools** — https://www.bing.com/webmasters
   Import from Search Console in one click. IndexNow already submits URLs, but
   the dashboard is where you see whether they were accepted.
3. **`www.burnlog.net` doesn't resolve.** Add a CNAME `www` →
   `cname.vercel-dns.com` in Cloudflare, add the domain in Vercel, redirect to
   the apex. Anyone typing www currently gets a DNS error, and any inbound
   www link is dead weight.
4. **Publish the CLI** so `npx @sxnalabs/burnlog` is at least the version the
   site tells people to run. The npm page itself is a link to burnlog.net.

---

## 1. GitHub repo — the highest-value link you control

The README now links burnlog.net from the first line and links every tool and
comparison page. Two more things worth doing in the repo settings:

- **About → Website**: `https://burnlog.net`
- **Topics**: `claude-code`, `codex`, `cursor`, `token-usage`, `leaderboard`,
  `ai-agents`, `llm`, `developer-tools`, `cli`

Then, in the repo's own README, the badge — it is the single best growth loop
here, because every user who adds it links back:

```markdown
[![burnlog](https://burnlog.net/badge/YOUR_USERNAME)](https://burnlog.net/u/YOUR_USERNAME)
```

Put that line in front of people on every surface below. A badge in a hundred
READMEs is worth more than any one launch post.

---

## 2. Show HN

Post Tue–Thu, 8–10am ET. Title has to be plain — HN punishes marketing voice.

**Title:**

```
Show HN: Burnlog – a public leaderboard for AI coding token usage
```

**Body:**

```
I kept wondering whether I was using Claude Code more or less than everyone
else, and there was no way to find out. So I built the leaderboard.

burnlog counts tokens two ways. For agents that write a usage log — Claude
Code, Codex, Hermes — it reads the log. For everything else it runs the
command under a small loopback proxy that sets the standard base-URL env vars
(ANTHROPIC_BASE_URL, OPENAI_BASE_URL, and so on) and reads the usage field off
the response. That second path is deliberately not a MITM proxy: no local CA,
nothing decrypted, 14 providers covered. It's also why agents that keep no
readable log still count.

It uploads token counts, the model name, which agent, an opaque dedupe id, and
a timestamp. Not prompts, not code, not file paths, not repo names — there are
no columns for them. The CLI is MIT so you can check that rather than trust it.

Two things I got wrong and had to fix, in case they're useful: OpenAI reports
cached tokens *inside* prompt_tokens, so adding them double-counts cache reads
at the full input price, and Anthropic splits usage across two SSE events where
the second is a total rather than a delta. Both made early numbers wrong in
ways that looked plausible.

npx @sxnalabs/burnlog scans and shows your numbers before it asks for an
account. https://burnlog.net
```

Then stay in the thread for the first three hours. Answers beat upvotes.

---

## 3. Reddit

Rules first: most of these subs remove self-promotion from accounts that only
show up to promote. Comment elsewhere for a few days first, and lead with the
technical thing rather than the product.

**r/ClaudeAI** — "I counted every token Claude Code has ever burned on my
machine. Here's what the logs actually contain." Walk through the JSONL
structure, the four usage buckets, why cache reads make flat-rate cost
estimates wrong by multiples. Mention burnlog once, at the end.

**r/ChatGPTCoding** — same shape, Codex angle: `~/.codex/sessions`, and the
cached-tokens-inside-prompt_tokens trap.

**r/LocalLLaMA** — the proxy is the story here: counting usage across 14
providers including Ollama without a local CA. This crowd will actually read
`cli/src/providers.ts`, so link it.

**r/SideProject, r/webdev** — build-story framing, lower stakes.

---

## 4. Product Hunt

**Tagline (60 chars max):**

```
The public leaderboard for AI coding token usage
```

**Description:**

```
burnlog counts every token your AI coding agents burn — Claude Code, Codex,
Cursor, Gemini CLI, aider, your own scripts — and ranks you against everyone
else plugged in. Eleven ranks from Spark to Boltzmann, achievements earned from
real usage, and a README badge that updates itself.

It stores token counts and nothing else: no prompts, no code, no file names, no
repo names. The CLI is MIT-licensed and the whole app self-hosts.

One command: npx @sxnalabs/burnlog
```

Ship on a Tuesday or Wednesday. Have the first comment ready explaining the
proxy, since that's the part people ask about.

---

## 5. Directories and lists

Each is a link, and several rank for the category terms themselves:

- **awesome-claude-code** and similar awesome lists — PR the entry under tools
- **AlternativeTo** — list burnlog as an alternative to ccusage and viberank
- **npm** — done via package.json `homepage`
- **dev.to / Hashnode** — cross-post the Reddit technical write-up, canonical
  back to burnlog.net
- **Claude Code Discord / community Slacks** — where the badge spreads fastest

---

## 6. The name problem, and what to do about it

**burnlog.io is a different company** — AI usage analytics for engineering
teams — and it currently ranks for "Burnlog". Ranking #1 for the bare word
means outranking an established .io on its own name, which is a long fight
over brand signals: mentions, links, and people searching "burnlog leaderboard"
by name.

The realistic targets, in order of winnability:

1. `burnlog leaderboard`, `burnlog cli` — brand + qualifier, winnable fast
2. `ccusage alternative`, `viberank alternative` — the /vs/ pages already aim here
3. `track claude code token usage`, `claude code usage tracker` — the /tools/
   pages aim here; this is the valuable middle
4. `AI token leaderboard` — the head term, and a year-long fight

Every launch post above should use the word "burnlog" next to "leaderboard",
because that pairing is what teaches Google the two belong together.

---

## 7. What to watch

- Search Console: Coverage (are the 17 URLs indexed), then Queries
- `npm run seo:indexnow` after any deploy that adds public URLs
- The leaderboard itself: every new burner is a new indexable profile, so
  signups and SEO compound in the same direction
