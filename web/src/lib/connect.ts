import { createHash } from "crypto";

/** Setup codes are stored hashed; the plaintext only ever exists in the user's prompt. */
export function hashConnectCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
