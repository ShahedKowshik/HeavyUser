import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {stateFor,periodProgress,streaks,badHabitInsights,isDue,addDays} from "../src/app/habit-metrics.ts";

const check={id:"brush",kind:"check",start_date:"2026-10-01",schedule_days:[0,1,2,3,4,5,6],frequency_mode:"selected_days",frequency_count:1,interval_days:2,target:1,direction:"at_least"};
const count={...check,id:"smoking",kind:"quantity",target:4,direction:"at_most"};
const entry=(date,other={})=>({habit_id:"brush",local_date:date,value:1,completed:true,confirmed:true,explicit_status:"completed",...other});
const historic="2026-10-15",today="2026-10-16";
const state=(h,e,d=historic,value)=>stateFor(h,d,e,value,today,[]);

test("REGRESSION: Brush with completed=false and stale explicit completed is NOT done",()=>{
 const inconsistent=entry(historic,{completed:false,value:0});
 assert.equal(state(check,inconsistent), "unrecorded");
 assert.notEqual(state(check,inconsistent),"done");
});
test("check-offs use the true checkbox, not a stale generic status",()=>{
 assert.equal(state(check,entry(historic)),"done");
 assert.equal(state(check,entry(historic,{explicit_status:null})),"done");
 assert.equal(state(check,entry(historic,{completed:false,explicit_status:null})),"unrecorded");
 assert.equal(state(check,entry(historic,{completed:null,value:null,explicit_status:null})),"unrecorded");
 assert.equal(state(check,undefined),"unrecorded");
});
test("explicitly missed and skipped are distinct and never successful",()=>{
 assert.equal(state(check,entry(historic,{explicit_status:"missed",completed:false,value:null})),"missed");
 assert.equal(state(check,entry(historic,{explicit_status:"skipped",completed:false,value:null})),"skipped");
});
test("calendar day before start or after today remains unavailable",()=>{
 assert.equal(stateFor({...check,start_date:today},historic,entry(historic),1,today,[]),"not_due");
 assert.equal(state(check,entry(addDays(today,1)),addDays(today,1)),"not_due");
});
test("weekly goals count one checked day only once; undo removes the win",()=>{
 const weekly={...check,frequency_mode:"weekly",frequency_count:2};
 const d1="2026-10-12",d2="2026-10-14";
 const withBoth=[entry(d1),entry(d2)];
 const withUndo=[entry(d1),entry(d2,{completed:false,value:0})];
 const calc=xs=>periodProgress(weekly,d1,xs,today,[],()=>1);
 assert.equal(calc(withBoth).done,2);
 assert.equal(calc(withUndo).done,1);
 assert.equal(calc(withUndo).recorded,1);
});
test("streaks drop after a completed day is undone, but today's pending state isn't failure",()=>{
 const historicalDates=["2026-10-13","2026-10-14","2026-10-15"].map(d=>entry(d));
 const h={...check,start_date:"2026-10-13"};
 assert.equal(streaks(h,today,historicalDates,[],()=>1).current,3);
 const undone=historicalDates.map(e=>e.local_date===historic?{...e,completed:false,value:0}:e);
 assert.equal(streaks(h,today,undone,[],()=>1).current,0);
});
test("confirmed zero is a valid smoking result, missing never means zero",()=>{
 const verified={...entry(historic,{habit_id:"smoking",completed:null,explicit_status:null}),value:0};
 assert.equal(state(count,undefined,historic,0),"unrecorded");
 assert.equal(state(count,verified,historic,0),"done");
 assert.equal(state(count,verified,today,0),"on_track");
});
test("rejected and skipped numeric records do not become goal achievements",()=>{
 const skipped=entry(historic,{habit_id:"smoking",completed:null,value:null,explicit_status:"skipped"});
 const failed=entry(historic,{habit_id:"smoking",completed:null,value:6,explicit_status:"missed"});
 assert.equal(state(count,skipped,historic,0),"skipped");
 assert.equal(state(count,failed,historic,6),"missed");
});
test("an empty sleep row does not become recorded progress",()=>{
 const sleep={...check,kind:"sleep",sleep_duration_goal:480};
 assert.equal(stateFor(sleep,historic,{...entry(historic),value:null,completed:null,explicit_status:null,asleep_at:null,awake_at:null},0,today,[]),"unrecorded");
});
test("duration from an actual timer counts as progress, without a timer remains unknown",()=>{
 const duration={...check,kind:"duration",target:60};
 assert.equal(stateFor(duration,historic,undefined,25,today,[]),"partial");
 assert.equal(stateFor(duration,historic,undefined,0,today,[]),"unrecorded");
});
test("smoking trend excludes skipped days and unknown days, includes genuine zero",()=>{
 const logs=[
  {...entry("2026-10-09",{habit_id:"smoking",completed:null,explicit_status:null}),value:4},
  {...entry("2026-10-10",{habit_id:"smoking",completed:null,explicit_status:"skipped"}),value:null},
  {...entry("2026-10-11",{habit_id:"smoking",completed:null,explicit_status:null}),value:0},
  {...entry("2026-10-12",{habit_id:"smoking",completed:null,explicit_status:null}),value:2}
 ];
 const info=badHabitInsights(count,logs,today,[]);
 assert.equal(info?.recorded,3);
 assert.equal(info?.zeroDays,1);
 assert.equal(info?.reduction,null);
});
test("all UI surfaces use the same state function, with no independent success override",()=>{
 const page=readFileSync("src/app/page.tsx","utf8");
 const views=readFileSync("src/app/habit-views.tsx","utf8");
 assert.match(page,/const dayState=\(h:Habit,date=day\)=>stateFor/);
 assert.match(page,/const success=\(h:Habit,date=day\)=>dayState\(h,date\)==="done"/);
 assert.match(page,/function recordedFor\(h:Habit,date:string\)\{\s*const state=dayState/);
 assert.match(page,/await toggleCheck\(h,day\)/);
 assert.match(page,/onClick=\{\(\)=>record\(h\)\}/);
 assert.match(page,/explicit_status:null/);
 assert.match(page,/function clearEntry/);
 assert.match(views,/stateFor\(h,d/);
 assert.match(views,/stateFor\(habit,day/);
});
test("the frontend prevents stale refreshes from overwriting a later update",()=>{
 const page=readFileSync("src/app/page.tsx","utf8");
 assert.match(page,/loadVersion\.current/);
 assert.match(page,/if\(version!==loadVersion\.current\)return/);
 assert.match(page,/const mutationLock=useRef\(new Set<string>\(\)\)/);
 assert.match(page,/mutationLock\.current\.has\(key\)/);
});
test("counter undo uses newest ordered event, and recent changes cannot be overwritten",()=>{
 const page=readFileSync("src/app/page.tsx","utf8");
 assert.match(page,/order=event_order\.desc/);
 assert.match(page,/order=revision_order\.desc/);
 assert.match(page,/item\.action==="undo"/);
});

test("legacy Brush corrections cannot be undone into contradictory data",()=>{
 const app=readFileSync("src/app/page.tsx","utf8");
 assert.match(app,/function canUndoEntry\(h:Habit,date:string\)/);
 assert.match(app,/revision\.before_data\?\.completed===false/);
 assert.match(app,/!canUndoEntry\(focused,day\)/);
 assert.match(app,/This old unchecked entry has already been corrected/);
});
