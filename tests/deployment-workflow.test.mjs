import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";

test("Only staging batches and approved production commits trigger automatic Vercel deployments",()=>{
 const cfg=JSON.parse(readFileSync("vercel.json","utf8"));
 const patterns=cfg.git.deploymentEnabled;
 assert.equal(patterns["**"],false);
 assert.equal(patterns.development,undefined);
 assert.equal(patterns.staging,true);
 assert.equal(patterns.main,true);
 assert.ok(cfg.$schema.startsWith("https://openapi.vercel.sh/"));
});
test("Browser-only release instructions preserve independent staging and production",()=>{
 const text=readFileSync("docs/RELEASE_WORKFLOW.md","utf8");
 assert.match(text,/staging\.heavyuser\.app/);
 assert.match(text,/web\.heavyuser\.app/);
 assert.match(text,/branch-specific/);
 assert.match(text,/Never automatically promote staging to production/);
});
