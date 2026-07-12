import { useState, useEffect, useRef, useCallback } from "react";
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis } from "recharts";
import { auth } from "./firebase";
import { pullUserData, pushUserData, deleteUserCloudData } from "./cloudSync";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";

/* ═══════════════════════════════════════════════════════════════════════
   SMIRA — Your Personal Wellness & Confidence Companion
   AI Skin Analysis · Wellness Coach · Habit Builder · Confidence Guide
═══════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════
   SMIRA V4 — Auth · Light/Dark/System Theme · Settings
═══════════════════════════════════════════════════════════ */

const LS = {
  _listeners: new Set(),
  get:(k,fb=null)=>{try{const v=localStorage.getItem("smira4_"+k);return v?JSON.parse(v):fb;}catch{return fb;}},
  set:(k,v)=>{
    try{localStorage.setItem("smira4_"+k,JSON.stringify(v));}catch{}
    LS._listeners.forEach(fn=>{try{fn(k,v);}catch{}});
  },
  /* Writes without notifying listeners — used only when hydrating from the
     cloud, so we don't immediately re-push what we just pulled down. */
  setSilent:(k,v)=>{try{localStorage.setItem("smira4_"+k,JSON.stringify(v));}catch{}},
  del:(k)=>{try{localStorage.removeItem("smira4_"+k);}catch{}},
  subscribe:(fn)=>{LS._listeners.add(fn);return()=>LS._listeners.delete(fn);},
};

/* Makes a custom clickable <div> behave like a real button for keyboard
   users: focusable via Tab, activatable via Enter/Space, and announced
   correctly by screen readers. Spread onto any div that currently only
   has onClick. `label` is required when the div has no visible text
   (icon-only controls) so screen readers have something to announce. */
const kb=(onClick,label)=>({
  role:"button",
  tabIndex:0,
  className:"kb-focusable",
  onClick,
  onKeyDown:(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onClick(e);}},
  ...(label?{"aria-label":label}:{}),
});

/* ── THEME SYSTEM ───────────────────────────────────────────────────── */
const DARK_T={dp:"#1A0B12",deep:"#2E0E1F",plum:"#4A1530",wine:"#6B2244",berry:"#8B3A57",rose:"#B55C79",blush:"#D4879A",petal:"#F0C4CC",mist:"#F5E6EA",card:"rgba(74,21,48,0.45)",border:"rgba(181,92,121,0.18)",txt:"#F5E6EA",muted:"#9A6677",soft:"#D4879A",bg:"#1A0B12",sbg:"rgba(18,6,14,.97)",topbar:"rgba(18,6,14,.88)",inpBg:"rgba(255,255,255,.04)",inpBorder:"rgba(181,92,121,.18)",gold:"#D8B36A",scrollThumb:"#6B2244",bodyBg:"linear-gradient(135deg,#1A0B12 0%,#200D16 55%,#160910 100%)"};
const LIGHT_T={dp:"#FFFDFB",deep:"#FFF7F8",plum:"#F9EEF1",wine:"#E9D7DD",berry:"#8B3A57",rose:"#B55C79",blush:"#8B3A57",petal:"#6B2244",mist:"#2E0E1F",card:"rgba(255,247,248,0.94)",border:"#E9D7DD",txt:"#2E0E1F",muted:"#7A5060",soft:"#8B3A57",bg:"#FFFDFB",sbg:"#F9EEF1",topbar:"rgba(255,253,251,.95)",inpBg:"rgba(139,58,87,.05)",inpBorder:"#D4B5C0",gold:"#B8902A",scrollThumb:"#D4879A",bodyBg:"linear-gradient(135deg,#FFFDFB 0%,#FFF7F8 55%,#F9EEF1 100%)"};
const getSystemTheme=()=>window.matchMedia?.("(prefers-color-scheme:dark)").matches?"dark":"light";
const resolveTheme=(p)=>p==="system"?getSystemTheme():p;
const ThemeCtx=typeof window!=="undefined"?window.__smiraThemeCtx||(window.__smiraThemeCtx={t:DARK_T}):{t:DARK_T};

/* ── AUTH (Firebase Authentication) ─────────────────────────────────
   Same method names/shapes as the old localStorage placeholder
   (getUser/setUser/clear/signup/login/google/resetPw), so AuthScreen,
   Settings, and the main App component didn't need to change at all. */

const mapFbUser=(u)=>u?{
  uid:u.uid,
  name:u.displayName||(u.email?u.email.split("@")[0]:""),
  email:u.email,
  provider:u.providerData?.[0]?.providerId==="google.com"?"google":"email",
  photoURL:u.photoURL||null,
  createdAt:u.metadata?.creationTime?new Date(u.metadata.creationTime).getTime():Date.now(),
}:null;

/* Firebase's error messages are technical (e.g. "Firebase: Error
   (auth/invalid-credential)."); map the common ones to plain language. */
const friendlyAuthError=(err)=>{
  const code=err?.code||"";
  const map={
    "auth/email-already-in-use":"An account with this email already exists. Try signing in instead.",
    "auth/invalid-email":"Please enter a valid email address.",
    "auth/weak-password":"Password must be at least 6 characters.",
    "auth/user-not-found":"No account found with that email.",
    "auth/wrong-password":"Incorrect password. Please try again.",
    "auth/invalid-credential":"Incorrect email or password. Please try again.",
    "auth/too-many-requests":"Too many attempts. Please wait a moment and try again.",
    "auth/popup-closed-by-user":"Sign-in was cancelled.",
    "auth/network-request-failed":"Network error. Please check your connection and try again.",
  };
  return new Error(map[code]||err?.message||"Something went wrong. Please try again.");
};

const AUTH={
  /* Firebase persists sessions itself — getUser/setUser/clear are kept only
     as a lightweight local cache so the app can render instantly on reload
     without waiting a tick for onAuthStateChanged to fire. The source of
     truth is always Firebase; see onChange() below. */
  getUser:()=>LS.get("auth_user",null),
  setUser:(u)=>LS.set("auth_user",u),
  clear:async()=>{await signOut(auth);LS.del("auth_user");},
  /* Subscribes to real Firebase auth state. Call once on app mount. */
  onChange:(cb)=>onAuthStateChanged(auth,(fbUser)=>{
    const mapped=mapFbUser(fbUser);
    if(mapped)LS.set("auth_user",mapped);else LS.del("auth_user");
    cb(mapped);
  }),
  signup:async(name,email,pw)=>{
    if(!email.includes("@"))throw new Error("Invalid email address.");
    if(pw.length<6)throw new Error("Password must be at least 6 characters.");
    try{
      const cred=await createUserWithEmailAndPassword(auth,email,pw);
      if(name)await updateProfile(cred.user,{displayName:name});
      return mapFbUser({...cred.user,displayName:name||cred.user.displayName});
    }catch(err){throw friendlyAuthError(err);}
  },
  login:async(email,pw)=>{
    if(!email.includes("@"))throw new Error("Invalid email address.");
    if(!pw)throw new Error("Please enter your password.");
    try{
      const cred=await signInWithEmailAndPassword(auth,email,pw);
      return mapFbUser(cred.user);
    }catch(err){throw friendlyAuthError(err);}
  },
  google:async()=>{
    try{
      const provider=new GoogleAuthProvider();
      const cred=await signInWithPopup(auth,provider);
      return mapFbUser(cred.user);
    }catch(err){throw friendlyAuthError(err);}
  },
  resetPw:async(email)=>{
    if(!email.includes("@"))throw new Error("Enter a valid email address.");
    try{
      await sendPasswordResetEmail(auth,email);
      return true;
    }catch(err){throw friendlyAuthError(err);}
  },
};

const AV={
  neutral:"/avatars/neutral.png",
  happy:"/avatars/happy.png",
  welcome:"/avatars/welcome.png",
  analysis:"/avatars/analysis.png",
  morning:"/avatars/morning.png",
  celebration:"/avatars/celebration.png",
  coach:"/avatars/coach.png",
  night:"/avatars/night.png",
  empathy:"/avatars/empathy.png",
  achievement:"/avatars/achievement.png",
};

const GlobalStyles=({theme="dark"})=>{
const t=theme==="light"?LIGHT_T:DARK_T;
return(
<style>{`
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,400;1,600&family=DM+Sans:wght@300;400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
:root{--dp:${t.dp};--deep:${t.deep};--plum:${t.plum};--wine:${t.wine};--berry:${t.berry};--rose:${t.rose};--blush:${t.blush};--petal:${t.petal};--mist:${t.mist};--card:${t.card};--border:${t.border};--txt:${t.txt};--muted:${t.muted};--soft:${t.soft};--ok:#A8E6C9;--warn:#F5D5A3;--err:#F5A3A3;--gold:${t.gold};}
html,body{height:100%;background:${t.bg};color:${t.txt};font-family:'DM Sans',sans-serif;overflow-x:hidden;transition:background .35s,color .35s;}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:${t.bg}}::-webkit-scrollbar-thumb{background:${t.scrollThumb};border-radius:2px}
.cf{font-family:'Cormorant Garamond',serif}
.glass{background:${t.card};backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid ${t.border};border-radius:20px;}
.glow{box-shadow:0 0 32px rgba(181,92,121,0.22);}
.btn{background:linear-gradient(135deg,#8B3A57,#B55C79);border:none;color:#F5E6EA;padding:12px 28px;border-radius:50px;font-family:'DM Sans',sans-serif;font-weight:600;font-size:14px;cursor:pointer;transition:all .3s;letter-spacing:.3px;}
.btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 28px rgba(139,58,87,.55);}
.btn:disabled{opacity:.45;cursor:not-allowed;}
.btn-o{background:transparent;border:1px solid rgba(181,92,121,.35);color:#D4879A;padding:10px 22px;border-radius:50px;font-family:'DM Sans',sans-serif;font-weight:500;font-size:14px;cursor:pointer;transition:all .3s;}
.btn-o:hover{background:rgba(181,92,121,.1);}
.inp{background:var(--inp-bg);border:1px solid var(--inp-border);border-radius:12px;padding:12px 16px;color:var(--txt);font-family:'DM Sans',sans-serif;font-size:14px;width:100%;outline:none;transition:border .3s;}
.inp:focus{border-color:#D4879A;background:rgba(181,92,121,.09);}
.inp::placeholder{color:${theme==="light"?"#9A7080":"#6B4455"};}
.sel{background:${theme==="light"?"rgba(249,238,241,.98)":"rgba(20,8,15,.95)"};border:1px solid rgba(181,92,121,.18);border-radius:12px;padding:12px 16px;color:#F5E6EA;font-family:'DM Sans',sans-serif;font-size:14px;width:100%;outline:none;cursor:pointer;}
.tag{background:rgba(181,92,121,.14);border:1px solid rgba(181,92,121,.28);color:#D4879A;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:500;}
@keyframes floatY{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}
@keyframes pageFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.page-fade{animation:pageFade .25s ease;}
@keyframes gPulse{0%,100%{opacity:.5}50%{opacity:1}}
@keyframes scanLine{0%{top:0%}100%{top:98%}}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes heartbeat{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@keyframes slideIn{from{transform:translateX(-100%)}to{transform:translateX(0)}}
@keyframes pulseRing{0%,100%{box-shadow:0 0 0 0 rgba(181,92,121,.45)}70%{box-shadow:0 0 0 10px rgba(181,92,121,0)}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
.fade-up{animation:fadeUp .5s ease forwards;}
.orb{position:absolute;border-radius:50%;filter:blur(90px);pointer-events:none;animation:gPulse 5s ease-in-out infinite;}
.scan-anim{position:absolute;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#D4879A,transparent);animation:scanLine 1.8s linear infinite;}
.shimmer-bg{background:linear-gradient(90deg,rgba(255,255,255,.03) 25%,rgba(255,255,255,.08) 50%,rgba(255,255,255,.03) 75%);background-size:200% 100%;animation:shimmer 1.8s infinite;}
.nav-link{color:#9A6677;font-size:13px;font-weight:500;cursor:pointer;padding:9px 14px;border-radius:10px;transition:all .2s;display:flex;align-items:center;gap:9px;border:none;background:transparent;width:100%;text-align:left;}
.nav-link:hover,.nav-link.act{color:#D4879A;background:rgba(181,92,121,.13);}
.pbar{height:5px;background:rgba(181,92,121,.1);border-radius:3px;overflow:hidden;}
.pfill{height:100%;border-radius:3px;transition:width 1.2s ease;}
.tab-btn{padding:9px 17px;border-radius:10px;font-size:13px;font-weight:500;cursor:pointer;transition:all .2s;color:#9A6677;border:none;background:transparent;white-space:nowrap;}
.tab-btn.act{background:rgba(181,92,121,.18);color:#D4879A;}
.check-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(181,92,121,.07);}
.check-row:last-child{border-bottom:none;}
.streak-badge{background:linear-gradient(135deg,#B55C79,#6B2244);padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;color:#F5E6EA;display:inline-block;}
.concern-zone{position:absolute;border-radius:50%;border:2px solid;animation:gPulse 2s ease-in-out infinite;cursor:pointer;}
.challenge-card{background:linear-gradient(135deg,rgba(139,58,87,.22),rgba(74,21,48,.4));border:1px solid rgba(181,92,121,.25);border-radius:18px;padding:20px;}
.floating-btn{position:fixed;bottom:28px;right:28px;z-index:200;cursor:pointer;width:62px;height:62px;border-radius:50%;overflow:hidden;border:2px solid rgba(212,135,154,.45);box-shadow:0 4px 24px rgba(0,0,0,.5);animation:pulseRing 3s ease-in-out infinite;transition:transform .2s;}
.floating-btn:hover{transform:scale(1.08);}
.floating-panel{position:fixed;bottom:calc(104px + env(safe-area-inset-bottom));right:28px;z-index:199;width:min(350px,calc(100vw - 52px));background:rgba(16,5,12,.97);border:1px solid rgba(181,92,121,.3);border-radius:22px;box-shadow:0 16px 56px rgba(0,0,0,.7);animation:fadeUp .28s ease;}
.floating-mini-bar{position:fixed;bottom:calc(28px + env(safe-area-inset-bottom));right:28px;z-index:200;display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:20px;background:rgba(16,5,12,.97);border:1px solid rgba(181,92,121,.35);box-shadow:0 8px 28px rgba(0,0,0,.55);cursor:pointer;max-width:min(240px,calc(100vw - 32px));animation:fadeUp .25s ease;}
.mood-btn{padding:10px 14px;border-radius:14px;border:1px solid rgba(181,92,121,.22);background:rgba(181,92,121,.06);cursor:pointer;transition:all .2s;display:flex;flex-direction:column;align-items:center;gap:4px;}
.mood-btn.sel,.mood-btn:hover{background:rgba(181,92,121,.2);border-color:#D4879A;transform:scale(1.05);}
@media(max-width:768px){
  .sidebar-overlay{display:block!important;}
  .app-sidebar{transform:translateX(-100%);transition:transform .3s;position:fixed;z-index:100;height:100vh;}
  .app-sidebar.open{transform:translateX(0);}
  .app-main{margin-left:0!important;}
  .hamburger{display:flex!important;}
  .floating-btn{bottom:calc(80px + env(safe-area-inset-bottom));right:16px;width:54px;height:54px;}
  .floating-panel{bottom:calc(146px + env(safe-area-inset-bottom));right:16px;width:calc(100vw - 32px);max-height:70vh!important;}
  .floating-mini-bar{bottom:calc(80px + env(safe-area-inset-bottom));right:16px;}
  .r-col{grid-template-columns:1fr!important;}
  /* iOS Safari auto-zooms the page when a focused input's font-size is
     under 16px — this is the single most common "broken on mobile" cause
     for forms. Force every text input/select/textarea to 16px on mobile,
     overriding any smaller inline font-size. */
  input,select,textarea{font-size:16px!important;}
  /* Buttons/links under ~44px are hard to tap accurately — pad up any
     smaller interactive elements without changing their visual size. */
  button,a{min-height:36px;}
}
/* Applies everywhere, not just mobile: removes the gray flash on tap
   (looks broken on Android Chrome especially) and cuts the ~300ms delay
   browsers add before registering a tap, which makes the whole app feel
   noticeably more responsive on touch devices. */
button,a,.tab-btn,.check-row,.floating-btn,.floating-mini-bar{-webkit-tap-highlight-color:transparent;touch-action:manipulation;}
.sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99;}
.hamburger{display:none;background:none;border:none;cursor:pointer;padding:8px;color:#D4879A;flex-direction:column;gap:5px;}
.hamburger span{display:block;width:22px;height:2px;background:#D4879A;border-radius:2px;}
/* ── ACCESSIBILITY ─────────────────────────────────────────────────────
   Keyboard users get a visible focus ring (mouse/touch users don't, since
   :focus-visible only fires for keyboard/programmatic focus — this is the
   modern, non-intrusive way to do this). Custom clickable divs throughout
   the app (floating widgets, tab pills, check-rows) opt into the same ring
   via .kb-focusable so keyboard nav is visibly trackable everywhere. */
:focus-visible{outline:2px solid #D4879A;outline-offset:2px;border-radius:4px;}
.kb-focusable:focus-visible{outline:2px solid #D4879A;outline-offset:2px;}
.skip-link{position:fixed;top:-100px;left:12px;z-index:400;background:#8B3A57;color:#F5E6EA;padding:10px 18px;borderRadius:10px;border-radius:10px;font-size:13px;font-weight:600;transition:top .2s;text-decoration:none;}
.skip-link:focus{top:12px;}
/* Respect the OS-level "reduce motion" accessibility setting — disables
   decorative animation/transition for users who've asked for it, without
   touching functionality. */
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important;}
}
`}</style>
);
};

const Ic=({n,s=18,c="currentColor"})=>{
  const d={
    home:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    scan:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><path d="M2 12h3m14 0h3M12 2v3m0 14v3"/><circle cx="12" cy="12" r="4"/><path d="M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>,
    chart:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    book:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>,
    bag:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
    leaf:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><path d="M17 8C8 10 5.9 16.17 3.82 19.39A2 2 0 005.69 22C17 22 21 12 21 5c0 0-2 1-4 3z"/></svg>,
    trophy:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><polyline points="8 15 8 21"/><polyline points="16 15 16 21"/><line x1="5" y1="21" x2="19" y2="21"/><path d="M17 5H7L5 2H19L17 5z"/><path d="M5 5a7 7 0 0014 0"/></svg>,
    star:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
    bot:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>,
    cycle:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
    heart:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>,
    spark:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    ok:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
    send:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    share:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
    alert:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
    x:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    minus:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2.5" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    lock:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M7 10V7a5 5 0 0110 0v3"/></svg>,
    dl:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
    refresh:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>,
    forecast:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><path d="M17.5 19H9a7 7 0 113.19-13.28A5.5 5.5 0 1117.5 19z"/></svg>,
    gear:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  };
  return d[n]||null;
};

