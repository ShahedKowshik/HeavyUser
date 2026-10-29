import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";

const page=()=>readFileSync("src/app/page.tsx","utf8");
const views=()=>readFileSync("src/app/habit-views.tsx","utf8");
const css=()=>readFileSync("src/app/ui-audit.css","utf8");
const account=()=>readFileSync("src/app/account-settings.tsx","utf8");

function luminance(hex){
 const channels=hex.replace("#","").match(/.{2}/g).map(part=>parseInt(part,16)/255)
  .map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
 return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)}

test("secondary text meets normal text contrast against white and light backgrounds",()=>{
 assert.ok(contrast("#626262","#ffffff")>=4.5);
 assert.ok(contrast("#626262","#fafafa")>=4.5);
 assert.ok(contrast("#525252","#ffffff")>=4.5);
});
test("non-text chart bar distinction meets a 3:1 contrast threshold on white",()=>{
 assert.ok(contrast("#858585","#ffffff")>=3);
 assert.ok(contrast("#8a8a8a","#ffffff")>=3);
});
test("compact typography is explicitly normalized after legacy CSS imports",()=>{
 const s=page(),style=css();
 assert.match(s,/import "\.\/ux-consistency\.css";\s*import "\.\/ui-audit\.css";/);
 assert.match(style,/\.compact-list-item-copy small/);
 assert.match(style,/\.compact-chart-caption/);
 assert.match(style,/\.compact-history-state/);
 assert.match(style,/font-size:12px;\s*line-height:1\.45/);
});
test("weekly grid uses correct row heading semantics without replacing the button role",()=>{
 const s=views();
 assert.match(s,/<div role="rowheader" className="tracker-week-row-name"><button type="button"/);
 assert.doesNotMatch(s,/<button[^>]*role="rowheader"/);
 assert.match(css(),/\.tracker-week-row-name\{\s*min-width:0;\s*position:sticky/);
});
test("wide week table is keyboard-scrollable and explains side-scrolling on mobile",()=>{
 const s=views(),style=css();
 assert.match(s,/role="region" aria-label="Weekly habit table; scroll horizontally for more days" tabIndex=\{0\}/);
 assert.match(s,/tracker-week-swipe-hint/);
 assert.match(style,/\.tracker-week-swipe-hint\{display:inline\}/);
 assert.match(s,/tracker-week-empty/);
});
test("calendar dates announce both today and selected date",()=>{
 const s=views();
 assert.match(s,/aria-current=\{day===today\?"date":undefined\}/);
 assert.match(s,/aria-pressed=\{day===selectedDate\}/);
 assert.match(s,/dateUTC\(day\)\.toLocaleDateString\("en-US",\{weekday:"long"/);
 assert.match(s,/aria-live="polite"/);
});
test("weekly buttons expose check-off toggle state and concrete action to screen readers",()=>{
 const s=views();
 assert.match(s,/aria-pressed=\{h\.kind==="check"\?state==="done":undefined\}/);
 assert.match(s,/Select to undo/);
 assert.match(s,/Select to complete/);
});
test("form weekday buttons expose full names and toggle state",()=>{
 const s=page();
 assert.match(s,/className="week-select" role="group" aria-label="Repeat on these days"/);
 assert.match(s,/aria-label=\{\["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"\]\[i\]\}/);
 assert.match(s,/aria-pressed=\{form\.schedule_days\.includes\(i\)\}/);
});
test("navigation exposes active-page state on both desktop and mobile",()=>{
 const s=page();
 assert.match(s,/aria-current=\{view==="today"\?"page":undefined\}/);
 assert.doesNotMatch(s,/aria-current=\{view==="week"\?"page":undefined\}/);
 assert.match(s,/aria-current=\{view==="archive"\?"page":undefined\}/);
 assert.match(s,/aria-label="Mobile navigation"/);
});
test("chart range buttons have useful names and the chart references textual history",()=>{
 const s=page();
 assert.match(s,/aria-label=\{"Show last "\+n\+" days"\}/);
 assert.match(s,/Daily values and statuses are listed in Recent history below/);
});
test("date selection respects reduced-motion preferences",()=>{
 const s=page();
 assert.match(s,/matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
 assert.match(css(),/@media\(prefers-reduced-motion:reduce\)/);
});
test("important phone controls have appropriately sized targets and text inputs avoid iOS zoom",()=>{
 const c=css();
 assert.match(c,/@media\(max-width:650px\)/);
 assert.match(c,/\.tracker-quantity-inline button\{height:44px;width:44px;flex-basis:44px\}/);
 assert.match(c,/\.tracker-month-day\{min-height:44px;font-size:12px\}/);
 assert.match(c,/\.compact-bottom-nav button\{min-height:60px;font-size:12px\}/);
 assert.match(c,/\.account-panel \.account-form input\{font-size:16px\}/);
 assert.match(c,/\.modal \.modal-form :is\(input,select\)\{font-size:16px\}/);
});
test("small phone statistics reflow instead of forcing three cramped columns",()=>{
 const c=css();
 assert.match(c,/@media\(max-width:420px\)/);
 assert.match(c,/\.compact-stat-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(c,/\.compact-stat-grid>div:nth-child\(3\)\{grid-column:1\/-1/);
});
test("account dialog receives keyboard focus and restores opener when closed",()=>{
 const s=account();
 assert.match(s,/previous=document\.activeElement instanceof HTMLElement/);
 assert.match(s,/requestAnimationFrame\(\(\)=>panelRef\.current\?\.querySelector/);
 assert.match(s,/previous\?\.focus\(\)/);
 assert.match(s,/if\(e\.key!=="Tab"\)return/);
});
test("interactive UI maintains visible focus indicators",()=>{
 const c=css();
 assert.match(c,/\.compact-app button:focus-visible/);
 assert.match(c,/\.compact-app \[role="region"\]:focus-visible/);
 assert.match(c,/outline:2px solid #525252/);
});
