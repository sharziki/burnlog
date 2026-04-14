# Burnlog — competitor set and consistent design direction

## Product thesis
Burnlog should sit between three lanes:
1. Fun public signal: token burn, streaks, ranks, leaderboards
2. Serious operator analytics: usage trends, model mix, burn efficiency, throughput
3. Hiring / recruiting signal: proof that a builder is deeply AI-native, not just claiming it

The trap is optimizing only for lane 1. Raw token spend alone becomes noisy and rewards waste.

The stronger position:
- Burnlog is the performance surface for AI-native builders
- token burn is the attention hook, not the whole product
- the UI should feel like a serious benchmark tool with a little competitive edge

## Competitor set

### Tier 1 — direct adjacent product surfaces
These are the closest functional neighbors, even if they target teams rather than individual builders.

#### Langfuse
Observed homepage positioning:
- "Open Source LLM Engineering Platform"
- traces, evals, prompt management, metrics
- enterprise trust, observability-first, integration-heavy

What they do well:
- immediately credible
- platform framing, not gimmick framing
- dense information architecture without looking messy

Gap vs Burnlog:
- built for teams shipping LLM apps, not for individual AI-native developer identity
- no fun/status/leaderboard layer
- no recruiting signal or personal operator profile

#### Helicone
Observed homepage positioning:
- "Build Reliable AI Apps"
- route, debug, analyze applications
- gateway + observability angle

What they do well:
- clear product promise
- practical, operator-facing language
- feels modern and useful quickly

Gap vs Burnlog:
- app ops, not person ops
- no identity system, no rank/status, no public profile energy
- closer to infrastructure than talent signal

#### Braintrust
Observed homepage positioning:
- "Ship quality AI at scale"
- traces → evals → quality improvement
- heavy production + release confidence framing

What they do well:
- strongest quality narrative
- serious enterprise feel
- traces/evals relationship is clearly explained

Gap vs Burnlog:
- not playful at all
- focused on product quality, not builder identity or recruiting
- no lightweight consumer/developer habit loop

### Tier 2 — adjacent developer telemetry / identity products
#### WakaTime
Observed homepage positioning:
- "Dashboards for developers"
- code stats from your IDE
- plugins, leaderboards, teams, goals

What they do well:
- personal data becomes persistent identity
- leaderboards/goals/social mechanics are proven
- plugin-based passive capture is exactly the right behavior pattern

Gap vs Burnlog:
- measures coding time, not AI-native operator intensity
- broad dev analytics, not model/tool-specific behavior
- less culturally current than agent-era builder analytics

### Tier 3 — aesthetic / interaction reference, not functional competitor
#### Monkeytype
Observed homepage positioning:
- "A minimalistic, customizable typing test"
- extremely focused one-screen performance surface
- dense stats, strong keyboard-native feeling

What they do well:
- the core metric is unmistakable instantly
- minimal UI still feels sticky and emotional
- performance culture / internet-native taste / leaderboard energy

Risk if copied too literally:
- people may read Burnlog as a typing-test clone
- too much gamer vibe weakens the recruiting / corporate thesis
- monkeytype works because the product is singular; Burnlog needs a little more semantic framing

What to borrow:
- calm dark background
- restrained accent color
- huge central metric
- high information density with low visual noise
- keyboard-native / terminal-adjacent feeling
- mono-heavy numerics

What not to borrow:
- exact iconography language
- same page rhythm
- playful ambiguity around what the product is

## Strategic gap
Nobody has really built:
- a public/private performance identity layer for AI-native builders
- using real coding-agent usage telemetry
- with enough seriousness that it could become a recruiting signal

That is Burnlog’s best lane.

## Recommended product positioning
Use this language family:
- AI-native builder signal
- operator benchmark
- coding-agent usage analytics
- token throughput, consistency, efficiency, trend
- private by default, share by choice

Avoid leaning too hard on:
- meme-only language
- pure "biggest spender wins"
- gamer/casino aesthetics

## Design decision
Do NOT make Burnlog look like a literal Monkeytype clone.

Make it feel like:
- Monkeytype performance focus
- Linear information discipline
- xAI monochrome severity
- with Burnlog’s own warmer rank/accent system

In short:
- benchmark product, not typing game
- internet-native, not childish
- serious enough for hiring conversations
- cool enough that students/devs still want to share profiles

## Consistent design system

### Brand personality
- disciplined
- competitive
- slightly obsessive
- dark, minimal, data-first
- serious with a pulse

