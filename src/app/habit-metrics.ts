export type FrequencyMode="selected_days"|"weekly"|"monthly"|"interval";
export type Schedule={frequency_mode:FrequencyMode;frequency_count:number;interval_days:number;schedule_days:number[];target:number;direction:"at_least"|"at_most"};
export type MetricHabit=Schedule&{id:string;kind:"check"|"quantity"|"duration"|"sleep";start_date:string;sleep_duration_goal?:number|null};
export type MetricEntry={habit_id:string;local_date:string;completed:boolean|null;confirmed:boolean;value:number|null;explicit_status?:string|null};
export type ScheduleVersion=Schedule&{habit_id:string;effective_date:string};
export type DayState="not_due"|"unrecorded"|"done"|"partial"|"on_track"|"missed"|"skipped"|"over_limit";
export const DAY_MS=86400000;
export const dateUTC=(d:string)=>new Date(d+"T12:00:00Z");
export const addDays=(day:string,n:number)=>{const date=dateUTC(day);date.setUTCDate(date.getUTCDate()+n);return date.toISOString().slice(0,10)};
export const dateDiff=(start:string,end:string)=>Math.round((dateUTC(end).getTime()-dateUTC(start).getTime())/DAY_MS);
export function weekStart(day:string,first:0|1=1){
 const weekday=dateUTC(day).getUTCDay();return addDays(day,-((weekday-first+7)%7));
}
export function monthStart(day:string){return day.slice(0,7)+"-01"}
export function monthEnd(day:string){const y=Number(day.slice(0,4)),m=Number(day.slice(5,7));return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)} 
export function monthLength(day:string){return new Date(Date.UTC(+day.slice(0,4),+day.slice(5,7),0)).getUTCDate()}
export function effectiveSchedule(h:MetricHabit,date:string,versions:ScheduleVersion[]=[]):Schedule{
 let latest:ScheduleVersion|undefined;
 for(const v of versions)if(v.habit_id===h.id&&v.effective_date<=date&&(!latest||v.effective_date>latest.effective_date))latest=v;
 return latest??h;
}
export function isDue(h:MetricHabit,date:string,versions:ScheduleVersion[]=[]):boolean{
 if(date<h.start_date)return false;
 const f=effectiveSchedule(h,date,versions),day=dateUTC(date).getUTCDay();
 switch(f.frequency_mode){
 case "weekly":case "monthly":return true;
 case "interval":return dateDiff(h.start_date,date)%Math.max(f.interval_days,2)===0;
 default:return f.schedule_days.includes(day);
 }
}
export function stateFor(h:MetricHabit,date:string,entry:MetricEntry|undefined,value:number|undefined,today:string,versions:ScheduleVersion[]=[]):DayState{
 if(!isDue(h,date,versions)||date>today)return "not_due";
 if(entry?.explicit_status==="skipped")return "skipped";
 if(entry?.explicit_status==="missed")return "missed";
 if(entry?.explicit_status==="completed")return "done";
 if(h.kind==="check")return entry?.completed===true?"done":entry?.completed===false?"missed":"unrecorded";
 const current=value??entry?.value;
 if((!entry&&(current==null||current===0))||(entry&&!entry.confirmed&&current==null))return "unrecorded";
 const plan=effectiveSchedule(h,date,versions);
 if(h.kind==="quantity"&&plan.direction==="at_most"){
  if(current==null)return "unrecorded";
  if(current>plan.target)return "over_limit";
  return date===today?"on_track":"done";
 }
 const goal=h.kind==="sleep"?(h.sleep_duration_goal||480):plan.target;
 if((current??0)>=goal)return "done";
 return "partial";
}
export function periodProgress(h:MetricHabit,date:string,entries:MetricEntry[],today:string,versions:ScheduleVersion[],getValue:(d:string)=>number,first:0|1=1){
 const s=effectiveSchedule(h,date,versions);
 const start=s.frequency_mode==="monthly"?monthStart(date):s.frequency_mode==="weekly"?weekStart(date,first):date;
 const totalDays=s.frequency_mode==="monthly"?monthLength(date):s.frequency_mode==="weekly"?7:1;
 let done=0,recorded=0,skipped=0;
 for(let i=0;i<totalDays;i++){
  const d=addDays(start,i);if(d>today||!isDue(h,d,versions))continue;
  const e=entries.find(x=>x.habit_id===h.id&&x.local_date===d);
  const value=e?.value!=null||h.kind==="duration"||h.kind==="sleep"?getValue(d):undefined;
  const state=stateFor(h,d,e,value,today,versions);
  if(state==="done")done++;
  if(state==="skipped")skipped++;
  if(!["unrecorded","not_due"].includes(state))recorded++;
 }
 return {done,recorded,skipped,required:s.frequency_mode==="weekly"||s.frequency_mode==="monthly"?s.frequency_count:1,period:s.frequency_mode,start};
}
export function streaks(h:MetricHabit,today:string,entries:MetricEntry[],versions:ScheduleVersion[],getValue:(d:string)=>number,first:0|1=1){
 const s=effectiveSchedule(h,today,versions);
 const unit=s.frequency_mode==="weekly"?"week":s.frequency_mode==="monthly"?"month":"day";
 let current=0,longest=0,run=0;
 const periods:string[]=[];
 if(unit==="day"){
  for(let i=364;i>=0;i--){const d=addDays(today,-i);if(d>=h.start_date&&isDue(h,d,versions))periods.push(d);}
 }else{
  let date=unit==="week"?weekStart(today,first):monthStart(today);
  for(let i=0;i<53;i++){if(date<h.start_date&&date!==weekStart(h.start_date,first)&&date!==monthStart(h.start_date))break;periods.unshift(date);date=unit==="week"?addDays(date,-7):monthStart(addDays(date,-1));}
 }
 for(const d of periods){
  const p=periodProgress(h,d,entries,today,versions,getValue,first);
  const entry=entries.find(e=>e.habit_id===h.id&&e.local_date===d);
  const currentPeriod=unit==="week"?weekStart(today,first):unit==="month"?monthStart(today):today;
  const pending=d===currentPeriod&&p.done<p.required&&entry?.explicit_status!=="missed";
  const done=unit==="day"&&entry?.explicit_status==="skipped"?null:pending?null:p.done>=p.required;
  if(done===true){run++;longest=Math.max(longest,run);}
  else if(done===null)continue;
  else run=0;
 }
 current=run;
 return {current,longest,unit};
}
export function badHabitInsights(h:MetricHabit,entries:MetricEntry[],today:string,versions:ScheduleVersion[]){
 if(h.kind!=="quantity"||h.direction!=="at_most")return null;
 const sample=(offset:number)=>Array.from({length:7},(_,i)=>addDays(today,offset+i))
  .filter(d=>d>=h.start_date&&d<today)
  .map(d=>entries.find(e=>e.habit_id===h.id&&e.local_date===d))
  .filter((e):e is MetricEntry=>!!e&&e.confirmed&&e.value!=null&&e.explicit_status!=="skipped");
 const current=sample(-7),previous=sample(-14);
 const average=(xs:MetricEntry[])=>xs.length?xs.reduce((s,e)=>s+(e.value??0),0)/xs.length:null;
 const currentAvg=average(current),previousAvg=average(previous);
 const reduction=currentAvg!==null&&previousAvg!==null&&current.length>=4&&previous.length>=4&&previousAvg>0
  ?(previousAvg-currentAvg)/previousAvg*100:null;
 let zero=0;for(let i=1;i<=30;i++){const d=addDays(today,-i);const e=entries.find(x=>x.habit_id===h.id&&x.local_date===d);if(e?.confirmed&&e.value===0&&e.explicit_status!=="skipped")zero++;}
 const within=current.filter(e=>(e.value??Infinity)<=effectiveSchedule(h,e.local_date,versions).target).length;
 return {average:currentAvg,previousAverage:previousAvg,reduction,recorded:current.length,zeroDays:zero,withinLimit:within};
}
