import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("fresh HeavyUser placeholder exists", () => {
  const home = readFileSync("src/app/page.tsx", "utf8");
  assert.match(home, /A fresh start\./);
  assert.match(home, /rebuilding HeavyUser from the ground up/);
});

test("old task-management implementation was not brought into the fresh app", () => {
  assert.equal(existsSync("src/app/api/google"), false);
  assert.equal(existsSync("src/lib/scheduler"), false);
  assert.equal(existsSync("src/lib/timer"), false);
  assert.equal(existsSync("supabase/migrations"), false);
});

test("no backend credentials are referenced by the public placeholder", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const home = readFileSync("src/app/page.tsx", "utf8");
  assert.doesNotMatch(layout + home, /SUPABASE_SERVICE_ROLE_KEY|GOOGLE_CLIENT_SECRET|CRON_SECRET/);
});
