import assert from "node:assert/strict";import {existsSync,readFileSync} from "node:fs";import {test} from "node:test";
test("MVP dashboard and responsive styling exist",()=>{const page=readFileSync("src/app/page.tsx","utf8");const css=readFileSync("src/app/dashboard.css","utf8");assert.match(page,/Daily rhythm/);assert.match(page,/sleep/);assert.match(page,/insights/);assert.match(css,/@media\(max-width:750px\)/);});
test("the legacy calendar scheduler was not restored",()=>{assert.equal(existsSync("src/app/api/google"),false);assert.equal(existsSync("src/lib/scheduler"),false);});
test("no privileged backend credentials in browser source",()=>{const page=readFileSync("src/app/page.tsx","utf8");assert.doesNotMatch(page,/SUPABASE_SERVICE_ROLE_KEY|GOOGLE_CLIENT_SECRET|CRON_SECRET/);});
