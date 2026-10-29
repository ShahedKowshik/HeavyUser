import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {
 habitToday,dayWindow,dayBoundaryInstant,fromZonedInput,toZonedInput,
 recordedSessionMinutes,safeZone,safeDayStart
} from "../src/app/habit-day.ts";
import {isDue,stateFor,badHabitInsights} from "../src/app/habit-metrics.ts";
const zone="Asia/Dhaka";
const utc=(s)=>new Date(s);
test("Night owl: October 16 01:30 belongs to October 15 when day resets 03:00",()=>{
 assert.equal(habitToday(utc("2026-10-15T19:30:00Z"),zone,180),"2026-10-15");
 assert.equal(habitToday(utc("2026-10-15T20:59:00Z"),zone,180),"2026-10-15");
 assert.equal(habitToday(utc("2026-10-15T21:00:00Z"),zone,180),"2026-10-16");
});
test("Default is midnight, current user old behavior remains until chosen otherwise",()=>{
 assert.equal(habitToday(utc("2026-10-15T18:00:00Z"),zone,0),"2026-10-16");
 assert.equal(habitToday(utc("2026-10-15T17:59:59Z"),zone,0),"2026-10-15");
});
test("Dates, month rollover, year rollover and leap day",()=>{
 assert.equal(habitToday(utc("2027-01-01T18:00:00Z"),zone,180),"2027-01-01");
 assert.equal(habitToday(utc("2028-02-29T19:00:00Z"),zone,180),"2028-02-29");
 assert.equal(habitToday(utc("2028-02-28T20:59:00Z"),zone,180),"2028-02-28");
});
test("Timezone support includes unusual 45-minute Nepal offset",()=>{
 assert.equal(habitToday(utc("2026-10-15T21:15:00Z"),"Asia/Kathmandu",180),"2026-10-16");
 assert.equal(habitToday(utc("2026-10-15T19:30:00Z"),"Asia/Kathmandu",180),"2026-10-15");
 assert.equal(safeZone("This/Is-Not-A-Zone"),"Asia/Dhaka");
});
test("Input reset range is validated; a timezone offset cannot become a reset time",()=>{
 assert.equal(safeDayStart(180),180);
 for(const n of [-1,1440,NaN,180.5])assert.equal(safeDayStart(n),0);
 assert.equal(safeDayStart(720),720);
 assert.equal(safeDayStart(1439),1439);
});
test("Day windows are continuous at the chosen boundary",()=>{
 const a=dayWindow("2026-10-15",zone,180);
 const b=dayWindow("2026-10-16",zone,180);
 assert.equal(new Date(a.start).toISOString(),"2026-10-14T21:00:00.000Z");
 assert.equal(new Date(a.end).toISOString(),"2026-10-15T21:00:00.000Z");
 assert.equal(a.end,b.start);
 assert.equal(a.end-a.start,24*3600000);
});
test("DST day can have 23 or 25 hours without losing local-day grouping",()=>{
 const spring=dayWindow("2026-03-08","America/New_York",0);
 const autumn=dayWindow("2026-11-01","America/New_York",0);
 assert.equal((spring.end-spring.start)/3600000,23);
 assert.equal((autumn.end-autumn.start)/3600000,25);
 assert.equal(habitToday(utc("2026-03-08T06:59:00Z"),"America/New_York",180),"2026-03-07");
 assert.equal(habitToday(utc("2026-03-08T07:00:00Z"),"America/New_York",180),"2026-03-08");
});
test("Nonexistent spring-forward 02:30 boundary advances to first available time",()=>{
 const at=dayBoundaryInstant("2026-03-08","America/New_York",150);
 assert.equal(new Date(at).toISOString(),"2026-03-08T07:00:00.000Z");
});
test("Ambiguous fall-back boundary uses first instance, not an arbitrary one",()=>{
 const at=dayBoundaryInstant("2026-11-01","America/New_York",90);
 assert.equal(new Date(at).toISOString(),"2026-11-01T05:30:00.000Z");
});
test("Manual sleep date input preserves afternoon, evening and DST instants",()=>{
 const evening=fromZonedInput("2026-10-16T22:15",zone);
 assert.equal(evening,"2026-10-16T16:15:00.000Z");
 assert.equal(toZonedInput(evening,zone),"2026-10-16T22:15");
 const morning=fromZonedInput("2026-10-16T01:30",zone);
 assert.equal(morning,"2026-10-15T19:30:00.000Z");
});
test("Timer minutes belong to logical days, even when started after midnight",()=>{
 const session={started_at:"2026-10-15T19:30:00Z",ended_at:"2026-10-15T21:30:00Z",paused_at:null,paused_total_ms:0};
 assert.equal(recordedSessionMinutes(session,"2026-10-15",zone,180,0),90);
 assert.equal(recordedSessionMinutes(session,"2026-10-16",zone,180,0),30);
 assert.equal(recordedSessionMinutes(session,"2026-10-14",zone,180,0),0);
});
test("Cross-boundary timer with existing total pause preserves the aggregate",()=>{
 const session={started_at:"2026-10-15T19:30:00Z",ended_at:"2026-10-15T21:30:00Z",paused_at:null,paused_total_ms:3600000};
 const a=recordedSessionMinutes(session,"2026-10-15",zone,180,0);
 const b=recordedSessionMinutes(session,"2026-10-16",zone,180,0);
 assert.equal(a+b,60);
});
test("An unstarted habit has no missed or completed historical days",()=>{
 const h={id:"new",kind:"check",start_date:"2026-10-16",target:1,direction:"at_least",schedule_days:[0,1,2,3,4,5,6],frequency_mode:"selected_days",frequency_count:1,interval_days:2};
 assert.equal(isDue(h,"2026-10-15",[]),false);
 assert.equal(stateFor(h,"2026-10-15",undefined,undefined,"2026-10-16",[]),"not_due");
 assert.equal(stateFor(h,"2026-10-16",undefined,undefined,"2026-10-16",[]),"unrecorded");
 assert.equal(stateFor(h,"2026-10-16",{habit_id:"new",local_date:"2026-10-16",completed:true,confirmed:true,value:1},1,"2026-10-16",[]),"done");
});
test("Pre-start quantity entries never count as verified zero days",()=>{
 const h={id:"smoking",kind:"quantity",start_date:"2026-10-15",target:4,direction:"at_most",schedule_days:[0,1,2,3,4,5,6],frequency_mode:"selected_days",frequency_count:1,interval_days:2};
 const old={habit_id:"smoking",local_date:"2026-10-12",completed:null,confirmed:true,value:0,explicit_status:null};
 const fresh={...old,local_date:"2026-10-15"};
 const stats=badHabitInsights(h,[old,fresh],"2026-10-17",[]);
 assert.equal(stats?.zeroDays,1);
});
test("Start date control and per-account settings are wired end-to-end",()=>{
 const page=readFileSync("src/app/page.tsx","utf8");
 const account=readFileSync("src/app/account-settings.tsx","utf8");
 assert.match(page,/start_date:form\.start_date/);
 assert.match(page,/type="date" required value=\{form\.start_date\}/);
 assert.match(page,/className="hu-day-boundary-note"/);
 assert.match(page,/selectedDate=\{day\}/);
 assert.match(page,/habitToday\(new Date\(now\),timeZone,dayStartMinutes\)/);
 assert.match(page,/recordedSessionMinutes\(s,date,timeZone,dayStartMinutes,now\)/);
 assert.match(page,/user_preferences\?select=week_starts_on,day_start_minutes,time_zone/);
 assert.match(account,/day_start_minutes:reset,time_zone:zone/);
 assert.match(account,/Use device time zone/);
});
test("Signout requires explicit confirmation, and never drops pending unsynced counters",()=>{
 const page=readFileSync("src/app/page.tsx","utf8");
 const account=readFileSync("src/app/account-settings.tsx","utf8");
 assert.match(account,/onClick=\{\(\)=>setConfirmSignOut\(true\)\}/);
 assert.match(account,/role="alertdialog" aria-modal="true"/);
 assert.match(account,/>Stay signed in<\/button>/);
 assert.match(account,/disabled=\{pendingCounters>0\}/);
 assert.match(page,/if\(counter\.pendingCount>0\)/);
});
test("Clock, entry form and stats use logical time but real timestamps remain factual",()=>{
 const page=readFileSync("src/app/page.tsx","utf8");
 assert.match(page,/datetimeLocal\(e\?\.asleep_at\|\|null,timeZone\)/);
 assert.match(page,/isoLocal\(v,timeZone\)/);
 assert.match(page,/const dayState=\(h:Habit,date=day\)=>stateFor/);
 assert.match(page,/effectiveToday\(\),versions/);
 assert.doesNotMatch(page,/new Date\(date\+"T00:00:00\+06:00"\)/);
});

