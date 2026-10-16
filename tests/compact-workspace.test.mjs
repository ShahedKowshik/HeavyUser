import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
const code=()=>readFileSync("src/app/page.tsx","utf8");
const css=()=>readFileSync("src/app/compact.css","utf8");
test("three-region layout: navigation, selectable habits and detail statistics",()=>{
  const s=code();assert.match(s,/compact-sidebar/);assert.match(s,/compact-list-item/);
  assert.match(s,/setFocusedId\(h.id\)/);assert.match(s,/compact-detail-body/);
  assert.match(s,/monthAchieved/);assert.match(s,/compact-history-table/);
});
test("archived habits have a dedicated navigation and restore option",()=>{
  const s=code();assert.match(s,/view==="archive"/);
  assert.match(s,/async function restoreHabit/);assert.match(s,/archived_at:null/);
  assert.match(s,/archived_at:new Date\(\).toISOString\(\)/);
});
test("permanent delete requires archive, exact name and server-verified deletion",()=>{
  const s=code();assert.match(s,/if\(!h.archived_at/);assert.match(s,/deleteText!==h.name/);
  assert.match(s,/archived_at=not.is.null&select=id/);assert.match(s,/method:"DELETE"/);
  assert.match(s,/Prefer:"return=representation"/);assert.match(s,/deleted.length!==1/);
});
test("deletion only targets habit and relies on cascading child rows",()=>{
  const s=code();assert.doesNotMatch(s,/method:"DELETE"[^\n]+habit_entries/);
  assert.doesNotMatch(s,/method:"DELETE"[^\n]+work_sessions/);
});
test("responsive list-to-detail navigation works on mobile",()=>{
  const app=code(),styles=css();assert.match(app,/setMobileDetail\(true\)/);
  assert.match(app,/compact-mobile-back/);assert.match(styles,/@media \(max-width:650px\)/);
  assert.match(styles,/\.compact-layout\.mobile-detail \.compact-details\{display:block\}/);
});
