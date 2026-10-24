import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";

test("Only main is allowed to auto-deploy on Vercel",()=>{
 const cfg=JSON.parse(readFileSync("vercel.json","utf8"));
 const patterns=cfg.git.deploymentEnabled;
 assert.equal(patterns["**"],false);
 assert.equal(patterns.main,true);
 assert.equal(patterns.staging,undefined);
 assert.equal(patterns.development,undefined);
 assert.ok(cfg.$schema.startsWith("https://openapi.vercel.sh/"));
});

test("Netlify builds only development branch previews",()=>{
 const config=readFileSync("netlify.toml","utf8");
 assert.match(config,/command = "npm run build"/);
 assert.match(config,/publish = "\.next"/);
 assert.match(config,/\$CONTEXT.*branch-deploy/);
 assert.match(config,/\$BRANCH.*development/);
 assert.match(config,/exit 1; else exit 0/);
});

test("Release instructions keep Netlify staging separate from Vercel production",()=>{
 const instructions=readFileSync("docs/RELEASE_WORKFLOW.md","utf8");
 assert.match(instructions,/development/);
 assert.match(instructions,/Netlify/);
 assert.match(instructions,/web\.heavyuser\.app/);
 assert.match(instructions,/test account/);
});