### Visual score target
Current direction: ~6/10
Target direction: 8.5/10

To get there:
- remove visual identity drift between pages
- stop mixing multiple unrelated vibes
- define one palette, one type hierarchy, one surface system, one tab language

### Palette
Primary background:
- `#0A0B0D`

Secondary surface:
- `#111317`

Raised surface:
- `#171A20`

Hairline border:
- `rgba(255,255,255,0.08)`

Strong border:
- `rgba(255,255,255,0.14)`

Primary text:
- `#F5F7FA`

Secondary text:
- `#9AA3B2`

Muted text:
- `#67707D`

Primary accent (burn amber):
- `#F59E0B`

Accent hover:
- `#FFB648`

Rank highlight / heat color:
- `#F97316`

Success / active streak:
- `#22C55E`

Danger / drop / regression:
- `#EF4444`

Rule:
- no neon green cyberpunk
- no generic purple/blue AI gradients
- amber/orange should be the owned identity because the product is burn, heat, throughput

### Typography
Use exactly two fonts.

Primary UI / headings:
- Geist Sans or Inter if keeping stack simple

Numerics / labels / code / stat chips:
- JetBrains Mono

Rules:
- leaderboard numbers, ranks, streaks, token totals, sparkline labels = mono
- explanatory copy and section headings = sans
- avoid font drift page to page

Scale:
- Hero metric: 64–88px, mono, tight tracking
- Section headings: 28–36px, sans, semibold
- Card labels: 11–12px uppercase, mono, letter spacing +8% to +12%
- Body copy: 14–16px, sans
- Dense stat text: 12–13px, mono or sans depending on role

### Surface language
Everything should feel like instrumentation.

Rules:
- large rounded corners are out
- use 10px–14px radius for cards, 999px only for pills/chips
- no loud shadows
- depth comes from layered dark surfaces and border contrast, not blur soup
- charts/sparklines/heatmaps should feel embedded into the panel, not floating cards inside cards inside cards

### Layout language
Homepage / main board should feel immediately legible.

Recommended structure:
1. top command bar
   - brand
   - timeframe toggle
   - mode toggle (all-time / weekly / private cohort)
   - search / profile / settings
2. hero performance strip
   - total burned
   - active burners
   - median weekly burn
   - streak leader
3. leaderboard table as the main event
4. secondary analytics row
   - trend
   - model mix
   - weekly heatmap
   - efficiency / consistency card
5. profile / compare views as deeper layers, not equally weighted tabs on first paint

### Interaction language
- keyboard-first hints are good
- micro-interactions should be quick, <180ms
- hover states should brighten border/accent, not animate wildly
- tabs should feel like mode switches, not marketing nav
- row hover on leaderboard should reveal more detail cleanly

### Charts / data visuals
Borrow from Monkeytype and GitHub contributions, but keep the semantics explicit.

Use:
- compact heatmap for active days
- tiny sparkline for weekly movement
- segmented bars for model/provider mix
- percentile bands or cohort comparison chips

Avoid:
- over-ornamental chart chrome
- 3D / glossy / gradient-heavy graphs
- too many chart types on one screen

## Product surface recommendation

### Main public surface
Call it something like:
- Leaderboard
- Profiles
- Compare
- Trends
- Teams

Not:
- Clubs
- H2H
- Challenges
unless those are extremely well executed

Reason:
- Clubs/challenges/h2h currently push the product toward game parody
- for recruiting / corporate positioning, "Profiles / Compare / Teams / Trends" sounds stronger and more durable

You can still keep playful mechanics later, but the top-level framing should sound like a benchmark platform.

## What Burnlog should feel like on first glance
A user should think:
- this measures serious AI-native work
- this is a ranking surface I want to climb
- this could plausibly be shown to recruiters or teammates

They should not think:
- typing test clone
- fake hacker dashboard
- meme leaderboard for wasting money on LLMs

## Recommended one-line design direction
Burnlog should be a dark, benchmark-first performance surface for AI-native builders — Monkeytype’s focus, Linear’s discipline, xAI’s restraint, and an amber heat signature that makes the product unmistakably about burn.

## Next design implementation pass
1. Rename top-level tabs toward benchmark language
2. Unify page fonts and token system
3. Rebuild the main board as one coherent leaderboard shell
4. Reduce mock-gamification noise
5. Add one unmistakable hero metric with supporting density underneath
6. Make profile pages the shareable recruiting artifact
