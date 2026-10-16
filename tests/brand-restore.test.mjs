import assert from "node:assert/strict";
import {readFileSync,statSync} from "node:fs";
import {test} from "node:test";

const page=()=>readFileSync("src/app/page.tsx","utf8");
const styles=()=>readFileSync("src/app/brand.css","utf8");
const layout=()=>readFileSync("src/app/layout.tsx","utf8");
function png(path){
 const b=readFileSync(path);
 assert.deepEqual([...b.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 assert.equal(b.toString("ascii",12,16),"IHDR");
 return {width:b.readUInt32BE(16),height:b.readUInt32BE(20),bytes:b.length};
}
test("original tracked HeavyUser assets exist and are valid PNGs",()=>{
 const logo=png("public/heavyuser-logo.png");
 const favicon=png("public/heavyuser-favicon.png");
 assert.ok(logo.width>logo.height,"full wordmark is horizontal");
 assert.ok(logo.bytes>1000&&logo.bytes<100_000,"small lightweight original wordmark");
 assert.ok(favicon.width>0&&favicon.height>0);
 assert.ok(statSync("public/heavyuser-favicon.png").size<300_000);
});
test("full wordmark replaces temporary H branding without duplicating text",()=>{
 const app=page();
 assert.match(app,/className="compact-brand-wordmark" src="\/heavyuser-logo\.png" alt="HeavyUser"/);
 assert.match(app,/className="compact-brand-icon" src="\/heavyuser-favicon\.png" alt=""/);
 assert.equal((app.match(/className="auth-brand-image"/g)||[]).length,2);
 assert.doesNotMatch(app,/className="compact-logo">H/);
 assert.doesNotMatch(app,/className="brand-mark">H/);
});
test("favicon metadata references restored icon for browser and mobile shortcut",()=>{
 const metadata=layout();
 assert.match(metadata,/icons:\{icon:\[\{url:"\/heavyuser-favicon\.png"/);
 assert.match(metadata,/shortcut:"\/heavyuser-favicon\.png"/);
 assert.match(metadata,/apple:\[\{url:"\/heavyuser-favicon\.png"/);
});
test("logo sizes fit compact and collapsed navigation without stretching artwork",()=>{
 const style=styles(),app=page();
 assert.match(app,/import "\.\/brand\.css"/);
 assert.match(style,/\.compact-brand-wordmark\{/);
 assert.match(style,/width:136px/);
 assert.match(style,/object-fit:contain/);
 assert.match(style,/@media \(min-width:651px\) and \(max-width:850px\)/);
 assert.match(style,/\.compact-brand-icon\{display:block/);
});
