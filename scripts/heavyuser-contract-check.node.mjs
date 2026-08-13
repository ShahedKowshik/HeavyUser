import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { collectChangedFiles, inferRiskAreas, resolveComparisonBase, validateContract } from "./heavyuser-check-contract.mjs";

const validContract = `# Change contract

Change ID: example-change

## Goal
Do the work.

## Out of scope
Nothing else.

## Affected systems and risks
Risk areas are declared in the manifest.

## Source of truth and ownership
The contract owns the decision record.

## State and failure contract
Missing proof is not success.

## Concurrency, retries, and time
Use deterministic checks.

## User-visible recovery
Show a clear error.

## Edge-case and evidence matrix
| Area | Scenario | Expected result | Test/evidence | Layer | Status | Reason or link |
| --- | --- | --- | --- | --- | --- | --- |
| Contract | Missing plan | Check fails | Unit test | local | PASS | Covered. |
| Provider | QA unavailable | Remains blocked | QA record | provider-qa | BLOCKED | Account unavailable. |

## Rollback and cleanup
Revert the change.
`;

function manifest(overrides = {}) {
  return {
    schemaVersion: 1,
    changeType: "fix",
    mode: "mutating",
    riskAreas: ["calendar"],
    changeId: "example-change",
    planFile: "docs/qa/changes/example.md",
    allowedPaths: ["docs/qa/changes/**"],
    ...overrides,
  };
}

function check(testManifest, text = validContract, changedFiles = ["docs/qa/changes/example.md"]) {
  return validateContract({
    manifest: testManifest,
    root: "/repo",
    changedFiles,
    fileExists: () => true,
    readText: () => text,
  });
}

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function createGitFixture() {
  const root = mkdtempSync(join(tmpdir(), "heavyuser-contract-"));
  git(root, ["init", "--quiet"]);
  writeFileSync(join(root, "README.md"), "base\n");
  git(root, ["add", "README.md"]);
  git(root, [
    "-c", "user.name=HeavyUser Test",
    "-c", "user.email=heavyuser@example.test",
    "commit", "--quiet", "-m", "base",
  ]);
  return root;
}

test("accepts a complete high-risk contract", () => {
  assert.deepEqual(check(manifest()).failures, []);
});

test("accepts a new contract file in the current work", () => {
  assert.deepEqual(check(manifest(), validContract, ["docs/qa/changes/example.md"]).failures, []);
});

