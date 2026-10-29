import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {addDays,weekStart,isDue,stateFor,periodProgress,streaks,badHabitInsights} from "../src/app/habit-metrics.ts";

const base={id:"h",kind:"check",start_date:"2026-10-01",schedule_days:[0,1,2,3,4,5,6],frequency_mode:"selected_days",frequency_count:3,interval_days:2,target:1,direction:"at_least"};
const completed=d=>({habit_id:"h",local_date:d,completed:true,confirmed:true,value:1,explicit_status:"completed"});
const recorded=(d,n)=>({habit_id:"h",local_date:d,completed:null,confirmed:true,value:n});
test("selected days and alternate-day schedules are calculated using UTC dates",()=>{
 const weekdays={...base,schedule_days:[1,3,5]};
 assert.equal(isDue(weekdays,"2026-10-12"),true);
 assert.equal(isDue(weekdays,"2026-10-13"),false);
 const alternating={...base,frequency_mode:"interval",interval_days:2};
 assert.equal(isDue(alternating,"2026-10-01"),true);
 assert.equal(isDue(alternating,"2026-10-02"),false);
 assert.equal(isDue(alternating,"2026-10-03"),true);
});
test("weekly habits accept any three days, even if earlier weekdays are missed",()=>{
 const h={...base,frequency_mode:"weekly",frequency_count:3};
 const logs=[completed("2026-10-12"),completed("2026-10-14"),completed("2026-10-16")];
 assert.equal(weekStart("2026-10-16",1),"2026-10-12");
 assert.equal(weekStart("2026-10-16",0),"2026-10-11");
 assert.deepEqual(periodProgress(h,"2026-10-16",logs,"2026-10-16",[],()=>1,1).done,3);
 assert.deepEqual(periodProgress(h,"2026-10-16",logs,"2026-10-16",[],()=>1,1).required,3);
});
test("status makes explicit breaks and confirmed failures distinct from missing logs",()=>{
 const h={...base};
 const today="2026-10-16";
 assert.equal(stateFor(h,"2026-10-15",undefined,undefined,today),"unrecorded");
 assert.equal(stateFor(h,"2026-10-15",{...completed("2026-10-15"),explicit_status:"skipped"},1,today),"skipped");
 assert.equal(stateFor(h,"2026-10-15",{...completed("2026-10-15"),explicit_status:"missed"},1,today),"missed");
 assert.equal(stateFor(h,"2026-10-15",completed("2026-10-15"),1,today),"done");
});
test("negative habits require an explicit zero and today's under-limit status is provisional",()=>{
 const h={...base,kind:"quantity",direction:"at_most",target:4};
 assert.equal(stateFor(h,"2026-10-14",undefined,0,"2026-10-16"),"unrecorded");
 assert.equal(stateFor(h,"2026-10-14",recorded("2026-10-14",0),0,"2026-10-16"),"done");
 assert.equal(stateFor(h,"2026-10-16",recorded("2026-10-16",2),2,"2026-10-16"),"on_track");
 assert.equal(stateFor(h,"2026-10-16",recorded("2026-10-16",5),5,"2026-10-16"),"over_limit");
});
test("seven-day averages do not fabricate days where logging is missing",()=>{
 const h={...base,kind:"quantity",direction:"at_most",target:4};
 const entries=[recorded("2026-10-09",4),recorded("2026-10-10",4),recorded("2026-10-11",4),recorded("2026-10-12",4),recorded("2026-10-13",2),recorded("2026-10-14",0),recorded("2026-10-15",2)];
 const stats=badHabitInsights(h,entries,"2026-10-16",[]);
 assert.ok(Math.abs((stats?.average??0)-20/7)<1e-9);
 assert.equal(stats?.recorded,7);
 assert.equal(stats?.reduction,null); // Previous period doesn't contain 4 valid records
 assert.equal(stats?.zeroDays,1);
});
test("weekly streaks follow completed weeks, not one uninterrupted daily chain",()=>{
 const h={...base,frequency_mode:"weekly",frequency_count:2};
 const logs=[completed("2026-10-05"),completed("2026-10-07"),completed("2026-10-12"),completed("2026-10-15")];
 const stats=streaks(h,"2026-10-16",logs,[],()=>1,1);
 assert.equal(stats.unit,"week");
 assert.equal(stats.current,2);
});
test("history and ordering controls are present in responsive UI",()=>{
 const app=readFileSync("src/app/page.tsx","utf8");
 assert.doesNotMatch(app,/<WeeklyGrid/);
 assert.match(app,/<MonthHeatmap/);
 assert.match(app,/frequency_mode/);
 assert.match(app,/reorder_habits/);
 assert.match(app,/undo_quantity_event/);
 assert.match(app,/undo_entry_revision/);
 assert.match(app,/Skipped \(planned break\)/);
 const styles=readFileSync("src/app/habit-experience.css","utf8");
 assert.match(styles,/@media\(max-width:650px\)/);
});
