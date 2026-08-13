import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const temporaryDirectory = mkdtempSync(resolve(tmpdir(), "heavyuser-types-"));
const trackedPath = resolve(root, "src/lib/supabase/database.types.ts");

try {
  const generated = execFileSync("pnpm", ["exec", "supabase", "gen", "types", "typescript", "--linked", "--schema", "public"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  const expected = readFileSync(trackedPath, "utf8");
  if (generated !== expected) {
    console.error("Supabase generated-type check failed: tracked database.types.ts differs from the linked schema.");
    process.exitCode = 1;
  } else {
    console.log("Supabase generated-type check passed");
  }
} catch (error) {
  console.error(`Supabase generated-type check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
