import { createHash, randomBytes } from "crypto";

export function generateApiKey(): { raw: string; hash: string } {
  const raw = "blg_" + randomBytes(24).toString("hex");
  return { raw, hash: hashApiKey(raw) };
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
