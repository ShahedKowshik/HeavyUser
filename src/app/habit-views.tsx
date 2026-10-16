"use client";
import type {MetricHabit,MetricEntry,ScheduleVersion,DayState} from "./habit-metrics";
import {addDays,dateUTC,effectiveSchedule,isDue,monthStart,monthLength,periodProgress,stateFor,weekStart} from "./habit-metrics";
type Props={
 habits:MetricHabit[];entries:MetricEntry[];today:string;selectedDate:string;first:0|1;
 versions:ScheduleVersion[];valueFor:(h:MetricHabit,date:string)=>number;
 onSelect:(h:MetricHabit,date:string)=>void;onNavigate:(date:string)=>void;onCheck:(h:MetricHabit,date:string)=>void;
};
const weekday=(d:string)=>dateUTC(d).toLocaleDateString("en-US",{weekday:"short",timeZone:"UTC"});
const short=(d:string)=>dateUTC(d).toLocaleDateString("en-US",{month:"short",day:"numeric",timeZone:"UTC"});
function label(s:DayState){
 switch(s){case "done":return "Completed";case "skipped":return "Skipped";case "missed":return "Missed";case "on_track":return "Within limit";case "partial":return "Progress recorded";case "over_limit":return "Over limit";case "not_due":return "Not scheduled";default:return "Not recorded";}
}
function character(s:DayState){
 switch(s){case "done":return "✓";case "skipped":return "→";case "missed":return "×";case "partial":return "•";case "on_track":return "•";case "over_limit":return "!";default:return "";}
}
export function WeeklyGrid({habits,entries,today,selectedDate,first,versions,valueFor,onSelect,onNavigate,onCheck}:Props){
 const start=weekStart(selectedDate,first),days=Array.from({length:7},(_,i)=>addDays(start,i));
 return <section className="tracker-week-screen">
   <div className="tracker-week-heading"><div><h2>Weekly overview</h2><p>{short(days[0])} – {short(days[6])}</p></div><div className="tracker-week-nav"><button type="button" onClick={()=>onSelectDate(-7)} aria-label="Previous week">‹</button><button type="button" onClick={()=>onSelectDate(7)} disabled={start>=weekStart(today,first)} aria-label="Next week">›</button></div></div>
   <p className="tracker-week-hint">Tap a day to record or review. Empty cells mean no record, not failure.</p>
   <div className="tracker-week-scroll">
     <div className="tracker-week-table" role="table" aria-label="Habits by day">
       <div className="tracker-week-head" role="row"><span role="columnheader">Habit</span>{days.map(d=><span key={d} role="columnheader" className={d===today?"current":""}>{weekday(d)}<small>{dateUTC(d).getUTCDate()}</small></span>)}<span role="columnheader">Goal</span></div>
       {habits.map(h=>{
        const schedule=effectiveSchedule(h,selectedDate,versions);
        const p=periodProgress(h,selectedDate,entries,today,versions,(d)=>valueFor(h,d),first);
        return <div className="tracker-week-row" role="row" key={h.id}><button className="tracker-week-name" onClick={()=>onSelect(h,selectedDate)} title={"Open "+h.id} role="rowheader">{(h as MetricHabit&{name?:string}).name||"Habit"}</button>
          {days.map(d=>{
           const e=entries.find(x=>x.habit_id===h.id&&x.local_date===d);
           const state=stateFor(h,d,e,(h.kind==="duration"||h.kind==="sleep")?valueFor(h,d):e?.value??undefined,today,versions);
           const isActionable=d<=today&&isDue(h,d,versions);
           return <div role="cell" key={d} className="tracker-week-cell-wrap"><button type="button" disabled={!isActionable} aria-label={short(d)+" "+label(state)+" — "+((h as MetricHabit&{name?:string}).name||"Habit")} title={short(d)+": "+label(state)} className={"tracker-week-cell state-"+state+(d===today?" today":"")} onClick={()=>h.kind==="check"?onCheck(h,d):onSelect(h,d)}>{character(state)}</button></div>;
          })}
          <span role="cell" className="tracker-week-goal">{schedule.frequency_mode==="weekly"||schedule.frequency_mode==="monthly"?p.done+"/"+p.required+(schedule.frequency_mode==="weekly"?" wk":" mo"):h.kind==="quantity"?"≤"+h.target:"—"}</span>
        </div>;
       })}
     </div>
   </div>
   <div className="tracker-grid-legend"><span>✓ Complete</span><span>→ Skipped</span><span>× Missed</span><span>• Partial / on track</span><span>Blank = unknown</span></div>
 </section>;
 function onSelectDate(offset:number){const proposed=addDays(selectedDate,offset);onNavigate(proposed)}
}
export function MonthHeatmap({habit,entries,today,selectedDate,first,versions,valueFor,onSelect}:{
 habit:MetricHabit;entries:MetricEntry[];today:string;selectedDate:string;first:0|1;versions:ScheduleVersion[];valueFor:(date:string)=>number;onSelect:(date:string)=>void
}){
 const start=monthStart(selectedDate),monthDays=monthLength(start),weekdayOffset=(dateUTC(start).getUTCDay()-first+7)%7;
 const monthLabel=dateUTC(start).toLocaleDateString("en-US",{month:"long",year:"numeric",timeZone:"UTC"});
 const cells=Array.from({length:Math.ceil((monthDays+weekdayOffset)/7)*7},(_,i)=>i-weekdayOffset+1);
 const changeMonth=(step:number)=>{const y=Number(start.slice(0,4)),m=Number(start.slice(5,7));const shifted=new Date(Date.UTC(y,m-1+step,1));onSelect(shifted.toISOString().slice(0,10))};
 return <section className="tracker-month-section">
  <div className="tracker-month-heading"><div><strong>Monthly calendar</strong><small>{monthLabel}</small></div><div className="tracker-month-controls"><button aria-label="Previous month" onClick={()=>changeMonth(-1)}>‹</button><button aria-label="Next month" disabled={start>=monthStart(today)} onClick={()=>changeMonth(1)}>›</button></div></div>
  <div className="tracker-month-grid">{(first===1?["M","T","W","T","F","S","S"]:["S","M","T","W","T","F","S"]).map((c,i)=><span key={"w"+i} className="tracker-month-weekday">{c}</span>)}
   {cells.map((n,i)=>{
    if(n<1||n>monthDays)return <span key={"empty"+i} className="tracker-month-empty"/>;
    const day=start.slice(0,8)+String(n).padStart(2,"0");const e=entries.find(e=>e.habit_id===habit.id&&e.local_date===day);
    const state=stateFor(habit,day,e,(habit.kind==="sleep"||habit.kind==="duration")?valueFor(day):e?.value??undefined,today,versions);
    return <button type="button" key={day} disabled={day>today||day<habit.start_date} onClick={()=>onSelect(day)} title={short(day)+": "+label(state)}
      aria-label={short(day)+" "+label(state)} className={"tracker-month-day state-"+state+(day===selectedDate?" chosen":"")}><span>{n}</span>{state!=="not_due"&&state!=="unrecorded"&&<b>{character(state)}</b>}</button>;
   })}
  </div>
  <p className="tracker-month-caption">Select a date to view or correct it. Unrecorded days aren't treated as failed.</p>
 </section>;
}
