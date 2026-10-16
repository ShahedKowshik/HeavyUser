"use client";
import {useEffect,useRef,useState} from "react";
import {resolveSignedAvatarUrl} from "../lib/avatar-url";

export type AccountUser={id:string;email?:string;new_email?:string;user_metadata?:Record<string,unknown>};
type Props={url:string;apiKey:string;token:string;userId:string;onClose:()=>void;onLogout:()=>void;onUpdated:(user:AccountUser)=>void};
const BUCKET="heavyuser-avatars";
const errorText=(data:Record<string,unknown>|null)=>String(data?.msg||data?.error_description||data?.message||data?.error||"Unable to complete the request.");
const initials=(first:string,last:string,email:string)=>((first[0]||"")+(last[0]||"")).toUpperCase()||email.slice(0,1).toUpperCase()||"H";
const pathUrl=(path:string)=>path.split("/").map(encodeURIComponent).join("/");
async function api(url:string,key:string,token:string,path:string,init:RequestInit={}):Promise<any>{
  const res=await fetch(url+path,{...init,headers:{"apikey":key,"Authorization":"Bearer "+token,...init.headers}});
  const raw=await res.text();let json:any={};
  try{json=raw?JSON.parse(raw):{}}catch{json={}}
  if(!res.ok)throw Error(errorText(json));
  return json;
}
export async function getAccount(url:string,key:string,token:string):Promise<AccountUser>{
  return api(url,key,token,"/auth/v1/user");
}
export async function getAvatar(url:string,key:string,token:string,path:string):Promise<string>{
  const response=await api(url,key,token,"/storage/v1/object/sign/"+BUCKET+"/"+pathUrl(path),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({expiresIn:3600})});
  const signed=response.signedURL||response.signedUrl;
  if(typeof signed!=="string")throw Error("Could not load profile photo.");
  return resolveSignedAvatarUrl(url,signed);
}
async function updateUser(url:string,key:string,token:string,body:Record<string,unknown>):Promise<AccountUser>{
  return api(url,key,token,"/auth/v1/user",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
}
async function exportRows(url:string,key:string,token:string,table:string){
  const all:unknown[]=[];const limit=500;
  for(let offset=0;offset<100000;offset+=limit){
    const rows=await api(url,key,token,"/rest/v1/"+table+"?select=*&order=created_at.asc&limit="+limit+"&offset="+offset);
    if(!Array.isArray(rows))throw Error("Unexpected export result.");
    all.push(...rows);
    if(rows.length<limit)return all;
  }
  throw Error("Export exceeded the safety limit; no incomplete export was downloaded.");
}
export default function AccountSettings({url,apiKey,token,userId,onClose,onLogout,onUpdated}:Props){
  const [tab,setTab]=useState<"profile"|"security"|"data">("profile");
  const [user,setUser]=useState<AccountUser|null>(null);
  const [first,setFirst]=useState("");const [last,setLast]=useState("");
  const [photo,setPhoto]=useState("");
  const [pending,setPending]=useState("");const [notice,setNotice]=useState("");
  const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [repeat,setRepeat]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape"&&!pending)onClose()};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey)},[onClose,pending]);
  const fileRef=useRef<HTMLInputElement>(null);
  const panelRef=useRef<HTMLElement>(null);
  const currentPath=String(user?.user_metadata?.avatar_path||"");
  const displayEmail=user?.email||"";
  useEffect(()=>{
    let live=true;
    (async()=>{
      try{
        const u=await getAccount(url,apiKey,token);
        if(!live)return;
        setUser(u);setFirst(String(u.user_metadata?.first_name||""));setLast(String(u.user_metadata?.last_name||""));setEmail(u.email||"");onUpdated(u);
        const path=String(u.user_metadata?.avatar_path||"");
        if(path){try{const picture=await getAvatar(url,apiKey,token,path);if(live)setPhoto(picture)}catch{if(live)setPhoto("")}}
      }catch(e){if(live)setError((e as Error).message)}finally{if(live)setLoading(false)}
    })();
    return()=>{live=false};
  },[url,apiKey,token]);
  const clear=()=>{setError("");setNotice("")};
  async function run(action:string,handler:()=>Promise<void>){
    clear();setPending(action);
    try{await handler()}catch(e){setError((e as Error).message)}finally{setPending("")}
  }
  async function saveProfile(e:React.FormEvent){e.preventDefault();if(!user)return;
    await run("profile",async()=>{
      const a=first.trim(),b=last.trim();
      if(a.length>60||b.length>60)throw Error("Each name must be 60 characters or fewer.");
      const updated=await updateUser(url,apiKey,token,{data:{...user.user_metadata,first_name:a,last_name:b}});
      setUser(updated);onUpdated(updated);setNotice("Profile details saved.");
    });
  }
  async function uploadPhoto(file:File|undefined){if(!file||!user||!userId)return;
    await run("photo",async()=>{
      const allowed=["image/jpeg","image/png","image/webp"];
      if(!allowed.includes(file.type))throw Error("Choose a JPG, PNG, or WebP image.");
      if(file.size>2097152)throw Error("Profile photos must be smaller than 2 MB.");
      if(file.size===0)throw Error("The selected file is empty.");
      const extension=file.type==="image/jpeg"?"jpg":file.type==="image/png"?"png":"webp";
      const path=userId+"/"+crypto.randomUUID()+"."+extension;
      await api(url,apiKey,token,"/storage/v1/object/"+BUCKET+"/"+path,{method:"POST",headers:{"Content-Type":file.type,"x-upsert":"false"},body:file});
      const signedImageUrl=await getAvatar(url,apiKey,token,path);
      const updated=await updateUser(url,apiKey,token,{data:{...user.user_metadata,avatar_path:path}});
      setUser(updated);setPhoto(signedImageUrl);onUpdated(updated);
      setNotice("Profile photo updated.");
      const old=String(user.user_metadata?.avatar_path||"");
      if(old&&old.startsWith(userId+"/"))try{await api(url,apiKey,token,"/storage/v1/object/"+BUCKET,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({prefixes:[old]})})}catch{}
    });
    if(fileRef.current)fileRef.current.value="";
  }
  async function removePhoto(){
    if(!user||!currentPath)return;
    await run("remove",async()=>{
      const updated=await updateUser(url,apiKey,token,{data:{...user.user_metadata,avatar_path:null}});
      setUser(updated);onUpdated(updated);setPhoto("");setNotice("Profile photo removed.");
      if(currentPath.startsWith(userId+"/"))try{await api(url,apiKey,token,"/storage/v1/object/"+BUCKET,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({prefixes:[currentPath]})})}catch{}
    });
  }
  async function changeEmail(e:React.FormEvent){e.preventDefault();if(!user)return;
    await run("email",async()=>{
      const value=email.trim();
      if(!value||value.toLowerCase()===displayEmail.toLowerCase())throw Error("Enter a different email address.");
      await updateUser(url,apiKey,token,{email:value});
      setNotice("Confirmation email requested. Follow the instructions sent to your email address(es) to complete the change.");
    });
  }
  async function changePassword(e:React.FormEvent){e.preventDefault();
    await run("password",async()=>{
      if(password.length<8)throw Error("Use at least 8 characters for your new password.");
      if(password!==repeat)throw Error("The passwords do not match.");
      await updateUser(url,apiKey,token,{password});
      setPassword("");setRepeat("");setNotice("Password updated. Your account remains signed in on this device.");
    });
  }
  async function downloadData(){
    await run("export",async()=>{
      const [habits,habit_entries,work_sessions]=await Promise.all(["habits","habit_entries","work_sessions"].map(table=>exportRows(url,apiKey,token,table)));
      const payload={exported_at:new Date().toISOString(),account_email:displayEmail,profile:{first_name:first,last_name:last},habits,habit_entries,work_sessions};
      const data=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}));
      const link=document.createElement("a");link.href=data;link.download="heavyuser-backup-"+new Date().toISOString().slice(0,10)+".json";document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(data),2000);
      setNotice("Your private data export has been downloaded.");
    });
  }
  return <div className="account-backdrop">
    <section ref={panelRef} className="account-panel" role="dialog" aria-modal="true" aria-labelledby="account-title" onKeyDown={e=>{
      if(e.key!=="Tab")return;
      const items=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')).filter(item=>item.getClientRects().length>0);
      const first=items[0],last=items.at(-1);
      if(!first||!last)return;
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
    }}>
      <header className="account-header"><div><h2 id="account-title">Account settings</h2><p>Profile, security and data</p></div><button className="account-icon-btn" type="button" aria-label="Close settings" disabled={!!pending} onClick={onClose}>×</button></header>
      <div className="account-layout">
        <nav className="account-tabs" aria-label="Account sections">
          <button type="button" aria-current={tab==="profile"?"page":undefined} className={tab==="profile"?"selected":""} onClick={()=>{setTab("profile");clear()}}>Profile</button>
          <button type="button" aria-current={tab==="security"?"page":undefined} className={tab==="security"?"selected":""} onClick={()=>{setTab("security");clear()}}>Email & password</button>
          <button type="button" aria-current={tab==="data"?"page":undefined} className={tab==="data"?"selected":""} onClick={()=>{setTab("data");clear()}}>Data & privacy</button>
        <button type="button" className="account-tab-signout" onClick={onLogout} title="Sign out of this browser">Sign out</button>
        </nav>
        <div className="account-content">
          {loading?<p className="account-help">Loading your account…</p>:<>
          {tab==="profile"&&<div className="account-section">
            <h3>Personal information</h3><p className="account-help">This is how your profile appears inside HeavyUser.</p>
            <div className="photo-row">
              <div className="account-photo">{photo?<img src={photo} alt="Your profile picture" onError={()=>{setPhoto("");setError("The saved photo could not be displayed. Try reopening settings or uploading another image.");}}/>:initials(first,last,displayEmail)}</div>
              <div className="photo-controls"><strong>Profile picture</strong><p>JPG, PNG or WebP, up to 2 MB.</p><div className="photo-buttons"><input type="file" ref={fileRef} accept="image/jpeg,image/png,image/webp" className="visually-hidden" id="account-photo-file" onChange={e=>uploadPhoto(e.target.files?.[0])}/><button type="button" disabled={!!pending} className="account-secondary" onClick={()=>fileRef.current?.click()}>{pending==="photo"?"Uploading…":"Upload photo"}</button>{currentPath&&<button type="button" disabled={!!pending} className="account-link" onClick={removePhoto}>Remove</button>}</div></div>
            </div>
            <form className="account-form" onSubmit={saveProfile}><div className="account-two"><label>First name<input autoComplete="given-name" maxLength={60} value={first} onChange={e=>setFirst(e.target.value)} placeholder="First name"/></label><label>Last name<input autoComplete="family-name" maxLength={60} value={last} onChange={e=>setLast(e.target.value)} placeholder="Last name"/></label></div><label>Current email<input readOnly value={displayEmail} aria-label="Current account email"/></label><div className="account-actions"><button className="primary" type="submit" disabled={!!pending}>{pending==="profile"?"Saving…":"Save profile"}</button></div></form>
          </div>}
          {tab==="security"&&<div className="account-section">
            <h3>Change email address</h3><p className="account-help">We'll send confirmation instructions before switching your account email.</p>
            <form className="account-form" onSubmit={changeEmail}><label>New email address<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><div className="account-actions"><button type="submit" className="account-secondary" disabled={!!pending}>{pending==="email"?"Sending…":"Request email change"}</button></div></form>
            <div className="account-rule"/>
            <h3>Change password</h3><p className="account-help">Use a unique password with at least eight characters.</p>
            <form className="account-form" onSubmit={changePassword}><label>New password<input required type="password" autoComplete="new-password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Confirm new password<input required type="password" autoComplete="new-password" minLength={8} value={repeat} onChange={e=>setRepeat(e.target.value)}/></label><div className="account-actions"><button type="submit" className="primary" disabled={!!pending}>{pending==="password"?"Updating…":"Update password"}</button></div></form>
          </div>}
          {tab==="data"&&<div className="account-section">
            <h3>Data and privacy</h3><p className="account-help">Your habits and records belong to your account. Your profile photo is stored privately.</p>
            <div className="account-export"><div><strong>Download your data</strong><p>Get a JSON backup of your habits, records and work sessions.</p></div><button type="button" className="account-secondary" disabled={!!pending} onClick={downloadData}>{pending==="export"?"Preparing…":"Export data"}</button></div>
            
          </div>}
          </>}
          {notice&&<p className="account-notice" role="status">{notice}</p>}
          {error&&<p className="account-error" role="alert">{error}</p>}
        </div>
      </div>
    </section>
  </div>;
}
