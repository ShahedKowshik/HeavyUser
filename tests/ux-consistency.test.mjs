import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
const page=()=>readFileSync("src/app/page.tsx","utf8");
const calendar=()=>readFileSync("src/app/habit-views.tsx","utf8");
const account=()=>readFileSync("src/app/account-settings.tsx","utf8");
const styles=()=>readFileSync("src/app/ux-consistency.css","utf8");

test("habit edit and archive share a visible management area in the details header",()=>{
 const s=page();
 assert.match(s,/compact-habit-actions/);
 assert.match(s,/compact-habit-edit/);
 assert.match(s,/compact-habit-menu/);
 assert.match(s,/requestArchive\(focused\)/);
 assert.match(s,/requestHabitDelete\(focused\)/);
 assert.match(s,/More actions for /);
 assert.doesNotMatch(s,/className="compact-secondary-actions"/);
 assert.doesNotMatch(s,/className="danger-text" onClick=\{\(\)=>archiveHabit/);
});
test("archive is immediate and reversible; permanent deletion still confirms",()=>{
 const s=page();
 assert.doesNotMatch(s,/modal==="archive"/);
 assert.match(s,/function requestArchive\(h:Habit\)\{setHabitMenuOpenId\(null\);void archiveHabit\(h\)\}/);
 assert.match(s,/Archive habit/);
 assert.match(s,/undoId:h.id/);
 assert.match(s,/modal==="delete"/);
 assert.match(s,/void restoreHabit\(h\)/);
 assert.doesNotMatch(s,/\bconfirm\("Archive /);
});
test("archive, restore and delete have no duplicated management buttons",()=>{
 const s=page();
 assert.match(s,/compact-habit-restore/);
 assert.match(s,/compact-archived-summary/);
 assert.doesNotMatch(s,/className="compact-archive-actions"/);
});
test("keyboard and touch modals are accessible and prevent unintentional dismissal",()=>{
 const s=page(),css=styles();
 assert.match(s,/role="dialog" aria-modal="true" aria-labelledby="habit-dialog-title"/);
 assert.match(s,/ref=\{dialogRef\} onKeyDown=\{dialogKeyDown\}/);
 assert.match(s,/if\(e.key==="Escape"\)/);
 assert.match(s,/if\(e.key!=="Tab"\)return/);
 assert.match(s,/function closeModal\(\)\{if\(saving\)return/);
 assert.doesNotMatch(s,/className="modal-backdrop" onMouseDown/);
 assert.match(css,/\.modal-backdrop\{align-items:flex-end;padding:0\}/);
});
test("all input forms provide cancel, and failures do not close data-entry modals",()=>{
 const s=page();
 assert.match(s,/async function saveEntry\(h:Habit,patch:Record<string,unknown>,date=day\):Promise<boolean>/);
 assert.match(s,/if\(await saveEntry\(selected,\{value:Number\(quantity\),confirmed:true\}\)\)setModal\(null\)/);
 assert.match(s,/if\(await saveEntry\(selected,\{\.\.\.data,value:minute/);
 assert.match(s,/compact-form-cancel/);
});
test("calendar browsing is separate from choosing a tracking date",()=>{
 const s=page(),v=calendar();
 assert.match(v,/visibleMonth:string/);
 assert.match(v,/onNavigate\(shifted\.toISOString\(\)\.slice\(0,10\)\)/);
 assert.match(s,/selectedDate=\{day\} visibleMonth=\{calendarDate\}/);
 assert.match(s,/onSelect=\{jumpToHistoryDate\} onNavigate=\{setCalendarDate\}/);
});
test("history editing has a visible selected date and returns to recording controls",()=>{
 const s=page();
 assert.match(s,/function jumpToHistoryDate\(date:string\)/);
 assert.match(s,/scrollTo\(\{top:0,behavior\}\)/);
 assert.match(s,/prefers-reduced-motion: reduce/);
 assert.match(s,/aria-current=\{day===d\?"date":undefined\}/);
});
test("selected habit, active checks and saved results have clear feedback",()=>{
 const s=page(),css=styles();
 assert.match(s,/aria-current=\{focused\?\.id===h\.id\?"true":undefined\}/);
 assert.match(s,/aria-pressed=\{success\(h\)\}/);
 assert.match(s,/role="status"/);
 assert.match(s,/setNotice\(\{message:editing\?"Habit changes saved":"Habit created"\}\)/);
 assert.match(css,/\.compact-feedback/);
});
test("the archive list doesn't show an irrelevant add control",()=>{
 const s=page();
 assert.match(s,/view!=="archive"&&<button className="compact-add"/);
});
test("account settings are concise and contain only one sign-out action",()=>{
 const s=account();
 assert.equal((s.match(/className="account-tab-signout"/g)||[]).length,1);
 assert.match(s,/role="alertdialog" aria-modal="true"/);
 assert.match(s,/Profile, security and data/);
 assert.doesNotMatch(s,/YOUR WORKSPACE/);
 assert.doesNotMatch(s,/className="account-backdrop" onMouseDown/);
});
test("every management control works on phone-sized screens",()=>{
 const css=styles();
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/\.compact-habit-more\{width:44px\}/);
 assert.match(css,/env\(safe-area-inset-bottom\)/);
 assert.match(css,/\.modal-footer button\{min-height:44px\}/);
});

test("account settings Escape and close do not interrupt pending operations",()=>{
 const s=account();
 assert.match(s,/if\(e.key==="Escape"&&!pending\)\{if\(confirmSignOut\)setConfirmSignOut\(false\);else onClose\(\)\}/);
 assert.match(s,/aria-label="Close settings" disabled=\{!!pending\}/);
 assert.match(s,/if\(e\.key!=="Tab"\)return/);
});
