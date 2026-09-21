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
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
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
/* ── RESET JOURNEY ────────────────────────────────────────────────────────
   Clears every accumulated-progress key (scans, confidence inputs, habits,
   journal, cycle history, diet plan, coach history, challenges) while
   leaving the account itself (auth_user / smira_user profile) untouched,
   as Settings → Account's "Reset Journey" spec requires. Also overwrites
   the same fields in the signed-in user's cloud document so a reset
   can't be silently undone by the next cloud pull. */
const JOURNEY_KEYS=["smira_results","smira_scans","smira_img","habits3","water_today","glowJournal","menstrual_cycles","diet_plan","diet_pref_type","diet_pref_budget","coach_msgs","coach_advice_log","challenges_joined","challenges_progress","activities","just_logged_in","smira_page"];
const resetJourneyData=async(uid)=>{
  JOURNEY_KEYS.forEach(k=>LS.del(k));
  if(uid){
    await pushUserData(uid,{latestResults:null,scanHistory:[],habits:DEFAULT_HABITS,waterToday:0,glowJournal:[],menstrualCycles:[],dietPlan:null,coachChatHistory:[]});
  }
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
/* SMIRA V5 — "Magical Garden" palette. Soft rose, blush, champagne, cream,
   pastel green and a whisper of gold — never harsh black, always warm. */
/* ── SMIRA brand palette (from the supplied brand asset pack) ──────────
   wine/soft/berry used to be a lighter mid-purple (#6F527D); the brand
   spec's primary ink is Deep Navy #29285C, used for both the wordmark
   and every primary button/heading in the reference screens, so those
   three tokens now point at navy instead. Everything that reads
   var(--wine)/var(--soft)/var(--berry) — buttons, active nav, headings —
   picks this up automatically without any per-component changes. */
const LIGHT_T={dp:"#FDF8F0",deep:"#FFFBF4",plum:"#F6EDDF",wine:"#C97F84",berry:"#B06B72",rose:"#D98A93",blush:"#F4DCDC",petal:"#DCE4D3",mist:"#6B5A4E",card:"rgba(255,251,244,0.96)",border:"rgba(163,179,148,0.34)",txt:"#6B5A4E",muted:"#9C8878",soft:"#C97F84",bg:"#F1F0E4",sbg:"#F5F2E6",topbar:"rgba(253,248,240,.90)",inpBg:"rgba(253,248,240,.85)",inpBorder:"rgba(228,216,200,.95)",gold:"#C2A36B",scrollThumb:"#D9C6AE",bodyBg:"radial-gradient(circle at 18% 12%,rgba(220,228,211,.55),transparent 42%),radial-gradient(circle at 84% 78%,rgba(244,220,220,.5),transparent 45%),linear-gradient(160deg,#FDF8F0 0%,#F1F0E4 55%,#FDF8F0 100%)",green:"#A3B394",cream:"#FDF8F0",
  coral:"#C97F84",peach:"#F4DCDC",apricot:"#D9B08C",sage:"#A3B394",sageSoft:"#DCE4D3",
  sky:"#B8C4A8",skySoft:"#E5EBDD",sun:"#D9B98C",sunSoft:"#F0E2CC",lav:"#D6ACAC",lavSoft:"#F2E0E0",
  plumDeep:"#5C4B40",creamWarm:"#FDF8F0"};

/* Shared rotation palettes for "each item gets its own tint" moments
   (goal chips, habit icons, challenge cards, etc). One source of truth
   instead of the same array copy-pasted at every call site. */
const CHIP_GRADIENTS=[["#C97F84","#F4DCDC"],["#A3B394","#DCE4D3"],["#D9B08C","#F0E2CC"],["#B8C4A8","#E5EBDD"],["#D6ACAC","#F2E0E0"],["#8A9B7B","#C9D6BC"]];
const CHIP_CLASSES=["chip-coral","chip-sky","chip-sage","chip-sun","chip-lav","chip-peach"];
/* SMIRA is light-mode only — this is the single design-token source. */
const resolveTheme=()=>"light";
const ThemeCtx=typeof window!=="undefined"?window.__smiraThemeCtx||(window.__smiraThemeCtx={t:LIGHT_T}):{t:LIGHT_T};

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
  /* Real password change: Firebase requires a recent sign-in before
     letting you change a password, so we re-authenticate with the
     current password first, then update. Only meaningful for email/
     password accounts — Google-signed-in users don't have a Smira
     password to change. */
  changePassword:async(currentPw,newPw)=>{
    const u=auth.currentUser;
    if(!u||!u.email)throw new Error("You need to be signed in to change your password.");
    if(newPw.length<6)throw new Error("New password must be at least 6 characters.");
    try{
      const cred=EmailAuthProvider.credential(u.email,currentPw);
      await reauthenticateWithCredential(u,cred);
      await updatePassword(u,newPw);
      return true;
    }catch(err){throw friendlyAuthError(err);}
  },
};

/* SMIRA's real illustrated expressions (5 poses) mapped onto the app's
   emotional-state vocabulary — every screen that asks for a "mood" gets a
   real character illustration instead of a broken image / initial badge. */
const AV={
  neutral:"/smira/avatars/reassuring.png",
  happy:"/smira/avatars/celebrating.png",
  welcome:"/smira/avatars/hello.png",
  analysis:"/smira/avatars/thinking.png",
  morning:"/smira/avatars/hello.png",
  celebration:"/smira/avatars/celebrating.png",
  coach:"/smira/avatars/listening.png",
  night:"/smira/avatars/reassuring.png",
  empathy:"/smira/avatars/reassuring.png",
  achievement:"/smira/avatars/celebrating.png",
};

