# Burnlog Next-Level Roadmap

> **For Hermes:** Use subagent-driven-development skill to execute this roadmap in slices. Fix correctness and onboarding first, then deepen social loops and progression.

**Goal:** Make burnlog feel reliable, seamless, and fun: frictionless agent connection, hardened user setup/reporting, working social loops, working H2H and embed, richer progression, and climate impact visibility.

**Architecture:** Keep the current Next.js + Prisma product spine, but tighten it around three product loops: (1) connect your agent and see tokens immediately, (2) compare and compete with other people, (3) share identity/status externally via badges, profiles, and club/social surfaces. Prioritize correctness and trust before expanding breadth.

**Tech Stack:** Next.js 15, React 19, Prisma/Postgres, Burnlog CLI, Burnlog SDK, Burnlog MCP.

---

## Phase 0 — Hardening and truthfulness

### Task 0.1: Fix install/setup truthfulness across CLI + docs
**Objective:** Make the setup experience honest and consistent so users do not install a broken or misleading flow.

**Files:**
- Modify: `cli/package.json`
- Modify: `cli/README.md`
- Modify: `README.md`
- Modify: `AGENT_SETUP.md`
- Modify: `cli/src/index.ts`

**Acceptance:**
- One canonical npm package name everywhere.
- One canonical app URL everywhere.
- Docs no longer imply Hermes/openclaw/Codex auto-hook support unless it actually exists.
- Setup instructions clearly separate: supported auto-install, supported manual sync, SDK integration.

### Task 0.2: Make login/setup fail loudly when broken
**Objective:** Users should never think burnlog is connected when it is not.

**Files:**
- Modify: `cli/src/commands/login.ts`
- Modify: `cli/src/commands/sync.ts`
- Modify: `cli/src/commands/status.ts`
- Modify: `cli/src/config.ts`

**Acceptance:**
- `burnlog login` validates immediately and exits non-zero on invalid key or unreachable API.
- `burnlog status` shows adapter detection, hook/install state, last sync result, and last error.
- Quiet mode remains quiet for success but persists failures for later inspection.

### Task 0.3: Restore visible onboarding for signed-in users
**Objective:** A new user can sign in, get a key, connect an agent, sync, and verify success without confusion.

**Files:**
- Modify: `web/src/app/settings/page.tsx`
- Modify: `web/src/app/settings/client.tsx`
- Modify: `web/src/components/Burnlog.tsx`
- Modify: `web/src/components/Nav.tsx`

**Acceptance:**
- Signed-in users can always access settings/setup.
- Zero-burn users always see a clear “connect agent / generate key / sync now” path.
- The first-run setup path does not depend on already being on the leaderboard.

---

## Phase 1 — Fix broken product promises

### Task 1.1: Fix embed/badge correctness
**Objective:** Make the badge actually work everywhere and always point to valid public profile URLs.

**Files:**
- Modify: `web/src/components/Burnlog.tsx`
- Modify: `web/src/app/u/[username]/ProfileClient.tsx`
- Modify: `web/src/app/badge/[username]/route.ts`
- Optional create: alias route for `.svg` if backward compatibility is needed

**Acceptance:**
- Badge markdown and HTML snippets resolve correctly.
- Badge image route works with the documented URL shape.
- Badge clickthrough targets the real public profile route.
- Existing broken `.svg` snippets either get updated everywhere or are supported by a compatibility route.

### Task 1.2: Turn H2H into a working loop
**Objective:** H2H should be a real product flow, not a dead CTA.

**Files:**
- Modify: `web/src/components/Burnlog.tsx`
- Modify: `web/src/app/h2h/[matchup]/page.tsx`
- Modify: `web/src/app/h2h/[matchup]/H2HClient.tsx`
- Optional create: `web/src/app/api/h2h/*`
- Optional modify: `web/prisma/schema.prisma`

**Acceptance:**
- “Challenge Them” generates a shareable matchup flow at minimum.
- H2H page is reachable from in-app actions.
- Add copy-link/share CTA.
- Prevent invalid matchups and self-match edge cases.

### Task 1.3: Make reporting feel trustworthy
**Objective:** Users should understand their burn clearly and trust that the platform is tracking correctly.

**Files:**
- Modify: `web/src/lib/stats.ts`
- Modify: `web/src/app/api/me/stats/route.ts`
- Modify: `web/src/components/Burnlog.tsx`
- Modify: `web/src/app/u/[username]/ProfileClient.tsx`

