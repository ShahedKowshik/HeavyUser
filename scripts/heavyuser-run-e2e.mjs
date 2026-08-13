import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const tsconfigPath = resolve(root, "tsconfig.json");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function gitStatus() {
  return spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: root, encoding: "utf8" }).stdout;
}

const statusBefore = gitStatus();
const tsconfigBefore = readFileSync(tsconfigPath);
const result = spawnSync(pnpm, ["exec", "playwright", "test"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

let workspaceChanged = false;
try {
  const tsconfigAfter = readFileSync(tsconfigPath);
  if (!tsconfigAfter.equals(tsconfigBefore)) {
    writeFileSync(tsconfigPath, tsconfigBefore);
    console.warn("E2E restored the tracked tsconfig.json snapshot after the development server changed it.");
  }
  workspaceChanged = gitStatus() !== statusBefore;
} catch (error) {
  console.error(`E2E workspace guard failed: ${error instanceof Error ? error.message : String(error)}`);
  workspaceChanged = true;
}

if (workspaceChanged) {
  console.error("E2E workspace guard failed: the test run left new tracked or untracked changes.");
  console.error(gitStatus());
}

if (result.error) {
  console.error(`E2E failed to start: ${result.error.message}`);
  process.exit(1);
}

process.exitCode = workspaceChanged ? 1 : (result.status ?? 1);
