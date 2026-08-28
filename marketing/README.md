# burnlog · marketing

Remotion source for the launch film. Two cuts off one timeline:

| composition | size | for |
| --- | --- | --- |
| `launch` | 1920×1080 | site, X, Show HN, Product Hunt |
| `launch-vertical` | 1080×1920 | Shorts, Reels, TikTok |

```bash
npm run studio                                   # preview and scrub
npm run render -- launch out/launch.mp4          # 24s, ~1.6MB
npm run render -- launch-vertical out/vert.mp4
```

## What it is allowed to show

Colour, type and motion come from `design/brand-system.json`, not from choices
made here — near-black ground, amber action, mono data, one motion verb
("rise"), the 500ms entrance on `cubic-bezier(.16,1,.3,1)`. Fonts are the same
woff2 files the site ships, copied into `public/fonts`.

That document also forbids **fake UI**, which shapes the whole film:

- The terminal scene is real `burnlog` output, line for line.
- The ladder is the real eleven ranks, mirrored from `web/src/lib/ranks.ts`.
- There is no mocked-up leaderboard with invented users anywhere in it.

The one number that is illustrative rather than measured is the scan total in
the terminal scene (`3.5M tokens across 2 sources`) — a plausible first run,
not a claim about anyone's account. Keep it that way: quoting live global
totals would date the film and would have to be re-rendered every time the
board moves.