test("accepts an untracked new contract file found by Git", () => {
  const root = createGitFixture();
  try {
    const planFile = "docs/qa/changes/example.md";
    mkdirSync(join(root, "docs/qa/changes"), { recursive: true });
    writeFileSync(join(root, planFile), validContract);
    const base = git(root, ["rev-parse", "HEAD"]);
    const changedFiles = collectChangedFiles(root, base);
    const result = validateContract({
      manifest: manifest({ planFile }),
      root,
      changedFiles,
    });
    assert.deepEqual(result.failures, []);
    assert.ok(changedFiles.includes(planFile));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a missing contract file", () => {
  const result = validateContract({
    manifest: manifest(),
    root: "/repo",
    changedFiles: ["src/lib/google/client.ts"],
    fileExists: () => false,
    readText: () => validContract,
  });
  assert.match(result.failures.join("\n"), /planFile does not exist/);
});

test("rejects an old unchanged contract", () => {
  const result = check(manifest({ riskAreas: ["calendar"] }), validContract, ["src/app/api/google/calendar/route.ts"]);
  assert.match(result.failures.join("\n"), /must be new or changed in the current work/);
});

test("rejects a contract whose Change ID does not match the manifest", () => {
  const result = check(manifest({ changeId: "new-change" }), validContract);
  assert.match(result.failures.join("\n"), /Change ID does not match manifest changeId/);
});

test("requires a plan file for high-risk work", () => {
  const result = check(manifest({ planFile: undefined }));
  assert.match(result.failures.join("\n"), /must declare planFile/);
});

test("allows an explicitly classified low-risk change without a plan", () => {
  const result = check(manifest({ riskAreas: ["ui"], planFile: undefined }));
  assert.deepEqual(result.failures, []);
});

test("rejects an invalid evidence status", () => {
  const result = check(manifest(), validContract.replace("| PASS | Covered. |", "| MAYBE | Covered. |"));
  assert.match(result.failures.join("\n"), /invalid status: MAYBE/);
});

test("reports malformed allowed path data instead of crashing", () => {
  const result = check(manifest({ allowedPaths: [null] }));
  assert.match(result.failures.join("\n"), /allowedPaths must contain only string patterns/);
});

test("reports malformed risk data instead of crashing", () => {
  const result = check(manifest({ riskAreas: "calendar" }), validContract, ["src/lib/google/client.ts"]);
  assert.match(result.failures.join("\n"), /mutating changes must declare at least one riskAreas entry|unknown riskAreas/);
});

test("requires a reason for blocked, not-run, and not-applicable rows", () => {
  const result = check(manifest(), validContract.replace("| BLOCKED | Account unavailable. |", "| BLOCKED |  |"));
  assert.match(result.failures.join("\n"), /must explain BLOCKED/);
});

test("rejects a contract outside the approved change-record directory", () => {
  const result = check(manifest({ planFile: "docs/engineering/change.md", allowedPaths: ["docs/engineering/**"] }));
  assert.match(result.failures.join("\n"), /must be stored under docs\/qa\/changes/);
});

test("requires every risk area when changed files touch several subsystems", () => {
  const result = validateContract({
    manifest: manifest({ riskAreas: ["calendar"] }),
    root: "/repo",
    changedFiles: ["src/lib/google/client.ts", "docs/qa/changes/example.md"],
    fileExists: () => true,
    readText: () => validContract,
  });
  assert.match(result.failures.join("\n"), /missing: retry, lifecycle/);
});

test("security risk requires the full contract", () => {
  const result = check(manifest({ riskAreas: ["security"], planFile: undefined }));
  assert.match(result.failures.join("\n"), /must declare planFile/);
});

test("a declared low-risk contract still needs a Change ID", () => {
  const result = check(manifest({ riskAreas: ["ui"], changeId: undefined }));
  assert.match(result.failures.join("\n"), /a declared contract must declare changeId/);
});

test("detects the main task screen risks", () => {
  assert.deepEqual(
    new Set(inferRiskAreas(["src/app/page.tsx"])),
    new Set(["timer", "persistence", "retry", "lifecycle", "ui-lifecycle"]),
  );
});

test("detects Spaces API risks", () => {
  assert.deepEqual(
    new Set(inferRiskAreas(["src/app/api/spaces/route.ts"])),
    new Set(["calendar", "scheduler", "supabase", "lifecycle"]),
  );
});

test("detects settings risks", () => {
  assert.deepEqual(
    new Set(inferRiskAreas(["src/app/settings/page.tsx"])),
    new Set(["auth", "calendar", "scheduler", "supabase", "persistence", "ui-lifecycle"]),
  );
});

test("detects authentication and security risks", () => {
  assert.deepEqual(new Set(inferRiskAreas(["src/app/login/page.tsx"])), new Set(["auth", "security"]));
  assert.deepEqual(new Set(inferRiskAreas(["src/proxy.ts"])), new Set(["auth", "security"]));
  assert.deepEqual(new Set(inferRiskAreas(["src/lib/security/http.ts"])), new Set(["security"]));
  assert.deepEqual(new Set(inferRiskAreas(["next.config.ts"])), new Set(["security"]));
  assert.deepEqual(new Set(inferRiskAreas(["supabase/migrations/20260814000000_test.sql"])), new Set(["supabase", "security"]));
  assert.deepEqual(new Set(inferRiskAreas([".github/workflows/ci.yml"])), new Set(["security"]));
  assert.deepEqual(new Set(inferRiskAreas([".github/dependabot.yml"])), new Set(["security"]));
});

test("keeps low-risk wording and visual changes lightweight", () => {
  const result = check(
    manifest({ riskAreas: ["ui"], planFile: undefined, changeId: undefined }),
    validContract,
    ["src/app/globals.css"],
  );
  assert.deepEqual(result.failures, []);
});

test("uses the pull-request base, push predecessor, and first-push fallback", () => {
  assert.deepEqual(resolveComparisonBase("/repo", "abc123"), { kind: "commit", ref: "abc123" });
  assert.deepEqual(resolveComparisonBase("/repo", ""), { kind: "working-tree", ref: "HEAD" });
  assert.deepEqual(resolveComparisonBase("/repo", "0".repeat(40)), {
    kind: "empty-tree",
    ref: "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
  });
});

test("collects tracked files from the selected base and all files on a first push", () => {
  const root = createGitFixture();
  try {
    const base = git(root, ["rev-parse", "HEAD"]);
    writeFileSync(join(root, "changed.ts"), "export const changed = true;\n");
    git(root, ["add", "changed.ts"]);
    git(root, [
      "-c", "user.name=HeavyUser Test",
      "-c", "user.email=heavyuser@example.test",
      "commit", "--quiet", "-m", "change",
    ]);

    assert.deepEqual(collectChangedFiles(root, base), ["changed.ts"]);
    assert.deepEqual(collectChangedFiles(root, "0".repeat(40)), ["README.md", "changed.ts"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("gives contract, scope, and release checks the same GitHub comparison point", () => {
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.match(
    workflow,
    /HEAVYUSER_SCOPE_BASE: \$\{\{ github\.event_name == 'pull_request' && github\.event\.pull_request\.base\.sha \|\| github\.event\.before \}\}/,
  );
  assert.equal((workflow.match(/HEAVYUSER_SCOPE_BASE:/g) ?? []).length, 1);
});
