import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { collectChangedFiles, validateContract } from "./heavyuser-check-contract.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const manifestPath = resolve(root, ".heavyuser/change-manifest.json");

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.changeType !== "release") {
  console.log(`release check skipped: change type is ${manifest.changeType}`);
  process.exit(0);
}

const evidence = manifest.releaseEvidence;
const failures = [];
const contract = validateContract({ manifest, root, changedFiles: collectChangedFiles(root) });
for (const failure of contract.failures) failures.push(`contract: ${failure}`);
if (!evidence || !["ui", "integration"].includes(manifest.releaseClass)) {
  failures.push("releaseClass must be ui or integration and releaseEvidence must be present");
}

if (!Array.isArray(evidence?.evidenceRefs) || evidence.evidenceRefs.length === 0) {
  failures.push("releaseEvidence.evidenceRefs must contain at least one non-secret evidence link or identifier");
} else if (evidence.evidenceRefs.some((value) => typeof value !== "string" || !value.trim())) {
  failures.push("releaseEvidence.evidenceRefs must contain only non-empty strings");
}

const head = git(["rev-parse", "HEAD"]);
if (evidence?.deployedSha !== head) failures.push(`deployedSha must equal current HEAD ${head}`);
for (const field of ["migrationParity", "postDeployChecks", "cleanTree"]) {
  if (evidence?.[field] !== true) failures.push(`releaseEvidence.${field} must be true`);
}
if (manifest.releaseClass === "integration") {
  for (const field of ["providerQa", "authenticatedSmoke"]) {
    if (evidence?.[field] !== true) failures.push(`integration release requires releaseEvidence.${field}=true`);
  }
  if (!["provider-qa", "production"].includes(manifest.requiredEvidence)) {
    failures.push("integration release requires provider-qa or production evidence");
  }
  const unresolved = contract.rows.filter((row) => ["BLOCKED", "NOT RUN"].includes(row.status));
  if (unresolved.length) {
    failures.push(`integration release has unresolved contract evidence rows: ${unresolved.map((row) => row.scenario).join("; ")}`);
  }
}

if (evidence?.cleanTree === true && git(["status", "--porcelain=v1", "--untracked-files=all"])) {
  failures.push("releaseEvidence.cleanTree is true but the repository is dirty");
}

if (failures.length) {
  console.error("release check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`release check passed: ${manifest.releaseClass} release evidence matches ${head}`);
