import { timingSafeEqual } from "node:crypto";

export function isAdminToken(req: Request) {
  const expected = process.env.BURNLOG_ADMIN_TOKEN;
  const raw = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || !raw) return false;

  const a = Buffer.from(raw);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
