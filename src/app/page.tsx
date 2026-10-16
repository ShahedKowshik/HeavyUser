"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {WeeklyGrid,MonthHeatmap} from "./habit-views";
import {isDue,stateFor,effectiveSchedule,periodProgress,streaks,badHabitInsights,weekStart,addDays,type ScheduleVersion,type FrequencyMode} from "./habit-metrics";
import {useQuantityQueue,type QuantityConfirmation,type QuantityOperation} from "./use-quantity-counter";
import {habitToday,safeZone,safeDayStart,recordedSessionMinutes,toZonedInput,fromZonedInput,DEFAULT_ZONE,DEFAULT_DAY_START} from "./habit-day";
import "./dashboard.css";
import "./account.css";
import "./design-system.css";
import "./compact.css";
import "./tracker-enhancements.css";
import "./habit-experience.css";
import "./ux-consistency.css";
import "./ui-audit.css";
import "./brand.css";
import "./quiet-redesign.css";
import "./day-settings.css";
import AccountSettings,{getAccount,getAvatar,type AccountUser} from "./account-settings";
type Habit={id:string;name:string;kind:"check"|"quantity"|"duration"|"sleep";icon:string;color:string;unit:string;target:number;direction:"at_least"|"at_most";schedule_days:number[];start_date:string;archived_at:string|null;sleep_bedtime_goal:string|null;sleep_wake_goal:string|null;sleep_duration_goal:number|null;frequency_mode:FrequencyMode;frequency_count:number;interval_days:number;sort_order:number};
type Entry={id:string;habit_id:string;local_date:string;value:number|null;completed:boolean|null;confirmed:boolean;bed_at:string|null;asleep_at:string|null;awake_at:string|null;out_of_bed_at:string|null;target_snapshot:number|null;direction_snapshot:string|null;explicit_status?:string|null};
type QuantityEvent={id:string;habit_id:string;user_id:string;local_date:string;action:"increment"|"decrement"|"set"|"undo";event_order?:number;delta:number|null;resulting_value:number;created_at:string};
type Session={id:string;habit_id:string;started_at:string;ended_at:string|null;paused_at:string|null;paused_total_ms:number};
const URL=process.env.NEXT_PUBLIC_SUPABASE_URL||"";
const KEY=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"";
const ZONE=DEFAULT_ZONE;
const ymd=(d=new Date())=>new Intl.DateTimeFormat("en-CA",{timeZone:ZONE,year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
const shift=(day:string,amount:number)=>{const d=new Date(day+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+amount);return d.toISOString().slice(0,10)};
const niceDate=(day:string)=>new Date(day+"T12:00:00Z").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",timeZone:"UTC"});
const fmt=(n:number)=>Math.floor(n/60)+"h "+String(Math.round(n%60)).padStart(2,"0")+"m";
const clock=(iso:string|null,zone=ZONE)=>iso?new Date(iso).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",timeZone:safeZone(zone)}):"—";
const minute=(a:string|null,b:string|null)=>a&&b?Math.max(0,Math.round((new Date(b).getTime()-new Date(a).getTime())/60000)):null;
const datetimeLocal=(v:string|null,zone=ZONE)=>toZonedInput(v,zone);
const isoLocal=(v:string,zone=ZONE)=>fromZonedInput(v,zone);
const baseHeaders=()=>({"apikey":KEY,"Content-Type":"application/json"});
function Glyph({name,size=19}:{name:string;size?:number}){const paths:Record<string,React.ReactNode>={grid:<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,chart:<><path d="M3 3v18h18"/><path d="m7 15 4-5 4 3 5-7"/></>,plus:<path d="M12 5v14M5 12h14"/>,minus:<path d="M5 12h14"/>,moon:<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>,sun:<><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,timer:<><circle cx="12" cy="13" r="9"/><path d="M12 8v5l3 2M9 2h6"/></>,check:<path d="m5 12 4 4L19 6"/>,chevron:<path d="m9 18 6-6-6-6"/>,left:<path d="m15 18-6-6 6-6"/>,close:<path d="M18 6 6 18M6 6l12 12"/>,edit:<><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,more:<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,settings:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 2l-1.5 1.5a1.8 1.8 0 0 0-2-.36L15.4 20h-2.8l-.84-1.86a1.8 1.8 0 0 0-2 .36L8.3 17a1.8 1.8 0 0 0 .36-2L6.8 14.2v-2.4L8.66 11a1.8 1.8 0 0 0-.36-2L9.8 7.5a1.8 1.8 0 0 0 2 .36L12.6 6h2.8l.84 1.86a1.8 1.8 0 0 0 2-.36L19.74 9a1.8 1.8 0 0 0-.36 2l1.86.8v2.4Z" transform="translate(-2 -1)"/></>,coffee:<><path d="M4 8h12v8a6 6 0 0 1-12 0Z"/><path d="M16 9h2a3 3 0 0 1 0 6h-2M3 21h15"/></>,leaf:<><path d="M20 4C11 4 4 8 4 16a4 4 0 0 0 4 4C16 20 20 13 20 4Z"/><path d="M4 20c4-5 8-8 13-11"/></>,activity:<path d="M3 12h4l3-7 4 14 3-7h4"/>,logout:<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></>,pause:<path d="M9 5v14M15 5v14"/>,play:<path d="m8 5 11 7-11 7Z"/>,square:<rect x="5" y="5" width="14" height="14" rx="2"/>,trash:<><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></>,archive:<><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8m-10 4h6"/></>,calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/></>};return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.activity}</svg>}
async function req(path:string,token:string,init:RequestInit={}){const response=await fetch(URL+path,{...init,headers:{...baseHeaders(),Authorization:"Bearer "+token,...init.headers}});const raw=await response.text();let data;try{data=raw?JSON.parse(raw):null}catch{data=null}if(!response.ok)throw Error(data?.msg||data?.error_description||data?.message||data?.error||"Request failed");return data}
const emptyForm={name:"",start_date:"",kind:"check" as Habit["kind"],target:1,unit:"",direction:"at_least" as Habit["direction"],schedule_days:[0,1,2,3,4,5,6],icon:"activity",color:"sage",sleep_bedtime_goal:"",sleep_wake_goal:"",sleep_duration_goal:480,frequency_mode:"selected_days" as FrequencyMode,frequency_count:3,interval_days:2};
export default function Home(){const [token,setToken]=useState("");const [userId,setUserId]=useState("");const [account,setAccount]=useState<AccountUser|null>(null);const [accountAvatar,setAccountAvatar]=useState("");const [settingsOpen,setSettingsOpen]=useState(false);const [recoveryMode,setRecoveryMode]=useState(false);const [newPassword,setNewPassword]=useState("");const [newPasswordAgain,setNewPasswordAgain]=useState("");const [authNotice,setAuthNotice]=useState("");const [authLoading,setAuthLoading]=useState(true);const [authMode,setAuthMode]=useState<"signin"|"signup"|"forgot">("signin");const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [view,setView]=useState<"today"|"week"|"insights"|"archive">("today");const [focusedId,setFocusedId]=useState<string|null>(null);const [mobileDetail,setMobileDetail]=useState(false);const [deleteText,setDeleteText]=useState("");const [day,setDay]=useState(ymd());const [habits,setHabits]=useState<Habit[]>([]);const [entries,setEntries]=useState<Entry[]>([]);const [sessions,setSessions]=useState<Session[]>([]);const [quantityEvents,setQuantityEvents]=useState<QuantityEvent[]>([]);const [versions,setVersions]=useState<ScheduleVersion[]>([]);const [revisions,setRevisions]=useState<Array<{id:string;habit_id:string;local_date:string;operation:string;before_data:Record<string,unknown>|null;after_data:Record<string,unknown>|null;changed_at:string;revision_order:number}>>([]);const [weekFirst,setWeekFirst]=useState<0|1>(1);const [dayStartMinutes,setDayStartMinutes]=useState(DEFAULT_DAY_START);const [timeZone,setTimeZone]=useState(DEFAULT_ZONE);const [followingToday,setFollowingToday]=useState(true);const [reorderMode,setReorderMode]=useState(false);const [mobileMore,setMobileMore]=useState(false);const mobileMoreRef=useRef<HTMLDivElement|null>(null);const [dragId,setDragId]=useState<string|null>(null);const [calendarDate,setCalendarDate]=useState(ymd());const [lastAction,setLastAction]=useState<{habitId:string;date:string;at:number}|null>(null);const [historySpan,setHistorySpan]=useState<7|14|30>(14);const [modal,setModal]=useState<"create"|"log"|"sleep"|"detail"|"delete"|null>(null);const [modalDate,setModalDate]=useState(ymd());const [selected,setSelected]=useState<Habit|null>(null);const [form,setForm]=useState(emptyForm);const [quantity,setQuantity]=useState("");const [sleepForm,setSleepForm]=useState({bed_at:"",asleep_at:"",awake_at:"",out_of_bed_at:""});const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [now,setNow]=useState(Date.now());const [editing,setEditing]=useState(false);const [saving,setSaving]=useState(false);const [habitMenuOpenId,setHabitMenuOpenId]=useState<string|null>(null);const [notice,setNotice]=useState<{message:string;undoId?:string}|null>(null);const habitMenuRef=useRef<HTMLDivElement|null>(null);const dialogRef=useRef<HTMLDivElement|null>(null);const priorFocus=useRef<HTMLElement|null>(null);const mutationLock=useRef(new Set<string>());const loadVersion=useRef(0);
const logicalToday=habitToday(new Date(now),timeZone,dayStartMinutes);
const effectiveToday=()=>logicalToday;
useEffect(()=>{if(followingToday){setDay(logicalToday);setCalendarDate(logicalToday)}},[logicalToday,followingToday]);
useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t)},[]);
useEffect(()=>{
 if(!habitMenuOpenId)return;
 const outside=(event:PointerEvent)=>{if(!habitMenuRef.current?.contains(event.target as Node))setHabitMenuOpenId(null)};
 const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){setHabitMenuOpenId(null);}};
 document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
 return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape)};
},[habitMenuOpenId]);
useEffect(()=>{setHabitMenuOpenId(null)},[focusedId,view]);
useEffect(()=>{
 if(!mobileMore)return;
 const onEsc=(event:KeyboardEvent)=>{if(event.key==="Escape")setMobileMore(false)};
 const onOutside=(event:PointerEvent)=>{
   const el=event.target as HTMLElement;
   if(!mobileMoreRef.current?.contains(el)&&!el.closest(".hu-mobile-more-trigger"))setMobileMore(false);
 };
 document.addEventListener("keydown",onEsc);document.addEventListener("pointerdown",onOutside);
 return()=>{document.removeEventListener("keydown",onEsc);document.removeEventListener("pointerdown",onOutside)};
},[mobileMore]);
useEffect(()=>{setMobileMore(false)},[view,mobileDetail]);