const SmiraAvatar=({state="neutral",size=80,portrait=false,animate=false})=>{
  const [err,setErr]=useState(false);
  const src=AV[state]||AV.neutral;
  if(portrait){
    if(err)return<div style={{width:"100%",height:size,background:"linear-gradient(135deg,#8B3A57,#D4879A)",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:20}}><span style={{fontFamily:"Cormorant Garamond,serif",fontSize:60,color:"#F5E6EA",fontWeight:600}}>S</span></div>;
    return<img src={src} alt="Smira" style={{width:"100%",height:size,objectFit:"cover",objectPosition:"50% 12%",borderRadius:20,display:"block"}} onError={()=>setErr(true)}/>;
  }
  if(err)return<div style={{width:size,height:size,borderRadius:"50%",background:"linear-gradient(135deg,#8B3A57,#D4879A)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,border:"2px solid rgba(212,135,154,.3)",animation:animate?"heartbeat 2.5s ease-in-out infinite":"none"}}><span style={{fontFamily:"Cormorant Garamond,serif",fontSize:size*.38,color:"#F5E6EA",fontWeight:600}}>S</span></div>;
  return<img src={src} alt="Smira" style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",objectPosition:"50% 12%",flexShrink:0,border:"2px solid rgba(212,135,154,.3)",animation:animate?"heartbeat 2.5s ease-in-out infinite":"none"}} onError={()=>setErr(true)}/>;
};

const SmiraMsg=({state="neutral",text,size=46})=>(
  <div style={{display:"flex",gap:12,alignItems:"flex-end"}}>
    <SmiraAvatar state={state} size={size}/>
    <div style={{maxWidth:"84%",padding:"13px 16px",borderRadius:"16px 16px 16px 4px",background:"rgba(46,14,31,.9)",border:"1px solid rgba(181,92,121,.2)"}}>
      <p style={{fontSize:13.5,color:"#F0C4CC",lineHeight:1.75,fontStyle:"italic"}}>{text}</p>
    </div>
  </div>
);

const MPOOLS={
  morning:["Starting your day with intention is one of the most powerful things you can do for your skin.","Your skin worked hard to repair itself overnight — let's give it the care it deserves.","Every morning you show up for yourself is a win worth celebrating.","The way you begin your morning sets the tone for your whole day.","Your skin is ready for today. A little hydration, some SPF, and you're glowing."],
  night:["Your skin does its deepest repair while you sleep — don't skip that cleanse.","A thorough cleanse tonight means a clearer tomorrow.","Between 11 PM and 2 AM, your skin produces the most collagen. Sleep is your best serum.","Tonight's consistency builds tomorrow's confidence.","A calm nervous system supports healthy skin as much as any product."],
  analysis:["I'm reading your skin with care. Every detail helps me give you the most personalized insights.","Taking a careful look at what your skin is telling us today.","Your skin has a story. I'm here to help you understand it with compassion, not criticism.","Analyzing thoughtfully. Whatever I find, it doesn't change how worthy you are.","Looking at your skin the way a caring friend would — with curiosity, not judgment."],
  progress:["You've come further than you think. Progress isn't always visible — but it's always happening.","Every habit completed, every glass of water — it all adds up to something beautiful.","Consistency is the most underrated form of self-care. You're doing it.","Look how far you've come. That took real showing up.","Small steps taken consistently create lasting transformations."],
  confidence:["Your confidence isn't measured by how clear your skin is. It's built by how consistently you choose yourself.","You are worthy of care exactly as you are right now.","Confidence isn't something you find. It's built one small act of self-love at a time.","The most radiant thing about you is that you keep showing up for yourself.","Your skin tells a story of where you've been. That story is worth honoring."],
  wellness:["Wellness isn't about perfection. It's about being consistent with things that make you feel good.","Water, sleep, movement, care — these aren't luxuries. They're the foundation.","Taking care of yourself isn't selfish. It's essential.","Your body communicates with you all the time. Listening is one of the wisest things you can do.","True wellness lives at the intersection of what you eat, how you rest, and how you speak to yourself."],
  journal:["Your thoughts about your skin matter as much as the products you use.","Writing helps you see patterns you'd otherwise miss.","Whatever you're feeling today is valid. There's no wrong way to show up on the page.","Every time you journal, you understand yourself a little more deeply.","Your inner world and your outer glow are deeply connected."],
  encouragement:["I believe in you. Not because your skin is perfect, but because you keep trying.","Hard days are part of every journey. What matters is that you came back.","You are not behind. You are exactly where you need to be.","Some days you'll glow. Some days you'll just maintain. Both count.","Showing up matters more than showing up perfectly."],
};
const _seen={};
const getMsg=(cat)=>{
  const pool=MPOOLS[cat]||MPOOLS.encouragement;
  if(!_seen[cat])_seen[cat]=[];
  const avail=pool.filter((_,i)=>!_seen[cat].includes(i));
  const pick=avail.length>0?avail:pool;
  const idx=pool.indexOf(pick[Math.floor(Math.random()*pick.length)]);
  _seen[cat]=avail.length>0?[..._seen[cat],idx]:[idx];
  return pool[idx];
};
const getDailyMsg=(name,habits,streak)=>{
  const n=name?.split(" ")[0]||"beautiful";
  const h=new Date().getHours();
  const done=habits?.filter(x=>x.done).length||0,total=habits?.length||6;
  if(streak===0)return`Hi ${n}. Every journey starts with a single day. Today is yours — let's begin something meaningful together.`;
  if(done===total&&total>0)return`${n}, you've completed all your habits today. I'm genuinely proud of you — that kind of consistency is rare.`;
  if(h<12)return`Good morning, ${n}. Your skin repaired itself overnight. Let's start the day with intention.`;
  if(h<17)return`How are you doing today, ${n}? Remember to stay hydrated — your skin will thank you.`;
  if(h<21)return`Evening, ${n}. Don't skip your night routine — it's one of the most powerful things you can do.`;
  return`Rest well tonight, ${n}. Your consistency is building something beautiful, even on the days you can't see it yet.`;
};

const recordActivity=(type)=>{
  const today=new Date().toISOString().split("T")[0];
  const acts=LS.get("activities",{});
  if(!acts[today])acts[today]=[];
  if(!acts[today].includes(type)){acts[today]=[...acts[today],type];LS.set("activities",acts);}
};
const calcStreak=()=>{
  const acts=LS.get("activities",{});
  const today=new Date();today.setHours(0,0,0,0);
  let checkDate=new Date(today);
  const todayStr=today.toISOString().split("T")[0];
  if(!acts[todayStr]?.length)checkDate.setDate(checkDate.getDate()-1);
  let streak=0;
  for(let i=0;i<365;i++){
    const ds=checkDate.toISOString().split("T")[0];
    if(acts[ds]?.length>0){streak++;checkDate.setDate(checkDate.getDate()-1);}else break;
  }
  return streak;
};

const Ring=({score,size=110,label="",color="#D4879A",subtitle=""})=>{
  const [s,setS]=useState(0);
  useEffect(()=>{const t=setTimeout(()=>setS(score),120);return()=>clearTimeout(t);},[score]);
  const r=(size-16)/2,circ=2*Math.PI*r,off=circ-(s/100)*circ;
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(181,92,121,.1)" strokeWidth="6"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6" strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" style={{transition:"stroke-dashoffset 1.4s ease"}}/>
        <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle" style={{fill:"#F5E6EA",fontSize:size/5,fontWeight:700,fontFamily:"DM Sans",transform:`rotate(90deg)`,transformOrigin:`${size/2}px ${size/2}px`}}>{s}</text>
        <text x={size/2} y={size/2+size/5.5} textAnchor="middle" dominantBaseline="middle" style={{fill:"#9A6677",fontSize:size/10,fontFamily:"DM Sans",transform:`rotate(90deg)`,transformOrigin:`${size/2}px ${size/2}px`}}>/100</text>
      </svg>
      {label&&<span style={{fontSize:12,color:"#9A6677",fontWeight:500}}>{label}</span>}
      {subtitle&&<span style={{fontSize:10,color:"#6B4455"}}>{subtitle}</span>}
    </div>
  );
};
const ConfBar=({pct,color="#D4879A"})=>{
  const [w,setW]=useState(0);
  useEffect(()=>{const t=setTimeout(()=>setW(pct),200);return()=>clearTimeout(t);},[pct]);
  return<div className="pbar"><div className="pfill" style={{width:`${w}%`,background:`linear-gradient(90deg,${color}60,${color})`}}/></div>;
};

const EmptyState=({avatarState="welcome",title,message,actionLabel,onAction})=>(
  <div style={{padding:"60px 24px",textAlign:"center",maxWidth:400,margin:"0 auto"}}>
    <div style={{width:110,height:132,margin:"0 auto 22px",borderRadius:22,overflow:"hidden",border:"2px solid rgba(212,135,154,.2)"}}>
      <SmiraAvatar state={avatarState} portrait size={132}/>
    </div>
    <h3 className="cf" style={{fontSize:26,fontWeight:400,marginBottom:10}}>{title}</h3>
    <p style={{color:"#9A6677",fontSize:14,lineHeight:1.75,marginBottom:onAction?24:0}}>{message}</p>
    {onAction&&<button className="btn" onClick={onAction} style={{padding:"12px 32px"}}>{actionLabel}</button>}
  </div>
);
/* Shared skeleton loader — shimmering placeholder blocks shown while async
   content (AI results, charts, generated plans) loads, instead of a blank
   page or spinner. `rows` controls how many placeholder lines render. */
const Skeleton=({rows=3,height=16,gap=10,style={}})=>(
  <div style={{display:"flex",flexDirection:"column",gap,...style}}>
    {Array.from({length:rows},(_,i)=>(
      <div key={i} style={{height,borderRadius:8,width:i===rows-1?"60%":"100%",background:"linear-gradient(90deg,rgba(181,92,121,.08) 25%,rgba(181,92,121,.18) 37%,rgba(181,92,121,.08) 63%)",backgroundSize:"400% 100%",animation:"shimmer 1.6s ease-in-out infinite"}}/>
    ))}
  </div>
);
const SkeletonCard=()=>(
  <div className="glass" style={{padding:20,borderRadius:18}}><Skeleton rows={4}/></div>
);

/* Tracks real connectivity via the browser's online/offline events, not
   just a one-time navigator.onLine check at request time. Used to show a
   persistent banner and to let screens disable network-dependent actions
   proactively instead of only failing after the user tries. */
const useOnlineStatus=()=>{
  const [online,setOnline]=useState(typeof navigator!=="undefined"?navigator.onLine:true);
  useEffect(()=>{
    const goOnline=()=>setOnline(true);
    const goOffline=()=>setOnline(false);
    window.addEventListener("online",goOnline);
    window.addEventListener("offline",goOffline);
    return()=>{window.removeEventListener("online",goOnline);window.removeEventListener("offline",goOffline);};
  },[]);
  return online;
};

const OfflineBanner=({online})=>{
  const [justReconnected,setJustReconnected]=useState(false);
  const wasOffline=useRef(false);
  useEffect(()=>{
    if(!online)wasOffline.current=true;
    else if(wasOffline.current){setJustReconnected(true);wasOffline.current=false;const t=setTimeout(()=>setJustReconnected(false),3000);return()=>clearTimeout(t);}
  },[online]);
  if(online&&!justReconnected)return null;
  return(
    <div role="status" aria-live="polite" style={{position:"fixed",top:0,left:0,right:0,zIndex:300,padding:"9px 16px",textAlign:"center",fontSize:12.5,fontWeight:600,color:online?"#0D2818":"#4A0E0E",background:online?"#A8E6C9":"#F5A3A3",transition:"background .3s"}}>
      {online?"Back online — your data will sync now.":"You're offline. Some features (AI scan, coach, weather) need a connection — your local data is still safe."}
    </div>
  );
};
const ErrorBox=({message,onRetry})=>(
  <div style={{padding:"22px",background:"rgba(139,58,87,.1)",border:"1px solid rgba(212,135,154,.25)",borderRadius:18,textAlign:"center",marginBottom:16}}>
    <div style={{width:80,height:96,margin:"0 auto 14px",borderRadius:16,overflow:"hidden"}}>
      <SmiraAvatar state="empathy" portrait size={96}/>
    </div>
    <p style={{fontSize:14,color:"#F0C4CC",lineHeight:1.7,marginBottom:14}}>
      <strong style={{color:"#D4879A",display:"block",marginBottom:4}}>Something didn't go as planned.</strong>
      {message||"Let's try again together."}
    </p>
    {onRetry&&<button className="btn" onClick={onRetry} style={{padding:"10px 24px",fontSize:13,display:"inline-flex",alignItems:"center",gap:6}}><Ic n="refresh" s={13}/>Try Again</button>}
  </div>
);

/* WEEKLY/MONTHLY placeholder chart data removed — every chart now derives
   from real scan history via computeProgress(scans). */

/* Turns real scan history into: a chartable time series, a latest-vs-previous
   comparison (deltas + % change per metric), and per-concern trend direction.
   Used by both the Results "Progress" tab and Analytics' trend chart. */
const computeProgress=(scans)=>{
  const sorted=[...(scans||[])].sort((a,b)=>(a.ts||0)-(b.ts||0));
  const series=sorted.map(s=>({
    date:s.date,
    ts:s.ts,
    overallScore:s.overallScore||0,
    hydrationLevel:s.hydrationLevel||0,
    elasticity:s.elasticity||0,
    brightness:s.brightness||0,
  }));
  if(sorted.length<2)return{series,hasComparison:false};

  const latest=sorted[sorted.length-1];
  const prev=sorted[sorted.length-2];
  const first=sorted[0];
  const pctChange=(now,then)=>then?Math.round(((now-then)/then)*100):0;

  const metricDelta=(key)=>({
    value:(latest[key]||0)-(prev[key]||0),
    pct:pctChange(latest[key]||0,prev[key]||0),
    current:latest[key]||0,
    since:first[key]||0,
    sinceFirstPct:pctChange(latest[key]||0,first[key]||0),
  });

  const concernTrend=(latest.concerns||[]).map(c=>{
    const prevMatch=(prev.concerns||[]).find(p=>p.name===c.name);
    const firstMatch=(first.concerns||[]).find(p=>p.name===c.name);
    return{
      name:c.name,
      current:c.confidence,
      prevChange:prevMatch?c.confidence-prevMatch.confidence:null,
      sinceFirstChange:firstMatch?c.confidence-firstMatch.confidence:null,
    };
  });

  return{
    series,hasComparison:true,scanCount:sorted.length,
    firstDate:first.date,latestDate:latest.date,
    overallScore:metricDelta("overallScore"),
    hydrationLevel:metricDelta("hydrationLevel"),
    elasticity:metricDelta("elasticity"),
    brightness:metricDelta("brightness"),
    concernTrend,
  };
};
const DEFAULT_HABITS=[
  {id:1,icon:"spark",label:"Morning skincare routine",done:false},
  {id:2,icon:"leaf",label:"8 glasses of water",done:false},
  {id:3,icon:"cycle",label:"Night routine & cleanse",done:false},
  {id:4,icon:"forecast",label:"SPF applied",done:false},
  {id:5,icon:"heart",label:"Stress relief / breathwork",done:false},
  {id:6,icon:"leaf",label:"Skin-friendly meal",done:false},
];
/* Static MEALS placeholder removed — Nutrition now generates a real,
   personalized plan via generateDietPlan() based on actual scan concerns. */


const ALL_PRODUCTS={
  cleanser:[
    {name:"Cetaphil Gentle Cleanser",brand:"Cetaphil",price:"₹599",tier:"Budget",rating:4.4,ing:["Glycerin","Niacinamide"],benefit:"Ultra-gentle for sensitive & dry skin",for:["Dry","Sensitive","Normal"],why:"Smira's top pick for reactive or new-to-skincare skin — won't disrupt your barrier."},
    {name:"CeraVe Foaming Cleanser",brand:"CeraVe",price:"₹699",tier:"Budget",rating:4.5,ing:["Niacinamide","Ceramides","Hyaluronic Acid"],benefit:"Removes oil while maintaining barrier",for:["Oily","Combination","Acne"],why:"Ceramides repair while it cleanses — rare and brilliant in a budget option."},
    {name:"Simple Kind to Skin Cleanser",brand:"Simple",price:"₹399",tier:"Budget",rating:4.2,ing:["Pro-Vitamin B5","Vitamin E"],benefit:"Zero fragrance, zero colour — pure clean",for:["Sensitive","Normal","Dry"],why:"Minimal ingredients, maximum gentleness. Perfect starting point."},
    {name:"COSRX Low pH Good Morning Gel",brand:"COSRX",price:"₹1,099",tier:"Mid",rating:4.6,ing:["Tea Tree","Willow Bark Extract"],benefit:"pH-balancing cleanse that preps skin for actives",for:["Acne","Oily","Combination"],why:"The right pH is crucial for actives to work — this sets the stage perfectly."},
    {name:"La Roche-Posay Effaclar Purifying",brand:"La Roche-Posay",price:"₹1,299",tier:"Mid",rating:4.7,ing:["Salicylic Acid","Zinc"],benefit:"Clinical-grade acne and oiliness control",for:["Acne","Oily"],why:"Dermatologist-formulated, gentle enough for daily use on acne-prone skin."},
    {name:"Beauty of Joseon Low pH Cleanser",brand:"Beauty of Joseon",price:"₹1,149",tier:"Mid",rating:4.5,ing:["Rice Water","Green Plum"],benefit:"Brightening + balanced pH cleanse",for:["Hyperpigmentation","Dull","All"],why:"Traditional Korean brightening ingredients in a thoughtful modern formula."},
    {name:"Tatcha The Rice Wash",brand:"Tatcha",price:"₹3,499",tier:"Premium",rating:4.8,ing:["Japanese Rice","Green Tea","Hyaluronic Acid"],benefit:"Gentle brightening deep cleanse",for:["All"],why:"The most luxurious daily cleanse — leaves skin visibly glowing and soft."},
    {name:"La Mer Cleansing Gel",brand:"La Mer",price:"₹8,500",tier:"Luxury",rating:4.9,ing:["Miracle Broth","Sea Kelp"],benefit:"Ultra-luxe barrier-strengthening cleanse",for:["All"],why:"The ultimate luxury cleanser — Miracle Broth in every drop."},
  ],
  serum:[
    {name:"Minimalist Niacinamide 10% + Zinc",brand:"Minimalist",price:"₹399",tier:"Budget",rating:4.6,ing:["Niacinamide 10%","Zinc 1%"],benefit:"Pore minimizing, oil control, brightening",for:["Oily","Combination","Acne","Hyperpigmentation"],why:"The best budget serum for most skin types. Evidence-backed, simple formula."},
    {name:"Minimalist Alpha Arbutin 2%",brand:"Minimalist",price:"₹449",tier:"Budget",rating:4.5,ing:["Alpha Arbutin 2%","Hyaluronic Acid"],benefit:"Fades dark spots and pigmentation gently",for:["Hyperpigmentation","Dark Circles","Dull"],why:"Safer than hydroquinone — works for all skin tones to brighten evenly."},
    {name:"Derma Co 10% Vitamin C",brand:"Derma Co",price:"₹549",tier:"Budget",rating:4.3,ing:["Vitamin C 10%","Ferulic Acid"],benefit:"Antioxidant brightening at an accessible price",for:["Dull","Hyperpigmentation","All"],why:"Ferulic acid stabilizes the Vitamin C — a thoughtful budget formula."},
    {name:"COSRX Advanced Snail 96 Mucin",brand:"COSRX",price:"₹1,399",tier:"Mid",rating:4.8,ing:["Snail Secretion 96%","Sodium Hyaluronate"],benefit:"Deep repair, hydration, and scar fading",for:["Acne","Scarring","Dry","Sensitive"],why:"One of the most healing serums available — loved by millions worldwide."},
    {name:"Isntree C-Niacin Toning Ampoule",brand:"Isntree",price:"₹1,299",tier:"Mid",rating:4.6,ing:["Vitamin C","Niacinamide","Ginseng"],benefit:"Brightening + skin tone evening combo serum",for:["Dull","Hyperpigmentation","Combination"],why:"Vitamin C + Niacinamide together is a powerful brightening stack."},
    {name:"Paula's Choice BHA 2%",brand:"Paula's Choice",price:"₹2,199",tier:"Mid",rating:4.8,ing:["Salicylic Acid 2%","Green Tea"],benefit:"Unclogs pores deeply, prevents breakouts",for:["Acne","Blackheads","Oily"],why:"The industry gold standard for BHA — gentle enough for daily use."},
    {name:"Sunday Riley Good Genes",brand:"Sunday Riley",price:"₹5,499",tier:"Premium",rating:4.7,ing:["Lactic Acid","Licorice Root"],benefit:"Overnight brightening + texture refinement",for:["Dull","Uneven Texture","Hyperpigmentation"],why:"Instant glow results — lactic acid is the gentlest exfoliating acid."},
    {name:"SkinCeuticals C E Ferulic",brand:"SkinCeuticals",price:"₹8,999",tier:"Luxury",rating:4.9,ing:["Vitamin C 15%","Vitamin E","Ferulic Acid"],benefit:"Gold standard antioxidant protection + glow",for:["Hyperpigmentation","Dullness","Anti-Aging"],why:"The most studied Vitamin C serum in skincare history. Results are real."},
  ],
  moisturizer:[
    {name:"Neutrogena Hydro Boost",brand:"Neutrogena",price:"₹799",tier:"Budget",rating:4.5,ing:["Hyaluronic Acid","Glycerin"],benefit:"Lightweight deep hydration for all skin types",for:["Dry","Dehydration","Normal","All"],why:"Clinically proven to hydrate deeper layers — a Smira favourite for dry spells."},
    {name:"Cetaphil Moisturizing Cream",brand:"Cetaphil",price:"₹699",tier:"Budget",rating:4.4,ing:["Glycerin","Niacinamide","Allantoin"],benefit:"Barrier-repairing richness for dry skin",for:["Dry","Sensitive","Eczema"],why:"The OG of gentle moisturizers — recommended by dermatologists everywhere."},
    {name:"Dot & Key Water Drench Gel",brand:"Dot & Key",price:"₹649",tier:"Budget",rating:4.3,ing:["Hyaluronic Acid","Ceramides","Cica"],benefit:"Lightweight intensely hydrating gel cream",for:["Combination","Oily","Normal"],why:"Feels like water on skin — great for Indian humid climates."},
    {name:"COSRX Oil-Free Ultra Moisturizing",brand:"COSRX",price:"₹1,199",tier:"Mid",rating:4.5,ing:["Birch Sap 70%","Ceramides"],benefit:"Hydration without heaviness for oily skin",for:["Oily","Combination","Acne"],why:"70% birch sap gives exceptional hydration — zero pore-clogging risk."},
    {name:"Isntree Hyaluronic Acid Moist Cream",brand:"Isntree",price:"₹1,349",tier:"Mid",rating:4.6,ing:["Hyaluronic Acid","Ceramides","Panthenol"],benefit:"Multi-weight HA for barrier repair and glow",for:["Dry","Dehydration","Sensitive"],why:"Multiple HA molecular weights hydrate at every skin layer simultaneously."},
    {name:"Kiehl's Ultra Facial Cream",brand:"Kiehl's",price:"₹2,800",tier:"Mid",rating:4.7,ing:["Squalane","Glacial Glycoprotein"],benefit:"Long-lasting barrier repair in all climates",for:["Dry","Sensitive","All"],why:"Adapts to any humidity — works whether you're in Mumbai or mountains."},
    {name:"Tatcha The Water Cream",brand:"Tatcha",price:"₹4,999",tier:"Premium",rating:4.8,ing:["Japanese Wild Rose","Hyaluronic Acid"],benefit:"Pore-refining water-burst hydration",for:["Oily","Combination","Large Pores"],why:"The most beautiful gel moisturizer texture — pore-refining magic."},
    {name:"La Mer Crème de la Mer",brand:"La Mer",price:"₹18,500",tier:"Luxury",rating:4.9,ing:["Miracle Broth","Sea Kelp"],benefit:"Ultimate regeneration and skin transformation",for:["All"],why:"The most iconic moisturizer in the world — for visible skin renewal."},
  ],
  sunscreen:[
    {name:"Minimalist SPF 50 PA++++",brand:"Minimalist",price:"₹349",tier:"Budget",rating:4.6,ing:["Zinc Oxide","Hyaluronic Acid"],benefit:"Invisible finish, broad spectrum daily protection",for:["All"],why:"The best budget SPF in India — zero white cast, feels like water."},
    {name:"Biore UV Aqua Rich Watery Essence",brand:"Biore",price:"₹899",tier:"Budget",rating:4.8,ing:["Uvinul A Plus","Tinosorb S","Hyaluronic Acid"],benefit:"Ultra-lightweight, water-resistant, no white cast",for:["Oily","Combination"],why:"Japanese SPF technology is years ahead — this is beloved globally."},
    {name:"La Roche-Posay Anthelios UVMune 400",brand:"La Roche-Posay",price:"₹1,699",tier:"Mid",rating:4.8,ing:["Mexoryl 400","SPF 50+","Thermal Spring Water"],benefit:"Europe's highest UVA protection for sensitive skin",for:["Sensitive","Acne","All"],why:"Protects against UVA wavelengths that cause aging and DNA damage."},
    {name:"Isntree Hyaluronic Acid Watery Sun Gel",brand:"Isntree",price:"₹1,199",tier:"Mid",rating:4.7,ing:["Hyaluronic Acid","Ceramides","SPF 50+"],benefit:"Barrier-strengthening hydration + high protection",for:["Dry","Sensitive","Combination"],why:"The most hydrating SPF available — skin actually glows wearing this."},
    {name:"Supergoop Unseen Sunscreen SPF 40",brand:"Supergoop",price:"₹3,200",tier:"Premium",rating:4.9,ing:["SPF 40","Meadowfoam Seed","Red Algae"],benefit:"Invisible primer + protection in one",for:["All"],why:"Grips makeup perfectly while being completely invisible on skin."},
  ],
  toner:[
    {name:"Pyunkang Yul Essence Toner",brand:"Pyunkang Yul",price:"₹1,099",tier:"Mid",rating:4.7,ing:["Milk Vetch Root 91%","Ceramides"],benefit:"Intensive hydration, minimal ingredients",for:["Dry","Sensitive","Dehydration"],why:"91% milk vetch root — the most concentrated hydrating toner available."},
    {name:"COSRX AHA/BHA Clarifying Toner",brand:"COSRX",price:"₹1,149",tier:"Mid",rating:4.5,ing:["Lactic Acid 0.1%","Salicylic Acid 0.1%"],benefit:"Gentle daily exfoliation for brighter skin",for:["Acne","Dull","Combination"],why:"Mild enough for daily use — preps skin to absorb serums beautifully."},
    {name:"Beauty of Joseon Green Plum Toner",brand:"Beauty of Joseon",price:"₹1,099",tier:"Mid",rating:4.6,ing:["Green Plum","Niacinamide","Panthenol"],benefit:"Pore tightening + bright, fresh finish",for:["Oily","Combination","Acne"],why:"Actively brightens while controlling excess oil — a rare combo."},
    {name:"Some By Mi AHA BHA PHA 30 Days",brand:"Some By Mi",price:"₹1,299",tier:"Mid",rating:4.4,ing:["AHA","BHA","PHA","Niacinamide"],benefit:"Triple exfoliation for clear, even skin",for:["Acne","Hyperpigmentation","Oily"],why:"A complete exfoliating system that shows visible results in 30 days."},
  ],
};

const TIPS=[
  "Your skin is not a problem to fix — it's a living part of you that deserves care, not criticism.",
  "Consistency matters more than perfection. One missed day won't undo weeks of progress.",
  "Beauty sleep is real: your skin rebuilds collagen between 11 PM and 2 AM. Rest is self-care.",
  "Omega-3 rich foods like walnuts and flaxseed reduce skin inflammation from the inside out.",
  "Niacinamide works for almost every skin type — brightening, pore-minimizing, and calming.",
  "Stress is one of the biggest triggers for breakouts. Taking a breath is skincare too.",
  "High sugar spikes insulin, which increases androgen hormones linked to breakouts.",
  "You are worthy of care exactly as you are right now — not after your skin changes.",
  "Cleansing for 60 seconds is significantly more effective than a quick rinse.",
  "Your phone touches your face constantly — clean it daily to reduce bacterial transfer.",
  "SPF is the single most anti-aging thing you can do. Non-negotiable, rain or shine.",
  "Skin purging from new actives is temporary. Give a routine at least 6 weeks before judging.",
];
const SkinTip=()=>{
  const [idx,setIdx]=useState(()=>Math.floor(Math.random()*TIPS.length));
  const [k,setK]=useState(0);
  const next=()=>{setIdx(i=>(i+1)%TIPS.length);setK(x=>x+1);};
  return(
    <div role="button" tabIndex={0} aria-label="Get another skin tip" className="kb-focusable" style={{padding:"16px 20px",borderRadius:16,background:"linear-gradient(135deg,rgba(181,92,121,.14),rgba(107,34,68,.12))",border:"1px solid rgba(181,92,121,.22)",cursor:"pointer",display:"flex",gap:12,alignItems:"flex-start"}} onClick={next} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();next();}}}>
      <SmiraAvatar state="coach" size={34}/>
      <div style={{flex:1}}>
        <div style={{fontSize:10,color:"#D4879A",fontWeight:600,marginBottom:5,textTransform:"uppercase",letterSpacing:".07em"}}>Smira's Reminder · tap to refresh</div>
        <p key={k} className="fade-up" style={{fontSize:13,color:"#F0C4CC",lineHeight:1.75}}>{TIPS[idx]}</p>
      </div>
    </div>
  );
};

const calcConfidenceScore=(habits,water,journalEntries,scans)=>{
  const hPct=habits?(habits.filter(h=>h.done).length/habits.length)*100:50;
  const wPct=Math.min((water/8)*100,100);
  const jB=Math.min((journalEntries?.length||0)*5,20);
  const sB=Math.min((scans?.length||0)*3,15);
  return Math.min(100,Math.round(hPct*.35+wPct*.25+jB+sB+30));
};
const confLabel=(s)=>s>=90?"Radiant":s>=75?"Flourishing":s>=60?"Thriving":s>=45?"Growing Consistency":"Building Momentum";
const confColor=(s)=>s>=70?"#A8E6C9":s>=50?"#D4879A":"#F0C4CC";

const getMediaType=(d)=>{const m=d.match(/^data:([^;]+);/);const r=m?m[1]:"image/jpeg";return["image/jpeg","image/png","image/gif","image/webp"].includes(r)?r:"image/jpeg";};
const resizeImg=(dataUrl)=>new Promise(res=>{
  const img=new Image();
  img.onload=()=>{
    const MAX=1120;
    if(img.width<=MAX&&img.height<=MAX){res(dataUrl);return;}
    const canvas=document.createElement("canvas");
    const scale=MAX/Math.max(img.width,img.height);
    canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
    canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
    res(canvas.toDataURL("image/jpeg",.88));
  };
  img.onerror=()=>res(dataUrl);img.src=dataUrl;
});
/* Small (~2-6KB) thumbnail for scan history entries. We keep up to 30 scans
   in one Firestore document (1MB limit) — full-size photos would blow past
   that almost immediately, so history only ever stores this tiny preview. */
const makeThumb=(dataUrl)=>new Promise(res=>{
  const img=new Image();
  img.onload=()=>{
    const SIZE=96;
    const canvas=document.createElement("canvas");
    canvas.width=SIZE;canvas.height=SIZE;
    const scale=Math.max(SIZE/img.width,SIZE/img.height);
    const w=img.width*scale,h=img.height*scale;
    canvas.getContext("2d").drawImage(img,(SIZE-w)/2,(SIZE-h)/2,w,h);
    res(canvas.toDataURL("image/jpeg",.55));
  };
  img.onerror=()=>res(null);img.src=dataUrl;
});
/* ── GEMINI API CLIENT ───────────────────────────────────────────────
   Central helper for every AI call in the app (Skin Analysis + Coach).
   Calls our own /api/gemini serverless function (see /api/gemini.js),
   which holds the real Gemini key server-side. The browser never sees
   an API key at all — nothing to configure here via import.meta.env. */
/* Model choice now lives server-side (GEMINI_MODEL env var in api/gemini.js,
   defaulting to gemini-3.5-flash) so a future model swap needs no redeploy
   of this client code — just an env var update on Vercel. */
const GEMINI_ENDPOINT="/api/gemini";

/* Low-level call: takes a full Gemini `contents` array (multi-turn ready). */
const callGeminiRaw=async(contents,{system,maxTokens=1000,temperature=0.7,timeoutMs=30000,responseMimeType}={})=>{
  if(typeof navigator!=="undefined"&&navigator.onLine===false){const e=new Error("You appear to be offline. Please check your connection.");e.code="OFFLINE";throw e;}

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  let res;
  try{
    res=await fetch(GEMINI_ENDPOINT,{
      method:"POST",headers:{"Content-Type":"application/json"},signal:controller.signal,
      body:JSON.stringify({
        ...(system?{systemInstruction:{parts:[{text:system}]}}:{}),
        contents,
        generationConfig:{maxOutputTokens:maxTokens,temperature,...(responseMimeType?{responseMimeType}:{})},
      }),
    });
  }catch(networkErr){
    clearTimeout(timer);
    if(networkErr.name==="AbortError"){const e=new Error("The request timed out. Please try again.");e.code="TIMEOUT";throw e;}
    const e=new Error("Network error — please check your connection and try again.");e.code="NETWORK";throw e;
  }
  clearTimeout(timer);

  if(!res.ok){
    let msg=`Request failed (${res.status})`;
    try{const errJson=await res.json();msg=errJson?.error?.message||msg;if(errJson?.error?.message?.includes("GEMINI_KEY"))msg="AI is not configured. Missing GEMINI_KEY on the server.";}catch{}
    const e=new Error(msg);e.status=res.status;throw e;
  }
  const data=await res.json();
  if(data?.promptFeedback?.blockReason){
    const e=new Error(`Response was blocked (${data.promptFeedback.blockReason}).`);e.code="BLOCKED";throw e;
  }
  const candidate=data?.candidates?.[0];
  /* Gemini 3.x "thinking" models can return internal reasoning as separate
     parts flagged `thought:true` — exclude those, we only want the final answer. */
  const text=(candidate?.content?.parts||[]).filter(p=>!p.thought).map(p=>p.text||"").join("");
  if(candidate?.finishReason==="MAX_TOKENS"){
    const e = new Error(
        "The AI response was truncated because it exceeded the maximum output length."
    );
    e.code = "TRUNCATED";
    throw e;
}
  if(!text){const e=new Error("Received an empty response from the AI.");e.code="EMPTY";throw e;}
  return text;
};

/* Single-turn helper — used by Skin Analysis (image + prompt, no history). */
const callGemini=async(parts,{system,maxTokens=1000,temperature=0.7,timeoutMs=30000,responseMimeType}={})=>
  callGeminiRaw([{role:"user",parts}],{system,maxTokens,temperature,timeoutMs,responseMimeType});

/* Multi-turn helper — used by the AI Coach (prior turns + new message). */
const callGeminiChat=async(history,latestMessage,system,opts={})=>
  callGeminiRaw([...history,{role:"user",parts:[{text:latestMessage}]}],{system,maxTokens:500,temperature:0.8,timeoutMs:30000,...opts});

/* Turns any error from callGemini into a calm, user-facing message. */
const friendlyAIError=(e)=>{
  if(e?.code==="NO_KEY")return"Smira's AI isn't configured yet. Please contact support.";
  if(e?.code==="OFFLINE")return"You appear to be offline. Please check your connection and try again.";
  if(e?.code==="TIMEOUT")return"That's taking longer than expected. Please try again with a stable connection.";
  if(e?.code==="NETWORK")return"Couldn't reach Smira's AI. Please check your internet connection.";
  if(e?.code==="BLOCKED")return"That request couldn't be completed safely. Please try a different photo or message.";
  if(e?.status===401||e?.status===403)return"AI authentication failed. Please contact support.";
  if(e?.status===400)return"That request couldn't be processed. Please try a different photo or message.";
  if(e?.status===429)return"Smira is a little busy right now — please wait a moment and try again.";
  if(e?.status>=500)return"Smira's AI service is temporarily unavailable. Please try again shortly.";
  return e?.message||"Something didn't go as planned. Please try again.";
};

const runVisionAnalysis=async(imgData,user,prevScan)=>{
  const resized=await resizeImg(imgData);
  const mediaType=getMediaType(resized);
  const base64Data=resized.split(",")[1];
  const system=`You are a compassionate dermatologist AI for Smira. Analyze facial skin from photos with care and empathy. CRITICAL: Never imply skin conditions reduce beauty. Frame everything supportively. Return ONLY valid JSON, no markdown fences.`;
  const conditions=["pcos","pcod","thyroid","diabetes"].filter(k=>user?.[k]).join(", ")||"none reported";
  const trendCtx=prevScan?`Previous scan (${prevScan.date}): overall score ${prevScan.overallScore}, hydration ${prevScan.hydrationLevel}, brightness ${prevScan.brightness}, elasticity ${prevScan.elasticity}, concerns: ${(prevScan.concerns||[]).map(c=>c.name).join(", ")||"none"}. Reference this trend naturally in aiSummary where relevant (e.g. noting improvement or a new concern) — don't just restate the numbers.`:"This is their first tracked scan — no prior trend to compare.";
  const prompt=`Analyze this person's skin compassionately, using their full profile below to personalize everything (not just the photo in isolation).

User profile: age ${user?.age||"unknown"}, gender ${user?.gender||"unspecified"}, skin type ${user?.skinType||"unknown"}, diet ${user?.diet||"unspecified"}, water intake ${user?.water||"unspecified"}, sleep ${user?.sleep||"7-8 hrs"}, stress level ${user?.stress||"Moderate"}, health conditions: ${conditions}, skin goals: ${(user?.skinGoal||[]).join(", ")||"general improvement"}.

${trendCtx}

Return JSON with this exact shape:
{overallScore:number(40-90),hydrationLevel:number(30-90),elasticity:number(40-90),brightness:number(30-85),skinAge:string,skinType:string,
aiSummary:string(2-3 warm sentences, personalized to their profile and trend above),
emotionalNote:string(1 affirming sentence),
concerns:[{name,severity:"Low|Moderate|High",confidence:number,color:string,description:string}](max4),
rootCauses:[{cause,probability:number}](max4),
heatZones:[{x:number,y:number,label,color,intensity:"Low|Medium|High"}](max4),
forecast:{hydration30days:number,brightnessChange:string,recommendation:string},
triggers:[{food:string,correlation:number,insight:string}](max3),
recommendations:[{action:string(specific, e.g. "Add a niacinamide serum in the morning"),reason:string(why this helps, tied to their specific profile/concerns),targetConcern:string(which concern from the list above this addresses),expectedImprovement:string(what visibly improves),timeframe:string(e.g. "2-3 weeks with consistent use")}](max5, ordered by priority)}

Every recommendation must be justified by something specific in this person's profile or concerns — never generic advice.`;
  const parts=[
    {inlineData:{mimeType:mediaType,data:base64Data}},
    {text:prompt},
  ];
  const text=await callGemini(parts,{system,maxTokens:4096,temperature:0.4,timeoutMs:65000,responseMimeType:"application/json"});
  const cleaned = text
  .replace(/```json/g, "")
  .replace(/```/g, "")
  .trim();

try {
  if (!cleaned.endsWith("}")) {
    console.error("[Smira Scan] Incomplete JSON:", cleaned);

    const e = new Error("Gemini returned an incomplete response.");
    e.code = "TRUNCATED";
    throw e;
  }

  return JSON.parse(cleaned);

} catch {
  const m = cleaned.match(/\{[\s\S]*\}/);

  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {}
  }

  console.error("[Smira Scan] Unparseable AI response:", cleaned);

  const e = new Error("Could not parse the analysis response. Please try again.");
  e.code = "PARSE";
  throw e;
}
};

