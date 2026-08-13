# Burnlog design constitution

## Governance

- Contract version: `0.1.0`
- Status: `provisional`
- Authority basis: verified production, repository evidence, and Nova `projects/burnlog`
- Last approved by: none
- Last reviewed: `2026-08-13`
- Machine contract: `design/brand-system.json`

## Product Truth

- Product thesis: developer identity and friendly competition for AI token usage.
- Audience: developers using local AI coding agents.
- Primary action: connect one machine, then compare and share real token burn.
- Trust basis: token counts from local agent logs or provider usage responses; never prompts, code, filenames, or working directories.

## Brand Thesis

- Posture: competitive but quiet; technical but not enterprise-dashboard sterile.
- Recognition device: flame silhouette with terminal-caret cutout.
- Visual protagonist: real rank, token number, or person.
- Invariant: near-black ground, amber action, mono data, thin borders, compact controls.
- Interaction verb: connect.
- Motion verb: rise.
- Voice: short, direct, honest, lightly competitive.

## Explicit Prohibitions

- No glass, generic gradients, ornamental bento, fake proof, or word-wall cards.
- No editable identity fields already owned by GitHub OAuth.
- No feature management hidden in Settings when it belongs beside the feature.
- No new UI dependency for native browser behavior.

## Color System

| Role | Value | Use | Never use for |
|---|---|---|---|
| Canvas | `#09090B` | page ground | selected controls |
| Surface | `#0C0C0E` | cards and compact panels | decorative nesting |
| Border | `#18181B` | separation | primary meaning alone |
| Text | `#FAFAFA` | primary text | large solid fills |
| Secondary | `#A1A1AA` | supporting prose | disabled state |
| Muted | `#52525B` | labels and metadata | core instructions |
| Signal | `#D97706` | action and rank energy | body copy |
| Success | `#10B981` | completed/saved | decorative accents |
| Error | `#EF4444` | failure/destructive | ordinary status |

Verified pairs: Text/Canvas, Secondary/Canvas, Signal/Canvas, and Canvas/Signal for bold compact controls.

## Typography

| Role | Family | Cuts/axes | Loading | License status |
|---|---|---|---|---|
| Display | Instrument Sans | 700 | `web/public/fonts` via `next/font/local` | verified repository asset |
| Text | Instrument Sans | 400–700 | `web/public/fonts` via `next/font/local` | verified repository asset |
| Mono | IBM Plex Mono | 400–700 | `web/public/fonts` via `next/font/local` | verified repository asset |

Headings use tight tracking and 1.05–1.15 line height. Prose stays below 70 characters per line. Mono labels use uppercase and tracking only at 10–12px. Token numerals stay tabular-looking and must truncate or recompose before overflowing.

## Composition

- Grid: 1100px app shell; 720–900px focused routes; 24px gutters.
- Dominant/supporting/quiet regions: rank and next action dominate; explanation supports; metadata stays quiet.
- Spacing rhythm: 4, 8, 12, 16, 20, 24, 32, 48px.
- Radius/border/elevation/material: 6–10px radii, one-pixel borders, no visible shadow except floating menus.
- Responsive recomposition: multi-column grids collapse by 720px; navigation moves to its own row; controls reach 40px touch height; no horizontal narrative.

## Image Grammar

- Protagonist and invariant: user avatar or product logo only when it identifies a real object.
- Composition and negative space: isolated mark inside a small bounded square.
- Lens and crop: avatars crop square and center; logos keep full clear space.
- Lighting: none; assets retain source geometry.
- Material and texture: flat vectors and real avatars.
- Edge and depth language: crisp one-pixel edges, no glow.
- Forbidden motifs: stock imagery, generated people, fake UI, decorative 3D flames.

## Components and States

Native links, buttons, inputs, details, segmented controls, and project cards. Rest is quiet; hover lifts border contrast; focus-visible uses a 2px amber outline; active moves at most 1px; selected uses surface contrast plus text; disabled reduces contrast and blocks pointer intent; loading names the work; empty states give one action; error states expose retry; success states say saved/copied/connected. Hover never owns information.

## Motion

- Property ownership: CSS owns hover/active and entrance; React owns state changes only.
- Durations/easing: 100–150ms feedback, 400–500ms entrance, `cubic-bezier(.16,1,.3,1)`.
- Scroll behavior: normal document flow.
- Reduced motion: animation duration collapses to near-zero and embers disappear.
- Static/no-WebGL fallback: complete product; WebGL is not used.

## Content and Proof

- Voice rules: lead with action, use short sentences, name limitations plainly.
- Claim/proof adjacency: tracking claims sit beside method; ranks sit beside real numbers.
- Generated atmosphere vs. truthful proof boundary: no generated proof or generated product screens.
- Placeholder policy: honest empty state; never fake people, tokens, achievements, or friends.

## Decisions

### `2026-08-13` — Social/share cleanup

- Status: provisional
- Evidence: production screenshots, repository behavior, user feedback in session.
- Decision: friends move to Friends board scope; embed locks to authenticated account; profile settings autosave; agent directory uses real marks and one install line.
- Rejected alternatives: referral schema and new challenge system, because existing friend data and native share cover the requested loop.
- Migration impact: `/`, `/tools`, `/embed`, `/settings`, `/u/[username]`, design contract.