useEffect(()=>{
 if(!modal)return;
 priorFocus.current=document.activeElement as HTMLElement|null;
 const frame=requestAnimationFrame(()=>{const target=dialogRef.current?.querySelector<HTMLElement>('input[autofocus],input:not([type="hidden"]),select,textarea')||dialogRef.current?.querySelector<HTMLElement>(".compact-form-cancel")||dialogRef.current?.querySelector<HTMLElement>(".close-modal");target?.focus()});
 return()=>{cancelAnimationFrame(frame);priorFocus.current?.focus()};
},[modal]);
function closeModal(){if(saving)return;setModal(null)}
function dialogKeyDown(e:React.KeyboardEvent<HTMLDivElement>){
 if(e.key==="Escape"){e.stopPropagation();closeModal();return}
 if(e.key!=="Tab")return;
 const controls=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')).filter(x=>x.getClientRects().length>0);
 const first=controls[0],last=controls.at(-1);
 if(!first||!last)return;
 if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
 else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
}
function requestArchive(h:Habit){setHabitMenuOpenId(null);void archiveHabit(h)}
function requestHabitDelete(h:Habit){setHabitMenuOpenId(null);requestDelete(h)}

useEffect(()=>{try{
  const params=new URLSearchParams(window.location.hash.slice(1));
  const access=params.get("access_token"),refreshToken=params.get("refresh_token"),kind=params.get("type");
  if(access&&refreshToken){
    const expiresIn=Number(params.get("expires_in"))||3600;
    const stored={access_token:access,refresh_token:refreshToken,expires_in:expiresIn,expires_at:Math.floor(Date.now()/1000)+expiresIn};
    localStorage.setItem("heavyuser-session",JSON.stringify(stored));
    setToken(access);setRecoveryMode(kind==="recovery");window.history.replaceState(null,"",window.location.pathname+window.location.search);
  }else{
    const err=params.get("error_description");
    if(err){setError(err.replace(/\\+/g," "));window.history.replaceState(null,"",window.location.pathname+window.location.search);}
    const raw=localStorage.getItem("heavyuser-session");
    if(raw){const stored=JSON.parse(raw);if(stored.expires_at*1000>Date.now()+60000){setToken(stored.access_token);setUserId(stored.user?.id||"")}else if(stored.refresh_token){refresh(stored.refresh_token)}}
  }
}catch{setError("Unable to restore your session. Please sign in again.")}setAuthLoading(false)},[]);
async function refresh(rt:string){try{const r=await fetch(URL+"/auth/v1/token?grant_type=refresh_token",{method:"POST",headers:baseHeaders(),body:JSON.stringify({refresh_token:rt})});const data=await r.json();if(!r.ok||!data.access_token)throw Error("Session expired.");localStorage.setItem("heavyuser-session",JSON.stringify({...data,expires_at:Math.floor(Date.now()/1000)+data.expires_in}));setToken(data.access_token);setUserId(data.user?.id||"")}catch{localStorage.removeItem("heavyuser-session");setToken("");setAccount(null);setUserId("");setError("Your session expired. Please sign in again.")}}
useEffect(()=>{if(!token)return;const t=setInterval(()=>{try{const s=JSON.parse(localStorage.getItem("heavyuser-session")||"{}");if(s.expires_at&&s.expires_at*1000<Date.now()+180000&&s.refresh_token)refresh(s.refresh_token)}catch{}},60000);return()=>clearInterval(t)},[token]);
async function load(){if(!token)return;const version=++loadVersion.current;try{const [h,e,s,q,v,a,p]=await Promise.all([req("/rest/v1/habits?select=*&order=sort_order.asc,created_at.asc",token),req("/rest/v1/habit_entries?select=*&order=local_date.desc&limit=5000",token),req("/rest/v1/work_sessions?select=*&order=started_at.desc&limit=1000",token),req("/rest/v1/quantity_events?select=*&order=event_order.desc&limit=4000",token),req("/rest/v1/habit_schedule_versions?select=*&order=effective_date.asc&limit=5000",token),req("/rest/v1/entry_revisions?select=*&order=revision_order.desc&limit=300",token),req("/rest/v1/user_preferences?select=week_starts_on,day_start_minutes,time_zone",token)]);if(version!==loadVersion.current)return;setHabits(h);setEntries(e);setSessions(s);setQuantityEvents(q);setVersions(v);setRevisions(a);if(p?.[0]){setWeekFirst(p[0].week_starts_on===0?0:1);setDayStartMinutes(safeDayStart(Number(p[0].day_start_minutes)));setTimeZone(safeZone(p[0].time_zone||DEFAULT_ZONE))}else{setDayStartMinutes(DEFAULT_DAY_START);setTimeZone(DEFAULT_ZONE)}setError("")}catch(e){if(version===loadVersion.current)setError((e as Error).message)}}
useEffect(()=>{load()},[token]);
useEffect(()=>{const m=window.matchMedia("(max-width:650px)");setHistorySpan(m.matches?7:14)},[]);
useEffect(()=>{if(!token)return;const refresh=()=>{if(document.visibilityState==="visible")void load()};window.addEventListener("focus",refresh);window.addEventListener("online",refresh);document.addEventListener("visibilitychange",refresh);const id=window.setInterval(refresh,30000);return()=>{window.removeEventListener("focus",refresh);window.removeEventListener("online",refresh);document.removeEventListener("visibilitychange",refresh);window.clearInterval(id)}},[token]);
useEffect(()=>{if(!token)return;let mounted=true;
  (async()=>{try{const user=await getAccount(URL,KEY,token);if(!mounted)return;setAccount(user);setUserId(user.id);setEmail(user.email||"");const path=String(user.user_metadata?.avatar_path||"");if(path){try{const signed=await getAvatar(URL,KEY,token,path);if(mounted)setAccountAvatar(signed)}catch{if(mounted)setAccountAvatar("")}}else setAccountAvatar("")}catch(e){if(mounted)setError((e as Error).message)}})();
  return()=>{mounted=false};
},[token]);
async function recoverPassword(ev:React.FormEvent){ev.preventDefault();setBusy(true);setError("");setAuthNotice("");try{
const response=await fetch(URL+"/auth/v1/recover?redirect_to="+encodeURIComponent(window.location.origin+"/"),{method:"POST",headers:baseHeaders(),body:JSON.stringify({email:email.trim()})});
const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.msg||data.error_description||data.message||"Could not request reset email.");
setAuthNotice("If an account exists for this email, password-reset instructions will arrive shortly. Check your inbox and spam folder.");
}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
async function setRecoveredPassword(ev:React.FormEvent){ev.preventDefault();setBusy(true);setError("");setAuthNotice("");try{
if(newPassword.length<8)throw Error("Your new password needs at least 8 characters.");
if(newPassword!==newPasswordAgain)throw Error("Passwords do not match.");
const response=await fetch(URL+"/auth/v1/user",{method:"PUT",headers:{...baseHeaders(),Authorization:"Bearer "+token},body:JSON.stringify({password:newPassword})});
const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.msg||data.error_description||data.message||"Could not change password.");
setRecoveryMode(false);setNewPassword("");setNewPasswordAgain("");setAuthNotice("Password updated successfully.");
}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
function accountUpdated(user:AccountUser){setAccount(user);setEmail(user.email||"");const path=String(user.user_metadata?.avatar_path||"");if(path)getAvatar(URL,KEY,token,path).then(setAccountAvatar).catch(()=>setAccountAvatar(""));else setAccountAvatar("")}

