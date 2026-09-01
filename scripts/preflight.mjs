#!/usr/bin/env node
/**
 * Everything that must pass before code leaves this machine.
 *
 *   node scripts/preflight.mjs
 *
 * One command, because a checklist you have to remember is a checklist you
 * skip at 1am. CI runs most of this too — the point of running it here is that
 * finding a break locally costs thirty seconds and finding it in CI costs a
 * push, a wait, and a second commit that says "fix ci".
 *
 * It deliberately does NOT deploy or touch production. Preflight is the gate;
 * shipping is a push (Vercel deploys from master on its own). See RELEASE.md.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const steps = [];

function run(name, cmd, args, cwd = ROOT) {
  process.stdout.write(`  ${name} … `);
  const t0 = Date.now();
  try {
    execFileSync(cmd, args, { cwd, stdio: "pipe", encoding: "utf8" });
    console.log(`ok (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    steps.push({ name, ok: true });
  } catch (err) {
    console.log("FAILED");
    // The tail is what you need; the head is npm telling you it ran npm.
    const out = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim().split("\n").slice(-25);
    for (const l of out) console.log(`      ${l}`);
    steps.push({ name, ok: false });
  }
}

console.log("\npreflight\n");

run("web · typecheck", "npx", ["tsc", "--noEmit", "-p", "tsconfig.json"], join(ROOT, "web"));
run("web · build", "npm", ["run", "build"], join(ROOT, "web"));

for (const pkg of ["cli", "sdk", "mcp"]) {
  const dir = join(ROOT, pkg);
  if (!existsSync(join(dir, "package.json"))) continue;
  // node_modules missing is a fresh clone, not a failure to report as one.
  if (!existsSync(join(dir, "node_modules"))) {
    console.log(`  ${pkg} · build … skipped (no node_modules — run npm ci)`);
    continue;
  }
  run(`${pkg} · build`, "npm", ["run", "build"], dir);
}

// Catches the class of bug where the CLI, the site and the docs disagree about
// a package name or a version — which is exactly how @sxna/* shipped as a 404.
run("cross-package drift", "node", ["scripts/consistency.mjs"]);

const bad = steps.filter((s) => !s.ok);
console.log(
  bad.length
    ? `\n  ${bad.length} failed: ${bad.map((s) => s.name).join(", ")}\n`
    : "\n  all green — safe to commit and push\n",
);
process.exit(bad.length ? 1 : 0);
