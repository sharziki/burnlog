---
version: alpha
name: BurnLog
description: Token burn tracking leaderboard and social platform with crypto-native clarity, live competition energy, and trustworthy data surfaces.
colors:
  primary: "#080A0F"
  secondary: "#121722"
  tertiary: "#FF5A1F"
  neutral: "#F8FAFC"
  muted: "#94A3B8"
  border: "#283244"
  success: "#22C55E"
  danger: "#EF4444"
typography:
  h1:
    fontFamily: Inter
    fontSize: 3.5rem
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.045em"
  h2:
    fontFamily: Inter
    fontSize: 2rem
    fontWeight: 750
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  body-md:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.6
  mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.8125rem
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: 6px
  md: 10px
  lg: 18px
spacing:
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "#080A0F"
    rounded: "{rounded.md}"
    padding: 12px
  button-primary-hover:
    backgroundColor: "#E94D16"
  leaderboard-row:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.neutral}"
    rounded: "{rounded.md}"
    padding: 16px
---

## Overview

BurnLog is a token burn tracking leaderboard / social platform. It should feel live, competitive, and crypto-native while still being legible and trustworthy enough for class/project evaluation and public demos. The visual language is dark, data-first, fire-accented, and community-oriented.

## Colors

- **Primary (#080A0F):** Deep background for the app shell.
- **Secondary (#121722):** Tables, cards, post composer, and profile surfaces.
- **Tertiary (#FF5A1F):** Burn/fire accent for primary actions, ranks, and highlighted changes.
- **Neutral (#F8FAFC):** Main text.
- **Muted (#94A3B8):** Labels, timestamps, token metadata.
- **Border (#283244):** Table dividers and card outlines.
- **Success (#22C55E):** Verified events, successful burn proof, positive confirmations.
- **Danger (#EF4444):** Failed proof, invalid wallet, destructive actions.

## Typography

Use Inter for UI and JetBrains Mono for hashes, addresses, amounts, ranks, and transaction IDs. Numeric data should scan quickly.

## Layout

Prioritize the leaderboard, burn feed, token/project detail pages, and social proof. Tables should be dense but readable. Use sticky headers, clear rank deltas, and strong empty/loading/error states.

## Elevation & Depth

Use borders and subtle warm glows around active burn events. Avoid casino-style clutter or excessive neon.

## Shapes

Use compact 10px controls and 18px feature cards. Leaderboard rows should feel tappable on mobile.

## Components

- `leaderboard-row`: rank, token/project, amount burned, proof/status, social actions.
- `button-primary`: submit/log burn or connect wallet action.
- Address/hash components should truncate intelligently and provide copy affordances.

## Do's and Don'ts

- Do make data provenance and verification status obvious.
- Do support fast scanning of ranks, amounts, and recent activity.
- Do maintain root `DESIGN.md` plus any app-level copies used by frontend agents.
- Don’t overuse flames, gradients, or meme visuals unless a specific community surface calls for it.
- Don’t store secrets in repo files; `.env` stays out of project copies.
