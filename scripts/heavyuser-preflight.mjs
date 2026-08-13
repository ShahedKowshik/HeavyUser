import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(root, ".heavyuser/change-manifest.json");

function git(args, options = {}) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }).trim();
}

function fail(message) {
  console.error(`preflight failed: ${message}`);
  process.exitCode = 1;
}

if (!existsSync(manifestPath)) {
  fail(".heavyuser/change-manifest.json is missing");
} else {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail(`change manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (manifest?.schemaVersion !== 1) fail("change manifest schemaVersion must be 1");
  if (!["audit", "fix", "feature", "release", "stabilization"].includes(manifest?.changeType)) {
    fail("change manifest changeType must be audit, fix, feature, release, or stabilization");
  }
  if (!["read-only", "mutating"].includes(manifest?.mode) || !Array.isArray(manifest?.allowedPaths)) {
    fail("change manifest needs changeType, mode, and allowedPaths");
  }

  const actualRoot = realpathSync(git(["rev-parse", "--show-toplevel"]));
  const expectedRoot = realpathSync(root);
  if (actualRoot !== expectedRoot) fail(`wrong repository: expected ${expectedRoot}, found ${actualRoot}`);

  const head = git(["rev-parse", "HEAD"]);
  if (manifest?.baselineSha) {
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", manifest.baselineSha, head], {
        cwd: root,
        stdio: "ignore",
      });
    } catch {
      fail(`current HEAD ${head} is not based on manifest baseline ${manifest.baselineSha}`);
    }
  }

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (!Number.isInteger(nodeMajor) || nodeMajor < 24) fail(`Node.js 24+ is required; found ${process.versions.node}`);

  for (const requiredFile of ["AGENTS.md", "README.md", "design.md", "ARCHITECTURE.md", "package.json"]) {
    if (!existsSync(resolve(root, requiredFile))) fail(`required file is missing: ${requiredFile}`);
  }

  console.log(JSON.stringify({
    repository: actualRoot,
    branch: git(["branch", "--show-current"]),
    head,
    dirtyFiles: git(["status", "--porcelain=v1", "--untracked-files=all"]).split("\n").filter(Boolean),
    changeType: manifest.changeType,
    mode: manifest.mode,
    changeId: manifest.changeId ?? null,
    riskAreas: manifest.riskAreas ?? [],
    planFile: manifest.planFile ?? null,
    requiredEvidence: manifest.requiredEvidence ?? null,
  }, null, 2));
}

if (process.exitCode) process.exit(process.exitCode);