async function auth(ev:React.FormEvent){ev.preventDefault();setBusy(true);setError("");try{const url=authMode==="signup"?"/auth/v1/signup":"/auth/v1/token?grant_type=password";const r=await fetch(URL+url,{method:"POST",headers:baseHeaders(),body:JSON.stringify({email,password})});const data=await r.json();if(!r.ok)throw Error(data.msg||data.error_description||data.message||"Authentication failed");if(data.access_token){localStorage.setItem("heavyuser-session",JSON.stringify({...data,expires_at:Math.floor(Date.now()/1000)+data.expires_in}));setToken(data.access_token);setUserId(data.user?.id||"")}else setError("Check your email to confirm your account, then sign in.")}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
const counter=useQuantityQueue({url:URL,apiKey:KEY,token,userId,
 onConfirmed:(result:QuantityConfirmation,op:QuantityOperation)=>{
  setEntries(previous=>{
   const old=previous.find(e=>e.habit_id===result.habit_id&&e.local_date===result.date);
   const next:Entry=old?{...old,value:result.value,confirmed:true,explicit_status:null}:{
    id:result.event_id,habit_id:result.habit_id,local_date:result.date,
    value:result.value,completed:null,confirmed:true,bed_at:null,asleep_at:null,awake_at:null,out_of_bed_at:null,
    explicit_status:null,target_snapshot:habits.find(h=>h.id===result.habit_id)?.target??null,
    direction_snapshot:habits.find(h=>h.id===result.habit_id)?.direction??null
   };
   return old?previous.map(e=>e===old?next:e):[next,...previous];
  });
  if(!result.duplicate)setQuantityEvents(previous=>[{
   id:op.id,habit_id:op.habitId,user_id:userId,local_date:op.date,
   action:op.action,delta:op.action==="set"?null:op.action==="increment"?1:-1,
   resulting_value:result.value,created_at:new Date().toISOString()
  },...previous].slice(0,3000));
 },
 onSynced:()=>{if(typeof document!=="undefined"&&document.visibilityState==="visible")void load()}
});
function displayedQuantity(h:Habit,date=day){return counter.getProjected(entry(h,date)?.value??0,h.id,date)}
function adjustQuantity(h:Habit,direction:1|-1){
 if(h.kind!=="quantity"||h.archived_at||day!==effectiveToday()||!isDue(h,day,versions))return;
 const projected=displayedQuantity(h);
 if(direction===-1&&projected<=0)return;
 if(direction===1&&projected>=100000)return;
 if(!counter.enqueue(h.id,day,direction===1?"increment":"decrement"))setError("This change was not queued. Try again.");
}
const live=habits.filter(h=>!h.archived_at).sort((a,b)=>a.sort_order-b.sort_order||a.name.localeCompare(b.name));
const weekday=new Date(day+"T12:00:00Z").getUTCDay();
const scheduled=live.filter(h=>isDue(h,day,versions));
const entry=(h:Habit,date=day)=>entries.find(e=>e.habit_id===h.id&&e.local_date===date);
const totals=(h:Habit,date=day)=>{const e=entry(h,date);if(h.kind==="duration"){const manual=e?.value||0;return manual+sessions.filter(s=>s.habit_id===h.id).reduce((sum,s)=>sum+recordedSessionMinutes(s,date,timeZone,dayStartMinutes,now),0)}if(h.kind==="sleep")return minute(e?.asleep_at||null,e?.awake_at||null)||0;return e?.value||0};
// The list, grid, calendar and statistics share exactly one outcome calculation.
const dayState=(h:Habit,date=day)=>stateFor(h,date,entry(h,date),h.kind==="quantity"?displayedQuantity(h,date):totals(h,date),effectiveToday(),versions);
const success=(h:Habit,date=day)=>dayState(h,date)==="done";
const done=scheduled.filter(h=>success(h)).length;
const previousWeek=weekStart(day,weekFirst);
const periodFor=(h:Habit,date=day)=>periodProgress(h,date,entries,effectiveToday(),versions,d=>totals(h,d),weekFirst);
function chooseDate(date:string){setFollowingToday(date===effectiveToday());setDay(date);setCalendarDate(date);setHabitMenuOpenId(null);setMobileMore(false)}
function jumpToHistoryDate(date:string){chooseDate(date);requestAnimationFrame(()=>{const behavior=window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth";window.scrollTo({top:0,behavior});document.querySelector(".compact-details")?.scrollTo({top:0,behavior})})}
async function updateWeekStart(next:0|1){const previous=weekFirst;setWeekFirst(next);try{await req("/rest/v1/user_preferences?on_conflict=user_id",token,{method:"POST",headers:{Prefer:"resolution=merge-duplicates"},body:JSON.stringify({user_id:userId,week_starts_on:next})})}catch(e){setWeekFirst(previous);setError((e as Error).message)}}
async function statusChange(h:Habit,date:string,status:"completed"|"skipped"|"missed"|null){
 if(date>effectiveToday()||!isDue(h,date,versions))return;
 if(h.kind==="quantity"&&counter.hasPending(h.id,date)){setError("Wait for counter changes to sync before changing status.");return}
 const old=entry(h,date);
 if(status==="skipped"&&h.kind==="quantity"&&old?.value!=null){setError("A count is recorded for this day. Clear or correct it before skipping.");return}
 if(status===null&&!old)return;
 if(status===null&&old&&(old.value==null||h.kind==="check")){await clearEntry(h,date);return}
 await saveEntry(h,{explicit_status:status,...(h.kind==="check"?{completed:status==="completed",value:status==="completed"?1:null}:{})},date);
}
function canUndoEntry(h:Habit,date:string){
 const revision=revisions.find(r=>r.habit_id===h.id&&r.local_date===date);
 return !!revision&&!(revision.before_data?.completed===false&&revision.before_data?.explicit_status==="completed");
}
async function undoLastEntry(h:Habit,date:string){
 const key=h.id+":"+date;
 if(mutationLock.current.has(key)||saving)return;
 const item=revisions.find(r=>r.habit_id===h.id&&r.local_date===date);
 if(!item){setError("No recent edit is available to undo.");return}
 if(item.before_data?.completed===false&&item.before_data?.explicit_status==="completed"){
  setError("This old unchecked entry has already been corrected and cannot be restored.");
  return;
 }
 mutationLock.current.add(key);setSaving(true);setError("");
 try{await req("/rest/v1/rpc/undo_entry_revision",token,{method:"POST",
  body:JSON.stringify({p_revision_id:item.id,p_undo_id:crypto.randomUUID()})});await load()}
 catch(e){setError((e as Error).message)}
 finally{mutationLock.current.delete(key);setSaving(false)}
}
async function undoQuantity(h:Habit,date:string){
 const key=h.id+":"+date;
 if(saving||mutationLock.current.has(key))return;
 if(counter.hasPending(h.id,date)){setError("Wait for pending counter changes to sync before undoing.");return}
 const item=quantityEvents.find(e=>e.habit_id===h.id&&e.local_date===date);
 if(!item||item.action==="undo"){setError("There is no newer count to undo.");return}
 mutationLock.current.add(key);setSaving(true);setError("");
 try{await req("/rest/v1/rpc/undo_quantity_event",token,{method:"POST",
  body:JSON.stringify({p_event_id:item.id,p_undo_id:crypto.randomUUID()})});await load()}
 catch(e){setError((e as Error).message)}
 finally{mutationLock.current.delete(key);setSaving(false)}
}
async function saveReorder(ordered:string[]){
 setSaving(true);setError("");
 const previous=[...habits];
 setHabits(old=>old.map(h=>({...h,sort_order:ordered.indexOf(h.id)<0?9999:ordered.indexOf(h.id)+1})));
 try{await req("/rest/v1/rpc/reorder_habits",token,{method:"POST",body:JSON.stringify({p_ids:ordered})});await load()}
 catch(e){setHabits(previous);setError((e as Error).message)}finally{setSaving(false)}
}
function moveHabit(id:string,otherId:string){
 if(id===otherId)return;
 const ids=live.map(h=>h.id),from=ids.indexOf(id),to=ids.indexOf(otherId);
 if(from<0||to<0)return;ids.splice(from,1);ids.splice(to,0,id);void saveReorder(ids)
}
function shiftHabit(id:string,step:-1|1){const ids=live.map(h=>h.id),i=ids.indexOf(id),other=ids[i+step];if(other)moveHabit(id,other)}

const active=sessions.find(s=>!s.ended_at);
const periods=[...Array(7)].map((_,i)=>shift(day,i-6));
async function saveEntry(h:Habit,patch:Record<string,unknown>,date=day):Promise<boolean>{
 const key=h.id+":"+date;if(mutationLock.current.has(key))return false;
 mutationLock.current.add(key);setSaving(true);setError("");
 try{
  if(date>effectiveToday()||!isDue(h,date,versions))throw Error("That date isn't scheduled for this habit.");
  const old=entry(h,date);
  const body={...patch,explicit_status:null,habit_id:h.id,user_id:userId,local_date:date,
   target_snapshot:old?.target_snapshot??effectiveSchedule(h,date,versions).target,
   direction_snapshot:old?.direction_snapshot??effectiveSchedule(h,date,versions).direction};
  // Explicit status selections can override the default null. Actual logs clear an old skip/failure.
  if(Object.prototype.hasOwnProperty.call(patch,"explicit_status"))body.explicit_status=patch.explicit_status as null;
  await req("/rest/v1/habit_entries?on_conflict=habit_id,local_date",token,{method:"POST",
   headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify(body)});
  await load();return true;
 }catch(e){setError((e as Error).message);return false}finally{mutationLock.current.delete(key);setSaving(false)}
}
async function clearEntry(h:Habit,date:string){
 const key=h.id+":"+date;if(mutationLock.current.has(key))return;
 mutationLock.current.add(key);setSaving(true);setError("");
 try{
  if(date>effectiveToday()||!isDue(h,date,versions))throw Error("That date isn't scheduled for this habit.");
  await req("/rest/v1/habit_entries?habit_id=eq."+h.id+"&user_id=eq."+userId+"&local_date=eq."+date,token,{method:"DELETE"});
  await load();
 }catch(e){setError((e as Error).message)}finally{mutationLock.current.delete(key);setSaving(false)}
}
async function toggleCheck(h:Habit,date:string){
 if(h.kind!=="check"||saving||mutationLock.current.has(h.id+":"+date))return;
 if(dayState(h,date)==="done")await clearEntry(h,date);
 else await saveEntry(h,{completed:true,value:1,explicit_status:"completed"},date);
}
async function record(h:Habit){if(h.kind==="quantity"){if(!isDue(h,day,versions))return;if(day===effectiveToday())adjustQuantity(h,1);else{setSelected(h);setModalDate(day);setQuantity(String(h.kind==="quantity"?displayedQuantity(h):entry(h)?.value??""));setModal("log")}return}if(h.kind==="check"){await toggleCheck(h,day)}else if(h.kind==="sleep"){setSelected(h);setModalDate(day);const e=entry(h);setSleepForm({bed_at:datetimeLocal(e?.bed_at||null,timeZone),asleep_at:datetimeLocal(e?.asleep_at||null,timeZone),awake_at:datetimeLocal(e?.awake_at||null,timeZone),out_of_bed_at:datetimeLocal(e?.out_of_bed_at||null,timeZone)});setModal("sleep")}else{setSelected(h);setModalDate(day);setQuantity(String(entry(h)?.value??""));setModal("log")}}
function newHabit(){setHabitMenuOpenId(null);setEditing(false);setSelected(null);setForm({...emptyForm,start_date:effectiveToday(),schedule_days:[...emptyForm.schedule_days]});setModal("create")}
function editHabit(h:Habit){setHabitMenuOpenId(null);setSelected(h);setEditing(true);setForm({name:h.name,start_date:h.start_date,kind:h.kind,target:h.target,unit:h.unit,direction:h.direction,schedule_days:[...h.schedule_days],icon:h.icon,color:h.color,sleep_bedtime_goal:h.sleep_bedtime_goal||"",sleep_wake_goal:h.sleep_wake_goal||"",sleep_duration_goal:h.sleep_duration_goal||480,frequency_mode:h.frequency_mode||"selected_days",frequency_count:h.frequency_count||3,interval_days:h.interval_days||2});setModal("create")}
async function saveHabit(ev:React.FormEvent){ev.preventDefault();setSaving(true);setError("");try{if(form.frequency_mode==="weekly"&&(form.frequency_count<1||form.frequency_count>7))throw Error("Choose 1–7 days per week.");if(form.frequency_mode==="monthly"&&(form.frequency_count<1||form.frequency_count>31))throw Error("Choose 1–31 days per month.");if(!/^\d{4}-\d{2}-\d{2}$/.test(form.start_date)||!Number.isFinite(Date.parse(form.start_date+"T12:00:00Z")))throw Error("Choose a valid start date.");const body={...form,name:form.name.trim(),user_id:userId,start_date:form.start_date,sleep_bedtime_goal:form.sleep_bedtime_goal||null,sleep_wake_goal:form.sleep_wake_goal||null,sleep_duration_goal:form.kind==="sleep"?Number(form.sleep_duration_goal)||null:null,frequency_mode:form.direction==="at_most"?"selected_days":form.frequency_mode,frequency_count:form.frequency_count,interval_days:form.interval_days};if(editing&&selected)await req("/rest/v1/habits?id=eq."+selected.id,token,{method:"PATCH",body:JSON.stringify(body)});else await req("/rest/v1/habits",token,{method:"POST",body:JSON.stringify(body)});setModal(null);await load();setNotice({message:editing?"Habit changes saved":"Habit created"})}catch(e){setError((e as Error).message)}finally{setSaving(false)}}
async function archiveHabit(h:Habit){
  if(counter.hasPending(h.id)){setError("Wait for this habit’s unsaved counter updates to sync before archiving.");return}
  if(sessions.some(s=>s.habit_id===h.id&&!s.ended_at)){setError("Stop this habit's timer before archiving.");return}
  setSaving(true);setError("");
  try{await req("/rest/v1/habits?id=eq."+h.id+"&user_id=eq."+userId,token,{method:"PATCH",body:JSON.stringify({archived_at:new Date().toISOString()})});setModal(null);setMobileDetail(false);await load();setNotice({message:h.name+" archived",undoId:h.id})}
  catch(e){setError((e as Error).message)}finally{setSaving(false)}
}
async function restoreHabit(h:Habit){
  setSaving(true);setError("");
  try{await req("/rest/v1/habits?id=eq."+h.id+"&user_id=eq."+userId,token,{method:"PATCH",body:JSON.stringify({archived_at:null})});setView("insights");setFocusedId(h.id);setMobileDetail(true);await load();setNotice({message:h.name+" restored"})}
  catch(e){setError((e as Error).message)}finally{setSaving(false)}
}
function requestDelete(h:Habit){if(!h.archived_at){setError("Archive this habit before deleting it permanently.");return}setSelected(h);setDeleteText("");setModal("delete")}
async function permanentlyDeleteHabit(h:Habit){
  if(counter.hasPending(h.id)){setError("Wait for pending counter updates to sync before deleting.");return}
  if(!h.archived_at||deleteText!==h.name){setError("Enter the exact habit name to confirm deletion.");return}
  if(sessions.some(s=>s.habit_id===h.id&&!s.ended_at)){setError("Stop the timer before deleting this habit.");return}
  setSaving(true);setError("");
  try{
    const deleted=await req("/rest/v1/habits?id=eq."+h.id+"&user_id=eq."+userId+"&archived_at=not.is.null&select=id",token,{method:"DELETE",headers:{Prefer:"return=representation"}});
    if(!Array.isArray(deleted)||deleted.length!==1||deleted[0].id!==h.id)throw Error("Deletion could not be confirmed. Please retry.");
    setModal(null);setFocusedId(null);setMobileDetail(false);setDeleteText("");
    await load();setNotice({message:h.name+" permanently deleted"});
  }catch(e){setError((e as Error).message)}finally{setSaving(false)}
}

async function timer(h:Habit,action:"start"|"pause"|"resume"|"stop"){setSaving(true);setError("");try{const s=sessions.find(s=>s.habit_id===h.id&&!s.ended_at);if(action==="start"){if(!isDue(h,effectiveToday(),versions)||h.archived_at)throw Error("This habit is not scheduled to start yet.");if(active)throw Error("Stop or pause your current timer first.");await req("/rest/v1/work_sessions",token,{method:"POST",body:JSON.stringify({habit_id:h.id,user_id:userId,started_at:new Date().toISOString()})})}else if(s){const at=new Date().toISOString();const paused=s.paused_at?Math.max(0,Date.now()-new Date(s.paused_at).getTime()):0;const patch=action==="pause"?{paused_at:at}:action==="resume"?{paused_at:null,paused_total_ms:s.paused_total_ms+paused}:{ended_at:at,paused_at:null,paused_total_ms:s.paused_total_ms+paused};await req("/rest/v1/work_sessions?id=eq."+s.id,token,{method:"PATCH",body:JSON.stringify(patch)})}await load()}catch(e){setError((e as Error).message)}finally{setSaving(false)}}
const archived=habits.filter(h=>!!h.archived_at);
const listHabits=view==="archive"?archived:view==="today"?scheduled:live;
const focused=listHabits.find(h=>h.id===focusedId)||listHabits[0]||null;
const focusedEntry=focused?entry(focused):undefined;
const focusedVal=focused?(focused.kind==="quantity"?displayedQuantity(focused):totals(focused)):0;
const focusedSession=focused?sessions.find(s=>s.habit_id===focused.id&&!s.ended_at):undefined;
const visibleHistory=[...Array(historySpan)].map((_,i)=>shift(day,i-(historySpan-1)));
const monthDates=focused?[...Array(30)].map((_,i)=>shift(day,i-29)).filter(d=>d<=effectiveToday()&&isDue(focused,d,versions)):[];
function recordedFor(h:Habit,date:string){
 const state=dayState(h,date);
 return state!=="not_due"&&state!=="unrecorded";
}
const monthRecorded=focused?monthDates.filter(d=>recordedFor(focused,d)).length:0;
const lastSeven=focused?[...Array(7)].map((_,i)=>shift(day,i-(focused.kind==="quantity"&&focused.direction==="at_most"&&day===effectiveToday()?7:6))).filter(d=>d<=effectiveToday()&&isDue(focused,d,versions)):[];
const sevenRecorded=focused?lastSeven.filter(d=>recordedFor(focused,d)):[];
const sevenAverage=focused&&sevenRecorded.length?sevenRecorded.reduce((sum,d)=>sum+totals(focused,d),0)/sevenRecorded.length:0;
const sevenTotal=focused&&sevenRecorded.length?sevenRecorded.reduce((sum,d)=>sum+totals(focused,d),0):0;
const monthAchieved=focused?monthDates.filter(d=>success(focused,d)).length:0;
const legacyFocusedStreak=focused?(()=>{
  let count=0;let d=day;
  for(let i=0;i<366;i++,d=shift(d,-1)){
    if(d<focused.start_date)break;
    if(!focused.schedule_days.includes(new Date(d+"T12:00:00Z").getUTCDay()))continue;
    if(success(focused,d)){count++;continue}
    if(i===0&&d===effectiveToday()&&!recordedFor(focused,d))continue;
    break;
  }
  return count;
})():0;
const streak=focused?streaks(focused,effectiveToday(),entries,versions,(d)=>totals(focused,d),weekFirst):null;
const badStats=focused?badHabitInsights(focused,entries,effectiveToday(),versions):null;
const chartMax=focused?Math.max(1,focused.kind==="sleep"?(focused.sleep_duration_goal||480):focused.target,...visibleHistory.map(d=>totals(focused,d))):1;
const statusFor=(h:Habit,date=day)=>({
 done:"Completed",unrecorded:"Not recorded",not_due:"Not scheduled",
 skipped:"Skipped",missed:"Missed",partial:"In progress",
 on_track:"Within limit",over_limit:"Over limit"
}[dayState(h,date)]);
const logout=()=>{if(counter.pendingCount>0){setError("Wait for "+counter.pendingCount+" counter changes to sync before signing out.");return}setNotice(null);loadVersion.current++;if(token)fetch(URL+"/auth/v1/logout",{method:"POST",headers:{...baseHeaders(),Authorization:"Bearer "+token}}).catch(()=>{});localStorage.removeItem("heavyuser-session");setToken("");setUserId("");setAccount(null);setAccountAvatar("");setSettingsOpen(false);setDayStartMinutes(DEFAULT_DAY_START);setTimeZone(DEFAULT_ZONE);setFollowingToday(true);setRecoveryMode(false);setEmail("");setPassword("");setHabits([]);setEntries([]);setSessions([]);setQuantityEvents([]);setVersions([]);setRevisions([])};
const profileName=[account?.user_metadata?.first_name,account?.user_metadata?.last_name].filter(Boolean).join(" ")||"My workspace";const profileInitial=String(account?.user_metadata?.first_name||account?.email||"H").slice(0,1).toUpperCase();const avatarNode=accountAvatar?<img src={accountAvatar} alt="" className="profile-picture" />:profileInitial;
if(!URL||!KEY)return <main className="auth-screen"><div className="auth-card"><strong>HeavyUser</strong><h1>Configuration required</h1><p>Add the Supabase public URL and publishable key to Vercel environment settings.</p></div></main>;
if(authLoading)return <main className="auth-screen"><p>Loading HeavyUser…</p></main>;
if(recoveryMode&&token)return <main className="auth-screen"><section className="auth-card"><img className="auth-brand-image" src="/heavyuser-logo.png" alt="HeavyUser" width={155} height={20}/><p className="eyebrow">ACCOUNT RECOVERY</p><h1>Choose a new<br/><em>password.</em></h1><p className="auth-sub">Your reset link has been verified. Set a new password to continue.</p><form onSubmit={setRecoveredPassword}><label>New password<input required minLength={8} type="password" autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="At least 8 characters"/></label><label>Confirm password<input required minLength={8} type="password" autoComplete="new-password" value={newPasswordAgain} onChange={e=>setNewPasswordAgain(e.target.value)} placeholder="Repeat password"/></label><button className="primary wide" disabled={busy}>{busy?"Updating…":"Save new password"}</button></form>{error&&<p role="alert" className="error">{error}</p>}</section></main>;
if(!token)return <main className="auth-screen"><section className="auth-card"><img className="auth-brand-image" src="/heavyuser-logo.png" alt="HeavyUser" width={155} height={20}/><p className="eyebrow">WELCOME TO HEAVYUSER</p><h1>{authMode==="forgot"?<>Reset your<br/><em>password.</em></>:<>Track your<br/><em>habits.</em></>}</h1><p className="auth-sub">{authMode==="forgot"?"Enter your account email. We'll send a recovery link.":"Track your habits and progress."}</p><form onSubmit={authMode==="forgot"?recoverPassword:auth}><label>Email address<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>{authMode!=="forgot"&&<label>Password<input required minLength={authMode==="signup"?8:6} type="password" autoComplete={authMode==="signin"?"current-password":"new-password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder={authMode==="signup"?"At least 8 characters":"Your password"}/></label>}<button className="primary wide" disabled={busy}>{busy?"One moment…":authMode==="forgot"?"Send reset link":authMode==="signin"?"Sign in":"Create account"} <Glyph name="chevron"/></button></form>{authMode==="signin"&&<button className="subtle-link" onClick={()=>{setError("");setAuthNotice("");setAuthMode("forgot")}}>Forgot your password?</button>}<button className="subtle-link" onClick={()=>{setError("");setAuthNotice("");setAuthMode(authMode==="signin"?"signup":"signin")}}>{authMode==="signin"?"New here? Create an account":"Back to sign in"}</button>{authNotice&&<p role="status" className="auth-notice">{authNotice}</p>}{error&&<p role="alert" className="error">{error}</p>}</section></main>;
return <div className="compact-app">
  <aside className="compact-sidebar">
    <div className="compact-brand">
      <img className="compact-brand-wordmark" src="/heavyuser-logo.png" alt="HeavyUser" width={155} height={20}/>
      <img className="compact-brand-icon" src="/heavyuser-favicon.png" alt="" width={32} height={32} aria-hidden="true"/>
    </div>
    <nav aria-label="Main navigation" className="compact-nav">
      <button aria-current={view==="today"?"page":undefined} className={view==="today"?"active":""} onClick={()=>{setView("today");chooseDate(effectiveToday());setMobileDetail(false)}}><Glyph name="grid" size={17}/> Today</button>
      <button aria-current={view==="week"?"page":undefined} className={view==="week"?"active":""} onClick={()=>{setMobileMore(false);setView("week");chooseDate(effectiveToday());setMobileDetail(false)}}><Glyph name="calendar" size={17}/> Week</button><button aria-current={view==="insights"?"page":undefined} className={view==="insights"?"active":""} onClick={()=>{setMobileMore(false);setView("insights");chooseDate(effectiveToday());setMobileDetail(false)}}><Glyph name="chart" size={17}/> All habits <span className="compact-nav-count">{live.length}</span></button>
      <div className="hu-nav-divider" aria-hidden="true"/><span className="hu-nav-group">MANAGE</span><button aria-current={view==="archive"?"page":undefined} className={view==="archive"?"active":""} onClick={()=>{setView("archive");setMobileDetail(false)}}><Glyph name="archive" size={17}/> Archive {archived.length>0&&<span className="compact-nav-count">{archived.length}</span>}</button>
    </nav>
    <button className="compact-account" onClick={()=>setSettingsOpen(true)} aria-label="Open account settings"><span className="compact-account-photo">{avatarNode}</span><span className="compact-account-name">{profileName}<small>Account settings</small></span><Glyph name="chevron" size={14}/></button>
  </aside>
  <div className={"compact-layout "+(mobileDetail?"mobile-detail":"")}>
    {view==="week"?<div className="tracker-week-workspace">
      <div className="tracker-week-settings"><span>Week starts on</span><select aria-label="First day of week" value={weekFirst} onChange={e=>void updateWeekStart(Number(e.target.value)===0?0:1)}><option value={1}>Monday</option><option value={0}>Sunday</option></select></div>
      <WeeklyGrid habits={live} entries={entries} today={effectiveToday()} selectedDate={day} first={weekFirst} versions={versions} valueFor={(h,d)=>totals(h as Habit,d)}
      onNavigate={chooseDate} onSelect={(h,d)=>{chooseDate(d);setCalendarDate(d);setFocusedId(h.id);setView("insights");setMobileDetail(true)}} onCheck={(h,d)=>{chooseDate(d);void toggleCheck(h as Habit,d)}}/>
    </div>:<>
    <section className="compact-list-pane" aria-label="Habit list">
      <div className="compact-list-head"><div><h1>{view==="archive"?"Archive":view==="today"?"Today":"All habits"}</h1><span className="compact-list-count">{view==="today"?niceDate(day):view==="archive"?"Saved for later":live.length+" active habits"}</span></div><div className="tracker-list-top-actions"><button className="tracker-list-profile" onClick={()=>setSettingsOpen(true)} aria-label="Open account settings">{avatarNode}</button>{view!=="archive"&&<button className="compact-add" onClick={newHabit} title="Add habit" aria-label="Create habit"><Glyph name="plus" size={18}/></button>}{view==="insights"&&<button type="button" className={"tracker-reorder-toggle "+(reorderMode?"active":"")} onClick={()=>setReorderMode(!reorderMode)}>{reorderMode?"Done":"Reorder"}</button>}</div></div>
      {view==="today"&&<div className="hu-day-progress" aria-label={"Today: "+done+" of "+scheduled.length+" habits completed"}><div className="hu-day-progress-copy"><span>{done} of {scheduled.length} completed</span><span>{scheduled.length?Math.round(done/scheduled.length*100):0}%</span></div><div className="hu-day-progress-track" role="progressbar" aria-label="Daily habits completed" aria-valuemin={0} aria-valuemax={scheduled.length||1} aria-valuenow={done}><span style={{width:(scheduled.length?Math.round(done/scheduled.length*100):0)+"%"}}/></div></div>}
      {view==="today"&&dayStartMinutes>0&&<div className="hu-day-boundary-note" role="status">Your habit day changes at {new Date(Date.UTC(2020,0,1,Math.floor(dayStartMinutes/60),dayStartMinutes%60)).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",timeZone:"UTC"})} · {timeZone.replaceAll("_"," ")}</div>}
      {view==="today"&&<div className="compact-date-row"><button type="button" onClick={()=>chooseDate(shift(day,-1))} aria-label={"Previous day, "+niceDate(shift(day,-1))}><Glyph name="left" size={17}/></button><span aria-live="polite">{niceDate(day)}</span><button type="button" disabled={day>=effectiveToday()} onClick={()=>chooseDate(shift(day,1))} aria-label={"Next day, "+niceDate(shift(day,1))}><Glyph name="chevron" size={17}/></button></div>}
      <div className="compact-list-items" aria-label="Choose or record a habit">
        {listHabits.length?listHabits.map(h=><div key={h.id} draggable={reorderMode&&view==="insights"} onDragStart={()=>setDragId(h.id)} onDragEnd={()=>setDragId(null)} onDragOver={e=>{if(reorderMode)e.preventDefault()}} onDrop={e=>{e.preventDefault();if(dragId)moveHabit(dragId,h.id);setDragId(null)}} className={"compact-list-item tracker-list-item "+(focused?.id===h.id?"selected":"")+(reorderMode?" is-reordering":"")}>
          <button type="button" className="tracker-item-select" aria-current={focused?.id===h.id?"true":undefined} disabled={reorderMode&&view==="insights"} onClick={()=>{setFocusedId(h.id);setMobileDetail(true)}} aria-label={"View "+h.name+" details"}>
            <span className="compact-list-icon"><Glyph name={h.kind==="sleep"?"moon":h.kind==="duration"?"timer":h.kind==="quantity"?"leaf":h.icon} size={17}/></span>
            <span className="compact-list-item-copy"><strong>{h.name}</strong><small>{view==="archive"?"Archived":day<h.start_date?"Starts "+niceDate(h.start_date):h.kind==="sleep"?"Sleep":h.kind==="duration"?"Focus time":h.kind==="quantity"?(h.direction==="at_most"?"Daily limit":"Daily goal"):"Daily check-in"}{view==="today"&&<span className="hu-row-status"> · {statusFor(h)}</span>}</small></span>
          </button>
          {reorderMode&&view==="insights"?<div className="tracker-order-actions"><button aria-label={"Move "+h.name+" up"} disabled={saving||live.indexOf(h)===0} onClick={()=>shiftHabit(h.id,-1)}>↑</button><button aria-label={"Move "+h.name+" down"} disabled={saving||live.indexOf(h)===live.length-1} onClick={()=>shiftHabit(h.id,1)}>↓</button></div>:view!=="archive"&&<div className="tracker-item-actions">
            {h.kind==="quantity"&&day===effectiveToday()&&isDue(h,day,versions)?<div className="tracker-quantity-inline" role="group" aria-label={h.name+" quick counter"}>
              <button aria-label={"Subtract one from "+h.name} title="Correct last count" disabled={displayedQuantity(h)<=0} onClick={()=>adjustQuantity(h,-1)}><Glyph name="minus" size={16}/></button>
              <span aria-live="polite">{displayedQuantity(h)}</span>
              <button aria-label={"Add one to "+h.name} title="Record one" disabled={displayedQuantity(h)>=100000} onClick={()=>adjustQuantity(h,1)}><Glyph name="plus" size={16}/></button>
            </div>:h.kind==="quantity"?<span className="tracker-list-value">{entry(h)?.confirmed?entry(h)?.value:"—"}</span>
            :h.kind==="check"?<button className={"tracker-check-inline "+(success(h)?"is-done":"")} type="button" aria-pressed={success(h)} disabled={saving||day>effectiveToday()||!isDue(h,day,versions)} onClick={()=>record(h)} aria-label={(success(h)?"Mark "+h.name+" not recorded":"Mark "+h.name+" complete")}><Glyph name="check" size={17}/></button>
            :h.kind==="duration"&&day===effectiveToday()&&isDue(h,day,versions)?<div className="tracker-list-timer"><span className="tracker-list-value">{fmt(totals(h))}</span>{sessions.some(q=>q.habit_id===h.id&&!q.ended_at)?<button className="tracker-timer-inline" disabled={saving} onClick={()=>timer(h,sessions.find(q=>q.habit_id===h.id&&!q.ended_at)?.paused_at?"resume":"pause")} aria-label={(sessions.find(q=>q.habit_id===h.id&&!q.ended_at)?.paused_at?"Resume ":"Pause ")+h.name}><Glyph name={sessions.find(q=>q.habit_id===h.id&&!q.ended_at)?.paused_at?"play":"pause"} size={17}/></button>:<button className="tracker-timer-inline" disabled={!!active||saving} onClick={()=>timer(h,"start")} aria-label={"Start "+h.name+" timer"}><Glyph name="play" size={17}/></button>}</div>
            :<span className="tracker-list-value">{h.kind==="duration"?fmt(totals(h)):entry(h)?.awake_at?fmt(totals(h)):"—"}</span>}
          </div>}
          {view==="archive"&&<Glyph name="chevron" size={14}/>}
        </div>):<div className="compact-no-habits"><p>{view==="archive"?"No archived habits.":view==="today"?"No habits scheduled for this day.":"You haven’t added a habit yet."}</p>{view!=="archive"&&<button className="outline-btn" onClick={newHabit}><Glyph name="plus" size={15}/> Add habit</button>}</div>}
      </div>
      {view!=="archive"&&<div className="compact-list-footer">{view==="today"?"Choose a habit to view details":reorderMode?"Drag or use the arrows to reorder":"Choose a habit to see its progress"}</div>}
    </section>
    <main className="compact-details" aria-label="Habit details">
      <header className="compact-details-bar"><button className="compact-mobile-back" onClick={()=>{setMobileDetail(false);setHabitMenuOpenId(null)}}><Glyph name="left" size={17}/> {view==="archive"?"Archive":"Habits"}</button><span className="hu-breadcrumb">{view==="archive"?"Archive":view==="today"?"Today / Details":"Habits / Details"}</span><div className="tracker-detail-date">{view!=="archive"&&<><button type="button" aria-label={"Previous day, "+niceDate(shift(day,-1))} onClick={()=>chooseDate(shift(day,-1))}><Glyph name="left" size={16}/></button><button className="tracker-detail-date-label" onClick={()=>chooseDate(effectiveToday())}>{day===effectiveToday()?"Today":niceDate(day)}</button><button type="button" aria-label={"Next day, "+niceDate(shift(day,1))} disabled={day>=effectiveToday()} onClick={()=>chooseDate(shift(day,1))}><Glyph name="chevron" size={16}/></button></>}</div><button className="compact-top-avatar" onClick={()=>setSettingsOpen(true)} title="Account settings" aria-label="Open account settings">{avatarNode}</button></header>
      {focused?<div className="compact-detail-body" key={focused.id}>
        <div className="compact-detail-heading">
  <div className="compact-detail-title"><span className="compact-title-icon"><Glyph name={focused.kind==="sleep"?"moon":focused.kind==="duration"?"timer":focused.kind==="quantity"?"leaf":focused.icon} size={21}/></span>
    <div><h2>{focused.name}</h2><p>{focused.kind==="sleep"?"Sleep":focused.kind==="duration"?"Timer":focused.kind==="quantity"?"Counter":"Check-off"} · {focused.frequency_mode==="weekly"?focused.frequency_count+" times per week":focused.frequency_mode==="monthly"?focused.frequency_count+" times per month":focused.frequency_mode==="interval"?"Every "+focused.interval_days+" days":focused.schedule_days.length===7?"Every day":focused.schedule_days.length+" selected days"}</p></div></div>
  <div className="compact-habit-actions" ref={habitMenuRef}>
    {!focused.archived_at?<button type="button" className="compact-habit-edit" onClick={()=>editHabit(focused)} disabled={saving}><Glyph name="edit" size={15}/> Edit</button>
      :<button type="button" className="compact-habit-restore" onClick={()=>void restoreHabit(focused)} disabled={saving}><Glyph name="archive" size={15}/> Restore</button>}
    <button type="button" className="compact-habit-more" aria-label={"More actions for "+focused.name} aria-expanded={habitMenuOpenId===focused.id} aria-haspopup="menu" onClick={()=>setHabitMenuOpenId(habitMenuOpenId===focused.id?null:focused.id)} disabled={saving}><Glyph name="more" size={20}/></button>
    {habitMenuOpenId===focused.id&&<div className="compact-habit-menu" role="menu" aria-label={focused.name+" actions"}>
      {!focused.archived_at?<button type="button" role="menuitem" onClick={()=>requestArchive(focused)}><Glyph name="archive" size={17}/> Archive habit</button>
        :<button type="button" role="menuitem" className="destructive" onClick={()=>requestHabitDelete(focused)}><Glyph name="trash" size={17}/> Delete permanently</button>}
    </div>}
  </div>
</div>
        {view==="archive"?<section className="compact-record-section compact-archived-summary"><div className="compact-section-label">Archived habit</div><p className="compact-supporting">This habit is paused. Your history is saved. Restore it to start tracking again.</p></section>:<>
          <section className="compact-record-section hu-main-record">
            <div className="compact-section-head"><span className="compact-section-label">{niceDate(day)}</span><span className="compact-state">{statusFor(focused)}</span></div>
            <div className={"compact-record-content "+(focused.kind==="quantity"?"tracker-record-quantity":"")}>
              <div className="compact-record-value"><strong>{focused.kind==="check"?statusFor(focused):focused.kind==="sleep"?(focusedEntry?.awake_at?fmt(focusedVal):"Not recorded"):focused.kind==="duration"?fmt(focusedVal):focused.kind==="quantity"&&(focusedEntry?.confirmed||counter.hasPending(focused.id,day))?String(focusedVal)+" "+(focused.unit||""):"Not recorded"}</strong>
                <small>{focused.kind==="check"?"Daily check-in":focused.kind==="sleep"?"Estimated sleep":focused.kind==="duration"?"Target "+fmt(focused.target): (focused.direction==="at_most"?"Limit ":"Target ")+focused.target+" "+focused.unit}</small>
              </div>
              <div className="compact-record-actions">
                {focused.kind==="duration"&&day===effectiveToday()&&(focusedSession||isDue(focused,day,versions))&&(focusedSession?<><button className="outline-btn" disabled={saving} onClick={()=>timer(focused,focusedSession.paused_at?"resume":"pause")}><Glyph name={focusedSession.paused_at?"play":"pause"} size={15}/> {focusedSession.paused_at?"Resume":"Pause"}</button><button className="outline-btn" disabled={saving} onClick={()=>timer(focused,"stop")}><Glyph name="square" size={14}/> Stop</button></>:<button className="outline-btn" disabled={saving||!!active} onClick={()=>timer(focused,"start")}><Glyph name="play" size={14}/> Start timer</button>)}
                {focused.kind==="quantity"?<>
                  {day===effectiveToday()&&isDue(focused,day,versions)&&<div className="tracker-counter-control" role="group" aria-label={focused.name+" counter"}>
                    <button disabled={displayedQuantity(focused)<=0} onClick={()=>adjustQuantity(focused,-1)} aria-label="Subtract one"><Glyph name="minus" size={20}/></button>
                    <span aria-live="polite">{displayedQuantity(focused)}</span>
                    <button disabled={displayedQuantity(focused)>=100000} onClick={()=>adjustQuantity(focused,1)} aria-label="Record one"><Glyph name="plus" size={20}/></button>
                  </div>}
                  <button className="outline-btn" disabled={saving||day>effectiveToday()||!isDue(focused,day,versions)} onClick={()=>{setSelected(focused);setModalDate(day);setQuantity(String(displayedQuantity(focused)));setModal("log")}}><Glyph name="edit" size={15}/> Edit total</button>
                </>:<button className="primary" disabled={saving||day>effectiveToday()||!isDue(focused,day,versions)} onClick={()=>record(focused)}><Glyph name={focused.kind==="check"?"check":"edit"} size={15}/>{focused.kind==="check"?(success(focused)?"Undo":"Complete"):focused.kind==="sleep"?"Record sleep":"Log value"}</button>}
              </div>
            </div>
            <div className="tracker-status-control"><label htmlFor="day-outcome">Day status</label><select id="day-outcome" disabled={saving||day>effectiveToday()||!isDue(focused,day,versions)} value={focused.kind==="check"?dayState(focused)==="done"?"completed":focusedEntry?.explicit_status==="completed"?"":focusedEntry?.explicit_status||"":focusedEntry?.explicit_status||""} onChange={e=>void statusChange(focused,day,(e.target.value||null) as "completed"|"skipped"|"missed"|null)}><option value="">{focused.kind==="check"?"Not recorded":"Use recorded progress"}</option>{focused.kind==="check"&&<option value="completed">Completed</option>}<option value="skipped">Skipped (planned break)</option><option value="missed">Missed</option></select>
  {focused.kind==="quantity"?<button disabled={saving||counter.hasPending(focused.id,day)||!quantityEvents.some(e=>e.habit_id===focused.id&&e.local_date===day&&e.action!=="undo"&&e.id===quantityEvents.find(q=>q.habit_id===focused.id&&q.local_date===day)?.id)} onClick={()=>void undoQuantity(focused,day)}>Undo last count</button>:<button disabled={saving||!canUndoEntry(focused,day)} onClick={()=>void undoLastEntry(focused,day)}>Undo last edit</button>}</div>
 {focused.kind==="sleep"&&focusedEntry?.awake_at&&<div className="compact-sleep-stats"><div><span>Bedtime</span><strong>{clock(focusedEntry.bed_at,timeZone)}</strong></div><div><span>Asleep</span><strong>{clock(focusedEntry.asleep_at,timeZone)}</strong></div><div><span>Wake</span><strong>{clock(focusedEntry.awake_at,timeZone)}</strong></div><div><span>Out of bed</span><strong>{clock(focusedEntry.out_of_bed_at,timeZone)}</strong></div></div>}
          </section>
          {(focused.frequency_mode==="weekly"||focused.frequency_mode==="monthly")&&<div className="tracker-goal-summary" role="status"><strong>{periodFor(focused).done} / {periodFor(focused).required}</strong><span>{focused.frequency_mode==="weekly"?"Completed days this week":"Completed days this month"} · {periodFor(focused).done>=periodFor(focused).required?"Goal reached":"In progress"}</span></div>}
          <section className="compact-stats">
            <div className="compact-section-label">At a glance</div>
            <div className="compact-stat-grid">
              <div><strong>{focused.kind==="duration"?fmt(sevenTotal):focused.kind==="check"?monthAchieved:focused.kind==="sleep"?sevenRecorded.length?fmt(sevenAverage):"—":sevenRecorded.length?sevenAverage.toFixed(1):"—"}</strong><span>{focused.kind==="duration"?"Last 7 days":focused.kind==="quantity"?"Daily average (7d)":focused.kind==="sleep"?"Average sleep (7d)":"On target (30d)"}</span></div>
              <div><strong>{monthAchieved}</strong><span>{focused.kind==="quantity"&&focused.direction==="at_most"?"Days within limit":"On target (30d)"}</span></div>
              <div><strong>{monthRecorded}/{monthDates.length}</strong><span>Days recorded</span></div>
            </div>
          </section>
          <div className="tracker-extra-metrics"><div><strong>{streak?.current??0} {streak?.unit==="week"?"weeks":streak?.unit==="month"?"months":"days"}</strong><span>Current streak</span></div>{badStats&&<><div><strong>{badStats.average==null?"—":badStats.average.toFixed(1)}</strong><span>Avg/day · {badStats.recorded}/7 logged</span></div><div><strong>{badStats.reduction==null?"—":badStats.reduction.toFixed(0)+"%"}</strong><span>Reduction vs previous week</span></div><div><strong>{badStats.zeroDays}</strong><span>Verified zero days (30d)</span></div></>}</div>
          <div className="hu-progress-panels"><section className="compact-chart-section">
            <div className="compact-section-head"><span className="compact-section-label">{focused.kind==="quantity"?"Daily counts":focused.kind==="duration"?"Time spent":focused.kind==="sleep"?"Sleep duration":"Your consistency"}</span><div className="tracker-range-control" role="group" aria-label="Chart range">{([7,14,30] as const).map(n=><button type="button" key={n} aria-label={"Show last "+n+" days"} className={historySpan===n?"selected":""} onClick={()=>setHistorySpan(n)} aria-pressed={historySpan===n}>{n}d</button>)}</div></div>
            <div className="tracker-chart-scroll"><div className="compact-chart" style={{gridTemplateColumns:"repeat("+visibleHistory.length+",minmax(16px,1fr))",minWidth:historySpan===30?"590px":historySpan===14?"360px":"210px"}} role="img" aria-label={"Last "+historySpan+" days of "+focused.name+" progress. Daily values and statuses are listed in Recent history below."}>
              {visibleHistory.map(d=>{const val=focused.kind==="check"?(entry(focused,d)?.completed?1:0):totals(focused,d);const rec=recordedFor(focused,d);const max=focused.kind==="check"?1:chartMax;return <div className="compact-chart-column" key={d} title={niceDate(d)+": "+statusFor(focused,d)+(rec?" · "+(focused.kind==="duration"||focused.kind==="sleep"?fmt(val):String(val)):"")}><div className="compact-chart-area"><div className={"compact-chart-bar "+(success(focused,d)?"hit":rec?"partial":"missing")} style={{height:(rec?Math.max(8,Math.min(100,val/max*100)):4)+"%"}}/></div><small>{new Date(d+"T12:00:00Z").toLocaleDateString("en-US",{weekday:"narrow",timeZone:"UTC"})}</small></div>})}
            </div></div>
            <div className="compact-chart-legend"><span>■ On target</span><span>■ Recorded</span><span>□ No record</span></div>
          </section>
          <MonthHeatmap habit={focused} entries={entries} today={effectiveToday()} selectedDate={day} visibleMonth={calendarDate} first={weekFirst} versions={versions} valueFor={d=>totals(focused,d)} onSelect={jumpToHistoryDate} onNavigate={setCalendarDate}/>
        </div>
        <details className="hu-detail-disclosure">
          <summary><span>Recent history</span><span className="hu-disclosure-hint">Review and edit past days</span></summary>
        <section className="compact-history-section"><div className="compact-section-head"><span className="compact-section-label">Recent history</span><span className="compact-chart-caption">Last {historySpan} days · tap to edit</span></div>
          <div className="compact-history-table">{visibleHistory.slice().reverse().map(d=>{const has=recordedFor(focused,d);const val=totals(focused,d);return <button type="button" className="compact-history-row tracker-history-button" key={d} onClick={()=>jumpToHistoryDate(d)} aria-current={day===d?"date":undefined} title={"View or edit "+niceDate(d)}><span>{niceDate(d)}</span><strong>{has?(focused.kind==="check"?statusFor(focused,d):focused.kind==="duration"||focused.kind==="sleep"?fmt(val):String(entry(focused,d)?.value??0)+" "+focused.unit):"—"}</strong><span className="compact-history-state">{statusFor(focused,d)}</span></button>})}</div>
        </section>
        </details>
        </>}
        {view==="archive"&&<section className="compact-history-section"><div className="compact-section-label">Recent history</div><div className="compact-history-table">{visibleHistory.slice().reverse().map(d=><div className="compact-history-row" key={d}><span>{niceDate(d)}</span><strong>{recordedFor(focused,d)?focused.kind==="check"?statusFor(focused,d):focused.kind==="quantity"?entry(focused,d)?.value:fmt(totals(focused,d)):"—"}</strong><span className="compact-history-state">{statusFor(focused,d)}</span></div>)}</div></section>}
        {view==="archive"&&<section className="hu-archived-calendar"><MonthHeatmap habit={focused} entries={entries} today={effectiveToday()} selectedDate={day} visibleMonth={calendarDate} first={weekFirst} versions={versions} valueFor={d=>totals(focused,d)} onSelect={jumpToHistoryDate} onNavigate={setCalendarDate}/></section>}
        {focused.kind==="quantity"&&!focused.archived_at&&<details className="hu-detail-disclosure hu-event-disclosure"><summary><span>Counter activity</span><span className="hu-disclosure-hint">Individual changes</span></summary><section className="tracker-event-panel"><div className="compact-section-head"><span className="compact-section-label">Recent counter activity</span><span className="compact-chart-caption">Individual updates</span></div>{quantityEvents.filter(e=>e.habit_id===focused.id).slice(0,8).length?quantityEvents.filter(e=>e.habit_id===focused.id).slice(0,8).map(ev=><div className="tracker-event-row" key={ev.id}><span>{niceDate(ev.local_date)} · {clock(ev.created_at,timeZone)}</span><strong>{ev.action==="increment"?"+1":ev.action==="decrement"?"−1":ev.action==="undo"?"Undo":"Set"} · {ev.resulting_value}</strong></div>):<p className="compact-supporting">New one-tap records will appear here.</p>}</section></details>}
      </div>:<div className="compact-detail-empty"><p>{view==="archive"?"Select an archived habit to review or restore it.":"Select a habit to view its progress."}</p>{view!=="archive"&&live.length===0&&<button onClick={newHabit} className="primary">Create habit</button>}</div>}
    </main>
    </>}
  </div>
  <nav className="compact-bottom-nav" aria-label="Mobile navigation"><button aria-current={view==="today"?"page":undefined} className={view==="today"?"active":""} onClick={()=>{setMobileMore(false);setView("today");chooseDate(effectiveToday());setMobileDetail(false)}}><Glyph name="grid" size={18}/> Today</button><button aria-current={view==="week"?"page":undefined} className={view==="week"?"active":""} onClick={()=>{setView("week");chooseDate(effectiveToday());setMobileDetail(false)}}><Glyph name="calendar" size={18}/> Week</button><button aria-current={view==="insights"?"page":undefined} className={view==="insights"?"active":""} onClick={()=>{setView("insights");chooseDate(effectiveToday());setMobileDetail(false)}}><Glyph name="chart" size={18}/> All</button><button type="button" aria-expanded={mobileMore} aria-haspopup="menu" aria-current={view==="archive"?"page":undefined} className={(view==="archive"||mobileMore?"active ":"")+"hu-mobile-more-trigger"} onClick={()=>setMobileMore(v=>!v)}><Glyph name="more" size={18}/> More</button></nav>
  {mobileMore&&<div ref={mobileMoreRef} className="hu-mobile-more-popover" role="menu" aria-label="More destinations">
    <button role="menuitem" onClick={()=>{setView("archive");setMobileDetail(false);setMobileMore(false)}}><Glyph name="archive" size={18}/> Archive {archived.length>0&&<small>{archived.length}</small>}</button>
    <button role="menuitem" onClick={()=>{setSettingsOpen(true);setMobileMore(false)}}><Glyph name="settings" size={18}/> Account settings</button>
  </div>}
  {(counter.pendingCount>0||counter.syncError)&&<div className="tracker-sync" role="status"><span>{counter.pendingCount>0?counter.pendingCount+" "+(counter.pendingCount===1?"change":"changes")+" waiting to sync":"Counter update status"}</span><button type="button" onClick={()=>counter.pendingCount>0?void counter.flush():counter.clearError()}>{counter.pendingCount>0?"Retry sync":"Dismiss"}</button>{counter.syncError&&<small>{counter.syncError}</small>}</div>}
  {notice&&<div className="compact-feedback" role="status"><span>{notice.message}</span>{notice.undoId&&<button type="button" onClick={()=>{const h=habits.find(x=>x.id===notice.undoId);if(h)void restoreHabit(h);setNotice(null)}}>Undo</button>}<button type="button" className="compact-feedback-dismiss" aria-label="Dismiss message" onClick={()=>setNotice(null)}><Glyph name="close" size={15}/></button></div>}
  {error&&<div className="toast" role="alert">{error}<button onClick={()=>setError("")} aria-label="Dismiss"><Glyph name="close" size={14}/></button></div>}
  {settingsOpen&&<AccountSettings url={URL} apiKey={KEY} token={token} userId={userId} onClose={()=>setSettingsOpen(false)} onLogout={logout} onUpdated={accountUpdated} dayStartMinutes={dayStartMinutes} timeZone={timeZone} pendingCounters={counter.pendingCount} onDaySettingsChanged={(zone,minutes)=>{setTimeZone(safeZone(zone));setDayStartMinutes(safeDayStart(minutes));void load()}}/>}
  {modal&&<div className="modal-backdrop"><div ref={dialogRef} onKeyDown={dialogKeyDown} role="dialog" aria-modal="true" aria-labelledby="habit-dialog-title" className="modal"><div className="modal-top"><div><h2 id="habit-dialog-title">{modal==="delete"?"Delete habit permanently":modal==="create"?(editing?"Edit habit":"Add a habit"):modal==="log"?"Record "+(selected?.name||"progress"):modal==="sleep"?"Record sleep":selected?.name||"Habit"}</h2></div><button type="button" className="close-modal" disabled={saving} onClick={closeModal} aria-label="Close dialog"><Glyph name="close"/></button></div>
{modal==="create"&&<form className="modal-form" onSubmit={saveHabit}><label>Habit name<input required maxLength={100} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Deep work"/></label><label>Tracking method<select disabled={editing} value={form.kind} onChange={e=>setForm({...form,kind:e.target.value as Habit["kind"],target:e.target.value==="duration"?300:1,direction:e.target.value==="quantity"?"at_most":"at_least"})}><option value="check">Yes / no (check-off)</option><option value="quantity">Count an amount</option><option value="duration">Track minutes</option><option value="sleep">Record sleep</option></select></label><label>Start date<input type="date" required value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})}/><span className="form-hint">Tracking and statistics begin on this date. Earlier days are never marked as missed. Future dates are allowed.</span></label>{form.kind!=="check"&&form.kind!=="sleep"&&<div className="fields-two"><label>{form.kind==="quantity"?"Daily goal or limit":"Minutes per session goal"}<input type="number" min="0" max="100000" step={form.kind==="duration"?"1":"0.1"} value={form.target} onChange={e=>setForm({...form,target:Number(e.target.value)})}/></label>{form.kind==="quantity"&&<label>Goal type<select value={form.direction} onChange={e=>setForm({...form,direction:e.target.value as Habit["direction"],frequency_mode:e.target.value==="at_most"?"selected_days":form.frequency_mode})}><option value="at_most">Stay under a limit</option><option value="at_least">Reach a minimum</option></select></label>}</div>}{form.kind==="quantity"&&<label>Unit<input value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})} placeholder="cigarettes, glasses…"/></label>}{form.kind==="sleep"&&<div className="fields-two"><label>Bedtime goal<input type="time" value={form.sleep_bedtime_goal} onChange={e=>setForm({...form,sleep_bedtime_goal:e.target.value})}/></label><label>Wake time goal<input type="time" value={form.sleep_wake_goal} onChange={e=>setForm({...form,sleep_wake_goal:e.target.value})}/></label><label>Sleep minutes target<input min="0" max="1440" type="number" value={form.sleep_duration_goal} onChange={e=>setForm({...form,sleep_duration_goal:Number(e.target.value)})}/></label></div>}<label>Repeat<select value={form.frequency_mode} onChange={e=>setForm({...form,frequency_mode:e.target.value as FrequencyMode})}>
<option value="selected_days">Daily or selected weekdays</option>{form.direction!=="at_most"&&<><option value="weekly">Flexible · times per week</option><option value="monthly">Flexible · times per month</option><option value="interval">Every few days</option></>}</select></label>
{(form.frequency_mode==="weekly"||form.frequency_mode==="monthly")&&<label>Days to reach your goal per {form.frequency_mode==="weekly"?"week":"month"}<input type="number" min={1} max={form.frequency_mode==="weekly"?7:31} step={1} value={form.frequency_count} onChange={e=>setForm({...form,frequency_count:Number(e.target.value)})}/></label>}
{form.frequency_mode==="interval"&&<label>Repeat every number of days<input type="number" min={2} max={30} step={1} value={form.interval_days} onChange={e=>setForm({...form,interval_days:Number(e.target.value)})}/></label>}
{form.frequency_mode==="selected_days"&&<><label>Scheduled days</label><div className="week-select" role="group" aria-label="Repeat on these days">{["Su","Mo","Tu","We","Th","Fr","Sa"].map((label,i)=><button type="button" key={i} aria-label={["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][i]} aria-pressed={form.schedule_days.includes(i)} className={form.schedule_days.includes(i)?"selected":""} onClick={()=>setForm({...form,schedule_days:form.schedule_days.includes(i)?form.schedule_days.filter(d=>d!==i):[...form.schedule_days,i].sort()})}>{label}</button>)}</div></>}<details className="tracker-advanced"><summary>Appearance (optional)</summary><div className="fields-two"><label>Accent color<select value={form.color} onChange={e=>setForm({...form,color:e.target.value})}><option value="sage">Sage green</option><option value="lavender">Lavender</option><option value="peach">Soft peach</option><option value="blue">Sky blue</option></select></label><label>Icon<select value={form.icon} onChange={e=>setForm({...form,icon:e.target.value})}><option value="activity">Activity</option><option value="moon">Moon</option><option value="sun">Sun</option><option value="coffee">Coffee</option><option value="leaf">Leaf</option><option value="check">Check</option></select></label></div></details><div className="modal-footer"><button type="button" className="compact-form-cancel" disabled={saving} onClick={closeModal}>Cancel</button><button disabled={saving||!form.name.trim()||(form.frequency_mode==="selected_days"&&form.schedule_days.length===0)||(form.frequency_mode==="interval"&&(form.interval_days<2||form.interval_days>30))||(form.frequency_mode==="weekly"&&(form.frequency_count<1||form.frequency_count>7))||(form.frequency_mode==="monthly"&&(form.frequency_count<1||form.frequency_count>31))} className="primary" type="submit">{saving?"Saving…":editing?"Save changes":"Create habit"} <Glyph name="chevron" size={16}/></button></div></form>}
{modal==="log"&&selected&&<form className="modal-form" onSubmit={async e=>{e.preventDefault();if(selected.kind==="quantity"){const value=Number(quantity);if(!Number.isFinite(value)||value<0||value>100000||Math.abs(Math.round(value*100)-value*100)>1e-7){setError("Enter a valid total between 0 and 100000 with at most 2 decimals.");return}if(!counter.enqueue(selected.id,modalDate,"set",value)){setError("Unable to queue this correction.");return}setModal(null)}else{if(await saveEntry(selected,{value:Number(quantity),confirmed:true},modalDate))setModal(null)}}}><p className="form-hint">Recording for {niceDate(modalDate)}.</p><label>{selected.kind==="quantity"?"Daily total":"Manual minutes for this day"}<input autoFocus required type="number" min="0" max="100000" step={selected.kind==="quantity"?"0.01":"0.1"} value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><p className="form-hint">{selected.kind==="quantity"?"Correct the total for "+niceDate(day)+". Use + or − for quick changes. Save 0 to confirm none.":"Set manual minutes for "+niceDate(day)+". Timer sessions are counted separately."}</p><div className="modal-footer"><button type="button" className="compact-form-cancel" onClick={closeModal} disabled={saving}>Cancel</button><button className="primary" disabled={saving||quantity===""} type="submit">Save <Glyph name="check" size={16}/></button></div></form>}
{modal==="sleep"&&selected&&<form className="modal-form" onSubmit={async e=>{e.preventDefault();const data=Object.fromEntries(Object.entries(sleepForm).map(([k,v])=>[k,isoLocal(v,timeZone)]));if(!data.bed_at||!data.asleep_at||!data.awake_at){setError("Bedtime, sleep onset, and wake time are required.");return}if(new Date(data.bed_at)>new Date(data.asleep_at)||new Date(data.asleep_at)>new Date(data.awake_at)||data.out_of_bed_at&&new Date(data.out_of_bed_at)<new Date(data.awake_at)){setError("Please enter times in the correct order.");return}if(await saveEntry(selected,{...data,value:minute(data.asleep_at as string,data.awake_at as string),confirmed:true},modalDate))setModal(null)}}><p className="form-hint">Recording for {niceDate(modalDate)}. Record estimated times for this night. HeavyUser calculates sleep duration; this is not sensor-measured sleep.</p>{([{key:"bed_at",label:"Went to bed"},{key:"asleep_at",label:"Fell asleep (estimate)"},{key:"awake_at",label:"Woke up"},{key:"out_of_bed_at",label:"Left bed (optional)"}] as const).map(f=><label key={f.key}>{f.label}<input type="datetime-local" required={f.key!=="out_of_bed_at"} value={sleepForm[f.key]} onChange={e=>setSleepForm({...sleepForm,[f.key]:e.target.value})}/></label>)}<div className="modal-footer"><button type="button" className="compact-form-cancel" disabled={saving} onClick={closeModal}>Cancel</button><button type="submit" className="primary" disabled={saving}>Save sleep <Glyph name="check" size={16}/></button></div></form>}
{modal==="delete"&&selected&&<form className="modal-form" onSubmit={e=>{e.preventDefault();permanentlyDeleteHabit(selected)}}>
  <p className="compact-delete-warning">This permanently deletes <strong>{selected.name}</strong>, including every daily record and work session. It cannot be undone.</p>
  <label>Type <strong>{selected.name}</strong> to confirm<input autoFocus autoComplete="off" spellCheck={false} value={deleteText} onChange={e=>setDeleteText(e.target.value)} placeholder="Exact habit name" /></label>
  <div className="modal-footer"><button type="button" className="compact-form-cancel" disabled={saving} onClick={closeModal}>Cancel</button><button type="submit" className="compact-danger-fill" disabled={saving||deleteText!==selected.name}>{saving?"Deleting…":"Delete habit and data"}</button></div>
</form>}
{modal==="detail"&&selected&&<div className="modal-form"><p className="form-hint">Recent tracking history for {selected.name}. Choose a day on the main screen to edit a record.</p><div className="history-list">{[...Array(7)].map((_,i)=>{const d=shift(effectiveToday(),-i);const e=entry(selected,d);return <div key={d}><span>{niceDate(d)}</span><strong>{selected.kind==="sleep"?e?.awake_at?fmt(totals(selected,d)):"—":selected.kind==="check"?e?.completed?"Complete":"—":selected.kind==="duration"?fmt(totals(selected,d)):e?.confirmed?String(e.value):"—"}</strong></div>})}</div><div className="modal-footer"><button className="outline-btn" onClick={()=>{editHabit(selected)}}><Glyph name="edit" size={15}/> Edit settings</button><button className="primary" onClick={()=>{chooseDate(effectiveToday());setModal(null);setView("today")}}>Done</button></div></div>}</div></div>}</div>}
