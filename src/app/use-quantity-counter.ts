"use client";
import {useCallback,useEffect,useRef,useState} from "react";

export type QuantityAction = "increment"|"decrement"|"set";
export type QuantityOperation={id:string;habitId:string;date:string;action:QuantityAction;value?:number};
export type QuantityConfirmation={habit_id:string;date:string;value:number;event_id:string;confirmed:boolean;duplicate?:boolean};
type Options={
 url:string;apiKey:string;token:string;userId:string;
 onConfirmed:(result:QuantityConfirmation,operation:QuantityOperation)=>void;
 onSynced?:()=>void;
};
const KEY_PREFIX="heavyuser:quantity-queue:v1:";
function storageKey(id:string){return KEY_PREFIX+id;}
function validOperation(input:unknown):input is QuantityOperation{
 if(!input||typeof input!=="object")return false;
 const o=input as Partial<QuantityOperation>;
 return typeof o.id==="string"&&typeof o.habitId==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(o.date||"")&&
 (o.action==="increment"||o.action==="decrement"||o.action==="set")&&(o.action!=="set"||(typeof o.value==="number"&&Number.isFinite(o.value)));
}
export function projectQuantity(base:number,operations:QuantityOperation[],habitId:string,date:string):number{
 return operations.filter(o=>o.habitId===habitId&&o.date===date).reduce((value,o)=>{
  if(o.action==="set")return o.value??value;
  return value+(o.action==="increment"?1:-1);
 },base);
}
export function useQuantityQueue({url,apiKey,token,userId,onConfirmed,onSynced}:Options){
 const [operations,setOperations]=useState<QuantityOperation[]>([]);
 const [syncError,setSyncError]=useState("");
 const queue=useRef<QuantityOperation[]>([]);
 const busy=useRef(false);
 const identity=useRef("");
 const credentials=useRef({token,url,apiKey,userId});
 const callbacks=useRef({onConfirmed,onSynced});
 credentials.current={token,url,apiKey,userId};
 callbacks.current={onConfirmed,onSynced};

 const publish=useCallback((next:QuantityOperation[])=>{
  queue.current=next;
  setOperations(next);
  if(identity.current&&typeof window!=="undefined")
   localStorage.setItem(storageKey(identity.current),JSON.stringify(next));
 },[]);
 const flush=useCallback(async()=>{
  if(busy.current||!credentials.current.userId||!credentials.current.token||!identity.current)return;
  busy.current=true;
  let committed=false;
  try{
   while(queue.current.length){
    const op=queue.current[0];
    const c=credentials.current;
    if(!c.token||!c.userId||c.userId!==identity.current)break;
    try{
     const response=await fetch(c.url+"/rest/v1/rpc/record_quantity",{
      method:"POST",
      headers:{"Content-Type":"application/json","apikey":c.apiKey,"Authorization":"Bearer "+c.token},
      body:JSON.stringify({p_habit_id:op.habitId,p_action:op.action,p_event_id:op.id,p_date:op.date,p_value:op.action==="set"?op.value:null})
     });
     const result=await response.json().catch(()=>null);
     if(!response.ok||!result||typeof result.value!=="number")
      throw new Error(result?.message||result?.error||"Quantity record could not be saved.");
     // Update the canonical value BEFORE removing the optimistic operation.
     callbacks.current.onConfirmed(result as QuantityConfirmation,op);
     publish(queue.current.slice(1));
     setSyncError("");
     committed=true;
    }catch(err){
     const reason=err instanceof Error?err.message:"Network error";
     setSyncError("Changes not yet saved. "+reason);
     break; // The same UUID is retried; never manufacture another event ID.
    }
   }
  }finally{
   busy.current=false;
   if(committed)callbacks.current.onSynced?.();
  }
 },[publish]);
 useEffect(()=>{
  if(!userId||!token||typeof window==="undefined")return;
  if(identity.current!==userId){
   identity.current=userId;
   let restored:QuantityOperation[]=[];
   try{
    const raw=JSON.parse(localStorage.getItem(storageKey(userId))||"[]");
    if(Array.isArray(raw))restored=raw.filter(validOperation).slice(0,5000);
   }catch{}
   publish(restored);
  }
  void flush();
 },[userId,token,flush,publish]);
 useEffect(()=>{
  if(!userId)return;
  const run=()=>{if(typeof document==="undefined"||document.visibilityState==="visible")void flush()};
  window.addEventListener("online",run);
  window.addEventListener("focus",run);
  document.addEventListener("visibilitychange",run);
  return()=>{window.removeEventListener("online",run);window.removeEventListener("focus",run);document.removeEventListener("visibilitychange",run)};
 },[userId,flush]);
 const enqueue=useCallback((habitId:string,date:string,action:QuantityAction,value?:number)=>{
  if(!credentials.current.userId||identity.current!==credentials.current.userId)return false;
  if(action==="set"&&(value==null||!Number.isFinite(value)||value<0||value>100000))return false;
  const operation:QuantityOperation={id:crypto.randomUUID(),habitId,date,action,...(action==="set"?{value}:null)};
  if(queue.current.length>=5000){setSyncError("There are too many unsaved actions. Reconnect before recording more.");return false}
  publish([...queue.current,operation]);
  void flush();
  return true;
 },[publish,flush]);
 const discard=useCallback((id:string)=>{
  // Never discard a request in flight. Removing that ID could make a successful
  // server write appear missing or cause an unintended decrement on a retry.
  if(busy.current&&queue.current[0]?.id===id)return false;
  publish(queue.current.filter(o=>o.id!==id));
  return true;
 },[publish]);
 const getProjected=useCallback((base:number,habitId:string,date:string)=>
  projectQuantity(base,operations,habitId,date),[operations]);
 const hasPending=useCallback((habitId:string,date?:string)=>operations.some(o=>o.habitId===habitId&&(!date||o.date===date)),[operations]);
 return {enqueue,flush,discard,getProjected,hasPending,operations,syncError,pendingCount:operations.length};
}