**Acceptance:**
- Cleaner reporting UX for totals, weekly trends, providers, sources, top models.
- Surface “last sync”, “last active”, and basic health/confidence info.
- Add better empty/error/loading states for reporting surfaces.

---

## Phase 2 — Make it actually social

### Task 2.1: Add friends/follow connections
**Objective:** Users can explicitly connect with people, not just passively sit on a leaderboard.

**Files:**
- Modify: `web/prisma/schema.prisma`
- Create: follow/friend API routes under `web/src/app/api/`
- Modify: `web/src/app/u/[username]/ProfileClient.tsx`
- Modify: `web/src/components/Burnlog.tsx`
- Modify: `web/src/lib/notifications.ts`

**Acceptance:**
- Users can send/accept a friend request or follow another user.
- Profiles show connection state.
- Notifications exist for new requests/acceptances.
- Leaderboard/H2H can be filtered to friends/following.

### Task 2.2: Strengthen club/community loops
**Objective:** Clubs should feel like micro-communities, not hidden CRUD objects.

**Files:**
- Modify: `web/src/components/Burnlog.tsx`
- Modify: `web/src/app/api/clubs/**`
- Create: public club route(s) in `web/src/app/clubs/`
- Modify: `web/src/lib/notifications.ts`

**Acceptance:**
- Public/shareable club pages.
- Club activity feeds feel alive.
- Announcements and membership actions create visible social feedback.

---

## Phase 3 — Progression and delight

### Task 3.1: Expand rank ladder and add progress-to-next-rank
**Objective:** Progression should feel satisfying well below 1B tokens.

**Files:**
- Modify: `web/src/lib/ranks.ts`
- Modify: `web/src/components/Burnlog.tsx`
- Modify: `web/src/app/u/[username]/ProfileClient.tsx`
- Modify: `web/src/lib/notifications.ts`

**Acceptance:**
- More granular rank ladder.
- Each profile shows current rank, next rank, tokens remaining, and progress.
- Rank-up notifications become more frequent and motivating.

### Task 3.2: Add milestones, streak rewards, and seasonal framing
**Objective:** Give users small reasons to come back beyond raw total burn.

**Files:**
- Modify: `web/src/lib/notifications.ts`
- Modify: `web/src/components/Burnlog.tsx`
- Optional modify: `web/prisma/schema.prisma`

**Acceptance:**
- Milestone surfaces beyond raw rank.
- Weekly/seasonal framing appears on leaderboard or profile.
- Streak and momentum feel game-like, not just analytical.

---

## Phase 4 — Climate impact

### Task 4.1: Add estimated climate impact model
**Objective:** Let users see a rough environmental footprint of their token burn.

**Files:**
- Modify: `web/src/lib/stats.ts`
- Modify: `web/src/app/api/me/stats/route.ts`
- Modify: `web/src/components/Burnlog.tsx`
- Modify: `web/src/app/u/[username]/ProfileClient.tsx`
- Optional create: `web/src/lib/climate.ts`

**Acceptance:**
- Show estimated energy / CO2e with clearly stated methodology and caveats.
- Values are approximate and transparent, not fake precision.
- UI presents this as “estimated climate impact,” not fact.

---

## Phase 5 — Real agent ecosystem support

### Task 5.1: Define true support matrix for Claude, Codex, Hermes, openclaw, SDK, MCP
**Objective:** Burnlog should be dead-simple to connect, and the support story should match reality.

**Files:**
- Modify: `cli/src/adapters/hermes.ts`
- Modify: `cli/src/adapters/openclaw.ts`
- Modify: `cli/src/adapters/codex.ts`
- Modify: `cli/src/commands/install.ts`
- Modify: `cli/README.md`
- Modify: `README.md`
- Modify: `AGENT_SETUP.md`
- Modify: `sdk/src/index.ts`
- Modify: `mcp/README.md`

**Acceptance:**
- Explicit support matrix: auto-install, passive scan, SDK/manual integration, MCP query.
- Hermes/openclaw either truly supported or clearly routed through SDK/manual mode.
- Codex onboarding is simple and truthful.

---

## Recommended execution order
1. Phase 0.1
2. Phase 0.2
3. Phase 0.3
4. Phase 1.1
5. Phase 1.2
6. Phase 1.3
7. Phase 2.1
8. Phase 3.1
9. Phase 2.2
10. Phase 4.1
11. Phase 5.1

## Immediate first slice
Start with:
- CLI/doc truthfulness + package/API URL consistency
- onboarding/settings visibility
- embed/badge route fixes

That gives the fastest jump in real-world trust and “it actually works” feeling.