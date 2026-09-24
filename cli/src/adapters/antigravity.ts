import { readFileSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Adapter, BurnEvent, ScanOptions, ScanResult } from "./types.js";
import { providerFromModel, shouldRead } from "./types.js";
import { envDir, hashId, isDir, num, walkFiles } from "./fileutil.js";
import { resolveAntigravityModel } from "./antigravity-cli.js";

/**
 * Antigravity (IDE) adapter — ported from tokscale's `sessions/antigravity.rs`
 * (MIT).
 *
 * The Antigravity IDE keeps usage inside its running language server, not on
 * disk. tokscale pulls it over RPC with `tokscale antigravity sync` and caches
 * it as JSONL under its own config dir:
 *
 *   <tokscale config>/antigravity-cache/sessions/*.jsonl
 *
 * where `<tokscale config>` is `$TOKSCALE_CONFIG_DIR`, else
 * `$XDG_CONFIG_HOME/tokscale` (Linux), `%APPDATA%\tokscale` (Windows), else
 * `~/.config/tokscale`. So this adapter only sees usage someone has synced with
 * tokscale; the RPC sync itself is not ported. The Antigravity CLI and newer
 * IDE extensions keep generation databases on disk — see antigravity-cli.ts.
 *
 * Lines are `{"type":"session_meta","modelId":...}` (session default model) and
 * `{"type":"usage","sessionId","timestamp"(ms),"modelId"?,"input","output",
 * "cacheRead","cacheWrite","reasoning","responseId"?}`. Reasoning is a separate
 * bucket in the cache and is added to output here.
 *
 * Override the cache dir (the one holding `sessions/`) with
 * BURNLOG_ANTIGRAVITY_DIR.
 */

function cacheRoot(): string {
  const explicit = envDir("BURNLOG_ANTIGRAVITY_DIR");
  if (explicit) return explicit;
  const custom = envDir("TOKSCALE_CONFIG_DIR");
  let config: string;
  if (custom) config = custom;
  else if (process.platform === "linux" && envDir("XDG_CONFIG_HOME")) config = join(envDir("XDG_CONFIG_HOME")!, "tokscale");
  else if (process.platform === "win32")
    config = join(envDir("APPDATA") ?? join(homedir(), "AppData", "Roaming"), "tokscale");
  else config = join(homedir(), ".config", "tokscale");
  return join(config, "antigravity-cache");
}

type Row = Record<string, unknown>;

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v : undefined);

export class AntigravityAdapter implements Adapter {
  readonly name = "antigravity" as const;

  private get dir(): string {
    return join(cacheRoot(), "sessions");
  }

  detect(): boolean {
    return isDir(this.dir);
  }

  scan(opts: ScanOptions = {}): ScanResult {
    const dir = this.dir;
    if (!isDir(dir)) {
      return {
        source: this.name,
        events: [],
        scannedFiles: 0,
        totalLines: 0,
        note: "no synced cache — the Antigravity IDE keeps usage in its language server; run `tokscale antigravity sync` to export it",
      };
    }

    const byId = new Map<string, BurnEvent>();
    let scannedFiles = 0;
    let totalLines = 0;

    for (const file of walkFiles(dir, (n) => n.endsWith(".jsonl"))) {
      let raw: string;
      try {
        if (!shouldRead(statSync(file).mtimeMs, opts.since)) continue;
        raw = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      scannedFiles++;
      let sessionModel: string | undefined;

      for (const line of raw.split("\n")) {
        const t = line.trim();
        if (!t) continue;
        totalLines++;
        let v: Row;
        try {
          v = JSON.parse(t) as Row;
        } catch {
          continue;
        }
        if (v.type === "session_meta") {
          sessionModel = str(v.modelId) ?? sessionModel;
          continue;
        }
        if (v.type !== "usage") continue;

        const sessionId = typeof v.sessionId === "string" ? v.sessionId : undefined;
        const ts = num(v.timestamp);
        if (sessionId === undefined || ts <= 0) continue;

        const input = num(v.input);
        const output = num(v.output) + num(v.reasoning);
        const cacheRead = num(v.cacheRead);
        const cacheWrite = num(v.cacheWrite);
        if (input + output + cacheRead + cacheWrite === 0) continue;

        const model = resolveAntigravityModel(str(v.modelId) ?? sessionModel ?? "unknown");
        const requestId =
          str(v.responseId) ?? hashId("antigravity", sessionId, ts, input, output, cacheRead, cacheWrite);
        if (byId.has(requestId)) continue;
        byId.set(requestId, {
          requestId,
          source: this.name,
          model,
          provider: providerFromModel(model),
          inputTokens: input,
          outputTokens: output,
          cacheCreationTokens: cacheWrite,
          cacheReadTokens: cacheRead,
          timestamp: new Date(ts).toISOString(),
        });
      }
    }

    return { source: this.name, events: [...byId.values()], scannedFiles, totalLines };
  }
}
