# burnlog · marketing

Remotion source for the launch films. Three cuts, seven files, one brand system.

| composition | size | seconds | for |
| --- | --- | --- | --- |
| `launch` | 1920×1080 | 21 | site, X, Show HN, Product Hunt |
| `launch-vertical` | 1080×1920 | 21 | Shorts, Reels, TikTok |
| `paste` | 1920×1080 | 16 | the launch post — the claim that gets replies |
| `paste-vertical` | 1080×1920 | 16 | Shorts, Reels, TikTok |
| `board` | 1920×1080 | 8 | silent loop, landscape |
| `board-square` | 1080×1080 | 8 | silent loop — the best ratio for a phone feed |
| `board-vertical` | 1080×1920 | 8 | silent loop, Stories |

```bash
npm run studio                                         # preview and scrub
npm run render -- paste out/burnlog-paste-1920x1080.mp4
npm run render -- board-square out/burnlog-board-1080x1080.mp4
```

## Which one to post

- **`paste`** is the launch video. It carries the one claim that is actually new
  — you don't install burnlog, your agent does — and ends on `burnlog.net/agent`.
- **`launch`** is the full story for a page or a Show HN comment, where someone
  has already chosen to spend twenty seconds.
- **`board`** is for the feed. No narration, no CTA, no cut: eight seconds of a
  number climbing a ladder, fading at both ends so the loop reads as a decision.
  The post carries the link.

## What the cuts are built on

Structure follows what the format actually rewards, not what is comfortable to
edit:

- **Open on the product, never the mark.** The launch film used to spend its
  first three seconds on the logo. A logo answers no question the viewer has
  yet, and those are the only seconds you are guaranteed. It was cut; the mark
  now appears on the end card, signing off work already seen.
- **One claim per film.** `paste` argues one thing. `launch` is the only cut
  allowed to be a tour, because it is the one people opt into.
- **Nothing holds for long.** Every beat is between 2.8 and 5.5 seconds. A
  single screen reads as far longer on a timeline than it does in an editor.
- **The payoff is front-loaded.** In `paste`, the aha ("your agent does it")
  is legible in the first second and the proof lands by the fifth.

Motion comes from `design/brand-system.json`, not from choices made here: one
motion verb ("rise"), a 500ms entrance on `cubic-bezier(.16,1,.3,1)`, near-black
ground, amber action, mono data. Fonts are the same woff2 files the site ships,
copied into `public/fonts`.

## What it is allowed to show

The brand system forbids **fake UI** and **fabricated usage**, which shapes
every frame:

- The terminal scene is real `burnlog` output, line for line.
- The prompt in `paste` is the one `/agent` actually serves, quoted to a
  sentence boundary.
- The scan in `paste` is a real `burnlog scan` on a real machine — 12,256
  Claude Code events, 563 Codex, 217 Hermes, 3.4B tokens.
- The ladder is the real eleven ranks, mirrored from `web/src/lib/ranks.ts`.
- There is no mocked-up leaderboard with invented users anywhere.

Two numbers are dated rather than timeless, on purpose:

- `board` shows the real top row of the live board on **2026-09-01** —
  `@sharziki`, 152.5B, Heat Death. A leaderboard demo needs a real person on
  it, and inventing one is precisely what the brand system rules out. Re-render
  when the number stops being true.
- The scan total in the launch film's terminal scene (`3.5M tokens across 2
  sources`) is a plausible first run, not a claim about anyone's account. Keep
  it that way: quoting live global totals would date the film every time the
  board moves.

## No audio

Every one of these is silent by design. The feeds they are cut for autoplay
muted, and a track nobody hears is a licence to get wrong. If a voiceover is
ever added, it belongs on `launch` only — the one cut with a viewer who chose
to be there.
