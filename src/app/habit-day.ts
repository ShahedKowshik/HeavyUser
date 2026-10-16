/**
 * A habit day is a user-selected calendar day, not necessarily midnight-to-midnight.
 * All stored events retain real UTC timestamps. Old daily records are never shifted
 * automatically when the user changes timezone or reset time.
 */
function addDays(day:string,n:number):string{
 const d=new Date(day+"T12:00:00Z");
 d.setUTCDate(d.getUTCDate()+n);
 return d.toISOString().slice(0,10);
}
export const DEFAULT_ZONE="Asia/Dhaka";
export const DEFAULT_DAY_START=0;
export const MAX_DAY_START=1439;
export function safeZone(zone:string):string{
 try{new Intl.DateTimeFormat("en-US",{timeZone:zone}).format(0);return zone}
 catch{return DEFAULT_ZONE}
}
export function safeDayStart(minutes:number):number{
 return Number.isInteger(minutes)&&minutes>=0&&minutes<=MAX_DAY_START?minutes:DEFAULT_DAY_START;
}
type Parts={year:number;month:number;day:number;hour:number;minute:number;second:number};
export function localParts(instant:Date,zone:string):Parts{
 const formatter=new Intl.DateTimeFormat("en-GB",{
  timeZone:safeZone(zone),year:"numeric",month:"2-digit",day:"2-digit",
  hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"
 });
 const parts=formatter.formatToParts(instant);
 const number=(key:string)=>Number(parts.find(p=>p.type===key)?.value??0);
 return {year:number("year"),month:number("month"),day:number("day"),
  hour:number("hour")%24,minute:number("minute"),second:number("second")};
}
function key(p:Parts){return [p.year,String(p.month).padStart(2,"0"),String(p.day).padStart(2,"0")].join("-")}
export function habitToday(instant:Date,zone:string,resetMinutes:number):string{
 const local=localParts(instant,zone),date=key(local);
 return local.hour*60+local.minute<safeDayStart(resetMinutes)?addDays(date,-1):date;
}
/** UTC instant when this logical day begins in the account's IANA timezone.
 * Handles non-hour offsets, DST transitions, and nonexistent local times.
 * A repeated local time picks its first occurrence.
 */
export function dayBoundaryInstant(day:string,zone:string,resetMinutes:number):number{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||new Date(day+"T12:00:00Z").toISOString().slice(0,10)!==day)throw Error("Invalid date");
 const [y,m,d]=day.split("-").map(Number);
 const mins=Number.isInteger(resetMinutes)&&resetMinutes>=0&&resetMinutes<1440?resetMinutes:0;
 const target=Date.UTC(y,m-1,d,Math.floor(mins/60),mins%60);
 const tz=safeZone(zone);
 const localClock=(timestamp:number)=>{
  const v=localParts(new Date(timestamp),tz);
  return Date.UTC(v.year,v.month-1,v.day,v.hour,v.minute);
 };
 const offsets=new Set<number>();
 for(const at of [target-36*3600000,target-12*3600000,target,target+12*3600000,target+36*3600000]){
  offsets.add(localClock(at)-Math.floor(at/60000)*60000);
 }
 const options=[...offsets].map(o=>target-o).filter(c=>localClock(c)===target).sort((a,b)=>a-b);
 if(options.length)return options[0];
 // Spring-forward gap: find first valid instant *after* the requested time.
 const start=target-36*3600000,end=target+36*3600000;
 let lo=Math.floor(start/60000),hi=Math.ceil(end/60000);
 // Search only plausible UTC candidates from the observed offsets. The
 // "first after" must fall immediately after the local discontinuity.
 const after=[...offsets].map(o=>target-o).filter(c=>localClock(c)>target).sort((a,b)=>a-b);
 if(after.length){hi=Math.min(hi,Math.ceil(after[0]/60000));lo=Math.max(lo,hi-180);}
 while(lo<hi){
  const mid=Math.floor((lo+hi)/2);
  if(localClock(mid*60000)>=target)hi=mid;
  else lo=mid+1;
 }
 return lo*60000;
}
export function dayWindow(day:string,zone:string,resetMinutes:number){
 const start=dayBoundaryInstant(day,zone,resetMinutes);
 const end=dayBoundaryInstant(addDays(day,1),zone,resetMinutes);
 return {start,end};
}
export function toZonedInput(timestamp:string|null,zone:string):string{
 if(!timestamp)return "";
 const p=localParts(new Date(timestamp),zone);
 return key(p)+"T"+String(p.hour).padStart(2,"0")+":"+String(p.minute).padStart(2,"0");
}
export function fromZonedInput(value:string,zone:string):string|null{
 if(!value)return null;
 const [day,time]=value.split("T");
 if(!day||!time||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error("Enter a valid local date and time");
 const mins=Number(time.slice(0,2))*60+Number(time.slice(3));
 return new Date(dayBoundaryInstant(day,zone,mins)).toISOString();
}
export function recordedSessionMinutes(session:{
 started_at:string;ended_at:string|null;paused_at:string|null;paused_total_ms:number;
},day:string,zone:string,dayStart:number,now:number):number{
 const {start,end}=dayWindow(day,zone,dayStart);
 const began=new Date(session.started_at).getTime();
 const until=session.ended_at?new Date(session.ended_at).getTime():session.paused_at?new Date(session.paused_at).getTime():now;
 if(!Number.isFinite(began)||!Number.isFinite(until)||until<=began)return 0;
 const overlap=Math.max(0,Math.min(end,until)-Math.max(start,began));
 if(!overlap)return 0;
 // Legacy work_sessions stores cumulative pause time, not individual pause
 // intervals; prorate for a session crossing two habit days. This preserves
 // its total active time without fabricating a per-minute pause history.
 const elapsed=until-began,paused=Math.min(elapsed,Math.max(0,session.paused_total_ms||0));
 return overlap*(1-paused/elapsed)/60000;
}
