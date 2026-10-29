import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";

const page=()=>readFileSync("src/app/page.tsx","utf8");
const css=()=>readFileSync("src/app/quiet-redesign.css","utf8");
const views=()=>readFileSync("src/app/habit-views.tsx","utf8");
const metric=()=>readFileSync("src/app/habit-metrics.ts","utf8");
test("Lyra neutral theme remains intact and new overrides load after original styles",()=>{
 const p=page(),c=css(),theme=readFileSync("src/app/design-system.css","utf8");
 assert.match(theme,/--primary: #171717/);
 assert.match(theme,/--background: #fafafa/);
 assert.match(theme,/--radius: 0px/);
 assert.match(p,/import "\.\/brand\.css";\s*import "\.\/quiet-redesign\.css";/);
 assert.match(c,/--hu-ink: #171717/);
 assert.match(c,/--hu-quiet: #626262/);
 assert.doesNotMatch(c,/#(?:5369df|5a6bf7|d56e49|d67a53)\b/i);
});
test("the app preserves the original branding and primary views without Week navigation",()=>{
 const p=page();
 assert.match(p,/src="\/heavyuser-logo\.png"/);
 assert.match(p,/src="\/heavyuser-favicon\.png"/);
 for(const v of ['"today"','"insights"','"archive"'])assert.ok(p.includes(v));
 assert.doesNotMatch(p,/view==="week"|setView\("week"\)|<WeeklyGrid|tracker-week-workspace/);
 assert.match(p,/<MonthHeatmap/);
});
test("Today has meaningful progress hierarchy with zero-habit-safe percentage",()=>{
 const p=page(),c=css();
 assert.match(p,/className="hu-day-progress"/);
 assert.match(p,/role="progressbar" aria-label="Daily habits completed"/);
 assert.match(p,/scheduled\.length\?Math\.round\(done\/scheduled\.length\*100\):0/);
 assert.match(c,/\.hu-day-progress-track>span/);
});
test("habit rows remain quick-action first for every habit type",()=>{
 const p=page();
 assert.match(p,/className="tracker-quantity-inline"/);
 assert.match(p,/className=\{"tracker-check-inline "/);
 assert.match(p,/className="tracker-list-timer"/);
 assert.match(p,/onClick=\{\(\)=>timer\(h,"start"\)\}/);
 assert.match(p,/onClick=\{\(\)=>\{setFocusedId\(h\.id\);setMobileDetail\(true\)\}\}/);
});
test("the selected habit keeps a visible Edit and contextual Archive / Restore",()=>{
 const p=page();
 assert.match(p,/compact-habit-edit/);
 assert.match(p,/requestArchive\(focused\)/);
 assert.match(p,/compact-habit-restore/);
 assert.match(p,/requestHabitDelete\(focused\)/);
});
test("daily recording is ahead of visual progress and analytics",()=>{
 const p=page();
 const start=p.indexOf('<main className="compact-details"');
 const hero=p.indexOf("hu-main-record",start);
 const stats=p.indexOf('<section className="compact-stats">',start);
 const grid=p.indexOf('className="hu-progress-panels"',start);
 assert.ok(start>0&&hero>start&&stats>hero&&grid>stats);
});
test("calendar and trend are side-by-side without duplicate month calendars",()=>{
 const p=page(),c=css();
 assert.equal((p.match(/<MonthHeatmap/g)||[]).length,2);
 assert.match(p,/view==="archive"&&<section className="hu-archived-calendar"/);
 assert.match(p,/className="hu-progress-panels"><section className="compact-chart-section"/);
 assert.match(c,/\.hu-progress-panels\{\s*display:grid/);
 assert.match(c,/grid-template-columns:minmax\(0,1\.12fr\) minmax\(280px,\.88fr\)/);
});
test("recent history and quantity event history remain available on demand",()=>{
 const p=page();
 assert.match(p,/<details className="hu-detail-disclosure">/);
 assert.match(p,/<details className="hu-detail-disclosure hu-event-disclosure">/);
 assert.match(p,/className="compact-history-table"/);
 assert.match(p,/quantityEvents\.filter/);
 assert.match(p,/onClick=\{\(\)=>jumpToHistoryDate\(d\)\}/);
});
test("mobile primary navigation uses one More menu to preserve access to Archive",()=>{
 const p=page(),c=css();
 assert.match(p,/hu-mobile-more-trigger/);
 assert.match(p,/className="hu-mobile-more-popover"/);
 assert.match(p,/role="menu" aria-label="More destinations"/);
 assert.match(p,/setView\("archive"\)/);
 assert.match(p,/setSettingsOpen\(true\)/);
 assert.match(c,/@media\(max-width:650px\)/);
 assert.match(c,/\.hu-mobile-more-popover/);
});
test("the mobile More popup can be dismissed with Escape and outside pointer",()=>{
 const p=page();
 assert.match(p,/event\.key==="Escape"\)setMobileMore\(false\)/);
 assert.match(p,/mobileMoreRef\.current\?\.contains\(el\)/);
 assert.match(p,/document\.addEventListener\("pointerdown",onOutside\)/);
 assert.match(p,/setMobileMore\(false\)\},\[view,mobileDetail\]/);
});
test("only 0-4px radii are used for the newly designed controls",()=>{
 const c=css();
 const px=[...c.matchAll(/border-radius:\s*(\d+)px/gi)].map(m=>Number(m[1]));
 assert.ok(px.length>=1);
 assert.ok(px.every(r=>[0,2,4].includes(r)),JSON.stringify(px));
 assert.match(c,/--hu-radius: 2px/);
 assert.doesNotMatch(c,/border-radius:\s*(?:50%|9999px)/i);
});
test("responsive layouts include tablet and small-phone transitions",()=>{
 const c=css();
 for(const bp of [1180,850,650,380])assert.ok(c.includes("@media(max-width:"+bp+"px)"));
 assert.match(c,/\.compact-bottom-nav\{\s*display:flex/);
 assert.match(c,/min-height:44px/);
 assert.match(c,/env\(safe-area-inset-bottom\)/);
});
test("accessible secondary contrast and clear keyboard focus survive the redesign",()=>{
 const c=css();
 assert.match(c,/--hu-quiet: #626262/);
 assert.match(c,/button:focus-visible/);
 assert.match(c,/outline:2px solid #404040!important/);
 assert.match(c,/\.tracker-month-day\.state-done/);
});
test("business logic remains untouched",()=>{
 const p=page();
 assert.match(p,/async function saveEntry/);
 assert.match(p,/async function clearEntry/);
 assert.match(p,/async function undoQuantity/);
 assert.match(p,/function canUndoEntry/);
 assert.match(p,/async function saveReorder/);
 assert.match(metric(),/export function stateFor/);
 assert.match(views(),/export function WeeklyGrid/);
});