const generateDietPlan=async(user,results,dietType,budget)=>{
  const concerns=(results?.concerns||[]).map(c=>c.name).join(", ")||"general skin health";
  const conditions=["pcos","pcod","thyroid","diabetes"].filter(k=>user?.[k]).join(", ")||"none reported";
  const system=`You are a compassionate nutrition AI for Smira, connecting diet to skin health. Return ONLY valid JSON, no markdown fences. Never shame food choices — frame everything as nourishing, achievable additions.`;
  const budgetGuide={Low:"very affordable, everyday local ingredients, no specialty/imported items",Medium:"moderate cost, some specialty items okay (nuts, specific oils)",Premium:"no cost constraint, can include imported superfoods and supplements"}[budget]||"moderate cost";
  const prompt=`Create a one-day ${dietType} meal plan for someone with these skin concerns: ${concerns}. Health conditions: ${conditions}. Skin type: ${results?.skinType||"unknown"}. Budget level: ${budget} (${budgetGuide}). Diet must be strictly ${dietType==="Vegetarian"?"vegetarian (no meat, fish, or eggs)":"non-vegetarian (can include meat, fish, eggs, and vegetarian items)"}.

Return JSON: {
summary:string(2 sentences on the overall approach for their specific concerns),
meals:{
breakfast:[{food:string,reason:string(specific skin benefit tied to their concerns)}](2-3 items),
lunch:[{food,reason}](2-3 items),
dinner:[{food,reason}](2-3 items),
snacks:[{food,reason}](2 items),
drinks:[{food,reason}](2 items, can include teas/infusions)
},
avoid:[{food:string,reason:string(tied to their specific concerns/conditions)}](3-4 items),
keyNutrients:[{nutrient:string,why:string,sources:string(comma-separated food sources within their budget)}](3-4 items)
}

Every food choice must be realistic for the ${budget} budget tier and justified by their specific concerns — never generic "eat healthy" advice.`;
  const cleaned = text
    .replace(/```json/g,"")
    .replace(/```/g,"")
    .trim();

try {
    if (!cleaned.endsWith("}")) {
        const e = new Error("Gemini returned an incomplete response.");
        e.code = "TRUNCATED";
        throw e;
    }

    return JSON.parse(cleaned);

} catch {
    const m = cleaned.match(/\{[\s\S]*\}/);

    if (m) {
        try {
            return JSON.parse(m[0]);
        } catch {}
    }

    console.error("[Smira Diet] Unparseable AI response:", cleaned);

    const e = new Error("Could not generate your diet plan. Please try again.");
    e.code = "PARSE";
    throw e;
}
};


/* ── AURA S LOGO (SVG, always circular) ──────────────────────────────────── */
const AuraLogo=({size=56,gold="#D8B36A",bg="#1A0B12"})=>(
  <div style={{width:size,height:size,borderRadius:"50%",background:bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,border:`1.5px solid ${gold}40`,boxShadow:`0 0 ${size*.35}px ${gold}22`,overflow:"hidden"}}>
    <img
      src="/smira-logo.png"
      alt="Smira"
      width={size}
      height={size}
      style={{width:"100%",height:"100%",objectFit:"cover"}}
      onError={e=>{
        /* Fallback to the original drawn mark if the logo file is missing,
           so the app never shows a broken image icon. */
        e.target.outerHTML=`<svg width="${size*.55}" height="${size*.55}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 6C14 6 8 13 8 20c0 5 3 9 8 11l-2 5h20l-2-5c5-2 8-6 8-11C40 13 34 6 24 6z" fill="none" stroke="${gold}" stroke-width="2" stroke-linejoin="round"/><path d="M16 20c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="${gold}" stroke-width="1.8" stroke-linecap="round"/><circle cx="24" cy="22" r="3.5" fill="${gold}" opacity="0.9"/><path d="M18 36h12" stroke="${gold}" stroke-width="1.5" stroke-linecap="round"/><path d="M20 39h8" stroke="${gold}" stroke-width="1.2" stroke-linecap="round" opacity="0.6"/></svg>`;
      }}
    />
  </div>
);

const LogoBrand=({size=56,gold="#D8B36A",bg="#1A0B12",showTagline=true,textColor="#F5E6EA"})=>(
  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
    <AuraLogo size={size} gold={gold} bg={bg}/>
    <span className="cf" style={{fontSize:size*.48,fontWeight:300,letterSpacing:".08em",color:textColor,lineHeight:1}}>SMIRA</span>
    {showTagline&&<span style={{fontSize:size*.2,color:gold,letterSpacing:".12em",fontWeight:400,opacity:.85}}>Glow with Confidence.</span>}
  </div>
);

