import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { OG_HEADERS } from "@/lib/og";

export const runtime = "nodejs";
export const dynamic = "force-static";

/** Serve the approved brand card without a database or font dependency. */
export async function GET() {
  const image = await readFile(join(process.cwd(), "assets/og/burnlog-v2.png"));
  return new Response(new Uint8Array(image), {
    headers: { ...OG_HEADERS, "Content-Type": "image/png" },
  });
}
