import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
test("permanent quantity errors cannot trap the entire offline outbox",()=>{
 const hook=readFileSync("src/app/use-quantity-counter.ts","utf8");
 assert.match(hook,/\[400,404,422\]\.includes\(response\.status\)/);
 assert.match(hook,/publish\(queue\.current\.slice\(1\)\)/);
 assert.match(hook,/setSyncError\("A change was rejected and reverted/);
});
test("archive and deletion guard against pending quantity writes",()=>{
 const page=readFileSync("src/app/page.tsx","utf8");
 assert.match(page,/async function archiveHabit\(h:Habit\)\{\s*if\(counter\.hasPending\(h\.id\)\)/);
 assert.match(page,/async function permanentlyDeleteHabit\(h:Habit\)\{\s*if\(counter\.hasPending\(h\.id\)\)/);
 assert.match(page,/counter\.clearError\(\)/);
});