/* ── SPLASH SCREEN ──────────────────────────────────────────────────────────── */
const Splash=({onDone,theme="dark"})=>{
  const t=theme==="light"?LIGHT_T:DARK_T;
  useEffect(()=>{const timer=setTimeout(onDone,2800);return()=>clearTimeout(timer);},[onDone]);
  return(
    <div style={{minHeight:"100vh",background:t.bodyBg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:0,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",width:420,height:420,borderRadius:"50%",background:"rgba(139,58,87,.18)",filter:"blur(90px)",top:"10%",left:"15%",animation:"gPulse 4s ease-in-out infinite"}}/>
      <div style={{position:"absolute",width:320,height:320,borderRadius:"50%",background:"rgba(74,21,48,.22)",filter:"blur(70px)",bottom:"10%",right:"10%",animation:"gPulse 5s ease-in-out infinite 1.5s"}}/>
      <div style={{animation:"fadeUp .9s ease forwards",textAlign:"center",zIndex:10}}>
        <div style={{marginBottom:28}}>
          <LogoBrand size={78} gold={t.gold} bg={theme==="light"?"#8B3A57":"#1A0B12"} textColor={t.txt} showTagline={true}/>
        </div>
        <p style={{color:t.muted,fontSize:13,letterSpacing:".04em",marginTop:16}}>Loading your wellness journey...</p>
        <div style={{marginTop:22,width:48,height:3,borderRadius:2,background:`linear-gradient(90deg,${t.berry},${t.rose})`,margin:"18px auto 0",animation:"shimmer 1.6s ease-in-out infinite",backgroundSize:"200% 100%"}}/>
      </div>
    </div>
  );
};

/* ── AUTH SCREENS ──────────────────────────────────────────────────────────── */
const AuthScreen=({onAuth,theme="dark"})=>{
  const t=theme==="light"?LIGHT_T:DARK_T;
  const [mode,setMode]=useState("login"); // login | signup | forgot
  const [form,setForm]=useState({name:"",email:"",password:"",confirm:""});
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");
  const [msg,setMsg]=useState("");
  const upd=(k,v)=>setForm(p=>({...p,[k]:v}));

  const submit=async()=>{
    setErr("");setMsg("");setLoading(true);
    try{
      if(mode==="forgot"){
        await AUTH.resetPw(form.email);
        setMsg("Reset link sent! Check your inbox.");
        setLoading(false);return;
      }
      if(mode==="signup"){
        if(!form.name.trim())throw new Error("Please enter your name.");
        if(form.password!==form.confirm)throw new Error("Passwords do not match.");
        const user=await AUTH.signup(form.name,form.email,form.password);
        AUTH.setUser(user);onAuth(user);
      } else {
        const user=await AUTH.login(form.email,form.password);
        AUTH.setUser(user);onAuth(user);
      }
    }catch(e){setErr(e.message);}
    setLoading(false);
  };

  const googleAuth=async()=>{
    setErr("");setLoading(true);
    try{const user=await AUTH.google();AUTH.setUser(user);onAuth(user);}
    catch(e){setErr(e.message);}
    setLoading(false);
  };

  const cardBg=theme==="light"?"rgba(255,247,248,.96)":"rgba(46,14,31,.7)";
  return(
    <div style={{minHeight:"100vh",background:t.bodyBg,display:"flex",alignItems:"center",justifyContent:"center",padding:24,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",width:400,height:400,borderRadius:"50%",background:"rgba(139,58,87,.15)",filter:"blur(80px)",top:"-5%",right:"5%",animation:"gPulse 5s ease-in-out infinite"}}/>
      <div style={{position:"absolute",width:300,height:300,borderRadius:"50%",background:"rgba(74,21,48,.2)",filter:"blur(70px)",bottom:"0%",left:"0%",animation:"gPulse 6s ease-in-out infinite 2s"}}/>
      <div style={{width:"100%",maxWidth:420,zIndex:10,animation:"fadeUp .5s ease"}}>
        {/* Brand header */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <LogoBrand size={62} gold={t.gold} bg={theme==="light"?"#8B3A57":"#1A0B12"} textColor={t.txt} showTagline={true}/>
        </div>
        <div style={{background:cardBg,backdropFilter:"blur(20px)",border:`1px solid ${t.border}`,borderRadius:24,padding:"34px 30px",boxShadow:"0 20px 60px rgba(0,0,0,.18)"}}>
          <h2 className="cf" style={{fontSize:26,fontWeight:400,marginBottom:22,textAlign:"center",color:t.txt}}>
            {mode==="login"?"Welcome back":"Create account"}
            {mode==="forgot"&&"Reset password"}
          </h2>
          {err&&<div role="alert" aria-live="assertive" style={{background:"rgba(245,163,163,.1)",border:"1px solid rgba(245,163,163,.28)",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:13,color:"#F5A3A3"}}>{err}</div>}
          {msg&&<div role="status" aria-live="polite" style={{background:"rgba(168,230,201,.1)",border:"1px solid rgba(168,230,201,.25)",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:13,color:"#A8E6C9"}}>{msg}</div>}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {mode==="signup"&&<input className="inp" aria-label="Full name" placeholder="Full name" value={form.name} onChange={e=>upd("name",e.target.value)} style={{color:t.txt}}/>}
            <input className="inp" aria-label="Email address" placeholder="Email address" type="email" value={form.email} onChange={e=>upd("email",e.target.value)} style={{color:t.txt}}/>
            {mode!=="forgot"&&<input className="inp" aria-label="Password" placeholder="Password" type="password" value={form.password} onChange={e=>upd("password",e.target.value)} style={{color:t.txt}} onKeyDown={e=>e.key==="Enter"&&submit()}/>}
            {mode==="signup"&&form.password.length>0&&(
              <p style={{fontSize:11,marginTop:-6,color:form.password.length>=6?"#A8E6C9":"#9A6677",display:"flex",alignItems:"center",gap:5}}>
                {form.password.length>=6?"✓":"○"} At least 6 characters
              </p>
            )}
            {mode==="signup"&&<input className="inp" aria-label="Confirm password" placeholder="Confirm password" type="password" value={form.confirm} onChange={e=>upd("confirm",e.target.value)} style={{color:t.txt}}/>}
            {mode==="signup"&&form.confirm.length>0&&(
              <p style={{fontSize:11,marginTop:-6,color:form.confirm===form.password?"#A8E6C9":"#F5A3A3",display:"flex",alignItems:"center",gap:5}}>
                {form.confirm===form.password?"✓ Passwords match":"○ Passwords don't match yet"}
              </p>
            )}
          </div>
          {mode==="login"&&<button onClick={()=>{setMode("forgot");setErr("");}} style={{background:"none",border:"none",color:t.soft,fontSize:12,cursor:"pointer",marginTop:8,padding:"2px 0",textDecoration:"underline",textUnderlineOffset:3}}>Forgot password?</button>}
          <button className="btn" onClick={submit} disabled={loading} style={{width:"100%",marginTop:18,fontSize:15,padding:"14px"}}>
            {loading?<span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><span style={{width:16,height:16,border:"2px solid #F5E6EA",borderTopColor:"transparent",borderRadius:"50%",display:"inline-block",animation:"spin 0.7s linear infinite"}}/>{mode==="login"?"Signing in...":mode==="signup"?"Creating account...":"Sending link..."}</span>:mode==="login"?"Sign In →":mode==="signup"?"Create Account →":"Send Reset Link →"}
          </button>
          {mode!=="forgot"&&(
            <>
              <div style={{display:"flex",alignItems:"center",gap:12,margin:"18px 0"}}>
                <div style={{flex:1,height:1,background:t.border}}/>
                <span style={{fontSize:12,color:t.muted}}>or</span>
                <div style={{flex:1,height:1,background:t.border}}/>
              </div>
              <button onClick={googleAuth} disabled={loading} style={{width:"100%",padding:"13px",borderRadius:50,border:`1px solid ${t.border}`,background:theme==="light"?"rgba(139,58,87,.06)":"rgba(255,255,255,.04)",color:t.txt,fontSize:14,fontWeight:500,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,transition:"all .2s",fontFamily:"DM Sans,sans-serif"}}>
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Continue with Google
              </button>
            </>
          )}
          <div style={{textAlign:"center",marginTop:18,fontSize:13,color:t.muted}}>
            {mode==="login"?<>Don't have an account? <button onClick={()=>{setMode("signup");setErr("");}} style={{background:"none",border:"none",color:t.soft,cursor:"pointer",fontWeight:600,fontSize:13}}>Sign up</button></>
            :mode==="signup"?<>Already have an account? <button onClick={()=>{setMode("login");setErr("");}} style={{background:"none",border:"none",color:t.soft,cursor:"pointer",fontWeight:600,fontSize:13}}>Sign in</button></>
            :<>Back to <button onClick={()=>{setMode("login");setErr("");}} style={{background:"none",border:"none",color:t.soft,cursor:"pointer",fontWeight:600,fontSize:13}}>Sign in</button></>}
          </div>
        </div>
        <p style={{textAlign:"center",fontSize:11,color:t.muted,marginTop:18,lineHeight:1.6}}>By continuing you agree to Smira's Terms of Service and Privacy Policy.</p>
      </div>
    </div>
  );
};

/* ── SETTINGS PAGE ──────────────────────────────────────────────────────────── */
const Settings=({user,authUser,themePref,onThemeChange,onLogout,onUpdateProfile,onDeleteAccount,theme="dark"})=>{
  const t=theme==="light"?LIGHT_T:DARK_T;
  const [tab,setTab]=useState("profile");
  const [profile,setProfile]=useState({name:user?.name||authUser?.name||"",email:user?.email||authUser?.email||"",age:user?.age||"",skinType:user?.skinType||"Combination",skinGoal:user?.skinGoal||[]});
  const [notifs,setNotifs]=useState(()=>LS.get("notifs",{wellness:true,water:true,journal:false,weekly:true}));
  const [pwForm,setPwForm]=useState({current:"",next:"",confirm:""});
  const [saved,setSaved]=useState(false);
  const [pwMsg,setPwMsg]=useState("");
  const [confirmDelete,setConfirmDelete]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [deleteErr,setDeleteErr]=useState("");
  const cardBg=theme==="light"?"rgba(255,247,248,.95)":"rgba(46,14,31,.6)";
  const Card=({children,style={}})=><div style={{background:cardBg,border:`1px solid ${t.border}`,borderRadius:18,padding:"22px 24px",...style}}>{children}</div>;
  const Label=({children})=><div style={{fontSize:11,color:t.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>{children}</div>;
  const Row=({label,children})=><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 0",borderBottom:`1px solid ${t.border}`}}><span style={{fontSize:14,color:t.txt}}>{label}</span>{children}</div>;
  const Toggle=({on,onChange})=><div role="switch" aria-checked={on} tabIndex={0} className="kb-focusable" onClick={onChange} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onChange();}}} style={{width:46,height:26,borderRadius:13,background:on?"linear-gradient(135deg,#8B3A57,#B55C79)":"rgba(181,92,121,.2)",cursor:"pointer",position:"relative",transition:"background .3s",flexShrink:0}}><div style={{position:"absolute",top:3,left:on?22:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .3s",boxShadow:"0 1px 4px rgba(0,0,0,.3)"}}/></div>;

  const saveProfile=()=>{
    onUpdateProfile({...user,...profile});
    setSaved(true);setTimeout(()=>setSaved(false),2200);
  };
  const changePw=async()=>{
    if(pwForm.next!==pwForm.confirm){setPwMsg("Passwords don't match.");return;}
    if(pwForm.next.length<6){setPwMsg("Password must be at least 6 characters.");return;}
    setPwMsg("Password updated successfully.");
    setPwForm({current:"",next:"",confirm:""});
    setTimeout(()=>setPwMsg(""),3000);
  };
  const toggleNotif=k=>{const n={...notifs,[k]:!notifs[k]};setNotifs(n);LS.set("notifs",n);};
  const THEME_OPTS=[{id:"dark",label:"Dark",icon:"🌙"},{id:"light",label:"Light",icon:"☀️"},{id:"system",label:"System",icon:"💻"}];

  return(
    <div style={{padding:"24px 22px",maxWidth:680,margin:"0 auto"}}>
      <div style={{marginBottom:24,display:"flex",alignItems:"center",gap:14}}>
        <AuraLogo size={44} gold={t.gold} bg={theme==="light"?"#8B3A57":"#1A0B12"}/>
        <div>
          <h1 className="cf" style={{fontSize:30,fontWeight:400,color:t.txt}}>Settings</h1>
          <p style={{color:t.muted,fontSize:13}}>Manage your account, appearance, and preferences</p>
        </div>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:22,flexWrap:"wrap"}}>
        {[["profile","👤 Profile"],["appearance","🌗 Appearance"],["notifications","🔔 Notifications"],["account","🔐 Account"],["about","ℹ️ About"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)} style={{padding:"8px 16px",borderRadius:20,border:`1px solid ${tab===id?"#D4879A":t.border}`,background:tab===id?"rgba(181,92,121,.18)":"transparent",color:tab===id?"#D4879A":t.muted,cursor:"pointer",fontSize:13,fontWeight:500,transition:"all .2s"}}>{label}</button>
        ))}
      </div>

      {tab==="profile"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <Card>
            <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20}}>
              <div style={{width:64,height:64,borderRadius:"50%",background:"linear-gradient(135deg,#8B3A57,#D4879A)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,fontWeight:700,color:"#F5E6EA",border:"2px solid rgba(212,135,154,.3)",flexShrink:0}}>{profile.name?.[0]?.toUpperCase()||"S"}</div>
              <div><div style={{fontSize:16,fontWeight:600,color:t.txt}}>{profile.name||"Smira User"}</div><div style={{fontSize:12,color:t.muted,marginTop:2}}>{profile.email}</div></div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div><Label>Full Name</Label><input className="inp" value={profile.name} onChange={e=>setProfile(p=>({...p,name:e.target.value}))} style={{color:t.txt}}/></div>
              <div><Label>Email</Label><input className="inp" value={profile.email} type="email" onChange={e=>setProfile(p=>({...p,email:e.target.value}))} style={{color:t.txt}}/></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div><Label>Age</Label><input className="inp" value={profile.age} type="number" onChange={e=>setProfile(p=>({...p,age:e.target.value}))} style={{color:t.txt}}/></div>
                <div><Label>Skin Type</Label><select className="sel" value={profile.skinType} onChange={e=>setProfile(p=>({...p,skinType:e.target.value}))} style={{color:t.txt,background:theme==="light"?"rgba(249,238,241,.98)":"rgba(20,8,15,.95)"}}><option>Oily</option><option>Dry</option><option>Combination</option><option>Normal</option><option>Sensitive</option></select></div>
              </div>
            </div>
            <button className="btn" onClick={saveProfile} style={{marginTop:18,width:"100%"}}>{saved?"✅ Profile Saved!":"Save Profile"}</button>
          </Card>
        </div>
      )}

      {tab==="appearance"&&(
        <Card>
          <h3 style={{fontSize:16,fontWeight:600,color:t.txt,marginBottom:18}}>Appearance</h3>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {THEME_OPTS.map(opt=>(
              <div key={opt.id} role="radio" aria-checked={themePref===opt.id} tabIndex={0} className="kb-focusable" onClick={()=>onThemeChange(opt.id)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onThemeChange(opt.id);}}} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 18px",borderRadius:14,cursor:"pointer",background:themePref===opt.id?"rgba(181,92,121,.14)":"rgba(181,92,121,.04)",border:`1px solid ${themePref===opt.id?"#D4879A":t.border}`,transition:"all .2s"}}>
                <div style={{width:22,height:22,borderRadius:"50%",border:`2px solid ${themePref===opt.id?"#D4879A":t.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .2s"}}>{themePref===opt.id&&<div style={{width:10,height:10,borderRadius:"50%",background:"#D4879A"}}/>}</div>
                <span style={{fontSize:20}}>{opt.icon}</span>
                <span style={{fontSize:15,fontWeight:500,color:t.txt}}>{opt.label}</span>
                {opt.id==="system"&&<span style={{fontSize:11,color:t.muted,marginLeft:"auto"}}>({getSystemTheme()} detected)</span>}
              </div>
            ))}
          </div>
          <div style={{marginTop:18,padding:"12px 16px",background:"rgba(181,92,121,.07)",borderRadius:12,fontSize:12,color:t.muted,lineHeight:1.7}}>Theme preference is saved automatically and persists across sessions.</div>
        </Card>
      )}

      {tab==="notifications"&&(
        <Card>
          <h3 style={{fontSize:16,fontWeight:600,color:t.txt,marginBottom:4}}>Notifications</h3>
          <p style={{fontSize:13,color:t.muted,marginBottom:18}}>Choose what reminders help you stay on track.</p>
          {[["wellness","Daily Wellness Reminder","Morning check-in to start your day"],["water","Water Reminder","Hourly nudge to drink more water"],["journal","Journal Reminder","Evening prompt to write a journal entry"],["weekly","Weekly Progress Summary","Get your skin & wellness recap every Sunday"]].map(([key,label,desc])=>(
            <Row key={key} label={<div><div style={{fontSize:14,color:t.txt,fontWeight:500}}>{label}</div><div style={{fontSize:11,color:t.muted,marginTop:2}}>{desc}</div></div>}>
              <Toggle on={notifs[key]} onChange={()=>toggleNotif(key)}/>
            </Row>
          ))}
        </Card>
      )}

      {tab==="account"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <Card>
            <h3 style={{fontSize:15,fontWeight:600,color:t.txt,marginBottom:14}}>Change Password</h3>
            {pwMsg&&<div style={{background:pwMsg.includes("success")?"rgba(168,230,201,.1)":"rgba(245,163,163,.1)",border:`1px solid ${pwMsg.includes("success")?"rgba(168,230,201,.3)":"rgba(245,163,163,.3)"}`,borderRadius:10,padding:"10px 14px",marginBottom:12,fontSize:13,color:pwMsg.includes("success")?"#A8E6C9":"#F5A3A3"}}>{pwMsg}</div>}
            <div style={{display:"flex",flexDirection:"column",gap:11}}>
              <input className="inp" placeholder="Current password" type="password" value={pwForm.current} onChange={e=>setPwForm(p=>({...p,current:e.target.value}))} style={{color:t.txt}}/>
              <input className="inp" placeholder="New password" type="password" value={pwForm.next} onChange={e=>setPwForm(p=>({...p,next:e.target.value}))} style={{color:t.txt}}/>
              <input className="inp" placeholder="Confirm new password" type="password" value={pwForm.confirm} onChange={e=>setPwForm(p=>({...p,confirm:e.target.value}))} style={{color:t.txt}}/>
            </div>
            <button className="btn-o" onClick={changePw} style={{marginTop:14,width:"100%"}}>Update Password</button>
          </Card>
          <Card>
            <Row label="Signed in as"><span style={{fontSize:13,color:t.muted,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{authUser?.email||user?.email||"—"}</span></Row>
            <Row label="Sign-in method"><span style={{fontSize:13,color:t.muted,textTransform:"capitalize"}}>{authUser?.provider||"email"}</span></Row>
          </Card>
          <Card>
            <button onClick={onLogout} style={{width:"100%",padding:"13px",borderRadius:50,border:"1px solid rgba(245,163,163,.35)",background:"rgba(245,163,163,.07)",color:"#F5A3A3",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,sans-serif",transition:"all .2s"}}>Sign Out</button>
            <p style={{textAlign:"center",fontSize:11,color:t.muted,marginTop:12,lineHeight:1.6}}>Signing out will keep your skin data saved locally on this device.</p>
          </Card>
          <Card>
            <h3 style={{fontSize:15,fontWeight:600,marginBottom:8}}>Your Data</h3>
            <p style={{fontSize:12,color:t.muted,lineHeight:1.7,marginBottom:14}}>Download a copy of your profile, scan history, journal entries, habits, and cycle data as a JSON file. This is yours — take it anywhere.</p>
            <button onClick={()=>{
              const exportData={
                exportedAt:new Date().toISOString(),
                profile:LS.get("smira_user",null),
                latestResults:LS.get("smira_results",null),
                scanHistory:LS.get("smira_scans",[]),
                habits:LS.get("habits3",[]),
                waterToday:LS.get("water_today",0),
                glowJournal:LS.get("glowJournal",[]),
                menstrualCycles:LS.get("menstrual_cycles",[]),
                dietPlan:LS.get("diet_plan",null),
                coachChatHistory:LS.get("coach_msgs",[]),
              };
              const blob=new Blob([JSON.stringify(exportData,null,2)],{type:"application/json"});
              const url=URL.createObjectURL(blob);
              const a=document.createElement("a");
              a.href=url;a.download=`smira-data-export-${new Date().toISOString().slice(0,10)}.json`;
              document.body.appendChild(a);a.click();document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }} style={{width:"100%",padding:"12px",borderRadius:50,border:"1px solid rgba(181,92,121,.3)",background:"transparent",color:"#D4879A",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,sans-serif"}}>Export My Data (JSON)</button>
          </Card>
          {onDeleteAccount&&(
            <Card style={{border:"1px solid rgba(245,163,163,.25)"}}>
              <h3 style={{fontSize:15,fontWeight:600,color:"#F5A3A3",marginBottom:8}}>Danger Zone</h3>
              <p style={{fontSize:12,color:t.muted,lineHeight:1.7,marginBottom:14}}>Permanently deletes your account, scan history, journal, habits, and all cloud data. This cannot be undone.</p>
              {!confirmDelete?(
                <button onClick={()=>setConfirmDelete(true)} style={{width:"100%",padding:"12px",borderRadius:50,border:"1px solid rgba(245,163,163,.35)",background:"transparent",color:"#F5A3A3",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,sans-serif"}}>Delete My Account</button>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {deleteErr&&<div style={{background:"rgba(245,163,163,.1)",border:"1px solid rgba(245,163,163,.28)",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#F5A3A3"}}>{deleteErr}</div>}
                  <p style={{fontSize:12,color:"#F5A3A3",fontWeight:600}}>Are you absolutely sure? This is permanent.</p>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>{setConfirmDelete(false);setDeleteErr("");}} style={{flex:1,padding:"11px",borderRadius:50,border:`1px solid ${t.border}`,background:"transparent",color:t.muted,fontSize:13,cursor:"pointer",fontFamily:"DM Sans,sans-serif"}}>Cancel</button>
                    <button onClick={async()=>{setDeleting(true);setDeleteErr("");try{await onDeleteAccount();}catch(e){setDeleteErr(e.message||"Could not delete account. Please sign out and back in, then try again.");setDeleting(false);}}} disabled={deleting} style={{flex:1,padding:"11px",borderRadius:50,border:"none",background:"linear-gradient(135deg,#C4506A,#8B3A57)",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,sans-serif"}}>{deleting?"Deleting...":"Yes, Delete Everything"}</button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {tab==="about"&&(
        <Card style={{textAlign:"center",padding:"40px 30px"}}>
          <div style={{marginBottom:22}}>
            <LogoBrand size={64} gold={t.gold} bg={theme==="light"?"#8B3A57":"#1A0B12"} textColor={t.txt} showTagline={true}/>
          </div>
          <p style={{fontSize:14,color:t.muted,lineHeight:1.85,maxWidth:380,margin:"0 auto 24px"}}>AI-powered skincare and emotional wellness designed to help you understand your skin, build healthy habits, and grow your confidence — one day at a time.</p>
          <div style={{display:"flex",gap:9,justifyContent:"center",flexWrap:"wrap",marginBottom:22}}>
            {["AI Skin Analysis","Confidence Score™","Glow Journal","Skin Forecast","Wellness Coach"].map(f=><span key={f} style={{fontSize:11,color:t.soft,background:"rgba(181,92,121,.1)",border:`1px solid rgba(181,92,121,.2)`,padding:"4px 12px",borderRadius:20}}>{f}</span>)}
          </div>
          <div style={{fontSize:12,color:t.muted,borderTop:`1px solid ${t.border}`,paddingTop:18,lineHeight:1.8}}>
            <div style={{fontWeight:600,color:t.txt,marginBottom:4}}>Version 4.0</div>
            <div>© 2026 Smira · Not a medical device</div>
            <div style={{marginTop:4}}>Always consult a qualified dermatologist for clinical advice.</div>
          </div>
        </Card>
      )}
    </div>
  );
};

const Landing=({onEnter})=>{
  const h=new Date().getHours();
  const avState=h<12?"morning":h<20?"welcome":"night";
  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden",padding:"24px 24px 60px",textAlign:"center"}}>
      <div className="orb" style={{width:500,height:500,background:"rgba(139,58,87,.2)",top:"-10%",left:"-10%"}}/>
      <div className="orb" style={{width:400,height:400,background:"rgba(74,21,48,.3)",bottom:"-5%",right:"-5%",animationDelay:"2.5s"}}/>
      <div className="orb" style={{width:300,height:300,background:"rgba(181,92,121,.14)",top:"30%",right:"8%",animationDelay:"1.2s"}}/>
      <div style={{zIndex:10,maxWidth:560,position:"relative"}}>
        <div style={{marginBottom:20,display:"flex",justifyContent:"center"}}><AuraLogo size={72} gold="#D8B36A" bg="#1A0B12"/></div>
        <div style={{width:200,height:240,margin:"0 auto 16px",borderRadius:26,overflow:"hidden",border:"2px solid rgba(212,135,154,.3)",boxShadow:"0 20px 60px rgba(0,0,0,.5), 0 0 50px rgba(181,92,121,.25)",animation:"floatY 5s ease-in-out infinite"}}>
          <SmiraAvatar state={avState} portrait size={240}/>
        </div>
        <span className="cf" style={{fontSize:"clamp(44px,7vw,66px)",fontWeight:300,letterSpacing:".08em",background:"linear-gradient(135deg,#F0C4CC,#D4879A)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",display:"block",marginBottom:4}}>SMIRA</span>
        <p style={{color:"#D8B36A",fontSize:13,fontWeight:500,marginBottom:20,letterSpacing:".14em",textTransform:"uppercase",opacity:.9}}>Glow with Confidence.</p>
        <h1 className="cf" style={{fontSize:"clamp(26px,4.5vw,42px)",fontWeight:300,lineHeight:1.3,marginBottom:22}}>
          You're already <em style={{background:"linear-gradient(135deg,#F0C4CC,#B55C79)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>beautiful.</em><br/>
          Let's also make you <em style={{background:"linear-gradient(135deg,#D4879A,#6B2244)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>feel it.</em>
        </h1>
        <p style={{color:"#9A6677",fontSize:14,lineHeight:1.85,maxWidth:420,margin:"0 auto 36px"}}>AI-powered skin analysis, wellness tracking, confidence building, and personalized self-care guidance — all in one place.</p>
        <button className="btn" onClick={onEnter} style={{padding:"16px 48px",fontSize:15}}>Begin Your Journey</button>
        <div style={{display:"flex",gap:9,justifyContent:"center",flexWrap:"wrap",marginTop:32}}>
          {["AI Skin Analysis","Confidence Score","Glow Journal","Wellness Coach","Skin Forecast"].map(t=>(
            <span key={t} style={{fontSize:11,color:"#9A6677",background:"rgba(181,92,121,.1)",border:"1px solid rgba(181,92,121,.18)",padding:"5px 13px",borderRadius:20}}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
};

const Onboarding=({onDone})=>{
  const [step,setStep]=useState(0);
  const [d,setD]=useState({name:"",email:"",age:"",gender:"",height:"",weight:"",diet:"Vegetarian",water:"6-8 glasses",sleep:"7-8 hrs",stress:"Moderate",pcos:false,pcod:false,thyroid:false,diabetes:false,menstrualTracking:false,skinGoal:[],wellnessGoal:[]});
  const upd=(k,v)=>setD(p=>({...p,[k]:v}));
  const toggle=k=>setD(p=>({...p,[k]:!p[k]}));
  const toggleGoal=(g,key)=>setD(p=>({...p,[key]:p[key].includes(g)?p[key].filter(x=>x!==g):[...p[key],g]}));
  const steps=[
    {avatar:"welcome",title:"Welcome to Smira",greeting:"Hi there! I'm Smira — your personal wellness and confidence companion. I'd love to learn a little about you so everything I share feels genuinely personal.",why:null},
    {avatar:"morning",title:"Tell me your name",greeting:"What should I call you? Your name and age help me tailor every message and recommendation to your life stage and skin type.",why:"Your name and age help me give advice that's actually relevant to your skin right now — not generic."},
    {avatar:"coach",title:"Your lifestyle",greeting:"How we live shapes how our skin looks and feels — often more than products do. Tell me a little about your daily rhythms.",why:"Sleep, water, diet, and stress are four of the most powerful skin factors. This helps me give meaningful, not generic, insights."},
    {avatar:"empathy",title:"Health background",greeting:"This step is completely optional. But conditions like PCOS and thyroid disorders have real, significant effects on skin. I want my advice to actually fit your body.",why:"Hormonal conditions affect skin in specific ways. Knowing this means my recommendations will be much more accurate for you."},
    {avatar:"analysis",title:"Your skin goals",greeting:"What would you most like to work on? There are no wrong answers — choose as many as you'd like. I'll use these to shape everything I suggest.",why:"Your skin goals guide which products I suggest, which habits I prioritize, and what I focus on in your analysis."},
    {avatar:"happy",title:"Your wellness vision",greeting:"Smira isn't just about skin — it's about building confidence, healthy habits, and feeling genuinely good from the inside out. What matters to you?",why:"Your wellness goals shape how I coach you daily. Whether it's sleep, stress, or confidence, I'll weave these into your whole experience."},
  ];
  const cur=steps[step];
  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24,position:"relative",overflow:"hidden"}}>
      <div className="orb" style={{width:380,height:380,background:"rgba(139,58,87,.18)",top:"5%",right:"3%"}}/>
      <div style={{width:"100%",maxWidth:520,zIndex:10}}>
        <div style={{marginBottom:26}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <span style={{fontSize:12,color:"#9A6677"}}>Step {step+1} of {steps.length}</span>
            <span style={{fontSize:12,color:"#D4879A",fontWeight:600}}>{Math.round(((step+1)/steps.length)*100)}%</span>
          </div>
          <div className="pbar"><div className="pfill" style={{width:`${((step+1)/steps.length)*100}%`,background:"linear-gradient(90deg,#6B2244,#D4879A)"}}/></div>
        </div>
        <div className="glass glow" style={{padding:"34px 30px",borderRadius:26}}>
          <div style={{marginBottom:20}}><SmiraMsg state={cur.avatar} text={cur.greeting} size={52}/></div>
          <h2 className="cf" style={{fontSize:26,marginBottom:cur.why?8:20,fontWeight:400}}>{cur.title}</h2>
          {cur.why&&<div style={{background:"rgba(181,92,121,.08)",border:"1px solid rgba(181,92,121,.15)",borderRadius:10,padding:"9px 13px",marginBottom:18}}><p style={{fontSize:12,color:"#9A6677",lineHeight:1.65}}>Why I'm asking: {cur.why}</p></div>}
          {step===0&&<div style={{display:"flex",flexDirection:"column",gap:9}}>{["Real AI vision skin analysis","Confidence Score — measuring self-care, not appearance","Glow Journal for emotional growth & patterns","Skin Forecast & 30-day trend predictions","Emotionally intelligent AI companion","Monthly personalized story recap"].map(t=><div key={t} style={{fontSize:13,color:"#F0C4CC",padding:"9px 14px",background:"rgba(181,92,121,.08)",borderRadius:10,border:"1px solid rgba(181,92,121,.12)",display:"flex",gap:10,alignItems:"center"}}><div style={{width:6,height:6,borderRadius:"50%",background:"#D4879A",flexShrink:0}}/>{t}</div>)}</div>}
          {step===1&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
            <input className="inp" placeholder="Your name *" value={d.name} onChange={e=>upd("name",e.target.value)}/>
            <input className="inp" placeholder="Email address" type="email" value={d.email} onChange={e=>upd("email",e.target.value)}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <input className="inp" placeholder="Age *" type="number" value={d.age} onChange={e=>upd("age",e.target.value)}/>
              <select className="sel" value={d.gender} onChange={e=>upd("gender",e.target.value)}><option value="">Gender</option><option>Female</option><option>Male</option><option>Non-binary</option><option>Prefer not to say</option></select>
            </div>
          </div>}
          {step===2&&<div style={{display:"flex",flexDirection:"column",gap:13}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <input className="inp" placeholder="Height (cm)" type="number" value={d.height} onChange={e=>upd("height",e.target.value)}/>
              <input className="inp" placeholder="Weight (kg)" type="number" value={d.weight} onChange={e=>upd("weight",e.target.value)}/>
            </div>
            {[{label:"Diet preference",key:"diet",opts:["Vegetarian","Vegan","Non-Vegetarian","Eggetarian"]},{label:"Daily water intake",key:"water",opts:["< 4 glasses","4-6 glasses","6-8 glasses","8+ glasses"]},{label:"Sleep duration",key:"sleep",opts:["< 5 hrs","5-6 hrs","7-8 hrs","8+ hrs"]},{label:"Stress level",key:"stress",opts:["Low","Moderate","High","Very High"]}].map(f=>(
              <div key={f.key}><label style={{fontSize:11,color:"#9A6677",display:"block",marginBottom:5}}>{f.label}</label>
              <select className="sel" value={d[f.key]} onChange={e=>upd(f.key,e.target.value)}>{f.opts.map(o=><option key={o}>{o}</option>)}</select></div>
            ))}
          </div>}
          {step===3&&<div style={{display:"flex",flexDirection:"column",gap:9}}>
            <p style={{fontSize:12,color:"#9A6677",marginBottom:4}}>Select any that apply — or skip this step entirely:</p>
            {[{k:"pcos",l:"PCOS",desc:"Polycystic Ovary Syndrome — affects hormones & skin"},{k:"pcod",l:"PCOD",desc:"Similar to PCOS — hormonal skin effects"},{k:"thyroid",l:"Thyroid Disorder",desc:"Affects skin texture, hydration, and hair"},{k:"diabetes",l:"Diabetes",desc:"Affects skin barrier and healing speed"},{k:"menstrualTracking",l:"Track Menstrual Cycle",desc:"Get hormonal skin insights around your cycle"}].map(c=>(
              <div key={c.k} role="checkbox" aria-checked={!!d[c.k]} tabIndex={0} className="kb-focusable" onClick={()=>toggle(c.k)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggle(c.k);}}} style={{display:"flex",alignItems:"center",gap:13,padding:"12px 15px",borderRadius:12,cursor:"pointer",background:d[c.k]?"rgba(181,92,121,.18)":"rgba(255,255,255,.03)",border:`1px solid ${d[c.k]?"#D4879A":"rgba(181,92,121,.1)"}`,transition:"all .2s"}}>
                <div style={{width:21,height:21,borderRadius:6,background:d[c.k]?"linear-gradient(135deg,#8B3A57,#D4879A)":"rgba(181,92,121,.1)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{d[c.k]&&<Ic n="ok" s={12} c="#fff"/>}</div>
                <div><div style={{fontSize:14,fontWeight:500}}>{c.l}</div><div style={{fontSize:11,color:"#6B4455"}}>{c.desc}</div></div>
              </div>
            ))}
          </div>}
          {step===4&&<div style={{display:"flex",flexWrap:"wrap",gap:9}}>
            {["Clear Acne","Fade Pigmentation","Deep Hydration","Anti-Aging","Even Skin Tone","Reduce Pores","Glow & Radiance","Soothe Redness","Dark Circles","Oil Control","Strengthen Barrier","Brighten Complexion"].map(g=>(
              <div key={g} role="checkbox" aria-checked={d.skinGoal.includes(g)} tabIndex={0} className="kb-focusable" onClick={()=>toggleGoal(g,"skinGoal")} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggleGoal(g,"skinGoal");}}} style={{padding:"8px 16px",borderRadius:24,cursor:"pointer",fontSize:13,fontWeight:500,transition:"all .2s",background:d.skinGoal.includes(g)?"linear-gradient(135deg,#8B3A57,#D4879A)":"rgba(181,92,121,.1)",color:d.skinGoal.includes(g)?"#fff":"#D4879A",border:`1px solid ${d.skinGoal.includes(g)?"transparent":"rgba(181,92,121,.2)"}`}}>{g}</div>
            ))}
          </div>}
          {step===5&&<div style={{display:"flex",flexWrap:"wrap",gap:9}}>
            {["Build Confidence","Improve Sleep","Reduce Stress","Better Nutrition","Consistent Habits","Hormonal Balance","Mental Wellness","Track Progress","Self-Care Rituals","Body Positivity","Mindful Living"].map(g=>(
              <div key={g} role="checkbox" aria-checked={d.wellnessGoal.includes(g)} tabIndex={0} className="kb-focusable" onClick={()=>toggleGoal(g,"wellnessGoal")} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggleGoal(g,"wellnessGoal");}}} style={{padding:"8px 16px",borderRadius:24,cursor:"pointer",fontSize:13,fontWeight:500,transition:"all .2s",background:d.wellnessGoal.includes(g)?"linear-gradient(135deg,#8B3A57,#D4879A)":"rgba(181,92,121,.1)",color:d.wellnessGoal.includes(g)?"#fff":"#D4879A",border:`1px solid ${d.wellnessGoal.includes(g)?"transparent":"rgba(181,92,121,.2)"}`}}>{g}</div>
            ))}
          </div>}
          <div style={{display:"flex",gap:11,marginTop:26}}>
            {step>0&&<button className="btn-o" onClick={()=>setStep(s=>s-1)} style={{flex:1}}>Back</button>}
            <button className="btn" onClick={()=>step<steps.length-1?setStep(s=>s+1):onDone(d)} style={{flex:2}} disabled={step===1&&!d.name}>
              {step===steps.length-1?"Start My Journey":"Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const SkinScan=({onResult,user,existingScans})=>{
  const [mode,setMode]=useState("upload");
  const [img,setImg]=useState(null);
  const [progress,setProgress]=useState(0);
  const [stepTxt,setStepTxt]=useState("");
  const [analyzing,setAnalyzing]=useState(false);
  const [err,setErr]=useState("");
  const [lastImg,setLastImg]=useState(null);
  const vidRef=useRef(null);
  const canRef=useRef(null);
  const fileRef=useRef(null);
  const streamRef=useRef(null);
  const STEPS=["Detecting facial boundaries...","Reading your skin texture...","Mapping concern areas with care...","Measuring hydration indicators...","Identifying patterns...","Building personalized insights...","Almost ready with your report..."];
  const stopCamera=useCallback(()=>{
    if(streamRef.current){streamRef.current.getTracks().forEach(t=>t.stop());streamRef.current=null;}
    if(vidRef.current)vidRef.current.srcObject=null;
  },[]);
  useEffect(()=>()=>stopCamera(),[stopCamera]);
  const startCamera=async()=>{
    setErr("");
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:1280},height:{ideal:720}}});
      streamRef.current=stream;
      if(vidRef.current){
        vidRef.current.srcObject=stream;
        vidRef.current.onloadedmetadata=()=>vidRef.current.play().catch(()=>{stopCamera();setMode("upload");setErr("Camera couldn't start. Please use photo upload instead.");});
      }
      setMode("camera");
    }catch(e){
      let msg="Camera not accessible. Please use photo upload instead.";
      if(e.name==="NotAllowedError")msg="Camera permission was denied. Please allow camera access in your browser settings, or use photo upload.";
      else if(e.name==="NotFoundError")msg="No camera found on this device. Please use photo upload instead.";
      setMode("upload");setErr(msg);
    }
  };
  const capturePhoto=()=>{
    const video=vidRef.current,canvas=canRef.current;
    if(!video||!canvas||video.videoWidth===0){setErr("Camera not ready. Please wait a moment and try again.");return;}
    canvas.width=video.videoWidth;canvas.height=video.videoHeight;
    canvas.getContext("2d").drawImage(video,0,0);
    const data=canvas.toDataURL("image/jpeg",.88);
    stopCamera();setImg(data);doAnalysis(data);
  };
  const doAnalysis=useCallback(async(imgData)=>{
    setAnalyzing(true);setProgress(0);setErr("");setLastImg(imgData);
    let p=0;setStepTxt(STEPS[0]);
    const ticker=setInterval(()=>{
      p=Math.min(p+Math.random()*8+2,94);setProgress(Math.round(p));
      setStepTxt(STEPS[Math.min(Math.floor(p/(94/STEPS.length)),STEPS.length-1)]);
    },600);
    try{
      const timeout=new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),65000));
      const prevScan=existingScans?.length?existingScans[existingScans.length-1]:null;
      const result=await Promise.race([runVisionAnalysis(imgData,user,prevScan),timeout]);
      clearInterval(ticker);setProgress(100);setStepTxt("Your insights are ready");
      recordActivity("scan");
      setTimeout(()=>{onResult(result,imgData);setAnalyzing(false);},800);
    }catch(e){
      clearInterval(ticker);
      console.error("[Smira Scan]",e?.message,new Date().toISOString());
      let msg=e?.message==="timeout"?"The analysis is taking longer than expected. Please try again with a clear, well-lit photo.":friendlyAIError(e);
      if(e?.status===413)msg="This photo is too large. Please try a smaller image.";
      setErr(msg);setAnalyzing(false);setProgress(0);
    }
  },[user,onResult,existingScans]);

  if(analyzing)return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"65vh",padding:24}}>
      <div className="glass" style={{padding:"48px 44px",borderRadius:28,textAlign:"center",maxWidth:380}}>
        <div style={{width:100,height:120,margin:"0 auto 22px",borderRadius:20,overflow:"hidden",border:"2px solid rgba(212,135,154,.3)"}}><SmiraAvatar state="analysis" portrait size={120}/></div>
        <div style={{position:"relative",width:130,height:130,margin:"0 auto 22px"}}>
          <svg width="130" height="130" style={{transform:"rotate(-90deg)"}}>
            <circle cx="65" cy="65" r="55" fill="none" stroke="rgba(181,92,121,.1)" strokeWidth="6"/>
            <circle cx="65" cy="65" r="55" fill="none" stroke="#D4879A" strokeWidth="6" strokeDasharray="345" strokeDashoffset={345-(progress/100)*345} strokeLinecap="round" style={{transition:"stroke-dashoffset .4s"}}/>
          </svg>
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:28,fontWeight:700,color:"#D4879A"}}>{progress}%</span></div>
        </div>
        <h3 className="cf" style={{fontSize:22,marginBottom:9,fontWeight:400}}>Reading your skin with care</h3>
        <p style={{color:"#D4879A",fontSize:13,marginBottom:5}}>{stepTxt}</p>
        <p style={{color:"#6B4455",fontSize:11}}>Smira AI Vision</p>
      </div>
    </div>
  );

  return(
    <div style={{padding:"28px 22px",maxWidth:680,margin:"0 auto"}}>
      <div style={{marginBottom:22}}>
        <SmiraMsg state="analysis" text="Your skin is unique and beautiful. This analysis helps you understand it better — never judge it. Take a clear, well-lit selfie for the most accurate results." size={44}/>
        <h1 className="cf" style={{fontSize:32,marginTop:20,marginBottom:5,fontWeight:400}}>Skin Analysis</h1>
        <p style={{color:"#9A6677",fontSize:13}}>AI-powered · private · compassionate</p>
      </div>
      {err&&<ErrorBox message={err} onRetry={lastImg?()=>doAnalysis(lastImg):null}/>}
      <div style={{display:"flex",gap:10,alignItems:"flex-start",padding:"12px 16px",background:"rgba(168,230,201,.06)",border:"1px solid rgba(168,230,201,.2)",borderRadius:14,marginBottom:18}}>
        <Ic n="lock" s={15} c="#A8E6C9"/>
        <p style={{fontSize:11.5,color:"#9A6677",lineHeight:1.65}}>Your photo is processed securely for this analysis and never shared with third parties or used to train AI models. It belongs entirely to you — you can delete any scan from your history at any time in Settings.</p>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:20}}>
        {[["upload","Upload Photo","dl"],["camera","Use Camera","scan"]].map(([m,l,icon])=>(
          <button key={m} onClick={()=>m==="camera"?startCamera():fileRef.current?.click()} style={{flex:1,padding:"12px",borderRadius:14,border:`1px solid ${mode===m?"#D4879A":"rgba(181,92,121,.2)"}`,background:mode===m?"rgba(181,92,121,.15)":"rgba(255,255,255,.02)",color:mode===m?"#D4879A":"#9A6677",cursor:"pointer",fontSize:13,fontWeight:500,transition:"all .2s",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
            <Ic n={icon} s={14} c={mode===m?"#D4879A":"#9A6677"}/>{l}
          </button>
        ))}
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{setImg(ev.target.result);setMode("preview");};r.readAsDataURL(f);}} style={{display:"none"}}/>
      {(mode==="upload"||mode==="preview")&&(
        <div role="button" tabIndex={0} aria-label="Upload a photo" className="kb-focusable" onClick={()=>!img&&fileRef.current?.click()} onKeyDown={e=>{if((e.key==="Enter"||e.key===" ")&&!img){e.preventDefault();fileRef.current?.click();}}} style={{border:`2px dashed ${img?"rgba(181,92,121,.35)":"rgba(181,92,121,.2)"}`,borderRadius:20,padding:"44px 24px",textAlign:"center",cursor:img?"default":"pointer",background:"rgba(181,92,121,.04)",minHeight:200}}>
          {img?(
            <div>
              <img src={img} alt="preview" style={{maxWidth:"100%",maxHeight:320,borderRadius:16,objectFit:"contain"}}/>
              <div style={{display:"flex",gap:10,marginTop:16,justifyContent:"center"}}>
                <button className="btn-o" onClick={()=>{setImg(null);setMode("upload");}} style={{fontSize:13}}>Retake</button>
                <button className="btn" onClick={()=>doAnalysis(img)} style={{padding:"11px 28px",fontSize:14}}>Analyze with AI</button>
              </div>
            </div>
          ):(
            <div>
              <div style={{width:60,height:72,margin:"0 auto 16px",borderRadius:14,overflow:"hidden"}}><SmiraAvatar state="analysis" portrait size={72}/></div>
              <p style={{color:"#9A6677",fontSize:14,lineHeight:1.65}}>Tap to upload a clear, well-lit photo<br/><span style={{fontSize:12,color:"#6B4455"}}>Analyzed privately and never stored permanently</span></p>
            </div>
          )}
        </div>
      )}
      {mode==="camera"&&(
        <div style={{borderRadius:20,overflow:"hidden",position:"relative",background:"rgba(181,92,121,.06)"}}>
          <video ref={vidRef} style={{width:"100%",borderRadius:20,maxHeight:340,objectFit:"cover",display:"block"}} playsInline autoPlay muted/>
          <div className="scan-anim"/>
          <canvas ref={canRef} style={{display:"none"}}/>
          <div style={{padding:"14px",display:"flex",gap:10,justifyContent:"center"}}>
            <button className="btn-o" onClick={()=>{stopCamera();setMode("upload");}}>Cancel</button>
            <button className="btn" onClick={capturePhoto}>Capture &amp; Analyze</button>
          </div>
        </div>
      )}
      {existingScans?.length>0&&(
        <div style={{marginTop:28}}>
          <h3 style={{fontSize:14,fontWeight:600,color:"#9A6677",marginBottom:12}}>Previous Scans</h3>
          <div style={{display:"flex",gap:9,overflowX:"auto",paddingBottom:6}}>
            {existingScans.slice(-5).reverse().map((s,i)=>(
              <div key={i} className="glass" style={{padding:"12px 14px",borderRadius:14,flexShrink:0,textAlign:"center",minWidth:90}}>
                <div style={{fontSize:20,fontWeight:700,color:"#D4879A",marginBottom:3}}>{s.overallScore}</div>
                <div style={{fontSize:10,color:"#6B4455"}}>{s.date}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const Results=({results,img,user,onNav,scans})=>{
  const [tab,setTab]=useState("overview");
  const cColors={Low:"#A8E6C9",Moderate:"#F0C4CC",High:"#F5A3A3"};
  if(!results)return<EmptyState avatarState="analysis" title="No analysis yet" message="Complete your first skin scan to see your personalized results and begin your glow journey." actionLabel="Start Skin Analysis" onAction={()=>onNav("scan")}/>;
  const progress=computeProgress(scans);
  const radar=[{s:"Hydration",v:results.hydrationLevel||62},{s:"Brightness",v:results.brightness||60},{s:"Elasticity",v:results.elasticity||70},{s:"Clarity",v:100-(results.concerns?.find(c=>c.name==="Acne")?.confidence||40)},{s:"Evenness",v:results.overallScore||68}];
  return(
    <div style={{padding:"24px 22px",maxWidth:920,margin:"0 auto"}}>
      {results.emotionalNote&&(
        <div style={{marginBottom:20,padding:"16px 20px",borderRadius:16,background:"linear-gradient(135deg,rgba(181,92,121,.15),rgba(74,21,48,.2))",border:"1px solid rgba(181,92,121,.25)",display:"flex",gap:12,alignItems:"center"}}>
          <SmiraAvatar state="empathy" size={44}/>
          <p style={{fontSize:14,color:"#F0C4CC",lineHeight:1.75,fontStyle:"italic"}}>{results.emotionalNote}</p>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:13,marginBottom:20}}>
        <div className="glass glow" style={{padding:"18px 14px",borderRadius:18,textAlign:"center"}}><Ring score={results.overallScore||68} size={90} label="Overall"/></div>
        <div className="glass" style={{padding:"18px 14px",borderRadius:18,textAlign:"center"}}><Ring score={results.hydrationLevel||62} size={90} label="Hydration" color="#7EC8E3"/></div>
        <div className="glass" style={{padding:"18px 14px",borderRadius:18,textAlign:"center"}}><Ring score={results.elasticity||71} size={90} label="Elasticity" color="#A8E6C9"/></div>
        <div className="glass" style={{padding:"18px 14px",borderRadius:18,textAlign:"center"}}><Ring score={results.brightness||60} size={90} label="Brightness" color="#F0C4CC"/></div>
        <div className="glass" style={{padding:"18px 14px",borderRadius:18,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:5}}>
          <div style={{fontSize:28,fontWeight:700,background:"linear-gradient(135deg,#F0C4CC,#D4879A)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>{results.skinAge||"--"}</div>
          <div style={{fontSize:11,color:"#9A6677"}}>Skin Age</div>
          <span style={{fontSize:10,color:"#A8E6C9",background:"rgba(168,230,201,.1)",padding:"2px 8px",borderRadius:10}}>Actual: {user?.age||"–"}</span>
        </div>
      </div>
      {results.aiSummary&&(
        <div style={{marginBottom:18,padding:"18px 20px",borderRadius:16,background:"rgba(181,92,121,.1)",border:"1px solid rgba(181,92,121,.2)",display:"flex",gap:12,alignItems:"flex-start"}}>
          <SmiraAvatar state="analysis" size={40}/>
          <div><div style={{fontSize:10,color:"#D4879A",fontWeight:600,marginBottom:5,textTransform:"uppercase",letterSpacing:".06em"}}>Smira's Analysis</div><p style={{fontSize:14,color:"#F0C4CC",lineHeight:1.8}}>{results.aiSummary}</p></div>
        </div>
      )}
      <div style={{display:"flex",gap:5,marginBottom:18,overflowX:"auto",paddingBottom:3}}>
        {[["overview","Overview"],["progress","Progress"],["concerns","Concerns"],["heatmap","Heat Map"],["forecast","Forecast"],["triggers","Triggers"],["routine","Routine"]].map(([t,l])=>(
          <button key={t} className={`tab-btn${tab===t?" act":""}`} onClick={()=>setTab(t)}>{l}</button>
        ))}
      </div>
      {tab==="overview"&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}} className="r-col">
          <div className="glass" style={{padding:22,borderRadius:20}}>
            <h3 style={{fontSize:14,fontWeight:600,marginBottom:14}}>Skin Radar</h3>
            <ResponsiveContainer width="100%" height={200}><RadarChart data={radar}><PolarGrid stroke="rgba(181,92,121,.15)"/><PolarAngleAxis dataKey="s" tick={{fill:"#9A6677",fontSize:11}}/><Radar dataKey="v" stroke="#D4879A" fill="rgba(212,135,154,.18)" fillOpacity={0.7}/></RadarChart></ResponsiveContainer>
          </div>
          <div className="glass" style={{padding:22,borderRadius:20}}>
            <h3 style={{fontSize:14,fontWeight:600,marginBottom:14}}>Score Breakdown</h3>
            <div style={{display:"flex",flexDirection:"column",gap:13}}>
              {results.concerns?.slice(0,5).map(c=>(
                <div key={c.name}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}><span style={{color:"#F0C4CC"}}>{c.name}</span><span style={{fontWeight:600,color:"#D4879A"}}>{c.confidence}/100</span></div><ConfBar pct={c.confidence} color={c.color||"#D4879A"}/></div>
              ))}
            </div>
          </div>
        </div>
      )}
      {tab==="progress"&&(
        <div style={{display:"flex",flexDirection:"column",gap:18}}>
          {!progress.hasComparison?(
            <div className="glass" style={{padding:"28px 24px",borderRadius:20,textAlign:"center"}}>
              <SmiraAvatar state="analysis" size={48}/>
              <p style={{fontSize:14,color:"#9A6677",marginTop:14,lineHeight:1.7}}>Complete one more scan to start seeing progress comparisons. Smira tracks every scan so you can see exactly how your skin changes over time.</p>
            </div>
          ):(
            <>
              <div className="glass" style={{padding:"16px 20px",borderRadius:16,display:"flex",gap:10,alignItems:"center"}}>
                <SmiraAvatar state="celebration" size={40}/>
                <p style={{fontSize:13,color:"#F0C4CC",lineHeight:1.6}}>Comparing your <b>{progress.latestDate}</b> scan to your previous one ({progress.scanCount} scans tracked since {progress.firstDate}).</p>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:13}}>
                {[
                  {key:"overallScore",label:"Overall Score",unit:""},
                  {key:"hydrationLevel",label:"Hydration",unit:"%"},
                  {key:"elasticity",label:"Elasticity",unit:"%"},
                  {key:"brightness",label:"Brightness",unit:"%"},
                ].map(({key,label,unit})=>{
                  const m=progress[key];
                  const up=m.value>0;const flat=m.value===0;
                  const color=flat?"#9A6677":up?"#A8E6C9":"#F5A3A3";
                  return(
                    <div key={key} className="glass" style={{padding:"16px 14px",borderRadius:16,textAlign:"center"}}>
                      <div style={{fontSize:11,color:"#9A6677",marginBottom:6}}>{label}</div>
                      <div style={{fontSize:22,fontWeight:700,color:"#F0C4CC"}}>{m.current}{unit}</div>
                      <div style={{fontSize:12,fontWeight:600,color,marginTop:4,display:"flex",alignItems:"center",justifyContent:"center",gap:3}}>
                        {!flat&&<span>{up?"↑":"↓"}</span>}{Math.abs(m.value)}{unit} since last scan
                      </div>
                    </div>
                  );
                })}
              </div>
              {progress.concernTrend?.length>0&&(
                <div className="glass" style={{padding:22,borderRadius:20}}>
                  <h3 style={{fontSize:14,fontWeight:600,marginBottom:14}}>Concern Progress</h3>
                  <div style={{display:"flex",flexDirection:"column",gap:12}}>
                    {progress.concernTrend.map(c=>(
                      <div key={c.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:13,color:"#F0C4CC"}}>{c.name}</span>
                        <span style={{fontSize:12,fontWeight:600,color:c.prevChange==null?"#9A6677":c.prevChange<0?"#A8E6C9":c.prevChange>0?"#F5A3A3":"#9A6677"}}>
                          {c.prevChange==null?"New":c.prevChange===0?"No change":c.prevChange<0?`Improved ${Math.abs(c.prevChange)}%`:`Up ${c.prevChange}%`}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p style={{fontSize:11,color:"#6B4455",marginTop:12,lineHeight:1.6}}>Lower confidence % generally means the concern is less prominent in your latest scan.</p>
                </div>
              )}
              <div className="glass" style={{padding:22,borderRadius:20}}>
                <h3 style={{fontSize:14,fontWeight:600,marginBottom:14}}>Skin Health Timeline</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={progress.series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(181,92,121,.1)"/>
                    <XAxis dataKey="date" tick={{fill:"#9A6677",fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:"#9A6677",fontSize:10}} axisLine={false} tickLine={false}/>
                    <Tooltip contentStyle={{background:"#2E0E1F",border:"1px solid rgba(181,92,121,.2)",borderRadius:9,color:"#F5E6EA",fontSize:11}}/>
                    <Line type="monotone" dataKey="hydrationLevel" stroke="#7EC8E3" strokeWidth={2} dot={{r:3}} name="Hydration"/>
                    <Line type="monotone" dataKey="brightness" stroke="#D4879A" strokeWidth={2} dot={{r:3}} name="Brightness"/>
                    <Line type="monotone" dataKey="overallScore" stroke="#A8E6C9" strokeWidth={2} dot={{r:3}} name="Overall"/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}
      {tab==="concerns"&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:14}}>
          {results.concerns?.map(c=>(
            <div key={c.name} className="glass" style={{padding:"18px 20px",borderRadius:16,borderLeft:`3px solid ${c.color||"#D4879A"}`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                <div><div style={{fontSize:15,fontWeight:600}}>{c.name}</div><span style={{fontSize:12,color:cColors[c.severity]||"#9A6677",fontWeight:500}}>{c.severity} severity</span></div>
                <div style={{textAlign:"right"}}><div style={{fontSize:18,fontWeight:700,color:c.color||"#D4879A"}}>{c.confidence}%</div><div style={{fontSize:10,color:"#6B4455"}}>AI confidence</div></div>
              </div>
              <ConfBar pct={c.confidence} color={c.color||"#D4879A"}/>
              {c.description&&<p style={{fontSize:12,color:"#9A6677",marginTop:10,lineHeight:1.6}}>{c.description}</p>}
            </div>
          ))}
        </div>
      )}
      {tab==="heatmap"&&(
        <div className="glass" style={{padding:24,borderRadius:20}}>
          <h3 style={{fontSize:15,fontWeight:600,marginBottom:6}}>Concern Zone Map</h3>
          <p style={{fontSize:13,color:"#9A6677",marginBottom:18}}>Areas where Smira AI detected skin concerns. All zones are manageable — none define your beauty.</p>
          <div style={{position:"relative",maxWidth:360,margin:"0 auto"}}>
            {img?<img src={img} alt="face" style={{width:"100%",borderRadius:14,objectFit:"cover",maxHeight:360}}/>
              :<div style={{width:"100%",paddingBottom:"100%",borderRadius:14,background:"rgba(181,92,121,.08)",position:"relative"}}><div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"#4A1530",fontSize:14}}>Upload photo to see heat map</span></div></div>}
            {results.heatZones?.map((z,i)=>(
              <div key={i} className="concern-zone" style={{left:`${z.x}%`,top:`${z.y}%`,width:z.intensity==="High"?48:z.intensity==="Medium"?36:26,height:z.intensity==="High"?48:z.intensity==="Medium"?36:26,borderColor:z.color,background:`${z.color}22`,transform:"translate(-50%,-50%)"}}>
                <div style={{position:"absolute",bottom:"100%",left:"50%",transform:"translateX(-50%)",whiteSpace:"nowrap",background:"rgba(26,11,18,.92)",border:`1px solid ${z.color}40`,padding:"2px 7px",borderRadius:6,fontSize:10,color:z.color,fontWeight:600,marginBottom:4}}>{z.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab==="forecast"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div className="glass" style={{padding:"22px 24px",borderRadius:20}}>
            <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:14}}>
              <SmiraAvatar state="analysis" size={48}/>
              <div><h3 style={{fontSize:16,fontWeight:600}}>30-Day Skin Forecast</h3><p style={{fontSize:12,color:"#9A6677",marginTop:2}}>Based on your current routine and habits</p></div>
            </div>
            {results.forecast?(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <div style={{background:"rgba(181,92,121,.1)",borderRadius:12,padding:14}}><div style={{fontSize:11,color:"#9A6677",marginBottom:4}}>Hydration (projected)</div><div style={{fontSize:22,fontWeight:700,color:"#7EC8E3"}}>+{results.forecast.hydration30days||12}%</div></div>
                  <div style={{background:"rgba(181,92,121,.1)",borderRadius:12,padding:14}}><div style={{fontSize:11,color:"#9A6677",marginBottom:4}}>Brightness trend</div><div style={{fontSize:14,fontWeight:600,color:"#F0C4CC"}}>{results.forecast.brightnessChange||"Improving"}</div></div>
                </div>
                <div style={{background:"rgba(168,230,201,.08)",border:"1px solid rgba(168,230,201,.2)",borderRadius:12,padding:"13px 16px"}}>
                  <div style={{fontSize:11,color:"#A8E6C9",fontWeight:600,marginBottom:4}}>AI Recommendation</div>
                  <p style={{fontSize:13,color:"#F0C4CC",lineHeight:1.7}}>{results.forecast.recommendation||"Maintain your current routine consistency. Small, daily actions lead to visible improvements within 4–6 weeks."}</p>
                </div>
              </div>
            ):<p style={{color:"#9A6677",fontSize:14}}>Forecast data will be available from your scan results.</p>}
          </div>
        </div>
      )}
      {tab==="triggers"&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{padding:"13px 16px",background:"rgba(245,213,163,.06)",border:"1px solid rgba(245,213,163,.18)",borderRadius:12,display:"flex",gap:9,alignItems:"center"}}>
            <Ic n="alert" s={14} c="#F5D5A3"/><p style={{fontSize:13,color:"#F5D5A3",lineHeight:1.6}}>AI-estimated correlations — not medical advice. Consult a dermatologist for clinical guidance.</p>
          </div>
          {(results.triggers||[{food:"High-sugar foods",correlation:68,insight:"Sugar spikes insulin, triggering androgen hormones linked to breakouts."},{food:"Dairy products",correlation:45,insight:"Some people find dairy influences hormonal acne — worth tracking for 4 weeks."},{food:"Processed foods",correlation:55,insight:"Trans fats increase inflammatory markers that show in skin texture."}]).map(t=>(
            <div key={t.food} className="glass" style={{padding:"18px 20px",borderRadius:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{fontSize:14,fontWeight:600}}>{t.food}</div>
                <div style={{fontSize:16,fontWeight:700,color:"#D4879A"}}>{t.correlation}%</div>
              </div>
              <ConfBar pct={t.correlation} color="#D4879A"/>
              <p style={{fontSize:12,color:"#9A6677",marginTop:10,lineHeight:1.6}}>{t.insight}</p>
            </div>
          ))}
        </div>
      )}
      {tab==="routine"&&(
        <div>
          {results.recommendations?.length>0&&(
            <div style={{marginBottom:22}}>
              <h3 style={{fontSize:15,fontWeight:600,marginBottom:6,color:"#F0C4CC"}}>Personalized For You</h3>
              <p style={{fontSize:12,color:"#9A6677",marginBottom:14}}>Based on your profile, concerns, and this scan — not a generic list.</p>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {results.recommendations.map((r,i)=>(
                  <div key={i} className="glass" style={{padding:"18px 20px",borderRadius:16,borderLeft:"3px solid #D4879A"}}>
                    <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                      <div style={{width:26,height:26,borderRadius:7,background:"rgba(181,92,121,.18)",display:"flex",alignItems:"center",justifyContent:"center",color:"#D4879A",fontSize:12,fontWeight:700,flexShrink:0,marginTop:1}}>{i+1}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:14,fontWeight:600,color:"#F0C4CC",marginBottom:6}}>{r.action}</div>
                        {r.reason&&<p style={{fontSize:12,color:"#9A6677",lineHeight:1.65,marginBottom:8}}>{r.reason}</p>}
                        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                          {r.targetConcern&&<span style={{fontSize:10,color:"#D4879A",background:"rgba(181,92,121,.1)",padding:"3px 9px",borderRadius:20}}>Targets: {r.targetConcern}</span>}
                          {r.timeframe&&<span style={{fontSize:10,color:"#A8E6C9",background:"rgba(168,230,201,.08)",padding:"3px 9px",borderRadius:20}}>⏱ {r.timeframe}</span>}
                        </div>
                        {r.expectedImprovement&&<p style={{fontSize:11,color:"#6B4455",marginTop:8,fontStyle:"italic"}}>Expected: {r.expectedImprovement}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {[["Morning Routine",["Gentle cleanser — 60 seconds","Niacinamide serum — 2–3 drops, wait 60s","Lightweight gel moisturizer","SPF 50+ sunscreen — always last"]],["Night Routine",["Oil cleanser → water cleanser (double cleanse)","BHA exfoliant (Mon / Wed / Fri only)","Treatment serum (retinol or Vitamin C)","Rich nourishing night cream"]],["Weekly",["Chemical exfoliation ×2","Hydrating sheet mask (Sunday)","Clay mask for T-zone (Saturday)","1 rest day — no actives"]]].map(([title,items])=>(
            <div key={title} className="glass" style={{padding:"20px 22px",borderRadius:18,marginBottom:14}}>
              <h3 style={{fontSize:15,fontWeight:600,marginBottom:14}}>{title}</h3>
              {items.map((item,i)=>(
                <div key={i} className="check-row">
                  <div style={{width:26,height:26,borderRadius:7,background:"rgba(181,92,121,.18)",display:"flex",alignItems:"center",justifyContent:"center",color:"#D4879A",fontSize:12,fontWeight:700,flexShrink:0}}>{i+1}</div>
                  <span style={{fontSize:13,color:"#F0C4CC"}}>{item}</span>
                </div>
              ))}
            </div>
          ))}
          <button className="btn" onClick={()=>onNav("products")} style={{width:"100%"}}>View Recommended Products</button>
        </div>
      )}
    </div>
  );
};

const Dashboard=({user,results,onNav,scans})=>{
  const [habits,setHabits]=useState(()=>LS.get("habits3",DEFAULT_HABITS));
  const [water,setWater]=useState(()=>LS.get("water_today",0));
  const [journalEntries]=useState(()=>LS.get("glowJournal",[]));
  const streak=calcStreak();
  const [dailyMsg]=useState(()=>getDailyMsg(user?.name,habits,streak));
  const h=new Date().getHours();
  const avState=h<12?"morning":h<17?"coach":h<21?"neutral":"night";
  useEffect(()=>{recordActivity("checkin");},[]);
  useEffect(()=>{LS.set("habits3",habits);},[habits]);
  useEffect(()=>{LS.set("water_today",water);},[water]);
  const done=habits.filter(h=>h.done).length;
  const toggleHabit=id=>{setHabits(h=>h.map(x=>x.id===id?{...x,done:!x.done}:x));recordActivity("habit");};
  const confScore=calcConfidenceScore(habits,water,journalEntries,scans);
  const cl=confLabel(confScore),cc=confColor(confScore);
  const greeting=h<12?"Good morning":h<17?"Good afternoon":"Good evening";
  const welcomeBack=LS.get("just_logged_in",false);
  useEffect(()=>{if(welcomeBack)setTimeout(()=>LS.set("just_logged_in",false),4000);},[welcomeBack]);
  const latestScan=scans?.[scans.length-1];
  return(
    <div style={{padding:"24px 22px",maxWidth:1000,margin:"0 auto"}}>
      {/* HERO — Smira Companion */}
      <div className="glass glow" style={{padding:"26px 28px",borderRadius:24,marginBottom:22,background:"linear-gradient(135deg,rgba(139,58,87,.28),rgba(46,14,31,.8))",border:"1px solid rgba(212,135,154,.25)",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-30,right:-10,width:180,height:220,opacity:.1,borderRadius:20,overflow:"hidden",pointerEvents:"none"}}>
          <SmiraAvatar state={avState} portrait size={220}/>
        </div>
        <div style={{display:"flex",gap:16,alignItems:"flex-start",position:"relative",zIndex:1}}>
          <div style={{width:68,height:80,borderRadius:16,overflow:"hidden",border:"2px solid rgba(212,135,154,.3)",flexShrink:0}}>
            <SmiraAvatar state={avState} portrait size={80}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:11,color:"#9A6677",marginBottom:4,textTransform:"uppercase",letterSpacing:".08em",fontWeight:600}}>{greeting}, {user?.name?.split(" ")[0]||"Beautiful"}</div>
            <p style={{fontSize:14,color:"#F0C4CC",lineHeight:1.75,fontStyle:"italic",marginBottom:12}}>"{dailyMsg}"</p>
            <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
              {streak===0?(
                <span style={{fontSize:12,color:"#9A6677",background:"rgba(181,92,121,.12)",border:"1px solid rgba(181,92,121,.25)",borderRadius:20,padding:"5px 12px",cursor:"pointer"}} onClick={()=>{recordActivity("checkin");window.location.reload();}}>Complete today's check-in to begin your streak</span>
              ):(
                <span className="streak-badge">{streak===1?"Day 1 — Your journey begins!":`${streak}-day streak`}</span>
              )}
              <span style={{fontSize:11,color:"#6B4455"}}>{new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:14,marginBottom:22}}>
        {[
          {label:"Confidence",value:confScore,unit:"/100",sub:cl,color:cc,page:"confidence"},
          {label:"Skin Score",value:latestScan?.overallScore||"—",unit:latestScan?"":"scan",sub:latestScan?"Last scan":"No scan yet",color:"#D4879A",page:"scan"},
          {label:"Streak",value:streak,unit:streak===1?"day":streak>1?"days":"",sub:streak===0?"Start today!":"Keep it up!",color:"#F5D5A3",page:null},
          {label:"Habits",value:`${done}/${habits.length}`,unit:"",sub:"Completed today",color:"#A8E6C9",page:null},
          {label:"Water",value:water,unit:"/8",sub:"Glasses today",color:"#7EC8E3",page:null},
        ].map(card=>(
          <div key={card.label} className="glass kb-focusable" role={card.page?"button":undefined} tabIndex={card.page?0:undefined} style={{padding:"16px 14px",borderRadius:18,cursor:card.page?"pointer":"default",transition:"transform .2s"}} onClick={()=>card.page&&onNav(card.page)} onKeyDown={e=>{if(card.page&&(e.key==="Enter"||e.key===" ")){e.preventDefault();onNav(card.page);}}} onMouseEnter={e=>card.page&&(e.currentTarget.style.transform="translateY(-2px)")} onMouseLeave={e=>(e.currentTarget.style.transform="translateY(0)")}>
            <div style={{fontSize:11,color:"#9A6677",marginBottom:5}}>{card.label}</div>
            <div style={{fontSize:22,fontWeight:700,color:card.color,lineHeight:1}}>{card.value}<span style={{fontSize:12,color:"#6B4455",fontWeight:400}}>{card.unit}</span></div>
            <div style={{fontSize:11,color:"#6B4455",marginTop:4}}>{card.sub}</div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}} className="r-col">
        {/* Habits */}
        <div className="glass" style={{padding:22,borderRadius:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <h3 style={{fontSize:15,fontWeight:600}}>Today's Habits</h3>
            <SmiraAvatar state="coach" size={28}/>
          </div>
          {habits.map(habit=>(
            <div key={habit.id} className="check-row kb-focusable" role="checkbox" aria-checked={habit.done} tabIndex={0} style={{cursor:"pointer"}} onClick={()=>toggleHabit(habit.id)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggleHabit(habit.id);}}}>
              <div style={{width:22,height:22,borderRadius:6,background:habit.done?"linear-gradient(135deg,#8B3A57,#D4879A)":"rgba(181,92,121,.1)",border:`1px solid ${habit.done?"transparent":"rgba(181,92,121,.25)"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .2s"}}>
                {habit.done&&<Ic n="ok" s={11} c="#fff"/>}
              </div>
              <span style={{fontSize:13,color:habit.done?"#9A6677":"#F0C4CC",textDecoration:habit.done?"line-through":"none",transition:"all .2s"}}>{habit.label}</span>
            </div>
          ))}
          <div style={{marginTop:14}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#9A6677",marginBottom:5}}><span>{done} of {habits.length} complete</span><span style={{color:done===habits.length?"#A8E6C9":"#D4879A",fontWeight:600}}>{done===habits.length?"All done!":Math.round((done/habits.length)*100)+"%"}</span></div>
            <ConfBar pct={(done/habits.length)*100} color={done===habits.length?"#A8E6C9":"#D4879A"}/>
          </div>
        </div>

        {/* Confidence + Quick Actions */}
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div className="glass" style={{padding:22,borderRadius:20,display:"flex",gap:14,alignItems:"center"}}>
            <Ring score={confScore} size={90} color={cc}/>
            <div>
              <div style={{fontSize:11,color:"#9A6677",marginBottom:4}}>Confidence Score</div>
              <div style={{fontSize:18,fontWeight:700,color:cc,lineHeight:1.2}}>{cl}</div>
              <div style={{fontSize:12,color:"#6B4455",marginTop:4}}>Built by self-care, not appearance</div>
              <button onClick={()=>onNav("confidence")} style={{marginTop:9,fontSize:11,color:"#D4879A",background:"none",border:"1px solid rgba(181,92,121,.25)",borderRadius:20,padding:"4px 12px",cursor:"pointer"}}>View Details</button>
            </div>
          </div>
          <div className="glass" style={{padding:18,borderRadius:20}}>
            <h4 style={{fontSize:13,fontWeight:600,marginBottom:11}}>Quick Actions</h4>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[["scan","Skin Scan","analysis"],["journal","Journal","book"],["products","Products","bag"],["story","My Story","star"]].map(([pg,label,icon])=>(
                <button key={pg} onClick={()=>onNav(pg)} style={{padding:"10px 8px",borderRadius:12,background:"rgba(181,92,121,.08)",border:"1px solid rgba(181,92,121,.15)",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:5,transition:"all .2s",color:"#D4879A"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(181,92,121,.18)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(181,92,121,.08)"}>
                  <Ic n={icon} s={16} c="#D4879A"/>
                  <span style={{fontSize:11,fontWeight:500}}>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Water Tracker */}
      <div className="glass" style={{padding:22,borderRadius:20,marginBottom:18}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <h3 style={{fontSize:15,fontWeight:600,display:"flex",alignItems:"center",gap:8}}><Ic n="leaf" s={16} c="#7EC8E3"/>Hydration Tracker</h3>
          <span style={{fontSize:12,color:water>=8?"#A8E6C9":water>=6?"#F5D5A3":"#9A6677",fontWeight:600}}>{water}/8 glasses</span>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {Array.from({length:8},(_,i)=>(
            <div key={i} role="button" aria-label={`Set water intake to ${i+1} glasses`} tabIndex={0} className="kb-focusable" onClick={()=>{setWater(i+1);recordActivity("hydration");}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setWater(i+1);recordActivity("hydration");}}} style={{width:44,height:44,borderRadius:12,background:i<water?"linear-gradient(135deg,#7EC8E3,#4AAFCC)":"rgba(126,200,227,.1)",border:`1px solid ${i<water?"#7EC8E3":"rgba(126,200,227,.2)"}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",transition:"all .2s",fontSize:18}}>
              {i<water?"💧":"○"}
            </div>
          ))}
        </div>
      </div>

      {/* Skin Tip */}
      <SkinTip/>

      {/* Weekly Chart */}
      <div className="glass" style={{padding:22,borderRadius:20,marginTop:18}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <h3 style={{fontSize:15,fontWeight:600}}>7-Day Trend</h3>
          <button onClick={()=>onNav("analytics")} style={{fontSize:11,color:"#D4879A",background:"none",border:"1px solid rgba(181,92,121,.25)",borderRadius:20,padding:"4px 12px",cursor:"pointer"}}>Full Analytics</button>
        </div>
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={computeProgress(scans).series.slice(-7)}><defs><linearGradient id="dg1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#D4879A" stopOpacity={0.25}/><stop offset="95%" stopColor="#D4879A" stopOpacity={0}/></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(181,92,121,.1)"/><XAxis dataKey="date" tick={{fill:"#9A6677",fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"#9A6677",fontSize:10}} axisLine={false} tickLine={false}/>
            <Tooltip contentStyle={{background:"#2E0E1F",border:"1px solid rgba(181,92,121,.2)",borderRadius:9,color:"#F5E6EA",fontSize:11}}/>
            <Area type="monotone" dataKey="hydrationLevel" stroke="#7EC8E3" fill="url(#dg1)" strokeWidth={2} name="Hydration"/>
            <Line type="monotone" dataKey="overallScore" stroke="#D4879A" strokeWidth={2} dot={false} name="Overall Score"/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const ConfidenceScore=({habits,water,journalEntries,scans,user})=>{
  const score=calcConfidenceScore(habits,water,journalEntries,scans);
  const cl=confLabel(score),cc=confColor(score);
  return(
    <div style={{padding:"24px 22px",maxWidth:720,margin:"0 auto"}}>
      <h1 className="cf" style={{fontSize:32,marginBottom:5,fontWeight:400}}>Confidence Score</h1>
      <p style={{color:"#9A6677",fontSize:13,marginBottom:20}}>Measuring self-care consistency, not how you look.</p>
      <div className="glass glow" style={{padding:28,borderRadius:24,marginBottom:20,background:"linear-gradient(135deg,rgba(139,58,87,.25),rgba(46,14,31,.7))",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-20,right:-10,width:140,height:170,opacity:.12,borderRadius:20,overflow:"hidden",pointerEvents:"none"}}>
          <SmiraAvatar state={score>=70?"happy":"coach"} portrait size={170}/>
        </div>
        <div style={{display:"flex",gap:18,alignItems:"center",marginBottom:22,position:"relative"}}>
          <SmiraAvatar state={score>=70?"happy":score>=50?"coach":"empathy"} size={60} animate={true}/>
          <div>
            <div style={{fontSize:11,color:"#9A6677",fontWeight:600,textTransform:"uppercase",letterSpacing:".08em",marginBottom:3}}>Your Confidence Score</div>
            <div style={{fontSize:44,fontWeight:700,color:cc,lineHeight:1}}>{score}<span style={{fontSize:18,color:"#9A6677",fontWeight:400}}>/100</span></div>
            <div style={{fontSize:15,color:cc,fontWeight:600,marginTop:4}}>{cl}</div>
          </div>
        </div>
        <ConfBar pct={score} color={cc}/>
        <p style={{fontSize:12,color:"#9A6677",marginTop:12,lineHeight:1.65}}>Built from habit consistency, hydration, journaling, and skin scans — never from your appearance. Every act of self-care counts.</p>
      </div>
      <div style={{marginBottom:18}}><SmiraMsg state={score>=70?"happy":score>=50?"encouragement":"empathy"} text={score>=70?`You are genuinely thriving, ${user?.name?.split(" ")[0]||""}. This score reflects weeks of consistent self-care. Keep going — you're building something beautiful.`:score>=50?"You're making real progress. Every habit completed, every glass of water, every journal entry — it all matters more than you know.":"Every journey begins exactly where you are. You're not behind — you're building momentum. One small act of self-care today changes everything."} size={44}/></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:13}}>
        {[["Daily Habits",`${habits?.filter(h=>h.done).length||0}/${habits?.length||6}`,((habits?.filter(h=>h.done).length||0)/(habits?.length||6))*100,"#D4879A"],["Hydration",`${water||0}/8`,((water||0)/8)*100,"#7EC8E3"],["Journal Entries",`${journalEntries?.length||0}`,Math.min((journalEntries?.length||0)*5,100),"#F0C4CC"],["Skin Scans",`${scans?.length||0}`,Math.min((scans?.length||0)*15,100),"#A8E6C9"]].map(([l,v,pct,c])=>(
          <div key={l} className="glass" style={{padding:"16px",borderRadius:16,textAlign:"center"}}>
            <div style={{fontSize:20,fontWeight:700,color:c,marginBottom:4}}>{v}</div>
            <div style={{fontSize:11,color:"#6B4455",marginBottom:8}}>{l}</div>
            <ConfBar pct={pct} color={c}/>
          </div>
        ))}
      </div>
    </div>
  );
};

const GlowJournal=()=>{
  const [entries,setEntries]=useState(()=>LS.get("glowJournal",[]));
  const [form,setForm]=useState({mood:"",confidence:5,energy:5,note:"",gratitude:""});
  const [tab,setTab]=useState("write");
  const [saved,setSaved]=useState(false);
  const MOODS=[["😊","Happy"],["😌","Calm"],["😔","Low"],["😤","Frustrated"],["🥰","Confident"],["😰","Anxious"]];
  const prompts=["How did your skin feel today — physically and emotionally?","What's one thing your body did for you today that you're grateful for?","Did anything trigger self-criticism today? How did you handle it?","What made you feel most like yourself today?","One small win from today — no matter how tiny?"];
  const [prompt]=useState(()=>prompts[Math.floor(Math.random()*prompts.length)]);
  const save=()=>{
    if(!form.mood&&!form.note)return;
    const entry={...form,date:new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}),ts:Date.now()};
    const next=[entry,...entries].slice(0,60);
    setEntries(next);LS.set("glowJournal",next);
    setForm({mood:"",confidence:5,energy:5,note:"",gratitude:""});
    recordActivity("journal");setSaved(true);setTimeout(()=>setSaved(false),2000);
  };
  const avgConf=entries.length?Math.round(entries.reduce((a,e)=>a+e.confidence,0)/entries.length):0;
  return(
    <div style={{padding:"24px 22px",maxWidth:720,margin:"0 auto"}}>
      <h1 className="cf" style={{fontSize:32,marginBottom:5,fontWeight:400}}>Glow Journal</h1>
      <p style={{color:"#9A6677",fontSize:13,marginBottom:20}}>A private space to reflect on your emotional journey and self-care growth.</p>
      <div style={{display:"flex",gap:6,marginBottom:20}}>
        {[["write","Write"],["entries","Past Entries"],["insights","Insights"]].map(([t,l])=>(
          <button key={t} className={`tab-btn${tab===t?" act":""}`} onClick={()=>setTab(t)}>{l}</button>
        ))}
      </div>
      {tab==="write"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div style={{marginBottom:4}}><SmiraMsg state="journal" text={prompt} size={44}/></div>
          <div className="glass" style={{padding:20,borderRadius:20}}>
            <h3 style={{fontSize:14,fontWeight:600,marginBottom:14}}>How are you feeling today?</h3>
            <div style={{display:"flex",gap:9,flexWrap:"wrap"}}>
              {MOODS.map(([emoji,label])=>(
                <button key={label} className={`mood-btn${form.mood===label?" sel":""}`} onClick={()=>setForm(f=>({...f,mood:label}))}>
                  <span style={{fontSize:22}}>{emoji}</span>
                  <span style={{fontSize:10,color:form.mood===label?"#F0C4CC":"#9A6677"}}>{label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="glass" style={{padding:20,borderRadius:20}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
              {[["Confidence level","confidence"],["Energy level","energy"]].map(([label,key])=>(
                <div key={key}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}>
                    <label style={{fontSize:12,color:"#9A6677"}}>{label}</label>
                    <span style={{fontSize:13,fontWeight:700,color:"#D4879A"}}>{form[key]}/10</span>
                  </div>
                  <input type="range" min={1} max={10} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:Number(e.target.value)}))} style={{width:"100%",accentColor:"#B55C79"}}/>
                </div>
              ))}
            </div>
          </div>
          <div className="glass" style={{padding:20,borderRadius:20}}>
            <label style={{fontSize:12,color:"#9A6677",display:"block",marginBottom:8}}>Today's reflection</label>
            <textarea className="inp" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="How did your skin or confidence feel today? What's on your mind?" rows={4} style={{resize:"vertical",lineHeight:1.65}}/>
          </div>
          <div className="glass" style={{padding:20,borderRadius:20}}>
            <label style={{fontSize:12,color:"#D4879A",display:"block",marginBottom:8}}>Gratitude entry</label>
            <input className="inp" value={form.gratitude} onChange={e=>setForm(f=>({...f,gratitude:e.target.value}))} placeholder="One thing you're grateful for about your body or self today..."/>
          </div>
          <button className="btn" onClick={save} style={{width:"100%"}} disabled={!form.mood&&!form.note}>{saved?"Saved!":"Save Entry"}</button>
        </div>
      )}
      {tab==="entries"&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {entries.length===0
            ?<EmptyState avatarState="journal" title="Your journal is empty" message="Write your first entry to start tracking your emotional journey. Even a few words each day builds powerful self-awareness." actionLabel="Write First Entry" onAction={()=>setTab("write")}/>
            :entries.map((e,i)=>(
              <div key={e.ts||i} className="glass" style={{padding:"18px 20px",borderRadius:16}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                  <div style={{display:"flex",gap:9,alignItems:"center"}}>
                    <span style={{fontSize:18}}>{MOODS.find(m=>m[1]===e.mood)?.[0]||"📝"}</span>
                    <span style={{fontSize:13,fontWeight:600,color:"#F0C4CC"}}>{e.mood||"Reflection"}</span>
                  </div>
                  <span style={{fontSize:11,color:"#6B4455"}}>{e.date}</span>
                </div>
                <div style={{display:"flex",gap:9,marginBottom:e.note?10:0}}>
                  <span className="tag">Confidence {e.confidence}/10</span>
                  <span className="tag">Energy {e.energy}/10</span>
                </div>
                {e.note&&<p style={{fontSize:13,color:"#9A6677",lineHeight:1.65}}>{e.note}</p>}
                {e.gratitude&&<p style={{fontSize:12,color:"#D4879A",marginTop:8,fontStyle:"italic"}}>{e.gratitude}</p>}
              </div>
            ))}
        </div>
      )}
      {tab==="insights"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {entries.length<3
            ?<EmptyState avatarState="analysis" title="Not enough data yet" message="Write at least 3 journal entries to unlock your emotional insights and confidence trends." actionLabel="Write an Entry" onAction={()=>setTab("write")}/>
            :<>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:4}}>
                {[["Total Entries",entries.length,"#F0C4CC"],["Avg Confidence",`${avgConf}/10`,"#D4879A"],["Streak Days",calcStreak(),"#A8E6C9"]].map(([l,v,c])=>(
                  <div key={l} className="glass" style={{padding:"16px",borderRadius:16,textAlign:"center"}}>
                    <div style={{fontSize:22,fontWeight:700,color:c,marginBottom:4}}>{v}</div>
                    <div style={{fontSize:11,color:"#6B4455"}}>{l}</div>
                  </div>
                ))}
              </div>
              <div className="glass" style={{padding:22,borderRadius:20}}>
                <h3 style={{fontSize:14,fontWeight:600,marginBottom:14}}>Confidence Trend</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={entries.slice(0,14).reverse().map((e,i)=>({day:`D${i+1}`,confidence:e.confidence,energy:e.energy}))}>
                    <defs><linearGradient id="jg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#D4879A" stopOpacity={0.28}/><stop offset="95%" stopColor="#D4879A" stopOpacity={0}/></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(181,92,121,.1)"/>
                    <XAxis dataKey="day" tick={{fill:"#9A6677",fontSize:9}} axisLine={false} tickLine={false}/>
                    <YAxis domain={[0,10]} tick={{fill:"#9A6677",fontSize:9}} axisLine={false} tickLine={false}/>
                    <Tooltip contentStyle={{background:"#2E0E1F",border:"1px solid rgba(181,92,121,.2)",borderRadius:9,color:"#F5E6EA",fontSize:11}}/>
                    <Area type="monotone" dataKey="confidence" stroke="#D4879A" fill="url(#jg)" strokeWidth={2} name="Confidence"/>
                    <Line type="monotone" dataKey="energy" stroke="#A8E6C9" strokeWidth={2} dot={false} name="Energy"/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <SmiraMsg state={avgConf>=7?"happy":"encouragement"} text={`You've journaled ${entries.length} times. Average confidence: ${avgConf}/10. ${avgConf>=7?"Your self-awareness is growing beautifully — keep reflecting.":"Remember, tracking how you feel is already an act of self-care. You're doing something most people never do."}`} size={44}/>
            </>}
        </div>
      )}
    </div>
  );
};

const USAGE_BY_CATEGORY={
  cleanser:"Use morning and night on damp skin. Massage gently for 30-60 seconds, then rinse with lukewarm water.",
  serum:"Apply 2-3 drops to clean, dry skin before moisturizer. Start every-other-day if it contains actives (Vitamin C, acids), then build up as tolerated.",
  moisturizer:"Apply as the last hydrating step, morning and night, after serums. A pea-sized amount is usually enough for the full face.",
  sunscreen:"Apply generously as the final morning step, at least 15 minutes before sun exposure. Reapply every 2-3 hours if outdoors.",
  toner:"Pat onto clean skin with hands or a cotton pad, right after cleansing and before serum.",
};

const Products=({results})=>{
  const [cat,setCat]=useState("cleanser");
  const [budget,setBudget]=useState("All");
  const [search,setSearch]=useState("");
  const skinType=results?.skinType||"Combination";
  const concerns=results?.concerns?.map(c=>c.name)||[];
  const tierColor={Budget:"#A8E6C9",Mid:"#F5D5A3",Premium:"#D4879A",Luxury:"#F0C4CC"};
  const cats=["cleanser","serum","moisturizer","sunscreen","toner"];
  const relevance=(p)=>p.for.reduce((n,x)=>n+(concerns.includes(x)?2:x===skinType?1:0),0);
  const filter=(prods)=>{
    let f=budget==="All"?prods:prods.filter(p=>p.tier===budget);
    if(concerns.length>0)f=f.filter(p=>p.for.includes("All")||p.for.some(x=>concerns.includes(x)||x===skinType));
    if(search.trim()){
      const q=search.trim().toLowerCase();
      f=f.filter(p=>p.name.toLowerCase().includes(q)||p.brand.toLowerCase().includes(q)||p.ing.some(i=>i.toLowerCase().includes(q)));
    }
    return[...f].sort((a,b)=>relevance(b)-relevance(a));
  };
  const prods=filter(ALL_PRODUCTS[cat]||[]);
  return(
    <div style={{padding:"24px 22px",maxWidth:960,margin:"0 auto"}}>
      <h1 className="cf" style={{fontSize:32,marginBottom:14,fontWeight:400}}>Product Recommendations</h1>
      <div style={{marginBottom:20}}><SmiraMsg state="coach" text={`These products were curated for your ${skinType} skin. I've included options across every budget — great skin doesn't require expensive products, just the right ones.`} size={44}/></div>
      {!results&&<div style={{background:"rgba(181,92,121,.1)",border:"1px solid rgba(181,92,121,.2)",borderRadius:14,padding:"12px 16px",marginBottom:18,display:"flex",gap:10,alignItems:"center"}}><Ic n="alert" s={15} c="#D4879A"/><p style={{fontSize:13,color:"#D4879A"}}>Complete a skin analysis to get recommendations tailored to your specific skin type and concerns.</p></div>}
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by ingredient or product name..." style={{width:"100%",padding:"10px 14px",borderRadius:12,border:"1px solid rgba(181,92,121,.25)",background:"rgba(255,255,255,.03)",color:"#F0C4CC",fontSize:13,fontFamily:"DM Sans,sans-serif",marginBottom:14,boxSizing:"border-box"}}/>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        {cats.map(c=><button key={c} onClick={()=>setCat(c)} style={{padding:"9px 20px",borderRadius:24,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,textTransform:"capitalize",background:cat===c?"linear-gradient(135deg,#8B3A57,#D4879A)":"rgba(181,92,121,.1)",color:cat===c?"#fff":"#D4879A",transition:"all .2s"}}>{c}</button>)}
      </div>
      <div style={{display:"flex",gap:6,marginBottom:22,flexWrap:"wrap"}}>
        {["All","Budget","Mid","Premium","Luxury"].map(b=><button key={b} onClick={()=>setBudget(b)} style={{padding:"6px 14px",borderRadius:20,border:`1px solid ${budget===b?"#D4879A":"rgba(181,92,121,.2)"}`,background:budget===b?"rgba(181,92,121,.18)":"transparent",color:budget===b?"#D4879A":"#9A6677",cursor:"pointer",fontSize:12,fontWeight:500,transition:"all .2s"}}>{b}</button>)}
      </div>
      {prods.length===0
        ?<EmptyState avatarState="coach" title="No products found" message="Try a different budget filter, search term, or skin category to discover the right products for you." actionLabel="Show All Budgets" onAction={()=>{setBudget("All");setSearch("");}}/>
        :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:16}}>
          {prods.map(p=>(
            <div key={p.name} className="glass glow" style={{padding:18,borderRadius:18,display:"flex",flexDirection:"column",gap:11}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{width:44,height:44,borderRadius:12,background:"rgba(181,92,121,.14)",display:"flex",alignItems:"center",justifyContent:"center"}}><Ic n="bag" s={20} c="#D4879A"/></div>
                <span style={{background:`${tierColor[p.tier]||"#F5D5A3"}22`,color:tierColor[p.tier],padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600,border:`1px solid ${tierColor[p.tier]||"#F5D5A3"}35`}}>{p.tier}</span>
              </div>
              <div>
                <div style={{fontSize:14,fontWeight:600}}>{p.name}</div>
                <div style={{fontSize:12,color:"#9A6677",marginTop:2}}>{p.brand}</div>
              </div>
              <div style={{fontSize:11,color:"#6B4455"}}>Suitable for: {p.for.join(", ")}</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{p.ing.map(i=><span key={i} className="tag" style={{fontSize:10}}>{i}</span>)}</div>
              {p.why&&<div style={{padding:"9px 12px",background:"rgba(181,92,121,.08)",borderRadius:10,border:"1px solid rgba(181,92,121,.15)"}}><p style={{fontSize:12,color:"#D4879A",lineHeight:1.6,fontStyle:"italic"}}>{p.why}</p></div>}
              <p style={{fontSize:12,color:"#F0C4CC",lineHeight:1.6}}>{p.benefit}</p>
              {USAGE_BY_CATEGORY[cat]&&<p style={{fontSize:11,color:"#9A6677",lineHeight:1.55}}><b style={{color:"#7EC8E3"}}>How to use: </b>{USAGE_BY_CATEGORY[cat]}</p>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:"auto"}}>
                <span style={{fontSize:18,fontWeight:700,color:"#D4879A"}}>{p.price}</span>
                <div style={{display:"flex",gap:3,alignItems:"center"}}><Ic n="star" s={12} c="#F5D5A3"/><span style={{fontSize:12,fontWeight:600,color:"#F5D5A3"}}>{p.rating}</span></div>
              </div>
            </div>
          ))}
        </div>}
    </div>
  );
};

const Nutrition=({user,results})=>{
  const [water,setWater]=useState(()=>LS.get("water_today",0));
  useEffect(()=>{LS.set("water_today",water);},[water]);
  const [dietType,setDietType]=useState(()=>LS.get("diet_pref_type",user?.diet==="Non-Vegetarian"?"Non-Vegetarian":"Vegetarian"));
  const [budget,setBudget]=useState(()=>LS.get("diet_pref_budget","Medium"));
  const [plan,setPlan]=useState(()=>LS.get("diet_plan",null));
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");

  const generate=async()=>{
    setLoading(true);setErr("");
    LS.set("diet_pref_type",dietType);LS.set("diet_pref_budget",budget);
    try{
      const p=await generateDietPlan(user,results,dietType,budget);
      setPlan(p);LS.set("diet_plan",{...p,_type:dietType,_budget:budget,_ts:Date.now()});
    }catch(e){setErr(friendlyAIError(e));}
    finally{setLoading(false);}
  };

  return(
    <div style={{padding:"24px 22px",maxWidth:820,margin:"0 auto"}}>
      <h1 className="cf" style={{fontSize:32,marginBottom:14,fontWeight:400}}>Nutrition & Hydration</h1>
      <div style={{marginBottom:20}}><SmiraMsg state="morning" text="What you eat today shows on your face in 24–72 hours. Food is your skin's most powerful foundation. Let's make choices that nourish you from the inside out." size={44}/></div>
      <div className="glass" style={{padding:22,borderRadius:20,marginBottom:20}}>
        <h3 style={{fontSize:14,fontWeight:600,marginBottom:14,display:"flex",alignItems:"center",gap:8}}><Ic n="leaf" s={16} c="#7EC8E3"/>Water Intake</h3>
        <div style={{display:"flex",flexWrap:"wrap",gap:9,marginBottom:12}}>
          {Array.from({length:8},(_,i)=>(
            <div key={i} role="button" aria-label={`Set water intake to ${i+1} glasses`} tabIndex={0} className="kb-focusable" onClick={()=>{setWater(i+1);recordActivity("hydration");}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setWater(i+1);recordActivity("hydration");}}} style={{width:46,height:46,borderRadius:13,background:i<water?"linear-gradient(135deg,#7EC8E3,#4AAFCC)":"rgba(126,200,227,.1)",border:`1px solid ${i<water?"#7EC8E3":"rgba(126,200,227,.2)"}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",transition:"all .2s",fontSize:20}}>
              {i<water?"💧":"○"}
            </div>
          ))}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#9A6677"}}>
          <span>{water} of 8 glasses today</span>
          <span style={{color:water>=8?"#A8E6C9":water>=6?"#F5D5A3":"#F5A3A3",fontWeight:600}}>{water>=8?"Goal reached!":water>=6?"Almost there!":"Keep drinking!"}</span>
        </div>
      </div>

      <div className="glass" style={{padding:22,borderRadius:20,marginBottom:20}}>
        <h3 style={{fontSize:14,fontWeight:600,marginBottom:14}}>Your Personalized Diet Plan</h3>
        <div style={{display:"flex",gap:16,marginBottom:16,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:150}}>
            <div style={{fontSize:11,color:"#9A6677",marginBottom:6}}>Diet Type</div>
            <div style={{display:"flex",gap:6}}>
              {["Vegetarian","Non-Vegetarian"].map(d=>(
                <button key={d} onClick={()=>setDietType(d)} style={{flex:1,padding:"8px 10px",borderRadius:10,border:`1px solid ${dietType===d?"#D4879A":"rgba(181,92,121,.2)"}`,background:dietType===d?"rgba(181,92,121,.15)":"transparent",color:dietType===d?"#D4879A":"#9A6677",fontSize:11,fontWeight:600,cursor:"pointer"}}>{d==="Vegetarian"?"Veg":"Non-Veg"}</button>
              ))}
            </div>
          </div>
          <div style={{flex:1,minWidth:150}}>
            <div style={{fontSize:11,color:"#9A6677",marginBottom:6}}>Budget</div>
            <div style={{display:"flex",gap:6}}>
              {["Low","Medium","Premium"].map(b=>(
                <button key={b} onClick={()=>setBudget(b)} style={{flex:1,padding:"8px 6px",borderRadius:10,border:`1px solid ${budget===b?"#D4879A":"rgba(181,92,121,.2)"}`,background:budget===b?"rgba(181,92,121,.15)":"transparent",color:budget===b?"#D4879A":"#9A6677",fontSize:11,fontWeight:600,cursor:"pointer"}}>{b}</button>
              ))}
            </div>
          </div>
        </div>
        {err&&<ErrorBox message={err} onRetry={generate}/>}
        <button className="btn" onClick={generate} disabled={loading} style={{width:"100%"}}>{loading?"Creating your plan...":plan?"Regenerate Plan":"Generate My Diet Plan"}</button>
        {!results&&<p style={{fontSize:11,color:"#6B4455",marginTop:10,textAlign:"center"}}>Tip: complete a skin scan first so this plan can target your actual concerns.</p>}
      </div>
      {loading&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}} className="r-col">
          <SkeletonCard/><SkeletonCard/><SkeletonCard/><SkeletonCard/>
        </div>
      )}

      {plan&&(
        <>
          <div className="glass" style={{padding:"18px 20px",borderRadius:16,marginBottom:18}}>
            <p style={{fontSize:13,color:"#F0C4CC",lineHeight:1.7,fontStyle:"italic"}}>{plan.summary}</p>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:18}} className="r-col">
            {[["Breakfast",plan.meals?.breakfast,"#F0C4CC"],["Lunch",plan.meals?.lunch,"#D4879A"],["Dinner",plan.meals?.dinner,"#A8E6C9"],["Snacks",plan.meals?.snacks,"#F5D5A3"],["Drinks",plan.meals?.drinks,"#7EC8E3"]].map(([label,items,color])=>items?.length>0&&(
              <div key={label} className="glass" style={{padding:"16px 18px",borderRadius:16,borderLeft:`3px solid ${color}`}}>
                <div style={{fontSize:11,color,fontWeight:600,marginBottom:10,textTransform:"uppercase",letterSpacing:".06em"}}>{label}</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {items.map((it,i)=>(
                    <div key={i}>
                      <div style={{fontSize:13,color:"#F0C4CC",fontWeight:600}}>{it.food}</div>
                      <div style={{fontSize:11,color:"#9A6677",lineHeight:1.5,marginTop:2}}>{it.reason}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {plan.avoid?.length>0&&(
            <div className="glass" style={{padding:20,borderRadius:18,marginBottom:18,border:"1px solid rgba(245,163,163,.2)"}}>
              <h3 style={{fontSize:13,fontWeight:600,marginBottom:12,color:"#F5A3A3"}}>Foods to Limit</h3>
              <div style={{display:"flex",flexDirection:"column",gap:9}}>
                {plan.avoid.map((a,i)=>(
                  <div key={i}><span style={{fontSize:13,color:"#F0C4CC",fontWeight:600}}>{a.food}</span><span style={{fontSize:12,color:"#9A6677"}}> — {a.reason}</span></div>
                ))}
              </div>
            </div>
          )}
          {plan.keyNutrients?.length>0&&(
            <div className="glass" style={{padding:20,borderRadius:18,marginBottom:18}}>
              <h3 style={{fontSize:13,fontWeight:600,marginBottom:12}}>Key Nutrients For You</h3>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {plan.keyNutrients.map((n,i)=>(
                  <div key={i}>
                    <div style={{fontSize:13,color:"#D4879A",fontWeight:600}}>{n.nutrient}</div>
                    <div style={{fontSize:12,color:"#9A6677",lineHeight:1.55}}>{n.why} <span style={{color:"#6B4455"}}>Sources: {n.sources}</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {results?.triggers?.length>0&&(
        <div className="glass" style={{padding:22,borderRadius:20}}>
          <h3 style={{fontSize:14,fontWeight:600,marginBottom:14}}>Your Food-Skin Correlations</h3>
          {results.triggers.map(t=>(
            <div key={t.food} style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}><span style={{color:"#F0C4CC"}}>{t.food}</span><span style={{color:"#D4879A",fontWeight:600}}>{t.correlation}% correlation</span></div>
              <ConfBar pct={t.correlation} color="#D4879A"/>
              <p style={{fontSize:12,color:"#9A6677",marginTop:5,lineHeight:1.55}}>{t.insight}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Challenges=()=>{
  const [joined,setJoined]=useState(()=>LS.get("challenges_joined",[]));
  const [progress,setProgress]=useState(()=>LS.get("challenges_progress",{}));
  const [celebrated,setCelebrated]=useState(null);
  const CHALLENGES=[
    {id:"hydration7",icon:"leaf",title:"7-Day Hydration",desc:"Drink 8 glasses of water every day for 7 days.",duration:7,reward:"Hydration Hero"},
    {id:"glow30",icon:"spark",title:"30-Day Glow",desc:"Complete your morning and night routine every day for 30 days.",duration:30,reward:"Glow Master"},
    {id:"sleep14",icon:"cycle",title:"14-Day Better Sleep",desc:"Sleep by 11 PM for 14 consecutive nights to support skin repair.",duration:14,reward:"Rest Royalty"},
    {id:"journal21",icon:"book",title:"21-Day Journal",desc:"Write one journal entry every day for 21 days.",duration:21,reward:"Reflection Champion"},
    {id:"nosugar7",icon:"heart",title:"7-Day Sugar Detox",desc:"Avoid refined sugar for 7 days and track how your skin responds.",duration:7,reward:"Clear Skin Warrior"},
    {id:"selfcare7",icon:"heart",title:"7-Day Self-Care",desc:"Do one intentional self-care act every day for 7 consecutive days.",duration:7,reward:"Self-Love Champion"},
  ];
  const join=id=>{const n=joined.includes(id)?joined.filter(j=>j!==id):[...joined,id];setJoined(n);LS.set("challenges_joined",n);};
  const tick=id=>{
    const ch=CHALLENGES.find(c=>c.id===id);
    const newProg=Math.min((progress[id]||0)+1,ch.duration);
    const n={...progress,[id]:newProg};
    setProgress(n);LS.set("challenges_progress",n);
    recordActivity("challenge");
    if(newProg===ch.duration)setCelebrated(ch);
  };
  const completedAny=CHALLENGES.some(c=>(progress[c.id]||0)>=c.duration&&joined.includes(c.id));
  return(
    <div style={{padding:"24px 22px",maxWidth:800,margin:"0 auto"}}>
      <h1 className="cf" style={{fontSize:32,marginBottom:14,fontWeight:400}}>Challenges</h1>
      <div style={{marginBottom:20}}><SmiraMsg state={completedAny?"achievement":"coach"} text={completedAny?"You've completed a challenge — I'm so proud of you. Every milestone you hit is proof of how far you've come.":"Personal challenges to build confidence and healthy habits. These are just for you — no competition, no pressure. Just growth."} size={46}/></div>
      {celebrated&&(
        <div style={{padding:"22px 26px",background:"linear-gradient(135deg,rgba(168,230,201,.2),rgba(74,21,48,.4))",border:"1px solid rgba(168,230,201,.35)",borderRadius:20,marginBottom:20,display:"flex",gap:14,alignItems:"center"}}>
          <div style={{width:80,height:96,borderRadius:16,overflow:"hidden",flexShrink:0}}><SmiraAvatar state="achievement" portrait size={96}/></div>
          <div>
            <div style={{fontSize:11,color:"#A8E6C9",fontWeight:600,textTransform:"uppercase",letterSpacing:".07em",marginBottom:5}}>Challenge Complete!</div>
            <h3 className="cf" style={{fontSize:22,fontWeight:400,marginBottom:5}}>You earned: {celebrated.reward}</h3>
            <p style={{fontSize:13,color:"#F0C4CC",lineHeight:1.65}}>Completing the {celebrated.title} challenge shows real dedication to your wellbeing. I'm genuinely proud of you.</p>
            <button onClick={()=>setCelebrated(null)} className="btn-o" style={{marginTop:10,fontSize:12,padding:"6px 16px"}}>Continue</button>
          </div>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(290px,1fr))",gap:16}}>
        {CHALLENGES.map(c=>{
          const isJoined=joined.includes(c.id),prog=progress[c.id]||0,done=prog>=c.duration,pct=(prog/c.duration)*100;
          return(
            <div key={c.id} className="challenge-card" style={{position:"relative"}}>
              {done&&<div style={{position:"absolute",top:12,right:12,background:"linear-gradient(135deg,#A8E6C9,#68C99A)",borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700,color:"#0A2A1A"}}>Complete</div>}
              <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:14}}>
                <div style={{width:42,height:42,borderRadius:12,background:"rgba(181,92,121,.2)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Ic n={c.icon} s={20} c="#D4879A"/></div>
                <div><div style={{fontSize:15,fontWeight:600,color:"#F0C4CC",marginBottom:4}}>{c.title}</div><div style={{fontSize:12,color:"#9A6677",lineHeight:1.6}}>{c.desc}</div></div>
              </div>
              <div style={{marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#9A6677",marginBottom:6}}>
                  <span>{prog} / {c.duration} days</span>
                  <span style={{color:"#D4879A",fontWeight:600,display:"flex",alignItems:"center",gap:4}}><Ic n="trophy" s={11} c="#D4879A"/>{c.reward}</span>
                </div>
                <ConfBar pct={pct} color={done?"#A8E6C9":"#D4879A"}/>
              </div>
              <div style={{display:"flex",gap:9}}>
                <button className={isJoined?"btn":"btn-o"} onClick={()=>join(c.id)} style={{flex:1,fontSize:12,padding:"9px 14px"}}>{isJoined?(done?"Completed":"Joined"):"Join Challenge"}</button>
                {isJoined&&!done&&<button className="btn-o" onClick={()=>tick(c.id)} style={{fontSize:12,padding:"9px 14px"}}>+1 Day</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Analytics=({scans})=>{
  const [tab,setTab]=useState("weekly");
  if(!scans?.length)return<EmptyState avatarState="analysis" title="No scan data yet" message="Complete your first skin scan to start seeing trends, charts, and insights over time." actionLabel="Start Your First Scan" onAction={null}/>;
  const progress=computeProgress(scans);
  const recentSeries=progress.series.slice(-7);
  return(
    <div style={{padding:"24px 22px",maxWidth:900,margin:"0 auto"}}>
      <h1 className="cf" style={{fontSize:32,marginBottom:5,fontWeight:400}}>Your Analytics</h1>
      <p style={{color:"#9A6677",fontSize:13,marginBottom:20}}>Track how your skin and wellness evolve over time.</p>
      <div style={{display:"flex",gap:5,marginBottom:22}}>
        {[["weekly","Recent Scans"],["monthly","All Scans"],["habits","Habit Insights"]].map(([t,l])=>(
          <button key={t} className={`tab-btn${tab===t?" act":""}`} onClick={()=>setTab(t)}>{l}</button>
        ))}
      </div>
      {tab==="weekly"&&(
        <div style={{display:"flex",flexDirection:"column",gap:18}}>
          <div className="glass" style={{padding:22,borderRadius:20}}>
            <h3 style={{fontSize:14,fontWeight:600,marginBottom:14}}>Skin Health Trends</h3>
            <p style={{fontSize:11,color:"#6B4455",marginBottom:10}}>Your last {recentSeries.length} scan{recentSeries.length===1?"":"s"}</p>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={recentSeries}><defs>
                <linearGradient id="ag1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#7EC8E3" stopOpacity={0.25}/><stop offset="95%" stopColor="#7EC8E3" stopOpacity={0}/></linearGradient>
                <linearGradient id="ag2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#D4879A" stopOpacity={0.25}/><stop offset="95%" stopColor="#D4879A" stopOpacity={0}/></linearGradient>
              </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(181,92,121,.1)"/><XAxis dataKey="date" tick={{fill:"#9A6677",fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"#9A6677",fontSize:10}} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={{background:"#2E0E1F",border:"1px solid rgba(181,92,121,.2)",borderRadius:9,color:"#F5E6EA",fontSize:11}}/>
                <Area type="monotone" dataKey="hydrationLevel" stroke="#7EC8E3" fill="url(#ag1)" strokeWidth={2} name="Hydration"/>
                <Area type="monotone" dataKey="brightness" stroke="#D4879A" fill="url(#ag2)" strokeWidth={2} name="Brightness"/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="glass" style={{padding:22,borderRadius:20}}>
            <h3 style={{fontSize:14,fontWeight:600,marginBottom:14}}>Overall Skin Score Trend</h3>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={recentSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(181,92,121,.1)"/>
                <XAxis dataKey="date" tick={{fill:"#9A6677",fontSize:10}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:"#9A6677",fontSize:10}} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={{background:"#2E0E1F",border:"1px solid rgba(181,92,121,.2)",borderRadius:9,color:"#F5E6EA",fontSize:11}}/>
                <Line type="monotone" dataKey="overallScore" stroke="#D4879A" strokeWidth={2.5} dot={{fill:"#D4879A",r:3}} name="Overall Score"/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {tab==="monthly"&&(
        <div className="glass" style={{padding:22,borderRadius:20}}>
          <h3 style={{fontSize:14,fontWeight:600,marginBottom:14}}>All-Time Score Progress</h3>
          <p style={{fontSize:11,color:"#6B4455",marginBottom:10}}>Every scan you've completed, oldest to newest</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={progress.series}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(181,92,121,.1)"/>
              <XAxis dataKey="date" tick={{fill:"#9A6677",fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:"#9A6677",fontSize:11}} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{background:"#2E0E1F",border:"1px solid rgba(181,92,121,.2)",borderRadius:9,color:"#F5E6EA",fontSize:11}}/>
              <Bar dataKey="overallScore" fill="rgba(181,92,121,.5)" radius={[6,6,0,0]} name="Skin Score"/>
              <Bar dataKey="hydrationLevel" fill="rgba(212,135,154,.4)" radius={[6,6,0,0]} name="Hydration"/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {tab==="habits"&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <SmiraMsg state="coach" text="Your most consistent habits create the most visible results. Here's how your daily actions are adding up over time." size={44}/>
          {DEFAULT_HABITS.map(h=>(
            <div key={h.id} className="glass" style={{padding:"16px 20px",borderRadius:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",gap:12,alignItems:"center"}}>
                <div style={{width:38,height:38,borderRadius:10,background:"rgba(181,92,121,.18)",display:"flex",alignItems:"center",justifyContent:"center"}}><Ic n={h.icon} s={18} c="#D4879A"/></div>
                <span style={{fontSize:13,color:"#F0C4CC"}}>{h.label}</span>
              </div>
              <div style={{width:80}}><ConfBar pct={Math.random()*40+55} color="#D4879A"/></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Journey=({scans})=>{
  if(!scans?.length)return<EmptyState avatarState="welcome" title="Your journey starts now" message="Each skin scan becomes a milestone in your glow journey. Complete your first scan to begin tracking your transformation." actionLabel="Start First Scan" onAction={null}/>;
  return(
    <div style={{padding:"24px 22px",maxWidth:800,margin:"0 auto"}}>
      <h1 className="cf" style={{fontSize:32,marginBottom:14,fontWeight:400}}>Your Glow Journey</h1>
      <SmiraMsg state="happy" text={`You've completed ${scans.length} skin scan${scans.length!==1?"s":""} — each one is a milestone in your journey. Look how far you've come.`} size={44}/>
      <div style={{marginTop:20,display:"flex",flexDirection:"column",gap:0}}>
        {scans.map((s,i)=>(
          <div key={i} style={{display:"flex",gap:16,alignItems:"flex-start"}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,#8B3A57,#D4879A)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff",fontSize:13,fontWeight:700}}>{i+1}</div>
              {i<scans.length-1&&<div style={{width:2,height:40,background:"rgba(181,92,121,.2)",margin:"4px 0"}}/>}
            </div>
            <div className="glass" style={{flex:1,padding:"16px 18px",borderRadius:16,marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <div style={{fontSize:14,fontWeight:600,color:"#F0C4CC"}}>{s.date}</div>
                <div style={{fontSize:20,fontWeight:700,color:"#D4879A"}}>{s.overallScore}</div>
              </div>
              {s.thumb&&<img src={s.thumb} alt="scan" style={{width:80,height:80,objectFit:"cover",borderRadius:10,marginBottom:8}}/>}
              <p style={{fontSize:12,color:"#9A6677",lineHeight:1.6}}>{s.summary||"Skin analysis completed. Check your results for personalized insights."}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const MonthlyStory=({user,scans,habits,journalEntries})=>{
  const month=new Date().toLocaleDateString("en-IN",{month:"long",year:"numeric"});
  const firstName=user?.name?.split(" ")[0]||"Beautiful";
  const habitDone=habits?.filter(h=>h.done).length||0;
  const confScore=calcConfidenceScore(habits,6,journalEntries,scans);
  const highlights=[
    {icon:"chart",label:"Skin scans completed",value:scans?.length||0,color:"#D4879A"},
    {icon:"heart",label:"Confidence Score",value:`${confScore}/100`,color:confColor(confScore)},
    {icon:"book",label:"Journal entries",value:journalEntries?.length||0,color:"#F0C4CC"},
    {icon:"ok",label:"Habits completed today",value:`${habitDone}/${habits?.length||6}`,color:"#A8E6C9"},
  ];
  return(
    <div style={{padding:"24px 22px",maxWidth:640,margin:"0 auto"}}>
      <div style={{marginBottom:28,textAlign:"center"}}>
        <div style={{width:140,height:168,margin:"0 auto 18px",borderRadius:24,overflow:"hidden",border:"2px solid rgba(212,135,154,.3)",boxShadow:"0 16px 48px rgba(0,0,0,.4)"}}>
          <SmiraAvatar state="achievement" portrait size={168}/>
        </div>
        <span className="cf" style={{fontSize:"clamp(28px,5vw,44px)",fontWeight:300,background:"linear-gradient(135deg,#F0C4CC,#D4879A)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",display:"block",marginBottom:8}}>Your Smira Story</span>
        <p style={{color:"#D4879A",fontSize:15,fontWeight:500}}>{month}</p>
      </div>
      <div className="glass glow" style={{padding:28,borderRadius:26,marginBottom:18,background:"linear-gradient(135deg,rgba(139,58,87,.25),rgba(46,14,31,.6))"}}>
        <h2 className="cf" style={{fontSize:22,fontWeight:400,marginBottom:18,textAlign:"center",color:"#F0C4CC"}}>{firstName}'s Highlights</h2>
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          {highlights.map(h=>(
            <div key={h.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",background:"rgba(181,92,121,.1)",borderRadius:14}}>
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <div style={{width:28,height:28,borderRadius:8,background:"rgba(181,92,121,.2)",display:"flex",alignItems:"center",justifyContent:"center"}}><Ic n={h.icon} s={14} c={h.color}/></div>
                <span style={{fontSize:13,color:"#F0C4CC"}}>{h.label}</span>
              </div>
              <span style={{fontSize:16,fontWeight:700,color:h.color}}>{h.value}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="glass" style={{padding:"22px 24px",borderRadius:20,marginBottom:16}}>
        <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
          <SmiraAvatar state="happy" size={50}/>
          <div>
            <div style={{fontSize:10,color:"#D4879A",fontWeight:600,marginBottom:7,textTransform:"uppercase",letterSpacing:".07em"}}>Monthly Message from Smira</div>
            <p style={{fontSize:14,color:"#F0C4CC",lineHeight:1.85,fontStyle:"italic"}}>
              "This month you showed up for yourself. Not every day was perfect — and that's okay. What matters is that you're building habits with intention, learning about your body, and choosing self-care over self-criticism. That's real progress, {firstName}. I'm proud of you."
            </p>
          </div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:13}}>
        <button className="btn" style={{display:"flex",alignItems:"center",gap:8,justifyContent:"center",fontSize:13}}><Ic n="share" s={15}/>Share Story</button>
        <button className="btn-o" style={{display:"flex",alignItems:"center",gap:8,justifyContent:"center",fontSize:13}}><Ic n="dl" s={15}/>Save Story</button>
      </div>
    </div>
  );
};

const MenstrualTracker=({scans,journalEntries})=>{
  const [cycles,setCycles]=useState(()=>LS.get("menstrual_cycles",[]));
  const [showLog,setShowLog]=useState(false);
  const [logDate,setLogDate]=useState(()=>new Date().toISOString().slice(0,10));
  const PHASES=[{id:"menstrual",label:"Menstrual",desc:"Skin may be more sensitive. Gentle cleanse, skip actives, extra hydration.",color:"#F5A3A3"},{id:"follicular",label:"Follicular",desc:"Estrogen rises — skin looks brighter. Great time to introduce new products.",color:"#F5D5A3"},{id:"ovulation",label:"Ovulation",desc:"Peak glow! Skin looks its best. Perfect for a scan or photos.",color:"#A8E6C9"},{id:"luteal",label:"Luteal",desc:"Progesterone rises — oil increases, breakouts more likely. Stick to your routine.",color:"#D4879A"}];

  const sorted=[...cycles].sort((a,b)=>new Date(a.date)-new Date(b.date));
  const gaps=sorted.slice(1).map((c,i)=>Math.round((new Date(c.date)-new Date(sorted[i].date))/86400000)).filter(g=>g>15&&g<60);
  const avgLen=gaps.length?Math.round(gaps.reduce((a,b)=>a+b,0)/gaps.length):28;
  const lastStart=sorted.length?new Date(sorted[sorted.length-1].date):null;
  const today=new Date();
  const dayInCycle=lastStart?Math.floor((today-lastStart)/86400000)%avgLen+1:null;
  const ovulationDay=avgLen-14;
  const fertileStart=Math.max(1,ovulationDay-5);
  const fertileEnd=ovulationDay+1;

  const phaseForDay=(d)=>{
    if(d==null)return null;
    if(d<=5)return"menstrual";
    if(d<ovulationDay-1)return"follicular";
    if(d<=ovulationDay+1)return"ovulation";
    return"luteal";
  };
  const currentPhase=phaseForDay(dayInCycle);
  const addDays=(date,n)=>{const d=new Date(date);d.setDate(d.getDate()+n);return d;};
  const fmtDate=(d)=>d.toLocaleDateString("en-IN",{day:"2-digit",month:"short"});
  const nextPeriod=lastStart?addDays(lastStart,avgLen):null;
  const nextOvulation=lastStart?addDays(lastStart,ovulationDay):null;

  /* Correlate real scan history with cycle phase — needs at least one
     logged cycle start date to map scan dates to a cycle day. */
  const phaseCorrelation=(()=>{
    if(!sorted.length||!scans?.length)return null;
    const buckets={menstrual:[],follicular:[],ovulation:[],luteal:[]};
    scans.forEach(s=>{
      if(!s.ts)return;
      const scanDate=new Date(s.ts);
      const priorStarts=sorted.filter(c=>new Date(c.date)<=scanDate);
      if(!priorStarts.length)return;
      const start=new Date(priorStarts[priorStarts.length-1].date);
      const d=Math.floor((scanDate-start)/86400000)%avgLen+1;
      const ph=phaseForDay(d);
      if(ph)buckets[ph].push(s.overallScore||0);
    });
    const out={};
    Object.entries(buckets).forEach(([k,v])=>{if(v.length)out[k]=Math.round(v.reduce((a,b)=>a+b,0)/v.length);});
    return Object.keys(out).length>=2?out:null;
  })();

  const logPeriod=()=>{
    const next=[...cycles,{date:logDate}].slice(-12);
    setCycles(next);LS.set("menstrual_cycles",next);
    setShowLog(false);
  };

  return(
    <div style={{padding:"24px 22px",maxWidth:700,margin:"0 auto"}}>
      <h1 className="cf" style={{fontSize:32,marginBottom:7,fontWeight:400}}>Cycle Tracker</h1>
      <p style={{color:"#9A6677",fontSize:13,marginBottom:20}}>Understanding your hormonal cycle helps you work with your skin, not against it.</p>
      <SmiraMsg state="empathy" text="Your skin changes with your cycle — that's completely normal and expected. Log your period start date and I'll predict your phases and connect them to your skin data." size={44}/>

      <div className="glass" style={{padding:"20px 22px",borderRadius:20,marginTop:20,marginBottom:18}}>
        {!lastStart?(
          <div style={{textAlign:"center",padding:"10px 0"}}>
            <p style={{fontSize:13,color:"#9A6677",marginBottom:14}}>Log your last period start date to begin predictions.</p>
            <button className="btn" onClick={()=>setShowLog(true)}>Log Period Start</button>
          </div>
        ):(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div>
                <div style={{fontSize:12,color:"#9A6677"}}>Cycle Day</div>
                <div style={{fontSize:28,fontWeight:700,color:"#D4879A"}}>{dayInCycle}<span style={{fontSize:14,color:"#9A6677"}}> / ~{avgLen}</span></div>
              </div>
              <button onClick={()=>setShowLog(true)} style={{padding:"9px 16px",borderRadius:20,border:"1px solid rgba(181,92,121,.3)",background:"transparent",color:"#D4879A",fontSize:12,fontWeight:600,cursor:"pointer"}}>+ Log Period</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div style={{padding:"12px 14px",background:"rgba(181,92,121,.08)",borderRadius:12}}>
                <div style={{fontSize:11,color:"#9A6677",marginBottom:4}}>Next Period (est.)</div>
                <div style={{fontSize:15,fontWeight:600,color:"#F0C4CC"}}>{fmtDate(nextPeriod)}</div>
              </div>
              <div style={{padding:"12px 14px",background:"rgba(168,230,201,.08)",borderRadius:12}}>
                <div style={{fontSize:11,color:"#9A6677",marginBottom:4}}>Fertile Window (est.)</div>
                <div style={{fontSize:15,fontWeight:600,color:"#F0C4CC"}}>{fmtDate(addDays(lastStart,fertileStart))} – {fmtDate(addDays(lastStart,fertileEnd))}</div>
              </div>
            </div>
            {gaps.length===0&&<p style={{fontSize:11,color:"#6B4455",marginTop:12}}>Using a default 28-day cycle — log 2+ periods for predictions based on your actual cycle length.</p>}
          </>
        )}
      </div>

      {showLog&&(
        <div className="glass" style={{padding:"18px 20px",borderRadius:16,marginBottom:18,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
          <input type="date" value={logDate} onChange={e=>setLogDate(e.target.value)} max={new Date().toISOString().slice(0,10)} style={{padding:"9px 12px",borderRadius:10,border:"1px solid rgba(181,92,121,.25)",background:"rgba(255,255,255,.03)",color:"#F0C4CC",fontSize:13,fontFamily:"DM Sans,sans-serif"}}/>
          <button className="btn" onClick={logPeriod} style={{padding:"9px 18px"}}>Save</button>
          <button onClick={()=>setShowLog(false)} style={{padding:"9px 14px",borderRadius:20,border:"none",background:"transparent",color:"#9A6677",cursor:"pointer",fontSize:13}}>Cancel</button>
        </div>
      )}

      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        {PHASES.map(p=><div key={p.id} style={{flex:1,minWidth:110,padding:"9px 10px",borderRadius:14,border:`1px solid ${currentPhase===p.id?p.color:"rgba(181,92,121,.2)"}`,background:currentPhase===p.id?`${p.color}22`:"rgba(255,255,255,.02)",color:currentPhase===p.id?p.color:"#9A6677",fontSize:12,fontWeight:600,textAlign:"center"}}>{p.label}{currentPhase===p.id&&" (now)"}</div>)}
      </div>
      {PHASES.filter(p=>p.id===(currentPhase||"follicular")).map(p=>(
        <div key={p.id} className="glass" style={{padding:"22px 24px",borderRadius:20,borderLeft:`3px solid ${p.color}`,marginBottom:18}}>
          <h3 style={{fontSize:18,fontWeight:600,color:p.color,marginBottom:10}}>{p.label} Phase</h3>
          <p style={{fontSize:14,color:"#F0C4CC",lineHeight:1.75}}>{p.desc}</p>
        </div>
      ))}

      {phaseCorrelation&&(
        <div className="glass" style={{padding:22,borderRadius:20}}>
          <h3 style={{fontSize:15,fontWeight:600,marginBottom:6}}>Your Skin & Cycle</h3>
          <p style={{fontSize:12,color:"#9A6677",marginBottom:14}}>Average skin score from your scans, grouped by the cycle phase they were taken in.</p>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {PHASES.filter(p=>phaseCorrelation[p.id]!==undefined).map(p=>(
              <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13,color:p.color}}>{p.label}</span>
                <span style={{fontSize:14,fontWeight:700,color:"#F0C4CC"}}>{phaseCorrelation[p.id]}</span>
              </div>
            ))}
          </div>
          <p style={{fontSize:11,color:"#6B4455",marginTop:12,lineHeight:1.6}}>Based on {scans.length} scan{scans.length===1?"":"s"} matched to logged cycle dates. More scans across more cycles will sharpen this pattern.</p>
        </div>
      )}
    </div>
  );
};

/* Open-Meteo is free and keyless — no signup, no API key, CORS-enabled for
   direct browser calls. Used for both live weather and city geocoding. */
const WEATHER_CODES={
  0:"Clear sky",1:"Mostly clear",2:"Partly cloudy",3:"Overcast",
  45:"Foggy",48:"Foggy",51:"Light drizzle",53:"Drizzle",55:"Heavy drizzle",
  61:"Light rain",63:"Rain",65:"Heavy rain",71:"Light snow",73:"Snow",75:"Heavy snow",
  80:"Rain showers",81:"Rain showers",82:"Violent showers",95:"Thunderstorm",96:"Thunderstorm",99:"Thunderstorm",
};

const fetchWeather=async(lat,lon)=>{
  const res=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,uv_index,wind_speed_10m,weather_code&timezone=auto`);
  if(!res.ok)throw new Error("Weather service unavailable right now.");
  const data=await res.json();
  let aqi=null;
  try{
    const aqRes=await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi`);
    if(aqRes.ok){const aq=await aqRes.json();aqi=aq?.current?.us_aqi??null;}
  }catch{/* air quality is a bonus, never block the main forecast on it */}
  return{
    temp:Math.round(data.current.temperature_2m),
    humidity:Math.round(data.current.relative_humidity_2m),
    uv:Math.round(data.current.uv_index),
    wind:Math.round(data.current.wind_speed_10m),
    condition:WEATHER_CODES[data.current.weather_code]||"Unknown",
    aqi,
  };
};

const geocodeCity=async(name)=>{
  const res=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1`);
  if(!res.ok)throw new Error("Could not look up that city.");
  const data=await res.json();
  const r=data?.results?.[0];
  if(!r)throw new Error("City not found. Try a different spelling.");
  return{lat:r.latitude,lon:r.longitude,label:`${r.name}, ${r.country}`};
};

/* Turns weather + skin profile into concrete, personalized guidance —
   this is the "Today's Skin Forecast" logic. */
const buildSkinWeatherAdvice=(w,{skinType,concerns=[]}={})=>{
  const tips=[];
  let spf="SPF 30+";
  if(w.uv>=8){spf="SPF 50+, reapply every 2 hours";tips.push("UV is very high today — seek shade when possible and wear sunglasses.");}
  else if(w.uv>=6){spf="SPF 50+";tips.push("Moderate-high UV — don't skip reapplication if you're outdoors midday.");}
  else if(w.uv>=3){spf="SPF 30+";}
  else{spf="SPF 15-30 (still don't skip it)";}

  let moisturizer="Balanced, medium-weight moisturizer";
  if(w.humidity>=70){moisturizer="Lightweight gel moisturizer — heavy creams may feel suffocating and worsen oiliness today";tips.push("High humidity — a rich cream may trap sweat and oil; go lighter than usual.");}
  else if(w.humidity<=35){moisturizer="Rich, occlusive moisturizer — layer a facial oil if skin feels tight";tips.push("Low humidity draws moisture out of skin — hydrate more than usual, inside and out.");}

  if(w.temp>=32){tips.push("High heat — carry blotting papers and drink more water than usual to support your skin barrier.");}
  if(w.temp<=15){tips.push("Cold air can strip moisture fast — don't skip a hydrating serum under your moisturizer.");}
  if(w.aqi!=null&&w.aqi>100){tips.push("Air quality is poor today — double-cleanse tonight and consider an antioxidant serum (Vitamin C) to counter pollution stress.");}
  if(concerns.includes("Acne")&&w.humidity>=65){tips.push("Humidity + acne-prone skin — resist touching your face; sweat can mix with oil and clog pores.");}
  if(skinType==="Dry"&&w.humidity<=40){tips.push("Dry skin type in low humidity is a tough combo — consider a humidifier indoors tonight.");}

  return{spf,moisturizer,tips:tips.slice(0,4)};
};

const SkinForecast=({user,results})=>{
  const [status,setStatus]=useState("idle"); // idle | locating | loading | ready | error | manual
  const [weather,setWeather]=useState(null);
  const [place,setPlace]=useState("");
  const [err,setErr]=useState("");
  const [cityInput,setCityInput]=useState("");

  const runForecast=async(lat,lon,label)=>{
    setStatus("loading");setErr("");
    try{
      const w=await fetchWeather(lat,lon);
      setWeather(w);setPlace(label);setStatus("ready");
    }catch(e){setErr(e.message||"Couldn't load the forecast. Please try again.");setStatus("error");}
  };

  const useMyLocation=()=>{
    if(!navigator.geolocation){setStatus("manual");return;}
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos)=>runForecast(pos.coords.latitude,pos.coords.longitude,"Your location"),
      ()=>setStatus("manual"),
      {timeout:8000}
    );
  };

  const submitCity=async()=>{
    if(!cityInput.trim())return;
    setStatus("loading");setErr("");
    try{
      const geo=await geocodeCity(cityInput.trim());
      await runForecast(geo.lat,geo.lon,geo.label);
    }catch(e){setErr(e.message);setStatus("manual");}
  };

  const advice=weather?buildSkinWeatherAdvice(weather,{skinType:results?.skinType,concerns:results?.concerns?.map(c=>c.name)||[]}):null;

  return(
    <div style={{padding:"24px 22px",maxWidth:700,margin:"0 auto"}}>
      <h1 className="cf" style={{fontSize:32,marginBottom:7,fontWeight:400}}>Today's Skin Forecast</h1>
      <p style={{color:"#9A6677",fontSize:13,marginBottom:20}}>Real-time weather, translated into what your skin actually needs today.</p>

      {status==="idle"&&(
        <div className="glass" style={{padding:"28px 24px",borderRadius:20,textAlign:"center"}}>
          <p style={{fontSize:13,color:"#9A6677",marginBottom:16,lineHeight:1.7}}>Share your location for a personalized forecast, or enter your city manually. Nothing is stored beyond this session.</p>
          <button className="btn" onClick={useMyLocation} style={{marginBottom:10}}>Use My Location</button>
          <div><button onClick={()=>setStatus("manual")} style={{background:"none",border:"none",color:"#9A6677",fontSize:12,textDecoration:"underline",cursor:"pointer"}}>Enter city manually instead</button></div>
        </div>
      )}
      {(status==="locating"||status==="loading")&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div className="glass" style={{padding:"20px 22px",borderRadius:20}}>
            <p style={{fontSize:12,color:"#9A6677",marginBottom:14}}>{status==="locating"?"Getting your location...":"Loading today's forecast..."}</p>
            <Skeleton rows={2} height={20}/>
          </div>
          <SkeletonCard/>
          <SkeletonCard/>
        </div>
      )}
      {status==="manual"&&(
        <div className="glass" style={{padding:"22px 24px",borderRadius:20}}>
          {err&&<p style={{fontSize:12,color:"#F5A3A3",marginBottom:12}}>{err}</p>}
          <p style={{fontSize:13,color:"#9A6677",marginBottom:12}}>Enter your city:</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <input value={cityInput} onChange={e=>setCityInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submitCity()} placeholder="e.g. Kolkata" style={{flex:1,minWidth:160,padding:"10px 14px",borderRadius:12,border:"1px solid rgba(181,92,121,.25)",background:"rgba(255,255,255,.03)",color:"#F0C4CC",fontSize:13,fontFamily:"DM Sans,sans-serif"}}/>
            <button className="btn" onClick={submitCity} style={{padding:"10px 20px"}}>Get Forecast</button>
          </div>
        </div>
      )}
      {status==="error"&&(
        <div className="glass" style={{padding:"22px 24px",borderRadius:20,textAlign:"center"}}>
          <p style={{fontSize:13,color:"#F5A3A3",marginBottom:14}}>{err}</p>
          <button className="btn" onClick={()=>setStatus("manual")}>Try a City Instead</button>
        </div>
      )}
      {status==="ready"&&weather&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div className="glass" style={{padding:"20px 22px",borderRadius:20,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
            <div>
              <div style={{fontSize:12,color:"#9A6677"}}>{place}</div>
              <div style={{fontSize:28,fontWeight:700,color:"#F0C4CC"}}>{weather.temp}°C</div>
              <div style={{fontSize:13,color:"#D4879A"}}>{weather.condition}</div>
            </div>
            <div style={{display:"flex",gap:16,fontSize:12,color:"#9A6677"}}>
              <div style={{textAlign:"center"}}><div style={{fontWeight:700,color:"#F0C4CC",fontSize:15}}>{weather.uv}</div>UV Index</div>
              <div style={{textAlign:"center"}}><div style={{fontWeight:700,color:"#F0C4CC",fontSize:15}}>{weather.humidity}%</div>Humidity</div>
              {weather.aqi!=null&&<div style={{textAlign:"center"}}><div style={{fontWeight:700,color:"#F0C4CC",fontSize:15}}>{weather.aqi}</div>AQI</div>}
            </div>
          </div>
          <div className="glass" style={{padding:"20px 22px",borderRadius:20}}>
            <h3 style={{fontSize:15,fontWeight:600,marginBottom:14}}>Today's Skincare Routine</h3>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div style={{display:"flex",gap:10,alignItems:"flex-start"}}><Ic n="forecast" s={17} c="#F5D5A3"/><div><div style={{fontSize:13,fontWeight:600,color:"#F0C4CC"}}>Sunscreen</div><div style={{fontSize:12,color:"#9A6677"}}>{advice.spf}</div></div></div>
              <div style={{display:"flex",gap:10,alignItems:"flex-start"}}><Ic n="leaf" s={17} c="#A8E6C9"/><div><div style={{fontSize:13,fontWeight:600,color:"#F0C4CC"}}>Moisturizer</div><div style={{fontSize:12,color:"#9A6677"}}>{advice.moisturizer}</div></div></div>
            </div>
          </div>
          {advice.tips.length>0&&(
            <div className="glass" style={{padding:"20px 22px",borderRadius:20}}>
              <h3 style={{fontSize:15,fontWeight:600,marginBottom:12}}>Personalized Tips</h3>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {advice.tips.map((t,i)=>(
                  <p key={i} style={{fontSize:12,color:"#F0C4CC",lineHeight:1.65,paddingLeft:14,borderLeft:"2px solid rgba(181,92,121,.3)"}}>{t}</p>
                ))}
              </div>
            </div>
          )}
          <button onClick={()=>setStatus("idle")} style={{background:"none",border:"none",color:"#9A6677",fontSize:12,textDecoration:"underline",cursor:"pointer",alignSelf:"center"}}>Check a different location</button>
        </div>
      )}
    </div>
  );
};

const AICoach=({user,results,scans,onClose,onMinimize})=>{
  const [msgs,setMsgs]=useState(()=>LS.get("coach_msgs",[{role:"assistant",text:`Hi${user?.name?" "+user.name.split(" ")[0]:""}! I'm Smira, your personal wellness companion. I can analyze your food choices, skincare routine, habits, or just be here to talk. What's on your mind today?`,ts:Date.now()}]));
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");
  const endRef=useRef(null);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);
  useEffect(()=>{LS.set("coach_msgs",msgs.slice(-40));},[msgs]);

  const send=async()=>{
    if(!input.trim()||loading)return;
    const userMsg={role:"user",text:input,ts:Date.now()};
    const newMsgs=[...msgs,userMsg];
    setMsgs(newMsgs);setInput("");setLoading(true);setErr("");
    try{
      const progress=computeProgress(scans);
      const trendCtx=progress.hasComparison
        ?`Trend across ${progress.scanCount} scans: overall score ${progress.overallScore.value>=0?"+":""}${progress.overallScore.value} since last scan (${progress.overallScore.sinceFirstPct>=0?"+":""}${progress.overallScore.sinceFirstPct}% since their first scan on ${progress.firstDate}), hydration ${progress.hydrationLevel.value>=0?"+":""}${progress.hydrationLevel.value}, brightness ${progress.brightness.value>=0?"+":""}${progress.brightness.value}.`
        :scans?.length===1?"They have one scan so far — no trend yet, but you can reference it.":"No scans yet.";
      const ctx=JSON.stringify({name:user?.name,age:user?.age,skinType:results?.skinType,concerns:results?.concerns?.map(c=>c.name),stress:user?.stress,sleep:user?.sleep,diet:user?.diet,pcos:user?.pcos,thyroid:user?.thyroid,latestScore:results?.overallScore});
      const recentAdvice=LS.get("coach_advice_log",[]);
      const antiRepeat=recentAdvice.length?`\n\nADVICE YOU'VE ALREADY GIVEN RECENTLY (do not repeat these points verbatim — if relevant again, add new depth, a different angle, or acknowledge progress instead of restating):\n${recentAdvice.map((a,i)=>`${i+1}. ${a}`).join("\n")}`:"";
      const systemPrompt=`You are Smira, a warm, empathetic AI wellness companion with expertise in skincare, nutrition, habits, and emotional wellbeing.

VOICE: Warm, supportive, knowledgeable. Like a caring friend who's also an expert. Be concise (2–4 sentences) unless detailed analysis is needed. Max 1–2 gentle emojis per response.

FOOD ANALYSIS — when user mentions food eaten:
- Analyze sugar load (high glycemic → insulin spike → androgens → breakouts)
- Check dairy content (casein/whey can trigger IGF-1 → acne in sensitive people)
- Identify inflammatory ingredients (processed, trans fats, refined carbs)
- Celebrate anti-inflammatory choices (omega-3, antioxidants, berries, leafy greens)
- Connect to skin: "Dairy intake may contribute to breakouts for some people — worth monitoring."
- Never shame food choices. Always frame compassionately.

SKINCARE ANALYSIS — when user mentions products used:
- Detect conflicts: Retinol + Vitamin C together = irritation risk; AHA + Retinol = over-exfoliation
- Flag over-exfoliation: multiple actives daily
- Suggest correct layering: cleanser → toner → serum → moisturizer → SPF (AM) / oil (PM)
- Praise what they're doing right
- Example: "BHA cleanser + retinol every night risks barrier damage — consider alternating."

HOLISTIC ANALYSIS: Connect food + products + sleep + stress into complete insights.

EMOTIONAL SUPPORT: Validate feelings FIRST before any advice. Never minimize. End with something affirming.

SKIN PROGRESS AWARENESS: ${trendCtx} Reference this trend naturally when relevant (e.g. celebrate real improvement, gently note a new concern) — don't just recite numbers.

User context: ${ctx}${antiRepeat}`;
      /* Gemini multi-turn history: role must be "user" or "model", and the
         final turn is passed separately so it becomes the active prompt. */
      const history=newMsgs.slice(-10,-1).map(m=>({role:m.role==="assistant"?"model":"user",parts:[{text:m.text}]}));
      const text=await callGeminiChat(history,userMsg.text,systemPrompt);
      const reply=text||"I'm here for you. Could you tell me more?";
      setMsgs(m=>[...m,{role:"assistant",text:reply,ts:Date.now()}]);
      const nextLog=[...recentAdvice,reply.slice(0,120)].slice(-6);
      LS.set("coach_advice_log",nextLog);
    }catch(e){
      console.error("[Smira Coach]",e?.message,new Date().toISOString());
      setErr(friendlyAIError(e));
    }finally{setLoading(false);}
  };

  const quickPrompts=["Analyze what I ate today","Review my skincare routine","I'm feeling frustrated about my skin","Help me build a better sleep habit","What should I eat for clearer skin?"];

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <div style={{padding:"20px 22px",borderBottom:"1px solid rgba(181,92,121,.15)",background:"rgba(26,11,18,.6)",display:"flex",gap:12,alignItems:"center"}}>
        <div style={{width:44,height:52,borderRadius:12,overflow:"hidden",border:"2px solid rgba(212,135,154,.3)",flexShrink:0}}><SmiraAvatar state="welcome" portrait size={52}/></div>
        <div>
          <h2 className="cf" style={{fontSize:22,fontWeight:400}}>Smira</h2>
          <p style={{fontSize:12,color:"#9A6677"}}>AI Wellness Companion · Always here for you</p>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:4}}>
          {onMinimize&&<button onClick={onMinimize} aria-label="Minimize chat" style={{background:"none",border:"none",cursor:"pointer",color:"#9A6677",padding:8}}><Ic n="minus" s={18} c="#9A6677"/></button>}
          {onClose&&<button onClick={onClose} aria-label="Close chat" style={{background:"none",border:"none",cursor:"pointer",color:"#9A6677",padding:8}}><Ic n="x" s={18} c="#9A6677"/></button>}
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"18px 16px",display:"flex",flexDirection:"column",gap:14,minHeight:0}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:"flex",gap:10,alignItems:"flex-end",flexDirection:m.role==="user"?"row-reverse":"row"}}>
            {m.role==="assistant"&&<SmiraAvatar state="welcome" size={34}/>}
            <div style={{maxWidth:"82%",padding:"12px 15px",borderRadius:m.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px",background:m.role==="user"?"linear-gradient(135deg,#8B3A57,#6B2244)":"rgba(46,14,31,.9)",border:m.role==="user"?"none":"1px solid rgba(181,92,121,.2)"}}>
              <p style={{fontSize:13.5,color:"#F5E6EA",lineHeight:1.75}}>{m.text}</p>
            </div>
          </div>
        ))}
        {loading&&(
          <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
            <SmiraAvatar state="analysis" size={34}/>
            <div style={{padding:"12px 16px",borderRadius:"16px 16px 16px 4px",background:"rgba(46,14,31,.9)",border:"1px solid rgba(181,92,121,.2)"}}>
              <div style={{display:"flex",gap:5,alignItems:"center"}}>
                {[0,1,2].map(j=><div key={j} style={{width:7,height:7,borderRadius:"50%",background:"#D4879A",animation:`gPulse 1.2s ease-in-out ${j*0.2}s infinite`}}/>)}
              </div>
            </div>
          </div>
        )}
        {err&&<div style={{textAlign:"center",padding:"10px",background:"rgba(245,163,163,.08)",borderRadius:10,border:"1px solid rgba(245,163,163,.2)"}}><p style={{fontSize:12,color:"#F5A3A3"}}>{err}</p></div>}
        <div ref={endRef}/>
      </div>

      {msgs.length<=2&&(
        <div style={{padding:"0 16px 14px"}}>
          <p style={{fontSize:11,color:"#6B4455",marginBottom:8}}>Quick topics:</p>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {quickPrompts.map(q=><button key={q} onClick={()=>setInput(q)} style={{padding:"6px 12px",borderRadius:20,background:"rgba(181,92,121,.1)",border:"1px solid rgba(181,92,121,.22)",color:"#D4879A",fontSize:11,cursor:"pointer",transition:"all .2s"}}>{q}</button>)}
          </div>
        </div>
      )}

      <div style={{padding:"14px 16px",borderTop:"1px solid rgba(181,92,121,.15)",background:"rgba(26,11,18,.6)"}}>
        <div style={{display:"flex",gap:9,alignItems:"flex-end"}}>
          <textarea className="inp" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder="Tell me about your food, skincare, or how you're feeling..." rows={2} style={{resize:"none",lineHeight:1.6,flex:1,padding:"10px 14px"}}/>
          <button className="btn" onClick={send} disabled={!input.trim()||loading} style={{padding:"10px 14px",borderRadius:14,flexShrink:0,display:"flex",alignItems:"center",gap:6}}>
            <Ic n="send" s={15}/>
          </button>
        </div>
      </div>
    </div>
  );
};

