import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const stages = [
  ["preflight", ["preflight"]],
  ["scope", ["check:scope"]],
  ["release evidence", ["check:release"]],
  ["lint", ["lint"]],
  ["typecheck", ["typecheck"]],
  ["unit tests", ["test", "--", "--run"]],
  ["production build", ["build"]],
  ["browser tests", ["test:e2e"]],
  ["generated-file check", ["check:generated"]],
  ["diff hygiene", ["git", "diff", "--check"]],
  ["production dependency audit", ["audit", "--prod"]],
  ["full dependency audit", ["audit"]],
  ["linked Supabase checks", ["supabase:check"]],
  ["linked Supabase generated types", ["supabase:types:check"]],
];

for (const [name, args] of stages) {
  console.log(`\n=== HeavyUser verify: ${name} ===`);
  const command = args[0] === "git" ? "git" : pnpm;
  const commandArgs = args[0] === "git" ? args.slice(1) : args;
  const result = spawnSync(command, commandArgs, { cwd: root, env: process.env, stdio: "inherit" });
  if (result.error) {
    console.error(`${name} could not start: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${name} failed with exit code ${result.status ?? "unknown"}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nHeavyUser verify passed: all configured local, generated-file, dependency, and linked-database gates passed.");
