import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const baselinePath = resolve(root, ".heavyuser/generated-baseline.json");

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

if (!existsSync(baselinePath)) {
  console.error("generated-file check failed: .heavyuser/generated-baseline.json is missing");
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const mismatches = [];
for (const [relativePath, expected] of Object.entries(baseline.files ?? {})) {
  const absolutePath = resolve(root, relativePath);
  if (!existsSync(absolutePath)) {
    mismatches.push(`${relativePath} is missing`);
    continue;
  }
  const actual = hashFile(absolutePath);
  if (actual !== expected.sha256) mismatches.push(`${relativePath} changed (expected ${expected.sha256}, found ${actual})`);
}

const trackedGenerated = git(["ls-files"]).split("\n").filter((file) => file.startsWith(".next/") || file.startsWith(".next-e2e/") || file.endsWith("/generated.ts"));
if (trackedGenerated.length) mismatches.push(`generated build files are tracked: ${trackedGenerated.join(", ")}`);

if (mismatches.length) {
  console.error("generated-file check failed:");
  for (const mismatch of mismatches) console.error(`- ${mismatch}`);
  process.exit(1);
}

console.log("generated-file check passed");
