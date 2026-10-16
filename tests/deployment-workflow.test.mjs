import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
test("Automatic development deployments are disabled while main production stays enabled",()=>{
 const cfg=JSON.parse(readFileSync("vercel.json","utf8"));
 assert.equal(cfg.git?.deploymentEnabled?.["**"],false);
 assert.equal(cfg.git?.deploymentEnabled?.main,true);
 assert.ok(cfg.$schema?.startsWith("https://openapi.vercel.sh/"));
});
