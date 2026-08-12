import type { CSSProperties } from "react";

/**
 * Shared chrome for the two company screens. Colocated rather than global
 * because the rest of the app already carries its own copies — this exists so
 * the list and the detail page can't drift from each other, not as a first
 * step towards a design system.
 */

export const MONO =
  'var(--font-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
export const SANS =
  'var(--font-sans), "Instrument Sans", system-ui, -apple-system, sans-serif';

export const card: CSSProperties = {
  border: "1px solid #18181B",
  borderRadius: 12,
  background: "#0C0C0E",
  padding: 18,
};

export const eyebrow: CSSProperties = {
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: 2,
  textTransform: "uppercase",
  color: "#D97706",
};

export const sectionTitle: CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  letterSpacing: 2,
  textTransform: "uppercase",
  color: "#52525B",
  margin: "0 0 12px",
};

export const fieldLabel: CSSProperties = {
  display: "block",
  fontFamily: MONO,
  fontSize: 9,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: "#52525B",
  marginBottom: 10,
};

export const input: CSSProperties = {
  width: "100%",
  background: "#09090B",
  border: "1px solid #18181B",
  borderRadius: 6,
  padding: "11px 13px",
  color: "#FAFAFA",
  fontFamily: MONO,
  fontSize: 13,
  outline: "none",
};

export const primaryBtn: CSSProperties = {
  padding: "11px 18px",
  borderRadius: 7,
  background: "#D97706",
  color: "#09090B",
  border: "none",
  fontFamily: MONO,
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};

export const ghostBtn: CSSProperties = {
  padding: "11px 18px",
  borderRadius: 7,
  background: "transparent",
  color: "#A1A1AA",
  border: "1px solid #27272A",
  fontFamily: MONO,
  fontSize: 12,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};

export const stat: CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  color: "#52525B",
};

/**
 * How a subscription reads at a glance.
 *
 * `past_due` is amber, not red: the company still works (see
 * lib/billing.ts) and the message is "fix the card", not "you're locked out".
 */
export function statusChrome(billing: {
  configured: boolean;
  status: string;
  paid: boolean;
}): { label: string; color: string } {
  if (!billing.configured) return { label: "unbilled", color: "#71717A" };
  if (billing.status === "past_due") return { label: "past due", color: "#D97706" };
  if (billing.paid) return { label: billing.status, color: "#10B981" };
  if (billing.status === "inactive") return { label: "no subscription", color: "#71717A" };
  return { label: billing.status.replace(/_/g, " "), color: "#EF4444" };
}
