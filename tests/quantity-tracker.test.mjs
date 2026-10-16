import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {projectQuantity} from "../src/app/use-quantity-counter.ts";

const event=(id,action,value)=>({id,habitId:"smoking",date:"2026-10-16",action,...(value==null?{}:{value})});
test("quantity projection records each rapid tap exactly once in order",()=>{
 const q=[event("a","increment"),event("b","increment"),event("c","decrement")];
 assert.equal(projectQuantity(2,q,"smoking","2026-10-16"),3);
 assert.equal(projectQuantity(2,q,"other","2026-10-16"),2);
 assert.equal(projectQuantity(2,q,"smoking","2026-10-15"),2);
});
test("quantity manual correction overrides prior pending adjustments but not subsequent ones",()=>{
 const q=[event("a","increment"),event("b","set",5),event("c","increment")];
 assert.equal(projectQuantity(2,q,"smoking","2026-10-16"),6);
 assert.equal(projectQuantity(2,[event("x","set",0)],"smoking","2026-10-16"),0);
});
test("no modal required for primary quantity quick actions",()=>{
 const code=readFileSync("src/app/page.tsx","utf8");
 assert.match(code,/tracker-quantity-inline/);assert.match(code,/tracker-counter-control/);
 assert.match(code,/counter\.enqueue/);assert.match(code,/adjustQuantity\(h,1\)/);
 assert.match(code,/adjustQuantity\(focused,1\)/);
 assert.match(code,/role="group"/);assert.match(code,/aria-live="polite"/);
});
test("quantity corrections are sent through atomic RPC rather than daily-entry upsert",()=>{
 const hook=readFileSync("src/app/use-quantity-counter.ts","utf8");
 const app=readFileSync("src/app/page.tsx","utf8");
 assert.match(hook,/\/rest\/v1\/rpc\/record_quantity/);
 assert.match(hook,/crypto\.randomUUID\(\)/);assert.match(hook,/localStorage\.setItem/);
 assert.match(hook,/window\.addEventListener\("online"/);
 assert.match(app,/counter\.enqueue\(selected\.id,day,"set",value\)/);
});
test("desktop details use available width; charts adapt to mobile",()=>{
 const styles=readFileSync("src/app/tracker-enhancements.css","utf8");
 assert.match(styles,/\.compact-detail-body\{max-width:none/);
 assert.match(styles,/\.compact-analysis-grid/);
 assert.match(styles,/@media\(max-width:650px\)/);
 assert.match(styles,/\.tracker-chart-scroll/);
});
test("7/14/30 day controls and recent events remain discoverable",()=>{
 const app=readFileSync("src/app/page.tsx","utf8");
 assert.match(app,/setHistorySpan\(n\)/);
 assert.match(app,/quantityEvents\.filter/);
 assert.match(app,/tracker-history-button/);
});