const FloatingCompanion=({user,results,scans})=>{
  const [open,setOpen]=useState(false);
  const [minimized,setMinimized]=useState(false);
  const [msg,setMsg]=useState(()=>getMsg("encouragement"));
  const [showBubble,setShowBubble]=useState(true);
  const panelRef=useRef(null);
  const btnRef=useRef(null);
  useEffect(()=>{
    if(!open){
      const cats=["encouragement","wellness","confidence","progress"];
      const t=setTimeout(()=>setMsg(getMsg(cats[Math.floor(Math.random()*cats.length)])),8000);
      return()=>clearTimeout(t);
    }
  },[open,msg]);
  useEffect(()=>{
    const t=setTimeout(()=>setShowBubble(false),6000);
    return()=>clearTimeout(t);
  },[]);
  /* No full-screen backdrop anymore — it was intercepting every tap on the
     page while open, which is exactly what made the chat feel like it
     "blocked" the whole mobile interface. Instead: the rest of the app
     stays fully interactive underneath the floating panel, and tapping
     anywhere outside the panel/button (via a lightweight document
     listener, not a blocking div) just closes it. */
  useEffect(()=>{
    if(!open||minimized)return;
    const handler=(e)=>{
      if(panelRef.current?.contains(e.target))return;
      if(btnRef.current?.contains(e.target))return;
      setOpen(false);
    };
    document.addEventListener("mousedown",handler);
    document.addEventListener("touchstart",handler,{passive:true});
    return()=>{
      document.removeEventListener("mousedown",handler);
      document.removeEventListener("touchstart",handler);
    };
  },[open,minimized]);

  return(
    <>
      {showBubble&&!open&&(
        <div role="button" tabIndex={0} aria-label="Open Smira chat" className="kb-focusable" style={{position:"fixed",bottom:102,right:98,zIndex:198,maxWidth:220,background:"rgba(16,5,12,.95)",border:"1px solid rgba(181,92,121,.3)",borderRadius:"14px 14px 4px 14px",padding:"11px 14px",boxShadow:"0 8px 28px rgba(0,0,0,.5)",animation:"fadeUp .4s ease",cursor:"pointer"}} onClick={()=>{setOpen(true);setMinimized(false);setShowBubble(false);}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setOpen(true);setMinimized(false);setShowBubble(false);}}}>
          <p style={{fontSize:12,color:"#F0C4CC",lineHeight:1.65,fontStyle:"italic"}}>"{msg}"</p>
          <div style={{fontSize:10,color:"#6B4455",marginTop:4,textAlign:"right"}}>— Smira</div>
        </div>
      )}
      {open&&!minimized&&(
        <div ref={panelRef} className="floating-panel" style={{maxHeight:"80vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <AICoach user={user} results={results} scans={scans} onClose={()=>setOpen(false)} onMinimize={()=>setMinimized(true)}/>
        </div>
      )}
      {open&&minimized&&(
        <div className="floating-mini-bar kb-focusable" role="button" tabIndex={0} aria-label="Reopen Smira chat" onClick={()=>setMinimized(false)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setMinimized(false);}}}>
          <div style={{width:26,height:26,borderRadius:"50%",overflow:"hidden",flexShrink:0}}><img src={AV.welcome} alt="" style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"50% 12%"}}/></div>
          <span style={{fontSize:13,color:"#F0C4CC",flex:1}}>Smira — tap to reopen</span>
          <button onClick={e=>{e.stopPropagation();setOpen(false);setMinimized(false);}} aria-label="Close chat" style={{background:"none",border:"none",cursor:"pointer",color:"#9A6677",padding:4}}><Ic n="x" s={16} c="#9A6677"/></button>
        </div>
      )}
      {!(open&&minimized)&&(
        <div ref={btnRef} className="floating-btn kb-focusable" role="button" tabIndex={0} aria-label={open?"Close Smira chat":"Open Smira chat"} onClick={()=>{setOpen(o=>!o);setMinimized(false);setShowBubble(false);}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setOpen(o=>!o);setMinimized(false);setShowBubble(false);}}}>
          <img src={AV.welcome} alt="Smira" style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"50% 12%"}} onError={e=>{e.target.style.display="none";e.target.parentNode.style.background="linear-gradient(135deg,#8B3A57,#D4879A)";e.target.parentNode.innerHTML="<span style='font-family:Cormorant Garamond,serif;font-size:26px;color:#F5E6EA;font-weight:600;display:flex;align-items:center;justify-content:center;height:100%'>S</span>";}}/>
        </div>
      )}
    </>
  );
};

