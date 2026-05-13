export function buildMatchupSlug(leftUsername: string, rightUsername: string): string {
  return `${leftUsername}-vs-${rightUsername}`;
}

export function parseMatchupSlug(slug: string): { left: string; right: string } | null {
  const parts = slug.split("-vs-");
  if (parts.length !== 2) return null;
  const [left, right] = parts;
  if (!left || !right) return null;
  return { left, right };
}

export function buildMatchupPath(leftUsername: string, rightUsername: string): string {
  return `/h2h/${buildMatchupSlug(leftUsername, rightUsername)}`;
}