const GlobalStyles=({theme="dark"})=>{
const t=LIGHT_T;
return(
<style>{`
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,500&family=Poppins:wght@300;400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
:root{--dp:${t.dp};--deep:${t.deep};--plum:${t.plum};--wine:${t.wine};--berry:${t.berry};--rose:${t.rose};--blush:${t.blush};--petal:${t.petal};--mist:${t.mist};--card:${t.card};--border:${t.border};--txt:${t.txt};--muted:${t.muted};--soft:${t.soft};--ok:#A8E6C9;--warn:#F5D5A3;--err:#F5A3A3;--gold:${t.gold};--green:${t.green};--cream:${t.cream};--inp-bg:${t.inpBg};--inp-border:${t.inpBorder};
  --coral:${t.coral};--peach:${t.peach};--apricot:${t.apricot};--sage:${t.sage};--sage-soft:${t.sageSoft};--sky:${t.sky};--sky-soft:${t.skySoft};--sun:${t.sun};--sun-soft:${t.sunSoft};--lav:${t.lav};--lav-soft:${t.lavSoft};--plum-deep:${t.plumDeep};--cream-warm:${t.creamWarm};
  /* ── Safe-area + mobile chrome tokens ──────────────────────────────
     Single source of truth for viewport-safe spacing. Every fixed/floating
     element (chat button, chat panel, bottom nav) is built from these
     instead of scattering arbitrary pixel values through the code. */
  --safe-t:env(safe-area-inset-top,0px);
  --safe-b:env(safe-area-inset-bottom,0px);
  --safe-l:env(safe-area-inset-left,0px);
  --safe-r:env(safe-area-inset-right,0px);
  /* Height actually occupied by the fixed mobile bottom nav. 0 on desktop
     (nav isn't rendered there); on mobile this is refined at runtime by a
     ResizeObserver in <BottomNav> so it always matches the real element,
     even if labels wrap or content changes — see BottomNav below. The
     value here is just a safe first-paint fallback before JS measures it. */
  --bottom-nav-h:0px;
  --mobile-safe-bottom:max(16px,var(--safe-b));
  --mobile-safe-right:max(16px,var(--safe-r));
  --mobile-safe-left:max(16px,var(--safe-l));
}
html,body{height:100%;background:${t.bg};color:${t.txt};font-family:'Poppins',sans-serif;overflow-x:hidden;transition:background .35s,color .35s;}
/* Belt-and-suspenders against accidental horizontal scroll from any
   in-flow element miscalculating its width — this does not hide the
   underlying cause (chat positioning/sizing is fixed at the source below),
   it's a standard defensive default for the whole page.
   IMPORTANT: overflow-y is set explicitly to "visible" here. Setting only
   overflow-x (without overflow-y) makes browsers silently compute
   overflow-y as "auto" too — turning #root into its own scroll container
   and, critically, into the *containing block* that position:sticky
   elements resolve against, instead of the real page viewport. That's
   exactly what was breaking the sticky sidebar and sticky top bar: once
   #root became the sticky containing block, scrolling the actual page
   carried the "stuck" sidebar/top-bar away with the content instead of
   pinning it in place. Being explicit about overflow-y keeps #root out of
   the sticky-positioning chain entirely, so position:sticky continues to
   resolve against the page as expected. */
#root{max-width:100vw;overflow-x:hidden;overflow-y:visible;}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${t.scrollThumb};border-radius:4px}
.cf{font-family:'Playfair Display',serif}
/* ── Editorial surface system (no glassmorphism) ── */
.glass{background:var(--card);border:1px solid ${t.border};border-radius:16px;box-shadow:0 1px 6px rgba(41,36,58,.04);}
.glow{box-shadow:0 2px 12px rgba(111,82,125,.08);}
.glass-nav{background:rgba(244,239,248,.92);border:1px solid ${t.border};border-radius:40px;box-shadow:0 2px 14px rgba(41,36,58,.06);}
/* ── SMIRA button system — flat, premium-skincare-app controls.
   No gradients, no glass, no glow: a solid deep-lavender primary, a pale
   lavender secondary, and a plain text tertiary action (see .btn-text). */
.btn{background:${t.wine};border:none;color:#FFFEFC;padding:13px 26px;border-radius:16px;font-family:'Poppins',sans-serif;font-weight:600;font-size:14px;cursor:pointer;transition:all .2s;letter-spacing:.1px;box-shadow:0 2px 10px rgba(111,82,125,.18);}
.btn:hover:not(:disabled){background:${t.berry};transform:translateY(-1px);box-shadow:0 4px 14px rgba(111,82,125,.24);}
.btn:disabled{opacity:.45;cursor:not-allowed;}
.btn-o{background:${t.petal};border:1px solid rgba(111,82,125,.22);color:${t.wine};padding:11px 22px;border-radius:16px;font-family:'Poppins',sans-serif;font-weight:500;font-size:14px;cursor:pointer;transition:all .2s;}
.btn-o:hover{background:${t.plum};transform:translateY(-1px);}
.btn-text{background:none;border:none;color:${t.wine};padding:6px 2px;font-family:'Poppins',sans-serif;font-weight:600;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:gap .2s;}
.btn-text:hover{gap:8px;}
.inp{background:var(--inp-bg);border:1px solid var(--inp-border);border-radius:16px;padding:14px 18px;color:var(--txt);font-family:'Poppins',sans-serif;font-size:14px;width:100%;outline:none;transition:all .25s;}
.inp:focus{border-color:${t.rose};background:${theme==="light"?"rgba(244,239,248,.9)":"rgba(255,255,255,.07)"};box-shadow:0 0 0 4px rgba(201,125,149,.14);}
.inp::placeholder{color:${theme==="light"?"#B08A96":"#8C6373"};}
.sel{background:${theme==="light"?"rgba(244,239,248,.85)":"rgba(255,255,255,.06)"};border:1px solid var(--inp-border);border-radius:16px;padding:14px 18px;color:var(--txt);font-family:'Poppins',sans-serif;font-size:14px;width:100%;outline:none;cursor:pointer;transition:all .25s;}
.sel:focus{border-color:${t.rose};}
.tag{background:${theme==="light"?"rgba(181,71,107,.08)":"rgba(201,125,149,.14)"};border:1px solid ${t.border};color:${t.soft};padding:4px 12px;border-radius:20px;font-size:11px;font-weight:500;}
@keyframes floatY{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes pageFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.page-fade{animation:pageFade .3s ease;}
@keyframes gPulse{0%,100%{opacity:.5}50%{opacity:1}}
@keyframes scanLine{0%{top:0%}100%{top:98%}}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes heartbeat{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@keyframes slideIn{from{transform:translateX(-100%)}to{transform:translateX(0)}}
@keyframes pulseRing{0%,100%{box-shadow:0 0 0 0 rgba(201,125,149,.4)}70%{box-shadow:0 0 0 10px rgba(201,125,149,0)}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
/* ── Magical garden motion kit ── */
@keyframes bubbleFloat{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-16px) rotate(1deg)}}
@keyframes petalFall{0%{transform:translateY(-10vh) translateX(0) rotate(0deg);opacity:0}10%{opacity:.85}90%{opacity:.6}100%{transform:translateY(110vh) translateX(40px) rotate(220deg);opacity:0}}
@keyframes butterflyDrift{0%{transform:translate(0,0) rotate(-4deg)}25%{transform:translate(18px,-22px) rotate(4deg)}50%{transform:translate(-6px,-40px) rotate(-6deg)}75%{transform:translate(-22px,-14px) rotate(3deg)}100%{transform:translate(0,0) rotate(-4deg)}}
@keyframes wingFlap{0%,100%{transform:scaleX(1)}50%{transform:scaleX(.68)}}
@keyframes sparkle{0%,100%{opacity:.15;transform:scale(.7)}50%{opacity:1;transform:scale(1.15)}}
@keyframes ripple{0%{transform:scale(.8);opacity:.6}100%{transform:scale(2.6);opacity:0}}
.garden-scene{position:absolute;inset:0;overflow:hidden;pointer-events:none;}
.petal{position:absolute;top:-5%;font-size:16px;animation:petalFall linear infinite;filter:drop-shadow(0 2px 4px rgba(154,72,100,.2));}
.butterfly-wrap{position:absolute;animation:butterflyDrift ease-in-out infinite;}
.sparkle-dot{position:absolute;border-radius:50%;background:radial-gradient(circle,#fff,transparent 70%);animation:sparkle ease-in-out infinite;}
.fade-up{animation:fadeUp .5s ease forwards;}
.orb{position:absolute;border-radius:50%;filter:blur(6px);pointer-events:none;animation:gPulse 5s ease-in-out infinite;}
.scan-anim{position:absolute;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,${t.rose},transparent);animation:scanLine 1.8s linear infinite;}
.shimmer-bg{background:linear-gradient(90deg,rgba(255,255,255,.03) 25%,rgba(255,255,255,.08) 50%,rgba(255,255,255,.03) 75%);background-size:200% 100%;animation:shimmer 1.8s infinite;}
.nav-link{color:${t.muted};font-size:13.5px;font-weight:500;cursor:pointer;padding:10px 14px;border-radius:14px;transition:all .2s;display:flex;align-items:center;gap:10px;border:none;background:transparent;width:100%;text-align:left;font-family:'Poppins',sans-serif;}
.nav-link:hover{color:${t.soft};background:rgba(111,82,125,.06);}
.nav-link.act{color:#fff;background:linear-gradient(135deg,${t.plumDeep},${t.lav});box-shadow:0 3px 10px rgba(111,82,125,.28);}
.nav-group-label{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${t.muted};opacity:.65;padding:14px 14px 6px;font-weight:600;}
.pbar{height:6px;background:${theme==="light"?"rgba(181,71,107,.1)":"rgba(255,255,255,.08)"};border-radius:4px;overflow:hidden;}
.pfill{height:100%;border-radius:4px;transition:width 1.2s ease;}
.tab-btn{padding:9px 17px;border-radius:14px;font-size:13px;font-weight:500;cursor:pointer;transition:all .2s;color:var(--muted);border:none;background:transparent;white-space:nowrap;}
.tab-btn.act{background:linear-gradient(135deg,${t.plumDeep},${t.lav});color:#fff;}
.check-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(181,92,121,.07);}
.check-row:last-child{border-bottom:none;}
.streak-badge{background:linear-gradient(135deg,${t.plumDeep},${t.lav});padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;color:#fff;display:inline-block;}
.concern-zone{position:absolute;border-radius:50%;border:2px solid;animation:gPulse 2s ease-in-out infinite;cursor:pointer;}
.challenge-card{background:var(--card);backdrop-filter:blur(6px) saturate(160%);border:1px solid var(--border);border-radius:22px;padding:20px;}
/* ── Colour-forward surface system (reference-inspired) ──────────────
   Large organic hero cards, tinted "chip" surfaces used to bring
   saturated colour into hero moments and quick-action rows without
   touching the base .glass system used everywhere else in the app.
   The lavender/rose gradient here is deliberately lavender-forward
   (pale lavender → lavender/purple → a touch of rose right at the
   edge) so it reads as "the lavender app" rather than competing
   equally with coral/peach, per the brand direction. The two large
   translucent white circles previously drawn in the corners via
   ::before/::after have been removed — visual interest now comes from
   the gradient, the illustration, and typography alone, not decorative
   blobs. */
.hero-organic{position:relative;overflow:hidden;border-radius:32px;background:linear-gradient(135deg,${t.lavSoft} 0%,${t.lav} 60%,${t.rose} 100%);box-shadow:0 10px 34px rgba(74,51,88,.18);}
.chip{border-radius:20px;border:1px solid transparent;transition:transform .18s ease,box-shadow .18s ease;}
.chip:hover{transform:translateY(-2px);}
.chip:active{transform:translateY(0) scale(.97);transition-duration:.08s;}
.mood-pill:active{transform:scale(.95)!important;transition-duration:.08s;}
.nav-link{transition:transform .15s ease,background .2s ease,color .2s ease;}
.nav-link:active{transform:scale(.97);}
.bottom-nav-btn:active{transform:scale(.9);}
.chip-coral{background:linear-gradient(160deg,#FBD9CB,#F6B79E);}
.chip-peach{background:linear-gradient(160deg,#FCE6CE,${t.peach});}
.chip-sage{background:linear-gradient(160deg,${t.sageSoft},#C7E2CE);}
.chip-sky{background:linear-gradient(160deg,${t.skySoft},#C6E4F1);}
.chip-sun{background:linear-gradient(160deg,${t.sunSoft},#F5DA9C);}
.chip-lav{background:linear-gradient(160deg,${t.lavSoft},#D3C3EE);}
.chip-plum{background:linear-gradient(160deg,#8A6C9C,${t.plumDeep});color:#F8F2FB;}
.mood-pill{border-radius:18px;padding:12px 8px;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;border:1px solid transparent;transition:transform .2s,box-shadow .2s;font-family:'Poppins',sans-serif;font-weight:600;font-size:11px;}
.mood-pill:hover{transform:translateY(-2px) scale(1.03);}
/* ── Chat widget stacking hierarchy (deliberate, not incremental) ──────
   sidebar-overlay 99 < app-sidebar 100 < smira-bottom-nav 150 <
   floating-panel 199 < floating-btn/mini-bar 200 < skip-link 400.
   Only one of floating-btn / floating-panel / floating-mini-bar is ever
   rendered at a time (see FloatingCompanion) so there is no real overlap
   in practice, but the ordering also holds if that ever changes. */
.floating-btn{position:fixed;bottom:calc(28px + var(--safe-b));right:calc(28px + var(--safe-r));z-index:200;cursor:pointer;width:62px;height:62px;border-radius:50%;overflow:hidden;border:2px solid ${t.rose}72;box-shadow:0 4px 24px rgba(154,72,100,.35);animation:pulseRing 3s ease-in-out infinite;transition:transform .2s;}
.floating-btn:hover{transform:scale(1.08);}
.floating-panel{position:fixed;bottom:calc(104px + var(--safe-b));right:calc(28px + var(--safe-r));z-index:199;width:min(350px,calc(100vw - 52px));max-height:min(68vh,640px);max-height:min(68dvh,640px);display:flex;flex-direction:column;overflow:hidden;background:var(--card);backdrop-filter:blur(6px) saturate(160%);border:1px solid var(--border);border-radius:22px;box-shadow:0 16px 56px rgba(154,72,100,.3);animation:fadeUp .28s ease;}
.floating-mini-bar{position:fixed;bottom:calc(28px + var(--safe-b));right:calc(28px + var(--safe-r));z-index:200;display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:20px;background:var(--card);backdrop-filter:blur(6px) saturate(160%);border:1px solid var(--border);box-shadow:0 8px 28px rgba(154,72,100,.22);cursor:pointer;max-width:min(240px,calc(100vw - 32px));animation:fadeUp .25s ease;}
/* The little "Smira says…" teaser bubble that appears above the closed
   chat button. Sized relative to the viewport (min() with a vw-based
   ceiling) so it can never cause horizontal overflow on narrow phones,
   and positioned from the same safe-area tokens as the button it sits
   above of, rather than a hand-picked pixel offset. */
.chat-teaser{position:fixed;bottom:calc(102px + var(--safe-b));right:calc(28px + var(--safe-r));z-index:198;max-width:min(220px,calc(100vw - 56px - var(--safe-l) - var(--safe-r)));background:var(--card);border:1px solid var(--border);border-radius:14px 14px 4px 14px;padding:11px 14px;box-shadow:0 8px 28px rgba(0,0,0,.5);}
@media(max-width:768px){
  .chat-teaser{bottom:calc(var(--bottom-nav-h) + var(--safe-b) + 14px + 54px + 12px);right:var(--mobile-safe-right);max-width:min(200px,calc(100vw - 2 * var(--mobile-safe-right) - 24px));}
}
.mood-btn{padding:10px 14px;border-radius:14px;border:1px solid var(--border);background:var(--inp-bg);cursor:pointer;transition:all .2s;display:flex;flex-direction:column;align-items:center;gap:4px;}
.mood-btn.sel,.mood-btn:hover{background:var(--petal);border-color:${t.rose};transform:scale(1.05);}
/* ── Mobile bottom navigation — the primary 5-destination tab bar.
   Hidden on desktop; the media query below is the only place it's shown. */
.smira-bottom-nav{display:none;}
/* Base (desktop) sizing/position for the sidebar now lives entirely in
   CSS — declared here, BEFORE the mobile media query below, so the
   media query's override wins on mobile purely by normal cascade order
   (equal specificity, later rule wins). Previously the JSX set
   position:"sticky" (and width, etc.) as an INLINE style, and the mobile
   media query tried to override it with position:fixed via a plain class
   rule — but inline styles always beat a non-!important external rule,
   so on mobile the sidebar silently stayed position:sticky. A sticky
   element is still in normal document flow, so even though it was
   visually pushed off-screen with transform:translateX(-100%) (transform
   does NOT remove an element from layout), it kept reserving its full
   236px in the flex row next to app-main — squeezing all of the real
   content, including chat bubbles, into a razor-thin column and
   collapsing their text to one word per line. Keeping all of this in the
   stylesheet, with the override declared strictly after it, means the
   mobile behavior just works with no specificity fight to lose.

   Desktop now uses position:fixed rather than position:sticky. Sticky
   only pins an element within its containing block/nearest scroll
   container — any ancestor that ends up creating its own scroll/stacking
   context (easy to reintroduce by accident in a codebase this size) is
   enough to make a "stuck" sidebar drift upward with the page again.
   Fixed positioning pins directly to the viewport regardless of any
   ancestor's overflow/transform setup, which is what actually guarantees
   "the sidebar never moves while the content scrolls". Since a fixed
   element is taken out of normal flow, .app-main below carries an
   explicit margin-left equal to the sidebar's width to reserve its
   space (mobile still zeroes this out, same as before). */
.app-sidebar{width:236px;height:100vh;height:100dvh;position:fixed;top:0;left:0;z-index:60;flex-shrink:0;}
.app-main{margin-left:236px;}
@media(max-width:768px){
  :root{
    /* Real fallback for the mobile bottom nav's height; BottomNav's
       ResizeObserver overwrites this with the true measured height as
       soon as it mounts/resizes, so the chat widget's clearance is always
       correct even if the nav's content or font size changes. */
    --bottom-nav-h:64px;
  }
  .hide-mobile{display:none!important;}
  .dash-grid{grid-template-columns:1fr!important;}
  .app-sidebar{transform:translateX(-100%);transition:transform .3s;position:fixed;z-index:100;height:100vh;height:100dvh;}
  .app-sidebar.open{transform:translateX(0);}
  .app-main{margin-left:0!important;padding-bottom:calc(var(--bottom-nav-h) + var(--safe-b))!important;}
  .hamburger{display:flex!important;}
  .smira-bottom-nav{display:flex!important;}
  /* Chat widget clearance = bottom-nav height + safe area + a fixed gap,
     computed from the shared tokens above rather than a magic number, so
     it can never end up underneath (or floating awkwardly far above) the
     nav regardless of device or nav content changes. */
  .floating-btn{bottom:calc(var(--bottom-nav-h) + var(--safe-b) + 14px);right:var(--mobile-safe-right);width:54px;height:54px;}
  .floating-panel{
    bottom:calc(var(--bottom-nav-h) + var(--safe-b) + 14px);
    left:var(--mobile-safe-left);
    right:var(--mobile-safe-right);
    width:auto;
    /* Height is capped against the *current* viewport, not one phone's
       fixed pixel value: min() with dvh means the panel always fits
       between its bottom offset and the top of the screen. dvh is
       re-declared after the vh fallback so it wins wherever supported;
       browsers that don't recognize dvh simply keep the vh value. */
    max-height:min(60vh,calc(100vh - var(--bottom-nav-h) - var(--safe-b) - var(--safe-t) - 28px))!important;
    max-height:min(60dvh,calc(100dvh - var(--bottom-nav-h) - var(--safe-b) - var(--safe-t) - 28px))!important;
  }
  .floating-mini-bar{bottom:calc(var(--bottom-nav-h) + var(--safe-b) + 14px);right:var(--mobile-safe-right);}
  .r-col{grid-template-columns:1fr!important;}
  /* iOS Safari auto-zooms the page when a focused input's font-size is
     under 16px — this is the single most common "broken on mobile" cause
     for forms. Force every text input/select/textarea to 16px on mobile,
     overriding any smaller inline font-size. */
  input,select,textarea{font-size:16px!important;}
  /* Buttons/links should be comfortably tappable (~44px) on touch
     devices — pads up any smaller interactive elements without changing
     their visual size. */
  button,a{min-height:44px;}
}
/* Landscape phones (short viewport height): the 60dvh cap above can get
   uncomfortably small once you also subtract the nav + safe areas, so
   relax the cap to more of the available height when there just isn't
   much of it to begin with. Still fully viewport-derived, never a fixed
   px height tied to one device. */
@media(max-width:768px) and (max-height:480px){
  .floating-panel{
    max-height:min(78vh,calc(100vh - var(--bottom-nav-h) - var(--safe-b) - var(--safe-t) - 16px))!important;
    max-height:min(78dvh,calc(100dvh - var(--bottom-nav-h) - var(--safe-b) - var(--safe-t) - 16px))!important;
  }
}
/* Applies everywhere, not just mobile: removes the gray flash on tap
   (looks broken on Android Chrome especially) and cuts the ~300ms delay
   browsers add before registering a tap, which makes the whole app feel
   noticeably more responsive on touch devices. */
button,a,.tab-btn,.check-row,.floating-btn,.floating-mini-bar{-webkit-tap-highlight-color:transparent;touch-action:manipulation;}
/* Only ever mounted (in JSX) while the sidebar is actually open, so this
   no longer needs a display:none/block toggle at all — it simply exists
   or doesn't. animation gives it a quick fade-in instead of popping in. */
.sidebar-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99;animation:fadeUp .2s ease;}
.hamburger{display:none;background:none;border:none;cursor:pointer;padding:8px;color:#D4879A;flex-direction:column;gap:5px;}
.show-mobile{display:none;}
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
    bell:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
    calendar:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    camera:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>,
    search:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
    play:<svg width={s} height={s} fill={c} stroke="none" viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3"/></svg>,
    skipBack:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>,
    skipFwd:<svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>,
  };
  return d[n]||null;
};

const SmiraAvatar=({state="neutral",size=80,portrait=false,animate=false})=>{
  const [err,setErr]=useState(false);
  const src=AV[state]||AV.neutral;
  if(portrait){
    if(err)return<div style={{width:"100%",height:size,background:"linear-gradient(135deg,#8B3A57,#D4879A)",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:20}}><span style={{fontFamily:"Playfair Display,serif",fontSize:60,color:"#F5E6EA",fontWeight:600}}>S</span></div>;
    return<img src={src} alt="Smira" style={{width:"100%",height:size,objectFit:"cover",objectPosition:"50% 12%",borderRadius:20,display:"block"}} onError={()=>setErr(true)}/>;
  }
  if(err)return<div style={{width:size,height:size,borderRadius:"50%",background:"linear-gradient(135deg,#8B3A57,#D4879A)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,border:"2px solid rgba(212,135,154,.3)",animation:animate?"heartbeat 2.5s ease-in-out infinite":"none"}}><span style={{fontFamily:"Playfair Display,serif",fontSize:size*.38,color:"#F5E6EA",fontWeight:600}}>S</span></div>;
  return<img src={src} alt="Smira" style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",objectPosition:"50% 12%",flexShrink:0,border:"2px solid rgba(212,135,154,.3)",animation:animate?"heartbeat 2.5s ease-in-out infinite":"none"}} onError={()=>setErr(true)}/>;
};

const SmiraMsg=({state="neutral",text,size=46})=>(
  <div style={{display:"flex",gap:12,alignItems:"flex-end"}}>
    <SmiraAvatar state={state} size={size}/>
    {/* minWidth:0 is a defensive guard, not a visual change: a flex item's
       default min-width is "auto" (effectively its longest word's width),
       which can fight the shrink algorithm in extreme edge cases. This
       keeps the bubble hugging its content exactly as before (no flex-grow
       added) while making sure it can never get stuck fighting for space
       it doesn't have. The real narrow-viewport collapse bug this was
       chasing turned out to be upstream, in <Sidebar> — see app-sidebar. */}
    <div style={{minWidth:0,maxWidth:"min(84%,560px)",padding:"13px 16px",borderRadius:"16px 16px 16px 4px",background:"var(--petal)",border:"1px solid var(--border)"}}>
      <p style={{fontSize:13.5,color:"var(--soft)",lineHeight:1.75,fontStyle:"italic"}}>{text}</p>
    </div>
  </div>
);

const MPOOLS={
  morning:["Starting your day with intention is one of the most powerful things you can do for your skin.","Your skin worked hard to repair itself overnight. Let's give it the care it deserves.","Every morning you show up for yourself is a win worth celebrating.","The way you begin your morning sets the tone for your whole day.","Your skin is ready for today. A little hydration, some SPF, and you're glowing."],
  night:["Your skin does its deepest repair while you sleep. Don't skip that cleanse.","A thorough cleanse tonight means a clearer tomorrow.","Between 11 PM and 2 AM, your skin produces the most collagen. Sleep is your best serum.","Tonight's consistency builds tomorrow's confidence.","A calm nervous system supports healthy skin as much as any product."],
  analysis:["I'm reading your skin with care. Every detail helps me give you the most personalized insights.","Taking a careful look at what your skin is telling us today.","Your skin has a story. I'm here to help you understand it with compassion, not criticism.","Analyzing thoughtfully. Whatever I find, it doesn't change how worthy you are.","Looking at your skin the way a caring friend would. With curiosity, not judgment."],
  progress:["You've come further than you think. Progress isn't always visible. But it's always happening.","Every habit completed, every glass of water. It all adds up to something beautiful.","Consistency is the most underrated form of self-care. You're doing it.","Look how far you've come. That took real showing up.","Small steps taken consistently create lasting transformations."],
  confidence:["Your confidence isn't measured by how clear your skin is. It's built by how consistently you choose yourself.","You are worthy of care exactly as you are right now.","Confidence isn't something you find. It's built one small act of self-love at a time.","The most radiant thing about you is that you keep showing up for yourself.","Your skin tells a story of where you've been. That story is worth honoring."],
  wellness:["Wellness isn't about perfection. It's about being consistent with things that make you feel good.","Water, sleep, movement, care. These aren't luxuries. They're the foundation.","Taking care of yourself isn't selfish. It's essential.","Your body communicates with you all the time. Listening is one of the wisest things you can do.","True wellness lives at the intersection of what you eat, how you rest, and how you speak to yourself."],
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
  if(streak===0)return`Hi ${n}. Every journey starts with a single day. Today is yours. Let's begin something meaningful together.`;
  if(done===total&&total>0)return`${n}, you've completed all your habits today. I'm genuinely proud of you. That kind of consistency is rare.`;
  if(h<12)return`Good morning, ${n}. Your skin repaired itself overnight. Let's start the day with intention.`;
  if(h<17)return`How are you doing today, ${n}? Remember to stay hydrated. Your skin will thank you.`;
  if(h<21)return`Evening, ${n}. Don't skip your night routine. It's one of the most powerful things you can do.`;
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

const Ring=({score,size=110,label="",color="var(--soft)",subtitle=""})=>{
  const [s,setS]=useState(0);
  useEffect(()=>{const t=setTimeout(()=>setS(score),120);return()=>clearTimeout(t);},[score]);
  const r=(size-16)/2,circ=2*Math.PI*r,off=circ-(s/100)*circ;
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth="6"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6" strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" style={{transition:"stroke-dashoffset 1.4s ease"}}/>
        <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle" style={{fill:"var(--txt)",fontSize:size/5,fontWeight:700,fontFamily:"Poppins",transform:`rotate(90deg)`,transformOrigin:`${size/2}px ${size/2}px`}}>{s}</text>
        <text x={size/2} y={size/2+size/5.5} textAnchor="middle" dominantBaseline="middle" style={{fill:"var(--muted)",fontSize:size/10,fontFamily:"Poppins",transform:`rotate(90deg)`,transformOrigin:`${size/2}px ${size/2}px`}}>/100</text>
      </svg>
      {label&&<span style={{fontSize:12,color:"var(--muted)",fontWeight:500}}>{label}</span>}
      {subtitle&&<span style={{fontSize:10,color:"var(--muted)"}}>{subtitle}</span>}
    </div>
  );
};
const ConfBar=({pct,color="var(--soft)"})=>{
  const [w,setW]=useState(0);
  useEffect(()=>{const t=setTimeout(()=>setW(pct),200);return()=>clearTimeout(t);},[pct]);
  return<div className="pbar"><div className="pfill" style={{width:`${w}%`,background:`linear-gradient(90deg,${color}60,${color})`}}/></div>;
};

const EmptyState=({avatarState="welcome",img,title,message,actionLabel,onAction,naturalImg=false})=>(
  <div style={{padding:"60px 24px",textAlign:"center",maxWidth:400,margin:"0 auto"}}>
    {img?(
      <img src={img} alt="" style={{width:150,height:150,margin:"0 auto 20px",objectFit:"contain",display:"block"}}/>
    ):naturalImg?(
      /* Same Smira avatar artwork as the boxed variant below, but shown
         at its full, natural proportions: no fixed box, no overflow:hidden
         crop, no border — just the whole illustration with objectFit
         "contain" (never "cover") so nothing is cut off, centered with
         its own whitespace. Opt-in via `naturalImg` so every other
         EmptyState call (which still wants the small boxed portrait)
         is completely unaffected. */
      <img src={AV[avatarState]||AV.neutral} alt="" style={{width:"100%",maxWidth:220,height:"auto",objectFit:"contain",margin:"0 auto 22px",display:"block"}}/>
    ):(
      <div style={{width:110,height:132,margin:"0 auto 22px",borderRadius:22,overflow:"hidden",border:"2px solid var(--border)"}}>
        <SmiraAvatar state={avatarState} portrait size={132}/>
      </div>
    )}
    <h3 className="cf" style={{fontSize:26,fontWeight:600,marginBottom:10,color:"var(--txt)"}}>{title}</h3>
    <p style={{color:"var(--muted)",fontSize:14,lineHeight:1.75,marginBottom:onAction?24:0}}>{message}</p>
    {onAction&&<button className="btn" onClick={onAction} style={{padding:"12px 32px"}}>{actionLabel}</button>}
  </div>
);
/* Shared skeleton loader — shimmering placeholder blocks shown while async
   content (AI results, charts, generated plans) loads, instead of a blank
   page or spinner. `rows` controls how many placeholder lines render. */
const Skeleton=({rows=3,height=16,gap=10,style={}})=>(
  <div style={{display:"flex",flexDirection:"column",gap,...style}}>
    {Array.from({length:rows},(_,i)=>(
      <div key={i} style={{height,borderRadius:8,width:i===rows-1?"60%":"100%",background:"linear-gradient(90deg,var(--petal) 25%,var(--border) 37%,var(--petal) 63%)",backgroundSize:"400% 100%",animation:"shimmer 1.6s ease-in-out infinite"}}/>
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
      {online?"Back online. Your data will sync now.":"You're offline. Some features (AI scan, coach, weather) need a connection. Your local data is still safe."}
    </div>
  );
};
const ErrorBox=({message,onRetry})=>(
  <div style={{padding:"22px",background:"var(--petal)",border:"1px solid var(--border)",borderRadius:18,textAlign:"center",marginBottom:16}}>
    <div style={{width:80,height:96,margin:"0 auto 14px",borderRadius:16,overflow:"hidden"}}>
      <SmiraAvatar state="empathy" portrait size={96}/>
    </div>
    <p style={{fontSize:14,color:"var(--txt)",lineHeight:1.7,marginBottom:14}}>
      <strong style={{color:"var(--soft)",display:"block",marginBottom:4}}>Something didn't go as planned.</strong>
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
    {name:"Cetaphil Gentle Cleanser",brand:"Cetaphil",price:"₹599",tier:"Budget",rating:4.4,ing:["Glycerin","Niacinamide"],benefit:"Ultra-gentle for sensitive & dry skin",for:["Dry","Sensitive","Normal"],why:"Smira's top pick for reactive or new-to-skincare skin. Won't disrupt your barrier."},
    {name:"CeraVe Foaming Cleanser",brand:"CeraVe",price:"₹699",tier:"Budget",rating:4.5,ing:["Niacinamide","Ceramides","Hyaluronic Acid"],benefit:"Removes oil while maintaining barrier",for:["Oily","Combination","Acne"],why:"Ceramides repair while it cleanses. Rare and brilliant in a budget option."},
    {name:"Simple Kind to Skin Cleanser",brand:"Simple",price:"₹399",tier:"Budget",rating:4.2,ing:["Pro-Vitamin B5","Vitamin E"],benefit:"Zero fragrance, zero colour. Pure clean",for:["Sensitive","Normal","Dry"],why:"Minimal ingredients, maximum gentleness. Perfect starting point."},
    {name:"COSRX Low pH Good Morning Gel",brand:"COSRX",price:"₹1,099",tier:"Mid",rating:4.6,ing:["Tea Tree","Willow Bark Extract"],benefit:"pH-balancing cleanse that preps skin for actives",for:["Acne","Oily","Combination"],why:"The right pH is crucial for actives to work. This sets the stage perfectly."},
    {name:"La Roche-Posay Effaclar Purifying",brand:"La Roche-Posay",price:"₹1,299",tier:"Mid",rating:4.7,ing:["Salicylic Acid","Zinc"],benefit:"Clinical-grade acne and oiliness control",for:["Acne","Oily"],why:"Dermatologist-formulated, gentle enough for daily use on acne-prone skin."},
    {name:"Beauty of Joseon Low pH Cleanser",brand:"Beauty of Joseon",price:"₹1,149",tier:"Mid",rating:4.5,ing:["Rice Water","Green Plum"],benefit:"Brightening + balanced pH cleanse",for:["Hyperpigmentation","Dull","All"],why:"Traditional Korean brightening ingredients in a thoughtful modern formula."},
    {name:"Tatcha The Rice Wash",brand:"Tatcha",price:"₹3,499",tier:"Premium",rating:4.8,ing:["Japanese Rice","Green Tea","Hyaluronic Acid"],benefit:"Gentle brightening deep cleanse",for:["All"],why:"The most luxurious daily cleanse. Leaves skin visibly glowing and soft."},
    {name:"La Mer Cleansing Gel",brand:"La Mer",price:"₹8,500",tier:"Luxury",rating:4.9,ing:["Miracle Broth","Sea Kelp"],benefit:"Ultra-luxe barrier-strengthening cleanse",for:["All"],why:"The ultimate luxury cleanser. Miracle Broth in every drop."},
  ],
  serum:[
    {name:"Minimalist Niacinamide 10% + Zinc",brand:"Minimalist",price:"₹399",tier:"Budget",rating:4.6,ing:["Niacinamide 10%","Zinc 1%"],benefit:"Pore minimizing, oil control, brightening",for:["Oily","Combination","Acne","Hyperpigmentation"],why:"The best budget serum for most skin types. Evidence-backed, simple formula."},
    {name:"Minimalist Alpha Arbutin 2%",brand:"Minimalist",price:"₹449",tier:"Budget",rating:4.5,ing:["Alpha Arbutin 2%","Hyaluronic Acid"],benefit:"Fades dark spots and pigmentation gently",for:["Hyperpigmentation","Dark Circles","Dull"],why:"Safer than hydroquinone. Works for all skin tones to brighten evenly."},
    {name:"Derma Co 10% Vitamin C",brand:"Derma Co",price:"₹549",tier:"Budget",rating:4.3,ing:["Vitamin C 10%","Ferulic Acid"],benefit:"Antioxidant brightening at an accessible price",for:["Dull","Hyperpigmentation","All"],why:"Ferulic acid stabilizes the Vitamin C. A thoughtful budget formula."},
    {name:"COSRX Advanced Snail 96 Mucin",brand:"COSRX",price:"₹1,399",tier:"Mid",rating:4.8,ing:["Snail Secretion 96%","Sodium Hyaluronate"],benefit:"Deep repair, hydration, and scar fading",for:["Acne","Scarring","Dry","Sensitive"],why:"One of the most healing serums available. Loved by millions worldwide."},
    {name:"Isntree C-Niacin Toning Ampoule",brand:"Isntree",price:"₹1,299",tier:"Mid",rating:4.6,ing:["Vitamin C","Niacinamide","Ginseng"],benefit:"Brightening + skin tone evening combo serum",for:["Dull","Hyperpigmentation","Combination"],why:"Vitamin C + Niacinamide together is a powerful brightening stack."},
    {name:"Paula's Choice BHA 2%",brand:"Paula's Choice",price:"₹2,199",tier:"Mid",rating:4.8,ing:["Salicylic Acid 2%","Green Tea"],benefit:"Unclogs pores deeply, prevents breakouts",for:["Acne","Blackheads","Oily"],why:"The industry gold standard for BHA. Gentle enough for daily use."},
    {name:"Sunday Riley Good Genes",brand:"Sunday Riley",price:"₹5,499",tier:"Premium",rating:4.7,ing:["Lactic Acid","Licorice Root"],benefit:"Overnight brightening + texture refinement",for:["Dull","Uneven Texture","Hyperpigmentation"],why:"Instant glow results. Lactic acid is the gentlest exfoliating acid."},
    {name:"SkinCeuticals C E Ferulic",brand:"SkinCeuticals",price:"₹8,999",tier:"Luxury",rating:4.9,ing:["Vitamin C 15%","Vitamin E","Ferulic Acid"],benefit:"Gold standard antioxidant protection + glow",for:["Hyperpigmentation","Dullness","Anti-Aging"],why:"The most studied Vitamin C serum in skincare history. Results are real."},
  ],
  moisturizer:[
    {name:"Neutrogena Hydro Boost",brand:"Neutrogena",price:"₹799",tier:"Budget",rating:4.5,ing:["Hyaluronic Acid","Glycerin"],benefit:"Lightweight deep hydration for all skin types",for:["Dry","Dehydration","Normal","All"],why:"Clinically proven to hydrate deeper layers. A Smira favourite for dry spells."},
    {name:"Cetaphil Moisturizing Cream",brand:"Cetaphil",price:"₹699",tier:"Budget",rating:4.4,ing:["Glycerin","Niacinamide","Allantoin"],benefit:"Barrier-repairing richness for dry skin",for:["Dry","Sensitive","Eczema"],why:"The OG of gentle moisturizers. Recommended by dermatologists everywhere."},
    {name:"Dot & Key Water Drench Gel",brand:"Dot & Key",price:"₹649",tier:"Budget",rating:4.3,ing:["Hyaluronic Acid","Ceramides","Cica"],benefit:"Lightweight intensely hydrating gel cream",for:["Combination","Oily","Normal"],why:"Feels like water on skin. Great for Indian humid climates."},
    {name:"COSRX Oil-Free Ultra Moisturizing",brand:"COSRX",price:"₹1,199",tier:"Mid",rating:4.5,ing:["Birch Sap 70%","Ceramides"],benefit:"Hydration without heaviness for oily skin",for:["Oily","Combination","Acne"],why:"70% birch sap gives exceptional hydration. Zero pore-clogging risk."},
    {name:"Isntree Hyaluronic Acid Moist Cream",brand:"Isntree",price:"₹1,349",tier:"Mid",rating:4.6,ing:["Hyaluronic Acid","Ceramides","Panthenol"],benefit:"Multi-weight HA for barrier repair and glow",for:["Dry","Dehydration","Sensitive"],why:"Multiple HA molecular weights hydrate at every skin layer simultaneously."},
    {name:"Kiehl's Ultra Facial Cream",brand:"Kiehl's",price:"₹2,800",tier:"Mid",rating:4.7,ing:["Squalane","Glacial Glycoprotein"],benefit:"Long-lasting barrier repair in all climates",for:["Dry","Sensitive","All"],why:"Adapts to any humidity. Works whether you're in Mumbai or mountains."},
    {name:"Tatcha The Water Cream",brand:"Tatcha",price:"₹4,999",tier:"Premium",rating:4.8,ing:["Japanese Wild Rose","Hyaluronic Acid"],benefit:"Pore-refining water-burst hydration",for:["Oily","Combination","Large Pores"],why:"The most beautiful gel moisturizer texture. Pore-refining magic."},
    {name:"La Mer Crème de la Mer",brand:"La Mer",price:"₹18,500",tier:"Luxury",rating:4.9,ing:["Miracle Broth","Sea Kelp"],benefit:"Ultimate regeneration and skin transformation",for:["All"],why:"The most iconic moisturizer in the world. For visible skin renewal."},
  ],
  sunscreen:[
    {name:"Minimalist SPF 50 PA++++",brand:"Minimalist",price:"₹349",tier:"Budget",rating:4.6,ing:["Zinc Oxide","Hyaluronic Acid"],benefit:"Invisible finish, broad spectrum daily protection",for:["All"],why:"The best budget SPF in India. Zero white cast, feels like water."},
    {name:"Biore UV Aqua Rich Watery Essence",brand:"Biore",price:"₹899",tier:"Budget",rating:4.8,ing:["Uvinul A Plus","Tinosorb S","Hyaluronic Acid"],benefit:"Ultra-lightweight, water-resistant, no white cast",for:["Oily","Combination"],why:"Japanese SPF technology is years ahead. This is beloved globally."},
    {name:"La Roche-Posay Anthelios UVMune 400",brand:"La Roche-Posay",price:"₹1,699",tier:"Mid",rating:4.8,ing:["Mexoryl 400","SPF 50+","Thermal Spring Water"],benefit:"Europe's highest UVA protection for sensitive skin",for:["Sensitive","Acne","All"],why:"Protects against UVA wavelengths that cause aging and DNA damage."},
    {name:"Isntree Hyaluronic Acid Watery Sun Gel",brand:"Isntree",price:"₹1,199",tier:"Mid",rating:4.7,ing:["Hyaluronic Acid","Ceramides","SPF 50+"],benefit:"Barrier-strengthening hydration + high protection",for:["Dry","Sensitive","Combination"],why:"The most hydrating SPF available. Skin actually glows wearing this."},
    {name:"Supergoop Unseen Sunscreen SPF 40",brand:"Supergoop",price:"₹3,200",tier:"Premium",rating:4.9,ing:["SPF 40","Meadowfoam Seed","Red Algae"],benefit:"Invisible primer + protection in one",for:["All"],why:"Grips makeup perfectly while being completely invisible on skin."},
  ],
  toner:[
    {name:"Pyunkang Yul Essence Toner",brand:"Pyunkang Yul",price:"₹1,099",tier:"Mid",rating:4.7,ing:["Milk Vetch Root 91%","Ceramides"],benefit:"Intensive hydration, minimal ingredients",for:["Dry","Sensitive","Dehydration"],why:"91% milk vetch root. The most concentrated hydrating toner available."},
    {name:"COSRX AHA/BHA Clarifying Toner",brand:"COSRX",price:"₹1,149",tier:"Mid",rating:4.5,ing:["Lactic Acid 0.1%","Salicylic Acid 0.1%"],benefit:"Gentle daily exfoliation for brighter skin",for:["Acne","Dull","Combination"],why:"Mild enough for daily use. Preps skin to absorb serums beautifully."},
    {name:"Beauty of Joseon Green Plum Toner",brand:"Beauty of Joseon",price:"₹1,099",tier:"Mid",rating:4.6,ing:["Green Plum","Niacinamide","Panthenol"],benefit:"Pore tightening + bright, fresh finish",for:["Oily","Combination","Acne"],why:"Actively brightens while controlling excess oil. A rare combo."},
    {name:"Some By Mi AHA BHA PHA 30 Days",brand:"Some By Mi",price:"₹1,299",tier:"Mid",rating:4.4,ing:["AHA","BHA","PHA","Niacinamide"],benefit:"Triple exfoliation for clear, even skin",for:["Acne","Hyperpigmentation","Oily"],why:"A complete exfoliating system that shows visible results in 30 days."},
  ],
};

const TIPS=[
  "Your skin is not a problem to fix. It's a living part of you that deserves care, not criticism.",
  "Consistency matters more than perfection. One missed day won't undo weeks of progress.",
  "Beauty sleep is real: your skin rebuilds collagen between 11 PM and 2 AM. Rest is self-care.",
  "Omega-3 rich foods like walnuts and flaxseed reduce skin inflammation from the inside out.",
  "Niacinamide works for almost every skin type. Brightening, pore-minimizing, and calming.",
  "Stress is one of the biggest triggers for breakouts. Taking a breath is skincare too.",
  "High sugar spikes insulin, which increases androgen hormones linked to breakouts.",
  "You are worthy of care exactly as you are right now. Not after your skin changes.",
  "Cleansing for 60 seconds is significantly more effective than a quick rinse.",
  "Your phone touches your face constantly. Clean it daily to reduce bacterial transfer.",
  "SPF is the single most anti-aging thing you can do. Non-negotiable, rain or shine.",
  "Skin purging from new actives is temporary. Give a routine at least 6 weeks before judging.",
];
const SkinTip=()=>{
  const [idx,setIdx]=useState(()=>Math.floor(Math.random()*TIPS.length));
  const [k,setK]=useState(0);
  const next=()=>{setIdx(i=>(i+1)%TIPS.length);setK(x=>x+1);};
  return(
    <div role="button" tabIndex={0} aria-label="Get another skin tip" className="kb-focusable" style={{padding:"16px 20px",borderRadius:16,background:"var(--petal)",border:"1px solid var(--border)",cursor:"pointer",display:"flex",gap:12,alignItems:"flex-start"}} onClick={next} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();next();}}}>
      <SmiraAvatar state="coach" size={34}/>
      <div style={{flex:1}}>
        <div style={{fontSize:10,color:"var(--soft)",fontWeight:600,marginBottom:5,textTransform:"uppercase",letterSpacing:".07em"}}>Smira's Reminder · tap to refresh</div>
        <p key={k} className="fade-up" style={{fontSize:13,color:"var(--txt)",lineHeight:1.75}}>{TIPS[idx]}</p>
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
const confColor=(s)=>s>=70?"#4FA876":s>=50?"var(--soft)":"var(--wine)";

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
    const e=new Error("Network error. Please check your connection and try again.");e.code="NETWORK";throw e;
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
  if(e?.status===429)return"Smira is a little busy right now. Please wait a moment and try again.";
  if(e?.status>=500)return"Smira's AI service is temporarily unavailable. Please try again shortly.";
  return e?.message||"Something didn't go as planned. Please try again.";
};

const runVisionAnalysis=async(imgData,user,prevScan)=>{
  const resized=await resizeImg(imgData);
  const mediaType=getMediaType(resized);
  const base64Data=resized.split(",")[1];
  const system=`You are a compassionate dermatologist AI for Smira. Analyze facial skin from photos with care and empathy. CRITICAL: Never imply skin conditions reduce beauty. Frame everything supportively. Return ONLY valid JSON, no markdown fences.`;
  const conditions=["pcos","pcod","thyroid","diabetes"].filter(k=>user?.[k]).join(", ")||"none reported";
  const trendCtx=prevScan?`Previous scan (${prevScan.date}): overall score ${prevScan.overallScore}, hydration ${prevScan.hydrationLevel}, brightness ${prevScan.brightness}, elasticity ${prevScan.elasticity}, concerns: ${(prevScan.concerns||[]).map(c=>c.name).join(", ")||"none"}. Reference this trend naturally in aiSummary where relevant (e.g. noting improvement or a new concern). Don't just restate the numbers.`:"This is their first tracked scan. No prior trend to compare.";
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
  const system=`You are a compassionate nutrition AI for Smira, connecting diet to skin health. Return ONLY valid JSON, no markdown fences. Never shame food choices. Frame everything as nourishing, achievable additions.`;
  const budgetGuide={Low:"very affordable, everyday local ingredients, no specialty/imported items",Medium:"moderate cost, some specialty items okay (nuts, specific oils)",Premium:"no cost constraint, can include imported superfoods and supplements"}[budget]||"moderate cost";
  const prompt=`Create a one-day ${dietType} meal plan for someone with these skin concerns: ${concerns}. Health conditions: ${conditions}. Skin type: ${results?.skinType||"unknown"}. Budget level: ${budget} (${budgetGuide}). Diet must be strictly ${dietType==="Vegetarian"?"vegetarian (no meat, fish, or eggs)":"non-vegetarian (can include meat, fish, eggs, and vegetarian items)"}.

Return JSON:
{
summary:string(1 sentence),

meals:{
breakfast:[{food,reason}](2 items),
lunch:[{food,reason}](2 items),
dinner:[{food,reason}](2 items),
snacks:[{food,reason}](2 items)
},

avoid:[{food,reason}](3 items),

keyNutrients:[{nutrient,sources}](3 items)
}

Keep every "reason" under 12 words.
Keep the summary under 20 words.
Do not include drinks.
Do not add extra explanations.
Return the smallest valid JSON only.
If you cannot fit the full response, reduce the number of meal items, but always return complete valid JSON. Never return partial JSON.

Every food choice must be realistic for the ${budget} budget tier and justified by their specific concerns — never generic "eat healthy" advice.`;
const text = await callGemini(
  [{ text: prompt }],
  {
    system,
    maxTokens: 4096,
    temperature: 0.4,
    timeoutMs: 60000,
    responseMimeType: "application/json"
  }
);

const cleaned = text
  .replace(/```json/g, "")
  .replace(/```/g, "")
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


/* ── SMIRA LOGO ───────────────────────────────────────────────────────────
   Uses the supplied brand-asset image as the single source of truth
   (raster, kept at native proportions, never redrawn). Referenced from
   one component so every usage across the app updates from one place. */
const AuraLogo=({size=56})=>(
  <img src="/smira/logo_new.png" alt="Smira" width={size} height={size} draggable={false} style={{flexShrink:0,objectFit:"contain",borderRadius:"50%",filter:`drop-shadow(0 2px ${size*.1}px rgba(41,40,92,.18))`}}/>
);

const LogoBrand=({size=56,showTagline=true,textColor="#29285C"})=>(
  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
    <AuraLogo size={size}/>
    <span className="cf" style={{fontSize:size*.5,fontWeight:700,letterSpacing:0,color:textColor,lineHeight:1}}>smira</span>
    {showTagline&&<span style={{fontSize:size*.16,color:"var(--muted)",letterSpacing:".04em",fontWeight:400,opacity:.85}}>A kinder you. Everyday.</span>}
  </div>
);

/* ── GARDEN DECORATION KIT ─────────────────────────────────────────────────
   Lightweight, dependency-free SVG butterflies + falling petals + sparkles,
   reused across Landing, Onboarding and anywhere the "magical garden" world
   needs to continue. Pure CSS animation — no framer-motion dependency. */
const Butterfly=({size=22,color="#D98CA3",style={},duration=7})=>(
  <div className="butterfly-wrap" style={{width:size,height:size,animationDuration:`${duration}s`,...style}}>
    <svg width={size} height={size} viewBox="0 0 40 40" style={{display:"block"}}>
      <g style={{transformOrigin:"20px 20px",animation:`wingFlap ${duration*.35}s ease-in-out infinite`}}>
        <path d="M19 18C15 8 4 6 3 12c-1 7 8 12 16 10z" fill={color} opacity=".92"/>
        <path d="M19 22C15 32 4 34 3 28c-1-7 8-12 16-10z" fill={color} opacity=".75"/>
      </g>
      <g style={{transformOrigin:"20px 20px",animation:`wingFlap ${duration*.35}s ease-in-out infinite reverse`}}>
        <path d="M21 18C25 8 36 6 37 12c1 7-8 12-16 10z" fill={color} opacity=".92"/>
        <path d="M21 22C25 32 36 34 37 28c1-7-8-12-16-10z" fill={color} opacity=".75"/>
      </g>
      <ellipse cx="20" cy="20" rx="1.4" ry="7" fill="#5C2C48"/>
    </svg>
  </div>
);
const PETAL_PALETTE=[
  {petal:"#D98A93",center:"#F0E2CC"}, // dusty strawberry, cream center
  {petal:"#C97F84",center:"#FDF8F0"}, // deep blush, ivory center
  {petal:"#E7C3C3",center:"#DCE4D3"}, // pale blush, sage center
  {petal:"#A3B394",center:"#F4DCDC"}, // sage bloom, blush center
  {petal:"#D9B08C",center:"#FDF8F0"}, // warm taupe, ivory center
];
/* A small 5-petal blossom, drawn (not an emoji glyph) so it renders
   identically everywhere — the previous falling "petals" used text
   characters (including ✿, a dingbat with poor emoji-font coverage),
   which is exactly what showed up as a stray tofu/question-mark box on
   devices without a matching glyph. */
const Flower=({size=14,palette=PETAL_PALETTE[0]})=>(
  <svg width={size} height={size} viewBox="0 0 24 24" style={{display:"block"}}>
    {[-90,-18,54,126,198].map((deg,idx)=>{
      const rad=deg*Math.PI/180;
      return<circle key={idx} cx={12+6*Math.cos(rad)} cy={12+6*Math.sin(rad)} r="4.6" fill={palette.petal} opacity=".92"/>;
    })}
    <circle cx="12" cy="12" r="3.1" fill={palette.center}/>
  </svg>
);
/* Warm, varied wing colours drawn from the same rose/lavender/peach/gold
   palette used throughout the app, instead of alternating between just
   two shades of pink. */
const BUTTERFLY_PALETTE=["#D98CA3","#F0C4CC","#C9A6DE","#F0B784","#EFA39A"];
const GardenScene=({butterflies=4,petals=6,sparkles=8,tint})=>{
  const seeds=useRef(Array.from({length:Math.max(butterflies,petals,sparkles)},(_,i)=>i));
  return(
    <div className="garden-scene">
      {tint&&<div style={{position:"absolute",inset:0,background:tint}}/>}
      {seeds.current.slice(0,petals).map(i=>(
        <span key={"p"+i} className="petal" style={{left:`${(i*17+7)%100}%`,animationDuration:`${9+(i%5)*2.4}s`,animationDelay:`${i*1.3}s`}}>
          <Flower size={12+((i*7)%10)} palette={PETAL_PALETTE[i%PETAL_PALETTE.length]}/>
        </span>
      ))}
      {seeds.current.slice(0,butterflies).map(i=>(
        <Butterfly key={"b"+i} size={16+((i*5)%14)} duration={6+(i%4)*1.8} color={BUTTERFLY_PALETTE[i%BUTTERFLY_PALETTE.length]} style={{top:`${12+((i*19)%60)}%`,left:`${8+((i*23)%80)}%`,animationDelay:`${i*.9}s`}}/>
      ))}
      {seeds.current.slice(0,sparkles).map(i=>(
        <span key={"s"+i} className="sparkle-dot" style={{width:3+((i*3)%4),height:3+((i*3)%4),top:`${(i*13+5)%100}%`,left:`${(i*29+11)%100}%`,animationDuration:`${2+(i%3)}s`,animationDelay:`${i*.4}s`}}/>
      ))}
    </div>
  );
};
/* ── BOTANICAL BACKGROUND SYSTEM ───────────────────────────────────────────
   The reusable atmosphere behind every app screen: a couple of large,
   heavily-blurred blooms far in the background, plus one or two small sharp
   sprigs placed intentionally near the edge of the content. This is meant to
   read as "a very soft lavender room", not glassmorphism — no blur is applied
   to any readable surface, only to these decorative layers, and both layers
   sit at low opacity behind pointer-events:none so they never block taps.
   Pick a `variant` per screen so the botanical language stays intentional
   (water drops for Hydration, moon phases for Sleep, etc.) rather than
   sprinkled at random. */
const DECOR="/smira/decor/";
const BOTANICAL_VARIANTS={
  home:{blurred:["08_08_flower_large_lavender.png","06_06_botanical_lavender_stem.png"],sharp:["21_21_two_leaf_sprig.png","22_22_sparkle_large_purple.png"]},
  skin:{blurred:["10_10_flower_deep_lavender.png","01_01_botanical_lavender_sprig.png"],sharp:["30_30_water_drop.png","23_23_sparkle_small_pink.png"]},
  routine:{blurred:["13_13_flower_pink_cluster.png","05_05_botanical_sage_branch.png"],sharp:["04_04_botanical_pink_leaf_sprig.png"]},
  hydration:{blurred:["32_32_soft_cloud.png","30_30_water_drop.png"],sharp:["30_30_water_drop.png","02_02_botanical_sage_sprig.png"]},
  nutrition:{blurred:["09_09_flower_dusty_pink.png","17_17_botanical_berry_branch.png"],sharp:["18_18_flower_small_white.png"]},
  sleep:{blurred:["26_26_crescent_moon.png","35_35_moon_phases_group.png"],sharp:["28_28_sparkle_gold_small.png"]},
  journal:{blurred:["11_11_flower_blush.png","36_36_floral_vine.png"],sharp:["19_19_pink_petals_pair.png"]},
  cycle:{blurred:["35_35_moon_phases_group.png","03_03_botanical_purple_branch.png"],sharp:["26_26_crescent_moon.png"]},
  glow:{blurred:["15_15_botanical_purple_cluster.png","39_39_flower_single_lavender.png"],sharp:["24_24_sparkle_large_gold.png","37_37_butterfly.png"]},
  default:{blurred:["08_08_flower_large_lavender.png","03_03_botanical_purple_branch.png"],sharp:["21_21_two_leaf_sprig.png"]},
};
const BotanicalBackground=({variant="default",children,style={}})=>{
  const set=BOTANICAL_VARIANTS[variant]||BOTANICAL_VARIANTS.default;
  return(
    <div style={{position:"relative",...style}}>
      <div style={{position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none",zIndex:0}} aria-hidden="true">
        {set.blurred[0]&&<img src={DECOR+set.blurred[0]} alt="" style={{position:"absolute",top:"-8%",right:"-10%",width:260,opacity:.28,filter:"blur(3px)"}}/>}
        {set.blurred[1]&&<img src={DECOR+set.blurred[1]} alt="" style={{position:"absolute",bottom:"-6%",left:"-8%",width:200,opacity:.22,filter:"blur(3px)",transform:"rotate(-12deg)"}}/>}
        {set.sharp[0]&&<img src={DECOR+set.sharp[0]} alt="" style={{position:"absolute",top:"6%",left:"2%",width:34,opacity:.9}}/>}
        {set.sharp[1]&&<img src={DECOR+set.sharp[1]} alt="" style={{position:"absolute",bottom:"8%",right:"4%",width:30,opacity:.85}}/>}
      </div>
      <div style={{position:"relative",zIndex:1}}>{children}</div>
    </div>
  );
};
/* Central glass bubble used on Landing — a translucent sphere holding the
   Smira mark, echoing the reference art without shipping it as a raster. */
const GlassBubble=({size=340,children})=>(
  <div style={{position:"relative",width:size,height:size,margin:"0 auto",animation:"bubbleFloat 7s ease-in-out infinite"}}>
    <div style={{position:"absolute",inset:0,borderRadius:"50%",background:"radial-gradient(circle at 32% 28%,rgba(255,255,255,.9),rgba(255,255,255,.15) 45%,rgba(255,255,255,.35) 100%)",boxShadow:"0 30px 80px rgba(154,72,100,.25),inset 0 0 0 1px rgba(255,255,255,.6),inset -14px -18px 40px rgba(201,125,149,.18),inset 14px 18px 30px rgba(255,255,255,.5)",backdropFilter:"blur(6px)"}}/>
    <div style={{position:"absolute",top:"12%",left:"18%",width:"26%",height:"14%",borderRadius:"50%",background:"rgba(255,255,255,.85)",filter:"blur(6px)",transform:"rotate(-18deg)"}}/>
    <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>{children}</div>
  </div>
);

/* ── SPLASH SCREEN ──────────────────────────────────────────────────────────── */
const GINGHAM="linear-gradient(rgba(253,248,240,.42),rgba(253,248,240,.42)),url(/smira/brand/gingham.jpg) center/300px repeat";
const Splash=({onDone,theme="dark"})=>{
  const t={...LIGHT_T,bodyBg:GINGHAM};
  useEffect(()=>{const timer=setTimeout(onDone,2800);return()=>clearTimeout(timer);},[onDone]);
  return(
    <div style={{minHeight:"100vh",background:t.bodyBg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:0,position:"relative",overflow:"hidden"}}>
      <GardenScene butterflies={4} petals={6} sparkles={8}/>
      <div style={{position:"absolute",width:420,height:420,borderRadius:"50%",background:`${t.rose}22`,filter:"blur(6px)",top:"10%",left:"15%",animation:"gPulse 4s ease-in-out infinite"}}/>
      <div style={{position:"absolute",width:320,height:320,borderRadius:"50%",background:`${t.wine}22`,filter:"blur(6px)",bottom:"10%",right:"10%",animation:"gPulse 5s ease-in-out infinite 1.5s"}}/>
      <div style={{animation:"fadeUp .9s ease forwards",textAlign:"center",zIndex:10}}>
        <div style={{marginBottom:28}}>
          <LogoBrand size={78} gold={t.gold} bg={theme==="light"?"#8B3A57":"#1A0B12"} textColor={t.soft} showTagline={true}/>
        </div>
        <p style={{color:t.muted,fontSize:13,letterSpacing:".04em",marginTop:16}}>Loading your wellness journey...</p>
        <div style={{marginTop:22,width:48,height:3,borderRadius:2,background:`linear-gradient(90deg,${t.berry},${t.rose})`,margin:"18px auto 0",animation:"shimmer 1.6s ease-in-out infinite",backgroundSize:"200% 100%"}}/>
      </div>
    </div>
  );
};

/* ── AUTH SCREENS ──────────────────────────────────────────────────────────── */
const AuthScreen=({onAuth,theme="dark"})=>{
  const __g=GINGHAM;
  const t={...LIGHT_T,bodyBg:GINGHAM};
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

  const cardBg=theme==="light"?"rgba(255,252,249,.9)":"rgba(46,14,31,.7)";
  return(
    <div style={{minHeight:"100vh",background:t.bodyBg,display:"flex",alignItems:"center",justifyContent:"center",padding:24,position:"relative",overflow:"hidden"}}>
      <GardenScene butterflies={3} petals={5} sparkles={6}/>
      <div style={{position:"absolute",width:400,height:400,borderRadius:"50%",background:`${t.coral}22`,filter:"blur(6px)",top:"-5%",right:"5%",animation:"gPulse 5s ease-in-out infinite"}}/>
      <div style={{position:"absolute",width:300,height:300,borderRadius:"50%",background:`${t.lav}22`,filter:"blur(6px)",bottom:"0%",left:"0%",animation:"gPulse 6s ease-in-out infinite 2s"}}/>
      <div style={{width:"100%",maxWidth:420,zIndex:10,animation:"fadeUp .5s ease"}}>
        {/* Brand header */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <LogoBrand size={62} gold={t.gold} bg={theme==="light"?"#8B3A57":"#1A0B12"} textColor={t.soft} showTagline={true}/>
        </div>
        <div className="glass glow" style={{background:cardBg,borderRadius:24,padding:"34px 30px"}}>
          <h2 className="cf" style={{fontSize:26,fontWeight:600,marginBottom:22,textAlign:"center",color:t.txt}}>
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
              <button onClick={googleAuth} disabled={loading} style={{width:"100%",padding:"13px",borderRadius:50,border:`1px solid ${t.border}`,background:theme==="light"?"rgba(139,58,87,.06)":"rgba(255,255,255,.04)",color:t.txt,fontSize:14,fontWeight:500,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,transition:"all .2s",fontFamily:"Poppins,sans-serif"}}>
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
const Settings=({user,authUser,onLogout,onUpdateProfile,onDeleteAccount,theme="light"})=>{
  const t=LIGHT_T;
  const [tab,setTab]=useState("profile");
  const [profile,setProfile]=useState({name:user?.name||authUser?.name||"",email:user?.email||authUser?.email||"",age:user?.age||"",skinType:user?.skinType||"Combination",skinGoal:user?.skinGoal||[]});
  const [notifs,setNotifs]=useState(()=>LS.get("notifs",{wellness:true,water:true,journal:false,weekly:true}));
  const [pwForm,setPwForm]=useState({current:"",next:"",confirm:""});
  const [saved,setSaved]=useState(false);
  const [pwMsg,setPwMsg]=useState("");
  const [confirmDelete,setConfirmDelete]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [deleteErr,setDeleteErr]=useState("");
  const [confirmReset,setConfirmReset]=useState(0);
  const [resetting,setResetting]=useState(false);
  const cardBg=t.card;
  const Card=({children,style={}})=><div style={{background:cardBg,border:`1px solid ${t.border}`,borderRadius:18,padding:"22px 24px",...style}}>{children}</div>;
  const Label=({children})=><div style={{fontSize:11,color:t.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>{children}</div>;
  const Row=({label,children})=><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 0",borderBottom:`1px solid ${t.border}`}}><span style={{fontSize:14,color:t.txt}}>{label}</span>{children}</div>;
  const Toggle=({on,onChange})=><div role="switch" aria-checked={on} tabIndex={0} className="kb-focusable" onClick={onChange} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onChange();}}} style={{width:46,height:26,borderRadius:13,background:on?`linear-gradient(135deg,${t.wine},${t.rose})`:t.border,cursor:"pointer",position:"relative",transition:"background .3s",flexShrink:0}}><div style={{position:"absolute",top:3,left:on?22:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .3s",boxShadow:"0 1px 4px rgba(0,0,0,.3)"}}/></div>;

  const saveProfile=()=>{
    onUpdateProfile({...user,...profile});
    setSaved(true);setTimeout(()=>setSaved(false),2200);
  };
  const changePw=async()=>{
    setPwMsg("");
    if(!pwForm.current){setPwMsg("Please enter your current password.");return;}
    if(pwForm.next!==pwForm.confirm){setPwMsg("Passwords don't match.");return;}
    if(pwForm.next.length<6){setPwMsg("Password must be at least 6 characters.");return;}
    try{
      await AUTH.changePassword(pwForm.current,pwForm.next);
      setPwMsg("success:Password updated successfully.");
      setPwForm({current:"",next:"",confirm:""});
    }catch(e){
      setPwMsg(e.message||"Couldn't update your password. Please try again.");
    }
  };
  const toggleNotif=k=>{const n={...notifs,[k]:!notifs[k]};setNotifs(n);LS.set("notifs",n);};

  return(
    <div style={{padding:"24px 22px",maxWidth:680,margin:"0 auto"}}>
      <div style={{marginBottom:24,display:"flex",alignItems:"center",gap:14}}>
        <AuraLogo size={44} gold={t.gold} bg={theme==="light"?"#8B3A57":"#1A0B12"}/>
        <div>
          <h1 className="cf" style={{fontSize:30,fontWeight:600,color:t.txt}}>Settings</h1>
          <p style={{color:t.muted,fontSize:13}}>Manage your account, appearance, and preferences</p>
        </div>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:22,flexWrap:"wrap"}}>
        {[["profile","👤 Profile","chip-coral"],["notifications","🔔 Notifications","chip-sun"],["account","🔐 Account","chip-lav"],["privacy","🛡️ Privacy","chip-sky"],["about","ℹ️ About","chip-sage"]].map(([id,label,chip])=>(
          <button key={id} onClick={()=>setTab(id)} className={tab===id?`chip ${chip}`:""} style={{padding:"8px 16px",borderRadius:20,border:tab===id?"none":`1px solid ${t.border}`,background:tab===id?undefined:"transparent",color:tab===id?"#3D2A2E":t.muted,cursor:"pointer",fontSize:13,fontWeight:tab===id?700:500,transition:"all .2s"}}>{label}</button>
        ))}
      </div>

      {tab==="profile"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <Card>
            <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20}}>
              <div style={{width:64,height:64,borderRadius:"50%",background:`linear-gradient(135deg,${t.plumDeep},${t.lav})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,fontWeight:700,color:"#fff",border:`2px solid ${t.border}`,flexShrink:0}}>{profile.name?.[0]?.toUpperCase()||"S"}</div>
              <div><div style={{fontSize:16,fontWeight:600,color:t.txt}}>{profile.name||"Smira User"}</div><div style={{fontSize:12,color:t.muted,marginTop:2}}>{profile.email}</div></div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div><Label>Full Name</Label><input className="inp" value={profile.name} onChange={e=>setProfile(p=>({...p,name:e.target.value}))} style={{color:t.txt}}/></div>
              <div><Label>Email</Label><input className="inp" value={profile.email} type="email" onChange={e=>setProfile(p=>({...p,email:e.target.value}))} style={{color:t.txt}}/></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div><Label>Age</Label><input className="inp" value={profile.age} type="number" onChange={e=>setProfile(p=>({...p,age:e.target.value}))} style={{color:t.txt}}/></div>
                <div><Label>Skin Type</Label><select className="sel" value={profile.skinType} onChange={e=>setProfile(p=>({...p,skinType:e.target.value}))} style={{color:t.txt,background:theme==="light"?t.card:t.bg}}><option>Oily</option><option>Dry</option><option>Combination</option><option>Normal</option><option>Sensitive</option></select></div>
              </div>
            </div>
            <button className="btn" onClick={saveProfile} style={{marginTop:18,width:"100%"}}>{saved?"✅ Profile Saved!":"Save Profile"}</button>
          </Card>
        </div>
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
            {authUser?.provider==="google"?(
              <p style={{fontSize:12,color:t.muted,lineHeight:1.7}}>You signed in with Google, so there's no separate Smira password to change. Manage it from your Google Account instead.</p>
            ):(
              <>
                {pwMsg&&<div style={{background:pwMsg.startsWith("success:")?"rgba(168,230,201,.1)":"rgba(245,163,163,.1)",border:`1px solid ${pwMsg.startsWith("success:")?"rgba(79,168,118,.3)":"rgba(245,163,163,.3)"}`,borderRadius:10,padding:"10px 14px",marginBottom:12,fontSize:13,color:pwMsg.startsWith("success:")?"#4FA876":"#F5A3A3"}}>{pwMsg.replace("success:","")}</div>}
                <div style={{display:"flex",flexDirection:"column",gap:11}}>
                  <input className="inp" placeholder="Current password" type="password" value={pwForm.current} onChange={e=>setPwForm(p=>({...p,current:e.target.value}))} style={{color:t.txt}}/>
                  <input className="inp" placeholder="New password" type="password" value={pwForm.next} onChange={e=>setPwForm(p=>({...p,next:e.target.value}))} style={{color:t.txt}}/>
                  <input className="inp" placeholder="Confirm new password" type="password" value={pwForm.confirm} onChange={e=>setPwForm(p=>({...p,confirm:e.target.value}))} style={{color:t.txt}}/>
                </div>
                <button className="btn-o" onClick={changePw} style={{marginTop:14,width:"100%"}}>Update Password</button>
              </>
            )}
          </Card>
          <Card>
            <Row label="Signed in as"><span style={{fontSize:13,color:t.muted,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{authUser?.email||user?.email||"."}</span></Row>
            <Row label="Sign-in method"><span style={{fontSize:13,color:t.muted,textTransform:"capitalize"}}>{authUser?.provider||"email"}</span></Row>
          </Card>
          <Card>
            <button onClick={onLogout} style={{width:"100%",padding:"13px",borderRadius:50,border:"1px solid rgba(245,163,163,.35)",background:"rgba(245,163,163,.07)",color:"#F5A3A3",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"Poppins,sans-serif",transition:"all .2s"}}>Sign Out</button>
            <p style={{textAlign:"center",fontSize:11,color:t.muted,marginTop:12,lineHeight:1.6}}>Signing out will keep your skin data saved locally on this device.</p>
          </Card>
          <Card>
            <h3 style={{fontSize:15,fontWeight:600,marginBottom:8}}>Your Data</h3>
            <p style={{fontSize:12,color:t.muted,lineHeight:1.7,marginBottom:14}}>Download a copy of your profile, scan history, journal entries, habits, and cycle data as a JSON file. This is yours. Take it anywhere.</p>
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
            }} style={{width:"100%",padding:"12px",borderRadius:50,border:`1px solid ${t.border}`,background:"transparent",color:t.soft,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"Poppins,sans-serif"}}>Export My Data (JSON)</button>
          </Card>
          <Card style={{border:"1px solid rgba(245,163,163,.25)"}}>
            <h3 style={{fontSize:15,fontWeight:600,color:t.txt,marginBottom:8}}>Reset Journey</h3>
            {!confirmReset?(
              <>
                <p style={{fontSize:12,color:t.muted,lineHeight:1.7,marginBottom:14}}>Permanently clears your progress: scans, Confidence Score history, habits, hydration, journal entries, challenges, Monthly Story, analytics, and cycle history. Your account and profile stay as they are.</p>
                <button onClick={()=>setConfirmReset(1)} style={{width:"100%",padding:"12px",borderRadius:50,border:"1px solid rgba(245,163,163,.35)",background:"transparent",color:"#C4506A",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"Poppins,sans-serif"}}>Reset Your Journey</button>
              </>
            ):confirmReset===1?(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <p style={{fontSize:13,color:"#C4506A",fontWeight:600,lineHeight:1.6}}>Reset Your Journey?</p>
                <p style={{fontSize:12,color:t.muted,lineHeight:1.6}}>This will permanently delete your progress, history, scans, journal entries, challenges, and personalized journey data. This action cannot be undone.</p>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setConfirmReset(0)} style={{flex:1,padding:"11px",borderRadius:50,border:`1px solid ${t.border}`,background:"transparent",color:t.muted,fontSize:13,cursor:"pointer",fontFamily:"Poppins,sans-serif"}}>Cancel</button>
                  <button onClick={()=>setConfirmReset(2)} style={{flex:1,padding:"11px",borderRadius:50,border:"none",background:"linear-gradient(135deg,#C4506A,#8B3A57)",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"Poppins,sans-serif"}}>Reset Everything</button>
                </div>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <p style={{fontSize:12,color:"#C4506A",fontWeight:600}}>Last chance: this can't be undone. Reset everything now?</p>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setConfirmReset(0)} style={{flex:1,padding:"11px",borderRadius:50,border:`1px solid ${t.border}`,background:"transparent",color:t.muted,fontSize:13,cursor:"pointer",fontFamily:"Poppins,sans-serif"}}>Cancel</button>
                  <button disabled={resetting} onClick={async()=>{setResetting(true);try{await resetJourneyData(authUser?.uid);window.location.reload();}catch{setResetting(false);}}} style={{flex:1,padding:"11px",borderRadius:50,border:"none",background:"linear-gradient(135deg,#C4506A,#8B3A57)",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"Poppins,sans-serif"}}>{resetting?"Resetting...":"Yes, Reset Everything"}</button>
                </div>
              </div>
            )}
          </Card>
          {onDeleteAccount&&(
            <Card style={{border:"1px solid rgba(245,163,163,.25)"}}>
              <h3 style={{fontSize:15,fontWeight:600,color:"#F5A3A3",marginBottom:8}}>Danger Zone</h3>
              <p style={{fontSize:12,color:t.muted,lineHeight:1.7,marginBottom:14}}>Permanently deletes your account, scan history, journal, habits, and all cloud data. This cannot be undone.</p>
              {!confirmDelete?(
                <button onClick={()=>setConfirmDelete(true)} style={{width:"100%",padding:"12px",borderRadius:50,border:"1px solid rgba(245,163,163,.35)",background:"transparent",color:"#F5A3A3",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"Poppins,sans-serif"}}>Delete My Account</button>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {deleteErr&&<div style={{background:"rgba(245,163,163,.1)",border:"1px solid rgba(245,163,163,.28)",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#F5A3A3"}}>{deleteErr}</div>}
                  <p style={{fontSize:12,color:"#F5A3A3",fontWeight:600}}>Are you absolutely sure? This is permanent.</p>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>{setConfirmDelete(false);setDeleteErr("");}} style={{flex:1,padding:"11px",borderRadius:50,border:`1px solid ${t.border}`,background:"transparent",color:t.muted,fontSize:13,cursor:"pointer",fontFamily:"Poppins,sans-serif"}}>Cancel</button>
                    <button onClick={async()=>{setDeleting(true);setDeleteErr("");try{await onDeleteAccount();}catch(e){setDeleteErr(e.message||"Could not delete account. Please sign out and back in, then try again.");setDeleting(false);}}} disabled={deleting} style={{flex:1,padding:"11px",borderRadius:50,border:"none",background:"linear-gradient(135deg,#C4506A,#8B3A57)",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"Poppins,sans-serif"}}>{deleting?"Deleting...":"Yes, Delete Everything"}</button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {tab==="privacy"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <Card>
            <h3 style={{fontSize:16,fontWeight:600,color:t.txt,marginBottom:4}}>Smira is your private space</h3>
            <p style={{fontSize:13,color:t.muted,lineHeight:1.75}}>Your journal, cycle data, scans, and profile belong to your account alone. No one else who uses Smira can see them, and Smira never shows one account's data to another.</p>
          </Card>
          <Card>
            <Label>What's stored, and where</Label>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {[["Your account & profile","Secured by Firebase Authentication. Your password is never stored or visible to Smira in plain text."],["Journal, cycle & scan data","Saved to your private cloud document, keyed only to your account, so it's there when you switch devices."],["On this device","A local copy is cached for instant loading. It's cleared automatically when you sign out."]].map(([l,d])=>(
                <div key={l} style={{paddingBottom:12,borderBottom:`1px solid ${t.border}`}}>
                  <div style={{fontSize:13,fontWeight:600,color:t.txt,marginBottom:3}}>{l}</div>
                  <div style={{fontSize:12,color:t.muted,lineHeight:1.6}}>{d}</div>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <Label>Your controls</Label>
            <p style={{fontSize:12,color:t.muted,lineHeight:1.7}}>Sign out ends your session on this device without deleting anything. Export gives you a full copy of your data. Delete Account permanently removes it everywhere. All three are in the Account tab.</p>
          </Card>
          <Card>
            <p style={{fontSize:11,color:t.muted,lineHeight:1.7}}>Smira is not a medical device and doesn't diagnose any condition. Health and cycle content is educational. Always check with a qualified healthcare professional for anything that concerns you.</p>
          </Card>
        </div>
      )}

      {tab==="about"&&(
        <Card style={{textAlign:"center",padding:"40px 30px"}}>
          <div style={{marginBottom:22}}>
            <LogoBrand size={64} gold={t.gold} bg={theme==="light"?"#8B3A57":"#1A0B12"} textColor={t.soft} showTagline={true}/>
          </div>
          <p style={{fontSize:14,color:t.muted,lineHeight:1.85,maxWidth:380,margin:"0 auto 24px"}}>AI-powered skincare and emotional wellness designed to help you understand your skin, build healthy habits, and grow your confidence. One day at a time.</p>
          <div style={{display:"flex",gap:9,justifyContent:"center",flexWrap:"wrap",marginBottom:22}}>
            {["AI Skin Analysis","Confidence Score™","Glow Journal","Skin Forecast","Wellness Coach"].map(f=><span key={f} style={{fontSize:11,color:t.soft,background:t.card,border:`1px solid ${t.border}`,padding:"4px 12px",borderRadius:20}}>{f}</span>)}
          </div>
          <div style={{fontSize:12,color:t.muted,borderTop:`1px solid ${t.border}`,paddingTop:18,lineHeight:1.8}}>
            <div style={{fontWeight:600,color:t.txt,marginBottom:4}}>Version 5.0</div>
            <div>© 2026 Smira · Not a medical device</div>
            <div style={{marginTop:4}}>Always consult a qualified dermatologist for clinical advice.</div>
          </div>
        </Card>
      )}
    </div>
  );
};

const Landing=({onEnter})=>{
  const [navOpen,setNavOpen]=useState(false);
  const links=["Home","Features","Science","Testimonials"];
  return(
    <div style={{minHeight:"100vh",position:"relative",overflow:"hidden",background:"linear-gradient(160deg,#FFF6F1 0%,#FDEFE9 35%,#FBE9ED 65%,#F3F7EE 100%)",color:"#4A2A35"}}>
      {/* soft light wash + garden atmosphere */}
      <div style={{position:"absolute",top:"-10%",right:"-8%",width:560,height:560,borderRadius:"50%",background:"radial-gradient(circle,rgba(255,247,224,.9),transparent 70%)",filter:"blur(6px)"}}/>
      <GardenScene butterflies={7} petals={10} sparkles={14}/>
      <div className="garden-scene" aria-hidden style={{opacity:.5}}>
        {[6,20,78,92].map((l,i)=>(
          <div key={i} style={{position:"absolute",left:`${l}%`,top:0,bottom:i%2?"38%":"0%",width:i%2?90:130,background:i<2?"linear-gradient(180deg,rgba(230,150,170,.28),transparent 70%)":"linear-gradient(0deg,rgba(230,150,170,.28),transparent 70%)"}}/>
        ))}
      </div>

      {/* glass nav */}
      <div style={{position:"relative",zIndex:20,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"18px 28px",maxWidth:1240,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <AuraLogo size={34} gold="#B8902A"/>
          <span className="cf" style={{fontSize:20,letterSpacing:".1em",color:"#B5476B",fontWeight:600}}>SMIRA</span>
        </div>
        <div className="glass-nav hide-mobile" style={{display:"flex",gap:4,padding:"8px 10px"}}>
          {links.map(l=>(
            <a key={l} href="#" onClick={e=>e.preventDefault()} style={{padding:"9px 16px",borderRadius:100,fontSize:12.5,letterSpacing:".06em",textTransform:"uppercase",color:"#8C6373",textDecoration:"none",fontWeight:500}}>{l}</a>
          ))}
        </div>
        <button className="btn-o hide-mobile" onClick={onEnter} style={{fontSize:12.5,letterSpacing:".04em"}}>Get Started →</button>
        <button className="hamburger show-mobile" onClick={()=>setNavOpen(s=>!s)} aria-label="Menu" style={{color:"#B5476B",display:"none"}}><span style={{background:"#B5476B"}}/><span style={{background:"#B5476B"}}/><span style={{background:"#B5476B"}}/></button>
      </div>

      {/* hero */}
      <div style={{position:"relative",zIndex:10,maxWidth:640,margin:"0 auto",padding:"18px 24px 70px",textAlign:"center"}}>
        <span className="cf" style={{fontSize:"clamp(46px,8vw,74px)",fontWeight:600,letterSpacing:".06em",color:"#B5476B",display:"block",lineHeight:1.05,marginTop:8}}>SMIRA</span>
        <p style={{color:"#B8902A",fontSize:13,fontWeight:600,margin:"6px 0 30px",letterSpacing:".22em",textTransform:"uppercase"}}>✦ A kinder you. Everyday ✦</p>

        <GlassBubble size={280}>
          <AuraLogo size={150} gold="#B8902A"/>
          <Butterfly size={40} color="#D9738F" style={{position:"absolute",top:"14%",right:"6%",animationDuration:"6s"}}/>
          <Butterfly size={22} color="#F0C4CC" style={{position:"absolute",bottom:"18%",left:"10%",animationDuration:"8s",animationDelay:"1.5s"}}/>
        </GlassBubble>

        <p style={{color:"#8C6373",fontSize:13,letterSpacing:".08em",textTransform:"uppercase",margin:"34px 0 18px"}}>Your Skin. Your Story. Your Confidence.</p>
        <button className="btn" onClick={onEnter} style={{padding:"16px 44px",fontSize:14.5,letterSpacing:".04em"}}>Begin Your Glow Journey →</button>

        <div style={{display:"flex",gap:9,justifyContent:"center",flexWrap:"wrap",marginTop:36}}>
          {[["AI Skin Analysis","chip-coral","#7A331E"],["Confidence Score","chip-lav","#4A3358"],["Glow Journal","chip-sage","#2F5B3D"],["Wellness Coach","chip-sky","#215269"],["Skin Forecast","chip-sun","#6B4E14"]].map(([t,chip,fg])=>(
            <span key={t} className={`chip ${chip}`} style={{fontSize:11,color:fg,fontWeight:600,padding:"7px 15px",display:"inline-block"}}>{t}</span>
          ))}
        </div>
      </div>
      <style>{`@media(max-width:768px){.show-mobile{display:flex!important}}`}</style>
    </div>
  );
};

const Onboarding=({onDone})=>{
  const [step,setStep]=useState(0);
  const [d,setD]=useState({name:"",email:"",age:"",gender:"",height:"",weight:"",diet:"Vegetarian",water:"6-8 glasses",sleep:"7-8 hrs",stress:"Moderate",pcos:false,pcod:false,thyroid:false,diabetes:false,noneConditions:false,menstrualTracking:false,cycleLength:"28",skinGoal:[],wellnessGoal:[]});
  const upd=(k,v)=>setD(p=>({...p,[k]:v}));
  /* Health-conditions checkboxes are mutually exclusive with "None of
     these": picking a real condition clears "None", and picking "None"
     clears every real condition — the user should never be able to say
     both "I have PCOS" and "none of these apply to me" at once. */
  const CONDITION_KEYS=["pcos","pcod","thyroid","diabetes"];
  const toggle=k=>setD(p=>{
    if(k==="noneConditions"){
      const next={...p,noneConditions:!p.noneConditions};
      if(next.noneConditions)CONDITION_KEYS.forEach(ck=>{next[ck]=false;});
      return next;
    }
    const next={...p,[k]:!p[k]};
    if(next[k]&&CONDITION_KEYS.includes(k))next.noneConditions=false;
    return next;
  });
  const toggleGoal=(g,key)=>setD(p=>({...p,[key]:p[key].includes(g)?p[key].filter(x=>x!==g):[...p[key],g]}));
  /* Selection rule for every multi-select step: at least one option
     (real answer or "None of these"), no upper limit. Steps without a
     selection requirement (name/age, lifestyle dropdowns) always pass. */
  const conditionsChosen=d.noneConditions||CONDITION_KEYS.some(ck=>d[ck]);
  const canContinue=
    step===1?!!d.name.trim():
    step===3?conditionsChosen:
    step===4?d.skinGoal.length>0:
    step===5?d.wellnessGoal.length>0:
    true;
  const steps=[
    {avatar:"welcome",title:"Welcome to Smira",greeting:"Hi there! I'm Smira. Your personal wellness and confidence companion. I'd love to learn a little about you so everything I share feels genuinely personal.",why:null},
    {avatar:"morning",title:"Tell me your name",greeting:"What should I call you? Your name and age help me tailor every message and recommendation to your life stage and skin type.",why:"Your name and age help me give advice that's actually relevant to your skin right now. Not generic."},
    {avatar:"coach",title:"Your lifestyle",greeting:"How we live shapes how our skin looks and feels. Often more than products do. Tell me a little about your daily rhythms.",why:"Sleep, water, diet, and stress are four of the most powerful skin factors. This helps me give meaningful, not generic, insights."},
    {avatar:"empathy",title:"Health background",greeting:"This step is completely optional. But conditions like PCOS and thyroid disorders have real, significant effects on skin. I want my advice to actually fit your body.",why:"Hormonal conditions affect skin in specific ways. Knowing this means my recommendations will be much more accurate for you."},
    {avatar:"analysis",title:"Your skin goals",greeting:"What would you most like to work on? There are no wrong answers. Choose as many as you'd like. I'll use these to shape everything I suggest.",why:"Your skin goals guide which products I suggest, which habits I prioritize, and what I focus on in your analysis."},
    {avatar:"happy",title:"Your wellness vision",greeting:"Smira isn't just about skin. It's about building confidence, healthy habits, and feeling genuinely good from the inside out. What matters to you?",why:"Your wellness goals shape how I coach you daily. Whether it's sleep, stress, or confidence, I'll weave these into your whole experience."},
  ];
  const cur=steps[step];
  /* Left-panel scenery evolves per step, per the V5 brief — cherry blossoms,
     butterflies, sunrise, glowing flowers, bubbles, golden sunset. */
  const scenery=[
    {bg:"linear-gradient(160deg,#FBE2E8,#F6C9D3 60%,#F0B4C2)",caption:"Cherry blossoms drifting in",butterflies:3,petals:9},
    {bg:"linear-gradient(160deg,#F3D9E2,#E9B9CA 60%,#D9A0BA)",caption:"Butterflies finding their way",butterflies:8,petals:4},
    {bg:"linear-gradient(160deg,#FDEBD3,#F7CFB0 60%,#F0B490)",caption:"Morning sunlight breaking through",butterflies:4,petals:5},
    {bg:"linear-gradient(160deg,#E7E6C9,#D3D6A8 60%,#B9C98F)",caption:"Tiny flowers beginning to glow",butterflies:3,petals:6},
    {bg:"linear-gradient(160deg,#DCEEF0,#B9DEE3 60%,#9BC8D2)",caption:"Bubbles floating gently upward",butterflies:2,petals:3},
    {bg:"linear-gradient(160deg,#F6D9A8,#EFAE7C 60%,#D97F6B)",caption:"A golden sunset settling in",butterflies:5,petals:5},
  ][step]||{bg:"linear-gradient(160deg,#FBE2E8,#F0B4C2)",caption:"",butterflies:4,petals:6};
  return(
    <div style={{minHeight:"100vh",display:"flex",background:"#FFF8F3"}}>
      {/* Left — evolving illustrated scenery (desktop only) */}
      <div className="onboard-scenery hide-mobile" style={{width:"44%",position:"relative",overflow:"hidden",background:scenery.bg,transition:"background 1.2s ease",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        <GardenScene butterflies={scenery.butterflies} petals={scenery.petals} sparkles={10}/>
        <div style={{position:"relative",zIndex:5,textAlign:"center",padding:24}}>
          <GlassBubble size={190}><AuraLogo size={100} gold="#B8902A"/></GlassBubble>
          <p className="cf" style={{marginTop:26,fontSize:19,color:"#5A2E3D",fontStyle:"italic",opacity:.85}}>{scenery.caption}</p>
        </div>
      </div>

      {/* Right — glass onboarding card */}
      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:24,position:"relative",overflow:"hidden"}}>
        <div className="show-mobile" style={{position:"absolute",inset:0}}><GardenScene butterflies={2} petals={4} sparkles={5} tint="linear-gradient(160deg,#FDEFE9,#FBE9ED)"/></div>
        <div style={{width:"100%",maxWidth:520,zIndex:10}}>
          <div style={{marginBottom:22,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:12,color:"#8C6373"}}>Step {step+1} of {steps.length}</span>
            <span style={{fontSize:12,color:"#B5476B",fontWeight:700}}>{Math.round(((step+1)/steps.length)*100)}%</span>
          </div>
          <div className="pbar" style={{marginBottom:24}}><div className="pfill" style={{width:`${((step+1)/steps.length)*100}%`,background:"linear-gradient(90deg,#C9577B,#D98CA3)"}}/></div>
          <div className="glass glow" style={{padding:"32px 30px",borderRadius:28,background:"rgba(255,252,249,.85)"}}>
            <div style={{marginBottom:20}}><SmiraMsg state={cur.avatar} text={cur.greeting} size={52}/></div>
            <h2 className="cf" style={{fontSize:27,marginBottom:cur.why?8:20,fontWeight:600,color:"#4A2A35"}}>{cur.title}</h2>
            {cur.why&&<div style={{background:"rgba(181,71,107,.06)",border:"1px solid rgba(197,120,140,.18)",borderRadius:12,padding:"10px 14px",marginBottom:18}}><p style={{fontSize:12,color:"#8C6373",lineHeight:1.65}}>Why I'm asking: {cur.why}</p></div>}
            {step===0&&<div style={{display:"flex",flexDirection:"column",gap:9}}>{["Real AI vision skin analysis","Confidence Score. Measuring self-care, not appearance","Glow Journal for emotional growth & patterns","Skin Forecast & 30-day trend predictions","Emotionally intelligent AI companion","Monthly personalized story recap"].map(t=><div key={t} style={{fontSize:13,color:"#8B3A57",padding:"10px 14px",background:"rgba(181,71,107,.06)",borderRadius:12,border:"1px solid rgba(197,120,140,.16)",display:"flex",gap:10,alignItems:"center"}}><div style={{width:6,height:6,borderRadius:"50%",background:"#C9577B",flexShrink:0}}/>{t}</div>)}</div>}
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
            <p style={{fontSize:12,color:"#9A6677",marginBottom:4}}>Select any that apply. If none do, that's completely fine too. Just say so below.</p>
            {[{k:"pcos",l:"PCOS",desc:"Polycystic Ovary Syndrome. Affects hormones & skin"},{k:"pcod",l:"PCOD",desc:"Similar to PCOS. Hormonal skin effects"},{k:"thyroid",l:"Thyroid Disorder",desc:"Affects skin texture, hydration, and hair"},{k:"diabetes",l:"Diabetes",desc:"Affects skin barrier and healing speed"}].map(c=>(
              <div key={c.k} role="checkbox" aria-checked={!!d[c.k]} tabIndex={0} className="kb-focusable" onClick={()=>toggle(c.k)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggle(c.k);}}} style={{display:"flex",alignItems:"center",gap:13,padding:"12px 15px",borderRadius:14,cursor:"pointer",background:d[c.k]?"rgba(181,71,107,.1)":"rgba(181,71,107,.03)",border:`1px solid ${d[c.k]?"#C9577B":"rgba(197,120,140,.16)"}`,transition:"all .2s"}}>
                <div style={{width:21,height:21,borderRadius:7,background:d[c.k]?"linear-gradient(135deg,#B5476B,#D98CA3)":"rgba(181,71,107,.1)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{d[c.k]&&<Ic n="ok" s={12} c="#fff"/>}</div>
                <div><div style={{fontSize:14,fontWeight:500,color:"#4A2A35"}}>{c.l}</div><div style={{fontSize:11,color:"#8C6373"}}>{c.desc}</div></div>
              </div>
            ))}
            <div role="checkbox" aria-checked={d.noneConditions} tabIndex={0} className="kb-focusable" onClick={()=>toggle("noneConditions")} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggle("noneConditions");}}} style={{display:"flex",alignItems:"center",gap:13,padding:"12px 15px",borderRadius:14,cursor:"pointer",background:d.noneConditions?"rgba(181,71,107,.1)":"rgba(181,71,107,.03)",border:`1px dashed ${d.noneConditions?"#C9577B":"rgba(197,120,140,.28)"}`,transition:"all .2s"}}>
              <div style={{width:21,height:21,borderRadius:7,background:d.noneConditions?"linear-gradient(135deg,#B5476B,#D98CA3)":"rgba(181,71,107,.1)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{d.noneConditions&&<Ic n="ok" s={12} c="#fff"/>}</div>
              <div><div style={{fontSize:14,fontWeight:500,color:"#4A2A35"}}>None of these</div><div style={{fontSize:11,color:"#8C6373"}}>I don't have any of the above</div></div>
            </div>
            <div role="checkbox" aria-checked={d.menstrualTracking} tabIndex={0} className="kb-focusable" onClick={()=>toggle("menstrualTracking")} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggle("menstrualTracking");}}} style={{display:"flex",alignItems:"center",gap:13,padding:"12px 15px",borderRadius:14,cursor:"pointer",background:d.menstrualTracking?"rgba(181,71,107,.1)":"rgba(181,71,107,.03)",border:`1px solid ${d.menstrualTracking?"#C9577B":"rgba(197,120,140,.16)"}`,transition:"all .2s",marginTop:4}}>
              <div style={{width:21,height:21,borderRadius:7,background:d.menstrualTracking?"linear-gradient(135deg,#B5476B,#D98CA3)":"rgba(181,71,107,.1)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{d.menstrualTracking&&<Ic n="ok" s={12} c="#fff"/>}</div>
              <div><div style={{fontSize:14,fontWeight:500,color:"#4A2A35"}}>Track Menstrual Cycle</div><div style={{fontSize:11,color:"#8C6373"}}>Get hormonal skin insights around your cycle</div></div>
            </div>
            {d.menstrualTracking&&(
              <div style={{marginTop:6,padding:"12px 15px",borderRadius:14,background:"rgba(181,71,107,.03)",border:"1px solid rgba(197,120,140,.16)"}}>
                <label style={{fontSize:12,color:"#4A2A35",fontWeight:500,display:"block",marginBottom:6}}>How long is your cycle usually?</label>
                <select className="sel" value={d.cycleLength} onChange={e=>upd("cycleLength",e.target.value)}>
                  {Array.from({length:22},(_,i)=>21+i).map(n=><option key={n} value={n}>{n} days</option>)}
                  <option value="unsure">Not sure</option>
                </select>
                <p style={{fontSize:11,color:"#9A6677",marginTop:7,lineHeight:1.6}}>Just your best estimate. Cycles often vary a little from month to month, and Smira will refine this automatically as you log real periods.</p>
              </div>
            )}
          </div>}
          {step===4&&<div style={{display:"flex",flexWrap:"wrap",gap:9}}>
            {["Clear Acne","Fade Pigmentation","Deep Hydration","Anti-Aging","Even Skin Tone","Reduce Pores","Glow & Radiance","Soothe Redness","Dark Circles","Oil Control","Strengthen Barrier","Brighten Complexion"].map((g,i)=>{
              const pal=CHIP_GRADIENTS;
              const [c1,c2]=pal[i%pal.length];
              const sel=d.skinGoal.includes(g);
              return(<div key={g} role="checkbox" aria-checked={sel} tabIndex={0} className="kb-focusable" onClick={()=>toggleGoal(g,"skinGoal")} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggleGoal(g,"skinGoal");}}} style={{padding:"9px 17px",borderRadius:24,cursor:"pointer",fontSize:13,fontWeight:600,transition:"all .2s",background:sel?`linear-gradient(135deg,${c1},${c2})`:"rgba(181,71,107,.06)",color:sel?"#fff":"#B5476B",border:`1px solid ${sel?"transparent":"rgba(197,120,140,.25)"}`}}>{g}</div>);
            })}
          </div>}
          {step===5&&<div style={{display:"flex",flexWrap:"wrap",gap:9}}>
            {["Build Confidence","Improve Sleep","Reduce Stress","Better Nutrition","Consistent Habits","Hormonal Balance","Mental Wellness","Track Progress","Self-Care Rituals","Body Positivity","Mindful Living"].map((g,i)=>{
              const pal=[...CHIP_GRADIENTS.slice(4),...CHIP_GRADIENTS.slice(0,4)];
              const [c1,c2]=pal[i%pal.length];
              const sel=d.wellnessGoal.includes(g);
              return(<div key={g} role="checkbox" aria-checked={sel} tabIndex={0} className="kb-focusable" onClick={()=>toggleGoal(g,"wellnessGoal")} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggleGoal(g,"wellnessGoal");}}} style={{padding:"9px 17px",borderRadius:24,cursor:"pointer",fontSize:13,fontWeight:600,transition:"all .2s",background:sel?`linear-gradient(135deg,${c1},${c2})`:"rgba(181,71,107,.06)",color:sel?"#fff":"#B5476B",border:`1px solid ${sel?"transparent":"rgba(197,120,140,.25)"}`}}>{g}</div>);
            })}
          </div>}
            <div style={{display:"flex",gap:11,marginTop:26}}>
              {step>0&&<button className="btn-o" onClick={()=>setStep(s=>s-1)} style={{flex:1}}>Back</button>}
              <button className="btn" onClick={()=>step<steps.length-1?setStep(s=>s+1):onDone(d)} style={{flex:2}} disabled={!canContinue}>
                {step===steps.length-1?"Start My Journey":"Continue"}
              </button>
            </div>
            {!canContinue&&(step===3||step===4||step===5)&&<p style={{fontSize:11,color:"#B5476B",marginTop:9,textAlign:"center"}}>{step===3?"Pick any conditions that apply, or \"None of these.\"":"Please select at least one option to continue."}</p>}
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
      <div className="glass glow" style={{padding:"48px 44px",borderRadius:28,textAlign:"center",maxWidth:380}}>
        <div style={{width:100,height:120,margin:"0 auto 22px",borderRadius:20,overflow:"hidden",border:"2px solid var(--border)"}}><SmiraAvatar state="analysis" portrait size={120}/></div>
        <div style={{position:"relative",width:130,height:130,margin:"0 auto 22px"}}>
          <svg width="130" height="130" style={{transform:"rotate(-90deg)"}}>
            <circle cx="65" cy="65" r="55" fill="none" stroke="var(--border)" strokeWidth="6"/>
            <circle cx="65" cy="65" r="55" fill="none" stroke="var(--rose)" strokeWidth="6" strokeDasharray="345" strokeDashoffset={345-(progress/100)*345} strokeLinecap="round" style={{transition:"stroke-dashoffset .4s"}}/>
          </svg>
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:28,fontWeight:700,color:"var(--soft)"}}>{progress}%</span></div>
        </div>
        <h3 className="cf" style={{fontSize:22,marginBottom:9,fontWeight:600,color:"var(--txt)"}}>Reading your skin with care</h3>
        <p style={{color:"var(--soft)",fontSize:13,marginBottom:5}}>{stepTxt}</p>
        <p style={{color:"var(--muted)",fontSize:11}}>Smira AI Vision</p>
      </div>
    </div>
  );

  return(
    <div style={{padding:"28px 22px",maxWidth:680,margin:"0 auto"}}>
      <div style={{marginBottom:22}}>
        <SmiraMsg state="analysis" text="Your skin is unique and beautiful. This analysis helps you understand it better. Never judge it. Take a clear, well-lit selfie for the most accurate results." size={44}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}}><div><h1 className="cf" style={{fontSize:32,marginTop:20,marginBottom:5,fontWeight:600,color:"var(--txt)"}}>Skin Analysis</h1>
        <p style={{color:"var(--muted)",fontSize:13}}>AI-powered · private · compassionate</p></div><img src="/smira/hero/hero_3.png" alt="Skin analysis" style={{width:96,height:96,objectFit:"contain",flexShrink:0}}/></div>
      </div>
      {err&&<ErrorBox message={err} onRetry={lastImg?()=>doAnalysis(lastImg):null}/>}
      <div style={{display:"flex",gap:10,alignItems:"flex-start",padding:"12px 16px",background:"rgba(168,230,201,.08)",border:"1px solid rgba(168,230,201,.28)",borderRadius:14,marginBottom:18}}>
        <Ic n="lock" s={15} c="#7BC99A"/>
        <p style={{fontSize:11.5,color:"var(--muted)",lineHeight:1.65}}>Your photo is processed securely for this analysis and never shared with third parties or used to train AI models. It belongs entirely to you, and you can clear your scan history any time from Settings.</p>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:20}}>
        {[["upload","Upload Photo","dl"],["camera","Use Camera","scan"]].map(([m,l,icon])=>(
          <button key={m} onClick={()=>m==="camera"?startCamera():fileRef.current?.click()} className={mode===m?"chip chip-peach":""} style={{flex:1,padding:"12px",borderRadius:14,border:mode===m?"none":"1px solid var(--border)",background:mode===m?undefined:"var(--inp-bg)",color:mode===m?"#7A331E":"var(--muted)",cursor:"pointer",fontSize:13,fontWeight:600,transition:"all .2s",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
            <Ic n={icon} s={14} c={mode===m?"#7A331E":"var(--muted)"}/>{l}
          </button>
        ))}
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{setImg(ev.target.result);setMode("preview");};r.readAsDataURL(f);}} style={{display:"none"}}/>
      {(mode==="upload"||mode==="preview")&&(
        <div role="button" tabIndex={0} aria-label="Upload a photo" className="kb-focusable" onClick={()=>!img&&fileRef.current?.click()} onKeyDown={e=>{if((e.key==="Enter"||e.key===" ")&&!img){e.preventDefault();fileRef.current?.click();}}} style={{border:`2px dashed ${img?"var(--coral)":"var(--border)"}`,borderRadius:20,padding:"44px 24px",textAlign:"center",cursor:img?"default":"pointer",background:"linear-gradient(160deg,var(--sun-soft),var(--peach)33)",minHeight:200}}>
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
              <p style={{color:"var(--muted)",fontSize:14,lineHeight:1.65}}>Tap to upload a clear, well-lit photo<br/><span style={{fontSize:12,color:"var(--muted)",opacity:.75}}>Good, even lighting gives the most accurate read</span></p>
            </div>
          )}
        </div>
      )}
      {mode==="camera"&&(
        <div style={{borderRadius:20,overflow:"hidden",position:"relative",background:"var(--petal)"}}>
          <video ref={vidRef} style={{width:"100%",borderRadius:20,maxHeight:340,objectFit:"cover",display:"block"}} playsInline autoPlay muted/>
          <div className="scan-anim"/>
          <canvas ref={canRef} style={{display:"none"}}/>
          {/* Minimal circular controls — same visual language as the
             reference's meditation-player row: a large central circular
             action flanked by two smaller circular controls, no button
             chrome or labels competing for attention. */}
          <div style={{padding:"18px 14px",display:"flex",alignItems:"center",justifyContent:"center",gap:22}}>
            <button aria-label="Cancel" onClick={()=>{stopCamera();setMode("upload");}} style={{width:44,height:44,borderRadius:"50%",border:"1px solid var(--border)",background:"var(--card)",color:"var(--muted)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Ic n="x" s={17} c="var(--muted)"/></button>
            <button aria-label="Capture and analyze" onClick={capturePhoto} style={{width:68,height:68,borderRadius:"50%",border:"none",background:"var(--plum-deep)",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 6px 18px rgba(74,51,88,.4)"}}><Ic n="camera" s={26} c="#fff"/></button>
            <div style={{width:44}}/>
          </div>
          <p style={{textAlign:"center",fontSize:11,color:"var(--muted)",paddingBottom:14}}>Tap the centre button to capture &amp; analyze</p>
        </div>
      )}
      {existingScans?.length>0&&(
        <div style={{marginTop:28}}>
          <h3 className="cf" style={{fontSize:14,fontWeight:600,color:"var(--muted)",marginBottom:12}}>Previous Scans</h3>
          <div style={{display:"flex",gap:9,overflowX:"auto",paddingBottom:6}}>
            {existingScans.slice(-5).reverse().map((s,i)=>(
              <div key={i} className="chip chip-lav" style={{padding:"12px 14px",flexShrink:0,textAlign:"center",minWidth:90}}>
                <div style={{fontSize:20,fontWeight:700,color:"#4A3358",marginBottom:3}}>{s.overallScore}</div>
                <div style={{fontSize:10,color:"#4A3358",opacity:.75}}>{s.date}</div>
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
  const cColors={Low:"#4FA876",Moderate:"var(--txt)",High:"#F5A3A3"};
  if(!results)return<EmptyState img="/smira/empty/01_no_skin_scan.png" title="No analysis yet" message="Complete your first skin scan to see your personalized results and begin your glow journey." actionLabel="Start Skin Analysis" onAction={()=>onNav("scan")}/>;
  const progress=computeProgress(scans);
  const radar=[{s:"Hydration",v:results.hydrationLevel||62},{s:"Brightness",v:results.brightness||60},{s:"Elasticity",v:results.elasticity||70},{s:"Clarity",v:100-(results.concerns?.find(c=>c.name==="Acne")?.confidence||40)},{s:"Evenness",v:results.overallScore||68}];
  return(
    <div style={{padding:"24px 22px",maxWidth:920,margin:"0 auto"}}>
      {results.emotionalNote&&(
        <div style={{marginBottom:20,padding:"16px 20px",borderRadius:16,background:"linear-gradient(135deg,var(--petal),var(--card))",border:"1px solid var(--border)",display:"flex",gap:12,alignItems:"center"}}>
          <SmiraAvatar state="empathy" size={44}/>
          <p style={{fontSize:14,color:"var(--txt)",lineHeight:1.75,fontStyle:"italic"}}>{results.emotionalNote}</p>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:13,marginBottom:20}}>
        <div className="chip chip-coral glow" style={{padding:"18px 14px",textAlign:"center"}}><img src="/smira/skin-analysis/05_glow.png" alt="" style={{width:28,height:28,objectFit:"contain",margin:"0 auto 4px"}}/><Ring score={results.overallScore||68} size={90} label="Overall" color="#7A331E"/></div>
        <div className="chip chip-sky" style={{padding:"18px 14px",textAlign:"center"}}><img src="/smira/skin-analysis/01_hydration.png" alt="" style={{width:28,height:28,objectFit:"contain",margin:"0 auto 4px"}}/><Ring score={results.hydrationLevel||62} size={90} label="Hydration" color="#215269"/></div>
        <div className="chip chip-sage" style={{padding:"18px 14px",textAlign:"center"}}><img src="/smira/skin-analysis/06_smoothness.png" alt="" style={{width:28,height:28,objectFit:"contain",margin:"0 auto 4px"}}/><Ring score={results.elasticity||71} size={90} label="Elasticity" color="#2F5B3D"/></div>
        <div className="chip chip-lav" style={{padding:"18px 14px",textAlign:"center"}}><img src="/smira/skin-analysis/04_evenness.png" alt="" style={{width:28,height:28,objectFit:"contain",margin:"0 auto 4px"}}/><Ring score={results.brightness||60} size={90} label="Brightness" color="#4A3358"/></div>
        <div className="chip chip-sun" style={{padding:"18px 14px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:5}}>
          <div style={{fontSize:28,fontWeight:700,color:"#6B4E14"}}>{results.skinAge||"--"}</div>
          <div style={{fontSize:11,color:"#6B4E14",opacity:.8}}>Skin Age</div>
          <span style={{fontSize:10,color:"#2F5B3D",background:"rgba(255,255,255,.5)",padding:"2px 8px",borderRadius:10}}>Actual: {user?.age||"–"}</span>
        </div>
      </div>
      {results.aiSummary&&(
        <div style={{marginBottom:18,padding:"18px 20px",borderRadius:16,background:"var(--sun-soft)",border:"1px solid rgba(240,189,74,.3)",display:"flex",gap:12,alignItems:"flex-start"}}>
          <SmiraAvatar state="analysis" size={40}/>
          <div><div style={{fontSize:10,color:"#6B4E14",fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:".06em"}}>Smira's Analysis</div><p style={{fontSize:14,color:"#4A3620",lineHeight:1.8}}>{results.aiSummary}</p></div>
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
            <h3 className="cf" style={{fontSize:15,fontWeight:600,marginBottom:14,color:"var(--txt)"}}>Skin Radar</h3>
            <ResponsiveContainer width="100%" height={200}><RadarChart data={radar}><PolarGrid stroke="var(--petal)"/><PolarAngleAxis dataKey="s" tick={{fill:"var(--muted)",fontSize:11}}/><Radar dataKey="v" stroke="var(--soft)" fill="rgba(212,135,154,.18)" fillOpacity={0.7}/></RadarChart></ResponsiveContainer>
          </div>
          <div className="glass" style={{padding:22,borderRadius:20}}>
            <h3 className="cf" style={{fontSize:15,fontWeight:600,marginBottom:14,color:"var(--txt)"}}>Score Breakdown</h3>
            <div style={{display:"flex",flexDirection:"column",gap:13}}>
              {results.concerns?.slice(0,5).map(c=>(
                <div key={c.name}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}><span style={{color:"var(--txt)"}}>{c.name}</span><span style={{fontWeight:600,color:"var(--soft)"}}>{c.confidence}/100</span></div><ConfBar pct={c.confidence} color={c.color||"var(--soft)"}/></div>
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
              <p style={{fontSize:14,color:"var(--muted)",marginTop:14,lineHeight:1.7}}>Complete one more scan to start seeing progress comparisons. Smira tracks every scan so you can see exactly how your skin changes over time.</p>
            </div>
          ):(
            <>
              <div className="glass" style={{padding:"16px 20px",borderRadius:16,display:"flex",gap:10,alignItems:"center"}}>
                <SmiraAvatar state="celebration" size={40}/>
                <p style={{fontSize:13,color:"var(--txt)",lineHeight:1.6}}>Comparing your <b>{progress.latestDate}</b> scan to your previous one ({progress.scanCount} scans tracked since {progress.firstDate}).</p>
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
                  const color=flat?"var(--muted)":up?"#4FA876":"#F5A3A3";
                  return(
                    <div key={key} className="glass" style={{padding:"16px 14px",borderRadius:16,textAlign:"center"}}>
                      <div style={{fontSize:11,color:"var(--muted)",marginBottom:6}}>{label}</div>
                      <div style={{fontSize:22,fontWeight:700,color:"var(--txt)"}}>{m.current}{unit}</div>
                      <div style={{fontSize:12,fontWeight:600,color,marginTop:4,display:"flex",alignItems:"center",justifyContent:"center",gap:3}}>
                        {!flat&&<span>{up?"↑":"↓"}</span>}{Math.abs(m.value)}{unit} since last scan
                      </div>
                    </div>
                  );
                })}
              </div>
              {progress.concernTrend?.length>0&&(
                <div className="glass" style={{padding:22,borderRadius:20}}>
                  <h3 className="cf" style={{fontSize:15,fontWeight:600,marginBottom:14,color:"var(--txt)"}}>Concern Progress</h3>
                  <div style={{display:"flex",flexDirection:"column",gap:12}}>
                    {progress.concernTrend.map(c=>(
                      <div key={c.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:13,color:"var(--txt)"}}>{c.name}</span>
                        <span style={{fontSize:12,fontWeight:600,color:c.prevChange==null?"var(--muted)":c.prevChange<0?"#4FA876":c.prevChange>0?"#F5A3A3":"var(--muted)"}}>
                          {c.prevChange==null?"New":c.prevChange===0?"No change":c.prevChange<0?`Improved ${Math.abs(c.prevChange)}%`:`Up ${c.prevChange}%`}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p style={{fontSize:11,color:"var(--muted)",marginTop:12,lineHeight:1.6}}>Lower confidence % generally means the concern is less prominent in your latest scan.</p>
                </div>
              )}
              <div className="glass" style={{padding:22,borderRadius:20}}>
                <h3 style={{fontSize:14,fontWeight:600,marginBottom:14}}>Skin Health Timeline</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={progress.series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--petal)"/>
                    <XAxis dataKey="date" tick={{fill:"var(--muted)",fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:"var(--muted)",fontSize:10}} axisLine={false} tickLine={false}/>
                    <Tooltip contentStyle={{background:"#2E0E1F",border:"1px solid var(--border)",borderRadius:9,color:"#F5E6EA",fontSize:11}}/>
                    <Line type="monotone" dataKey="hydrationLevel" stroke="#7EC8E3" strokeWidth={2} dot={{r:3}} name="Hydration"/>
                    <Line type="monotone" dataKey="brightness" stroke="var(--soft)" strokeWidth={2} dot={{r:3}} name="Brightness"/>
                    <Line type="monotone" dataKey="overallScore" stroke="#4FA876" strokeWidth={2} dot={{r:3}} name="Overall"/>
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
            <div key={c.name} className="glass" style={{padding:"18px 20px",borderRadius:16,borderLeft:`3px solid ${c.color||"var(--soft)"}`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                <div><div style={{fontSize:15,fontWeight:600}}>{c.name}</div><span style={{fontSize:12,color:cColors[c.severity]||"var(--muted)",fontWeight:500}}>{c.severity} severity</span></div>
                <div style={{textAlign:"right"}}><div style={{fontSize:18,fontWeight:700,color:c.color||"var(--soft)"}}>{c.confidence}%</div><div style={{fontSize:10,color:"var(--muted)"}}>AI confidence</div></div>
              </div>
              <ConfBar pct={c.confidence} color={c.color||"var(--soft)"}/>
              {c.description&&<p style={{fontSize:12,color:"var(--muted)",marginTop:10,lineHeight:1.6}}>{c.description}</p>}
            </div>
          ))}
        </div>
      )}
      {tab==="heatmap"&&(
        <div className="glass" style={{padding:24,borderRadius:20}}>
          <h3 className="cf" style={{fontSize:16,fontWeight:600,marginBottom:6,color:"var(--txt)"}}>Concern Zone Map</h3>
          <p style={{fontSize:13,color:"var(--muted)",marginBottom:18}}>Areas where Smira AI detected skin concerns. All zones are manageable. None define your beauty.</p>
          <div style={{position:"relative",maxWidth:360,margin:"0 auto"}}>
            {img?<img src={img} alt="face" style={{width:"100%",borderRadius:14,objectFit:"cover",maxHeight:360}}/>
              :<div style={{width:"100%",paddingBottom:"100%",borderRadius:14,background:"var(--petal)",position:"relative"}}><div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"var(--muted)",fontSize:14}}>Upload photo to see heat map</span></div></div>}
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
              <div><h3 className="cf" style={{fontSize:17,fontWeight:600,color:"var(--txt)"}}>30-Day Skin Forecast</h3><p style={{fontSize:12,color:"var(--muted)",marginTop:2}}>Based on your current routine and habits</p></div>
            </div>
            {results.forecast?(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <div style={{background:"var(--sky-soft)",borderRadius:12,padding:14}}><div style={{fontSize:11,color:"#215269",opacity:.8,marginBottom:4}}>Hydration (projected)</div><div style={{fontSize:22,fontWeight:700,color:"#215269"}}>+{results.forecast.hydration30days||12}%</div></div>
                  <div style={{background:"var(--sage-soft)",borderRadius:12,padding:14}}><div style={{fontSize:11,color:"#2F5B3D",opacity:.8,marginBottom:4}}>Brightness trend</div><div style={{fontSize:14,fontWeight:600,color:"#2F5B3D"}}>{results.forecast.brightnessChange||"Improving"}</div></div>
                </div>
                <div style={{background:"rgba(168,230,201,.08)",border:"1px solid rgba(168,230,201,.2)",borderRadius:12,padding:"13px 16px"}}>
                  <div style={{fontSize:11,color:"#4FA876",fontWeight:600,marginBottom:4}}>AI Recommendation</div>
                  <p style={{fontSize:13,color:"var(--txt)",lineHeight:1.7}}>{results.forecast.recommendation||"Maintain your current routine consistency. Small, daily actions lead to visible improvements within 4–6 weeks."}</p>
                </div>
              </div>
            ):<p style={{color:"var(--muted)",fontSize:14}}>Forecast data will be available from your scan results.</p>}
          </div>
        </div>
      )}
      {tab==="triggers"&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{padding:"13px 16px",background:"rgba(245,213,163,.06)",border:"1px solid rgba(245,213,163,.18)",borderRadius:12,display:"flex",gap:9,alignItems:"center"}}>
            <Ic n="alert" s={14} c="#F5D5A3"/><p style={{fontSize:13,color:"#F5D5A3",lineHeight:1.6}}>AI-estimated correlations. Not medical advice. Consult a dermatologist for clinical guidance.</p>
          </div>
          {(results.triggers||[{food:"High-sugar foods",correlation:68,insight:"Sugar spikes insulin, triggering androgen hormones linked to breakouts."},{food:"Dairy products",correlation:45,insight:"Some people find dairy influences hormonal acne. Worth tracking for 4 weeks."},{food:"Processed foods",correlation:55,insight:"Trans fats increase inflammatory markers that show in skin texture."}]).map(t=>(
            <div key={t.food} className="glass" style={{padding:"18px 20px",borderRadius:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{fontSize:14,fontWeight:600}}>{t.food}</div>
                <div style={{fontSize:16,fontWeight:700,color:"var(--soft)"}}>{t.correlation}%</div>
              </div>
              <ConfBar pct={t.correlation} color="var(--soft)"/>
              <p style={{fontSize:12,color:"var(--muted)",marginTop:10,lineHeight:1.6}}>{t.insight}</p>
            </div>
          ))}
        </div>
      )}
      {tab==="routine"&&(
        <div>
          {results.recommendations?.length>0&&(
            <div style={{marginBottom:22}}>
              <h3 style={{fontSize:15,fontWeight:600,marginBottom:6,color:"var(--txt)"}}>Personalized For You</h3>
              <p style={{fontSize:12,color:"var(--muted)",marginBottom:14}}>Based on your profile, concerns, and this scan. Not a generic list.</p>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {results.recommendations.map((r,i)=>(
                  <div key={i} className="glass" style={{padding:"18px 20px",borderRadius:16,borderLeft:"3px solid var(--soft)"}}>
                    <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                      <div style={{width:26,height:26,borderRadius:7,background:"var(--petal)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--soft)",fontSize:12,fontWeight:700,flexShrink:0,marginTop:1}}>{i+1}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:14,fontWeight:600,color:"var(--txt)",marginBottom:6}}>{r.action}</div>
                        {r.reason&&<p style={{fontSize:12,color:"var(--muted)",lineHeight:1.65,marginBottom:8}}>{r.reason}</p>}
                        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                          {r.targetConcern&&<span style={{fontSize:10,color:"var(--soft)",background:"var(--petal)",padding:"3px 9px",borderRadius:20}}>Targets: {r.targetConcern}</span>}
                          {r.timeframe&&<span style={{fontSize:10,color:"#4FA876",background:"rgba(168,230,201,.08)",padding:"3px 9px",borderRadius:20}}>⏱ {r.timeframe}</span>}
                        </div>
                        {r.expectedImprovement&&<p style={{fontSize:11,color:"var(--muted)",marginTop:8,fontStyle:"italic"}}>Expected: {r.expectedImprovement}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {[["Morning Routine",["Gentle cleanser. 60 seconds","Niacinamide serum. 2–3 drops, wait 60s","Lightweight gel moisturizer","SPF 50+ sunscreen. Always last"]],["Night Routine",["Oil cleanser → water cleanser (double cleanse)","BHA exfoliant (Mon / Wed / Fri only)","Treatment serum (retinol or Vitamin C)","Rich nourishing night cream"]],["Weekly",["Chemical exfoliation ×2","Hydrating sheet mask (Sunday)","Clay mask for T-zone (Saturday)","1 rest day. No actives"]]].map(([title,items])=>(
            <div key={title} className="glass" style={{padding:"20px 22px",borderRadius:18,marginBottom:14}}>
              <h3 style={{fontSize:15,fontWeight:600,marginBottom:14}}>{title}</h3>
              {items.map((item,i)=>(
                <div key={i} className="check-row">
                  <div style={{width:26,height:26,borderRadius:7,background:"var(--petal)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--soft)",fontSize:12,fontWeight:700,flexShrink:0}}>{i+1}</div>
                  <span style={{fontSize:13,color:"var(--txt)"}}>{item}</span>
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
  /* A second, distinct Smira message for the "AI Insight" card so it never
     repeats the greeting/hero copy verbatim on the same screen (each
     message now serves its own purpose, per the polish brief). */
  const insightMsg=done===habits.length&&habits.length>0
    ?"You showed up for every habit today. That kind of consistency is worth celebrating."
    :confScore>=70
    ?"Your Confidence Score is trending well. Keep noticing the small wins along the way."
    :water<4
    ?"A little more water today could help your skin feel noticeably fresher by evening."
    :"Every small act of care adds up. Try completing one more habit before the day ends.";
  /* The desktop companion card sits right below the same-screen greeting
     and the AI Insight card, so it needs its own, third distinct line
     rather than repeating dailyMsg verbatim (that duplication was the
     remaining Home repetition bug — greeting and insight already pulled
     apart, this was the one still echoing). Tied to time-of-day like the
     avatar's mood so it reads as a companion "checking in", not a repeat. */
  const [companionMsg]=useState(()=>getMsg(h<12?"morning":h<21?"wellness":"night"));
  return(
    <BotanicalBackground variant="home">
    <div style={{padding:"22px 22px 40px",maxWidth:1240,margin:"0 auto",display:"grid",gridTemplateColumns:"1fr 300px",gap:20}} className="dash-grid">
      <div style={{minWidth:0}}>
        {/* Header — reference's icon-only top bar: pill search, bell,
           circular avatar. Search does a lightweight keyword jump to the
           relevant screen since this app doesn't have a content index. */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>
          <div>
            <h1 className="cf" style={{fontSize:26,fontWeight:600,color:"var(--txt)"}}>{greeting}, {user?.name?.split(" ")[0]||"Beautiful"} <span style={{color:"var(--gold)"}}>✦</span></h1>
            <p style={{fontSize:13,color:"var(--muted)",marginTop:5}}>{dailyMsg}</p>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <div className="hide-mobile" style={{position:"relative"}}>
              <input
                placeholder="Search Smira..."
                onKeyDown={e=>{
                  if(e.key!=="Enter")return;
                  const q=e.currentTarget.value.trim().toLowerCase();
                  const map=[["journal","journal"],["product","products"],["scan","scan"],["analys","scan"],["confidence","confidence"],["nutrition","nutrition"],["water","nutrition"],["challenge","challenges"],["forecast","forecast"],["cycle","cycle"],["setting","settings"]];
                  const hit=map.find(([k])=>q.includes(k));
                  if(hit)onNav(hit[1]);
                }}
                style={{width:230,padding:"10px 14px 10px 34px",borderRadius:999,border:"1px solid var(--border)",background:"var(--inp-bg)",color:"var(--txt)",fontSize:12.5,fontFamily:"Poppins,sans-serif"}}
              />
              <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",pointerEvents:"none",display:"flex"}}><Ic n="search" s={13} c="var(--muted)"/></span>
            </div>
            <button className="btn-o" onClick={()=>onNav("scan")} style={{display:"flex",alignItems:"center",gap:7,fontSize:12.5}}><Ic n="camera" s={14} c="var(--soft)"/>Quick Scan</button>
            <button className="btn-o" aria-label="Notifications" style={{padding:10,borderRadius:"50%"}}><Ic n="bell" s={15} c="var(--soft)"/></button>
            <div style={{width:38,height:38,borderRadius:"50%",background:"linear-gradient(135deg,var(--plum-deep),var(--lav))",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:14,flexShrink:0,boxShadow:"0 2px 8px rgba(74,51,88,.3)"}}>{(user?.name?.[0]||"S").toUpperCase()}</div>
          </div>
        </div>

        {/* Hero moment — big colour-forward organic card, character
           illustration bleeding past the card's top edge (like the
           reference's "A Calmer, Brighter You" hero) rather than sitting
           neatly boxed inside it, plus a couple of floating decorative
           sparkles outside the card for the illustrated-scene feel. */}
        <div className="hero-organic" style={{display:"flex",alignItems:"flex-end",gap:22,padding:"30px 28px 26px",marginTop:34,marginBottom:20,flexWrap:"wrap",overflow:"visible"}}>
          <div style={{flex:1,minWidth:220,position:"relative",zIndex:1}}>
            <p className="cf" style={{fontSize:23,fontWeight:600,fontStyle:"italic",color:"var(--wine)",lineHeight:1.25,marginBottom:10,maxWidth:360}}>"Your glow is built in small moments."</p>
            <button className="btn" onClick={()=>onNav("scan")} style={{background:"var(--plum-deep)",boxShadow:"0 4px 16px rgba(74,51,88,.3)"}}>Start Today's Ritual →</button>
          </div>
          <div style={{position:"relative",flexShrink:0,width:118}}>
            <span aria-hidden style={{position:"absolute",top:-30,right:-6,fontSize:20,opacity:.8}}>✦</span>
            <span aria-hidden style={{position:"absolute",top:4,left:-18,fontSize:13,opacity:.7}}>✧</span>
            <img src="/smira/hero/hero_4.png" alt="" style={{width:118,height:148,objectFit:"contain",position:"relative",zIndex:1,marginBottom:-30,filter:"drop-shadow(0 10px 18px rgba(111,68,87,.3))"}}/>
          </div>
        </div>

        {/* Metric cards — colour-forward chips, each with its own tint,
           mirroring the reference's mood-chip / stat-card palette instead
           of uniform white glass cards. */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12,marginBottom:20}}>
          {[
            {label:"Confidence",value:confScore,unit:"/100",sub:cl,chip:"chip-lav",fg:"#4A3358",page:"confidence"},
            {label:"Streak",value:streak,unit:streak===1?"day":streak>1?"days":"",sub:streak===0?"Start today!":"Keep it up!",chip:"chip-sun",fg:"#6B4E14",page:null},
            {label:"Water",value:water,unit:"/8",sub:"Glasses today",chip:"chip-sky",fg:"#215269",page:null},
            {label:"Skin Score",value:latestScan?.overallScore||".",unit:latestScan?"":"scan",sub:latestScan?"Healthy":"No scan yet",chip:"chip-coral",fg:"#7A331E",page:"scan"},
            {label:"Habits",value:`${done}/${habits.length}`,unit:"",sub:"Completed today",chip:"chip-sage",fg:"#2F5B3D",page:null},
          ].map(card=>(
            <div key={card.label} className={`chip ${card.chip} kb-focusable`} role={card.page?"button":undefined} tabIndex={card.page?0:undefined} style={{padding:"16px 14px",cursor:card.page?"pointer":"default"}} onClick={()=>card.page&&onNav(card.page)} onKeyDown={e=>{if(card.page&&(e.key==="Enter"||e.key===" ")){e.preventDefault();onNav(card.page);}}}>
              <div style={{fontSize:11,color:card.fg,opacity:.75,marginBottom:5,fontWeight:600}}>{card.label}</div>
              <div style={{fontSize:22,fontWeight:700,color:card.fg,lineHeight:1}}>{card.value}<span style={{fontSize:12,opacity:.7,fontWeight:400}}>{card.unit}</span></div>
              <div style={{fontSize:11,color:card.fg,opacity:.7,marginTop:4}}>{card.sub}</div>
            </div>
          ))}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}} className="r-col">
          {/* Today's Plan (habits) */}
          <div className="glass" style={{padding:22,borderRadius:24}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h3 className="cf" style={{fontSize:16,fontWeight:600,color:"var(--txt)"}}>Today's Plan</h3>
              <SmiraAvatar state="coach" size={28}/>
            </div>
            {habits.map(habit=>(
              <div key={habit.id} className="check-row kb-focusable" role="checkbox" aria-checked={habit.done} tabIndex={0} style={{cursor:"pointer"}} onClick={()=>toggleHabit(habit.id)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggleHabit(habit.id);}}}>
                <div style={{width:22,height:22,borderRadius:7,background:habit.done?"var(--wine)":"var(--inp-bg)",border:`1px solid ${habit.done?"transparent":"var(--border)"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .2s"}}>
                  {habit.done&&<Ic n="ok" s={11} c="#fff"/>}
                </div>
                <span style={{fontSize:13,color:habit.done?"var(--muted)":"var(--txt)",textDecoration:habit.done?"line-through":"none",transition:"all .2s"}}>{habit.label}</span>
              </div>
            ))}
            <div style={{marginTop:14}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--muted)",marginBottom:5}}><span>{done} of {habits.length} complete</span><span style={{color:done===habits.length?"#7BC99A":"var(--soft)",fontWeight:600}}>{done===habits.length?"All done!":Math.round((done/habits.length)*100)+"%"}</span></div>
              <ConfBar pct={(done/habits.length)*100} color={done===habits.length?"#7BC99A":"var(--rose)"}/>
            </div>
          </div>

          {/* AI Insight + Quick Actions */}
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div className="glass" style={{padding:20,borderRadius:24}}>
              <h4 className="cf" style={{fontSize:14,fontWeight:600,marginBottom:10,color:"var(--txt)",display:"flex",alignItems:"center",gap:7}}><Ic n="spark" s={14} c="var(--gold)"/>AI Insight for You</h4>
              <p style={{fontSize:12.5,color:"var(--muted)",lineHeight:1.65,background:"var(--petal)",borderRadius:12,padding:"10px 13px",border:"1px solid var(--border)"}}>{insightMsg}</p>
            </div>
            <div className="glass" style={{padding:20,borderRadius:24,display:"flex",gap:14,alignItems:"center"}}>
              <Ring score={confScore} size={78} color={cc}/>
              <div>
                <div style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>Confidence Score</div>
                <div style={{fontSize:16,fontWeight:700,color:cc,lineHeight:1.2}}>{cl}</div>
                <button onClick={()=>onNav("confidence")} style={{marginTop:9,fontSize:11,color:"var(--soft)",background:"none",border:"1px solid var(--border)",borderRadius:20,padding:"4px 12px",cursor:"pointer"}}>View Details</button>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions — reference's "For Your Mind Today" pattern:
           image fills the card, a circular play button floats half-on/
           half-off the bottom-right corner of the image, label sits in a
           plain footer below. Swapped from plain icon chips to this
           image-card pattern for a closer visual match. */}
        <div style={{marginBottom:16}}>
          <h4 className="cf" style={{fontSize:14,fontWeight:600,marginBottom:11,color:"var(--txt)"}}>Quick Actions</h4>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12}}>
            {[["scan","Skin Scan","Start today","/smira/hero/hero_3.png","chip-coral","#7A331E"],["journal","Journal","Reflect a bit","/smira/hero/hero_14.png","chip-lav","#4A3358"],["products","Products","Curated for you","/smira/hero/hero_9.png","chip-sage","#2F5B3D"],["story","My Story","This month","/smira/hero/hero_13.png","chip-sun","#6B4E14"]].map(([pg,label,sub,image,chip,fg])=>(
              <button key={pg} onClick={()=>onNav(pg)} className="glass kb-focusable" style={{border:"none",cursor:"pointer",padding:0,borderRadius:20,overflow:"visible",textAlign:"left",display:"flex",flexDirection:"column"}}>
                <div className={`chip ${chip}`} style={{position:"relative",height:88,borderRadius:"20px 20px 0 0",overflow:"visible"}}>
                  <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",borderRadius:"20px 20px 0 0"}}>
                    <img src={image} alt="" style={{width:64,height:64,objectFit:"contain"}}/>
                  </div>
                  <div style={{position:"absolute",bottom:-14,right:10,width:32,height:32,borderRadius:"50%",background:"#fff",boxShadow:"0 3px 10px rgba(0,0,0,.18)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2}}>
                    <Ic n="play" s={13} c={fg}/>
                  </div>
                </div>
                <div style={{padding:"18px 12px 10px",background:"var(--card)",borderRadius:"0 0 20px 20px"}}>
                  <div style={{fontSize:12.5,fontWeight:700,color:"var(--txt)"}}>{label}</div>
                  <div style={{fontSize:10.5,color:"var(--muted)",marginTop:2}}>{sub}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Water Tracker */}
        <div className="glass" style={{padding:22,borderRadius:24,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <h3 className="cf" style={{fontSize:16,fontWeight:600,color:"var(--txt)",display:"flex",alignItems:"center",gap:8}}><Ic n="leaf" s={16} c="#7EC8E3"/>Hydration Tracker</h3>
            <span style={{fontSize:12,color:water>=8?"#7BC99A":water>=6?"var(--gold)":"var(--muted)",fontWeight:600}}>{water}/8 glasses</span>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {Array.from({length:8},(_,i)=>(
              <div key={i} role="button" aria-label={`Set water intake to ${i+1} glasses`} tabIndex={0} className="kb-focusable" onClick={()=>{setWater(i+1);recordActivity("hydration");}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setWater(i+1);recordActivity("hydration");}}} style={{width:44,height:44,borderRadius:14,background:i<water?"rgba(126,200,227,.16)":"rgba(126,200,227,.06)",border:`1px solid ${i<water?"#7EC8E3":"rgba(126,200,227,.2)"}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",transition:"all .2s"}}>
                <img src="/smira/decor/30_30_water_drop.png" alt="" style={{width:20,height:20,objectFit:"contain",opacity:i<water?1:.3}}/>
              </div>
            ))}
          </div>
        </div>

        <SkinTip/>

        <div className="glass" style={{padding:22,borderRadius:24,marginTop:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <h3 className="cf" style={{fontSize:16,fontWeight:600,color:"var(--txt)"}}>7-Day Trend</h3>
            <button onClick={()=>onNav("analytics")} style={{fontSize:11,color:"var(--soft)",background:"none",border:"1px solid var(--border)",borderRadius:20,padding:"4px 12px",cursor:"pointer"}}>Full Analytics</button>
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={computeProgress(scans).series.slice(-7)}><defs><linearGradient id="dg1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#D4879A" stopOpacity={0.25}/><stop offset="95%" stopColor="#D4879A" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/><XAxis dataKey="date" tick={{fill:"var(--muted)",fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"var(--muted)",fontSize:10}} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:9,color:"var(--txt)",fontSize:11}}/>
              <Area type="monotone" dataKey="hydrationLevel" stroke="#7EC8E3" fill="url(#dg1)" strokeWidth={2} name="Hydration"/>
              <Line type="monotone" dataKey="overallScore" stroke="#D4879A" strokeWidth={2} dot={false} name="Overall Score"/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Right rail — companion + extras (desktop only) */}
      <div className="hide-mobile" style={{display:"flex",flexDirection:"column",gap:14}}>
        <div className="glass glow" style={{padding:20,borderRadius:24,position:"relative",overflow:"hidden"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span className="cf" style={{fontSize:15,fontWeight:600,color:"var(--txt)"}}>Smira</span>
            <span style={{fontSize:10,color:"var(--muted)"}}>Your AI Companion</span>
          </div>
          <div style={{width:"100%",borderRadius:18,overflow:"hidden",marginBottom:12}}><SmiraAvatar state={avState} portrait size={190}/></div>
          <p style={{fontSize:12.5,color:"var(--muted)",fontStyle:"italic",lineHeight:1.6,marginBottom:12}}>"{companionMsg}"</p>
          {streak>0&&<span className="streak-badge" style={{display:"inline-block",marginBottom:12}}>{streak===1?"Day 1. Your journey begins!":`${streak}-day streak`}</span>}
          <button className="btn" onClick={()=>onNav("journal")} style={{width:"100%",fontSize:13}}>Chat with Smira →</button>
        </div>
        <div className="glass" style={{padding:18,borderRadius:22}}>
          <p style={{fontSize:11,color:"var(--muted)",marginBottom:6}}>Today's Quote</p>
          <p className="cf" style={{fontSize:14,fontStyle:"italic",color:"var(--soft)",lineHeight:1.5}}>"Your glow is a reflection of how well you cherish yourself." <span style={{color:"var(--rose)"}}>♥</span></p>
        </div>
        <div className="glass" style={{padding:18,borderRadius:22}}>
          <p style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>{new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})}</p>
          <p style={{fontSize:12,color:"var(--txt)"}}>Small daily habits create beautiful long-term results.</p>
        </div>
      </div>
    </div>
    </BotanicalBackground>
  );
};

const ConfidenceScore=({habits,water,journalEntries,scans,user})=>{
  const score=calcConfidenceScore(habits,water,journalEntries,scans);
  const cl=confLabel(score),cc=confColor(score);
  return(
    <div style={{padding:"24px 22px",maxWidth:720,margin:"0 auto"}}>
      <h1 className="cf" style={{fontSize:32,marginBottom:5,fontWeight:600,color:"var(--txt)"}}>Confidence Score</h1>
      <p style={{color:"var(--muted)",fontSize:13,marginBottom:20}}>Measuring self-care consistency, not how you look.</p>
      <div className="hero-organic glow" style={{padding:28,marginBottom:20}}>
        <div style={{position:"absolute",top:-20,right:-10,width:140,height:170,opacity:.15,borderRadius:20,overflow:"hidden",pointerEvents:"none"}}>
          <SmiraAvatar state={score>=70?"happy":"coach"} portrait size={170}/>
        </div>
        <div style={{display:"flex",gap:18,alignItems:"center",marginBottom:22,position:"relative",zIndex:1}}>
          <SmiraAvatar state={score>=70?"happy":score>=50?"coach":"empathy"} size={60} animate={true}/>
          <div>
            <div style={{fontSize:11,color:"var(--wine)",opacity:.75,fontWeight:600,textTransform:"uppercase",letterSpacing:".08em",marginBottom:3}}>Your Confidence Score</div>
            <div style={{fontSize:44,fontWeight:700,color:"var(--wine)",lineHeight:1}}>{score}<span style={{fontSize:18,color:"var(--wine)",opacity:.75,fontWeight:400}}>/100</span></div>
            <div style={{fontSize:15,color:"var(--wine)",fontWeight:600,marginTop:4}}>{cl}</div>
          </div>
        </div>
        <ConfBar pct={score} color="var(--wine)"/>
        <p style={{fontSize:12,color:"var(--wine)",opacity:.75,marginTop:12,lineHeight:1.65,position:"relative",zIndex:1}}>Built from habit consistency, hydration, journaling, and skin scans. Never from your appearance. Every act of self-care counts.</p>
      </div>
      <div style={{marginBottom:18}}><SmiraMsg state={score>=70?"happy":score>=50?"encouragement":"empathy"} text={score>=70?`You are genuinely thriving, ${user?.name?.split(" ")[0]||""}. This score reflects weeks of consistent self-care. Keep going. You're building something beautiful.`:score>=50?"You're making real progress. Every habit completed, every glass of water, every journal entry. It all matters more than you know.":"Every journey begins exactly where you are. You're not behind. You're building momentum. One small act of self-care today changes everything."} size={44}/></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:13}}>
        {[["Daily Habits",`${habits?.filter(h=>h.done).length||0}/${habits?.length||6}`,((habits?.filter(h=>h.done).length||0)/(habits?.length||6))*100,"chip-lav","#4A3358"],["Hydration",`${water||0}/8`,((water||0)/8)*100,"chip-sky","#215269"],["Journal Entries",`${journalEntries?.length||0}`,Math.min((journalEntries?.length||0)*5,100),"chip-sun","#6B4E14"],["Skin Scans",`${scans?.length||0}`,Math.min((scans?.length||0)*15,100),"chip-sage","#2F5B3D"]].map(([l,v,pct,chip,c])=>(
          <div key={l} className={`chip ${chip}`} style={{padding:"16px",textAlign:"center"}}>
            <div style={{fontSize:20,fontWeight:700,color:c,marginBottom:4}}>{v}</div>
            <div style={{fontSize:11,color:c,opacity:.8,marginBottom:8}}>{l}</div>
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
  const MOODS=[["😊","Happy","chip-sun"],["😌","Calm","chip-sage"],["😔","Low","chip-sky"],["😤","Frustrated","chip-coral"],["🥰","Confident","chip-peach"],["😰","Anxious","chip-lav"]];
  const prompts=["How did your skin feel today. Physically and emotionally?","What's one thing your body did for you today that you're grateful for?","Did anything trigger self-criticism today? How did you handle it?","What made you feel most like yourself today?","One small win from today. No matter how tiny?"];
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
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}}><div><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:5,flexWrap:"wrap"}}><h1 className="cf" style={{fontSize:32,fontWeight:600,color:"var(--txt)",margin:0}}>Glow Journal</h1><span style={{fontSize:11,fontWeight:600,color:"var(--soft)",background:"var(--inp-bg)",border:"1px solid var(--border)",borderRadius:20,padding:"3px 10px",display:"inline-flex",alignItems:"center",gap:5}}>🔒 Private to you</span></div>
      <p style={{color:"var(--muted)",fontSize:13,marginBottom:20}}>A private space to reflect on your emotional journey and self-care growth.</p></div><img src="/smira/hero/hero_14.png" alt="Glow journal" style={{width:96,height:96,objectFit:"contain",flexShrink:0}}/></div>
      <div style={{display:"flex",gap:6,marginBottom:20}}>
        {[["write","Write"],["entries","Past Entries"],["insights","Insights"]].map(([t,l])=>(
          <button key={t} className={`tab-btn${tab===t?" act":""}`} onClick={()=>setTab(t)}>{l}</button>
        ))}
      </div>
      {tab==="write"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div style={{marginBottom:4}}><SmiraMsg state="journal" text={prompt} size={44}/></div>
          <div className="glass" style={{padding:20,borderRadius:20}}>
            <h3 className="cf" style={{fontSize:15,fontWeight:600,marginBottom:14,color:"var(--txt)"}}>How are you feeling today?</h3>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
              {MOODS.map(([emoji,label,chip])=>(
                <button key={label} className={`mood-pill chip ${chip}`} style={{border:"none",boxShadow:form.mood===label?"0 0 0 3px rgba(74,51,88,.35)":"none",transform:form.mood===label?"scale(1.04)":"none",width:"100%",aspectRatio:"1.15",justifyContent:"center"}} onClick={()=>setForm(f=>({...f,mood:label}))}>
                  <span style={{fontSize:24}}>{emoji}</span>
                  <span style={{color:"#3D2A2E"}}>{label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="glass" style={{padding:20,borderRadius:20}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
              {[["Confidence level","confidence"],["Energy level","energy"]].map(([label,key])=>(
                <div key={key}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}>
                    <label style={{fontSize:12,color:"var(--muted)"}}>{label}</label>
                    <span style={{fontSize:13,fontWeight:700,color:"var(--soft)"}}>{form[key]}/10</span>
                  </div>
                  <input type="range" min={1} max={10} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:Number(e.target.value)}))} style={{width:"100%",accentColor:"var(--rose)"}}/>
                </div>
              ))}
            </div>
          </div>
          <div className="glass" style={{padding:20,borderRadius:20}}>
            <label style={{fontSize:12,color:"var(--muted)",display:"block",marginBottom:8}}>Today's reflection</label>
            <textarea className="inp" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="How did your skin or confidence feel today? What's on your mind?" rows={4} style={{resize:"vertical",lineHeight:1.65}}/>
          </div>
          <div className="glass" style={{padding:20,borderRadius:20}}>
            <label style={{fontSize:12,color:"var(--soft)",display:"block",marginBottom:8}}>Gratitude entry</label>
            <input className="inp" value={form.gratitude} onChange={e=>setForm(f=>({...f,gratitude:e.target.value}))} placeholder="One thing you're grateful for about your body or self today..."/>
          </div>
          <button className="btn" onClick={save} style={{width:"100%"}} disabled={!form.mood&&!form.note}>{saved?"Saved!":"Save Entry"}</button>
        </div>
      )}
      {tab==="entries"&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {entries.length===0
            ?<EmptyState img="/smira/empty/02_no_journal_entries.png" title="Your journal is empty" message="Write your first entry to start tracking your emotional journey. Even a few words each day builds powerful self-awareness." actionLabel="Write First Entry" onAction={()=>setTab("write")}/>
            :entries.map((e,i)=>(
              <div key={e.ts||i} className="glass" style={{padding:"18px 20px",borderRadius:16}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                  <div style={{display:"flex",gap:9,alignItems:"center"}}>
                    <span style={{fontSize:18}}>{MOODS.find(m=>m[1]===e.mood)?.[0]||"📝"}</span>
                    <span style={{fontSize:13,fontWeight:600,color:"var(--txt)"}}>{e.mood||"Reflection"}</span>
                  </div>
                  <span style={{fontSize:11,color:"var(--muted)"}}>{e.date}</span>
                </div>
                <div style={{display:"flex",gap:9,marginBottom:e.note?10:0}}>
                  <span className="tag">Confidence {e.confidence}/10</span>
                  <span className="tag">Energy {e.energy}/10</span>
                </div>
                {e.note&&<p style={{fontSize:13,color:"var(--muted)",lineHeight:1.65}}>{e.note}</p>}
                {e.gratitude&&<p style={{fontSize:12,color:"var(--soft)",marginTop:8,fontStyle:"italic"}}>{e.gratitude}</p>}
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
                {[["Total Entries",entries.length,"var(--txt)"],["Avg Confidence",`${avgConf}/10`,"var(--soft)"],["Streak Days",calcStreak(),"#4FA876"]].map(([l,v,c])=>(
                  <div key={l} className="glass" style={{padding:"16px",borderRadius:16,textAlign:"center"}}>
                    <div style={{fontSize:22,fontWeight:700,color:c,marginBottom:4}}>{v}</div>
                    <div style={{fontSize:11,color:"var(--muted)"}}>{l}</div>
                  </div>
                ))}
              </div>
              <div className="glass" style={{padding:22,borderRadius:20}}>
                <h3 className="cf" style={{fontSize:15,fontWeight:600,marginBottom:14,color:"var(--txt)"}}>Confidence Trend</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={entries.slice(0,14).reverse().map((e,i)=>({day:`D${i+1}`,confidence:e.confidence,energy:e.energy}))}>
                    <defs><linearGradient id="jg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--soft)" stopOpacity={0.28}/><stop offset="95%" stopColor="var(--soft)" stopOpacity={0}/></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                    <XAxis dataKey="day" tick={{fill:"var(--muted)",fontSize:9}} axisLine={false} tickLine={false}/>
                    <YAxis domain={[0,10]} tick={{fill:"var(--muted)",fontSize:9}} axisLine={false} tickLine={false}/>
                    <Tooltip contentStyle={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:9,color:"var(--txt)",fontSize:11}}/>
                    <Area type="monotone" dataKey="confidence" stroke="var(--soft)" fill="url(#jg)" strokeWidth={2} name="Confidence"/>
                    <Line type="monotone" dataKey="energy" stroke="#4FA876" strokeWidth={2} dot={false} name="Energy"/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <SmiraMsg state={avgConf>=7?"happy":"encouragement"} text={`You've journaled ${entries.length} times. Average confidence: ${avgConf}/10. ${avgConf>=7?"Your self-awareness is growing beautifully. Keep reflecting.":"Remember, tracking how you feel is already an act of self-care. You're doing something most people never do."}`} size={44}/>
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
  const tierColor={Budget:"#4FA876",Mid:"#F5D5A3",Premium:"var(--soft)",Luxury:"var(--txt)"};
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
      <h1 className="cf" style={{fontSize:32,marginBottom:14,fontWeight:600,color:"var(--txt)"}}>Product Recommendations</h1>
      <div style={{marginBottom:20}}><SmiraMsg state="coach" text={`These products were curated for your ${skinType} skin. I've included options across every budget. Great skin doesn't require expensive products, just the right ones.`} size={44}/></div>
      {!results&&<div style={{background:"var(--petal)",border:"1px solid var(--border)",borderRadius:14,padding:"12px 16px",marginBottom:18,display:"flex",gap:10,alignItems:"center"}}><Ic n="alert" s={15} c="var(--soft)"/><p style={{fontSize:13,color:"var(--soft)"}}>Complete a skin analysis to get recommendations tailored to your specific skin type and concerns.</p></div>}
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by ingredient or product name..." style={{width:"100%",padding:"10px 14px",borderRadius:12,border:"1px solid var(--border)",background:"var(--inp-bg)",color:"var(--txt)",fontSize:13,fontFamily:"Poppins,sans-serif",marginBottom:14,boxSizing:"border-box"}}/>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        {cats.map(c=><button key={c} onClick={()=>setCat(c)} style={{padding:"9px 20px",borderRadius:24,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,textTransform:"capitalize",background:cat===c?"linear-gradient(135deg,var(--plum-deep),var(--lav))":"var(--petal)",color:cat===c?"#fff":"var(--soft)",transition:"all .2s"}}>{c}</button>)}
      </div>
      <div style={{display:"flex",gap:6,marginBottom:22,flexWrap:"wrap"}}>
        {["All","Budget","Mid","Premium","Luxury"].map(b=><button key={b} onClick={()=>setBudget(b)} style={{padding:"6px 14px",borderRadius:20,border:`1px solid ${budget===b?"var(--soft)":"var(--border)"}`,background:budget===b?"var(--petal)":"transparent",color:budget===b?"var(--soft)":"var(--muted)",cursor:"pointer",fontSize:12,fontWeight:500,transition:"all .2s"}}>{b}</button>)}
      </div>
      {prods.length===0
        ?<EmptyState img="/smira/empty/04_no_saved_products.png" title="No products found" message="Try a different budget filter, search term, or skin category to discover the right products for you." actionLabel="Show All Budgets" onAction={()=>{setBudget("All");setSearch("");}}/>
        :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:16}}>
          {prods.map((p,i)=>(
            <div key={p.name} className="glass glow chip-lav" style={{padding:18,borderRadius:18,display:"flex",flexDirection:"column",gap:11,background:"linear-gradient(160deg,rgba(255,255,255,.55),var(--lav-soft))",position:"relative"}}>
              {/* Top-ranked item per category is explicitly labeled "Best
                 Match" rather than just happening to sort first — makes
                 the recommendation explainable per the brand brief, without
                 a separate primary/alternatives layout that would fight
                 the existing filter-and-browse flow. */}
              {i===0&&(concerns.length>0||results?.skinType)&&<span style={{position:"absolute",top:-9,left:14,background:"var(--wine)",color:"#FFFEFC",fontSize:10,fontWeight:700,padding:"4px 11px",borderRadius:20,letterSpacing:".03em",boxShadow:"0 2px 8px rgba(41,40,92,.28)"}}>Best Match</span>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{width:44,height:44,borderRadius:12,background:"linear-gradient(135deg,var(--coral),var(--peach))",display:"flex",alignItems:"center",justifyContent:"center"}}><Ic n="bag" s={20} c="#fff"/></div>
                <span style={{background:`${tierColor[p.tier]||"#F5D5A3"}22`,color:tierColor[p.tier],padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600,border:`1px solid ${tierColor[p.tier]||"#F5D5A3"}35`}}>{p.tier}</span>
              </div>
              <div>
                <div style={{fontSize:14,fontWeight:600,color:"var(--txt)"}}>{p.name}</div>
                <div style={{fontSize:12,color:"var(--muted)",marginTop:2}}>{p.brand}</div>
              </div>
              <div style={{fontSize:11,color:"var(--muted)"}}>Suitable for: {p.for.join(", ")}</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{p.ing.map(i=><span key={i} className="tag" style={{fontSize:10}}>{i}</span>)}</div>
              {p.why&&<div style={{padding:"9px 12px",background:"var(--sun-soft)",borderRadius:10,border:"1px solid rgba(240,189,74,.3)"}}><p style={{fontSize:12,color:"#6B4E14",lineHeight:1.6,fontStyle:"italic"}}>{p.why}</p></div>}
              <p style={{fontSize:12,color:"var(--txt)",lineHeight:1.6}}>{p.benefit}</p>
              {USAGE_BY_CATEGORY[cat]&&<p style={{fontSize:11,color:"var(--muted)",lineHeight:1.55}}><b style={{color:"#7EC8E3"}}>How to use: </b>{USAGE_BY_CATEGORY[cat]}</p>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:"auto"}}>
                <span style={{fontSize:18,fontWeight:700,color:"var(--soft)"}}>{p.price}</span>
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
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}}><div><h1 className="cf" style={{fontSize:32,marginBottom:14,fontWeight:600,color:"var(--txt)"}}>Nutrition & Hydration</h1></div><img src="/smira/hero/hero_9.png" alt="Nutrition" style={{width:96,height:96,objectFit:"contain",flexShrink:0}}/></div>
      <div style={{marginBottom:20}}><SmiraMsg state="morning" text="What you eat can influence how your skin feels and looks. Let's make choices that nourish you from the inside out." size={44}/></div>
      <div className="glass" style={{padding:22,borderRadius:20,marginBottom:20}}>
        <h3 className="cf" style={{fontSize:14,fontWeight:600,marginBottom:14,display:"flex",alignItems:"center",gap:8}}><Ic n="leaf" s={16} c="#7EC8E3"/>Water Intake</h3>
        <div style={{display:"flex",flexWrap:"wrap",gap:9,marginBottom:12}}>
          {Array.from({length:8},(_,i)=>(
            <div key={i} role="button" aria-label={`Set water intake to ${i+1} glasses`} tabIndex={0} className="kb-focusable" onClick={()=>{setWater(i+1);recordActivity("hydration");}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setWater(i+1);recordActivity("hydration");}}} style={{width:46,height:46,borderRadius:13,background:i<water?"linear-gradient(135deg,#7EC8E3,#4AAFCC)":"rgba(126,200,227,.1)",border:`1px solid ${i<water?"#7EC8E3":"rgba(126,200,227,.2)"}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",transition:"all .2s",fontSize:20}}>
              {i<water?"💧":"○"}
            </div>
          ))}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--muted)"}}>
          <span>{water} of 8 glasses today</span>
          <span style={{color:water>=8?"#4FA876":water>=6?"#F5D5A3":"#F5A3A3",fontWeight:600}}>{water>=8?"Goal reached!":water>=6?"Almost there!":"Keep drinking!"}</span>
        </div>
      </div>

      <div className="glass" style={{padding:22,borderRadius:20,marginBottom:20}}>
        <h3 className="cf" style={{fontSize:14,fontWeight:600,marginBottom:14,color:"var(--txt)"}}>Your Personalized Diet Plan</h3>
        <div style={{display:"flex",gap:16,marginBottom:16,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:150}}>
            <div style={{fontSize:11,color:"var(--muted)",marginBottom:6}}>Diet Type</div>
            <div style={{display:"flex",gap:6}}>
              {["Vegetarian","Non-Vegetarian"].map(d=>(
                <button key={d} onClick={()=>setDietType(d)} className={dietType===d?"chip chip-sage":""} style={{flex:1,padding:"8px 10px",borderRadius:10,border:dietType===d?"none":"1px solid var(--border)",background:dietType===d?undefined:"transparent",color:dietType===d?"#2F5B3D":"var(--muted)",fontSize:11,fontWeight:700,cursor:"pointer"}}>{d==="Vegetarian"?"Veg":"Non-Veg"}</button>
              ))}
            </div>
          </div>
          <div style={{flex:1,minWidth:150}}>
            <div style={{fontSize:11,color:"var(--muted)",marginBottom:6}}>Budget</div>
            <div style={{display:"flex",gap:6}}>
              {["Low","Medium","Premium"].map(b=>(
                <button key={b} onClick={()=>setBudget(b)} className={budget===b?"chip chip-sun":""} style={{flex:1,padding:"8px 6px",borderRadius:10,border:budget===b?"none":"1px solid var(--border)",background:budget===b?undefined:"transparent",color:budget===b?"#6B4E14":"var(--muted)",fontSize:11,fontWeight:700,cursor:"pointer"}}>{b}</button>
              ))}
            </div>
          </div>
        </div>
        {err&&<ErrorBox message={err} onRetry={generate}/>}
        <button className="btn" onClick={generate} disabled={loading} style={{width:"100%"}}>{loading?"Creating your plan...":plan?"Regenerate Plan":"Generate My Diet Plan"}</button>
        {!results&&<p style={{fontSize:11,color:"var(--muted)",marginTop:10,textAlign:"center"}}>Tip: complete a skin scan first so this plan can target your actual concerns.</p>}
      </div>
      {loading&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}} className="r-col">
          <SkeletonCard/><SkeletonCard/><SkeletonCard/><SkeletonCard/>
        </div>
      )}

      {plan&&(
        <>
          <div className="glass" style={{padding:"18px 20px",borderRadius:16,marginBottom:18}}>
            <p style={{fontSize:13,color:"var(--txt)",lineHeight:1.7,fontStyle:"italic"}}>{plan.summary}</p>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:18}} className="r-col">
            {[["Breakfast",plan.meals?.breakfast,"chip-sun","#6B4E14"],["Lunch",plan.meals?.lunch,"chip-coral","#7A331E"],["Dinner",plan.meals?.dinner,"chip-sage","#2F5B3D"],["Snacks",plan.meals?.snacks,"chip-peach","#7A4A1E"],["Drinks",plan.meals?.drinks,"chip-sky","#215269"]].map(([label,items,chip,color])=>items?.length>0&&(
              <div key={label} className={`chip ${chip}`} style={{padding:"16px 18px"}}>
                <div style={{fontSize:11,color,fontWeight:700,marginBottom:10,textTransform:"uppercase",letterSpacing:".06em"}}>{label}</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {items.map((it,i)=>(
                    <div key={i}>
                      <div style={{fontSize:13,color,fontWeight:600}}>{it.food}</div>
                      <div style={{fontSize:11,color,opacity:.75,lineHeight:1.5,marginTop:2}}>{it.reason}</div>
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
                  <div key={i}><span style={{fontSize:13,color:"var(--txt)",fontWeight:600}}>{a.food}</span><span style={{fontSize:12,color:"var(--muted)"}}>: {a.reason}</span></div>
                ))}
              </div>
            </div>
          )}
          {plan.keyNutrients?.length>0&&(
            <div className="glass" style={{padding:20,borderRadius:18,marginBottom:18}}>
              <h3 className="cf" style={{fontSize:13,fontWeight:600,marginBottom:12,color:"var(--txt)"}}>Key Nutrients For You</h3>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {plan.keyNutrients.map((n,i)=>(
                  <div key={i}>
                    <div style={{fontSize:13,color:"var(--soft)",fontWeight:600}}>{n.nutrient}</div>
                    <div style={{fontSize:12,color:"var(--muted)",lineHeight:1.55}}>{n.why} <span style={{color:"var(--muted)"}}>Sources: {n.sources}</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {results?.triggers?.length>0&&(
        <div className="glass" style={{padding:22,borderRadius:20}}>
          <h3 className="cf" style={{fontSize:14,fontWeight:600,marginBottom:14,color:"var(--txt)"}}>Your Food-Skin Correlations</h3>
          {results.triggers.map(t=>(
            <div key={t.food} style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}><span style={{color:"var(--txt)"}}>{t.food}</span><span style={{color:"var(--soft)",fontWeight:600}}>{t.correlation}% correlation</span></div>
              <ConfBar pct={t.correlation} color="var(--soft)"/>
              <p style={{fontSize:12,color:"var(--muted)",marginTop:5,lineHeight:1.55}}>{t.insight}</p>
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
    {id:"hydration7",icon:"leaf",sticker:"/smira/achievements/02_hydration_drop.png",title:"7-Day Hydration",desc:"Drink 8 glasses of water every day for 7 days.",duration:7,reward:"Hydration Hero"},
    {id:"glow30",icon:"spark",sticker:"/smira/achievements/03_glow_bloom.png",title:"30-Day Glow",desc:"Complete your morning and night routine every day for 30 days.",duration:30,reward:"Glow Master"},
    {id:"sleep14",icon:"cycle",sticker:"/smira/achievements/05_rest_ritual.png",title:"14-Day Better Sleep",desc:"Sleep by 11 PM for 14 consecutive nights to support skin repair.",duration:14,reward:"Rest Royalty"},
    {id:"journal21",icon:"book",sticker:"/smira/achievements/06_journal_bloom.png",title:"21-Day Journal",desc:"Write one journal entry every day for 21 days.",duration:21,reward:"Reflection Champion"},
    {id:"nosugar7",icon:"heart",sticker:"/smira/achievements/01_consistency_seed.png",title:"7-Day Sugar Detox",desc:"Avoid refined sugar for 7 days and track how your skin responds.",duration:7,reward:"Clear Skin Warrior"},
    {id:"selfcare7",icon:"heart",sticker:"/smira/achievements/08_self_care_champion.png",title:"7-Day Self-Care",desc:"Do one intentional self-care act every day for 7 consecutive days.",duration:7,reward:"Self-Love Champion"},
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
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}}><div><h1 className="cf" style={{fontSize:32,marginBottom:14,fontWeight:600,color:"var(--txt)"}}>Challenges</h1></div><img src="/smira/hero/hero_13.png" alt="Challenges" style={{width:96,height:96,objectFit:"contain",flexShrink:0}}/></div>
      <div style={{marginBottom:20}}><SmiraMsg state={completedAny?"achievement":"coach"} text={completedAny?"You've completed a challenge. I'm so proud of you. Every milestone you hit is proof of how far you've come.":"Personal challenges to build confidence and healthy habits. These are just for you. No competition, no pressure. Just growth."} size={46}/></div>
      {celebrated&&(
        <div style={{padding:"22px 26px",background:"linear-gradient(135deg,rgba(79,168,118,.16),var(--card))",border:"1px solid rgba(79,168,118,.35)",borderRadius:20,marginBottom:20,display:"flex",gap:14,alignItems:"center"}}>
          <img src={celebrated.sticker} alt="" style={{width:84,height:84,objectFit:"contain",flexShrink:0}}/>
          <div>
            <div style={{fontSize:11,color:"#4FA876",fontWeight:600,textTransform:"uppercase",letterSpacing:".07em",marginBottom:5}}>Challenge Complete!</div>
            <h3 className="cf" style={{fontSize:22,fontWeight:600,marginBottom:5,color:"var(--txt)"}}>You earned: {celebrated.reward}</h3>
            <p style={{fontSize:13,color:"var(--txt)",lineHeight:1.65}}>Completing the {celebrated.title} challenge shows real dedication to your wellbeing. I'm genuinely proud of you.</p>
            <button onClick={()=>setCelebrated(null)} className="btn-o" style={{marginTop:10,fontSize:12,padding:"6px 16px"}}>Continue</button>
          </div>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(290px,1fr))",gap:16}}>
        {CHALLENGES.map((c,i)=>{
          const isJoined=joined.includes(c.id),prog=progress[c.id]||0,done=prog>=c.duration,pct=(prog/c.duration)*100;
          const pal=[CHIP_CLASSES[0],CHIP_CLASSES[1],CHIP_CLASSES[4],CHIP_CLASSES[3],CHIP_CLASSES[2],CHIP_CLASSES[5]];
          return(
            <div key={c.id} className={`chip ${pal[i%pal.length]}`} style={{position:"relative",padding:20}}>
              {done&&<div style={{position:"absolute",top:12,right:12,background:"linear-gradient(135deg,#4FA876,#68C99A)",borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700,color:"#0A2A1A"}}>Complete</div>}
              <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:14}}>
                <img src={c.sticker} alt="" style={{width:46,height:46,objectFit:"contain",flexShrink:0}}/>
                <div><div style={{fontSize:15,fontWeight:700,color:"#3D2A2E",marginBottom:4}}>{c.title}</div><div style={{fontSize:12,color:"#3D2A2E",opacity:.75,lineHeight:1.6}}>{c.desc}</div></div>
              </div>
              <div style={{marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#3D2A2E",opacity:.8,marginBottom:6}}>
                  <span>{prog} / {c.duration} days</span>
                  <span style={{fontWeight:700,display:"flex",alignItems:"center",gap:4}}><Ic n="trophy" s={11} c="#3D2A2E"/>{c.reward}</span>
                </div>
                <ConfBar pct={pct} color={done?"#4FA876":"#3D2A2E"}/>
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

const Analytics=({scans,onNav})=>{
  const [tab,setTab]=useState("weekly");
  if(!scans?.length)return<EmptyState img="/smira/empty/01_no_skin_scan.png" title="Your progress will appear here" message="Complete your first skin scan and Smira will begin building your personal trends over time." actionLabel="Start Your First Scan" onAction={onNav?()=>onNav("scan"):null}/>;
  const progress=computeProgress(scans);
  const recentSeries=progress.series.slice(-7);
  return(
    <div style={{padding:"24px 22px",maxWidth:900,margin:"0 auto"}}>
      <h1 className="cf" style={{fontSize:32,marginBottom:5,fontWeight:600,color:"var(--txt)"}}>Your Analytics</h1>
      <p style={{color:"var(--muted)",fontSize:13,marginBottom:20}}>Track how your skin and wellness evolve over time.</p>
      <div style={{display:"flex",gap:5,marginBottom:22}}>
        {[["weekly","Recent Scans"],["monthly","All Scans"],["habits","Habit Insights"]].map(([t,l])=>(
          <button key={t} className={`tab-btn${tab===t?" act":""}`} onClick={()=>setTab(t)}>{l}</button>
        ))}
      </div>
      {tab==="weekly"&&(
        <div style={{display:"flex",flexDirection:"column",gap:18}}>
          <div className="glass" style={{padding:22,borderRadius:20}}>
            <h3 className="cf" style={{fontSize:15,fontWeight:600,marginBottom:14,color:"var(--txt)"}}>Skin Health Trends</h3>
            <p style={{fontSize:11,color:"var(--muted)",marginBottom:10}}>Your last {recentSeries.length} scan{recentSeries.length===1?"":"s"}</p>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={recentSeries}><defs>
                <linearGradient id="ag1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#7EC8E3" stopOpacity={0.25}/><stop offset="95%" stopColor="#7EC8E3" stopOpacity={0}/></linearGradient>
                <linearGradient id="ag2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--soft)" stopOpacity={0.25}/><stop offset="95%" stopColor="var(--soft)" stopOpacity={0}/></linearGradient>
              </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/><XAxis dataKey="date" tick={{fill:"var(--muted)",fontSize:10}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"var(--muted)",fontSize:10}} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:9,color:"var(--txt)",fontSize:11}}/>
                <Area type="monotone" dataKey="hydrationLevel" stroke="#7EC8E3" fill="url(#ag1)" strokeWidth={2} name="Hydration"/>
                <Area type="monotone" dataKey="brightness" stroke="var(--soft)" fill="url(#ag2)" strokeWidth={2} name="Brightness"/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="glass" style={{padding:22,borderRadius:20}}>
            <h3 className="cf" style={{fontSize:15,fontWeight:600,marginBottom:14,color:"var(--txt)"}}>Overall Skin Score Trend</h3>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={recentSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                <XAxis dataKey="date" tick={{fill:"var(--muted)",fontSize:10}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:"var(--muted)",fontSize:10}} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:9,color:"var(--txt)",fontSize:11}}/>
                <Line type="monotone" dataKey="overallScore" stroke="var(--soft)" strokeWidth={2.5} dot={{fill:"var(--soft)",r:3}} name="Overall Score"/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {tab==="monthly"&&(
        <div className="glass" style={{padding:22,borderRadius:20}}>
          <h3 className="cf" style={{fontSize:15,fontWeight:600,marginBottom:14,color:"var(--txt)"}}>All-Time Score Progress</h3>
          <p style={{fontSize:11,color:"var(--muted)",marginBottom:10}}>Every scan you've completed, oldest to newest</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={progress.series}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
              <XAxis dataKey="date" tick={{fill:"var(--muted)",fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:"var(--muted)",fontSize:11}} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:9,color:"var(--txt)",fontSize:11}}/>
              <Bar dataKey="overallScore" fill="var(--coral)" radius={[6,6,0,0]} name="Skin Score"/>
              <Bar dataKey="hydrationLevel" fill="var(--peach)" radius={[6,6,0,0]} name="Hydration"/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {tab==="habits"&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <SmiraMsg state="coach" text="Your most consistent habits create the most visible results. Here's how your daily actions are adding up over time." size={44}/>
          {DEFAULT_HABITS.map((h,i)=>{
            const pal=CHIP_CLASSES;
            return(
            <div key={h.id} className="glass" style={{padding:"16px 20px",borderRadius:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",gap:12,alignItems:"center"}}>
                <div className={`chip ${pal[i%pal.length]}`} style={{width:38,height:38,display:"flex",alignItems:"center",justifyContent:"center"}}><Ic n={h.icon} s={18} c="#4A3358"/></div>
                <span style={{fontSize:13,color:"var(--txt)"}}>{h.label}</span>
              </div>
              <div style={{width:80}}><ConfBar pct={55+((i*17)%40)} color="var(--soft)"/></div>
            </div>
          );})}
        </div>
      )}
    </div>
  );
};

const Journey=({scans,onNav})=>{
  if(!scans?.length)return<EmptyState avatarState="welcome" naturalImg title="Your journey starts now" message="Each skin scan becomes a milestone in your glow journey. Complete your first scan to begin tracking your transformation." actionLabel="Start First Scan" onAction={onNav?()=>onNav("scan"):null}/>;
  return(
    <div style={{padding:"24px 22px",maxWidth:800,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}}><div><h1 className="cf" style={{fontSize:32,marginBottom:14,fontWeight:600,color:"var(--txt)"}}>Your Glow Journey</h1></div><img src="/smira/hero/hero_12.png" alt="Glow journey" style={{width:96,height:96,objectFit:"contain",flexShrink:0}}/></div>
      <SmiraMsg state="happy" text={`You've completed ${scans.length} skin scan${scans.length!==1?"s":""}. Each one is a milestone in your journey. Look how far you've come.`} size={44}/>
      <div style={{marginTop:20,display:"flex",flexDirection:"column",gap:0}}>
        {scans.map((s,i)=>(
          <div key={i} style={{display:"flex",gap:16,alignItems:"flex-start"}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,var(--plum-deep),var(--lav))",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff",fontSize:13,fontWeight:700}}>{i+1}</div>
              {i<scans.length-1&&<div style={{width:2,height:40,background:"var(--border)",margin:"4px 0"}}/>}
            </div>
            <div className="glass" style={{flex:1,padding:"16px 18px",borderRadius:16,marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <div style={{fontSize:14,fontWeight:600,color:"var(--txt)"}}>{s.date}</div>
                <div style={{fontSize:20,fontWeight:700,color:"var(--soft)"}}>{s.overallScore}</div>
              </div>
              {s.thumb&&<img src={s.thumb} alt="scan" style={{width:80,height:80,objectFit:"cover",borderRadius:10,marginBottom:8}}/>}
              <p style={{fontSize:12,color:"var(--muted)",lineHeight:1.6}}>{s.summary||"Skin analysis completed. Check your results for personalized insights."}</p>
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
    {icon:"chart",label:"Skin scans completed",value:scans?.length||0,color:"var(--soft)"},
    {icon:"heart",label:"Confidence Score",value:`${confScore}/100`,color:confColor(confScore)},
    {icon:"book",label:"Journal entries",value:journalEntries?.length||0,color:"var(--txt)"},
    {icon:"ok",label:"Habits completed today",value:`${habitDone}/${habits?.length||6}`,color:"#4FA876"},
  ];
  return(
    <div style={{padding:"24px 22px",maxWidth:640,margin:"0 auto"}}>
      <div style={{marginBottom:32,textAlign:"center",padding:"8px 12px 0"}}>
        {/* This previously pointed at the same trophy icon used on the
           Challenges page (hero_13.png) — visually unrelated to "your
           story", and not the character illustration this hero moment
           was meant to showcase. Now uses Smira's own portrait artwork,
           sized generously with `contain` (never `cover`) so the full
           figure — hair, hands, surrounding flowers — stays intact at
           every width instead of being cropped by a tight box. */}
        <img src="/smira/hero/hero_1.png" alt="Your monthly Smira story" style={{width:"100%",maxWidth:280,height:"auto",objectFit:"contain",margin:"0 auto 20px",display:"block"}}/>
        <span className="cf" style={{fontSize:"clamp(28px,5vw,44px)",fontWeight:600,background:"linear-gradient(135deg,var(--plum-deep),var(--lav))",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",display:"block",marginBottom:8}}>Your Smira Story</span>
        <p style={{color:"var(--soft)",fontSize:15,fontWeight:500}}>{month}</p>
      </div>
      <div className="glass glow" style={{padding:28,borderRadius:26,marginBottom:18,background:"linear-gradient(135deg,var(--petal),var(--card))"}}>
        <h2 className="cf" style={{fontSize:22,fontWeight:600,marginBottom:18,textAlign:"center",color:"var(--txt)"}}>{firstName}'s Highlights</h2>
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          {highlights.map(h=>(
            <div key={h.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",background:"var(--petal)",borderRadius:14}}>
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <div style={{width:28,height:28,borderRadius:8,background:"var(--border)",display:"flex",alignItems:"center",justifyContent:"center"}}><Ic n={h.icon} s={14} c={h.color}/></div>
                <span style={{fontSize:13,color:"var(--txt)"}}>{h.label}</span>
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
            <div style={{fontSize:10,color:"var(--soft)",fontWeight:600,marginBottom:7,textTransform:"uppercase",letterSpacing:".07em"}}>Monthly Message from Smira</div>
            <p style={{fontSize:14,color:"var(--txt)",lineHeight:1.85,fontStyle:"italic"}}>
              "This month you showed up for yourself. Not every day was perfect. And that's okay. What matters is that you're building habits with intention, learning about your body, and choosing self-care over self-criticism. That's real progress, {firstName}. I'm proud of you."
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

/* Circular cycle wheel — replaces the old text-only stats block with a
   ring divided into colored arcs (one per phase, proportional to how many
   days of the cycle they cover) plus a dot marking the current day. Pure
   SVG, no libraries, so it stays consistent with the rest of the app's
   hand-rolled icon/illustration approach. */
const cyclePolar=(cx,cy,r,angleDeg)=>({x:cx+r*Math.sin(angleDeg*Math.PI/180),y:cy-r*Math.cos(angleDeg*Math.PI/180)});
const CycleWheel=({dayInCycle,avgLen,phaseRanges,phases,phaseLabel,size=216})=>{
  const cx=size/2,cy=size/2,r=size/2-17,strokeW=15;
  const angleForDay=(d)=>Math.max(0,Math.min(360,(d/avgLen)*360));
  const arcs=phases.map(p=>{
    const range=phaseRanges[p.id];
    if(!range)return null;
    const a1=angleForDay(range[0]-1)+1.4;
    const a2=angleForDay(range[1])-1.4;
    if(a2<=a1)return null;
    const p1=cyclePolar(cx,cy,r,a1),p2=cyclePolar(cx,cy,r,a2);
    const large=a2-a1>180?1:0;
    return <path key={p.id} d={`M ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y}`} stroke={p.color} strokeWidth={strokeW} strokeLinecap="round" fill="none"/>;
  });
  const markerAngle=dayInCycle?angleForDay(dayInCycle):null;
  const markerPt=markerAngle!=null?cyclePolar(cx,cy,r,markerAngle):null;
  return(
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Cycle day ${dayInCycle||"unknown"} of ${avgLen}, ${phaseLabel||""} phase`}>
      <circle cx={cx} cy={cy} r={r} stroke="var(--border)" strokeWidth={strokeW} fill="none"/>
      {arcs}
      {markerPt&&<circle cx={markerPt.x} cy={markerPt.y} r={7} fill="#FFFEFC" stroke="var(--soft)" strokeWidth={3}/>}
      <text x={cx} y={cy-6} textAnchor="middle" fontSize={30} fontWeight={700} fill="var(--txt)" fontFamily="'Playfair Display',serif">{dayInCycle?`Day ${dayInCycle}`:"."}</text>
      <text x={cx} y={cy+18} textAnchor="middle" fontSize={12} fill="var(--muted)" fontFamily="'Poppins',sans-serif" letterSpacing=".02em">{phaseLabel?`${phaseLabel} Phase`:"Log a period to begin"}</text>
    </svg>
  );
};
/* ── Cycle Tracker data helpers ─────────────────────────────────────
   Every recorded period is USER-CONFIRMED ("actual"). Smira only ever
   CALCULATES a next-period estimate from history — it never marks a
   period as having started on its own. See MenstrualTracker below. */
const PHASES=[
  {id:"menstrual",label:"Menstrual",color:"#F5A3A3"},
  {id:"follicular",label:"Follicular",color:"#F5D5A3"},
  {id:"ovulation",label:"Ovulation",color:"#A8E6C9"},
  {id:"luteal",label:"Luteal",color:"#B39DDB"},
];
const PHASE_CONTENT={
  menstrual:{
    duration:"Usually 3–7 days",
    biology:"Estrogen and progesterone are at their lowest point. The uterus sheds its lining, which is your period.",
    whyFeel:"With both hormones low, energy often dips and the body is doing physical work to shed the uterine lining. That combination is behind a lot of what you may feel this phase.",
    body:"Cramping, a dull lower-back ache, bloating, and general fatigue are common while the uterus contracts.",
    skin:"Skin can feel more reactive or sensitive than usual, and some people notice a temporarily duller complexion.",
    emotional:"Some people feel more inward-turned, tired, or low-key during the first day or two, as hormone levels bottom out.",
    energy:"Energy is often at its lowest for the cycle. Gentler movement can feel better than high-intensity workouts right now.",
    appetite:"Cravings for iron-rich or comforting foods are common as the body loses some blood.",
    sexualDrive:"Desire varies a lot here. Some feel less interested due to discomfort, others notice no change at all.",
    common:["Mild-to-moderate cramps","Bloating","Fatigue or low energy","Lower back discomfort","Headaches"],
    attention:["Soaking through a pad or tampon every hour for several hours in a row","Pain severe enough to stop your daily activities","Bleeding that lasts longer than 7 days","Any new or rapidly worsening symptom"],
  },
  follicular:{
    duration:"Usually 7–10 days (right after your period)",
    biology:"Estrogen begins rising as the body prepares an egg for release. The uterine lining starts rebuilding.",
    whyFeel:"Rising estrogen is commonly linked with improving mood, energy, and skin clarity as this phase progresses.",
    body:"Energy typically climbs day by day. Cramping and bloating usually ease off.",
    skin:"Skin often looks brighter and more balanced as estrogen rises. A good window to introduce new products.",
    emotional:"Many people notice more optimism, focus, and motivation building through this phase.",
    energy:"Energy and stamina tend to increase, making this a good stretch for more demanding workouts or projects.",
    appetite:"Appetite is often more stable and moderate compared to other phases.",
    sexualDrive:"Desire can start to pick up as estrogen rises, especially closer to ovulation.",
    common:["Increasing energy","Improved mood","Clearer-feeling skin","Better focus"],
    attention:["Persistent fatigue that doesn't lift as the phase progresses","Unusual spotting between periods","Skin changes that are severe or sudden"],
  },
  ovulation:{
    duration:"Typically a short 3–4 day window mid-cycle",
    biology:"A mature egg is released from the ovary. Estrogen peaks and testosterone rises slightly just before this happens.",
    whyFeel:"The hormonal peak around ovulation is commonly associated with a short-lived boost in confidence, energy, and skin glow.",
    body:"Some people notice mild one-sided pelvic twinges (sometimes called ovulation pain) and slightly more cervical discharge.",
    skin:"This is often when skin looks its brightest. A good window for photos or a scan.",
    emotional:"Confidence and sociability commonly peak for some people during this short window.",
    energy:"Energy and physical performance are often at their highest around ovulation.",
    appetite:"Appetite is often at its lowest point in the cycle.",
    sexualDrive:"Desire commonly peaks here for many people, coinciding with the fertile window.",
    common:["Mild one-sided pelvic twinge","Slight increase in energy","Heightened sense of well-being","Change in discharge texture"],
    attention:["Sharp or severe one-sided pain","Pain lasting more than a day or two","Heavy bleeding outside your period"],
  },
  luteal:{
    duration:"Usually 10–14 days (until your next period)",
    biology:"Progesterone rises to prepare the uterine lining; both hormones fall sharply near the end if pregnancy doesn't occur.",
    whyFeel:"Rising progesterone. Followed by a hormone drop right before your period. Is commonly linked to PMS-type experiences like mood changes, bloating, and breakouts.",
    body:"Bloating, breast tenderness, headaches, and water retention are common, especially in the final days.",
    skin:"Oil production often increases, and breakouts (especially along the jawline) are more likely here than in other phases.",
    emotional:"Irritability, emotional sensitivity, and low mood are commonly reported in the days before a period (sometimes called PMS).",
    energy:"Energy can dip again toward the end of this phase, and sleep quality may shift for some people.",
    appetite:"Increased appetite and cravings. Especially for sweet or salty foods. Are very commonly reported here.",
    sexualDrive:"Desire often eases compared to ovulation, though this varies a lot between individuals.",
    common:["Bloating","Breast tenderness","Mood swings or irritability","Acne or breakouts","Food cravings","Brain fog"],
    attention:["Mood changes severe enough to disrupt daily life or relationships","Symptoms so intense they interfere with work, school, or sleep","Any symptom that feels drastically different from your usual pattern"],
  },
};
const TOPIC_CARDS=[
  {key:"body",label:"Body",emoji:"🩷"},
  {key:"skin",label:"Skin",emoji:"✨"},
  {key:"emotional",label:"Emotional Health",emoji:"🧠"},
  {key:"energy",label:"Energy & Sleep",emoji:"⚡"},
  {key:"appetite",label:"Appetite & Cravings",emoji:"🍫"},
  {key:"sexualDrive",label:"Sexual Drive",emoji:"💕"},
];
const genCycleId=()=>`c_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
const isoDay=(d)=>{const x=new Date(d);x.setHours(0,0,0,0);return x;};
const addDaysD=(date,n)=>{const dd=new Date(date);dd.setDate(dd.getDate()+n);return dd;};
const daysBetween=(a,b)=>Math.round((isoDay(b)-isoDay(a))/86400000);
const fmtCycleDate=(d)=>new Date(d).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
const fmtCycleDateShort=(d)=>new Date(d).toLocaleDateString("en-IN",{day:"2-digit",month:"short"});

const MenstrualTracker=({scans,user,onUpdateProfile})=>{
  const [cycles,setCycles]=useState(()=>{
    // One-time migration: give any pre-existing entries a stable id.
    const raw=LS.get("menstrual_cycles",[]);
    const migrated=raw.map(c=>c.id?c:{...c,id:genCycleId()});
    if(migrated.some((c,i)=>c!==raw[i]))LS.set("menstrual_cycles",migrated);
    return migrated;
  });
  const [tab,setTab]=useState("overview"); // overview | calendar | history
  const [modal,setModal]=useState(null); // {mode:'add'|'edit', id?, date, length}
  const [monthCursor,setMonthCursor]=useState(()=>{const d=new Date();d.setDate(1);return d;});
  const [cycleLengthPref,setCycleLengthPref]=useState(()=>{
    const v=parseInt(user?.cycleLength,10);
    return Number.isFinite(v)?v:28;
  });

  const saveCycles=(next)=>{
    next=[...next].sort((a,b)=>new Date(a.date)-new Date(b.date));
    setCycles(next);LS.set("menstrual_cycles",next);
  };

  const sorted=[...cycles].sort((a,b)=>new Date(a.date)-new Date(b.date));
  const actualGaps=sorted.slice(1).map((c,i)=>daysBetween(sorted[i].date,c.date)).filter(g=>g>=15&&g<=60);
  const avgLen=actualGaps.length?Math.round(actualGaps.reduce((a,b)=>a+b,0)/actualGaps.length):cycleLengthPref;
  const minLen=actualGaps.length?Math.min(...actualGaps):null;
  const maxLen=actualGaps.length?Math.max(...actualGaps):null;
  const recordedLens=sorted.map(c=>c.length).filter(n=>Number.isFinite(n));
  const avgPeriodLen=recordedLens.length?Math.round(recordedLens.reduce((a,b)=>a+b,0)/recordedLens.length):5;

  const lastEntry=sorted.length?sorted[sorted.length-1]:null;
  const lastStart=lastEntry?isoDay(lastEntry.date):null;
  const today=isoDay(new Date());
  const dayInCycle=lastStart?daysBetween(lastStart,today)+1:null;
  const predictedNextStart=lastStart?addDaysD(lastStart,avgLen):null;
  const delayDays=(predictedNextStart&&today>predictedNextStart)?daysBetween(predictedNextStart,today):0;
  const isDelayed=delayDays>0;

  const ovulationDay=Math.max(10,avgLen-14);
  const fertileStart=Math.max(1,ovulationDay-5);
  const fertileEnd=ovulationDay+1;

  const phaseForDay=(d)=>{
    if(d==null)return null;
    if(d<=Math.min(7,avgLen))return"menstrual";
    if(d<ovulationDay-1)return"follicular";
    if(d<=ovulationDay+1)return"ovulation";
    return"luteal";
  };
  const currentPhase=phaseForDay(dayInCycle);
  const phaseMeta=PHASES.find(p=>p.id===currentPhase);
  const phaseInfo=currentPhase?PHASE_CONTENT[currentPhase]:null;

  /* Correlate real scan history with cycle phase. */
  const phaseCorrelation=(()=>{
    if(!sorted.length||!scans?.length)return null;
    const buckets={menstrual:[],follicular:[],ovulation:[],luteal:[]};
    scans.forEach(s=>{
      if(!s.ts)return;
      const scanDate=isoDay(new Date(s.ts));
      const priorStarts=sorted.filter(c=>isoDay(c.date)<=scanDate);
      if(!priorStarts.length)return;
      const start=isoDay(priorStarts[priorStarts.length-1].date);
      const d=daysBetween(start,scanDate)+1;
      const ph=phaseForDay(d);
      if(ph)buckets[ph].push(s.overallScore||0);
    });
    const out={};
    Object.entries(buckets).forEach(([k,v])=>{if(v.length)out[k]=Math.round(v.reduce((a,b)=>a+b,0)/v.length);});
    return Object.keys(out).length>=2?out:null;
  })();

  const openAdd=()=>setModal({mode:"add",date:new Date().toISOString().slice(0,10),length:""});
  const openEdit=(c)=>setModal({mode:"edit",id:c.id,date:new Date(c.date).toISOString().slice(0,10),length:c.length||""});
  const closeModal=()=>setModal(null);
  const saveModal=()=>{
    if(!modal?.date)return;
    const len=modal.length?parseInt(modal.length,10):undefined;
    if(modal.mode==="add"){
      saveCycles([...cycles,{id:genCycleId(),date:modal.date,...(len?{length:len}:{})}].slice(-36));
    } else {
      saveCycles(cycles.map(c=>c.id===modal.id?{...c,date:modal.date,...(len?{length:len}:{length:undefined})}:c));
    }
    closeModal();
  };
  const deleteCycle=(id)=>{
    if(!window.confirm("Delete this recorded period? This can't be undone."))return;
    saveCycles(cycles.filter(c=>c.id!==id));
  };
  const saveCycleLengthPref=()=>{
    onUpdateProfile?.({...user,cycleLength:String(cycleLengthPref)});
  };

  /* ── Predicted period windows, for the calendar (a few cycles ahead) ── */
  const predictedWindows=(()=>{
    if(!lastStart)return[];
    const out=[];let cursorStart=predictedNextStart;
    for(let i=0;i<6&&cursorStart;i++){
      out.push({start:cursorStart,end:addDaysD(cursorStart,avgPeriodLen-1)});
      cursorStart=addDaysD(cursorStart,avgLen);
    }
    return out;
  })();
  const actualWindows=sorted.map(c=>({start:isoDay(c.date),end:addDaysD(isoDay(c.date),(c.length||avgPeriodLen)-1),id:c.id}));
  const dateInWindow=(date,win)=>date>=win.start&&date<=win.end;

  return(
    <div style={{padding:"24px 22px",maxWidth:760,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}}><div><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:7,flexWrap:"wrap"}}><h1 className="cf" style={{fontSize:32,fontWeight:600,color:"var(--txt)",margin:0}}>Cycle Tracker</h1><span style={{fontSize:11,fontWeight:600,color:"var(--soft)",background:"var(--inp-bg)",border:"1px solid var(--border)",borderRadius:20,padding:"3px 10px",display:"inline-flex",alignItems:"center",gap:5}}>🔒 Private to you</span></div>
      <p style={{color:"var(--muted)",fontSize:13,marginBottom:20}}>A private space to understand your cycle. And connect it to your skin.</p></div><img src="/smira/hero/hero_15.png" alt="Cycle tracker" style={{width:96,height:96,objectFit:"contain",flexShrink:0}}/></div>
      <SmiraMsg state="empathy" text="Smira can estimate your next period from your history, but you're always the source of truth. Nothing gets marked as your period until you confirm it." size={44}/>

      {/* ── Main dial card ── */}
      <div className="glass" style={{padding:"20px 22px",borderRadius:20,marginTop:20,marginBottom:14}}>
        {!lastStart?(
          <div style={{textAlign:"center",padding:"10px 0"}}>
            <p style={{fontSize:13,color:"var(--muted)",marginBottom:14}}>Log your last period start date to begin predictions.</p>
            <button className="btn" onClick={openAdd}>+ Add Period</button>
          </div>
        ):(
          <>
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:4}}>
              <button onClick={openAdd} style={{padding:"9px 16px",borderRadius:20,border:"1px solid var(--border)",background:"transparent",color:"var(--soft)",fontSize:12,fontWeight:600,cursor:"pointer"}}>+ Add Period</button>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:28,alignItems:"center",justifyContent:"center",padding:"6px 0 4px"}}>
              <CycleWheel
                dayInCycle={Math.min(dayInCycle,avgLen)}
                avgLen={avgLen}
                phaseRanges={{menstrual:[1,Math.min(7,avgLen)],follicular:[Math.min(8,avgLen),Math.max(8,ovulationDay-2)],ovulation:[Math.max(9,ovulationDay-1),ovulationDay+1],luteal:[Math.min(avgLen,ovulationDay+2),avgLen]}}
                phases={PHASES}
                phaseLabel={phaseMeta?.label}
              />
              <div style={{display:"flex",flexDirection:"column",gap:10,minWidth:180}}>
                {PHASES.map(p=>(
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:9}}>
                    <span style={{width:10,height:10,borderRadius:"50%",background:p.color,flexShrink:0}}/>
                    <span style={{fontSize:12,fontWeight:currentPhase===p.id?700:500,color:currentPhase===p.id?"var(--txt)":"var(--muted)"}}>{p.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {isDelayed?(
              <div style={{marginTop:16,padding:"14px 16px",borderRadius:14,background:"rgba(245,163,163,.12)",border:"1px solid rgba(245,163,163,.3)"}}>
                <div style={{fontSize:14,fontWeight:700,color:"#B5476B",marginBottom:4}}>Your period is delayed by {delayDays} day{delayDays===1?"":"s"}.</div>
                <p style={{fontSize:12,color:"var(--muted)",marginBottom:10,lineHeight:1.6}}>This is only Smira's estimate catching up to reality. Cycles vary, and a delay isn't automatically anything to worry about. When your period actually starts, record it below.</p>
                <button className="btn" onClick={openAdd} style={{padding:"9px 16px",fontSize:13}}>Did your period start? + Add Period</button>
              </div>
            ):(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:20}}>
                <div className="chip chip-coral" style={{padding:"12px 14px"}}>
                  <div style={{fontSize:11,color:"#7A331E",opacity:.8,marginBottom:4}}>Estimated next period</div>
                  <div style={{fontSize:15,fontWeight:700,color:"#7A331E"}}>{fmtCycleDateShort(predictedNextStart)}</div>
                </div>
                <div className="chip chip-sage" style={{padding:"12px 14px"}}>
                  <div style={{fontSize:11,color:"#2F5B3D",opacity:.8,marginBottom:4}}>Fertile window (est.)</div>
                  <div style={{fontSize:15,fontWeight:700,color:"#2F5B3D"}}>{fmtCycleDateShort(addDaysD(lastStart,fertileStart))} – {fmtCycleDateShort(addDaysD(lastStart,fertileEnd))}</div>
                </div>
              </div>
            )}

            <p style={{fontSize:11,color:"var(--muted)",marginTop:12,lineHeight:1.6}}>
              {actualGaps.length>=2
                ?`Based on your last ${actualGaps.length} cycles (${minLen}–${maxLen} days, avg ${avgLen}). Cycles vary month to month. This is an estimate, not a guarantee.`
                :actualGaps.length===1
                ?`Based on 1 recorded cycle so far. Log a couple more periods and Smira will sharpen this to your actual pattern.`
                :`Using your usual cycle length of ${avgLen} days. Log 2+ periods so Smira can learn your actual pattern instead of assuming every cycle is the same.`}
            </p>
          </>
        )}
      </div>

      {/* ── Add / Edit period modal ── */}
      {modal&&(
        <div className="glass" style={{padding:"18px 20px",borderRadius:16,marginBottom:18}}>
          <h3 style={{fontSize:14,fontWeight:600,color:"var(--txt)",marginBottom:12}}>{modal.mode==="add"?"Add period":"Edit period"}</h3>
          <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}>
            <div>
              <label style={{fontSize:11,color:"var(--muted)",display:"block",marginBottom:5}}>Start date</label>
              <input type="date" value={modal.date} onChange={e=>setModal(m=>({...m,date:e.target.value}))} max={new Date().toISOString().slice(0,10)} style={{padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--inp-bg)",color:"var(--txt)",fontSize:13,fontFamily:"Poppins,sans-serif"}}/>
            </div>
            <div>
              <label style={{fontSize:11,color:"var(--muted)",display:"block",marginBottom:5}}>Duration in days (optional)</label>
              <input type="number" min="1" max="14" value={modal.length} onChange={e=>setModal(m=>({...m,length:e.target.value}))} placeholder="e.g. 5" style={{width:100,padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--inp-bg)",color:"var(--txt)",fontSize:13,fontFamily:"Poppins,sans-serif"}}/>
            </div>
            <button className="btn" onClick={saveModal} style={{padding:"9px 18px"}}>Save</button>
            <button onClick={closeModal} style={{padding:"9px 14px",borderRadius:20,border:"none",background:"transparent",color:"var(--muted)",cursor:"pointer",fontSize:13}}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={{display:"flex",gap:8,marginBottom:18}}>
        {[{k:"overview",l:"Overview"},{k:"calendar",l:"Calendar"},{k:"history",l:"History"}].map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)} style={{flex:1,padding:"10px 8px",borderRadius:14,border:`1px solid ${tab===t.k?"var(--soft)":"var(--border)"}`,background:tab===t.k?"var(--soft)":"transparent",color:tab===t.k?"#fff":"var(--muted)",fontSize:13,fontWeight:600,cursor:"pointer"}}>{t.l}</button>
        ))}
      </div>

      {/* ── Overview tab: phases + education ── */}
      {tab==="overview"&&(
        <>
          <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
            {PHASES.map(p=><div key={p.id} style={{flex:1,minWidth:110,padding:"9px 10px",borderRadius:14,border:`1px solid ${currentPhase===p.id?p.color:"var(--border)"}`,background:currentPhase===p.id?`${p.color}22`:"var(--inp-bg)",color:currentPhase===p.id?p.color:"var(--muted)",fontSize:12,fontWeight:600,textAlign:"center"}}>{p.label}{currentPhase===p.id&&" (now)"}</div>)}
          </div>

          {phaseMeta&&phaseInfo?(
            <>
              <div className="glass" style={{padding:"22px 24px",borderRadius:20,borderLeft:`3px solid ${phaseMeta.color}`,marginBottom:18}}>
                <h3 className="cf" style={{fontSize:19,fontWeight:600,color:phaseMeta.color,marginBottom:4}}>You're currently in your {phaseMeta.label.toLowerCase()} phase</h3>
                <p style={{fontSize:12,color:"var(--muted)",marginBottom:12}}>Day {dayInCycle} · {phaseInfo.duration}</p>
                <p style={{fontSize:14,color:"var(--txt)",lineHeight:1.75,marginBottom:14}}>{phaseInfo.biology}</p>
                <div style={{background:"var(--inp-bg)",borderRadius:14,padding:"14px 16px"}}>
                  <h4 style={{fontSize:12,fontWeight:700,color:"var(--txt)",marginBottom:6}}>Why might I feel this way?</h4>
                  <p style={{fontSize:13,color:"var(--muted)",lineHeight:1.7}}>{phaseInfo.whyFeel}</p>
                </div>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:14,marginBottom:18}}>
                {TOPIC_CARDS.map(tc=>(
                  <div key={tc.key} className="glass" style={{padding:"16px 18px",borderRadius:16}}>
                    <h4 style={{fontSize:13,fontWeight:700,color:"var(--txt)",marginBottom:6}}>{tc.emoji} {tc.label}</h4>
                    <p style={{fontSize:12.5,color:"var(--muted)",lineHeight:1.65}}>{phaseInfo[tc.key]}</p>
                  </div>
                ))}
              </div>

              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:14,marginBottom:18}}>
                <div className="glass" style={{padding:"18px 20px",borderRadius:16,borderLeft:"3px solid var(--green)"}}>
                  <h4 style={{fontSize:13,fontWeight:700,color:"var(--green)",marginBottom:8}}>Common Experiences</h4>
                  <ul style={{margin:0,paddingLeft:18,display:"flex",flexDirection:"column",gap:5}}>
                    {phaseInfo.common.map(c=><li key={c} style={{fontSize:12.5,color:"var(--txt)",lineHeight:1.5}}>{c}</li>)}
                  </ul>
                </div>
                <div className="glass" style={{padding:"18px 20px",borderRadius:16,borderLeft:"3px solid #F5A3A3"}}>
                  <h4 style={{fontSize:13,fontWeight:700,color:"#B5476B",marginBottom:8}}>When to Pay Attention</h4>
                  <ul style={{margin:0,paddingLeft:18,display:"flex",flexDirection:"column",gap:5}}>
                    {phaseInfo.attention.map(c=><li key={c} style={{fontSize:12.5,color:"var(--txt)",lineHeight:1.5}}>{c}</li>)}
                  </ul>
                  <p style={{fontSize:11,color:"var(--muted)",marginTop:10,lineHeight:1.6}}>Smira isn't able to diagnose anything. If something feels severe, persistent, or unusual for you, it's worth speaking with a healthcare professional.</p>
                </div>
              </div>
            </>
          ):(
            <p style={{fontSize:13,color:"var(--muted)",textAlign:"center",padding:"20px 0"}}>Add a period to see personalized phase information.</p>
          )}

          {phaseCorrelation&&(
            <div className="glass" style={{padding:22,borderRadius:20}}>
              <h3 className="cf" style={{fontSize:16,fontWeight:600,marginBottom:6,color:"var(--txt)"}}>Your Skin & Cycle</h3>
              <p style={{fontSize:12,color:"var(--muted)",marginBottom:14}}>Average skin score from your scans, grouped by the cycle phase they were taken in.</p>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {PHASES.filter(p=>phaseCorrelation[p.id]!==undefined).map(p=>(
                  <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:13,color:p.color}}>{p.label}</span>
                    <span style={{fontSize:14,fontWeight:700,color:"var(--txt)"}}>{phaseCorrelation[p.id]}</span>
                  </div>
                ))}
              </div>
              <p style={{fontSize:11,color:"var(--muted)",marginTop:12,lineHeight:1.6}}>Based on {scans.length} scan{scans.length===1?"":"s"} matched to logged cycle dates. More scans across more cycles will sharpen this pattern.</p>
            </div>
          )}
        </>
      )}

      {/* ── Calendar tab ── */}
      {tab==="calendar"&&(
        <CycleCalendar monthCursor={monthCursor} setMonthCursor={setMonthCursor} actualWindows={actualWindows} predictedWindows={predictedWindows} today={today} onDayClick={(date)=>{
          const hit=actualWindows.find(w=>dateInWindow(date,w));
          if(hit){const c=cycles.find(x=>x.id===hit.id);if(c)openEdit(c);}
        }}/>
      )}

      {/* ── History tab ── */}
      {tab==="history"&&(
        <div>
          <div className="glass" style={{padding:"16px 18px",borderRadius:16,marginBottom:16,display:"flex",gap:12,alignItems:"flex-end",flexWrap:"wrap"}}>
            <div>
              <label style={{fontSize:11,color:"var(--muted)",display:"block",marginBottom:5}}>Your usual cycle length</label>
              <select className="sel" value={cycleLengthPref} onChange={e=>setCycleLengthPref(parseInt(e.target.value,10))}>
                {Array.from({length:22},(_,i)=>21+i).map(n=><option key={n} value={n}>{n} days</option>)}
              </select>
            </div>
            <button className="btn" onClick={saveCycleLengthPref} style={{padding:"9px 16px",fontSize:13}}>Save Preference</button>
            <p style={{fontSize:11,color:"var(--muted)",flexBasis:"100%",lineHeight:1.6}}>Used only until you've logged enough real periods for Smira to calculate your actual average. Recorded history always takes priority.</p>
          </div>

          {sorted.length===0?(
            <p style={{fontSize:13,color:"var(--muted)",textAlign:"center",padding:"30px 0"}}>No periods recorded yet. Tap “+ Add Period” above to start your history.</p>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {[...sorted].reverse().map((c,idx)=>{
                const nextChron=sorted[sorted.indexOf(c)+1];
                const cycleLenHere=nextChron?daysBetween(c.date,nextChron.date):null;
                return(
                  <div key={c.id} className="glass" style={{padding:"14px 18px",borderRadius:14,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                    <div>
                      <div style={{fontSize:14,fontWeight:700,color:"var(--txt)"}}>{fmtCycleDate(c.date)}</div>
                      <div style={{fontSize:11,color:"var(--muted)",marginTop:3}}>
                        {c.length?`${c.length}-day period · `:""}
                        {cycleLenHere?`${cycleLenHere}-day cycle`:"Most recent. Cycle length pending"}
                        {" · "}Recorded by you
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>openEdit(c)} style={{padding:"7px 12px",borderRadius:20,border:"1px solid var(--border)",background:"transparent",color:"var(--soft)",fontSize:12,fontWeight:600,cursor:"pointer"}}>Edit</button>
                      <button onClick={()=>deleteCycle(c.id)} style={{padding:"7px 12px",borderRadius:20,border:"1px solid rgba(245,163,163,.4)",background:"transparent",color:"#B5476B",fontSize:12,fontWeight:600,cursor:"pointer"}}>Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* Month-grid calendar: solid dots for user-confirmed ("actual") periods,
   lighter/outlined dots for Smira's estimated upcoming periods — the two
   must always be visually distinguishable, never blended together. */
const CycleCalendar=({monthCursor,setMonthCursor,actualWindows,predictedWindows,today,onDayClick})=>{
  const y=monthCursor.getFullYear(),m=monthCursor.getMonth();
  const firstDay=new Date(y,m,1);
  const startOffset=firstDay.getDay();
  const daysInMonth=new Date(y,m+1,0).getDate();
  const cells=[];
  for(let i=0;i<startOffset;i++)cells.push(null);
  for(let d=1;d<=daysInMonth;d++)cells.push(new Date(y,m,d));

  const isIn=(date,win)=>date&&win.start&&date>=isoDay(win.start)&&date<=isoDay(win.end);

  return(
    <div className="glass" style={{padding:"18px 20px",borderRadius:20,marginBottom:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <button onClick={()=>setMonthCursor(new Date(y,m-1,1))} style={{background:"none",border:"none",cursor:"pointer",color:"var(--soft)",fontSize:16,padding:"4px 10px"}} aria-label="Previous month">‹</button>
        <span style={{fontSize:14,fontWeight:700,color:"var(--txt)"}}>{monthCursor.toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</span>
        <button onClick={()=>setMonthCursor(new Date(y,m+1,1))} style={{background:"none",border:"none",cursor:"pointer",color:"var(--soft)",fontSize:16,padding:"4px 10px"}} aria-label="Next month">›</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:6}}>
        {["S","M","T","W","T","F","S"].map((d,i)=><div key={i} style={{textAlign:"center",fontSize:10,color:"var(--muted)",fontWeight:700}}>{d}</div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
        {cells.map((date,i)=>{
          if(!date)return <div key={i}/>;
          const dISO=isoDay(date);
          const isActual=actualWindows.some(w=>isIn(dISO,w));
          const isPredicted=!isActual&&predictedWindows.some(w=>isIn(dISO,w));
          const isToday=dISO.getTime()===today.getTime();
          return(
            <div key={i} {...kb(()=>onDayClick(dISO),`${date.getDate()}`)} style={{aspectRatio:"1",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",cursor:isActual?"pointer":"default"}}>
              <span style={{
                width:"78%",height:"78%",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:isToday?800:500,
                background:isActual?"#B5476B":isPredicted?"rgba(181,71,107,.14)":"transparent",
                color:isActual?"#fff":isPredicted?"#B5476B":"var(--txt)",
                border:isToday?"2px solid var(--soft)":isPredicted?"1px dashed rgba(181,71,107,.5)":"none",
              }}>{date.getDate()}</span>
            </div>
          );
        })}
      </div>
      <div style={{display:"flex",gap:16,marginTop:16,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:12,height:12,borderRadius:"50%",background:"#B5476B"}}/><span style={{fontSize:11,color:"var(--muted)"}}>Actual period</span></div>
        <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:12,height:12,borderRadius:"50%",background:"rgba(181,71,107,.14)",border:"1px dashed rgba(181,71,107,.5)"}}/><span style={{fontSize:11,color:"var(--muted)"}}>Estimated period</span></div>
        <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:12,height:12,borderRadius:"50%",border:"2px solid var(--soft)"}}/><span style={{fontSize:11,color:"var(--muted)"}}>Today</span></div>
      </div>
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
  if(w.uv>=8){spf="SPF 50+, reapply every 2 hours";tips.push("UV is very high today. Seek shade when possible and wear sunglasses.");}
  else if(w.uv>=6){spf="SPF 50+";tips.push("Moderate-high UV. Don't skip reapplication if you're outdoors midday.");}
  else if(w.uv>=3){spf="SPF 30+";}
  else{spf="SPF 15-30 (still don't skip it)";}

  let moisturizer="Balanced, medium-weight moisturizer";
  if(w.humidity>=70){moisturizer="Lightweight gel moisturizer. Heavy creams may feel suffocating and worsen oiliness today";tips.push("High humidity. A rich cream may trap sweat and oil; go lighter than usual.");}
  else if(w.humidity<=35){moisturizer="Rich, occlusive moisturizer. Layer a facial oil if skin feels tight";tips.push("Low humidity draws moisture out of skin. Hydrate more than usual, inside and out.");}

  if(w.temp>=32){tips.push("High heat. Carry blotting papers and drink more water than usual to support your skin barrier.");}
  if(w.temp<=15){tips.push("Cold air can strip moisture fast. Don't skip a hydrating serum under your moisturizer.");}
  if(w.aqi!=null&&w.aqi>100){tips.push("Air quality is poor today. Double-cleanse tonight and consider an antioxidant serum (Vitamin C) to counter pollution stress.");}
  if(concerns.includes("Acne")&&w.humidity>=65){tips.push("Humidity + acne-prone skin. Resist touching your face; sweat can mix with oil and clog pores.");}
  if(skinType==="Dry"&&w.humidity<=40){tips.push("Dry skin type in low humidity is a tough combo. Consider a humidifier indoors tonight.");}

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
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}}><div><h1 className="cf" style={{fontSize:32,marginBottom:7,fontWeight:600,color:"var(--txt)"}}>Today's Skin Forecast</h1>
      <p style={{color:"var(--muted)",fontSize:13,marginBottom:20}}>Real-time weather, translated into what your skin actually needs today.</p></div><img src="/smira/hero/hero_11.png" alt="Skin forecast" style={{width:96,height:96,objectFit:"contain",flexShrink:0}}/></div>

      {status==="idle"&&(
        <div className="glass" style={{padding:"28px 24px",borderRadius:20,textAlign:"center"}}>
          <p style={{fontSize:13,color:"var(--muted)",marginBottom:16,lineHeight:1.7}}>Share your location for a personalized forecast, or enter your city manually. Nothing is stored beyond this session.</p>
          <button className="btn" onClick={useMyLocation} style={{marginBottom:10}}>Use My Location</button>
          <div><button onClick={()=>setStatus("manual")} style={{background:"none",border:"none",color:"var(--muted)",fontSize:12,textDecoration:"underline",cursor:"pointer"}}>Enter city manually instead</button></div>
        </div>
      )}
      {(status==="locating"||status==="loading")&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div className="glass" style={{padding:"20px 22px",borderRadius:20}}>
            <p style={{fontSize:12,color:"var(--muted)",marginBottom:14}}>{status==="locating"?"Getting your location...":"Loading today's forecast..."}</p>
            <Skeleton rows={2} height={20}/>
          </div>
          <SkeletonCard/>
          <SkeletonCard/>
        </div>
      )}
      {status==="manual"&&(
        <div className="glass" style={{padding:"22px 24px",borderRadius:20}}>
          {err&&<p style={{fontSize:12,color:"#F5A3A3",marginBottom:12}}>{err}</p>}
          <p style={{fontSize:13,color:"var(--muted)",marginBottom:12}}>Enter your city:</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <input value={cityInput} onChange={e=>setCityInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submitCity()} placeholder="e.g. Kolkata" style={{flex:1,minWidth:160,padding:"10px 14px",borderRadius:12,border:"1px solid var(--border)",background:"var(--inp-bg)",color:"var(--txt)",fontSize:13,fontFamily:"Poppins,sans-serif"}}/>
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
          <div className="chip chip-sky" style={{padding:"20px 22px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
            <div>
              <div style={{fontSize:12,color:"#215269",opacity:.8}}>{place}</div>
              <div style={{fontSize:28,fontWeight:700,color:"#215269"}}>{weather.temp}°C</div>
              <div style={{fontSize:13,color:"#215269",fontWeight:600}}>{weather.condition}</div>
            </div>
            <div style={{display:"flex",gap:16,fontSize:12,color:"#215269"}}>
              <div style={{textAlign:"center"}}><div style={{fontWeight:700,fontSize:15}}>{weather.uv}</div>UV Index</div>
              <div style={{textAlign:"center"}}><div style={{fontWeight:700,fontSize:15}}>{weather.humidity}%</div>Humidity</div>
              {weather.aqi!=null&&<div style={{textAlign:"center"}}><div style={{fontWeight:700,fontSize:15}}>{weather.aqi}</div>AQI</div>}
            </div>
          </div>
          <div className="glass" style={{padding:"20px 22px",borderRadius:20}}>
            <h3 className="cf" style={{fontSize:16,fontWeight:600,marginBottom:14,color:"var(--txt)"}}>Today's Skincare Routine</h3>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div style={{display:"flex",gap:10,alignItems:"flex-start"}}><Ic n="forecast" s={17} c="#F5D5A3"/><div><div style={{fontSize:13,fontWeight:600,color:"var(--txt)"}}>Sunscreen</div><div style={{fontSize:12,color:"var(--muted)"}}>{advice.spf}</div></div></div>
              <div style={{display:"flex",gap:10,alignItems:"flex-start"}}><Ic n="leaf" s={17} c="#4FA876"/><div><div style={{fontSize:13,fontWeight:600,color:"var(--txt)"}}>Moisturizer</div><div style={{fontSize:12,color:"var(--muted)"}}>{advice.moisturizer}</div></div></div>
            </div>
          </div>
          {advice.tips.length>0&&(
            <div className="glass" style={{padding:"20px 22px",borderRadius:20}}>
              <h3 className="cf" style={{fontSize:16,fontWeight:600,marginBottom:12,color:"var(--txt)"}}>Personalized Tips</h3>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {advice.tips.map((t,i)=>(
                  <p key={i} style={{fontSize:12,color:"var(--txt)",lineHeight:1.65,paddingLeft:14,borderLeft:"2px solid var(--border)"}}>{t}</p>
                ))}
              </div>
            </div>
          )}
          <button onClick={()=>setStatus("idle")} style={{background:"none",border:"none",color:"var(--muted)",fontSize:12,textDecoration:"underline",cursor:"pointer",alignSelf:"center"}}>Check a different location</button>
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
        :scans?.length===1?"They have one scan so far. No trend yet, but you can reference it.":"No scans yet.";
      const ctx=JSON.stringify({name:user?.name,age:user?.age,skinType:results?.skinType,concerns:results?.concerns?.map(c=>c.name),stress:user?.stress,sleep:user?.sleep,diet:user?.diet,pcos:user?.pcos,thyroid:user?.thyroid,latestScore:results?.overallScore});
      const recentAdvice=LS.get("coach_advice_log",[]);
      const antiRepeat=recentAdvice.length?`\n\nADVICE YOU'VE ALREADY GIVEN RECENTLY (do not repeat these points verbatim. If relevant again, add new depth, a different angle, or acknowledge progress instead of restating):\n${recentAdvice.map((a,i)=>`${i+1}. ${a}`).join("\n")}`:"";
      const systemPrompt=`You are Smira, a warm, empathetic AI wellness companion with expertise in skincare, nutrition, habits, and emotional wellbeing.

VOICE: Warm, supportive, knowledgeable. Like a caring friend who's also an expert. Be concise (2–4 sentences) unless detailed analysis is needed. Max 1–2 gentle emojis per response.

FOOD ANALYSIS — when user mentions food eaten:
- Analyze sugar load (high glycemic → insulin spike → androgens → breakouts)
- Check dairy content (casein/whey can trigger IGF-1 → acne in sensitive people)
- Identify inflammatory ingredients (processed, trans fats, refined carbs)
- Celebrate anti-inflammatory choices (omega-3, antioxidants, berries, leafy greens)
- Connect to skin: "Dairy intake may contribute to breakouts for some people. Worth monitoring."
- Never shame food choices. Always frame compassionately.

SKINCARE ANALYSIS — when user mentions products used:
- Detect conflicts: Retinol + Vitamin C together = irritation risk; AHA + Retinol = over-exfoliation
- Flag over-exfoliation: multiple actives daily
- Suggest correct layering: cleanser → toner → serum → moisturizer → SPF (AM) / oil (PM)
- Praise what they're doing right
- Example: "BHA cleanser + retinol every night risks barrier damage. Consider alternating."

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
    <div style={{display:"flex",flexDirection:"column",height:"100%",minHeight:0}}>
      <div style={{padding:"14px 16px",borderBottom:"1px solid var(--border)",background:"var(--topbar)",display:"flex",gap:12,alignItems:"center",flexShrink:0}}>
        <div style={{width:44,height:52,borderRadius:12,overflow:"hidden",border:"2px solid var(--border)",flexShrink:0}}><SmiraAvatar state="welcome" portrait size={52}/></div>
        <div style={{minWidth:0}}>
          <h2 className="cf" style={{fontSize:22,fontWeight:600,color:"var(--txt)"}}>Smira</h2>
          <p style={{fontSize:12,color:"var(--muted)"}}>AI Wellness Companion · Always here for you</p>
        </div>
        {/* 44×44 minimum touch target on every device, not just visually-large
           icons — these two controls must always stay reachable, including
           when the panel is squeezed short by the on-screen keyboard. */}
        <div style={{marginLeft:"auto",display:"flex",gap:2,flexShrink:0}}>
          {onMinimize&&<button onClick={onMinimize} aria-label="Minimize chat" style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Ic n="minus" s={18} c="var(--muted)"/></button>}
          {onClose&&<button onClick={onClose} aria-label="Close chat" style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Ic n="x" s={18} c="var(--muted)"/></button>}
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"18px 16px",display:"flex",flexDirection:"column",gap:14,minHeight:0}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:"flex",gap:10,alignItems:"flex-end",flexDirection:m.role==="user"?"row-reverse":"row"}}>
            {m.role==="assistant"&&<SmiraAvatar state="welcome" size={34}/>}
            {/* minWidth:0 only — no flex-grow — so short replies still hug
               their content like a normal chat bubble; see the note on
               SmiraMsg above for why this alone is the correct guard. */}
            <div style={{minWidth:0,maxWidth:"min(82%,480px)",padding:"12px 15px",borderRadius:m.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px",background:m.role==="user"?"linear-gradient(135deg,var(--plum-deep),var(--lav))":"var(--petal)",border:m.role==="user"?"none":"1px solid var(--border)"}}>
              <p style={{fontSize:13.5,color:m.role==="user"?"#fff":"var(--txt)",lineHeight:1.75}}>{m.text}</p>
            </div>
          </div>
        ))}
        {loading&&(
          <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
            <SmiraAvatar state="analysis" size={34}/>
            <div style={{padding:"12px 16px",borderRadius:"16px 16px 16px 4px",background:"var(--petal)",border:"1px solid var(--border)"}}>
              <div style={{display:"flex",gap:5,alignItems:"center"}}>
                {[0,1,2].map(j=><div key={j} style={{width:7,height:7,borderRadius:"50%",background:"var(--soft)",animation:`gPulse 1.2s ease-in-out ${j*0.2}s infinite`}}/>)}
              </div>
            </div>
          </div>
        )}
        {err&&<div style={{textAlign:"center",padding:"10px",background:"rgba(245,163,163,.08)",borderRadius:10,border:"1px solid rgba(245,163,163,.2)"}}><p style={{fontSize:12,color:"#F5A3A3"}}>{err}</p></div>}
        <div ref={endRef}/>
      </div>

      {msgs.length<=2&&(
        <div style={{padding:"0 16px 14px",flexShrink:0}}>
          <p style={{fontSize:11,color:"var(--muted)",marginBottom:8}}>Quick topics:</p>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {quickPrompts.map(q=><button key={q} onClick={()=>setInput(q)} style={{padding:"6px 12px",borderRadius:20,background:"var(--petal)",border:"1px solid var(--border)",color:"var(--soft)",fontSize:11,cursor:"pointer",transition:"all .2s"}}>{q}</button>)}
          </div>
        </div>
      )}

      {/* flexShrink:0 keeps the input row from ever being compressed by the
         message list above it — critical when the panel's available height
         is reduced by the on-screen keyboard (see useKeyboardSafeViewport
         in FloatingCompanion). Without this, a tall message list could push
         the send button out of view exactly when the keyboard is open. */}
      <div style={{padding:"14px 16px",borderTop:"1px solid var(--border)",background:"var(--topbar)",flexShrink:0}}>
        <div style={{display:"flex",gap:9,alignItems:"flex-end"}}>
          <textarea className="inp" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder="Tell me about your food, skincare, or how you're feeling..." rows={2} style={{resize:"none",lineHeight:1.6,flex:1,padding:"10px 14px"}}/>
          <button className="btn" onClick={send} disabled={!input.trim()||loading} style={{padding:"10px 14px",borderRadius:14,flexShrink:0,display:"flex",alignItems:"center",gap:6,minWidth:44,minHeight:44,justifyContent:"center"}}>
            <Ic n="send" s={15}/>
          </button>
        </div>
      </div>
    </div>
  );
};

/* Tracks the on-screen keyboard via the Visual Viewport API and returns a
   pixel rect the chat panel can pin itself to, so an open keyboard can
   never push the input/send button out of view. Only active on mobile
   (returns null on desktop, where the CSS-only sizing in .floating-panel
   is already correct and untouched by this hook). Returns null whenever
   there's nothing to correct for, so the panel falls back to its normal
   CSS-driven layout — this is a progressive enhancement, not a
   replacement for the CSS sizing. */
const MOBILE_MQ="(max-width:768px)";
const useKeyboardSafeRect=(active)=>{
  const [rect,setRect]=useState(null);
  useEffect(()=>{
    if(!active||typeof window==="undefined"||!window.visualViewport){
      setRect(null);
      return;
    }
    const vv=window.visualViewport;
    const mq=window.matchMedia(MOBILE_MQ);
    const update=()=>{
      if(!mq.matches){setRect(null);return;}
      const topGap=12; // small breathing room from the status bar / notch
      const keyboardInset=Math.max(0,window.innerHeight-vv.height-vv.offsetTop);
      // Only step in once the keyboard has actually shrunk the visible
      // area meaningfully — otherwise let the plain CSS sizing (which
      // already accounts for the bottom nav + safe areas) do its job.
      if(keyboardInset<40){setRect(null);return;}
      setRect({top:vv.offsetTop+topGap,height:vv.height-topGap});
    };
    update();
    vv.addEventListener("resize",update);
    vv.addEventListener("scroll",update);
    mq.addEventListener?.("change",update);
    window.addEventListener("orientationchange",update);
    return()=>{
      vv.removeEventListener("resize",update);
      vv.removeEventListener("scroll",update);
      mq.removeEventListener?.("change",update);
      window.removeEventListener("orientationchange",update);
    };
  },[active]);
  return rect;
};

/* Per-page prompts for the floating AI teaser bubble. Each one is a short,
   specific nudge tied to what someone can actually do on that screen —
   "Want help taking your scan?" on Skin Analysis, not a generic line that
   could apply anywhere. Pages without a specific action (Home, Results,
   Analytics, etc.) fall back to the existing rotating encouragement pool
   below, so the button never goes silent, it just isn't falsely specific. */
const AI_BUTTON_CONTEXT_MSGS={
  scan:["Want help taking your scan?","I can walk you through getting the best light for your scan."],
  menstrual:["Want me to explain your current phase?","Curious how your cycle might be affecting your skin today?"],
  journal:["Need a little writing prompt?","Want a gentle prompt to get today's entry started?"],
  challenges:["Ready for today's challenge?","Want a suggestion for which challenge to try next?"],
  nutrition:["Want a few skin-friendly meal ideas?","Curious what to eat for glowing skin today?"],
  products:["Want help picking a product for your skin type?","Not sure which product to start with? Ask me."],
  forecast:["Want to know how today's weather affects your skin?","I can translate today's forecast into a skin tip."],
  confidence:["Want to talk through what's behind your score?","Curious what's moving your Confidence Score?"],
};
const FloatingCompanion=({user,results,scans,page})=>{
  const [open,setOpen]=useState(false);
  const [minimized,setMinimized]=useState(false);
  const [msg,setMsg]=useState(()=>getMsg("encouragement"));
  const [showBubble,setShowBubble]=useState(true);
  const panelRef=useRef(null);
  const btnRef=useRef(null);
  const kbRect=useKeyboardSafeRect(open&&!minimized);
  /* When the person navigates to a page with its own contextual prompt,
     swap to it right away and give the teaser a fresh moment to be seen —
     this is what makes the button feel like it's paying attention to
     where you are, rather than reciting a fixed rotation regardless of
     screen. Pages with no dedicated prompt keep the previous behavior. */
  useEffect(()=>{
    const options=AI_BUTTON_CONTEXT_MSGS[page];
    if(options){
      setMsg(options[Math.floor(Math.random()*options.length)]);
      setShowBubble(true);
    }
  },[page]);
  useEffect(()=>{
    if(!open){
      const cats=["encouragement","wellness","confidence","progress"];
      const t=setTimeout(()=>{
        const options=AI_BUTTON_CONTEXT_MSGS[page];
        setMsg(options?options[Math.floor(Math.random()*options.length)]:getMsg(cats[Math.floor(Math.random()*cats.length)]));
      },8000);
      return()=>clearTimeout(t);
    }
  },[open,msg,page]);
  useEffect(()=>{
    const t=setTimeout(()=>setShowBubble(false),6000);
    return()=>clearTimeout(t);
  },[page]);
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
        <div role="button" tabIndex={0} aria-label="Open Smira chat" className="kb-focusable chat-teaser" style={{animation:"fadeUp .4s ease",cursor:"pointer"}} onClick={()=>{setOpen(true);setMinimized(false);setShowBubble(false);}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setOpen(true);setMinimized(false);setShowBubble(false);}}}>
          <p style={{fontSize:12,color:"var(--txt)",lineHeight:1.65,fontStyle:"italic"}}>"{msg}"</p>
          <div style={{fontSize:10,color:"var(--muted)",marginTop:4,textAlign:"right"}}>. Smira</div>
        </div>
      )}
      {/* Exactly one of panel / mini-bar / button is ever rendered.
         Previously the round avatar button stayed mounted even while the
         panel was open, sitting fixed at the same bottom-right corner as
         the panel with a *higher* z-index — on mobile, where the panel
         spans nearly the full width, that button ended up floating
         directly on top of the panel's own footer (the message input and
         send button), making them impossible to tap. The panel already
         has its own close/minimize controls in its header, so the
         standalone button is only needed while the chat is fully closed. */}
      {open&&!minimized&&(
        <div
          ref={panelRef}
          className="floating-panel"
          style={kbRect?{
            top:kbRect.top,
            height:kbRect.height,
            maxHeight:kbRect.height,
            bottom:"auto",
          }:undefined}
        >
          <AICoach user={user} results={results} scans={scans} onClose={()=>setOpen(false)} onMinimize={()=>setMinimized(true)}/>
        </div>
      )}
      {open&&minimized&&(
        <div className="floating-mini-bar kb-focusable" role="button" tabIndex={0} aria-label="Reopen Smira chat" onClick={()=>setMinimized(false)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setMinimized(false);}}}>
          <div style={{width:26,height:26,borderRadius:"50%",overflow:"hidden",flexShrink:0}}><img src={AV.welcome} alt="" style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"50% 12%"}}/></div>
          <span style={{fontSize:13,color:"var(--txt)",flex:1}}>Smira: tap to reopen</span>
          <button onClick={e=>{e.stopPropagation();setOpen(false);setMinimized(false);}} aria-label="Close chat" style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Ic n="x" s={16} c="var(--muted)"/></button>
        </div>
      )}
      {!open&&(
        <div ref={btnRef} className="floating-btn kb-focusable" role="button" tabIndex={0} aria-label="Open AI assistant" onClick={()=>{setOpen(true);setMinimized(false);setShowBubble(false);}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setOpen(true);setMinimized(false);setShowBubble(false);}}}>
          <img src="/smira/ai_button_new.png" alt="Open AI assistant" style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"50% 15%"}} onError={e=>{e.target.style.display="none";e.target.parentNode.style.background="linear-gradient(135deg,var(--plum-deep),var(--lav))";e.target.parentNode.innerHTML="<span style='font-family:Playfair Display,serif;font-size:26px;color:#F5E6EA;font-weight:600;display:flex;align-items:center;justify-content:center;height:100%'>S</span>";}}/>
        </div>
      )}
    </>
  );
};

/* ── MOBILE BOTTOM NAVIGATION ──────────────────────────────────────────────
   The primary 5-destination tab bar for phones. Desktop keeps the sidebar;
   this only renders (via .smira-bottom-nav's media query) under 768px, and
   .app-main reserves space for it so it never covers page content. Uses the
   supplied functional illustrations rather than a generic icon font. */
const FUNCTIONAL="/smira/functional/";
/* Cycle Tracker used to only be reachable through the sidebar (hidden
   behind a hamburger drawer on mobile) or by falling under the "You" tab's
   match list — effectively buried, which the SMIRA brand brief calls out
   as something the Cycle Tracker must never be. It's now its own
   first-class bottom-nav tab, one tap away like every other core feature. */
const BOTTOM_NAV_ITEMS=[
  {id:"dashboard",label:"Home",icon:"24_home.png",match:["dashboard"]},
  {id:"scan",label:"My Skin",icon:"01_skin.png",match:["scan","forecast","analytics"]},
  {id:"results",label:"Routine",icon:"03_routine.png",match:["results"]},
  {id:"menstrual",label:"Cycle",icon:"16_cycle.png",match:["menstrual"]},
  {id:"products",label:"Explore",icon:"21_products.png",match:["products","nutrition","challenges"]},
  {id:"settings",label:"You",icon:"23_settings.png",match:["settings","confidence","journal","journey","story"]},
];
const BottomNav=({active,onNav})=>{
  const navRef=useRef(null);
  /* Measures the nav's *real* rendered height (padding, safe-area inset,
     icon/label size — whatever it actually ends up being) and publishes
     it as --bottom-nav-h, which every fixed chat element's clearance is
     built from. This means the chat button/panel can never end up
     covering the nav even if its content, font size, or padding changes
     later — there's no separate hard-coded number to keep in sync. */
  useEffect(()=>{
    const el=navRef.current;
    if(!el||typeof ResizeObserver==="undefined")return;
    const update=()=>{
      const h=el.offsetHeight;
      if(h>0)document.documentElement.style.setProperty("--bottom-nav-h",`${h}px`);
    };
    update();
    const ro=new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("orientationchange",update);
    return()=>{ro.disconnect();window.removeEventListener("orientationchange",update);};
  },[]);
  return(
    <nav ref={navRef} className="smira-bottom-nav" aria-label="Primary" style={{position:"fixed",left:0,right:0,bottom:0,zIndex:150,justifyContent:"space-around",alignItems:"center",padding:"9px 6px calc(9px + var(--safe-b))",background:"#FFFEFC",borderTop:"1px solid rgba(111,82,125,.14)",boxShadow:"0 -2px 16px rgba(41,36,58,.06)"}}>
      {BOTTOM_NAV_ITEMS.map(item=>{
        const isActive=item.match.includes(active);
        return(
          <button key={item.id} onClick={()=>onNav(item.id)} aria-current={isActive?"page":undefined} className="bottom-nav-btn" style={{background:"transparent",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,padding:"5px 10px",borderRadius:14,minWidth:56,minHeight:44,transition:"transform .15s"}}>
            <img src={FUNCTIONAL+item.icon} alt="" style={{width:22,height:22,objectFit:"contain",filter:isActive?"none":"grayscale(1)",opacity:isActive?1:.62,transform:isActive?"scale(1.08)":"scale(1)",transition:"all .2s"}}/>
            <span style={{fontSize:10,fontWeight:isActive?700:500,color:isActive?"var(--coral)":"var(--muted)",fontFamily:"'Poppins',sans-serif",transition:"color .2s"}}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
const Sidebar=({active,onNav,user,open,onClose})=>{
  const groups=[
    {label:null,items:[{id:"dashboard",icon:"home",label:"Home"}]},
    {label:"Skin",items:[
      {id:"scan",icon:"scan",label:"Skin Analysis"},
      {id:"results",icon:"chart",label:"My Results"},
      {id:"forecast",icon:"forecast",label:"Skin Forecast"},
    ]},
    {label:"Wellness",items:[
      {id:"confidence",icon:"heart",label:"Confidence Score"},
      {id:"journal",icon:"book",label:"Glow Journal"},
      {id:"nutrition",icon:"leaf",label:"Nutrition"},
      {id:"products",icon:"bag",label:"Products"},
      {id:"challenges",icon:"trophy",label:"Challenges"},
    ]},
    {label:"Cycle",items:[{id:"menstrual",icon:"cycle",label:"Cycle Tracker"}]},
    {label:"Progress",items:[
      {id:"journey",icon:"spark",label:"My Journey"},
      {id:"story",icon:"star",label:"Monthly Story"},
      {id:"analytics",icon:"chart",label:"Analytics"},
    ]},
    {label:"Settings",items:[{id:"settings",icon:"gear",label:"Settings"}]},
  ];
  return(
    <>
      {/* Previously this overlay was always mounted, and the mobile media
         query forced it to `display:block!important` regardless of the
         sidebar's actual open state — so on any mobile-width viewport a
         full-screen, semi-opaque, click-catching layer sat over the whole
         page permanently, which is exactly what was blocking the app.
         Rendering it only while the sidebar is actually open fixes that
         at the source, and the CSS below no longer force-shows it. */}
      {open&&<div className="sidebar-overlay" onClick={onClose}/>}
      <div className={`app-sidebar${open?" open":""}`} style={{display:"flex",flexDirection:"column",padding:"20px 14px",borderRight:"1px solid var(--border)",background:"var(--card)"}}>
        <div style={{padding:"6px 8px 18px",borderBottom:"1px solid var(--border)",marginBottom:10}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,paddingBottom:4}}>
            <AuraLogo size={48} gold="var(--gold)"/>
            <div style={{textAlign:"center"}}>
              <div className="cf" style={{fontSize:21,fontWeight:600,letterSpacing:".06em",color:"var(--soft)",lineHeight:1.1}}>SMIRA</div>
              <div style={{fontSize:9,color:"var(--gold)",letterSpacing:".12em",opacity:.85,marginTop:2}}>A kinder you. Everyday.</div>
            </div>
          </div>
          {user?.name&&(
            <div style={{fontSize:12,color:"var(--muted)",paddingLeft:2,textAlign:"center",marginTop:8}}>
              <span style={{color:"var(--txt)",fontWeight:600}}>{user.name.split(" ")[0]}</span>
              {user.skinGoal?.length>0&&<div style={{fontSize:10,color:"var(--muted)",marginTop:2}}>✦ {user.skinGoal[0]}</div>}
            </div>
          )}
        </div>
        <nav aria-label="Main navigation" style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:1}}>
          {groups.map((g,gi)=>(
            <div key={gi}>
              {g.label&&<div className="nav-group-label">{g.label}</div>}
              {g.items.map(n=>(
                <button key={n.id} className={`nav-link${active===n.id?" act":""}`} aria-current={active===n.id?"page":undefined} onClick={()=>{onNav(n.id);onClose();}}>
                  <Ic n={n.icon} s={15} c={active===n.id?"currentColor":"var(--muted)"}/>
                  {n.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div style={{paddingTop:12,borderTop:"1px solid var(--border)"}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"4px 8px"}}>
            <div style={{fontSize:9,color:"var(--muted)",opacity:.6,letterSpacing:".08em",textAlign:"center"}}>SMIRA · V5.0</div>
            <div style={{fontSize:8,color:"var(--muted)",opacity:.4,textAlign:"center"}}>A kinder you. Everyday.</div>
          </div>
        </div>
      </div>
    </>
  );
};

export default function App(){
  /* ── Theme ── SMIRA is light-mode only. */
  const resolvedTheme="light";
  const T=LIGHT_T;

  const isOnline=useOnlineStatus();

  /* ── Auth ── */
  const [authUser,setAuthUser]=useState(()=>AUTH.getUser()); // instant cache for first paint
  const [authLoading,setAuthLoading]=useState(true);
  const [splashDone,setSplashDone]=useState(false);
  const [cloudHydrated,setCloudHydrated]=useState(false);

  const CLOUD_KEYS=["smira_user","smira_results","smira_scans","habits3","water_today","glowJournal","menstrual_cycles","diet_plan","coach_msgs"];
  /* Tracks which uid we were last hydrated for, so we can tell a genuine
     account switch (including logout, or User A -> User B on the same
     device) apart from Firebase simply re-confirming the same session. */
  const lastUidRef=useRef(AUTH.getUser()?.uid||null);

  /* Firebase resolves the real session asynchronously — subscribe once.
     On a real (non-null) user, pull their cloud document first and write
     it into localStorage *silently* (no re-push) before letting the app
     move past the splash screen — so every component's first read already
     sees the synced data, with no need to touch each component.

     CRITICAL — account isolation: whenever the signed-in uid changes
     (including signing out, or a different person signing in on the same
     device), every locally cached key is wiped *before* we do anything
     else. Without this, a second account could briefly render — or, if it
     has no cloud document yet, permanently inherit — the previous
     account's journals, cycle data, and profile. */
  useEffect(()=>{
    const unsub=AUTH.onChange(async(u)=>{
      const newUid=u?.uid||null;
      const switchedAccount=newUid!==lastUidRef.current;
      lastUidRef.current=newUid;

      if(switchedAccount){
        CLOUD_KEYS.forEach(k=>LS.del(k));
        setUser(null);setResults(null);setScanImg(null);setScans([]);
        setHabits(DEFAULT_HABITS);setWater(0);setJournalEntries([]);
        setPage("dashboard");LS.setSilent("smira_page","dashboard");
        setCloudHydrated(false);
      }

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
  const [habits,setHabits]=useState(()=>LS.get("habits3",DEFAULT_HABITS));
  const [water,setWater]=useState(()=>LS.get("water_today",0));
  const [journalEntries,setJournalEntries]=useState(()=>LS.get("glowJournal",[]));

  const nav=(p)=>{setPage(p);LS.set("smira_page",p);setSideOpen(false);window.scrollTo(0,0);};

  /* Move on from splash only once both the splash animation is done AND
     Firebase has told us whether someone's actually signed in. If Firebase
     resolves quickly this feels instant (thanks to the localStorage cache
     above); if not, we simply wait rather than guessing. */
  useEffect(()=>{
    if(splashDone&&!authLoading&&cloudHydrated){
      if(authUser){
        // Hydration (initial load, or a just-completed account switch) may
        // have updated localStorage after this component's own state was
        // last set — re-sync every per-account field from storage now,
        // before deciding which screen to show, so nothing stale from a
        // previous session (or a previous account) can leak through.
        const freshUser=LS.get("smira_user",null);
        setUser(freshUser);
        setResults(LS.get("smira_results",null));
        setScanImg(LS.get("smira_img",null));
        setScans(LS.get("smira_scans",[]));
        setHabits(LS.get("habits3",DEFAULT_HABITS));
        setWater(LS.get("water_today",0));
        setJournalEntries(LS.get("glowJournal",[]));
        if(!freshUser)setScreen("onboarding");
        else setScreen("app");
      } else {
        // Signed out: this account's data is already wiped from local
        // storage by the account-switch guard above; just move to auth.
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
    setScanImg(null);setHabits(DEFAULT_HABITS);setWater(0);setJournalEntries([]);
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
          {/* marginLeft is intentionally NOT set inline here — it's driven
             entirely by the .app-main CSS class (236px on desktop to clear
             the now-fixed sidebar, 0!important on mobile), so the class
             can win at every breakpoint without an inline-style specificity
             fight. See .app-sidebar/.app-main in GlobalStyles. */}
          <div className="app-main" id="main-content" role="main" tabIndex={-1} style={{flex:1,minWidth:0,background:T.bodyBg}}>
            {/* Top bar */}
            <div style={{padding:"12px 18px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",background:T.topbar,position:"sticky",top:0,zIndex:50,backdropFilter:"blur(6px) saturate(160%)",transition:"background .35s"}}>
              <button className="hamburger" onClick={()=>setSideOpen(s=>!s)} aria-label="Menu"><span style={{background:T.soft}}/><span style={{background:T.soft}}/><span style={{background:T.soft}}/></button>
              <div style={{display:"flex",alignItems:"center",gap:9}}>
                <AuraLogo size={26} gold={T.gold}/>
                <span className="cf" style={{fontSize:18,letterSpacing:".06em",color:T.soft,fontWeight:600}}>SMIRA</span>
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
              {page==="analytics"&&<Analytics scans={scans} onNav={nav}/>}
              {page==="journey"&&<Journey scans={scans} onNav={nav}/>}
              {page==="story"&&<MonthlyStory user={user} scans={scans} habits={habits} journalEntries={journalEntries}/>}
              {page==="forecast"&&<SkinForecast user={user} results={results}/>}
              {page==="menstrual"&&<MenstrualTracker scans={scans} user={user} onUpdateProfile={handleUpdateProfile}/>}
              {page==="coach"&&<div style={{height:"calc(100vh - 60px)"}}><AICoach user={user} results={results} scans={scans}/></div>}
              {page==="settings"&&<Settings user={user} authUser={authUser} onLogout={handleLogout} onUpdateProfile={handleUpdateProfile} onDeleteAccount={handleDeleteAccount} theme={resolvedTheme}/>}
            </div>
          </div>
          <FloatingCompanion user={user} results={results} scans={scans} page={page}/>
          <BottomNav active={page} onNav={nav}/>
        </div>
      )}
    </div>
  );
}