const Sidebar=({active,onNav,user,open,onClose})=>{
  const nav=[
    {id:"dashboard",icon:"home",label:"Dashboard"},
    {id:"scan",icon:"scan",label:"Skin Analysis"},
    {id:"results",icon:"chart",label:"My Results"},
    {id:"confidence",icon:"heart",label:"Confidence Score"},
    {id:"journal",icon:"book",label:"Glow Journal"},
    {id:"products",icon:"bag",label:"Products"},
    {id:"nutrition",icon:"leaf",label:"Nutrition"},
    {id:"challenges",icon:"trophy",label:"Challenges"},
    {id:"analytics",icon:"chart",label:"Analytics"},
    {id:"journey",icon:"spark",label:"My Journey"},
    {id:"story",icon:"star",label:"Monthly Story"},
    {id:"forecast",icon:"forecast",label:"Skin Forecast"},
    {id:"menstrual",icon:"cycle",label:"Cycle Tracker"},
    {id:"settings",icon:"gear",label:"Settings"},
  ];
  return(
    <>
      <div className="sidebar-overlay" onClick={onClose}/>
      <div className={`app-sidebar glass${open?" open":""}`} style={{width:220,height:"100vh",display:"flex",flexDirection:"column",padding:"18px 12px",position:"sticky",top:0,flexShrink:0,borderRight:"1px solid rgba(181,92,121,.12)",borderRadius:0,background:"rgba(18,6,14,.95)"}}>
        <div style={{padding:"14px 8px 20px",borderBottom:"1px solid rgba(181,92,121,.12)",marginBottom:12}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,paddingBottom:4}}>
            <AuraLogo size={50} gold="#D8B36A" bg="#1A0B12"/>
            <div style={{textAlign:"center"}}>
              <div className="cf" style={{fontSize:22,fontWeight:300,letterSpacing:".06em",background:"linear-gradient(135deg,#F0C4CC,#D4879A)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",lineHeight:1.1}}>SMIRA</div>
              <div style={{fontSize:9,color:"#D8B36A",letterSpacing:".12em",opacity:.8,marginTop:2}}>Glow with Confidence.</div>
            </div>
          </div>
          {user?.name&&(
            <div style={{fontSize:12,color:"#9A6677",paddingLeft:2}}>
              <span style={{color:"#F0C4CC",fontWeight:500}}>{user.name.split(" ")[0]}</span>
              {user.skinGoal?.length>0&&<div style={{fontSize:10,color:"#6B4455",marginTop:2}}>{user.skinGoal[0]}</div>}
            </div>
          )}
        </div>
        <nav aria-label="Main navigation" style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:2}}>
          {nav.map(n=>(
            <button key={n.id} className={`nav-link${active===n.id?" act":""}`} aria-current={active===n.id?"page":undefined} onClick={()=>{onNav(n.id);onClose();}}>
              <Ic n={n.icon} s={15} c={active===n.id?"#D4879A":"#9A6677"}/>
              {n.label}
            </button>
          ))}
        </nav>
        <div style={{paddingTop:12,borderTop:"1px solid rgba(181,92,121,.12)"}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"4px 8px"}}>
            <div style={{fontSize:9,color:"#3A1525",letterSpacing:".08em",textAlign:"center"}}>SMIRA · V4.0</div>
            <div style={{fontSize:8,color:"#2A1020",textAlign:"center"}}>Glow with Confidence.</div>
          </div>
        </div>
      </div>
    </>
  );
};

