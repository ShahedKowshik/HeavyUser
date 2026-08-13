import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const manifestPath = resolve(root, ".heavyuser/change-manifest.json");

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function changedFiles() {
  const base = process.env.HEAVYUSER_SCOPE_BASE?.trim() || "HEAD";
  const tracked = git(["diff", "--name-only", base]).split("\n").filter(Boolean);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
  return [...new Set([...tracked, ...untracked])].sort();
}

function patternMatches(file, pattern) {
  const escape = (value) => value.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const expression = `^${pattern.split("**").map((part) => escape(part).replaceAll("*", "[^/]*")).join(".*")}$`;
  return new RegExp(expression).test(file);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (error) {
  console.error(`scope check failed: unable to read change manifest: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const files = changedFiles();
const allowed = manifest.allowedPaths ?? [];
const unexpected = files.filter((file) => !allowed.some((pattern) => patternMatches(file, pattern)));

if (manifest.mode === "read-only" && files.some((file) => /^(src|e2e|supabase\/migrations|package\.json|scripts)\//.test(file) || ["package.json", "tsconfig.json"].includes(file))) {
  console.error("scope check failed: read-only work contains application, test, migration, or configuration changes");
  process.exit(1);
}

if (unexpected.length) {
  console.error("scope check failed: unexpected files");
  for (const file of unexpected) console.error(`- ${file}`);
  process.exit(1);
}

console.log(`scope check passed: ${files.length} changed file${files.length === 1 ? "" : "s"} within the declared manifest`);
