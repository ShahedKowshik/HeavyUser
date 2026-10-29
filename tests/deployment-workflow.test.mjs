import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
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

test("Netlify stages development at the primary site or a branch URL, never main",()=>{
 const config=readFileSync("netlify.toml","utf8");
 assert.match(config,/command = "npm run build"/);
 assert.match(config,/publish = "\.next"/);
 const match=config.match(/^\s*ignore = ("(?:\\.|[^"])*")\s*$/m);
 assert.ok(match,"expected an ignore command in netlify.toml");
 const command=JSON.parse(match[1]);
 const run=(BRANCH,CONTEXT)=>{
  const result=spawnSync("bash",["-c",command],{env:{...process.env,BRANCH,CONTEXT},encoding:"utf8"});
  assert.equal(result.error,undefined,result.stderr);
  return result.status;
 };
 assert.equal(run("development","production"),1,"primary Netlify URL should stage development");
 assert.equal(run("development","branch-deploy"),1,"temporary branch preview should build");
 assert.equal(run("development","deploy-preview"),0,"PR preview should be skipped");
 assert.equal(run("main","production"),0,"main should never build on Netlify after configuration");
 assert.equal(run("staging","branch-deploy"),0,"obsolete staging should be skipped");
});

test("Release instructions keep Netlify staging separate from Vercel production",()=>{
 const instructions=readFileSync("docs/RELEASE_WORKFLOW.md","utf8");
 assert.match(instructions,/development/);
 assert.match(instructions,/Netlify/);
 assert.match(instructions,/web\.heavyuser\.app/);
 assert.match(instructions,/same Supabase project/);
});