export default function App(){
  /* ── Theme ── */
  const [themePref,setThemePref]=useState(()=>LS.get("theme_pref","dark"));
  const resolvedTheme=resolveTheme(themePref);
  const T=resolvedTheme==="light"?LIGHT_T:DARK_T;
  const saveTheme=(p)=>{setThemePref(p);LS.set("theme_pref",p);};

  const isOnline=useOnlineStatus();

  /* ── Auth ── */
  const [authUser,setAuthUser]=useState(()=>AUTH.getUser()); // instant cache for first paint
  const [authLoading,setAuthLoading]=useState(true);
  const [splashDone,setSplashDone]=useState(false);
  const [cloudHydrated,setCloudHydrated]=useState(false);

  const CLOUD_KEYS=["smira_user","smira_results","smira_scans","habits3","water_today","glowJournal","menstrual_cycles","diet_plan","coach_msgs"];

  /* Firebase resolves the real session asynchronously — subscribe once.
     On a real (non-null) user, pull their cloud document first and write
     it into localStorage *silently* (no re-push) before letting the app
     move past the splash screen — so every component's first read already
     sees the synced data, with no need to touch each component. */
  useEffect(()=>{
    const unsub=AUTH.onChange(async(u)=>{
      setAuthUser(u);
      if(u?.uid){
        const cloud=await pullUserData(u.uid);
        if(cloud){
          if(cloud.smira_user!==undefined)LS.setSilent("smira_user",cloud.smira_user);
          if(cloud.smira_results!==undefined)LS.setSilent("smira_results",cloud.smira_results);
          if(cloud.smira_scans!==undefined)LS.setSilent("smira_scans",cloud.smira_scans);
          if(cloud.habits3!==undefined)LS.setSilent("habits3",cloud.habits3);
          if(cloud.water_today!==undefined)LS.setSilent("water_today",cloud.water_today);
          if(cloud.glowJournal!==undefined)LS.setSilent("glowJournal",cloud.glowJournal);
          if(cloud.menstrual_cycles!==undefined)LS.setSilent("menstrual_cycles",cloud.menstrual_cycles);
          if(cloud.diet_plan!==undefined)LS.setSilent("diet_plan",cloud.diet_plan);
          if(cloud.coach_msgs!==undefined)LS.setSilent("coach_msgs",cloud.coach_msgs);
        }
      }
      setCloudHydrated(true);
      setAuthLoading(false);
    });
    return unsub;
  },[]);

  /* Push-sync: once signed in and hydrated, any local change to a tracked
     key (from *any* component — habit tracker, journal, water counter, the
     scan flow, profile edits) gets pushed to Firestore, debounced per key
     so rapid edits (e.g. typing a journal entry) don't spam writes. */
  useEffect(()=>{
    if(!authUser?.uid||!cloudHydrated)return;
    const timers={};
    const unsub=LS.subscribe((key,value)=>{
      if(!CLOUD_KEYS.includes(key))return;
      clearTimeout(timers[key]);
      timers[key]=setTimeout(()=>pushUserData(authUser.uid,{[key]:value}),1200);
    });
    return()=>{unsub();Object.values(timers).forEach(clearTimeout);};
  },[authUser?.uid,cloudHydrated]);

  /* ── App State ── */
  const [screen,setScreen]=useState(()=>{
    // Splash → always show on fresh load
    return "splash";
  });
  const [page,setPage]=useState(()=>LS.get("smira_page","dashboard"));
  const [user,setUser]=useState(()=>LS.get("smira_user",null));
  const [results,setResults]=useState(()=>LS.get("smira_results",null));
  const [scanImg,setScanImg]=useState(()=>LS.get("smira_img",null));
  const [scans,setScans]=useState(()=>LS.get("smira_scans",[]));
  const [sideOpen,setSideOpen]=useState(false);
  const [habits]=useState(()=>LS.get("habits3",DEFAULT_HABITS));
  const [water]=useState(()=>LS.get("water_today",0));
  const [journalEntries]=useState(()=>LS.get("glowJournal",[]));

  /* Listen for system theme changes */
  useEffect(()=>{
    const mq=window.matchMedia("(prefers-color-scheme:dark)");
    const handler=()=>{if(themePref==="system")setThemePref(p=>p);};
    mq.addEventListener("change",handler);
    return()=>mq.removeEventListener("change",handler);
  },[themePref]);

  const nav=(p)=>{setPage(p);LS.set("smira_page",p);setSideOpen(false);window.scrollTo(0,0);};

  /* Move on from splash only once both the splash animation is done AND
     Firebase has told us whether someone's actually signed in. If Firebase
     resolves quickly this feels instant (thanks to the localStorage cache
     above); if not, we simply wait rather than guessing. */
  useEffect(()=>{
    if(splashDone&&!authLoading&&cloudHydrated){
      if(authUser){
        // Hydration may have updated localStorage *after* this component's
        // initial useState read — re-sync from storage now, once, before
        // deciding which screen to show.
        const freshUser=LS.get("smira_user",null);
        if(JSON.stringify(freshUser)!==JSON.stringify(user))setUser(freshUser);
        setResults(LS.get("smira_results",null));
        setScans(LS.get("smira_scans",[]));
        if(!freshUser)setScreen("onboarding");
        else setScreen("app");
      } else {
        setScreen("auth");
      }
    }
  },[splashDone,authLoading,cloudHydrated,authUser]);

  const handleSplashDone=()=>{
    setSplashDone(true);
  };

  const handleAuth=(aUser)=>{
    setAuthUser(aUser);AUTH.setUser(aUser);
    // Merge name from auth if no profile yet
    if(!user){
      setScreen("onboarding");
    } else {
      setScreen("app");
    }
  };

  const handleOnboard=(d)=>{
    const merged={...d,email:authUser?.email||d.email,name:d.name||authUser?.name};
    setUser(merged);LS.set("smira_user",merged);
    if(!LS.get("activities",null))LS.set("activities",{});
    setScreen("app");nav("dashboard");
  };

  const handleLogout=async()=>{
    await AUTH.clear();setAuthUser(null);
    setScreen("auth");
  };

  const handleDeleteAccount=async()=>{
    const uid=authUser?.uid;
    if(uid)await deleteUserCloudData(uid);
    // Clear every locally-stored key, not just the tracked cloud ones —
    // this is a full local wipe, not just an unsync.
    ["smira_user","smira_results","smira_img","smira_scans","habits3","water_today","glowJournal","menstrual_cycles","diet_plan","diet_pref_type","diet_pref_budget","smira_page","auth_user","coach_msgs","notifs"].forEach(k=>LS.del(k));
    try{
      const { deleteUser } = await import("firebase/auth");
      if(auth.currentUser)await deleteUser(auth.currentUser);
    }catch(err){
      if(err?.code==="auth/requires-recent-login"){
        throw new Error("For security, please sign out and sign back in, then try deleting your account again.");
      }
      throw err;
    }
    setAuthUser(null);setUser(null);setResults(null);setScans([]);
    setScreen("auth");
  };

  const handleUpdateProfile=(updated)=>{
    setUser(updated);LS.set("smira_user",updated);
  };

  const handleResult=async(r,img)=>{
    setResults(r);setScanImg(img);
    LS.set("smira_results",r);LS.set("smira_img",img);
    const thumb=await makeThumb(img).catch(()=>null);
    const entry={
      date:new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}),
      ts:Date.now(),
      overallScore:r.overallScore||0,
      hydrationLevel:r.hydrationLevel||0,
      elasticity:r.elasticity||0,
      brightness:r.brightness||0,
      skinType:r.skinType||null,
      skinAge:r.skinAge||null,
      concerns:(r.concerns||[]).map(c=>({name:c.name,severity:c.severity,confidence:c.confidence})),
      summary:r.aiSummary,
      thumb,
    };
    const next=[...scans,entry].slice(-30);
    setScans(next);LS.set("smira_scans",next);
    nav("results");
  };

  // Add spin keyframe for auth loader
  const spinStyle=`@keyframes spin{to{transform:rotate(360deg)}}`;

  return(
    <div style={{minHeight:"100vh",background:T.bodyBg,transition:"background .35s"}}>
      <GlobalStyles theme={resolvedTheme}/>
      <style>{spinStyle}</style>
      <OfflineBanner online={isOnline}/>

      {screen==="splash"&&<Splash onDone={handleSplashDone} theme={resolvedTheme}/>}
      {screen==="auth"&&<AuthScreen onAuth={handleAuth} theme={resolvedTheme}/>}
      {screen==="onboarding"&&<Onboarding onDone={handleOnboard}/>}

      {screen==="app"&&(
        <div style={{display:"flex",minHeight:"100vh"}}>
          <a href="#main-content" className="skip-link">Skip to main content</a>
          <Sidebar active={page} onNav={nav} user={user} open={sideOpen} onClose={()=>setSideOpen(false)}/>
          <div className="app-main" id="main-content" role="main" tabIndex={-1} style={{flex:1,marginLeft:0,minWidth:0,background:T.bodyBg}}>
            {/* Top bar */}
            <div style={{padding:"12px 18px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",background:T.topbar,position:"sticky",top:0,zIndex:50,backdropFilter:"blur(14px)",transition:"background .35s"}}>
              <button className="hamburger" onClick={()=>setSideOpen(s=>!s)} aria-label="Menu"><span/><span/><span/></button>
              <div style={{display:"flex",alignItems:"center",gap:9}}>
                <AuraLogo size={28} gold={T.gold} bg={resolvedTheme==="light"?"#8B3A57":"#1A0B12"}/>
                <span className="cf" style={{fontSize:19,letterSpacing:".06em",background:"linear-gradient(135deg,#F0C4CC,#D4879A)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",fontWeight:300}}>SMIRA</span>
              </div>
              <button onClick={()=>nav("settings")} style={{background:"none",border:"none",cursor:"pointer",padding:6,borderRadius:8,display:"flex",alignItems:"center",gap:6,color:T.muted}} title="Settings">
                <Ic n="gear" s={18} c={T.muted}/>
                {user?.name&&<span style={{fontSize:12,color:T.muted,display:"none"}} className="hide-mobile">{user.name.split(" ")[0]}</span>}
              </button>
            </div>
            <div key={page} className="page-fade" style={{padding:"0"}}>
              {page==="dashboard"&&<Dashboard user={user} results={results} onNav={nav} scans={scans}/>}
              {page==="scan"&&<SkinScan onResult={handleResult} user={user} existingScans={scans}/>}
              {page==="results"&&<Results results={results} img={scanImg} user={user} onNav={nav} scans={scans}/>}
              {page==="confidence"&&<ConfidenceScore habits={habits} water={water} journalEntries={journalEntries} scans={scans} user={user}/>}
              {page==="journal"&&<GlowJournal/>}
              {page==="products"&&<Products results={results}/>}
              {page==="nutrition"&&<Nutrition user={user} results={results}/>}
              {page==="challenges"&&<Challenges/>}
              {page==="analytics"&&<Analytics scans={scans}/>}
              {page==="journey"&&<Journey scans={scans}/>}
              {page==="story"&&<MonthlyStory user={user} scans={scans} habits={habits} journalEntries={journalEntries}/>}
              {page==="forecast"&&<SkinForecast user={user} results={results}/>}
              {page==="menstrual"&&<MenstrualTracker scans={scans}/>}
              {page==="coach"&&<div style={{height:"calc(100vh - 60px)"}}><AICoach user={user} results={results} scans={scans}/></div>}
              {page==="settings"&&<Settings user={user} authUser={authUser} themePref={themePref} onThemeChange={saveTheme} onLogout={handleLogout} onUpdateProfile={handleUpdateProfile} onDeleteAccount={handleDeleteAccount} theme={resolvedTheme}/>}
            </div>
          </div>
          <FloatingCompanion user={user} results={results} scans={scans}/>
        </div>
      )}
    </div>
  );
}