test("A log dialog remembers its original habit day if reset occurs while the dialog is open",()=>{
 const source=readFileSync("src/app/page.tsx","utf8");
 assert.match(source,/const \[modalDate,setModalDate\]=useState\(ymd\(\)\)/);
 assert.match(source,/setModalDate\(day\)/);
 assert.match(source,/counter\.enqueue\(selected\.id,modalDate,"set",value\)/);
 assert.match(source,/saveEntry\(selected,\{value:Number\(quantity\),confirmed:true\},modalDate\)/);
 assert.match(source,/Recording for \{niceDate\(modalDate\)\}/);
});
test("History and direct quick actions cannot record before a future habit start",()=>{
 const s=readFileSync("src/app/page.tsx","utf8");
 assert.match(s,/day!==effectiveToday\(\)\|\|!isDue\(h,day,versions\)/);
 assert.match(s,/disabled=\{saving\|\|day>effectiveToday\(\)\|\|!isDue\(h,day,versions\)\}/);
 assert.match(s,/day<h\.start_date\?"Starts "\+niceDate\(h\.start_date\)/);
});
test("App waits for preferences instead of briefly showing an incorrect new day",()=>{
 const s=readFileSync("src/app/page.tsx","utf8");
 assert.match(s,/const \[prefsReady,setPrefsReady\]=useState\(false\)/);
 assert.match(s,/setPrefsReady\(true\)/);
 assert.match(s,/if\(!prefsReady\)return <main/);
});

test("Day settings avoid changing the time boundary while updates are unsynced",()=>{
 const s=readFileSync("src/app/account-settings.tsx","utf8");
 assert.match(s,/if\(pendingCounters>0\)throw Error\("Wait until all "/);
 assert.match(s,/disabled=\{!!pending\|\|!userId\|\|pendingCounters>0\}/);
 assert.match(s,/max="23:59" step="60"/);
});

test("Charts distinguish pre-start dates from unrecorded eligible dates",()=>{
 const p=readFileSync("src/app/page.tsx","utf8");
 const css=readFileSync("src/app/day-settings.css","utf8");
 assert.match(p,/const due=isDue\(focused,d,versions\)&&d<=effectiveToday\(\)/);
 assert.match(p,/!due\?"not-due"/);
 assert.match(p,/Blank: not scheduled/);
 assert.match(css,/\.compact-chart-bar\.not-due/);
});

test("Nonexistent DST wall time cannot silently become a different sleep timestamp",()=>{
 assert.throws(()=>fromZonedInput("2026-03-08T02:30","America/New_York"),/does not exist/);
});
