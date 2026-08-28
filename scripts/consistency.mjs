#!/usr/bin/env node
/**
 * Cross-package drift checks.
 *
 * These are the failures that live *between* the CLI and the web app, where
 * neither typecheck nor build has any opinion and each side looks fine alone:
 *
 *  - The CLI shipped for months defaulting to a host that had stopped
 *    resolving. It only worked on the author's laptop, whose config had been
 *    hand-pointed at the real site, so `npx @sxnalabs/burnlog` was dead for
 *    every new user and nothing said so.
 *  - The landing page advertised opencode as supported while no adapter for it
 *    existed, so anyone who ran the CLI counted zero of it.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = [];
const ok = [];
const check = (name, cond, detail = "") => (cond ? ok : fail).push({ name, detail });

// 1. The CLI's default API URL must be the site, and must resolve.
const cliDefault = read("cli/src/config.ts").match(/DEFAULT_API_URL\s*=\s*"([^"]+)"/)?.[1];
check("cli: DEFAULT_API_URL is set", Boolean(cliDefault));

const siteUrl = "https://burnlog.net";
check(
  `cli: DEFAULT_API_URL is ${siteUrl}`,
  cliDefault === siteUrl,
  `got ${cliDefault}`,
);

if (cliDefault) {
  try {
    const res = await fetch(`${cliDefault}/api/health`, { headers: { "user-agent": "burnlog-consistency/1" } });
    const body = await res.json();
    check("cli: DEFAULT_API_URL resolves and is healthy", res.ok && body.ok === true, `status ${res.status}`);
  } catch (err) {
    check("cli: DEFAULT_API_URL resolves and is healthy", false, String(err.message ?? err));
  }
}

// 2. Every tool the site lists as "read from local logs" must have an adapter.
const adapterNames = [...read("cli/src/adapters/index.ts").matchAll(/new (\w+)Adapter\(\)/g)]
  .map((m) => m[1].toLowerCase());
const logTools = (read("web/src/components/Landing.tsx").match(/const LOG_TOOLS = \[([^\]]*)\]/)?.[1] ?? "")
  .split(",")
  .map((t) => t.trim().replace(/^"|"$/g, ""))
  .filter(Boolean);

check("web: LOG_TOOLS is not empty", logTools.length > 0);
for (const tool of logTools) {
  const slug = tool.toLowerCase().replace(/[^a-z]/g, "");
  check(
    `web: "${tool}" is listed as log-read and has an adapter`,
    adapterNames.some((a) => a === slug),
    `no adapter matching "${slug}" in cli/src/adapters — the site is promising something the CLI cannot do`,
  );
}

console.log(`\n${ok.length}/${ok.length + fail.length} passed\n`);
for (const f of fail) console.log(`  FAIL  ${f.name}${f.detail ? `  — ${f.detail}` : ""}`);
if (fail.length) process.exitCode = 1;
else console.log("  all green");
