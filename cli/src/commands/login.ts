import pc from "picocolors";
import { createServer } from "http";
import { randomBytes } from "crypto";
import { spawn } from "child_process";
import { AddressInfo } from "net";
import { loadConfig, saveConfig, configPath, type Config } from "../config.js";
import { fetchRank } from "../api.js";

const LOGIN_TIMEOUT_MS = 3 * 60_000;

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // Non-fatal — we always print the URL as a fallback.
  }
}

function htmlResponse(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
    body{background:#09090B;color:#E4E4E7;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
    display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
    .card{text-align:center;max-width:420px;padding:32px}
    .accent{color:#D97706;font-weight:700}
    </style></head><body><div class="card">${body}</div></body></html>`;
}

// Interactive GitHub login: spin a localhost listener, open the burnlog
// cli-auth page, and receive a freshly-minted key once the user approves.
export async function browserLogin(opts: { hints?: boolean } = {}): Promise<void> {
  const cfg = loadConfig();
  const state = randomBytes(24).toString("hex");

  const keyPromise = new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const key = url.searchParams.get("key");
      const returnedState = url.searchParams.get("state");
      if (!returnedState || returnedState !== state) {
        res.writeHead(400, { "content-type": "text/html" });
        res.end(htmlResponse("burnlog", "<p>Login state mismatch. Please retry <span class='accent'>burnlog login</span>.</p>"));
        return;
      }
      if (!key) {
        res.writeHead(400, { "content-type": "text/html" });
        res.end(htmlResponse("burnlog", "<p>No key received. Please retry.</p>"));
        return;
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        htmlResponse(
          "burnlog · connected",
          "<p><span class='accent'>✓ connected</span><br/><br/>You can close this tab and return to your terminal.</p>",
        ),
      );
      server.close();
      resolve(key);
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      const authUrl = `${cfg.apiUrl}/cli-auth?port=${port}&state=${state}`;
      console.log();
      console.log("  opening " + pc.cyan(authUrl));
      console.log(pc.dim("  if your browser didn't open, paste that URL into it."));
      console.log();
      console.log(pc.dim("  waiting for GitHub sign-in…"));
      openBrowser(authUrl);
    });

    setTimeout(() => {
      server.close();
      reject(new Error("login timed out after 3 minutes"));
    }, LOGIN_TIMEOUT_MS).unref?.();
  });

  const key = await keyPromise;
  const next = saveApiKey(key);
  console.log(pc.green("✓") + " saved api key to " + pc.dim(configPath()));

  const rank = await fetchRank(next.apiUrl, key);
  if (rank) {
    console.log(
      "  logged in as " +
        pc.bold(`@${rank.username}`) +
        pc.dim(" · ") +
        pc.yellow(`${rank.rankIcon} ${rank.rank}`),
    );
  }
  if (opts.hints === false) return;
  console.log();
  console.log(pc.dim("next:"));
  console.log("  " + pc.bold("burnlog sync") + pc.dim("     upload your existing burn history"));
  console.log("  " + pc.bold("burnlog install") + pc.dim("  auto-sync on every Claude Code session"));
}

/** Persist an api key — the one place login, the browser flow and connect save it. */
export function saveApiKey(key: string): Config {
  const cfg = loadConfig();
  cfg.apiKey = key;
  saveConfig(cfg);
  return cfg;
}

function keyLogin(key: string): void {
  const cfg = saveApiKey(key);
  console.log(pc.green("✓") + " saved api key to " + pc.dim(configPath()));
  console.log("  api url: " + pc.cyan(cfg.apiUrl));
  fetchRank(cfg.apiUrl, key).then((rank) => {
    if (rank) {
      console.log(
        "  logged in as " +
          pc.bold(`@${rank.username}`) +
          pc.dim(" · ") +
          pc.yellow(`${rank.rankIcon} ${rank.rank}`),
      );
    }
  });
}

export async function login(args: string[]): Promise<void> {
  const arg = args[0];

  // Explicit paste flow: `burnlog login blg_...` still works (and is what CI uses).
  if (arg && arg !== "--browser" && arg !== "--web") {
    keyLogin(arg);
    return;
  }

  try {
    await browserLogin();
  } catch (err) {
    const cfg = loadConfig();
    console.error(pc.red("login failed: ") + (err instanceof Error ? err.message : String(err)));
    console.error(
      "  you can still paste a key manually: " +
        pc.bold("burnlog login <api-key>") +
        pc.dim(` (grab one at ${cfg.apiUrl}/settings)`),
    );
    process.exit(1);
  }
}
