import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis } from "recharts";
import { auth } from "./firebase";
import { pullUserData, pushUserData, deleteUserCloudData } from "./cloudSync";
import MenstrualTracker from "./cycle/MenstrualTracker.jsx";
import { buildSnapshot } from "./cycle/cycleEngine.js";
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
   SUMI — Your Personal Skincare & Wellness Companion
   AI Skin Analysis · Wellness Coach · Habit Builder · Cycle Tracker
═══════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════
   SUMI V4 — Auth · Light/Dark/System Theme · Settings
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
   Clears every accumulated-progress key (scans, habits,
   journal, cycle history, diet plan, coach history, challenges) while
   leaving the account itself (auth_user / smira_user profile) untouched,
   as Settings → Account's "Reset Journey" spec requires. Also overwrites
   the same fields in the signed-in user's cloud document so a reset
   can't be silently undone by the next cloud pull. */
const JOURNEY_KEYS=["smira_results","smira_scans","smira_img","habits3","water_today","glowJournal","menstrual_cycles","cycle_logs","cycle_meta","diet_plan","diet_pref_type","diet_pref_budget","coach_msgs","coach_advice_log","challenges_joined","challenges_progress","activities","just_logged_in","smira_page","movement_prefs","step_goal","step_log","energy_sleep_log","skin_checkin_log"];
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
/* SUMI V5 — "Magical Garden" palette. Soft rose, blush, champagne, cream,
   pastel green and a whisper of gold — never harsh black, always warm. */
/* ── SUMI brand palette (from the supplied brand asset pack) ──────────
   wine/soft/berry used to be a lighter mid-purple (#8A4A55); the brand
   spec's primary ink is Deep Navy #29285C, used for both the wordmark
   and every primary button/heading in the reference screens, so those
   three tokens now point at navy instead. Everything that reads
   var(--wine)/var(--soft)/var(--berry) — buttons, active nav, headings —
   picks this up automatically without any per-component changes. */
/* SUMI final palette — pastel sage green is the dominant canvas (bg),
   pastel dusty pink is the primary card/active-state color (card, coral,
   peach, blush), warm cream/ivory is the secondary surface (sbg, cream,
   inpBg), muted olive carries text/borders/labels (txt, muted, border),
   and gold is reserved for tiny accents only (gold, sun). */
const LIGHT_T={dp:"#EEF3E2",deep:"#FBF8EE",plum:"#F6E4E3",wine:"#B4636B",berry:"#9C525A",rose:"#D98A93",blush:"#F6E4E3",petal:"#E6EEDA",mist:"#565640",card:"rgba(252,250,242,0.94)",border:"rgba(112,132,86,0.26)",txt:"#4E5138",muted:"#6E7A59",soft:"#BF737B",bg:"#C3DCAA",sbg:"#F4EFDF",topbar:"rgba(220,232,203,.92)",inpBg:"rgba(253,251,244,.94)",inpBorder:"rgba(140,160,112,.5)",gold:"#C6A227",scrollThumb:"#BCCCA6",bodyBg:"radial-gradient(circle at 12% 8%,rgba(179,204,146,.85),transparent 48%),radial-gradient(circle at 92% 24%,rgba(246,228,227,.4),transparent 42%),radial-gradient(circle at 70% 96%,rgba(166,193,128,.7),transparent 52%),linear-gradient(165deg,#D2E6BC 0%,#C3DCAA 50%,#CDE2B7 100%)",green:"#8FA377",cream:"#FBF7EC",
  coral:"#C4696F",peach:"#F6E4E3",apricot:"#D9B08C",sage:"#7F9A66",sageSoft:"#E0EBD0",
  sky:"#A9BC93",skySoft:"#E6EEDA",sun:"#D9B98C",sunSoft:"#F3EAD3",lav:"#D9A0A6",lavSoft:"#F6E4E3",
  plumDeep:"#4A5238",creamWarm:"#FBF7EC",
  /* Pastel-pink glass tabs/pills/filters/chips — used everywhere a
     selectable control needs to feel soft, translucent and cohesive
     with the stronger sage-green canvas rather than plain white. */
  pillBg:"rgba(217,138,147,.24)",pillBorder:"rgba(196,105,111,.38)",pillText:"#8A4A55",
  pillActiveBg:"rgba(196,105,111,.7)",pillActiveBorder:"rgba(196,105,111,.85)",pillActiveText:"#FFFEFC"};

/* Shared rotation palettes for "each item gets its own tint" moments
   (goal chips, habit icons, challenge cards, etc). One source of truth
   instead of the same array copy-pasted at every call site. */
const CHIP_GRADIENTS=[["#C97F84","#F4DCDC"],["#A3B394","#DCE4D3"],["#D9B08C","#F0E2CC"],["#B8C4A8","#E5EBDD"],["#D6ACAC","#F2E0E0"],["#8A9B7B","#C9D6BC"]];
const CHIP_CLASSES=["chip-coral","chip-sky","chip-sage","chip-sun","chip-lav","chip-peach"];
/* SUMI is light-mode only — this is the single design-token source. */
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
     password accounts — Google-signed-in users don't have a Sumi
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

/* SUMI's real illustrated expressions (5 poses) mapped onto the app's
   emotional-state vocabulary — every screen that asks for a "mood" gets a
   real character illustration instead of a broken image / initial badge. */
const AV={
  neutral:"/sumi/avatars/reassuring.png",
  happy:"/sumi/avatars/celebrating.png",
  welcome:"/sumi/avatars/companion_bubble.png",
  analysis:"/sumi/avatars/thinking.png",
  morning:"/sumi/avatars/hello.png",
  celebration:"/sumi/avatars/celebrating.png",
  coach:"/sumi/avatars/listening.png",
  night:"/sumi/avatars/reassuring.png",
  empathy:"/sumi/avatars/reassuring.png",
  achievement:"/sumi/avatars/celebrating.png",
};

/* The uploaded Sumi AI companion face — used only for the small,
   page-integrated AI guidance element (see SkinAICompanion below).
   Kept separate from the AV[] pose set above, which drives the global
   floating chat avatar elsewhere in the app. */
const AI_FACE="/sumi/avatars/ai_companion.png";

const GlobalStyles=({theme="dark"})=>{
const t=LIGHT_T;
return(
<style>{`
@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@500;600&family=Gabriela&family=Nunito:wght@300;400;500;600;700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
:root{--dp:${t.dp};--deep:${t.deep};--plum:${t.plum};--wine:${t.wine};--berry:${t.berry};--rose:${t.rose};--blush:${t.blush};--petal:${t.petal};--mist:${t.mist};--card:${t.card};--border:${t.border};--txt:${t.txt};--muted:${t.muted};--soft:${t.soft};--ok:#A8E6C9;--warn:#B8902A;--err:#C4585F;--gold:${t.gold};--green:${t.green};--cream:${t.cream};--inp-bg:${t.inpBg};--inp-border:${t.inpBorder};
  --coral:${t.coral};--peach:${t.peach};--apricot:${t.apricot};--sage:${t.sage};--sage-soft:${t.sageSoft};--sky:${t.sky};--sky-soft:${t.skySoft};--sun:${t.sun};--sun-soft:${t.sunSoft};--lav:${t.lav};--lav-soft:${t.lavSoft};--plum-deep:${t.plumDeep};--cream-warm:${t.creamWarm};
  --pill-bg:${t.pillBg};--pill-border:${t.pillBorder};--pill-text:${t.pillText};--pill-active-bg:${t.pillActiveBg};--pill-active-border:${t.pillActiveBorder};--pill-active-text:${t.pillActiveText};
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
html,body{height:100%;background:${t.bg};color:${t.txt};font-family:'Nunito',system-ui,sans-serif;overflow-x:hidden;transition:background .35s,color .35s;}
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
.cf{font-family:'Gabriela',Georgia,serif}
/* ── Editorial surface system (no glassmorphism) ── */
.glass{background:var(--card);border:1px solid ${t.border};border-radius:16px;box-shadow:0 1px 6px rgba(60,72,40,.04);}
.glow{box-shadow:0 2px 12px rgba(96,118,72,.08);}
.glass-nav{background:rgba(251,247,236,.92);border:1px solid ${t.border};border-radius:40px;box-shadow:0 2px 14px rgba(60,72,40,.06);}
/* ── SUMI button system — flat, premium-skincare-app controls.
   No gradients, no glass, no glow: a solid deep-lavender primary, a pale
   lavender secondary, and a plain text tertiary action (see .btn-text). */
.btn{background:${t.wine};border:none;color:#FFFEFC;padding:13px 26px;border-radius:16px;font-family:'Nunito',system-ui,sans-serif;font-weight:600;font-size:14px;cursor:pointer;transition:all .2s;letter-spacing:.1px;box-shadow:0 2px 10px rgba(96,118,72,.18);}
.btn:hover:not(:disabled){background:${t.berry};transform:translateY(-1px);box-shadow:0 4px 14px rgba(96,118,72,.24);}
.btn:disabled{opacity:.45;cursor:not-allowed;}
.btn-o{background:${t.petal};border:1px solid rgba(96,118,72,.22);color:${t.wine};padding:11px 22px;border-radius:16px;font-family:'Nunito',system-ui,sans-serif;font-weight:500;font-size:14px;cursor:pointer;transition:all .2s;}
.btn-o:hover{background:${t.plum};transform:translateY(-1px);}
.btn-text{background:none;border:none;color:${t.wine};padding:6px 2px;font-family:'Nunito',system-ui,sans-serif;font-weight:600;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:gap .2s;}
.btn-text:hover{gap:8px;}
.inp{background:var(--inp-bg);border:1px solid var(--inp-border);border-radius:16px;padding:14px 18px;color:var(--txt);font-family:'Nunito',system-ui,sans-serif;font-size:14px;width:100%;outline:none;transition:all .25s;}
.inp:focus{border-color:${t.rose};background:${theme==="light"?"rgba(253,251,244,.94)":"rgba(255,255,255,.07)"};box-shadow:0 0 0 4px rgba(201,125,149,.14);}
.inp::placeholder{color:${theme==="light"?"#B08A96":"#8C6373"};}
.sel{background:${theme==="light"?"rgba(253,251,244,.94)":"rgba(255,255,255,.06)"};border:1px solid var(--inp-border);border-radius:16px;padding:14px 18px;color:var(--txt);font-family:'Nunito',system-ui,sans-serif;font-size:14px;width:100%;outline:none;cursor:pointer;transition:all .25s;}
.sel:focus{border-color:${t.rose};}
.tag{background:${theme==="light"?"rgba(181,71,107,.08)":"rgba(201,125,149,.14)"};border:1px solid ${t.border};color:${t.soft};padding:4px 12px;border-radius:20px;font-size:11px;font-weight:500;}
@keyframes floatY{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes pageFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.page-fade{animation:pageFade .3s ease;}
@keyframes gPulse{0%,100%{opacity:.5}50%{opacity:1}}
@keyframes scanLine{0%{top:0%}100%{top:98%}}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes spin{to{transform:rotate(360deg)}}
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
.nav-link{color:${t.muted};font-size:13.5px;font-weight:500;cursor:pointer;padding:10px 14px;border-radius:14px;transition:all .2s;display:flex;align-items:center;gap:10px;border:none;background:transparent;width:100%;text-align:left;font-family:'Nunito',system-ui,sans-serif;}
.nav-link:hover{color:${t.txt};background:rgba(196,105,111,.13);}
.nav-link.act{color:#fff;background:linear-gradient(135deg,#D98A93,#C4696F);box-shadow:0 3px 10px rgba(180,99,107,.32);}
.nav-group-label{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${t.muted};opacity:.65;padding:14px 14px 6px;font-weight:600;}
.pbar{height:6px;background:rgba(127,154,102,.2);border-radius:4px;overflow:hidden;}
.pfill{height:100%;border-radius:4px;transition:width 1.2s ease;}
.tab-btn{padding:9px 17px;border-radius:14px;font-size:13px;font-weight:500;cursor:pointer;transition:all .2s;color:var(--pill-text);border:1px solid var(--pill-border);background:var(--pill-bg);backdrop-filter:blur(6px) saturate(160%);-webkit-backdrop-filter:blur(6px) saturate(160%);white-space:nowrap;}
.tab-btn.act{background:var(--pill-active-bg);border-color:var(--pill-active-border);color:var(--pill-active-text);backdrop-filter:blur(8px) saturate(180%);-webkit-backdrop-filter:blur(8px) saturate(180%);}
.check-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(181,92,121,.07);}
.check-row:last-child{border-bottom:none;}
.streak-badge{background:linear-gradient(135deg,#7F9A66,#D98A93);padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;color:#fff;display:inline-block;}
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
.hero-organic{position:relative;overflow:hidden;border-radius:32px;background:linear-gradient(135deg,#EAF1DE 0%,#C9DAB3 60%,#F0C4CA 100%);box-shadow:0 10px 34px rgba(86,104,60,.18);}
.chip{border-radius:20px;border:1px solid transparent;transition:transform .18s ease,box-shadow .18s ease;}
.chip:hover{transform:translateY(-2px);}
.chip:active{transform:translateY(0) scale(.97);transition-duration:.08s;}
.mood-pill:active{transform:scale(.95)!important;transition-duration:.08s;}
.nav-link{transition:transform .15s ease,background .2s ease,color .2s ease;}
.nav-link:active{transform:scale(.97);}
.bottom-nav-btn:active{transform:scale(.9);}
.chip-coral{background:linear-gradient(160deg,#FBE3E1,#F0BCC0);}
.chip-peach{background:linear-gradient(160deg,#FBEFEE,${t.peach});}
.chip-sage{background:linear-gradient(160deg,${t.sageSoft},#C7E2CE);}
.chip-sky{background:linear-gradient(160deg,${t.skySoft},#CBDAB8);}
.chip-sun{background:linear-gradient(160deg,${t.sunSoft},#F5DA9C);}
.chip-lav{background:linear-gradient(160deg,${t.lavSoft},#EFC5C8);}
.chip-plum{background:linear-gradient(160deg,#8FA377,${t.plumDeep});color:#FBF8EE;}
.mood-pill{border-radius:18px;padding:12px 8px;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;border:1px solid transparent;transition:transform .2s,box-shadow .2s;font-family:'Nunito',system-ui,sans-serif;font-weight:600;font-size:11px;}
.mood-pill:hover{transform:translateY(-2px) scale(1.03);}
/* ── Chat widget stacking hierarchy (deliberate, not incremental) ──────
   sidebar-overlay 99 < app-sidebar 100 < smira-bottom-nav 150 <
   floating-panel 199 < floating-btn/mini-bar 200 < skip-link 400.
   Only one of floating-btn / floating-panel / floating-mini-bar is ever
   rendered at a time (see FloatingCompanion) so there is no real overlap
   in practice, but the ordering also holds if that ever changes. */
.floating-btn{position:fixed;bottom:calc(28px + var(--safe-b));right:calc(28px + var(--safe-r));z-index:200;cursor:pointer;width:62px;height:62px;border-radius:50%;overflow:hidden;border:2px solid ${t.rose}72;box-shadow:0 4px 24px rgba(154,72,100,.35);animation:pulseRing 3s ease-in-out infinite;transition:transform .2s;}
.floating-btn:hover{transform:scale(1.08);}
.floating-panel{position:fixed;bottom:calc(104px + var(--safe-b));right:calc(28px + var(--safe-r));z-index:199;width:min(440px,calc(100vw - 52px));max-height:min(82vh,820px);max-height:min(82dvh,820px);display:flex;flex-direction:column;overflow:hidden;background:var(--card);backdrop-filter:blur(6px) saturate(160%);border:1px solid var(--border);border-radius:22px;box-shadow:0 16px 56px rgba(154,72,100,.3);animation:fadeUp .28s ease;}
.floating-mini-bar{position:fixed;bottom:calc(28px + var(--safe-b));right:calc(28px + var(--safe-r));z-index:200;display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:20px;background:var(--card);backdrop-filter:blur(6px) saturate(160%);border:1px solid var(--border);box-shadow:0 8px 28px rgba(154,72,100,.22);cursor:pointer;max-width:min(240px,calc(100vw - 32px));animation:fadeUp .25s ease;}
/* The little "Sumi says…" teaser bubble that appears above the closed
   chat button. Sized relative to the viewport (min() with a vw-based
   ceiling) so it can never cause horizontal overflow on narrow phones,
   and positioned from the same safe-area tokens as the button it sits
   above of, rather than a hand-picked pixel offset. */
.chat-teaser{position:fixed;bottom:calc(102px + var(--safe-b));right:calc(28px + var(--safe-r));z-index:198;max-width:min(220px,calc(100vw - 56px - var(--safe-l) - var(--safe-r)));background:var(--card);border:1px solid var(--border);border-radius:14px 14px 4px 14px;padding:11px 14px;box-shadow:0 8px 28px rgba(60,72,40,.22);}
@media(max-width:768px){
  .chat-teaser{bottom:calc(var(--bottom-nav-h) + var(--safe-b) + 14px + 54px + 12px);right:var(--mobile-safe-right);max-width:min(200px,calc(100vw - 2 * var(--mobile-safe-right) - 24px));}
}
/* ═══════════ SUMI REDESIGN LAYER — sage · blush · cream ═══════════
   One shared vocabulary (sm-*) for every redesigned page so My Skin,
   Wellness and Cycle read as a single product. Green carries the large
   surfaces, pink is the accent, red is reserved for small signals. */
.sm-page{margin:0 auto;padding:22px 20px 64px;width:100%;}
.sm-head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:22px;padding:20px 22px;border-radius:28px;background:linear-gradient(135deg,rgba(255,252,244,.78),rgba(207,222,186,.9));border:1px solid var(--border);position:relative;overflow:hidden;}
.sm-head:after{content:"";position:absolute;right:-46px;top:-46px;width:150px;height:150px;border-radius:50%;background:radial-gradient(circle,rgba(238,178,184,.38),transparent 68%);pointer-events:none;}
.sm-head-main{display:flex;align-items:center;gap:14px;min-width:0;position:relative;z-index:1;}
.sm-head-right{position:relative;z-index:1;}
.sm-head-icon{width:52px;height:52px;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
.sm-head-icon img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 3px 6px rgba(96,118,72,.16));}
.sm-eyebrow{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;font-weight:600;color:var(--muted);margin-bottom:3px;}
.sm-title{font-size:26px;font-weight:600;color:var(--txt);margin:0;line-height:1.2;}
.sm-sub{font-size:13px;color:var(--muted);margin-top:4px;line-height:1.55;}
.sm-section{margin-bottom:26px;}
.sm-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 2px 12px;flex-wrap:wrap;}
.sm-section-title{font-family:'Gabriela',Georgia,serif;font-size:18px;font-weight:400;color:var(--txt);}
.sm-section-sub{font-size:12px;color:var(--muted);}
.sm-card{background:var(--card);border:1px solid var(--border);border-radius:22px;padding:20px 22px;box-shadow:0 1px 0 rgba(255,255,255,.75) inset,0 8px 22px rgba(86,104,60,.07);}
.sm-card.sage{background:linear-gradient(160deg,#EAF1DE,#DCE8CB);}
.sm-card.deep{background:linear-gradient(160deg,#C9DAB3,#B7CCA0);border-color:rgba(96,118,72,.35);}
.sm-card.pink{background:linear-gradient(160deg,#FBEFEE,#F5DFDE);border-color:rgba(196,105,111,.2);}
.sm-card.flat{box-shadow:none;}
.sm-card.tight{padding:14px 16px;border-radius:18px;}
.sm-card-title{font-family:'Gabriela',Georgia,serif;font-size:16.5px;font-weight:400;color:var(--txt);margin:0 0 4px;}
.sm-card-sub{font-size:12px;color:var(--muted);line-height:1.55;}
.sm-grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));}
.sm-grid.g2{grid-template-columns:repeat(2,minmax(0,1fr));}
.sm-grid.g3{grid-template-columns:repeat(3,minmax(0,1fr));}
.sm-grid.g4{grid-template-columns:repeat(4,minmax(0,1fr));}
.sm-split{display:grid;gap:14px;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);align-items:stretch;}
.sm-stack{display:flex;flex-direction:column;gap:14px;}
.sm-row{display:flex;align-items:center;gap:10px;}
.sm-stat{border-radius:20px;padding:14px 16px;background:var(--card);border:1px solid var(--border);min-width:0;}
.sm-stat-label{font-size:11px;color:var(--muted);font-weight:500;letter-spacing:.02em;}
.sm-stat-value{font-family:'Gabriela',Georgia,serif;font-size:26px;font-weight:400;color:var(--txt);line-height:1.15;margin-top:3px;}
.sm-stat-value small{font-family:'Nunito',system-ui,sans-serif;font-size:12px;font-weight:500;color:var(--muted);margin-left:3px;}
.sm-stat-sub{font-size:11px;color:var(--muted);margin-top:4px;}
.sm-stat.sage{background:linear-gradient(160deg,#EAF1DE,#DCE8CB);}
.sm-stat.pink{background:linear-gradient(160deg,#FBEFEE,#F5DFDE);border-color:rgba(196,105,111,.2);}
.sm-delta{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;}
.sm-delta.up{background:rgba(127,154,102,.2);color:#4F6B3E;}
.sm-delta.down{background:rgba(196,88,95,.13);color:#A9414A;}
.sm-delta.flat{background:rgba(126,139,105,.15);color:var(--muted);}
.sm-seg{display:inline-flex;gap:3px;padding:4px;border-radius:999px;background:var(--pill-bg);backdrop-filter:blur(6px) saturate(160%);-webkit-backdrop-filter:blur(6px) saturate(160%);border:1px solid var(--pill-border);max-width:100%;overflow-x:auto;scrollbar-width:none;}
.sm-seg::-webkit-scrollbar{display:none;}
.sm-seg button{border:none;background:transparent;padding:8px 15px;border-radius:999px;font-family:'Nunito',system-ui,sans-serif;font-weight:500;font-size:12.5px;color:var(--pill-text);cursor:pointer;white-space:nowrap;transition:background .2s,color .2s;}
.sm-seg button:hover{color:var(--txt);}
.sm-seg button.act{background:var(--pill-active-bg);color:var(--pill-active-text);box-shadow:0 2px 8px rgba(196,105,111,.3);backdrop-filter:blur(8px) saturate(180%);-webkit-backdrop-filter:blur(8px) saturate(180%);}
.sm-seg.pinkact button.act{background:var(--pill-active-bg);box-shadow:0 2px 8px rgba(196,105,111,.3);}
.sm-pill{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;font-size:11.5px;font-weight:500;background:var(--pill-bg);backdrop-filter:blur(6px) saturate(160%);-webkit-backdrop-filter:blur(6px) saturate(160%);border:1px solid var(--pill-border);color:var(--pill-text);}
.sm-pill.sage{background:rgba(127,154,102,.2);border-color:rgba(127,154,102,.38);color:#4F6B3E;backdrop-filter:blur(6px) saturate(140%);-webkit-backdrop-filter:blur(6px) saturate(140%);}
.sm-pill.pink{background:rgba(217,138,147,.32);border-color:rgba(196,105,111,.42);color:#8A4A55;backdrop-filter:blur(6px) saturate(160%);-webkit-backdrop-filter:blur(6px) saturate(160%);}
.sm-pill.red{background:rgba(196,88,95,.16);border-color:rgba(196,88,95,.34);color:#A9414A;backdrop-filter:blur(6px) saturate(140%);-webkit-backdrop-filter:blur(6px) saturate(140%);}
.sm-pill-btn{cursor:pointer;font-family:'Nunito',system-ui,sans-serif;transition:all .18s;}
.sm-pill-btn:hover{border-color:#C4696F;}
.sm-pill-btn.act{background:var(--pill-active-bg);border-color:var(--pill-active-border);color:var(--pill-active-text);backdrop-filter:blur(8px) saturate(180%);-webkit-backdrop-filter:blur(8px) saturate(180%);box-shadow:0 2px 10px rgba(196,105,111,.32);}
.sm-note{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:16px;font-size:12.5px;line-height:1.65;}
.sm-note p{margin:0;flex:1;min-width:0;}
.sm-note.sage{background:rgba(224,235,208,.9);border:1px solid var(--border);color:var(--txt);}
.sm-note.pink{background:#F8E6E5;border:1px solid rgba(196,105,111,.22);color:#7A3F45;}
.sm-note.cream{background:#FBF7EC;border:1px solid var(--border);color:var(--txt);}
.sm-note-ic{width:24px;height:24px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.7);}
.sm-note.sage .sm-note-ic{color:#5F7A48;}
.sm-note.pink .sm-note-ic{color:#B4636B;}
.sm-meter{height:7px;border-radius:99px;background:rgba(127,154,102,.2);overflow:hidden;}
.sm-meter>i{display:block;height:100%;border-radius:99px;transition:width 1s ease;}
.sm-empty{text-align:center;padding:34px 22px;}
.sm-empty-ic{width:64px;height:64px;border-radius:50%;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#EAF1DE,#D5E3C1);border:1px solid var(--border);color:#5F7A48;box-shadow:0 0 0 8px rgba(255,252,244,.55);}
.sm-input{width:100%;padding:11px 14px;border-radius:14px;border:1px solid var(--inp-border);background:var(--inp-bg);color:var(--txt);font-size:13px;font-family:'Nunito',system-ui,sans-serif;outline:none;transition:border-color .2s,box-shadow .2s;}
.sm-input:focus{border-color:#7F9A66;box-shadow:0 0 0 4px rgba(127,154,102,.18);}
.sm-search{position:relative;}
.sm-search svg{position:absolute;left:13px;top:50%;transform:translateY(-50%);pointer-events:none;}
.sm-search .sm-input{padding-left:38px;}
.movement-tabs .sm-pill{background:var(--pill-bg);border-color:var(--pill-border);}
.movement-tabs .sm-pill-btn:hover{border-color:#C4696F;}
.wellness-snap{background:linear-gradient(160deg,#FBF7EC,#F5EFDD 55%,#F8E9E3);box-shadow:0 4px 16px rgba(154,110,90,.10);}
.wellness-snap-item{display:flex;flex-direction:column;align-items:center;padding:8px 4px;border-radius:14px;transition:background .18s;}
.wellness-snap-ic{width:26px;height:26px;object-fit:contain;display:block;filter:drop-shadow(0 2px 4px rgba(96,118,72,.14));}
.sm-scroll-x{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none;}
.sm-scroll-x::-webkit-scrollbar{display:none;}
.sm-tile-ic{width:40px;height:40px;border-radius:14px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#EAF1DE,#D5E3C1);color:#5F7A48;border:1px solid rgba(127,154,102,.3);}
.sm-tile-ic.pink{background:linear-gradient(160deg,#FBEFEE,#F3D6D6);color:#B4636B;border-color:rgba(196,105,111,.25);}
.sm-timeline{position:relative;padding-left:26px;}
.sm-timeline:before{content:"";position:absolute;left:8px;top:6px;bottom:6px;width:2px;background:linear-gradient(180deg,#A9BC93,rgba(238,178,184,.7));border-radius:2px;}
.sm-tl-item{position:relative;margin-bottom:14px;}
.sm-tl-dot{position:absolute;left:-26px;top:16px;width:18px;height:18px;border-radius:50%;background:#FBF7EC;border:3px solid #7F9A66;box-shadow:0 0 0 3px rgba(220,232,203,.9);}
.sm-tl-dot.pink{border-color:#D98A93;}
.sm-tl-dot.red{border-color:#C4585F;}
.sm-details>summary{list-style:none;cursor:pointer;}
.sm-details>summary::-webkit-details-marker{display:none;}
.sm-details[open] .sm-chev{transform:rotate(180deg);}
.sm-chev{transition:transform .2s;}
.sm-prod-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 14px;align-items:center;}
/* Scrapbook paper — Monthly Story */
.sm-paper{position:relative;background:#FFFCF3;border-radius:6px 6px 18px 18px;border:1px solid rgba(140,150,100,.3);padding:34px 28px 28px;box-shadow:0 14px 32px rgba(86,100,60,.14),0 2px 0 rgba(255,255,255,.9) inset;background-image:repeating-linear-gradient(transparent,transparent 31px,rgba(127,154,102,.16) 31px,rgba(127,154,102,.16) 32px);background-position:0 20px;}
.sm-paper.plain{background-image:none;}
.sm-tape{position:absolute;top:-13px;left:50%;width:112px;height:28px;transform:translateX(-50%) rotate(-2.5deg);background:repeating-linear-gradient(45deg,rgba(238,178,184,.72),rgba(238,178,184,.72) 7px,rgba(246,214,216,.72) 7px,rgba(246,214,216,.72) 14px);border-left:1px dashed rgba(196,105,111,.35);border-right:1px dashed rgba(196,105,111,.35);box-shadow:0 2px 5px rgba(86,100,60,.12);}
.sm-tape.green{background:repeating-linear-gradient(45deg,rgba(169,188,147,.75),rgba(169,188,147,.75) 7px,rgba(207,222,186,.75) 7px,rgba(207,222,186,.75) 14px);border-color:rgba(96,118,72,.35);}
.sm-stitch{border:1.5px dashed rgba(127,154,102,.55);border-radius:16px;}
.sm-hand{font-family:'Caveat','Gabriela',cursive;font-size:22px;line-height:1.45;color:#5A4A4C;}
.sm-stamp{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border:1.5px solid #C4585F;color:#C4585F;border-radius:6px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;transform:rotate(-3deg);}
.sm-mood-btn{border:1px solid var(--border);background:var(--inp-bg);border-radius:18px;padding:12px 6px;display:flex;flex-direction:column;align-items:center;gap:7px;cursor:pointer;font-family:'Nunito',system-ui,sans-serif;font-size:11.5px;font-weight:500;color:var(--muted);transition:all .18s;}
.sm-mood-btn:hover{border-color:#7F9A66;color:var(--txt);}
.sm-mood-btn.act{background:#E0EBD0;border-color:#7F9A66;color:var(--txt);box-shadow:0 0 0 3px rgba(127,154,102,.22);}
.sm-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;}
.sm-cal i{aspect-ratio:1;border-radius:8px;background:rgba(127,154,102,.14);display:block;}
.sm-cal i.l1{background:#C4D6AE;}.sm-cal i.l2{background:#9DB786;}.sm-cal i.l3{background:#6E8F55;}
.sm-cal i.today{outline:2px solid #C4696F;outline-offset:1px;}
@media(max-width:768px){
  .sm-page{padding:16px 14px 40px;}
  .sm-head{padding:16px;border-radius:22px;}
  .sm-title{font-size:22px;}
  .sm-split{grid-template-columns:1fr;}
  .sm-grid.g4{grid-template-columns:repeat(2,minmax(0,1fr));}
  .sm-grid.g3{grid-template-columns:repeat(2,minmax(0,1fr));}
  .sm-paper{padding:30px 18px 22px;}
}
@media(max-width:420px){
  .sm-grid.g2{grid-template-columns:1fr;}
  .sm-head-icon{width:44px;height:44px;}
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
    max-height:min(88vh,calc(100vh - var(--bottom-nav-h) - var(--safe-b) - var(--safe-t) - 28px))!important;
    max-height:min(88dvh,calc(100dvh - var(--bottom-nav-h) - var(--safe-b) - var(--safe-t) - 28px))!important;
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
.sidebar-overlay{position:fixed;inset:0;background:rgba(60,72,40,.45);z-index:99;animation:fadeUp .2s ease;}
.skincheck-overlay{position:fixed;inset:0;z-index:250;background:rgba(74,58,52,.42);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeUp .2s ease;}
.skincheck-modal{position:relative;width:100%;max-width:560px;max-height:88vh;max-height:88dvh;overflow-y:auto;background:var(--card);border:1px solid var(--border);border-radius:26px;padding:28px 24px 24px;box-shadow:0 24px 64px rgba(86,60,64,.28);animation:fadeUp .25s ease;}
@media(max-width:560px){.skincheck-modal{padding:24px 18px 20px;border-radius:22px;}}
.hamburger{display:none;background:none;border:none;cursor:pointer;padding:8px;color:#B4636B;flex-direction:column;gap:5px;}
.show-mobile{display:none;}
.hamburger span{display:block;width:22px;height:2px;background:#B4636B;border-radius:2px;}
/* ── ACCESSIBILITY ─────────────────────────────────────────────────────
   Keyboard users get a visible focus ring (mouse/touch users don't, since
   :focus-visible only fires for keyboard/programmatic focus — this is the
   modern, non-intrusive way to do this). Custom clickable divs throughout
   the app (floating widgets, tab pills, check-rows) opt into the same ring
   via .kb-focusable so keyboard nav is visibly trackable everywhere. */
:focus-visible{outline:2px solid #D98A93;outline-offset:2px;border-radius:4px;}
.kb-focusable:focus-visible{outline:2px solid #D98A93;outline-offset:2px;}
.skip-link{position:fixed;top:-100px;left:12px;z-index:400;background:#9C525A;color:#F5E6EA;padding:10px 18px;borderRadius:10px;border-radius:10px;font-size:13px;font-weight:600;transition:top .2s;text-decoration:none;}
.skip-link:focus{top:12px;}
/* Respect the OS-level "reduce motion" accessibility setting — disables
   decorative animation/transition for users who've asked for it, without
   touching functionality. */
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important;}
}
/* ── Skin Concern Quiz — booklet-style question cards ─────────────────
   Reuses the app's existing scrapbook tokens (sage/pink/cream, sm-paper,
   sm-hand, sm-stamp) rather than introducing a separate visual system,
   per the quiz spec's "no generic form UI" requirement. */
.quiz-progress{display:flex;align-items:center;gap:6px;justify-content:center;}
.quiz-dot{width:6px;height:6px;border-radius:50%;background:rgba(127,154,102,.28);transition:all .25s;}
.quiz-dot.act{width:16px;background:#C4696F;}
.quiz-dot.done{background:#D98A93;}
.quiz-card{animation:fadeUp .35s ease;}
.quiz-opt{width:100%;display:flex;align-items:center;gap:13px;text-align:left;padding:15px 17px;border-radius:18px;border:1.5px solid var(--border);background:rgba(255,252,244,.75);cursor:pointer;font-family:'Nunito',system-ui,sans-serif;font-size:13.5px;color:var(--txt);transition:all .18s;margin-bottom:10px;}
.quiz-opt:last-child{margin-bottom:0;}
.quiz-opt:hover{border-color:#A9BC93;background:rgba(255,252,244,.95);}
.quiz-opt.sel{background:linear-gradient(160deg,#EAF1DE,#DCE8CB);border-color:#7F9A66;box-shadow:0 4px 14px rgba(86,104,60,.14);}
.quiz-opt.sel .quiz-opt-check{background:#B4636B;border-color:#B4636B;}
.quiz-opt-check{width:22px;height:22px;border-radius:50%;border:1.5px solid var(--border);flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:all .18s;}
.quiz-opt-check.sq{border-radius:7px;}
.quiz-textarea{width:100%;min-height:140px;padding:16px 18px;border-radius:18px;border:1.5px solid var(--inp-border);background:var(--inp-bg);color:var(--txt);font-size:13.5px;font-family:'Nunito',system-ui,sans-serif;line-height:1.7;resize:vertical;outline:none;transition:border-color .2s,box-shadow .2s;}
.quiz-textarea:focus{border-color:#7F9A66;box-shadow:0 0 0 4px rgba(127,154,102,.18);}
.quiz-choice-card{cursor:pointer;border-radius:20px;padding:16px 15px;border:1.5px solid var(--border);background:var(--card);display:flex;flex-direction:column;gap:6px;transition:all .2s;text-align:left;font-family:inherit;flex:1;min-width:0;}
.quiz-choice-card:hover{transform:translateY(-2px);box-shadow:0 10px 26px rgba(86,104,60,.14);}
@media(max-width:560px){.quiz-choice-row{flex-direction:column;}}
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

const SumiAvatar=({state="neutral",size=80,portrait=false,animate=false})=>{
  const [err,setErr]=useState(false);
  const src=AV[state]||AV.neutral;
  if(portrait){
    if(err)return<div style={{width:"100%",height:size,background:"linear-gradient(135deg,#9C525A,#D98A93)",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:20}}><span style={{fontFamily:"Gabriela,Georgia,serif",fontSize:60,color:"#F5E6EA",fontWeight:600}}>S</span></div>;
    return<img src={src} alt="Sumi" style={{width:"100%",height:size,objectFit:"cover",objectPosition:"50% 12%",borderRadius:20,display:"block"}} onError={()=>setErr(true)}/>;
  }
  if(err)return<div style={{width:size,height:size,borderRadius:"50%",background:"linear-gradient(135deg,#9C525A,#D98A93)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,border:"2px solid rgba(212,135,154,.3)",animation:animate?"heartbeat 2.5s ease-in-out infinite":"none"}}><span style={{fontFamily:"Gabriela,Georgia,serif",fontSize:size*.38,color:"#F5E6EA",fontWeight:600}}>S</span></div>;
  return<img src={src} alt="Sumi" style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",objectPosition:"50% 12%",flexShrink:0,border:"2px solid rgba(212,135,154,.3)",animation:animate?"heartbeat 2.5s ease-in-out infinite":"none"}} onError={()=>setErr(true)}/>;
};

const SumiMsg=({state="neutral",text,size=46})=>(
  <div style={{display:"flex",gap:12,alignItems:"flex-end"}}>
    <SumiAvatar state={state} size={size}/>
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
  /* Same UTC-day keys recordActivity() writes, stepping back a full day at a
     time from "now" (not local midnight), so the count is right in any timezone. */
  const acts=LS.get("activities",{});
  const keyFor=(offset)=>new Date(Date.now()-offset*86400000).toISOString().split("T")[0];
  let start=acts[keyFor(0)]?.length?0:1;
  let streak=0;
  for(let i=start;i<start+365;i++){
    if(acts[keyFor(i)]?.length>0)streak++;else break;
  }
  return streak;
};

/* ── SUMI PAGE PRIMITIVES ───────────────────────────────────────────────
   The shared building blocks (header, section, card grid, note, segmented
   tabs, meter, empty state) every redesigned My Skin / Wellness page is
   made from. Styling lives in the "sm-*" classes in GlobalStyles, so a page
   only decides *what* to show, never how a card or a header looks.
   No characters, stickers or code-style blocks live here on purpose. */
const SM={sage:"#7F9A66",sageDeep:"#4F6B3E",sageMid:"#A9BC93",sageSoft:"#E0EBD0",pink:"#D98A93",pinkDeep:"#B4636B",pinkSoft:"#F6E4E3",red:"#C4585F",redDeep:"#A9414A",cream:"#FBF7EC",olive:"#4E5138",gold:"#B8902A"};
const PageWrap=({max=880,children})=><div className="sm-page" style={{maxWidth:max}}>{children}</div>;
const PageHeader=({icon,eyebrow,title,sub,right})=>(
  <header className="sm-head">
    <div className="sm-head-main">
      {icon&&<span className="sm-head-icon"><img src={icon} alt=""/></span>}
      <div style={{minWidth:0}}>
        {eyebrow&&<div className="sm-eyebrow">{eyebrow}</div>}
        <h1 className="cf sm-title">{title}</h1>
        {sub&&<p className="sm-sub">{sub}</p>}
      </div>
    </div>
    {right&&<div className="sm-head-right">{right}</div>}
  </header>
);
const Section=({title,sub,right,children,style})=>(
  <section className="sm-section" style={style}>
    {(title||right)&&(
      <div className="sm-section-head">
        <div>{title&&<h2 className="sm-section-title">{title}</h2>}{sub&&<p className="sm-section-sub">{sub}</p>}</div>
        {right}
      </div>
    )}
    {children}
  </section>
);
const Note=({icon="leaf",tone="sage",children,style})=>(
  <div className={`sm-note ${tone}`} style={style}>
    <span className="sm-note-ic"><Ic n={icon} s={13} c="currentColor"/></span>
    <p>{children}</p>
  </div>
);
const Seg=({tabs,value,onChange,label,tone})=>(
  <div className={`sm-seg${tone==="pink"?" pinkact":""}`} role="tablist" aria-label={label}>
    {tabs.map(([id,l])=><button key={id} role="tab" aria-selected={value===id} className={value===id?"act":""} onClick={()=>onChange(id)}>{l}</button>)}
  </div>
);
const Meter=({pct=0,color=SM.sage,h=7})=>{
  const [w,setW]=useState(0);
  useEffect(()=>{const t=setTimeout(()=>setW(Math.max(0,Math.min(100,pct))),120);return()=>clearTimeout(t);},[pct]);
  return<div className="sm-meter" style={{height:h}} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${w}%`,background:color}}/></div>;
};
const Delta=({value,unit="",lowerIsBetter=false,suffix=""})=>{
  if(value==null||isNaN(value))return null;
  if(value===0)return<span className="sm-delta flat">No change{suffix}</span>;
  const good=lowerIsBetter?value<0:value>0;
  return<span className={`sm-delta ${good?"up":"down"}`}>{value>0?"↑":"↓"} {Math.abs(value)}{unit}{suffix}</span>;
};
const Sparkline=({data=[],color=SM.sage,w=96,h=30})=>{
  if(data.length<2)return<svg width={w} height={h} aria-hidden><line x1="2" y1={h/2} x2={w-2} y2={h/2} stroke={color} strokeOpacity=".35" strokeWidth="2" strokeDasharray="3 4" strokeLinecap="round"/></svg>;
  const min=Math.min(...data),max=Math.max(...data),rng=max-min||1;
  const pts=data.map((v,i)=>[2+(i/(data.length-1))*(w-4),h-4-((v-min)/rng)*(h-8)]);
  const last=pts[pts.length-1];
  return<svg width={w} height={h} aria-hidden><polyline points={pts.map(p=>p.join(",")).join(" ")} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/><circle cx={last[0]} cy={last[1]} r="3.2" fill={SM.cream} stroke={color} strokeWidth="2"/></svg>;
};
const Ring=({score,size=110,label="",color=SM.sage,subtitle="",max=100,stroke=8,showMax=true})=>{
  const [s,setS]=useState(0);
  useEffect(()=>{const t=setTimeout(()=>setS(score),120);return()=>clearTimeout(t);},[score]);
  const r=(size-stroke-4)/2,circ=2*Math.PI*r,off=circ-(Math.min(s,max)/max)*circ;
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}} role="img" aria-label={`${label} ${score}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="rgba(255,252,244,.55)" stroke="rgba(127,154,102,.22)" strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" style={{transition:"stroke-dashoffset 1.3s ease"}}/>
        <text x={size/2} y={size/2+(showMax?-1:2)} textAnchor="middle" dominantBaseline="middle" style={{fill:"var(--txt)",fontSize:size/3.6,fontWeight:600,fontFamily:"'Gabriela',Georgia,serif",transform:"rotate(90deg)",transformOrigin:`${size/2}px ${size/2}px`}}>{s}</text>
        {showMax&&<text x={size/2} y={size/2+size/4.6} textAnchor="middle" dominantBaseline="middle" style={{fill:"var(--muted)",fontSize:size/11,fontFamily:"Nunito",transform:"rotate(90deg)",transformOrigin:`${size/2}px ${size/2}px`}}>out of {max}</text>}
      </svg>
      {label&&<span style={{fontSize:12,color:"var(--muted)",fontWeight:500}}>{label}</span>}
      {subtitle&&<span style={{fontSize:10,color:"var(--muted)"}}>{subtitle}</span>}
    </div>
  );
};
/* Compact, illustration-free empty state: a quiet icon disc, a title, one
   sentence, one action. Pass card={false} to drop the surrounding card. */
const EmptyState=({icon="leaf",title,message,actionLabel,onAction,card=true})=>{
  const body=(
    <div className="sm-empty" style={{maxWidth:400,margin:"0 auto"}}>
      <div className="sm-empty-ic"><Ic n={icon} s={26} c="currentColor"/></div>
      <h3 className="cf" style={{fontSize:19,fontWeight:600,marginBottom:7,color:"var(--txt)"}}>{title}</h3>
      <p style={{color:"var(--muted)",fontSize:13,lineHeight:1.65,marginBottom:onAction?18:0}}>{message}</p>
      {onAction&&<button className="btn" onClick={onAction} style={{padding:"11px 26px"}}>{actionLabel}</button>}
    </div>
  );
  return card?<div className="sm-card sage" style={{padding:"10px 6px"}}>{body}</div>:body;
};
/* Small hand-drawn faces for the Glow Journal moods (replaces emoji so the
   journal matches the rest of the palette). */
const MOOD_FACES={
  Happy:{fill:"#F3E6B8",eyes:"dots",mouth:"M8.6 14.6c1.5 3 7.3 3 8.8 0",cheeks:true},
  Calm:{fill:"#D5E3C1",eyes:"closed",mouth:"M10 15.8q3 1.7 6 0"},
  Low:{fill:"#DDE3D2",eyes:"dots",mouth:"M9 17.6q4-3.2 8 0"},
  Frustrated:{fill:"#F4C9C9",eyes:"dots",brows:["M7.2 8.2l3.6 1.7","M18.8 8.2l-3.6 1.7"],mouth:"M9.6 17.2h6.8"},
  Confident:{fill:"#F6D9DA",eyes:"dots",mouth:"M9 15.2q4.2 3.2 8-.9",cheeks:true},
  Anxious:{fill:"#E9E0CC",eyes:"dots",brows:["M7.2 9.8l3.6-1.7","M18.8 9.8l-3.6-1.7"],mouth:"M8.8 17.2q1.3-1.7 2.6 0t2.6 0t2.6 0"},
};
const MoodFace=({mood,size=30})=>{
  const f=MOOD_FACES[mood];
  if(!f)return<span className="sm-tile-ic" style={{width:size,height:size,borderRadius:"50%"}}><Ic n="pen" s={size*.5} c="currentColor"/></span>;
  const ink="#5A5A40";
  return(
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden style={{flexShrink:0}}>
      <circle cx="13" cy="13" r="11.6" fill={f.fill} stroke="rgba(90,90,64,.35)" strokeWidth="1"/>
      {f.cheeks&&<><circle cx="6.6" cy="15" r="1.7" fill="#EBA3AA" opacity=".55"/><circle cx="19.4" cy="15" r="1.7" fill="#EBA3AA" opacity=".55"/></>}
      {f.eyes==="dots"?<><circle cx="9.3" cy="11.2" r="1.25" fill={ink}/><circle cx="16.7" cy="11.2" r="1.25" fill={ink}/></>
        :<><path d="M7.6 11.4q1.7 1.4 3.4 0" fill="none" stroke={ink} strokeWidth="1.3" strokeLinecap="round"/><path d="M15 11.4q1.7 1.4 3.4 0" fill="none" stroke={ink} strokeWidth="1.3" strokeLinecap="round"/></>}
      {f.brows?.map((d,i)=><path key={i} d={d} fill="none" stroke={ink} strokeWidth="1.3" strokeLinecap="round"/>)}
      <path d={f.mouth} fill="none" stroke={ink} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
};
/* Real per-day activity log (written by recordActivity) → the last N days,
   oldest first, each with the list of things done that day. */
const lastDaysActivity=(n=28)=>{
  const acts=LS.get("activities",{});
  const out=[];
  /* Same UTC-day keying as recordActivity() so a logged day always lands
     in the cell it was written to, whatever the viewer's timezone. */
  const now=Date.now();
  for(let i=n-1;i>=0;i--){
    const x=new Date(now-i*86400000);
    const key=x.toISOString().split("T")[0];
    out.push({key,date:x,acts:acts[key]||[]});
  }
  return out;
};
const ACT_LABELS={checkin:"Check-ins",habit:"Habits",scan:"Skin scans",quiz:"Skin quiz",hydration:"Hydration",journal:"Journal",challenge:"Challenges"};

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
    <div role="status" aria-live="polite" style={{position:"fixed",top:0,left:0,right:0,zIndex:300,padding:"9px 16px",textAlign:"center",fontSize:12.5,fontWeight:600,color:online?"#0D2818":"#4A0E0E",background:online?"#A8E6C9":"#C4585F",transition:"background .3s"}}>
      {online?"Back online. Your data will sync now.":"You're offline. Some features (AI scan, coach, weather) need a connection. Your local data is still safe."}
    </div>
  );
};
const ErrorBox=({message,onRetry})=>(
  <div role="alert" className="sm-note pink" style={{padding:"18px 20px",textAlign:"left",marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
    <span className="sm-note-ic"><Ic n="alert" s={14} c="currentColor"/></span>
    <p style={{minWidth:180}}>
      <strong style={{display:"block",marginBottom:2,color:"#8A4A55"}}>Something didn't go as planned.</strong>
      {message||"Let's try again together."}
    </p>
    {onRetry&&<button className="btn" onClick={onRetry} style={{padding:"9px 20px",fontSize:12.5,display:"inline-flex",alignItems:"center",gap:6}}><Ic n="refresh" s={13}/>Try again</button>}
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
    {name:"Cetaphil Gentle Cleanser",brand:"Cetaphil",price:"₹599",tier:"Budget",rating:4.4,ing:["Glycerin","Niacinamide"],benefit:"Ultra-gentle for sensitive & dry skin",for:["Dry","Sensitive","Normal"],why:"Sumi's top pick for reactive or new-to-skincare skin. Won't disrupt your barrier."},
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
    {name:"Neutrogena Hydro Boost",brand:"Neutrogena",price:"₹799",tier:"Budget",rating:4.5,ing:["Hyaluronic Acid","Glycerin"],benefit:"Lightweight deep hydration for all skin types",for:["Dry","Dehydration","Normal","All"],why:"Clinically proven to hydrate deeper layers. A Sumi favourite for dry spells."},
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
      <SumiAvatar state="coach" size={34}/>
      <div style={{flex:1}}>
        <div style={{fontSize:10,color:"var(--soft)",fontWeight:600,marginBottom:5,textTransform:"uppercase",letterSpacing:".07em"}}>Sumi's Reminder · tap to refresh</div>
        <p key={k} className="fade-up" style={{fontSize:13,color:"var(--txt)",lineHeight:1.75}}>{TIPS[idx]}</p>
      </div>
    </div>
  );
};


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
  if(e?.code==="NO_KEY")return"Sumi's AI isn't configured yet. Please contact support.";
  if(e?.code==="OFFLINE")return"You appear to be offline. Please check your connection and try again.";
  if(e?.code==="TIMEOUT")return"That's taking longer than expected. Please try again with a stable connection.";
  if(e?.code==="NETWORK")return"Couldn't reach Sumi's AI. Please check your internet connection.";
  if(e?.code==="BLOCKED")return"That request couldn't be completed safely. Please try a different photo or message.";
  if(e?.status===401||e?.status===403)return"AI authentication failed. Please contact support.";
  if(e?.status===400)return"That request couldn't be processed. Please try a different photo or message.";
  if(e?.status===429)return"Sumi is a little busy right now. Please wait a moment and try again.";
  if(e?.status>=500)return"Sumi's AI service is temporarily unavailable. Please try again shortly.";
  return e?.message||"Something didn't go as planned. Please try again.";
};

const runVisionAnalysis=async(imgData,user,prevScan,prevQuizResult)=>{
  const resized=await resizeImg(imgData);
  const mediaType=getMediaType(resized);
  const base64Data=resized.split(",")[1];
  const system=`You are a compassionate dermatologist AI for Sumi. Analyze facial skin from photos with care and empathy. CRITICAL: Never imply skin conditions reduce beauty. Frame everything supportively. If self-reported quiz context is provided, keep it clearly separate from what you can actually see in the photo — never claim the photo visually confirms something that was only self-reported. Return ONLY valid JSON, no markdown fences.`;
  const conditions=["pcos","pcod","thyroid","diabetes"].filter(k=>user?.[k]).join(", ")||"none reported";
  const trendCtx=prevScan?`Previous scan (${prevScan.date}): overall score ${prevScan.overallScore}, hydration ${prevScan.hydrationLevel}, brightness ${prevScan.brightness}, elasticity ${prevScan.elasticity}, concerns: ${(prevScan.concerns||[]).map(c=>c.name).join(", ")||"none"}. Reference this trend naturally in aiSummary where relevant (e.g. noting improvement or a new concern). Don't just restate the numbers.`:"This is their first tracked scan. No prior trend to compare.";
  const quizCtx=prevQuizResult?`This person also recently completed Sumi's Skin Concern Quiz and self-reported: skin type ${prevQuizResult.skinType||"unknown"}, concerns: ${(prevQuizResult.concerns||[]).map(c=>c.name).join(", ")||"none"}. You may reference this self-reported context in aiSummary (e.g. "you also mentioned...") but do not claim the photo visually confirmed it — keep visually-observed and self-reported claims distinct.`:"";
  const prompt=`Analyze this person's skin compassionately, using their full profile below to personalize everything (not just the photo in isolation).

User profile: age ${user?.age||"unknown"}, gender ${user?.gender||"unspecified"}, skin type ${user?.skinType||"unknown"}, diet ${user?.diet||"unspecified"}, water intake ${user?.water||"unspecified"}, sleep ${user?.sleep||"7-8 hrs"}, stress level ${user?.stress||"Moderate"}, health conditions: ${conditions}, skin goals: ${(user?.skinGoal||[]).join(", ")||"general improvement"}.

${trendCtx}
${quizCtx}

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
    console.error("[Sumi Scan] Incomplete JSON:", cleaned);

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

  console.error("[Sumi Scan] Unparseable AI response:", cleaned);

  const e = new Error("Could not parse the analysis response. Please try again.");
  e.code = "PARSE";
  throw e;
}
};

/* Product Scanner — same Gemini vision pipeline as the skin scan, pointed
   at a photo of a product's label/packaging instead of a face. Structured
   so that swapping in a real barcode/UPC product database later only
   means changing this one function; the UI and storage layer around it
   don't need to change. */
const runProductAnalysis=async(imgData,user,savedProducts=[])=>{
  const resized=await resizeImg(imgData);
  const mediaType=getMediaType(resized);
  const base64Data=resized.split(",")[1];
  const system=`You are a compassionate skincare-ingredient expert AI for Sumi. Read the product label/packaging in the photo (name, brand, ingredient list if visible) and produce a clear, honest product report. If any field truly can't be determined from the image, use your best general knowledge of that product, and if you still can't tell, say so honestly rather than inventing specifics. Return ONLY valid JSON, no markdown fences.`;
  const savedCtx=savedProducts.length?`This person already has these products saved: ${savedProducts.map(p=>`${p.name} (actives: ${(p.keyActives||[]).map(a=>a.name).join(", ")||"unknown"})`).join("; ")}. Flag any overlapping/duplicate active ingredients between this new product and those.`:"This person has no other products saved yet, so duplicateActives should be an empty array.";
  const prompt=`Identify and analyze the skincare/beauty product shown in this photo for someone with skin type ${user?.skinType||"unknown"}, concerns: ${(user?.skinGoal||[]).join(", ")||"general skincare"}.

${savedCtx}

Return JSON with this exact shape:
{productName:string,brand:string,category:string(e.g. "Cleanser","Serum","Moisturizer","Sunscreen","Treatment","Other"),
ingredients:[string](full list if visible, else best-known list, max 20),
keyActives:[{name:string,whatItDoes:string}](max6),
benefits:[string](max4),
concerns:[string](possible irritants/concerns for sensitive users, max4),
suitability:string(1-2 sentences on fit for this person's skin type/concerns),
howToUse:string,
whenToUse:string("Morning","Night","Morning & Night", etc),
frequency:string(e.g. "Daily","2-3x per week"),
warnings:[string](max3, empty array if none),
fitsRoutine:string(1 short sentence on how/where this fits a routine),
duplicateActives:[string](active ingredient names shared with the saved products above; empty array if none or none saved),
confidence:string("High","Medium","Low" — how confident you are this was correctly identified from the photo)}`;
  const parts=[{inlineData:{mimeType:mediaType,data:base64Data}},{text:prompt}];
  const text=await callGemini(parts,{system,maxTokens:2048,temperature:0.3,timeoutMs:60000,responseMimeType:"application/json"});
  const cleaned=text.replace(/```json/g,"").replace(/```/g,"").trim();
  try{
    return JSON.parse(cleaned);
  }catch{
    const m=cleaned.match(/\{[\s\S]*\}/);
    if(m){try{return JSON.parse(m[0]);}catch{}}
    const e=new Error("Could not read that product clearly. Please try a closer, well-lit photo of the label.");
    e.code="PARSE";throw e;
  }
};

/* Skin Concern Quiz — AI Analysis. Consumes the SAME normalized-profile
   idea as the photo scan (see SkinQuiz below): a structured set of
   quiz answers, plus optionally the person's most recent photo-scan
   result, and produces a result shaped so the rest of the app (Results,
   Products, SkinForecast, Journey, Analytics, MonthlyStory, Dashboard)
   can consume it exactly like a scan result — just without the
   photo-only numeric fields (hydrationLevel/elasticity/brightness/
   overallScore/heatZones), which the quiz has no way to visually measure
   and must never fabricate. When a previous photo scan exists, this is
   asked to keep photo observations and user-reported concerns clearly
   separate rather than blending them into one claim. */
const runQuizAnalysis=async(answers,otherText,user,prevPhotoResult)=>{
  const system=`You are a compassionate dermatologist AI for Sumi, working from a self-reported skin questionnaire (no photo). CRITICAL RULES: (1) Never make a medical diagnosis. (2) Never claim to have visually observed anything — everything here is self-reported, so phrase findings as "Based on what you've shared...", "Your responses suggest...", "You may want to pay attention to..." — never "You have...". (3) If a previous photo scan is provided, clearly keep "visually observed" claims (from that photo) separate from "self-reported" claims (from this quiz) — never claim the quiz visually detected something, and never claim the photo confirmed something only the quiz reported. Return ONLY valid JSON, no markdown fences.`;
  const readable=SKIN_QUIZ_QUESTIONS.filter(q=>q.type!=="text"&&answers[q.id]!=null&&answers[q.id]!=="").map(q=>{
    const v=Array.isArray(answers[q.id])?answers[q.id].join(", "):answers[q.id];
    return`${q.q} → ${v}`;
  }).join("\n");
  const photoCtx=prevPhotoResult?`This person also has a previous PHOTO scan on file (source: photo_scan, ${prevPhotoResult.date||"recent"}): overall ${prevPhotoResult.overallScore}, hydration ${prevPhotoResult.hydrationLevel}, skin type read as ${prevPhotoResult.skinType}, visually-observed concerns: ${(prevPhotoResult.concerns||[]).map(c=>c.name).join(", ")||"none"}. Combine this with the quiz below: set "source" to "combined", and in aiSummary/observations distinguish what was visually observed in the photo from what the person is now self-reporting in the quiz.`:`This person has no previous photo scan — base everything only on their quiz answers. Set "source" to "skin_quiz".`;
  const prompt=`A person completed Sumi's Skin Concern Quiz (no photo involved). Here are their answers:

${readable||"(no structured answers given)"}

${otherText?.trim()?`They also added, in their own words: "${otherText.trim()}"`:"They left the free-text 'anything else' field blank."}

User profile: age ${user?.age||"unknown"}, gender ${user?.gender||"unspecified"}, existing skin goals: ${(user?.skinGoal||[]).join(", ")||"general improvement"}.

${photoCtx}

Return JSON with this exact shape:
{source:"skin_quiz"|"combined",
skinType:string(your best read of their perceived skin type from the answers, e.g. "Combination-leaning", "Likely dry", "Not enough information yet" if genuinely unclear),
primaryConcerns:[string](max4, ranked, from what they reported),
secondaryConcerns:[string](max3),
concerns:[{name,severity:"Low|Moderate|High"(based on reported frequency/intensity, never invented),confidence:number(how clearly this came through in their answers, 40-90),color:string,description:string(observational language, e.g. "You reported frequent breakouts along the jawline.")}](max5),
observations:[string](max5, each tagged implicitly as self-reported; if a photo scan was combined, include 1-2 photo-sourced ones phrased as "Your photo showed..." interleaved with quiz ones phrased as "You reported..."),
aiSummary:string(3-4 warm, observational sentences synthesizing the whole quiz — never "you have", always "based on what you've shared"/"your responses suggest"),
emotionalNote:string(1 affirming sentence),
routineNote:string(1-2 sentences reflecting their current routine consistency back to them, encouragingly),
recommendations:[{action:string,reason:string,targetConcern:string,expectedImprovement:string,timeframe:string}](max5, ordered by priority, each justified by something they actually answered)}

Every field must trace back to something in their answers or the optional photo context above — never invent details they didn't share.`;
  const text=await callGemini([{text:prompt}],{system,maxTokens:3072,temperature:0.4,timeoutMs:45000,responseMimeType:"application/json"});
  const cleaned=text.replace(/```json/g,"").replace(/```/g,"").trim();
  try{
    if(!cleaned.endsWith("}")){const e=new Error("Sumi's response was cut short. Please try again.");e.code="TRUNCATED";throw e;}
    return JSON.parse(cleaned);
  }catch{
    const m=cleaned.match(/\{[\s\S]*\}/);
    if(m){try{return JSON.parse(m[0]);}catch{}}
    const e=new Error("Could not read your answers clearly. Please try again.");e.code="PARSE";throw e;
  }
};

const generateDietPlan=async(user,results,dietType,budget)=>{
  const concerns=(results?.concerns||[]).map(c=>c.name).join(", ")||"general skin health";
  const conditions=["pcos","pcod","thyroid","diabetes"].filter(k=>user?.[k]).join(", ")||"none reported";
  const system=`You are a compassionate nutrition AI for Sumi, connecting diet to skin health. Return ONLY valid JSON, no markdown fences. Never shame food choices. Frame everything as nourishing, achievable additions.`;
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

    console.error("[Sumi Diet] Unparseable AI response:", cleaned);

    const e = new Error("Could not generate your diet plan. Please try again.");
    e.code = "PARSE";
    throw e;
}
};


/* ── SUMI LOGO ───────────────────────────────────────────────────────────
   Uses the supplied brand-asset image as the single source of truth
   (raster, kept at native proportions, never redrawn). Referenced from
   one component so every usage across the app updates from one place. */
/* Sumi brand mark — the final scrapbook-sticker logo (watercolor leaf "S",
   gingham washi tape, blossom, ribbon). This replaces the old placeholder
   illustration everywhere; it's the single source of brand identity. */
const AuraLogo=({size=56})=>(
  <img src="/sumi/brand/emblem.png" alt="Sumi" width={size} height={size} draggable={false} style={{flexShrink:0,objectFit:"contain",filter:`drop-shadow(0 2px ${size*.09}px rgba(92,75,64,.18))`}}/>
);

/* The one place the "Sumi" wordmark is drawn — always the official
   uploaded asset, never retyped in a font. Every other spot that used to
   type out SUMI/sumi as text now renders this component instead, so the
   whole app shares a single source of brand truth. */
const Wordmark=({height=22,style={}})=>(
  <img src="/sumi/brand/wordmark.png" alt="Sumi" draggable={false} style={{height,width:"auto",display:"block",objectFit:"contain",...style}}/>
);

const LogoBrand=({size=56,showTagline=true,textColor="#5C4B40"})=>(
  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
    <AuraLogo size={size}/>
    <Wordmark height={size*.42}/>
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
      <ellipse cx="20" cy="20" rx="1.4" ry="7" fill="#8A4A55"/>
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
const BUTTERFLY_PALETTE=["#D98CA3","#F0C4CC","#D98A93","#F0B784","#EFA39A"];
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
const DECOR="/sumi/decor/";
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
   Sumi mark, echoing the reference art without shipping it as a raster. */
const GlassBubble=({size=340,children})=>(
  <div style={{position:"relative",width:size,height:size,margin:"0 auto",animation:"bubbleFloat 7s ease-in-out infinite"}}>
    <div style={{position:"absolute",inset:0,borderRadius:"50%",background:"radial-gradient(circle at 32% 28%,rgba(255,255,255,.9),rgba(255,255,255,.15) 45%,rgba(255,255,255,.35) 100%)",boxShadow:"0 30px 80px rgba(154,72,100,.25),inset 0 0 0 1px rgba(255,255,255,.6),inset -14px -18px 40px rgba(201,125,149,.18),inset 14px 18px 30px rgba(255,255,255,.5)",backdropFilter:"blur(6px)"}}/>
    <div style={{position:"absolute",top:"12%",left:"18%",width:"26%",height:"14%",borderRadius:"50%",background:"rgba(255,255,255,.85)",filter:"blur(6px)",transform:"rotate(-18deg)"}}/>
    <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>{children}</div>
  </div>
);

/* ── SPLASH SCREEN ──────────────────────────────────────────────────────────── */
const GINGHAM="linear-gradient(rgba(253,248,240,.42),rgba(253,248,240,.42)),url(/sumi/brand/gingham.jpg) center/300px repeat";
const Splash=({onDone,theme="dark"})=>{
  const t={...LIGHT_T,bodyBg:GINGHAM};
  useEffect(()=>{const timer=setTimeout(onDone,2800);return()=>clearTimeout(timer);},[onDone]);
  return(
    <div style={{minHeight:"100vh",background:t.bodyBg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:0,position:"relative",overflow:"hidden"}}>
      {/* Minimal, paper + logo only — no character, no garden scene. */}
      <div style={{animation:"fadeUp .9s ease forwards",textAlign:"center",zIndex:10}}>
        <div style={{marginBottom:22,animation:"floatY 3.2s ease-in-out infinite"}}>
          <AuraLogo size={96}/>
        </div>
        <div style={{display:"flex",justifyContent:"center",margin:"0 0 6px"}}><Wordmark height={26}/></div>
        <p style={{color:t.muted,fontSize:12.5,letterSpacing:".04em"}}>Loading your wellness journey…</p>
        <div style={{marginTop:20,width:40,height:3,borderRadius:2,background:`linear-gradient(90deg,${t.sage},${t.rose})`,margin:"20px auto 0",animation:"shimmer 1.6s ease-in-out infinite",backgroundSize:"200% 100%"}}/>
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
      {/* Restrained: paper + gingham only, no garden scene, no character. */}
      <div style={{width:"100%",maxWidth:420,zIndex:10,animation:"fadeUp .5s ease"}}>
        {/* Brand header */}
        <div style={{textAlign:"center",marginBottom:22}}>
          <LogoBrand size={58} textColor={t.mist} showTagline={false}/>
          {mode!=="forgot"&&(
            <div style={{marginTop:14}}>
              <p className="cf" style={{fontSize:19,fontWeight:600,color:t.txt,margin:"0 0 6px"}}>A little space for you.</p>
              <p style={{fontSize:12.5,color:t.muted,lineHeight:1.6,maxWidth:320,margin:"0 auto"}}>Let's get to know you so Sumi can make your journey feel personal.</p>
            </div>
          )}
        </div>
        <div className="glass glow" style={{background:cardBg,borderRadius:24,padding:"34px 30px"}}>
          <h2 className="cf" style={{fontSize:26,fontWeight:600,marginBottom:22,textAlign:"center",color:t.txt}}>
            {mode==="login"?"Welcome back":"Create account"}
            {mode==="forgot"&&"Reset password"}
          </h2>
          {err&&<div role="alert" aria-live="assertive" style={{background:"rgba(245,163,163,.1)",border:"1px solid rgba(245,163,163,.28)",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:13,color:"#C4585F"}}>{err}</div>}
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
              <p style={{fontSize:11,marginTop:-6,color:form.confirm===form.password?"#A8E6C9":"#C4585F",display:"flex",alignItems:"center",gap:5}}>
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
              <button onClick={googleAuth} disabled={loading} style={{width:"100%",padding:"13px",borderRadius:50,border:`1px solid ${t.border}`,background:theme==="light"?"rgba(139,58,87,.06)":"rgba(255,255,255,.04)",color:t.txt,fontSize:14,fontWeight:500,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,transition:"all .2s",fontFamily:"Nunito,system-ui,sans-serif"}}>
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
        <p style={{textAlign:"center",fontSize:11,color:t.muted,marginTop:18,lineHeight:1.6}}>By continuing you agree to Sumi's Terms of Service and Privacy Policy.</p>
      </div>
    </div>
  );
};

/* ── SETTINGS PAGE ──────────────────────────────────────────────────────────── */
/* The six final Sumi avatar portraits — provided art assets, picked
   once in You → Profile and persisted with the rest of the profile. */
const AVATARS=Array.from({length:6},(_,i)=>`/avatar/avatar_${i+1}.png`);

const Settings=({user,authUser,onLogout,onUpdateProfile,onDeleteAccount,theme="light"})=>{
  const t=LIGHT_T;
  const [tab,setTab]=useState("profile");
  const [profile,setProfile]=useState({name:user?.name||authUser?.name||"",email:user?.email||authUser?.email||"",age:user?.age||"",skinType:user?.skinType||"Combination",skinGoal:user?.skinGoal||[]});
  const [avatarId,setAvatarId]=useState(user?.avatarId??authUser?.avatarId??null);
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
    onUpdateProfile({...user,...profile,avatarId});
    setSaved(true);setTimeout(()=>setSaved(false),2200);
  };
  const chooseAvatar=(i)=>{
    setAvatarId(i);
    onUpdateProfile({...user,...profile,avatarId:i});
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
      <div style={{marginBottom:22,display:"flex",alignItems:"center",gap:12}}>
        <AuraLogo size={40}/>
        <div>
          <h1 className="cf" style={{fontSize:26,fontWeight:600,color:t.txt}}>You</h1>
          <p style={{color:t.muted,fontSize:12.5}}>Your personal corner of the diary</p>
        </div>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:22,flexWrap:"wrap"}}>
        {[["profile","Profile","chip-coral"],["personalization","Personalization","chip-sage"],["privacy","Privacy","chip-sky"],["settings","Settings","chip-sun"],["account","Account","chip-lav"]].map(([id,label,chip])=>(
          <button key={id} onClick={()=>setTab(id)} className={tab===id?`chip ${chip}`:""} style={{padding:"8px 16px",borderRadius:20,border:tab===id?"none":`1px solid ${t.border}`,background:tab===id?undefined:"transparent",color:tab===id?"#3D2A2E":t.muted,cursor:"pointer",fontSize:13,fontWeight:tab===id?700:500,transition:"all .2s"}}>{label}</button>
        ))}
      </div>

      {tab==="profile"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <Card>
            <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20}}>
              {avatarId!=null&&AVATARS[avatarId]
                ?<img src={AVATARS[avatarId]} alt="" style={{width:64,height:64,borderRadius:"50%",objectFit:"cover",border:`2px solid ${t.border}`,flexShrink:0}}/>
                :<div style={{width:64,height:64,borderRadius:"50%",background:`linear-gradient(135deg,${t.coral},${t.rose})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,fontWeight:700,color:"#fff",border:`2px solid ${t.border}`,flexShrink:0}}>{profile.name?.[0]?.toUpperCase()||"S"}</div>}
              <div><div style={{fontSize:16,fontWeight:600,color:t.txt}}>{profile.name||"Sumi User"}</div><div style={{fontSize:12,color:t.muted,marginTop:2}}>{profile.email}</div></div>
            </div>
            <Label>Avatar</Label>
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8,marginBottom:20}}>
              {AVATARS.map((src,i)=>(
                <button key={i} onClick={()=>chooseAvatar(i)} aria-label={`Avatar ${i+1}`} aria-pressed={avatarId===i} className="kb-focusable" style={{padding:0,border:avatarId===i?`2px solid ${t.coral}`:"2px solid transparent",borderRadius:"50%",background:"none",cursor:"pointer",lineHeight:0,boxShadow:avatarId===i?`0 0 0 3px ${t.blush}`:"none",transition:"box-shadow .2s,border-color .2s"}}>
                  <img src={src} alt="" style={{width:"100%",aspectRatio:"1",borderRadius:"50%",objectFit:"cover",display:"block"}}/>
                </button>
              ))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div><Label>Full Name</Label><input className="inp" value={profile.name} onChange={e=>setProfile(p=>({...p,name:e.target.value}))} style={{color:t.txt}}/></div>
              <div><Label>Email</Label><input className="inp" value={profile.email} type="email" onChange={e=>setProfile(p=>({...p,email:e.target.value}))} style={{color:t.txt}}/></div>
              <div><Label>Age</Label><input className="inp" value={profile.age} type="number" onChange={e=>setProfile(p=>({...p,age:e.target.value}))} style={{color:t.txt}}/></div>
            </div>
            <button className="btn" onClick={saveProfile} style={{marginTop:18,width:"100%"}}>{saved?"✅ Profile Saved!":"Save Profile"}</button>
          </Card>
        </div>
      )}

      {tab==="personalization"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <Card>
            <h3 style={{fontSize:15,fontWeight:600,color:t.txt,marginBottom:4}}>Your skin</h3>
            <p style={{fontSize:12,color:t.muted,marginBottom:14}}>Helps Sumi tailor scans, products, and tips to you.</p>
            <Label>Skin Type</Label>
            <select className="sel" value={profile.skinType} onChange={e=>setProfile(p=>({...p,skinType:e.target.value}))} style={{color:t.txt,background:theme==="light"?t.card:t.bg,marginBottom:6}}><option>Oily</option><option>Dry</option><option>Combination</option><option>Normal</option><option>Sensitive</option></select>
          </Card>
          <Card>
            <Label>Skin Goals</Label>
            <p style={{fontSize:12,color:t.muted,margin:"0 0 12px"}}>Pick as many as apply. You can change these anytime.</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {["Clear Acne","Fade Pigmentation","Deep Hydration","Anti-Aging","Even Skin Tone","Reduce Pores","Glow & Radiance","Soothe Redness","Dark Circles","Oil Control","Strengthen Barrier","Brighten Complexion"].map((g,i)=>{
                const pal=CHIP_GRADIENTS;const [c1,c2]=pal[i%pal.length];
                const sel=(profile.skinGoal||[]).includes(g);
                const toggle=()=>setProfile(p=>({...p,skinGoal:sel?p.skinGoal.filter(x=>x!==g):[...(p.skinGoal||[]),g]}));
                return(<div key={g} role="checkbox" aria-checked={sel} tabIndex={0} className="kb-focusable" onClick={toggle} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggle();}}} style={{padding:"8px 15px",borderRadius:22,cursor:"pointer",fontSize:12.5,fontWeight:600,transition:"all .2s",background:sel?`linear-gradient(135deg,${c1},${c2})`:t.card,color:sel?"#fff":t.soft,border:`1px solid ${sel?"transparent":t.border}`}}>{g}</div>);
              })}
            </div>
            <button className="btn" onClick={saveProfile} style={{marginTop:18,width:"100%"}}>{saved?"✅ Saved!":"Save Preferences"}</button>
          </Card>
        </div>
      )}

      {tab==="settings"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <Card>
            <h3 style={{fontSize:15,fontWeight:600,color:t.txt,marginBottom:4}}>Notifications</h3>
            <p style={{fontSize:12,color:t.muted,marginBottom:14}}>Choose what reminders help you stay on track.</p>
            {[["wellness","Daily Wellness Reminder","Morning check-in to start your day"],["water","Water Reminder","Hourly nudge to drink more water"],["journal","Journal Reminder","Evening prompt to write a journal entry"],["weekly","Weekly Progress Summary","Get your skin & wellness recap every Sunday"]].map(([key,label,desc])=>(
              <Row key={key} label={<div><div style={{fontSize:13.5,color:t.txt,fontWeight:500}}>{label}</div><div style={{fontSize:11,color:t.muted,marginTop:2}}>{desc}</div></div>}>
                <Toggle on={notifs[key]} onChange={()=>toggleNotif(key)}/>
              </Row>
            ))}
          </Card>
          <Card style={{textAlign:"center",padding:"26px 24px"}}>
            <AuraLogo size={44}/>
            <p style={{fontSize:12.5,color:t.muted,lineHeight:1.75,maxWidth:340,margin:"14px auto 18px"}}>AI-powered skincare and emotional wellness, designed like your own scrapbook diary. One day at a time.</p>
            <div style={{fontSize:11.5,color:t.muted,borderTop:`1px solid ${t.border}`,paddingTop:14,lineHeight:1.8}}>
              <div style={{fontWeight:600,color:t.txt,marginBottom:3}}>Version 5.0</div>
              <div>© 2026 Sumi · Not a medical device</div>
            </div>
          </Card>
        </div>
      )}

      {tab==="account"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <Card>
            <h3 style={{fontSize:15,fontWeight:600,color:t.txt,marginBottom:14}}>Change Password</h3>
            {authUser?.provider==="google"?(
              <p style={{fontSize:12,color:t.muted,lineHeight:1.7}}>You signed in with Google, so there's no separate Sumi password to change. Manage it from your Google Account instead.</p>
            ):(
              <>
                {pwMsg&&<div style={{background:pwMsg.startsWith("success:")?"rgba(168,230,201,.1)":"rgba(245,163,163,.1)",border:`1px solid ${pwMsg.startsWith("success:")?"rgba(79,168,118,.3)":"rgba(245,163,163,.3)"}`,borderRadius:10,padding:"10px 14px",marginBottom:12,fontSize:13,color:pwMsg.startsWith("success:")?"#6E8F55":"#C4585F"}}>{pwMsg.replace("success:","")}</div>}
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
            <button onClick={onLogout} style={{width:"100%",padding:"13px",borderRadius:50,border:"1px solid rgba(245,163,163,.35)",background:"rgba(245,163,163,.07)",color:"#C4585F",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"Nunito,system-ui,sans-serif",transition:"all .2s"}}>Sign Out</button>
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
                cycleDayLogs:LS.get("cycle_logs",{}),
                dietPlan:LS.get("diet_plan",null),
                coachChatHistory:LS.get("coach_msgs",[]),
              };
              const blob=new Blob([JSON.stringify(exportData,null,2)],{type:"application/json"});
              const url=URL.createObjectURL(blob);
              const a=document.createElement("a");
              a.href=url;a.download=`smira-data-export-${new Date().toISOString().slice(0,10)}.json`;
              document.body.appendChild(a);a.click();document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }} style={{width:"100%",padding:"12px",borderRadius:50,border:`1px solid ${t.border}`,background:"transparent",color:t.soft,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"Nunito,system-ui,sans-serif"}}>Export My Data (JSON)</button>
          </Card>
          <Card style={{border:"1px solid rgba(245,163,163,.25)"}}>
            <h3 style={{fontSize:15,fontWeight:600,color:t.txt,marginBottom:8}}>Reset Journey</h3>
            {!confirmReset?(
              <>
                <p style={{fontSize:12,color:t.muted,lineHeight:1.7,marginBottom:14}}>Permanently clears your progress: scans, habits, hydration, journal entries, challenges, Monthly Story, analytics, and cycle history. Your account and profile stay as they are.</p>
                <button onClick={()=>setConfirmReset(1)} style={{width:"100%",padding:"12px",borderRadius:50,border:"1px solid rgba(245,163,163,.35)",background:"transparent",color:"#C4585F",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"Nunito,system-ui,sans-serif"}}>Reset Your Journey</button>
              </>
            ):confirmReset===1?(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <p style={{fontSize:13,color:"#C4585F",fontWeight:600,lineHeight:1.6}}>Reset Your Journey?</p>
                <p style={{fontSize:12,color:t.muted,lineHeight:1.6}}>This will permanently delete your progress, history, scans, journal entries, challenges, and personalized journey data. This action cannot be undone.</p>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setConfirmReset(0)} style={{flex:1,padding:"11px",borderRadius:50,border:`1px solid ${t.border}`,background:"transparent",color:t.muted,fontSize:13,cursor:"pointer",fontFamily:"Nunito,system-ui,sans-serif"}}>Cancel</button>
                  <button onClick={()=>setConfirmReset(2)} style={{flex:1,padding:"11px",borderRadius:50,border:"none",background:"linear-gradient(135deg,#C4585F,#9C525A)",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"Nunito,system-ui,sans-serif"}}>Reset Everything</button>
                </div>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <p style={{fontSize:12,color:"#C4585F",fontWeight:600}}>Last chance: this can't be undone. Reset everything now?</p>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setConfirmReset(0)} style={{flex:1,padding:"11px",borderRadius:50,border:`1px solid ${t.border}`,background:"transparent",color:t.muted,fontSize:13,cursor:"pointer",fontFamily:"Nunito,system-ui,sans-serif"}}>Cancel</button>
                  <button disabled={resetting} onClick={async()=>{setResetting(true);try{await resetJourneyData(authUser?.uid);window.location.reload();}catch{setResetting(false);}}} style={{flex:1,padding:"11px",borderRadius:50,border:"none",background:"linear-gradient(135deg,#C4585F,#9C525A)",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"Nunito,system-ui,sans-serif"}}>{resetting?"Resetting...":"Yes, Reset Everything"}</button>
                </div>
              </div>
            )}
          </Card>
          {onDeleteAccount&&(
            <Card style={{border:"1px solid rgba(245,163,163,.25)"}}>
              <h3 style={{fontSize:15,fontWeight:600,color:"#C4585F",marginBottom:8}}>Danger Zone</h3>
              <p style={{fontSize:12,color:t.muted,lineHeight:1.7,marginBottom:14}}>Permanently deletes your account, scan history, journal, habits, and all cloud data. This cannot be undone.</p>
              {!confirmDelete?(
                <button onClick={()=>setConfirmDelete(true)} style={{width:"100%",padding:"12px",borderRadius:50,border:"1px solid rgba(245,163,163,.35)",background:"transparent",color:"#C4585F",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"Nunito,system-ui,sans-serif"}}>Delete My Account</button>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {deleteErr&&<div style={{background:"rgba(245,163,163,.1)",border:"1px solid rgba(245,163,163,.28)",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#C4585F"}}>{deleteErr}</div>}
                  <p style={{fontSize:12,color:"#C4585F",fontWeight:600}}>Are you absolutely sure? This is permanent.</p>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>{setConfirmDelete(false);setDeleteErr("");}} style={{flex:1,padding:"11px",borderRadius:50,border:`1px solid ${t.border}`,background:"transparent",color:t.muted,fontSize:13,cursor:"pointer",fontFamily:"Nunito,system-ui,sans-serif"}}>Cancel</button>
                    <button onClick={async()=>{setDeleting(true);setDeleteErr("");try{await onDeleteAccount();}catch(e){setDeleteErr(e.message||"Could not delete account. Please sign out and back in, then try again.");setDeleting(false);}}} disabled={deleting} style={{flex:1,padding:"11px",borderRadius:50,border:"none",background:"linear-gradient(135deg,#C4585F,#9C525A)",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"Nunito,system-ui,sans-serif"}}>{deleting?"Deleting...":"Yes, Delete Everything"}</button>
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
            <h3 style={{fontSize:16,fontWeight:600,color:t.txt,marginBottom:4}}>Sumi is your private space</h3>
            <p style={{fontSize:13,color:t.muted,lineHeight:1.75}}>Your journal, cycle data, scans, and profile belong to your account alone. No one else who uses Sumi can see them, and Sumi never shows one account's data to another.</p>
          </Card>
          <Card>
            <Label>What's stored, and where</Label>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {[["Your account & profile","Secured by Firebase Authentication. Your password is never stored or visible to Sumi in plain text."],["Journal, cycle & scan data","Saved to your private cloud document, keyed only to your account, so it's there when you switch devices."],["On this device","A local copy is cached for instant loading. It's cleared automatically when you sign out."]].map(([l,d])=>(
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
            <p style={{fontSize:11,color:t.muted,lineHeight:1.7}}>Sumi is not a medical device and doesn't diagnose any condition. Health and cycle content is educational. Always check with a qualified healthcare professional for anything that concerns you.</p>
          </Card>
        </div>
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
      {/* Restrained decoration — a couple of petals/sparkles, not a swarm. */}
      <GardenScene butterflies={1} petals={3} sparkles={5}/>
      <div className="garden-scene" aria-hidden style={{opacity:.5}}>
        {[6,20,78,92].map((l,i)=>(
          <div key={i} style={{position:"absolute",left:`${l}%`,top:0,bottom:i%2?"38%":"0%",width:i%2?90:130,background:i<2?"linear-gradient(180deg,rgba(230,150,170,.28),transparent 70%)":"linear-gradient(0deg,rgba(230,150,170,.28),transparent 70%)"}}/>
        ))}
      </div>

      {/* glass nav */}
      <div style={{position:"relative",zIndex:20,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"18px 28px",maxWidth:1240,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <AuraLogo size={34}/>
          <Wordmark height={24}/>
        </div>
        <div className="glass-nav hide-mobile" style={{display:"flex",gap:4,padding:"8px 10px"}}>
          {links.map(l=>(
            <a key={l} href="#" onClick={e=>e.preventDefault()} style={{padding:"9px 16px",borderRadius:100,fontSize:12.5,letterSpacing:".06em",textTransform:"uppercase",color:"#8C6373",textDecoration:"none",fontWeight:500}}>{l}</a>
          ))}
        </div>
        <button className="btn-o hide-mobile" onClick={onEnter} style={{fontSize:12.5,letterSpacing:".04em"}}>Get Started →</button>
        <button className="hamburger show-mobile" onClick={()=>setNavOpen(s=>!s)} aria-label="Menu" style={{color:"#B4636B",display:"none"}}><span style={{background:"#B4636B"}}/><span style={{background:"#B4636B"}}/><span style={{background:"#B4636B"}}/></button>
      </div>

      {/* hero */}
      <div style={{position:"relative",zIndex:10,maxWidth:640,margin:"0 auto",padding:"18px 24px 70px",textAlign:"center"}}>
        <div style={{display:"flex",justifyContent:"center",marginTop:8}}><Wordmark height={72} style={{height:"clamp(46px,8vw,74px)"}}/></div>
        <p style={{color:"#B8902A",fontSize:13,fontWeight:600,margin:"6px 0 30px",letterSpacing:".22em",textTransform:"uppercase"}}>✦ A kinder you. Everyday ✦</p>

        <GlassBubble size={220}>
          <AuraLogo size={130}/>
        </GlassBubble>

        <p style={{color:"#8C6373",fontSize:13,letterSpacing:".08em",textTransform:"uppercase",margin:"34px 0 18px"}}>Your Skin. Your Story. Your Glow.</p>
        <button className="btn" onClick={onEnter} style={{padding:"16px 44px",fontSize:14.5,letterSpacing:".04em"}}>Begin Your Glow Journey →</button>

        <div style={{display:"flex",gap:9,justifyContent:"center",flexWrap:"wrap",marginTop:36}}>
          {[["AI Skin Analysis","chip-coral","#8A4A55"],["Cycle Tracker","chip-lav","#8A4A55"],["Glow Journal","chip-sage","#4F6B3E"],["Wellness Coach","chip-sky","#4F6B3E"],["Skin Forecast","chip-sun","#6B4E14"]].map(([t,chip,fg])=>(
            <span key={t} className={`chip ${chip}`} style={{fontSize:11,color:fg,fontWeight:600,padding:"7px 15px",display:"inline-block"}}>{t}</span>
          ))}
        </div>
      </div>
      <style>{`@media(max-width:768px){.show-mobile{display:flex!important}}`}</style>
    </div>
  );
};

/* ── ONBOARDING QUIZ CONTENT ────────────────────────────────────────────
   Flattened, ordered question list across the three quiz-booklet tabs.
   Two "group" entries fold in the existing lifestyle-dropdown and
   health-conditions blocks so onboarding keeps collecting everything the
   rest of the app already depends on (Nutrition's diet type, AICoach's
   stress/sleep, MenstrualTracker's cycle length, SkinForecast's
   conditions) without turning those into a wall of one-per-screen
   questions. */
const QUIZ_QUESTIONS=[
  {tab:"Skin",key:"skinType",type:"single",q:"How would you describe your skin?",opts:["Dry","Oily","Combination","Normal","Sensitive","Not sure"]},
  {tab:"Skin",key:"skinGoal",type:"multi",q:"What would you like to focus on?",opts:["Acne","Dark spots","Uneven texture","Dryness","Oiliness","Sensitivity","Dullness","Fine lines","Not sure"]},
  {tab:"Skin",key:"skincareRoutine",type:"single",q:"How would you describe your current routine?",opts:["Just getting started","Simple routine","Full routine","Inconsistent routine","Not sure"]},
  {tab:"Skin",key:"sunscreen",type:"single",q:"How often do you use sunscreen?",opts:["Every day","Most days","Sometimes","Rarely","Never"]},
  {tab:"Wellness",key:"energy",type:"single",q:"How does your energy usually feel?",opts:["Very low","Low","Okay","Good","High"]},
  {tab:"Wellness",key:"sleepQuality",type:"single",q:"How would you describe your sleep lately?",opts:["Very inconsistent","A little inconsistent","Mostly okay","Pretty good","Very good"]},
  {tab:"Wellness",key:"nutritionFocus",type:"multi",q:"What would you like to focus on?",sub:"Nutrition",opts:["Balanced meals","Eating more regularly","Better hydration","More mindful eating","Building healthier habits","Not sure"]},
  {tab:"Wellness",key:"movement",type:"single",q:"How active are you on a typical day?",opts:["Mostly resting","Lightly active","Moderately active","Very active"]},
  {tab:"Wellness",key:"wellnessGoal",type:"multi",q:"What would you most like Sumi to help you with?",opts:["Better routines","More energy","Better sleep","Nutrition","Movement","Mindfulness","Consistency","Feeling more confident"]},
  {tab:"Wellness",key:"__lifestyleGroup",type:"group",q:"A few quick lifestyle details"},
  {tab:"Wellness",key:"__healthGroup",type:"group",q:"Health background"},
  {tab:"Habits",key:"routineConsistency",type:"single",q:"How consistent are your daily routines?",opts:["I am just starting","Sometimes consistent","Mostly consistent","Very consistent"]},
  {tab:"Habits",key:"hydrationHabit",type:"single",q:"How would you describe your hydration habits?",opts:["I forget often","Somewhat inconsistent","Usually okay","Very consistent"]},
  {tab:"Habits",key:"selfCare",type:"single",q:"How often do you make time for yourself?",opts:["Rarely","Sometimes","A few times a week","Almost every day"]},
  {tab:"Habits",key:"journaling",type:"single",q:"Do you enjoy journaling or reflecting?",opts:["Yes, regularly","Sometimes","I'd like to start","Not really"]},
  {tab:"Habits",key:"habitGoals",type:"multi",q:"What kind of habits would you like to build?",opts:["Skincare","Hydration","Movement","Nutrition","Sleep","Journaling","Mindfulness","Consistency"]},
];
const QUIZ_TABS=["Skin","Wellness","Habits"];
const ONBOARD_COUNTRIES=["India","United States","United Kingdom","Canada","Australia","United Arab Emirates","Singapore","Germany","Other"];
const CARD_WRAP={width:"100%",maxWidth:440};

/* Kept at module scope (not defined inside Onboarding's render) so they
   stay the same component identity across re-renders — otherwise React
   would remount this subtree, and every keystroke in the Basic Profile
   inputs would drop focus. */
const OnboardOption=({label,selected,onClick})=>(
  <div role="checkbox" aria-checked={selected} tabIndex={0} className="kb-focusable"
    onClick={onClick} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onClick();}}}
    style={{padding:"13px 16px",borderRadius:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,
      background:selected?LIGHT_T.coral:LIGHT_T.cream,border:`1px solid ${selected?LIGHT_T.coral:LIGHT_T.border}`,transition:"all .2s"}}>
    <span style={{fontSize:14,fontWeight:selected?600:500,color:selected?"#fff":LIGHT_T.txt}}>{label}</span>
    {selected&&<Ic n="ok" s={14} c="#fff"/>}
  </div>
);
const OnboardChip=({label,selected,onClick,i})=>{
  const [c1,c2]=CHIP_GRADIENTS[i%CHIP_GRADIENTS.length];
  return(
    <div role="checkbox" aria-checked={selected} tabIndex={0} className="kb-focusable"
      onClick={onClick} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onClick();}}}
      style={{padding:"9px 16px",borderRadius:24,cursor:"pointer",fontSize:13,fontWeight:600,transition:"all .2s",
        background:selected?`linear-gradient(135deg,${c1},${c2})`:LIGHT_T.cream,color:selected?"#fff":LIGHT_T.txt,
        border:`1px solid ${selected?"transparent":LIGHT_T.border}`}}>{label}</div>
  );
};

const Onboarding=({onDone})=>{
  const t=LIGHT_T;
  /* profile → intro → quiz → avatar → finish — a distinct stage per the
     brief's five moments (Basics / Skin / Wellness / Habits / Avatar /
     Ready), never mixed together on one screen. */
  const [stage,setStage]=useState("profile");
  const [qIndex,setQIndex]=useState(0);
  const [avatarId,setAvatarId]=useState(null);
  const [d,setD]=useState({
    name:"",age:"",country:"",height:"",weight:"",skipBodyMetrics:false,gender:"",
    diet:"Vegetarian",water:"6-8 glasses",sleep:"7-8 hrs",stress:"Moderate",
    pcos:false,pcod:false,thyroid:false,diabetes:false,noneConditions:false,
    menstrualTracking:false,cycleLength:"28",
    skinType:"",skinGoal:[],skincareRoutine:"",sunscreen:"",
    energy:"",sleepQuality:"",nutritionFocus:[],movement:"",wellnessGoal:[],
    routineConsistency:"",hydrationHabit:"",selfCare:"",journaling:"",habitGoals:[],
  });
  const upd=(k,v)=>setD(p=>({...p,[k]:v}));
  const toggleMulti=(k,val)=>setD(p=>({...p,[k]:p[k].includes(val)?p[k].filter(x=>x!==val):[...p[k],val]}));
  /* Health-conditions checkboxes stay mutually exclusive with "None of
     these" — picking a real condition clears "None", picking "None"
     clears every real condition. */
  const CONDITION_KEYS=["pcos","pcod","thyroid","diabetes"];
  const toggleCondition=k=>setD(p=>{
    if(k==="noneConditions"){
      const next={...p,noneConditions:!p.noneConditions};
      if(next.noneConditions)CONDITION_KEYS.forEach(ck=>{next[ck]=false;});
      return next;
    }
    const next={...p,[k]:!p[k]};
    if(next[k])next.noneConditions=false;
    return next;
  });

  const profileValid=d.name.trim().length>0&&String(d.age).trim().length>0;
  const cur=QUIZ_QUESTIONS[qIndex];
  const tabCount=tab=>QUIZ_QUESTIONS.filter(x=>x.tab===tab).length;
  const posInTab=cur?QUIZ_QUESTIONS.slice(0,qIndex+1).filter(x=>x.tab===cur.tab).length:0;
  const overallPct=Math.round(((qIndex+1)/QUIZ_QUESTIONS.length)*100);

  const goNext=()=>{ if(qIndex<QUIZ_QUESTIONS.length-1)setQIndex(i=>i+1); else setStage("avatar"); };
  const goBack=()=>{ if(qIndex>0)setQIndex(i=>i-1); else setStage("intro"); };
  const jumpTab=tab=>{ const idx=QUIZ_QUESTIONS.findIndex(x=>x.tab===tab); if(idx>=0)setQIndex(idx); };
  const nextLabel=()=>{ const nxt=QUIZ_QUESTIONS[qIndex+1]; if(!nxt)return "Continue"; return nxt.tab!==cur.tab?`Continue to ${nxt.tab}`:"Continue"; };
  const isAnswered=cur&&(cur.type==="single"?!!d[cur.key]:cur.type==="multi"?d[cur.key].length>0:true);
  const backFromAvatar=()=>{ setStage("quiz"); setQIndex(QUIZ_QUESTIONS.length-1); };
  const finishOnboarding=()=>onDone({...d,avatarId});

  return(
    <>
      {stage==="profile"&&(
        <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:GINGHAM}}>
          <div style={CARD_WRAP}>
            <div style={{textAlign:"center",marginBottom:20}}>
              <h2 className="cf" style={{fontSize:24,fontWeight:600,color:t.txt,marginBottom:8}}>First, the basics.</h2>
              <p style={{fontSize:13,color:t.muted,lineHeight:1.6}}>A few little details help us make Sumi feel more like yours.</p>
            </div>
            <div className="glass" style={{padding:"26px 24px",borderRadius:24,background:"var(--card)",display:"flex",flexDirection:"column",gap:14}}>
              <div>
                <label style={{fontSize:11,color:t.muted,display:"block",marginBottom:5}}>What would you like us to call you?</label>
                <input className="inp" placeholder="Your name" value={d.name} onChange={e=>upd("name",e.target.value)}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div>
                  <label style={{fontSize:11,color:t.muted,display:"block",marginBottom:5}}>How old are you?</label>
                  <input className="inp" placeholder="Age" type="number" value={d.age} onChange={e=>upd("age",e.target.value)}/>
                </div>
                <div>
                  <label style={{fontSize:11,color:t.muted,display:"block",marginBottom:5}}>Where are you based?</label>
                  <select className="sel" value={d.country} onChange={e=>upd("country",e.target.value)}>
                    <option value="">Select</option>
                    {ONBOARD_COUNTRIES.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,opacity:d.skipBodyMetrics?.5:1}}>
                <div>
                  <label style={{fontSize:11,color:t.muted,display:"block",marginBottom:5}}>Height (cm)</label>
                  <input className="inp" placeholder="e.g. 162" type="number" disabled={d.skipBodyMetrics} value={d.height} onChange={e=>upd("height",e.target.value)}/>
                </div>
                <div>
                  <label style={{fontSize:11,color:t.muted,display:"block",marginBottom:5}}>Weight (kg)</label>
                  <input className="inp" placeholder="e.g. 58" type="number" disabled={d.skipBodyMetrics} value={d.weight} onChange={e=>upd("weight",e.target.value)}/>
                </div>
              </div>
              <div role="checkbox" aria-checked={d.skipBodyMetrics} tabIndex={0} className="kb-focusable" onClick={()=>setD(p=>({...p,skipBodyMetrics:!p.skipBodyMetrics,height:!p.skipBodyMetrics?"":p.height,weight:!p.skipBodyMetrics?"":p.weight}))} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setD(p=>({...p,skipBodyMetrics:!p.skipBodyMetrics,height:!p.skipBodyMetrics?"":p.height,weight:!p.skipBodyMetrics?"":p.weight}));}}}
                style={{display:"flex",alignItems:"center",gap:9,cursor:"pointer",marginTop:-4}}>
                <div style={{width:16,height:16,borderRadius:5,background:d.skipBodyMetrics?t.coral:"transparent",border:`1.5px solid ${d.skipBodyMetrics?t.coral:t.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{d.skipBodyMetrics&&<Ic n="ok" s={10} c="#fff"/>}</div>
                <span style={{fontSize:12,color:t.muted}}>Prefer not to share height & weight</span>
              </div>
              <button className="btn" disabled={!profileValid} onClick={()=>setStage("intro")} style={{marginTop:4}}>Continue</button>
              {!profileValid&&<p style={{fontSize:11,color:t.soft,textAlign:"center"}}>Your name and age help us get started.</p>}
            </div>
          </div>
        </div>
      )}

      {stage==="intro"&&(
        <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:GINGHAM}}>
          <div style={CARD_WRAP}>
            <div className="glass" style={{padding:"34px 26px",borderRadius:24,background:"var(--card)",textAlign:"center"}}>
              <h2 className="cf" style={{fontSize:23,fontWeight:600,color:t.txt,marginBottom:10}}>Now let's make Sumi yours.</h2>
              <p style={{fontSize:13,color:t.muted,lineHeight:1.7,marginBottom:22}}>A few quick questions about your skin, wellbeing and everyday habits will help personalize your journey.</p>
              <div style={{display:"flex",justifyContent:"center",gap:10,marginBottom:22,flexWrap:"wrap"}}>
                {QUIZ_TABS.map(tb=><span key={tb} style={{fontSize:12,fontWeight:600,color:t.wine,background:t.cream,border:`1px solid ${t.border}`,borderRadius:20,padding:"6px 14px"}}>{tb}</span>)}
              </div>
              <button className="btn" onClick={()=>{setQIndex(0);setStage("quiz");}} style={{width:"100%"}}>Let's begin</button>
            </div>
          </div>
        </div>
      )}

      {stage==="quiz"&&cur&&(
        <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px 20px",background:GINGHAM}}>
          <div style={CARD_WRAP}>
            <div style={{display:"flex",gap:8,marginBottom:14,justifyContent:"center"}}>
              {QUIZ_TABS.map(tb=>(
                <button key={tb} onClick={()=>jumpTab(tb)} style={{padding:"8px 16px",borderRadius:14,fontSize:12.5,fontWeight:600,border:"none",cursor:"pointer",
                  background:cur.tab===tb?t.coral:t.cream,color:cur.tab===tb?"#fff":t.muted,transition:"all .2s"}}>{tb}</button>
              ))}
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <span style={{fontSize:11.5,color:t.muted}}>{cur.tab} · {posInTab} of {tabCount(cur.tab)}</span>
              <span style={{fontSize:11.5,color:t.wine,fontWeight:700}}>{overallPct}%</span>
            </div>
            <div className="pbar" style={{marginBottom:18}}><div className="pfill" style={{width:`${overallPct}%`,background:`linear-gradient(90deg,${t.coral},${t.rose})`}}/></div>

            <div className="glass" style={{padding:"26px 24px",borderRadius:24,background:"var(--card)"}}>
              <span style={{fontSize:10.5,fontWeight:700,letterSpacing:".08em",color:t.gold,textTransform:"uppercase"}}>{cur.tab}</span>
              <h2 className="cf" style={{fontSize:20,fontWeight:600,color:t.txt,margin:"6px 0 4px"}}>{cur.q}</h2>
              {cur.sub&&<p style={{fontSize:12,color:t.muted,marginBottom:6}}>{cur.sub}</p>}

              <div style={{marginTop:16,marginBottom:6}}>
                {cur.type==="single"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:9}}>
                    {cur.opts.map(o=><OnboardOption key={o} label={o} selected={d[cur.key]===o} onClick={()=>upd(cur.key,o)}/>)}
                  </div>
                )}
                {cur.type==="multi"&&(
                  <div style={{display:"flex",flexWrap:"wrap",gap:9}}>
                    {cur.opts.map((o,i)=><OnboardChip key={o} label={o} i={i} selected={d[cur.key].includes(o)} onClick={()=>toggleMulti(cur.key,o)}/>)}
                  </div>
                )}
                {cur.key==="__lifestyleGroup"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:13}}>
                    {[{label:"Diet preference",key:"diet",opts:["Vegetarian","Vegan","Non-Vegetarian","Eggetarian"]},
                      {label:"Daily water intake",key:"water",opts:["< 4 glasses","4-6 glasses","6-8 glasses","8+ glasses"]},
                      {label:"Sleep duration",key:"sleep",opts:["< 5 hrs","5-6 hrs","7-8 hrs","8+ hrs"]},
                      {label:"Stress level",key:"stress",opts:["Low","Moderate","High","Very High"]}].map(f=>(
                      <div key={f.key}>
                        <label style={{fontSize:11,color:t.muted,display:"block",marginBottom:5}}>{f.label}</label>
                        <select className="sel" value={d[f.key]} onChange={e=>upd(f.key,e.target.value)}>{f.opts.map(o=><option key={o}>{o}</option>)}</select>
                      </div>
                    ))}
                  </div>
                )}
                {cur.key==="__healthGroup"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:9}}>
                    <p style={{fontSize:12,color:t.muted,marginBottom:2}}>Completely optional. Select any that apply.</p>
                    {[{k:"pcos",l:"PCOS",desc:"Affects hormones & skin"},{k:"pcod",l:"PCOD",desc:"Hormonal skin effects"},{k:"thyroid",l:"Thyroid disorder",desc:"Affects texture & hydration"},{k:"diabetes",l:"Diabetes",desc:"Affects barrier & healing"}].map(c=>(
                      <div key={c.k} role="checkbox" aria-checked={!!d[c.k]} tabIndex={0} className="kb-focusable" onClick={()=>toggleCondition(c.k)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggleCondition(c.k);}}}
                        style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",borderRadius:14,cursor:"pointer",background:d[c.k]?t.coral:t.cream,border:`1px solid ${d[c.k]?t.coral:t.border}`}}>
                        <div style={{width:19,height:19,borderRadius:6,background:d[c.k]?"#fff":"transparent",border:`1.5px solid ${d[c.k]?"#fff":t.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{d[c.k]&&<Ic n="ok" s={11} c={t.coral}/>}</div>
                        <div><div style={{fontSize:13.5,fontWeight:500,color:d[c.k]?"#fff":t.txt}}>{c.l}</div><div style={{fontSize:11,color:d[c.k]?"rgba(255,255,255,.85)":t.muted}}>{c.desc}</div></div>
                      </div>
                    ))}
                    <div role="checkbox" aria-checked={d.noneConditions} tabIndex={0} className="kb-focusable" onClick={()=>toggleCondition("noneConditions")} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggleCondition("noneConditions");}}}
                      style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",borderRadius:14,cursor:"pointer",background:d.noneConditions?t.coral:t.cream,border:`1px dashed ${d.noneConditions?t.coral:t.border}`}}>
                      <div style={{width:19,height:19,borderRadius:6,background:d.noneConditions?"#fff":"transparent",border:`1.5px solid ${d.noneConditions?"#fff":t.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{d.noneConditions&&<Ic n="ok" s={11} c={t.coral}/>}</div>
                      <div style={{fontSize:13.5,fontWeight:500,color:d.noneConditions?"#fff":t.txt}}>None of these</div>
                    </div>
                    <div role="checkbox" aria-checked={d.menstrualTracking} tabIndex={0} className="kb-focusable" onClick={()=>upd("menstrualTracking",!d.menstrualTracking)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();upd("menstrualTracking",!d.menstrualTracking);}}}
                      style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",borderRadius:14,cursor:"pointer",background:d.menstrualTracking?t.coral:t.cream,border:`1px solid ${d.menstrualTracking?t.coral:t.border}`,marginTop:4}}>
                      <div style={{width:19,height:19,borderRadius:6,background:d.menstrualTracking?"#fff":"transparent",border:`1.5px solid ${d.menstrualTracking?"#fff":t.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{d.menstrualTracking&&<Ic n="ok" s={11} c={t.coral}/>}</div>
                      <div><div style={{fontSize:13.5,fontWeight:500,color:d.menstrualTracking?"#fff":t.txt}}>Track menstrual cycle</div><div style={{fontSize:11,color:d.menstrualTracking?"rgba(255,255,255,.85)":t.muted}}>Hormonal skin insights around your cycle</div></div>
                    </div>
                    {d.menstrualTracking&&(
                      <div style={{padding:"12px 14px",borderRadius:14,background:t.cream,border:`1px solid ${t.border}`}}>
                        <label style={{fontSize:12,color:t.txt,fontWeight:500,display:"block",marginBottom:6}}>How long is your cycle usually?</label>
                        <select className="sel" value={d.cycleLength} onChange={e=>upd("cycleLength",e.target.value)}>
                          {Array.from({length:22},(_,i)=>21+i).map(n=><option key={n} value={n}>{n} days</option>)}
                          <option value="unsure">Not sure</option>
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{display:"flex",gap:11,marginTop:22}}>
                <button className="btn-o" onClick={goBack} style={{flex:1}}>Back</button>
                <button className="btn" onClick={goNext} style={{flex:2}}>{nextLabel()}</button>
              </div>
              {cur.type!=="group"&&!isAnswered&&(
                <p role="button" tabIndex={0} className="kb-focusable" onClick={goNext} onKeyDown={e=>{if(e.key==="Enter"||e.key===" ")goNext();}}
                  style={{fontSize:11.5,color:t.muted,textAlign:"center",marginTop:10,cursor:"pointer",textDecoration:"underline",textUnderlineOffset:3}}>Skip for now</p>
              )}
            </div>
          </div>
        </div>
      )}

      {stage==="avatar"&&(
        <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:GINGHAM}}>
          <div style={CARD_WRAP}>
            <div className="glass" style={{padding:"30px 26px",borderRadius:24,background:"var(--card)",textAlign:"center"}}>
              <h2 className="cf" style={{fontSize:22,fontWeight:600,color:t.txt,marginBottom:8}}>Choose your Sumi avatar</h2>
              <p style={{fontSize:12.5,color:t.muted,lineHeight:1.6,marginBottom:20}}>Pick the one that feels like you. You can always change this later.</p>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:22}}>
                {AVATARS.map((src,i)=>(
                  <button key={i} onClick={()=>setAvatarId(i)} aria-label={`Avatar ${i+1}`} aria-pressed={avatarId===i}
                    style={{padding:0,border:avatarId===i?`2.5px solid ${t.coral}`:"2.5px solid transparent",borderRadius:"50%",background:"none",cursor:"pointer",lineHeight:0,boxShadow:avatarId===i?`0 0 0 4px ${t.blush}`:"none",transition:"all .2s"}}>
                    <img src={src} alt="" style={{width:"100%",aspectRatio:"1",borderRadius:"50%",objectFit:"cover",display:"block"}}/>
                  </button>
                ))}
              </div>
              <div style={{display:"flex",gap:11}}>
                <button className="btn-o" onClick={backFromAvatar} style={{flex:1}}>Back</button>
                <button className="btn" onClick={()=>setStage("finish")} style={{flex:2}}>Continue</button>
              </div>
              <p role="button" tabIndex={0} className="kb-focusable" onClick={()=>setStage("finish")} onKeyDown={e=>{if(e.key==="Enter"||e.key===" ")setStage("finish");}}
                style={{fontSize:11.5,color:t.muted,textAlign:"center",marginTop:12,cursor:"pointer",textDecoration:"underline",textUnderlineOffset:3}}>Choose later</p>
            </div>
          </div>
        </div>
      )}

      {stage==="finish"&&(
        <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:GINGHAM}}>
          <div style={CARD_WRAP}>
            <div className="glass" style={{padding:"36px 28px",borderRadius:24,background:"var(--card)",textAlign:"center"}}>
              {avatarId!=null?
                <img src={AVATARS[avatarId]} alt="" style={{width:88,height:88,borderRadius:"50%",objectFit:"cover",border:`2px solid ${t.border}`,margin:"0 auto 18px"}}/>
                :<div style={{marginBottom:18,display:"flex",justifyContent:"center"}}><AuraLogo size={64}/></div>
              }
              <h2 className="cf" style={{fontSize:24,fontWeight:600,color:t.txt,marginBottom:10}}>Your Sumi is ready.</h2>
              <p style={{fontSize:13,color:t.muted,lineHeight:1.7,marginBottom:24}}>We've got a better idea of what matters to you. Let's build your journey from here.</p>
              <button className="btn" onClick={finishOnboarding} style={{width:"100%"}}>Enter Sumi</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

/* Small, page-integrated AI guidance element for the Skin Analysis page.
   Replaces the global floating avatar/bubble on this screen specifically:
   sits inline in the normal flow (never fixed/floating), uses the
   uploaded Sumi AI companion face, and expands in place when tapped
   instead of popping a bubble over the page. */
/* ═══════════════════════════════════════════════════════════════════
   SKIN CONCERN QUIZ — configurable question structure
   Kept as one plain array (rather than dozens of hardcoded components)
   so future editing — adding, removing, or re-wording a question — is a
   one-line change here, never a new component. Each question is either
   "single" (one answer), "multi" (multi-select), or "text" (free-form).
   `showIf(answers)` implements the quiz's conditional logic: a question
   only appears once the answers so far make it relevant, so someone who
   says they rarely break out is never shown five more acne questions.
═══════════════════════════════════════════════════════════════════ */
const SKIN_QUIZ_QUESTIONS=[
  {id:"cleanFeel",section:"Skin type",type:"single",q:"How does your skin usually feel a few hours after cleansing?",options:["Comfortable","Tight or dry","Shiny","Shiny in some areas","Not sure"]},
  {id:"pores",section:"Skin type",type:"single",q:"How would you describe your pores?",options:["Barely visible","More visible around my nose","Visible across my face","Not sure"]},
  {id:"concerns",section:"Main concerns",type:"multi",q:"What are you most concerned about right now?",sub:"Select as many as apply.",options:["Acne / breakouts","Dark spots","Uneven skin tone","Dryness","Excess oil","Redness","Texture","Visible pores","Dullness","Sensitivity","Fine lines","Under-eye concerns"]},
  {id:"breakoutFreq",section:"Breakouts",type:"single",q:"How often do you experience breakouts?",options:["Rarely","Occasionally","Frequently","Almost constantly"],
    showIf:a=>a.concerns?.includes("Acne / breakouts")},
  {id:"breakoutZones",section:"Breakouts",type:"multi",q:"Where do you usually notice them?",sub:"Select as many as apply.",options:["Forehead","Cheeks","Nose","Chin","Jawline","Around the mouth","Other"],
    showIf:a=>a.concerns?.includes("Acne / breakouts")&&a.breakoutFreq&&a.breakoutFreq!=="Rarely"},
  {id:"drynessFeel",section:"Dryness & hydration",type:"single",q:"Does your skin ever feel tight after cleansing?",options:["Never","Sometimes","Often","Almost always"],
    showIf:a=>a.concerns?.includes("Dryness")||a.cleanFeel==="Tight or dry"},
  {id:"flaky",section:"Dryness & hydration",type:"single",q:"Do you notice flaky or rough areas?",options:["Never","Sometimes","Often","Not sure"],
    showIf:a=>a.concerns?.includes("Dryness")||a.cleanFeel==="Tight or dry"},
  {id:"midday",section:"Oiliness",type:"single",q:"How does your skin usually look by midday?",options:["Comfortable","Slightly shiny","Quite oily","Oily mainly around my T-zone","Very dry","Not sure"]},
  {id:"sensitivityFreq",section:"Sensitivity",type:"single",q:"How often does your skin react to new products?",options:["Rarely","Sometimes","Often","Almost every time"]},
  {id:"sensitivitySymptoms",section:"Sensitivity",type:"multi",q:"When your skin reacts, what do you usually notice?",sub:"Select as many as apply. These are observations, not a diagnosis.",options:["Stinging","Burning","Itching","Redness","Tightness","Not sure"],
    showIf:a=>a.sensitivityFreq&&a.sensitivityFreq!=="Rarely"},
  {id:"improve",section:"Texture & tone",type:"multi",q:"What would you most like to improve about your skin's appearance?",sub:"Select as many as apply.",options:["Smoother-looking texture","More even-looking tone","Brighter-looking complexion","Less visible pores","Fewer visible blemishes","More hydrated-looking skin"]},
  {id:"routineFreq",section:"Current routine",type:"single",q:"How often do you currently follow a skincare routine?",options:["Every day","Most days","Sometimes","Rarely","I don't have one yet"]},
  {id:"currentProducts",section:"Current routine",type:"multi",q:"What products are you currently using?",sub:"Select as many as apply.",options:["Cleanser","Moisturizer","Sunscreen","Serum","Exfoliant","Retinoid","Acne treatment","Face oil","Other"],
    showIf:a=>a.routineFreq&&a.routineFreq!=="I don't have one yet"},
  {id:"hydration",section:"Lifestyle context",type:"single",q:"How would you describe your daily water intake?",options:["Very low","Low","Moderate","High","Not sure"]},
  {id:"sleep",section:"Lifestyle context",type:"single",q:"How would you describe your sleep lately?",options:["Very inconsistent","Somewhat inconsistent","Mostly regular","Very regular"]},
  {id:"other",section:"Anything else",type:"text",q:"Anything else you'd like Sumi to know?",sub:"Tell us about any other skin concern, change, reaction, or detail you haven't mentioned.",placeholder:"Write anything you'd like Sumi to consider..."},
];
/* Conditional logic lives here, in one place, rather than scattered
   through the UI — the quiz component just renders whatever this
   returns, in order, so adding a new showIf rule never touches the
   rendering code. */
const getVisibleQuizQuestions=(answers)=>SKIN_QUIZ_QUESTIONS.filter(q=>!q.showIf||q.showIf(answers));
/* A short, human-readable recap of what was answered — powers the "What
   You Told Sumi" summary on the result screen, and prefills the quiz
   when the person chooses "Edit My Answers". */
const summarizeQuizAnswers=(answers)=>getVisibleQuizQuestions(answers).filter(q=>q.type!=="text").map(q=>{
  const v=answers[q.id];
  if(v==null||v==="")return null;
  return{q:q.q,a:Array.isArray(v)?v.join(", "):v};
}).filter(Boolean);

const SkinAICompanion=({msg,expanded:extra})=>{
  const [open,setOpen]=useState(false);
  return(
    <div className="sm-card flat tight kb-focusable" role="button" tabIndex={0} aria-expanded={open} onClick={()=>setOpen(o=>!o)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setOpen(o=>!o);}}} style={{display:"flex",alignItems:"flex-start",gap:12,cursor:"pointer",background:"rgba(255,252,244,.55)"}}>
      <span style={{width:42,height:42,borderRadius:"50%",flexShrink:0,overflow:"hidden",border:"3px solid #FBF7EC",boxShadow:"0 3px 10px rgba(86,100,60,.18)",transform:"rotate(-4deg)"}}>
        <img src={AI_FACE} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
      </span>
      <div style={{minWidth:0,flex:1}}>
        <div style={{fontSize:11.5,fontWeight:700,letterSpacing:".04em",color:SM.pinkDeep,marginBottom:2}}>AI SUMI</div>
        <p style={{fontSize:13,color:"var(--txt)",lineHeight:1.6,fontStyle:"italic"}}>&ldquo;{msg}&rdquo;</p>
        {open&&extra&&<p style={{fontSize:12,color:"var(--muted)",lineHeight:1.6,marginTop:7,fontStyle:"italic"}}>&ldquo;{extra}&rdquo;</p>}
      </div>
      <span aria-hidden style={{fontSize:14,color:"var(--muted)",flexShrink:0,marginTop:1,transform:open?"rotate(180deg)":"none",transition:"transform .2s",lineHeight:1}}>⌄</span>
    </div>
  );
};

const SkinScan=({onResult,onNav,user,existingScans,prevQuizResult})=>{
  const [mode,setMode]=useState("upload");
  const [img,setImg]=useState(null);
  const [progress,setProgress]=useState(0);
  const [stepTxt,setStepTxt]=useState("");
  const [analyzing,setAnalyzing]=useState(false);
  const [err,setErr]=useState("");
  const [lastImg,setLastImg]=useState(null);
  const [doneResult,setDoneResult]=useState(null);
  const [doneImg,setDoneImg]=useState(null);
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
    stopCamera();setImg(data);setMode("preview");doAnalysis(data);
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
      const result=await Promise.race([runVisionAnalysis(imgData,user,prevScan,prevQuizResult),timeout]);
      /* Source transparency: if this person has a recent quiz-only
         analysis on file, this scan becomes a combined analysis rather
         than silently overwriting their reported concerns. Photo
         observations and self-reported ones are kept distinguishable —
         concerns are merged (photo-detected kept as-is, reported ones
         appended if not already covered) rather than one replacing the
         other outright. */
      if(prevQuizResult){
        result.source="combined";
        result.quizResponses=prevQuizResult.quizResponses;
        const photoNames=new Set((result.concerns||[]).map(c=>c.name));
        const reportedOnly=(prevQuizResult.concerns||[]).filter(c=>!photoNames.has(c.name));
        if(reportedOnly.length)result.concerns=[...(result.concerns||[]),...reportedOnly].slice(0,6);
        result.observations=[...(prevQuizResult.observations||[]).slice(0,2),...(result.observations||[])];
      }else{
        result.source="photo_scan";
      }
      clearInterval(ticker);setProgress(100);setStepTxt("Your insights are ready");
      recordActivity("scan");
      setTimeout(()=>{
        onResult(result,imgData,{navigate:false});
        setDoneResult(result);setDoneImg(imgData);
        setAnalyzing(false);
      },800);
    }catch(e){
      clearInterval(ticker);
      console.error("[Sumi Scan]",e?.message,new Date().toISOString());
      let msg=e?.message==="timeout"?"The analysis is taking longer than expected. Please try again with a clear, well-lit photo.":friendlyAIError(e);
      if(e?.status===413)msg="This photo is too large. Please try a smaller image.";
      setErr(msg);setAnalyzing(false);setProgress(0);
    }
  },[user,onResult,existingScans]);

  const resetScan=()=>{setImg(null);setMode("upload");setDoneResult(null);setDoneImg(null);setErr("");};

  if(analyzing)return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"65vh",padding:24}}>
      <div className="sm-card sage" style={{padding:"44px 40px",borderRadius:30,textAlign:"center",maxWidth:400,width:"100%"}}>
        <div style={{position:"relative",width:140,height:140,margin:"0 auto 24px"}}>
          <svg width="140" height="140" style={{transform:"rotate(-90deg)"}} aria-hidden>
            <circle cx="70" cy="70" r="60" fill="rgba(255,252,244,.6)" stroke="rgba(127,154,102,.25)" strokeWidth="8"/>
            <circle cx="70" cy="70" r="60" fill="none" stroke={SM.pink} strokeWidth="8" strokeDasharray="377" strokeDashoffset={377-(progress/100)*377} strokeLinecap="round" style={{transition:"stroke-dashoffset .4s"}}/>
          </svg>
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><span className="cf" style={{fontSize:32,fontWeight:600,color:"var(--txt)"}}>{progress}%</span></div>
          <span aria-hidden style={{position:"absolute",top:-4,right:2,fontSize:18,animation:"bubbleFloat 3s ease-in-out infinite"}}>🌿</span>
        </div>
        <h3 className="cf" style={{fontSize:22,marginBottom:9,fontWeight:600,color:"var(--txt)"}}>Reading your skin...</h3>
        <p style={{color:"var(--muted)",fontSize:12,marginBottom:10,lineHeight:1.6}}>Looking at visible skin patterns, texture and overall appearance.</p>
        <p role="status" aria-live="polite" style={{color:SM.sageDeep,fontSize:13,marginBottom:4,minHeight:20,fontWeight:500}}>{stepTxt}</p>
        <p style={{color:"var(--muted)",fontSize:11}}>This usually takes under a minute</p>
      </div>
    </div>
  );

  if(doneResult){
    const overall=doneResult.overallScore||68;
    const cats=(doneResult.concerns?.length?doneResult.concerns.slice(0,4).map(c=>({label:c.name,desc:c.description||`${c.severity||"Moderate"} presence noticed in this scan.`,tone:c.severity==="Low"?SM.sage:c.severity==="High"?SM.red:SM.pink})):[
      {label:"Hydration",desc:`Hydration reading of ${doneResult.hydrationLevel||62} out of 100.`,tone:SM.sage},
      {label:"Elasticity",desc:`Elasticity reading of ${doneResult.elasticity||71} out of 100.`,tone:SM.pink},
      {label:"Brightness",desc:`Brightness reading of ${doneResult.brightness||60} out of 100.`,tone:SM.sageDeep},
    ]);
    return(
      <PageWrap max={640}>
        <PageHeader icon={FUNCTIONAL+"01_skin.png"} eyebrow="My skin" title="Skin Analysis" sub="Let's take a gentle look at your skin."/>
        <div className="sm-stack">
          <div className="sm-card deep" style={{textAlign:"center"}}>
            {doneImg&&<img src={doneImg} alt="" style={{width:88,height:88,borderRadius:"50%",objectFit:"cover",border:"4px solid #FBF7EC",boxShadow:"0 6px 18px rgba(86,100,60,.22)",margin:"0 auto 14px"}}/>}
            <div className="sm-eyebrow" style={{color:SM.sageDeep}}>Your skin read</div>
            <h2 className="cf" style={{fontSize:21,fontWeight:600,color:"var(--txt)",margin:"4px 0 8px"}}>Overall appearance: {overall}<span style={{fontSize:13,fontWeight:400,color:"var(--muted)"}}> / 100</span></h2>
            {doneResult.aiSummary&&<p style={{fontSize:12.5,color:"var(--txt)",lineHeight:1.65,maxWidth:420,margin:"0 auto"}}>{doneResult.aiSummary}</p>}
          </div>
          <div className="sm-stack" style={{gap:10}}>
            {cats.map(c=>(
              <div key={c.label} className="sm-card tight" style={{display:"flex",alignItems:"center",gap:12,borderLeft:`4px solid ${c.tone}`}}>
                <span style={{width:9,height:9,borderRadius:"50%",background:c.tone,flexShrink:0}}/>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:13.5,fontWeight:600,color:"var(--txt)"}}>{c.label}</div>
                  <div style={{fontSize:11.5,color:"var(--muted)",lineHeight:1.5}}>{c.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <button className="btn" onClick={()=>onNav?.("results")} style={{width:"100%"}}>View Full Skin Analysis</button>
          <button className="btn-o" onClick={resetScan} style={{width:"100%"}}>Scan again</button>
        </div>
      </PageWrap>
    );
  }

  const tips=[["spark","Natural light","Face a window, or stand in soft daylight."],["leaf","Clean skin","Avoid heavy makeup, filters, or harsh lighting."],["scan","Front-facing","Keep your face centered and clearly visible."]];
  const aiMsgs=AI_BUTTON_CONTEXT_MSGS.scan||["Want help taking your scan?","I can walk you through getting the best light for your scan."];
  return(
    <PageWrap max={640}>
      <PageHeader icon={FUNCTIONAL+"01_skin.png"} eyebrow="My skin" title="Skin Analysis" sub="Let's take a gentle look at your skin."/>
      {err&&<div style={{marginBottom:14}}><ErrorBox message={err} onRetry={lastImg?()=>doAnalysis(lastImg):null}/></div>}
      <div className="sm-stack">
        <div className="sm-card sage">
          <input ref={fileRef} type="file" accept="image/*" onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{setImg(ev.target.result);setMode("preview");};r.readAsDataURL(f);}} style={{display:"none"}}/>
          {mode==="upload"&&(
            <div style={{textAlign:"center",padding:"10px 6px"}}>
              <h3 className="cf" style={{fontSize:19,fontWeight:600,color:"var(--txt)",marginBottom:6}}>Ready for your skin check?</h3>
              <p style={{fontSize:12.5,color:"var(--muted)",lineHeight:1.6,marginBottom:20,maxWidth:340,marginLeft:"auto",marginRight:"auto"}}>Upload a clear photo in natural light for a more detailed read.</p>
              <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
                <button className="btn" onClick={()=>fileRef.current?.click()} style={{padding:"12px 26px"}}>Upload Photo</button>
                <button className="btn-o" onClick={startCamera} style={{padding:"11px 22px"}}>Use Camera</button>
              </div>
            </div>
          )}
          {mode==="preview"&&img&&(
            <div style={{textAlign:"center"}}>
              <img src={img} alt="Photo preview" style={{width:180,height:180,borderRadius:"50%",objectFit:"cover",border:"4px solid #FBF7EC",boxShadow:"0 8px 22px rgba(86,100,60,.2)",margin:"0 auto 12px"}}/>
              <p style={{fontSize:13,fontWeight:600,color:"var(--txt)",marginBottom:14}}>Photo ready</p>
              <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
                <button className="btn-o" onClick={()=>{setImg(null);setMode("upload");}} style={{fontSize:13}}>Retake</button>
                <button className="btn" onClick={()=>fileRef.current?.click()} style={{fontSize:13}}>Change Photo</button>
                <button className="btn" onClick={()=>doAnalysis(img)} style={{padding:"11px 28px",fontSize:14}}>Analyze My Skin</button>
              </div>
            </div>
          )}
          {mode==="camera"&&(
            <div style={{borderRadius:22,overflow:"hidden",position:"relative",background:"var(--petal)"}}>
              <video ref={vidRef} style={{width:"100%",maxHeight:360,objectFit:"cover",display:"block"}} playsInline autoPlay muted/>
              <div className="scan-anim"/>
              <canvas ref={canRef} style={{display:"none"}}/>
              <div style={{padding:"16px 14px 6px",display:"flex",alignItems:"center",justifyContent:"center",gap:22,background:"rgba(255,252,244,.85)"}}>
                <button aria-label="Cancel" onClick={()=>{stopCamera();setMode("upload");}} style={{width:44,height:44,borderRadius:"50%",border:"1px solid var(--border)",background:"var(--card)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Ic n="x" s={17} c="var(--muted)"/></button>
                <button aria-label="Capture and analyze" onClick={capturePhoto} style={{width:68,height:68,borderRadius:"50%",border:"4px solid #FBF7EC",background:SM.pinkDeep,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 6px 18px rgba(180,99,107,.4)"}}><Ic n="camera" s={26} c="#fff"/></button>
                <div style={{width:44}}/>
              </div>
              <p style={{textAlign:"center",fontSize:11,color:"var(--muted)",padding:"4px 0 12px",background:"rgba(255,252,244,.85)"}}>Tap the centre button to capture and analyze</p>
            </div>
          )}
        </div>

        <div className="sm-card">
          <h3 className="sm-card-title" style={{marginBottom:12}}>For a clearer read</h3>
          <div className="sm-stack" style={{gap:12}}>
            {tips.map(([ic,t,d])=>(
              <div key={t} className="sm-row" style={{alignItems:"flex-start"}}>
                <span className="sm-tile-ic" style={{width:36,height:36,borderRadius:12}}><Ic n={ic} s={17} c="currentColor"/></span>
                <div><div style={{fontSize:13.5,fontWeight:600,color:"var(--txt)"}}>{t}</div><div style={{fontSize:12,color:"var(--muted)",lineHeight:1.55}}>{d}</div></div>
              </div>
            ))}
          </div>
        </div>

        <SkinAICompanion msg={aiMsgs[0]} expanded={aiMsgs[1]}/>

        <Note icon="lock" tone="sage">Your photo is processed securely for this analysis. It is never shared or used to train AI models, and you can clear your scan history any time from Settings.</Note>
      </div>
      {existingScans?.length>0&&(
        <Section title="Previous scans" sub="Your most recent five" style={{marginTop:26,marginBottom:0}}>
          <div className="sm-scroll-x">
            {existingScans.slice(-5).reverse().map((s,i)=>(
              <div key={i} className="sm-stat" style={{flexShrink:0,minWidth:118,display:"flex",flexDirection:"column",gap:6}}>
                {s.thumb&&<img src={s.thumb} alt="" style={{width:"100%",height:70,objectFit:"cover",borderRadius:12}}/>}
                <div className="sm-stat-label">{s.date}</div>
                <div className="cf" style={{fontSize:20,fontWeight:600,color:"var(--txt)"}}>{s.overallScore}<small style={{fontFamily:"Nunito",fontSize:10.5,color:"var(--muted)",fontWeight:500,marginLeft:4}}>overall</small></div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </PageWrap>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   SKIN CONCERN QUIZ — the alternative input method to AI Skin Scan.
   Both feed the same shared SkinAnalysisProfile via onResult (see
   handleResult in App()), which normalizes either source into the same
   shape the rest of Sumi already consumes. Mirrors SkinScan's own
   internal states (intro → questions → analyzing → done) so both entry
   points feel like the same product rather than two different systems.
═══════════════════════════════════════════════════════════════════ */
const SkinQuiz=({onResult,onNav,user,prevPhotoResult,initialAnswers,onCancel})=>{
  const [started,setStarted]=useState(!!initialAnswers);
  const [answers,setAnswers]=useState(()=>initialAnswers||{});
  const [otherText,setOtherText]=useState(()=>initialAnswers?.other||"");
  const [idx,setIdx]=useState(0);
  const [analyzing,setAnalyzing]=useState(false);
  const [err,setErr]=useState("");
  const [done,setDone]=useState(null);

  const visible=getVisibleQuizQuestions(answers).filter(q=>q.type!=="text");
  const total=visible.length+1; // +1 for the trailing free-text step
  const isTextStep=idx>=visible.length;
  const q=isTextStep?null:visible[idx];

  const setAnswer=(id,val)=>setAnswers(a=>({...a,[id]:val}));
  const toggleMulti=(id,opt)=>setAnswers(a=>{
    const cur=Array.isArray(a[id])?a[id]:[];
    return{...a,[id]:cur.includes(opt)?cur.filter(x=>x!==opt):[...cur,opt]};
  });

  const canContinue=isTextStep?true:(q.type==="multi"?(answers[q.id]?.length>0):!!answers[q.id]);

  const goNext=()=>{
    if(isTextStep){runAnalysis();return;}
    const nextVisible=getVisibleQuizQuestions(answers).filter(x=>x.type!=="text");
    // Re-clamp in case answering this question hid/revealed later ones.
    setIdx(i=>Math.min(i+1,nextVisible.length));
  };
  const goBack=()=>setIdx(i=>Math.max(0,i-1));

  const runAnalysis=async()=>{
    setAnalyzing(true);setErr("");
    try{
      const timeout=new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),50000));
      const ai=await Promise.race([runQuizAnalysis(answers,otherText,user,prevPhotoResult),timeout]);
      const merged={
        ...ai,
        source:ai.source||(prevPhotoResult?"combined":"skin_quiz"),
        // Preserve photo-only numeric fields when this is a combined
        // analysis, so a scan the person already has isn't erased —
        // but never invent them for a quiz-only result.
        ...(prevPhotoResult?{overallScore:prevPhotoResult.overallScore,hydrationLevel:prevPhotoResult.hydrationLevel,elasticity:prevPhotoResult.elasticity,brightness:prevPhotoResult.brightness,heatZones:prevPhotoResult.heatZones,skinAge:prevPhotoResult.skinAge}:{}),
        quizResponses:{...answers,other:otherText},
        quizAnsweredAt:Date.now(),
      };
      recordActivity("quiz");
      setDone(merged);
      onResult(merged,prevPhotoResult?undefined:null,{navigate:false,keepImg:!!prevPhotoResult});
    }catch(e){
      const msg=e?.message==="timeout"?"That's taking longer than expected. Please try again.":friendlyAIError(e);
      setErr(msg);
    }finally{setAnalyzing(false);}
  };

  if(!started)return(
    <PageWrap max={640}>
      <PageHeader icon={SCRAP+"skin_quiz_icon.png"} eyebrow="My skin" title="Skin Quiz" sub="Tell Sumi what you've been noticing about your skin."/>
      <div className="sm-paper">
        <span className="sm-tape green"/>
        <div style={{textAlign:"center",padding:"6px 4px 2px"}}>
          <h2 className="cf" style={{fontSize:23,fontWeight:600,color:"var(--txt)",marginBottom:10}}>Let's get to know your skin.</h2>
          <p style={{fontSize:13.5,color:"var(--muted)",lineHeight:1.75,maxWidth:400,margin:"0 auto 22px"}}>Answer a few questions about what you've been noticing. There are no right or wrong answers — "not sure" is always okay.</p>
          <button className="btn" onClick={()=>setStarted(true)} style={{padding:"12px 30px"}}>Let's Begin</button>
        </div>
      </div>
      <Note icon="lock" tone="sage" style={{marginTop:16}}>Your answers are used to personalize your Sumi experience. You can edit or retake this quiz any time from Skin Analysis.</Note>
      {onCancel&&<button className="btn-text" onClick={onCancel} style={{display:"block",margin:"14px auto 0",color:"var(--muted)"}}>Back to Skin Analysis</button>}
    </PageWrap>
  );

  if(analyzing)return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"65vh",padding:24}}>
      <div className="sm-card sage" style={{padding:"44px 40px",borderRadius:30,textAlign:"center",maxWidth:400,width:"100%"}}>
        <span aria-hidden style={{fontSize:34,display:"block",marginBottom:14}}>🌿</span>
        <h3 className="cf" style={{fontSize:21,fontWeight:600,color:"var(--txt)",marginBottom:9}}>Reading what you've shared...</h3>
        <p style={{color:"var(--muted)",fontSize:12.5,lineHeight:1.7}}>Sumi is putting your answers together into a gentle, personalized read of your skin.</p>
      </div>
    </div>
  );

  if(done){
    const primary=done.primaryConcerns?.length?done.primaryConcerns:(done.concerns||[]).map(c=>c.name);
    const summary=summarizeQuizAnswers(answers);
    return(
      <PageWrap max={680}>
        <PageHeader icon={SCRAP+"skin_analysis.png"} eyebrow="My skin" title="Your Skin Snapshot" sub="Based on what you've shared with Sumi."/>
        <div className="sm-stack">
          <div className="sm-card deep" style={{textAlign:"center"}}>
            <div className="sm-eyebrow" style={{color:SM.sageDeep}}>Skin profile</div>
            <h2 className="cf" style={{fontSize:22,fontWeight:600,color:"var(--txt)",margin:"4px 0 10px"}}>{done.skinType||"Combination-leaning"}</h2>
            {primary.length>0&&(
              <div style={{display:"flex",gap:7,flexWrap:"wrap",justifyContent:"center",marginBottom:12}}>
                {primary.slice(0,5).map(c=><span key={c} className="sm-pill pink" style={{fontSize:11}}>{c}</span>)}
              </div>
            )}
            {done.aiSummary&&<p style={{fontSize:13,color:"var(--txt)",lineHeight:1.7,maxWidth:440,margin:"0 auto"}}>{done.aiSummary}</p>}
          </div>

          {summary.length>0&&(
            <div className="sm-card">
              <h3 className="sm-card-title" style={{marginBottom:10}}>What You Told Sumi</h3>
              <div className="sm-stack" style={{gap:9}}>
                {summary.slice(0,6).map((s,i)=>(
                  <div key={i} style={{fontSize:12,lineHeight:1.6}}>
                    <span style={{color:"var(--muted)"}}>{s.q}</span> <b style={{color:"var(--txt)"}}>{s.a}</b>
                  </div>
                ))}
                {otherText?.trim()&&<p className="sm-hand" style={{marginTop:6}}>"{otherText.trim()}"</p>}
              </div>
            </div>
          )}

          <div className="sm-card pink">
            <div className="sm-eyebrow" style={{color:SM.pinkDeep}}>Sumi's insight</div>
            <p style={{fontSize:13,color:"var(--txt)",lineHeight:1.8,marginTop:6}}>{done.routineNote||done.emotionalNote||"Thank you for sharing this. Every check-in helps Sumi understand your skin a little better."}</p>
          </div>

          {done.observations?.length>0&&(
            <div className="sm-card tight">
              <h3 className="sm-card-title" style={{marginBottom:8,fontSize:14}}>{done.source==="combined"?"Photo + quiz, together":"From your answers"}</h3>
              <div className="sm-stack" style={{gap:7}}>
                {done.observations.slice(0,5).map((o,i)=><p key={i} style={{fontSize:12,color:"var(--muted)",lineHeight:1.6}}>{o}</p>)}
              </div>
            </div>
          )}

          <button className="btn" onClick={()=>onNav?.("results")} style={{width:"100%"}}>Build My Skin Journey</button>
          <button className="btn-o" onClick={()=>{setDone(null);setStarted(false);setIdx(0);}} style={{width:"100%"}}>Retake Skin Quiz</button>
        </div>
      </PageWrap>
    );
  }

  // ── Active question card ──────────────────────────────────────────
  const dots=Array.from({length:total},(_,i)=>i);
  return(
    <PageWrap max={600}>
      <PageHeader icon={SCRAP+"skin_quiz_icon.png"} eyebrow="My skin" title="Skin Quiz" sub={q?.section||"Anything else"}/>
      {err&&<div style={{marginBottom:14}}><ErrorBox message={err} onRetry={runAnalysis}/></div>}
      <div style={{marginBottom:18}}>
        <div className="quiz-progress" aria-hidden style={{marginBottom:6}}>
          {dots.map(i=><span key={i} className={`quiz-dot${i===idx?" act":i<idx?" done":""}`}/>)}
        </div>
        <p style={{textAlign:"center",fontSize:11,color:"var(--muted)"}} role="status">{idx+1} / {total}</p>
      </div>

      <div key={isTextStep?"other":q.id} className="sm-card quiz-card">
        <h2 className="cf" style={{fontSize:18.5,fontWeight:600,color:"var(--txt)",marginBottom:isTextStep?8:(q.sub?4:16),lineHeight:1.4}}>
          {isTextStep?"Anything else you'd like Sumi to know?":q.q}
        </h2>
        {(isTextStep?SKIN_QUIZ_QUESTIONS.find(x=>x.id==="other").sub:q.sub)&&(
          <p style={{fontSize:12,color:"var(--muted)",marginBottom:16,lineHeight:1.6}}>{isTextStep?SKIN_QUIZ_QUESTIONS.find(x=>x.id==="other").sub:q.sub}</p>
        )}

        {isTextStep?(
          <textarea
            className="quiz-textarea"
            value={otherText}
            onChange={e=>setOtherText(e.target.value)}
            placeholder={SKIN_QUIZ_QUESTIONS.find(x=>x.id==="other").placeholder}
            aria-label="Anything else you'd like Sumi to know"
          />
        ):(
          <div>
            {q.type==="multi"&&<p style={{fontSize:11,color:SM.sageDeep,fontWeight:600,marginBottom:12,letterSpacing:".02em"}}>SELECT ALL THAT APPLY</p>}
            {q.options.map(opt=>{
              const selected=q.type==="multi"?(answers[q.id]||[]).includes(opt):answers[q.id]===opt;
              return(
                <button
                  key={opt}
                  type="button"
                  className={`quiz-opt${selected?" sel":""}`}
                  aria-pressed={selected}
                  onClick={()=>q.type==="multi"?toggleMulti(q.id,opt):setAnswer(q.id,opt)}
                >
                  <span className={`quiz-opt-check${q.type==="multi"?" sq":""}`}>{selected&&<Ic n="ok" s={12} c="#fff"/>}</span>
                  <span>{opt}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="sm-row" style={{justifyContent:"space-between",marginTop:18}}>
        {idx>0||onCancel?(
          <button className="btn-o" onClick={idx>0?goBack:onCancel}>Back</button>
        ):<span/>}
        <button className="btn" disabled={!canContinue} onClick={goNext} style={{opacity:canContinue?1:.5}}>
          {isTextStep?"See My Skin Analysis":"Continue"}
        </button>
      </div>
    </PageWrap>
  );
};

const Results=({results,img,user,onNav,scans,onQuiz})=>{
  const [tab,setTab]=useState("overview");
  if(!results)return(
    <PageWrap max={640}>
      <PageHeader icon={SCRAP+"skin_analysis.png"} eyebrow="Analysis report" title="Your Skin Report" sub="Everything from your latest scan, in one calm place."/>
      <EmptyState icon="chart" title="No analysis yet" message="Complete an AI Skin Scan or the Skin Quiz to see your personalized report and start your skin journal." actionLabel="Start Skin Analysis" onAction={()=>onNav("myskin")}/>
    </PageWrap>
  );
  const progress=computeProgress(scans);
  const sevTone={Low:{c:SM.sage,t:SM.sageDeep,cls:"sage"},Moderate:{c:SM.pink,t:SM.pinkDeep,cls:"pink"},High:{c:SM.red,t:SM.redDeep,cls:"red"}};
  const sev=(s)=>sevTone[s]||sevTone.Moderate;
  /* Photo-only numeric metrics (hydration/elasticity/brightness/overall)
     only exist when a photo was actually analyzed — a quiz-only profile
     never fabricates these, so every chart/tile that depends on them is
     hidden (never defaulted to a fake number) when they're absent. */
  const hasPhotoMetrics=results.hydrationLevel!=null&&results.elasticity!=null&&results.brightness!=null;
  const isQuizOnly=results.source==="skin_quiz";
  const isCombined=results.source==="combined";
  const sourceNote=isQuizOnly?"Based on your Skin Quiz":isCombined?"Based on your latest scan + quiz":results.source==="photo_scan"?"Based on your latest scan":null;
  const summary=results.quizResponses?summarizeQuizAnswers(results.quizResponses):[];
  const radar=hasPhotoMetrics?[{s:"Hydration",v:results.hydrationLevel},{s:"Brightness",v:results.brightness},{s:"Elasticity",v:results.elasticity},{s:"Clarity",v:100-(results.concerns?.find(c=>c.name==="Acne")?.confidence||40)},{s:"Evenness",v:results.overallScore||68}]:[];
  const zoneColor=(i)=>i==="High"?SM.red:i==="Medium"?SM.pink:SM.sage;
  const metrics=hasPhotoMetrics?[
    {key:"hydrationLevel",label:"Hydration",icon:"/sumi/skin-analysis/01_hydration.png",val:results.hydrationLevel,color:SM.sage},
    {key:"elasticity",label:"Elasticity",icon:"/sumi/skin-analysis/06_smoothness.png",val:results.elasticity,color:SM.pink},
    {key:"brightness",label:"Brightness",icon:"/sumi/skin-analysis/05_glow.png",val:results.brightness,color:SM.sageDeep},
  ]:[];
  const tooltipStyle={background:"#FFFCF3",border:"1px solid rgba(112,132,86,.3)",borderRadius:12,color:"#4E5138",fontSize:11,boxShadow:"0 6px 18px rgba(86,100,60,.14)"};
  const latestDate=scans?.length?scans[scans.length-1].date:null;
  const sections=[["overview","Overview"],["progress","Progress"],["concerns","Concerns"],...(hasPhotoMetrics?[["heatmap","Heat map"]]:[]),["forecast","Forecast"],["triggers","Triggers"],["routine","Routine"],...(summary.length?[["yours","Your Answers"]]:[])];
  return(
    <PageWrap max={980}>
      <PageHeader
        icon={SCRAP+"skin_analysis.png"}
        eyebrow="Analysis report"
        title="Your Skin Report"
        sub={[latestDate&&(sourceNote||`Scanned ${latestDate}`),results.skinType&&`${results.skinType} skin`].filter(Boolean).join(" · ")||"Your latest scan"}
        right={
          <div className="sm-row" style={{gap:8}}>
            {!isQuizOnly&&<button className="btn-o" onClick={()=>onNav("scan")} style={{display:"flex",alignItems:"center",gap:7,fontSize:12.5,padding:"9px 16px"}}><Ic n="camera" s={14} c="currentColor"/>New scan</button>}
            <button className="btn-o" onClick={()=>onQuiz?onQuiz(false):onNav("quiz")} style={{display:"flex",alignItems:"center",gap:7,fontSize:12.5,padding:"9px 16px"}}><Ic n="book" s={14} c="currentColor"/>{isQuizOnly?"Retake Quiz":"Take Quiz"}</button>
          </div>
        }
      />

      {results.emotionalNote&&<Note icon="heart" tone="pink" style={{marginBottom:16}}>{results.emotionalNote}</Note>}

      {/* Summary: overall ring + Sumi's read */}
      <div className="sm-split" style={{marginBottom:14}}>
        <div className="sm-card deep" style={{display:"flex",alignItems:"center",gap:22,flexWrap:"wrap",justifyContent:"center"}}>
          {results.overallScore!=null?<Ring score={results.overallScore} size={128} label="Overall balance" color={SM.sageDeep}/>
            :<div style={{width:128,height:128,borderRadius:"50%",border:"2px dashed rgba(127,154,102,.4)",display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center",padding:12}}><span style={{fontSize:11,color:"var(--muted)",lineHeight:1.5}}>Overall score needs a photo scan</span></div>}
          <div style={{display:"flex",flexDirection:"column",gap:10,minWidth:140}}>
            <div><div className="sm-stat-label" style={{color:"#4F6B3E"}}>Skin type</div><div className="cf" style={{fontSize:20,fontWeight:600,color:"var(--txt)"}}>{results.skinType||"—"}</div></div>
            <div><div className="sm-stat-label" style={{color:"#4F6B3E"}}>Skin age</div><div className="cf" style={{fontSize:20,fontWeight:600,color:"var(--txt)"}}>{results.skinAge||"—"}{user?.age?<small style={{fontFamily:"Nunito",fontSize:11.5,fontWeight:500,color:"#4F6B3E",marginLeft:6}}>you're {user.age}</small>:null}</div></div>
          </div>
        </div>
        <div className="sm-card pink">
          <div className="sm-eyebrow" style={{color:SM.pinkDeep}}>Sumi's read</div>
          <p style={{fontSize:13.5,color:"var(--txt)",lineHeight:1.85,marginTop:6}}>{results.aiSummary||"Your skin analysis is ready. Explore each tab for a closer look at your concerns, routine and forecast."}</p>
        </div>
      </div>

      {/* Metric tiles — only ever shown when actually measured from a photo */}
      {hasPhotoMetrics?(
        <div className="sm-grid g3" style={{marginBottom:22}}>
          {metrics.map(m=>{
            const d=progress.hasComparison?progress[m.key]?.value:null;
            return(
              <div key={m.key} className="sm-stat" style={{padding:"16px 18px"}}>
                <div className="sm-row" style={{justifyContent:"space-between",marginBottom:8}}>
                  <div className="sm-row"><img src={m.icon} alt="" style={{width:26,height:26,objectFit:"contain"}}/><span className="sm-stat-label">{m.label}</span></div>
                  {d!=null&&<Delta value={d} unit="%"/>}
                </div>
                <div className="sm-stat-value" style={{marginBottom:10}}>{m.val}<small>%</small></div>
                <Meter pct={m.val} color={m.color}/>
              </div>
            );
          })}
        </div>
      ):(
        <Note icon="camera" tone="cream" style={{marginBottom:22}}>Hydration, elasticity and brightness are read visually, so they'll appear here once you complete an AI Skin Scan. <button className="btn-text" onClick={()=>onNav("scan")} style={{padding:0,fontWeight:700}}>Scan now</button></Note>
      )}

      <div style={{marginBottom:18}}>
        <Seg label="Report sections" value={tab} onChange={setTab} tabs={sections}/>
      </div>

      {tab==="overview"&&(
        <div className="sm-grid g2 r-col">
          <div className="sm-card">
            <h3 className="sm-card-title">Skin radar</h3>
            <p className="sm-card-sub" style={{marginBottom:6}}>Five qualities, at a glance</p>
            {radar.length?(
              <ResponsiveContainer width="100%" height={230}><RadarChart data={radar}><PolarGrid stroke="rgba(127,154,102,.35)"/><PolarAngleAxis dataKey="s" tick={{fill:"#6E7A59",fontSize:11}}/><Radar dataKey="v" stroke={SM.sageDeep} strokeWidth={2} fill={SM.pink} fillOpacity={0.4}/></RadarChart></ResponsiveContainer>
            ):<p style={{fontSize:12.5,color:"var(--muted)",lineHeight:1.65,padding:"20px 0"}}>The skin radar needs a photo scan to measure hydration, brightness and elasticity visually.</p>}
          </div>
          <div className="sm-card">
            <h3 className="sm-card-title">Focus areas</h3>
            <p className="sm-card-sub" style={{marginBottom:14}}>How prominent each concern is in this scan</p>
            <div className="sm-stack" style={{gap:15}}>
              {results.concerns?.slice(0,5).map(c=>(
                <div key={c.name}>
                  <div className="sm-row" style={{justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontSize:13,color:"var(--txt)",fontWeight:500}}>{c.name}</span>
                    <span className={`sm-pill ${sev(c.severity).cls}`} style={{padding:"2px 9px",fontSize:10.5}}>{c.severity||"Moderate"}</span>
                  </div>
                  <Meter pct={c.confidence} color={sev(c.severity).c}/>
                </div>
              ))}
              {!results.concerns?.length&&<p style={{fontSize:13,color:"var(--muted)"}}>No specific concerns were flagged in this scan.</p>}
            </div>
          </div>
        </div>
      )}

      {tab==="progress"&&(
        <div className="sm-stack">
          {!progress.hasComparison?(
            <EmptyState icon="chart" title="One more scan to compare" message="Complete another scan and this tab will show exactly how your skin has changed since the last one." actionLabel="Scan again" onAction={()=>onNav("scan")}/>
          ):(
            <>
              <Note icon="calendar" tone="sage">Comparing your <b>{progress.latestDate}</b> scan with the one before it. {progress.scanCount} scans tracked since {progress.firstDate}.</Note>
              <div className="sm-grid g4">
                {[{key:"overallScore",label:"Overall",unit:""},{key:"hydrationLevel",label:"Hydration",unit:"%"},{key:"elasticity",label:"Elasticity",unit:"%"},{key:"brightness",label:"Brightness",unit:"%"}].map(({key,label,unit})=>{
                  const m=progress[key];
                  return(
                    <div key={key} className="sm-stat">
                      <div className="sm-stat-label">{label}</div>
                      <div className="sm-stat-value">{m.current}<small>{unit}</small></div>
                      <div style={{marginTop:8}}><Delta value={m.value} unit={unit} suffix=" since last"/></div>
                    </div>
                  );
                })}
              </div>
              {progress.concernTrend?.length>0&&(
                <div className="sm-card">
                  <h3 className="sm-card-title">Concern progress</h3>
                  <p className="sm-card-sub" style={{marginBottom:10}}>A lower number means the concern is less prominent than last time.</p>
                  {progress.concernTrend.map(c=>(
                    <div key={c.name} className="check-row" style={{justifyContent:"space-between"}}>
                      <span style={{fontSize:13,color:"var(--txt)"}}>{c.name}</span>
                      {c.prevChange==null?<span className="sm-delta flat">New</span>:<Delta value={c.prevChange} unit="%" lowerIsBetter/>}
                    </div>
                  ))}
                </div>
              )}
              <div className="sm-card">
                <h3 className="sm-card-title">Skin health timeline</h3>
                <p className="sm-card-sub" style={{marginBottom:10}}>Every scan, side by side</p>
                <ResponsiveContainer width="100%" height={230}>
                  <LineChart data={progress.series}>
                    <CartesianGrid strokeDasharray="3 4" stroke="rgba(127,154,102,.25)"/>
                    <XAxis dataKey="date" tick={{fill:"#6E7A59",fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:"#6E7A59",fontSize:10}} axisLine={false} tickLine={false}/>
                    <Tooltip contentStyle={tooltipStyle}/>
                    <Line type="monotone" dataKey="hydrationLevel" stroke={SM.sage} strokeWidth={2.4} dot={{r:3}} name="Hydration"/>
                    <Line type="monotone" dataKey="brightness" stroke={SM.pink} strokeWidth={2.4} dot={{r:3}} name="Brightness"/>
                    <Line type="monotone" dataKey="overallScore" stroke={SM.red} strokeWidth={2.4} dot={{r:3}} name="Overall"/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}

      {tab==="concerns"&&(
        results.concerns?.length?(
          <div className="sm-grid">
            {results.concerns.map(c=>(
              <div key={c.name} className="sm-card" style={{borderLeft:`4px solid ${sev(c.severity).c}`}}>
                <div className="sm-row" style={{justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                  <div><div className="cf" style={{fontSize:17,fontWeight:600,color:"var(--txt)"}}>{c.name}</div><span className={`sm-pill ${sev(c.severity).cls}`} style={{marginTop:6,padding:"2px 10px",fontSize:10.5}}>{c.severity||"Moderate"} severity</span></div>
                  <div style={{textAlign:"right"}}><div className="cf" style={{fontSize:22,fontWeight:600,color:sev(c.severity).t}}>{c.confidence}%</div><div style={{fontSize:10,color:"var(--muted)"}}>prominence</div></div>
                </div>
                <Meter pct={c.confidence} color={sev(c.severity).c}/>
                {c.description&&<p style={{fontSize:12.5,color:"var(--muted)",marginTop:12,lineHeight:1.65}}>{c.description}</p>}
              </div>
            ))}
          </div>
        ):<EmptyState icon="leaf" title="Nothing flagged" message="No specific concerns were detected in this scan."/>
      )}

      {tab==="heatmap"&&(
        <div className="sm-card">
          <h3 className="sm-card-title">Concern zone map</h3>
          <p className="sm-card-sub" style={{marginBottom:16}}>Areas where a concern was noticed. Every zone is manageable, and none of them define you.</p>
          <div style={{position:"relative",maxWidth:360,margin:"0 auto"}}>
            {img?<img src={img} alt="Your scan" style={{width:"100%",borderRadius:18,objectFit:"cover",maxHeight:360,display:"block"}}/>
              :<div style={{width:"100%",paddingBottom:"100%",borderRadius:18,background:"var(--petal)",position:"relative"}}><div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"var(--muted)",fontSize:13}}>Scan a photo to see your heat map</span></div></div>}
            {results.heatZones?.map((z,i)=>{const zc=zoneColor(z.intensity);const sz=z.intensity==="High"?48:z.intensity==="Medium"?36:26;return(
              <div key={i} className="concern-zone" style={{left:`${z.x}%`,top:`${z.y}%`,width:sz,height:sz,borderColor:zc,background:`${zc}33`,transform:"translate(-50%,-50%)"}}>
                <div style={{position:"absolute",bottom:"100%",left:"50%",transform:"translateX(-50%)",whiteSpace:"nowrap",background:"#FFFCF3",border:`1px solid ${zc}`,padding:"2px 8px",borderRadius:8,fontSize:10,color:"#4E5138",fontWeight:600,marginBottom:4}}>{z.label}</div>
              </div>
            );})}
          </div>
        </div>
      )}

      {tab==="forecast"&&(
        <div className="sm-card">
          <div className="sm-row" style={{marginBottom:14}}>
            <span className="sm-tile-ic"><Ic n="forecast" s={20} c="currentColor"/></span>
            <div><h3 className="sm-card-title" style={{margin:0}}>30-day skin forecast</h3><p className="sm-card-sub">Based on your current routine and habits</p></div>
          </div>
          {results.forecast?(
            <div className="sm-stack">
              <div className="sm-grid g2">
                <div className="sm-stat sage"><div className="sm-stat-label">Hydration (projected)</div><div className="sm-stat-value">+{results.forecast.hydration30days||12}<small>%</small></div></div>
                <div className="sm-stat pink"><div className="sm-stat-label">Brightness trend</div><div style={{fontSize:14.5,fontWeight:600,color:"var(--txt)",marginTop:6}}>{results.forecast.brightnessChange||"Improving"}</div></div>
              </div>
              <Note icon="spark" tone="sage"><b>Recommendation.</b> {results.forecast.recommendation||"Keep your routine steady. Small, daily actions lead to visible changes within 4 to 6 weeks."}</Note>
            </div>
          ):<p style={{color:"var(--muted)",fontSize:13.5}}>Forecast data will appear once it's available from your scan.</p>}
        </div>
      )}

      {tab==="triggers"&&(
        <div className="sm-stack">
          <Note icon="alert" tone="cream">AI-estimated correlations, not medical advice. A dermatologist can give clinical guidance.</Note>
          {(results.triggers||[{food:"High-sugar foods",correlation:68,insight:"Sugar spikes insulin, triggering androgen hormones linked to breakouts."},{food:"Dairy products",correlation:45,insight:"Some people find dairy influences hormonal acne. Worth tracking for 4 weeks."},{food:"Processed foods",correlation:55,insight:"Trans fats increase inflammatory markers that show in skin texture."}]).map(t=>(
            <div key={t.food} className="sm-card tight">
              <div className="sm-row" style={{justifyContent:"space-between",marginBottom:9}}>
                <div style={{fontSize:14,fontWeight:600,color:"var(--txt)"}}>{t.food}</div>
                <div className="cf" style={{fontSize:17,fontWeight:600,color:SM.pinkDeep}}>{t.correlation}%</div>
              </div>
              <Meter pct={t.correlation} color={SM.pink}/>
              <p style={{fontSize:12.5,color:"var(--muted)",marginTop:10,lineHeight:1.65}}>{t.insight}</p>
            </div>
          ))}
        </div>
      )}

      {tab==="routine"&&(
        <div className="sm-stack">
          {results.recommendations?.length>0&&(
            <Section title="Personalized for you" sub="Based on your profile, concerns and this scan">
              <div className="sm-stack" style={{gap:12}}>
                {results.recommendations.map((r,i)=>(
                  <div key={i} className="sm-card tight" style={{display:"flex",gap:14,alignItems:"flex-start"}}>
                    <span className="sm-tile-ic pink" style={{width:34,height:34,borderRadius:12,fontWeight:700,fontSize:13}}>{i+1}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:600,color:"var(--txt)",marginBottom:5}}>{r.action}</div>
                      {r.reason&&<p style={{fontSize:12.5,color:"var(--muted)",lineHeight:1.65,marginBottom:8}}>{r.reason}</p>}
                      <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                        {r.targetConcern&&<span className="sm-pill pink" style={{fontSize:10.5}}>Targets {r.targetConcern}</span>}
                        {r.timeframe&&<span className="sm-pill sage" style={{fontSize:10.5}}>{r.timeframe}</span>}
                      </div>
                      {r.expectedImprovement&&<p style={{fontSize:11.5,color:"var(--muted)",marginTop:8}}>Expected: {r.expectedImprovement}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}
          <div className="sm-grid">
            {[["Morning",SM.sage,"sun",["Gentle cleanser. 60 seconds","Niacinamide serum. 2–3 drops, wait 60s","Lightweight gel moisturizer","SPF 50+ sunscreen. Always last"]],["Night",SM.pink,"moon",["Oil cleanser, then water cleanser","BHA exfoliant (Mon / Wed / Fri only)","Treatment serum (retinol or Vitamin C)","Rich nourishing night cream"]],["Weekly",SM.sageDeep,"calendar",["Chemical exfoliation ×2","Hydrating sheet mask (Sunday)","Clay mask for T-zone (Saturday)","1 rest day. No actives"]]].map(([title,col,ic,items])=>(
              <div key={title} className="sm-card">
                <div className="sm-row" style={{marginBottom:12}}><span className={`sm-tile-ic${title==="Night"?" pink":""}`} style={{width:34,height:34,borderRadius:12}}><Ic n={ic} s={17} c="currentColor"/></span><h3 className="sm-card-title" style={{margin:0}}>{title}</h3></div>
                {items.map((item,i)=>(
                  <div key={i} className="check-row" style={{alignItems:"flex-start"}}>
                    <span style={{width:20,height:20,borderRadius:"50%",background:col,color:"#fff",fontSize:10.5,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>{i+1}</span>
                    <span style={{fontSize:12.8,color:"var(--txt)",lineHeight:1.55}}>{item}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <button className="btn" onClick={()=>onNav("products")} style={{width:"100%"}}>View recommended products</button>
        </div>
      )}
      {tab==="yours"&&(
        <div className="sm-stack">
          <Note icon="lock" tone="sage">Your answers are used to personalize your Sumi experience. <button className="btn-text" onClick={()=>onQuiz?onQuiz(true):onNav("quiz")} style={{padding:0,fontWeight:700}}>Edit My Answers</button></Note>
          <div className="sm-card">
            <h3 className="sm-card-title" style={{marginBottom:12}}>What You Told Sumi</h3>
            <div className="sm-stack" style={{gap:10}}>
              {summary.map((s,i)=>(
                <div key={i} style={{fontSize:12.5,lineHeight:1.65,borderBottom:i<summary.length-1?"1px solid rgba(181,92,121,.07)":"none",paddingBottom:9}}>
                  <span style={{color:"var(--muted)"}}>{s.q}</span><br/><b style={{color:"var(--txt)"}}>{s.a}</b>
                </div>
              ))}
            </div>
            {results.quizResponses?.other?.trim()&&<p className="sm-hand" style={{marginTop:14}}>"{results.quizResponses.other.trim()}"</p>}
          </div>
        </div>
      )}
    </PageWrap>
  );
};

const WELLNESS_ICONS={
  hydration:"/sumi/wellness-icons/hydration.png",
  cycle:"/sumi/wellness-icons/cycle.png",
  skincare:"/sumi/wellness-icons/skincare.png",
  journal:"/sumi/wellness-icons/journal.png",
};
const getTodaySkinCheckIn=()=>{
  const log=LS.get("skin_checkin_log",{});
  return log[new Date().toISOString().slice(0,10)]||null;
};
const Dashboard=({user,results,onNav,scans,onQuiz})=>{
  const [habits,setHabits]=useState(()=>LS.get("habits3",DEFAULT_HABITS));
  const [journalEntries]=useState(()=>LS.get("glowJournal",[]));
  const [water]=useState(()=>LS.get("water_today",0));
  const [planOpen,setPlanOpen]=useState(false);
  const streak=calcStreak();
  const h=new Date().getHours();
  useEffect(()=>{recordActivity("checkin");},[]);
  useEffect(()=>{LS.set("habits3",habits);},[habits]);
  const done=habits.filter(x=>x.done).length;
  const toggleHabit=id=>{setHabits(hs=>hs.map(x=>x.id===id?{...x,done:!x.done}:x));recordActivity("habit");};
  const greeting=h<12?"Good morning":h<17?"Good afternoon":"Good evening";
  const firstName=user?.name?.split(" ")[0]||"there";
  /* One very short personalized line under the greeting. */
  const subline=
    done===habits.length&&habits.length>0
      ?"Every habit's done today. Nicely kept."
      :streak>0
      ?`${streak}-day streak. Keep it going today.`
      :"Let's take a small step for your skin today.";
  /* AI Insight — one short, concrete, personalized line. Prefers the
     latest SkinAnalysisProfile (from either a scan or the Skin Quiz) over
     a generic habit-based line, and uses the person's actual reported/
     observed concerns rather than a stock skincare quote. */
  const latestFocus=results?.primaryConcerns?.length?results.primaryConcerns.slice(0,2):(results?.concerns||[]).slice(0,2).map(c=>c.name);
  const insightMsg=
    latestFocus.length>0
      ?`Your latest skin check-in${results.source==="skin_quiz"?" (Skin Quiz)":results.source==="combined"?" (scan + quiz)":""} focused mostly on ${latestFocus.join(" and ").toLowerCase()}.`
      :done===habits.length&&habits.length>0
      ?"You showed up for every habit today. That kind of consistency is worth celebrating."
      :streak>=3
      ?"Your consistency is trending well. Keep noticing the small wins."
      :done===0
      ?"Starting with just one habit today still counts. Pick the easiest one."
      :"Every small act of care adds up. One more habit today would round it out nicely.";
  /* 5. Daily Snapshot — hydration, cycle, skin care, journal, read from
     data the app already tracks elsewhere. No new large tracker, just a
     one-line-per-metric summary. */
  const cycles=LS.get("menstrual_cycles",[]);
  const cycleStatus=cycles?.length?"Tracked":"Not tracked yet";
  const skinRoutineHabits=habits.filter(x=>/routine/i.test(x.label));
  const skinRoutineDone=skinRoutineHabits.filter(x=>x.done).length;
  const todayDateStr=new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
  const journaledToday=journalEntries?.some(e=>e.date===todayDateStr);
  return(
    <div style={{padding:"20px 20px 40px",maxWidth:640,margin:"0 auto"}}>
      {/* 1. Greeting — compact, no hero/illustration */}
      <div style={{marginBottom:20}}>
        <h1 className="cf" style={{fontSize:23,fontWeight:600,color:"var(--txt)",margin:0}}>{greeting}, {firstName}</h1>
        <p style={{fontSize:12.5,color:"var(--muted)",marginTop:4}}>{subline}</p>
      </div>

      {/* 2. Today's Ritual — small horizontal card, one CTA */}
      <div className="glass" style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:14,padding:"16px 18px",borderRadius:18,marginBottom:14}}>
        <div>
          <h2 style={{fontSize:14,fontWeight:700,color:"var(--txt)",margin:0}}>Today's Ritual</h2>
          <p style={{fontSize:11.5,color:"var(--muted)",marginTop:3}}>A quick scan or quiz keeps your skin insights current.</p>
        </div>
        <button className="btn" onClick={()=>onNav("myskin")} style={{fontSize:12.5,padding:"9px 16px",whiteSpace:"nowrap",flexShrink:0}}>Start Today's Ritual</button>
      </div>

      {/* 3. Today's Plan — collapsed by default; tap View to expand */}
      <div className="glass" style={{padding:"16px 18px",borderRadius:18,marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}} onClick={()=>setPlanOpen(o=>!o)}>
          <div>
            <h2 style={{fontSize:14,fontWeight:700,color:"var(--txt)",margin:0}}>Today's Plan</h2>
            <p style={{fontSize:11.5,color:"var(--muted)",marginTop:3}}>{habits.length} things for today · {done} done</p>
          </div>
          <button className="btn-text" onClick={e=>{e.stopPropagation();setPlanOpen(o=>!o);}} style={{fontSize:12}}>{planOpen?"Hide":"View"}</button>
        </div>
        {planOpen&&(
          <>
            <div style={{height:5,borderRadius:99,background:"var(--inp-bg)",overflow:"hidden",margin:"12px 0"}}>
              <div style={{height:"100%",width:`${habits.length?(done/habits.length)*100:0}%`,background:"var(--soft)",borderRadius:99,transition:"width .3s"}}/>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:2}}>
              {habits.map(hb=>(
                <div key={hb.id} role="checkbox" aria-checked={hb.done} tabIndex={0} className="kb-focusable" onClick={()=>toggleHabit(hb.id)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggleHabit(hb.id);}}} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 4px",cursor:"pointer",borderRadius:10}}>
                  <div style={{width:18,height:18,borderRadius:6,flexShrink:0,background:hb.done?"var(--soft)":"transparent",border:`1.5px solid ${hb.done?"var(--soft)":"var(--border)"}`,display:"flex",alignItems:"center",justifyContent:"center"}}>{hb.done&&<Ic n="ok" s={11} c="#fff"/>}</div>
                  <span style={{fontSize:12.5,color:hb.done?"var(--muted)":"var(--txt)",textDecoration:hb.done?"line-through":"none"}}>{hb.label}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 4. AI Insight — one small compact card */}
      <div className="glass" style={{padding:"14px 16px",borderRadius:18,display:"flex",alignItems:"flex-start",gap:10,marginBottom:14}}>
        <span aria-hidden style={{fontSize:15,lineHeight:1,marginTop:1}}>✦</span>
        <div>
          <div style={{fontSize:10.5,fontWeight:700,color:"var(--soft)",letterSpacing:".04em",textTransform:"uppercase",marginBottom:3}}>AI Insight</div>
          <p style={{fontSize:12.5,color:"var(--txt)",lineHeight:1.55,margin:0}}>{insightMsg}</p>
        </div>
      </div>

      {/* 5. Daily Snapshot — compact premium wellness summary, using the
         supplied sticker artwork as the visual source of truth (never
         emoji/icon-library substitutes). */}
      <div className="glass wellness-snap" style={{padding:"14px 16px",borderRadius:18}}>
        <div style={{fontSize:10.5,fontWeight:700,color:"var(--muted)",letterSpacing:".04em",textTransform:"uppercase",marginBottom:10}}>Today's Wellness</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,textAlign:"center"}}>
          <div className="wellness-snap-item"><img src={WELLNESS_ICONS.hydration} alt="" className="wellness-snap-ic"/><div style={{fontSize:12,fontWeight:700,color:"var(--txt)",marginTop:5}}>{water}</div><div style={{fontSize:9.5,color:"var(--muted)"}}>Hydration</div></div>
          <div className="wellness-snap-item"><img src={WELLNESS_ICONS.cycle} alt="" className="wellness-snap-ic"/><div style={{fontSize:12,fontWeight:700,color:"var(--txt)",marginTop:5}}>{cycleStatus==="Tracked"?"On track":"Not tracked"}</div><div style={{fontSize:9.5,color:"var(--muted)"}}>Cycle</div></div>
          <div className="wellness-snap-item"><img src={WELLNESS_ICONS.skincare} alt="" className="wellness-snap-ic"/><div style={{fontSize:12,fontWeight:700,color:"var(--txt)",marginTop:5}}>{skinRoutineHabits.length?`${skinRoutineDone}/${skinRoutineHabits.length}`:"Not logged"}</div><div style={{fontSize:9.5,color:"var(--muted)"}}>Skin Care</div></div>
          <div className="wellness-snap-item"><img src={WELLNESS_ICONS.journal} alt="" className="wellness-snap-ic"/><div style={{fontSize:12,fontWeight:700,color:"var(--txt)",marginTop:5}}>{journaledToday?"Logged":"Not yet"}</div><div style={{fontSize:9.5,color:"var(--muted)"}}>Journal</div></div>
        </div>
      </div>
    </div>
  );
};


const GlowJournal=()=>{
  const [entries,setEntries]=useState(()=>LS.get("glowJournal",[]));
  const [form,setForm]=useState({mood:"",confidence:5,energy:5,note:"",gratitude:"",skin:[]});
  const [tab,setTab]=useState("write");
  const [saved,setSaved]=useState(false);
  const MOODS=["Happy","Calm","Low","Frustrated","Confident","Anxious"];
  const SKIN_FEELS=["Clear","Glowing","Dry","Oily","Breakout","Sensitive"];
  const prompts=["How did your skin feel today, physically and emotionally?","What's one thing your body did for you today that you're grateful for?","Did anything trigger self-criticism today? How did you handle it?","What made you feel most like yourself today?","One small win from today, no matter how tiny."];
  const [prompt]=useState(()=>prompts[Math.floor(Math.random()*prompts.length)]);
  const todayLabel=new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"});
  const save=()=>{
    if(!form.mood&&!form.note)return;
    const entry={...form,date:new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}),ts:Date.now()};
    const next=[entry,...entries].slice(0,60);
    setEntries(next);LS.set("glowJournal",next);
    setForm({mood:"",confidence:5,energy:5,note:"",gratitude:"",skin:[]});
    recordActivity("journal");setSaved(true);setTimeout(()=>setSaved(false),2000);
  };
  const toggleSkin=(s)=>setForm(f=>({...f,skin:f.skin.includes(s)?f.skin.filter(x=>x!==s):[...f.skin,s]}));
  /* "confidence" is the stored key for the person's own 1–10 "overall
     feeling" slider (kept so older entries keep charting). It's their
     self-report, never a score Sumi computes. */
  const avgFeel=entries.length?Math.round(entries.reduce((a,e)=>a+(e.confidence||0),0)/entries.length*10)/10:0;
  const moodCounts=entries.reduce((m,e)=>{if(e.mood)m[e.mood]=(m[e.mood]||0)+1;return m;},{});
  const moodTotal=Object.values(moodCounts).reduce((a,b)=>a+b,0)||1;
  const skinCounts=entries.reduce((m,e)=>{(e.skin||[]).forEach(s=>{m[s]=(m[s]||0)+1;});return m;},{});
  const tooltipStyle={background:"#FFFCF3",border:"1px solid rgba(112,132,86,.3)",borderRadius:12,color:"#4E5138",fontSize:11};
  /* Group past entries by month for the timeline. */
  const groups=entries.reduce((g,e)=>{const d=e.ts?new Date(e.ts):null;const k=d?d.toLocaleDateString("en-IN",{month:"long",year:"numeric"}):"Earlier";(g[k]=g[k]||[]).push(e);return g;},{});

  return(
    <PageWrap max={760}>
      <PageHeader icon={SCRAP+"glow_journal.png"} eyebrow="Wellness" title="Glow Journal" sub="A private page for how you feel, inside and out."
        right={<span className="sm-pill sage"><Ic n="lock" s={12} c="currentColor"/>Private to you</span>}/>
      <div style={{marginBottom:20}}>
        <Seg label="Journal sections" value={tab} onChange={setTab} tabs={[["write","Write"],["entries","Past entries"],["insights","Insights"]]}/>
      </div>

      {tab==="write"&&(
        <div className="sm-paper plain" style={{padding:"30px 24px 24px"}}>
          <span className="sm-tape green"/>
          <div className="sm-eyebrow">{todayLabel}</div>
          <p className="cf" style={{fontSize:19,fontStyle:"italic",color:"var(--txt)",lineHeight:1.55,margin:"6px 0 22px"}}>{prompt}</p>

          <div className="sm-eyebrow" style={{marginBottom:10}}>How are you feeling?</div>
          <div className="sm-grid g3" style={{marginBottom:22}}>
            {MOODS.map(m=>(
              <button key={m} className={`sm-mood-btn${form.mood===m?" act":""}`} aria-pressed={form.mood===m} onClick={()=>setForm(f=>({...f,mood:f.mood===m?"":m}))}>
                <MoodFace mood={m} size={32}/>{m}
              </button>
            ))}
          </div>

          <div className="sm-eyebrow" style={{marginBottom:10}}>Your skin today</div>
          <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:22}}>
            {SKIN_FEELS.map(s=><button key={s} type="button" aria-pressed={form.skin.includes(s)} className={`sm-pill sm-pill-btn${form.skin.includes(s)?" act":""}`} onClick={()=>toggleSkin(s)} style={{padding:"6px 14px",fontSize:12.5}}>{s}</button>)}
          </div>

          <div className="sm-grid g2" style={{gap:20,marginBottom:22}}>
            {[["Overall feeling","confidence"],["Energy","energy"]].map(([label,key])=>(
              <div key={key}>
                <div className="sm-row" style={{justifyContent:"space-between",marginBottom:6}}>
                  <label htmlFor={`jr-${key}`} style={{fontSize:12.5,color:"var(--muted)"}}>{label}</label>
                  <span className="cf" style={{fontSize:16,fontWeight:600,color:SM.pinkDeep}}>{form[key]}<small style={{fontFamily:"Nunito",fontSize:10.5,color:"var(--muted)"}}>/10</small></span>
                </div>
                <input id={`jr-${key}`} type="range" min={1} max={10} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:Number(e.target.value)}))} style={{width:"100%",accentColor:SM.sage}}/>
              </div>
            ))}
          </div>

          <label htmlFor="jr-note" className="sm-eyebrow" style={{display:"block",marginBottom:8}}>Today's reflection</label>
          <textarea id="jr-note" className="inp" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="How did your skin feel today? What's on your mind?" rows={5} style={{resize:"vertical",lineHeight:1.75,marginBottom:18}}/>
          <label htmlFor="jr-grat" className="sm-eyebrow" style={{display:"block",marginBottom:8}}>One thing I'm grateful for</label>
          <input id="jr-grat" className="inp" value={form.gratitude} onChange={e=>setForm(f=>({...f,gratitude:e.target.value}))} placeholder="About your body, your day, or yourself…" style={{marginBottom:22}}/>
          <button className="btn" onClick={save} style={{width:"100%"}} disabled={!form.mood&&!form.note}>{saved?"Saved to your journal":"Save entry"}</button>
        </div>
      )}

      {tab==="entries"&&(
        entries.length===0?(
          <EmptyState icon="book" title="Your journal is empty" message="Write your first entry. Even a few words each day helps you notice patterns." actionLabel="Write first entry" onAction={()=>setTab("write")}/>
        ):(
          <div className="sm-stack" style={{gap:22}}>
            {Object.entries(groups).map(([month,list])=>(
              <div key={month}>
                <div className="sm-eyebrow" style={{marginBottom:10}}>{month}</div>
                <div className="sm-timeline">
                  {list.map((e,i)=>(
                    <div key={e.ts||i} className="sm-tl-item">
                      <span className={`sm-tl-dot${e.mood==="Frustrated"||e.mood==="Anxious"?" pink":""}`}/>
                      <div className="sm-card tight">
                        <div className="sm-row" style={{justifyContent:"space-between",marginBottom:9,gap:8,flexWrap:"wrap"}}>
                          <div className="sm-row" style={{gap:9}}><MoodFace mood={e.mood} size={28}/><span style={{fontSize:13.5,fontWeight:600,color:"var(--txt)"}}>{e.mood||"Reflection"}</span></div>
                          <span style={{fontSize:11.5,color:"var(--muted)"}}>{e.date}</span>
                        </div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:(e.note||e.gratitude)?10:0}}>
                          {e.confidence!=null&&<span className="sm-pill" style={{fontSize:10.5,padding:"1px 9px"}}>Feeling {e.confidence}/10</span>}
                          {e.energy!=null&&<span className="sm-pill" style={{fontSize:10.5,padding:"1px 9px"}}>Energy {e.energy}/10</span>}
                          {(e.skin||[]).map(s=><span key={s} className="sm-pill sage" style={{fontSize:10.5,padding:"1px 9px"}}>{s}</span>)}
                        </div>
                        {e.note&&<p style={{fontSize:13,color:"var(--txt)",lineHeight:1.75}}>{e.note}</p>}
                        {e.gratitude&&<p className="sm-hand" style={{fontSize:19,marginTop:8,color:SM.pinkDeep}}>{e.gratitude}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab==="insights"&&(
        entries.length<3?(
          <EmptyState icon="chart" title="A few more entries to go" message={`Write ${3-entries.length} more ${3-entries.length===1?"entry":"entries"} to unlock your mood and skin patterns.`} actionLabel="Write an entry" onAction={()=>setTab("write")}/>
        ):(
          <div className="sm-stack" style={{gap:16}}>
            <div className="sm-grid g3">
              <div className="sm-stat sage"><div className="sm-stat-label">Entries</div><div className="sm-stat-value">{entries.length}</div></div>
              <div className="sm-stat pink"><div className="sm-stat-label">Average feeling</div><div className="sm-stat-value">{avgFeel}<small>/10</small></div></div>
              <div className="sm-stat"><div className="sm-stat-label">Day streak</div><div className="sm-stat-value">{calcStreak()}</div></div>
            </div>
            <div className="sm-card">
              <h3 className="sm-card-title">Feeling and energy</h3>
              <p className="sm-card-sub" style={{marginBottom:8}}>Your last {Math.min(entries.length,14)} entries, oldest to newest</p>
              <ResponsiveContainer width="100%" height={190}>
                <AreaChart data={entries.slice(0,14).reverse().map((e,i)=>({day:`${i+1}`,feeling:e.confidence,energy:e.energy}))}>
                  <defs><linearGradient id="jg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={SM.pink} stopOpacity={0.4}/><stop offset="95%" stopColor={SM.pink} stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 4" stroke="rgba(127,154,102,.25)"/>
                  <XAxis dataKey="day" tick={{fill:"#6E7A59",fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis domain={[0,10]} tick={{fill:"#6E7A59",fontSize:10}} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={tooltipStyle}/>
                  <Area type="monotone" dataKey="feeling" stroke={SM.pinkDeep} fill="url(#jg)" strokeWidth={2.4} name="Feeling"/>
                  <Line type="monotone" dataKey="energy" stroke={SM.sageDeep} strokeWidth={2.4} dot={false} name="Energy"/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="sm-grid g2 r-col">
              <div className="sm-card sage">
                <h3 className="sm-card-title">Moods</h3>
                <div className="sm-stack" style={{gap:11,marginTop:10}}>
                  {Object.entries(moodCounts).sort((a,b)=>b[1]-a[1]).map(([m,n])=>(
                    <div key={m} className="sm-row" style={{gap:10}}>
                      <MoodFace mood={m} size={24}/><span style={{fontSize:12.5,color:"var(--txt)",width:76}}>{m}</span>
                      <div style={{flex:1}}><Meter pct={(n/moodTotal)*100} color={SM.sage}/></div><span style={{fontSize:11.5,color:"var(--muted)",width:18,textAlign:"right"}}>{n}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="sm-card pink">
                <h3 className="sm-card-title">Skin observations</h3>
                {Object.keys(skinCounts).length?(
                  <div className="sm-stack" style={{gap:11,marginTop:10}}>
                    {Object.entries(skinCounts).sort((a,b)=>b[1]-a[1]).map(([s,n])=>(
                      <div key={s} className="sm-row" style={{gap:10}}>
                        <span style={{fontSize:12.5,color:"var(--txt)",width:82}}>{s}</span>
                        <div style={{flex:1}}><Meter pct={(n/entries.length)*100} color={SM.pink}/></div><span style={{fontSize:11.5,color:"var(--muted)",width:18,textAlign:"right"}}>{n}</span>
                      </div>
                    ))}
                  </div>
                ):<p className="sm-card-sub" style={{marginTop:8,lineHeight:1.7}}>Tag how your skin feels when you write, and the patterns will collect here.</p>}
              </div>
            </div>
          </div>
        )
      )}
    </PageWrap>
  );
};

const USAGE_BY_CATEGORY={
  cleanser:"Use morning and night on damp skin. Massage gently for 30-60 seconds, then rinse with lukewarm water.",
  serum:"Apply 2-3 drops to clean, dry skin before moisturizer. Start every-other-day if it contains actives (Vitamin C, acids), then build up as tolerated.",
  moisturizer:"Apply as the last hydrating step, morning and night, after serums. A pea-sized amount is usually enough for the full face.",
  sunscreen:"Apply generously as the final morning step, at least 15 minutes before sun exposure. Reapply every 2-3 hours if outdoors.",
  toner:"Pat onto clean skin with hands or a cotton pad, right after cleansing and before serum.",
};

/* Product Scanner — a photo-based scan (label/packaging), same shape as
   the skin scan flow: capture or upload → analyzing → structured report.
   Barcode/QR reading isn't wired to a product database yet, so those
   buttons are present but explain that photo scanning is what's live
   today; runProductAnalysis is the one function to swap in a real
   barcode lookup later without touching this UI. */
const ProductScanner=({user,savedProducts,onSaved,onClose})=>{
  const [stage,setStage]=useState("capture"); // capture | camera | analyzing | report | error
  const [img,setImg]=useState(null);
  const [report,setReport]=useState(null);
  const [err,setErr]=useState("");
  const [saved,setSaved]=useState(false);
  const vidRef=useRef(null),canRef=useRef(null),fileRef=useRef(null),streamRef=useRef(null);
  const stopCamera=useCallback(()=>{
    if(streamRef.current){streamRef.current.getTracks().forEach(t=>t.stop());streamRef.current=null;}
    if(vidRef.current)vidRef.current.srcObject=null;
  },[]);
  useEffect(()=>()=>stopCamera(),[stopCamera]);
  const startCamera=async()=>{
    setErr("");
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:1280},height:{ideal:720}}});
      streamRef.current=stream;
      if(vidRef.current){vidRef.current.srcObject=stream;vidRef.current.onloadedmetadata=()=>vidRef.current.play().catch(()=>{stopCamera();setStage("capture");setErr("Camera couldn't start. Please upload a photo instead.");});}
      setStage("camera");
    }catch(e){
      let msg="Camera not accessible. Please upload a photo instead.";
      if(e.name==="NotAllowedError")msg="Camera permission was denied. Please allow camera access, or upload a photo.";
      else if(e.name==="NotFoundError")msg="No camera found. Please upload a photo instead.";
      setStage("capture");setErr(msg);
    }
  };
  const capturePhoto=()=>{
    const video=vidRef.current,canvas=canRef.current;
    if(!video||!canvas||video.videoWidth===0){setErr("Camera not ready. Please wait a moment and try again.");return;}
    canvas.width=video.videoWidth;canvas.height=video.videoHeight;
    canvas.getContext("2d").drawImage(video,0,0);
    stopCamera();
    analyze(canvas.toDataURL("image/jpeg",.9));
  };
  const onFile=(e)=>{
    const f=e.target.files?.[0];if(!f)return;
    const r=new FileReader();r.onload=()=>analyze(r.result);r.readAsDataURL(f);
  };
  const analyze=async(data)=>{
    setImg(data);setStage("analyzing");setErr("");
    try{
      const timeout=new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),60000));
      const result=await Promise.race([runProductAnalysis(data,user,savedProducts),timeout]);
      setReport(result);setStage("report");
    }catch(e){
      const msg=e?.message==="timeout"?"That's taking longer than expected. Please try again with a clear photo of the label.":friendlyAIError(e);
      setErr(msg);setStage("capture");
    }
  };
  const save=()=>{
    if(!report)return;
    onSaved({...report,id:Date.now(),img,scannedAt:new Date().toISOString()});
    setSaved(true);setTimeout(onClose,900);
  };
  return(
    <div style={{padding:"20px 20px 40px",maxWidth:640,margin:"0 auto"}}>
      <button onClick={()=>{stopCamera();onClose();}} className="btn-text" style={{marginBottom:14}}><Ic n="skipBack" s={14}/> Back to products</button>

      {stage==="capture"&&(
        <div className="glass" style={{padding:"26px 22px",borderRadius:20,textAlign:"center"}}>
          <img src={SCRAP+"skin_products.png"} alt="" style={{width:48,height:48,objectFit:"contain",margin:"0 auto 10px"}}/>
          <h3 className="cf" style={{fontSize:19,fontWeight:600,color:"var(--txt)",marginBottom:6}}>Scan a product</h3>
          <p style={{fontSize:12.5,color:"var(--muted)",lineHeight:1.6,marginBottom:18}}>Point your camera at the label or upload a clear photo. Sumi will read the ingredients and tell you what they mean for your skin.</p>
          {err&&<div style={{background:"var(--petal)",border:"1px solid var(--border)",borderRadius:12,padding:"10px 14px",marginBottom:14,fontSize:12,color:"var(--soft)",textAlign:"left"}}>{err}</div>}
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <button className="btn" onClick={startCamera}><Ic n="camera" s={15} c="#FFFEFC"/> Use Camera</button>
            <button className="btn-o" onClick={()=>fileRef.current?.click()}>Upload Photo</button>
            <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{display:"none"}}/>
          </div>
          <div style={{display:"flex",gap:8,marginTop:16,justifyContent:"center",opacity:.55}}>
            <span className="tag" style={{fontSize:10}}>Barcode scanning coming soon</span>
            <span className="tag" style={{fontSize:10}}>QR scanning coming soon</span>
          </div>
        </div>
      )}

      {stage==="camera"&&(
        <div className="glass" style={{padding:16,borderRadius:20,textAlign:"center"}}>
          <div style={{borderRadius:16,overflow:"hidden",marginBottom:14,background:"#000"}}>
            <video ref={vidRef} playsInline muted style={{width:"100%",display:"block",maxHeight:380,objectFit:"cover"}}/>
          </div>
          <canvas ref={canRef} style={{display:"none"}}/>
          <div style={{display:"flex",gap:10}}>
            <button className="btn-o" onClick={()=>{stopCamera();setStage("capture");}} style={{flex:1}}>Cancel</button>
            <button className="btn" onClick={capturePhoto} style={{flex:2}}>Capture</button>
          </div>
        </div>
      )}

      {stage==="analyzing"&&(
        <div className="glass glow" style={{padding:"40px 30px",borderRadius:24,textAlign:"center"}}>
          <div style={{width:60,height:60,margin:"0 auto 16px",borderRadius:"50%",border:"3px solid var(--border)",borderTopColor:"var(--soft)",animation:"spin 1s linear infinite"}}/>
          <h3 className="cf" style={{fontSize:18,fontWeight:600,color:"var(--txt)",marginBottom:6}}>Reading the label…</h3>
          <p style={{fontSize:12.5,color:"var(--muted)"}}>Identifying ingredients and matching them to your skin profile.</p>
        </div>
      )}

      {stage==="report"&&report&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div className="glass" style={{padding:20,borderRadius:20}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:4}}>
              <div>
                <div style={{fontSize:16,fontWeight:700,color:"var(--txt)"}}>{report.productName||"Unnamed product"}</div>
                <div style={{fontSize:12,color:"var(--muted)"}}>{report.brand||"Brand unknown"} · {report.category||"Product"}</div>
              </div>
              {report.confidence&&<span className="tag" style={{fontSize:10,flexShrink:0}}>{report.confidence} confidence</span>}
            </div>
          </div>

          {report.duplicateActives?.length>0&&(
            <div style={{background:"var(--sun-soft)",border:"1px solid rgba(240,189,74,.35)",borderRadius:14,padding:"12px 16px"}}>
              <div style={{fontSize:12.5,fontWeight:700,color:"#6B4E14",marginBottom:3}}>Overlapping actives</div>
              <p style={{fontSize:12,color:"#6B4E14",lineHeight:1.6}}>Already in a saved product: {report.duplicateActives.join(", ")}. Using both may be more of an active than your skin needs.</p>
            </div>
          )}

          {report.keyActives?.length>0&&(
            <div className="glass" style={{padding:18,borderRadius:18}}>
              <h4 style={{fontSize:13,fontWeight:700,color:"var(--txt)",marginBottom:10}}>Key ingredients</h4>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {report.keyActives.map((a,i)=>(
                  <div key={i}>
                    <div style={{fontSize:13,fontWeight:600,color:"var(--soft)"}}>{a.name}</div>
                    <div style={{fontSize:12,color:"var(--muted)",lineHeight:1.55}}>{a.whatItDoes}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.benefits?.length>0&&(
            <div className="glass" style={{padding:18,borderRadius:18}}>
              <h4 style={{fontSize:13,fontWeight:700,color:"var(--txt)",marginBottom:8}}>Benefits</h4>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{report.benefits.map((b,i)=><span key={i} className="tag">{b}</span>)}</div>
            </div>
          )}

          {report.suitability&&(
            <div className="glass" style={{padding:18,borderRadius:18}}>
              <h4 style={{fontSize:13,fontWeight:700,color:"var(--txt)",marginBottom:6}}>Is this right for you</h4>
              <p style={{fontSize:12.5,color:"var(--txt)",lineHeight:1.65}}>{report.suitability}</p>
              {report.fitsRoutine&&<p style={{fontSize:12,color:"var(--muted)",lineHeight:1.6,marginTop:6}}>{report.fitsRoutine}</p>}
            </div>
          )}

          <div className="glass" style={{padding:18,borderRadius:18}}>
            <h4 style={{fontSize:13,fontWeight:700,color:"var(--txt)",marginBottom:8}}>How to use</h4>
            <div style={{display:"flex",flexDirection:"column",gap:5,fontSize:12.5,color:"var(--txt)",lineHeight:1.6}}>
              {report.howToUse&&<div>{report.howToUse}</div>}
              <div style={{color:"var(--muted)",fontSize:12}}>{report.whenToUse&&<span>{report.whenToUse}</span>}{report.whenToUse&&report.frequency&&" · "}{report.frequency}</div>
            </div>
          </div>

          {report.concerns?.length>0&&(
            <div className="glass" style={{padding:18,borderRadius:18}}>
              <h4 style={{fontSize:13,fontWeight:700,color:"var(--txt)",marginBottom:8}}>Possible concerns</h4>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{report.concerns.map((c,i)=><span key={i} className="tag" style={{color:"#C4585F"}}>{c}</span>)}</div>
            </div>
          )}

          {report.warnings?.length>0&&(
            <div style={{background:"rgba(245,163,163,.1)",border:"1px solid rgba(245,163,163,.28)",borderRadius:14,padding:"12px 16px"}}>
              {report.warnings.map((w,i)=><p key={i} style={{fontSize:12,color:"#C4585F",lineHeight:1.6}}>⚠ {w}</p>)}
            </div>
          )}

          <div style={{display:"flex",gap:10,marginTop:4}}>
            <button className="btn-o" onClick={()=>{setStage("capture");setReport(null);setImg(null);}} style={{flex:1}}>Scan Another</button>
            <button className="btn" onClick={save} style={{flex:2}}>{saved?"Saved!":"Save to My Products"}</button>
          </div>
        </div>
      )}
    </div>
  );
};

const Products=({results,user})=>{
  const [cat,setCat]=useState("cleanser");
  const [budget,setBudget]=useState("All");
  const [search,setSearch]=useState("");
  const [scanning,setScanning]=useState(false);
  const [scannedProducts,setScannedProducts]=useState(()=>LS.get("scanned_products",[]));
  const skinType=results?.skinType||"Combination";
  const concerns=results?.concerns?.map(c=>c.name)||[];
  const tierTone={Budget:"sage",Mid:"cream",Premium:"pink",Luxury:"red"};
  const tierNote={Budget:"Gentle on your wallet",Mid:"The everyday sweet spot",Premium:"Worth the splurge",Luxury:"Occasional treats"};
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
  if(scanning)return<ProductScanner user={user} savedProducts={scannedProducts} onClose={()=>setScanning(false)} onSaved={(p)=>{const n=[p,...scannedProducts];setScannedProducts(n);LS.set("scanned_products",n);}}/>;
  /* The top-ranked item is featured as the "best match" only when there is
     a real analysis behind it; the rest are grouped by price tier. */
  const hasMatch=!!(results&&(concerns.length>0||results.skinType));
  const featured=hasMatch&&prods.length>0?prods[0]:null;
  const rest=featured?prods.slice(1):prods;
  const tiers=["Budget","Mid","Premium","Luxury"].map(t=>[t,rest.filter(p=>p.tier===t)]).filter(([,l])=>l.length);
  const rating=(v)=><span className="sm-row" style={{gap:3}}><Ic n="star" s={12} c={SM.gold}/><span style={{fontSize:12,fontWeight:600,color:"var(--txt)"}}>{v}</span></span>;
  const ing=(list)=><div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{list.map(i=><span key={i} className="sm-pill" style={{fontSize:10.5,padding:"2px 9px"}}>{i}</span>)}</div>;
  return(
    <PageWrap max={980}>
      <PageHeader
        icon={SCRAP+"skin_products.png"}
        eyebrow="Personalized for you"
        title="Skin Products"
        sub={hasMatch?`Matched to your ${skinType.toLowerCase()} skin${concerns.length?` and ${concerns.slice(0,2).join(" and ").toLowerCase()}`:""}.`:"Complete a skin analysis to match products to your skin."}
        right={<button className="btn" onClick={()=>setScanning(true)} style={{fontSize:12.5,padding:"10px 18px",display:"flex",alignItems:"center",gap:7}}><Ic n="camera" s={14} c="#FFFEFC"/>Scan a product</button>}
      />

      {!results&&<Note icon="alert" tone="pink" style={{marginBottom:16}}>Recommendations below are general. A skin analysis tailors them to your skin type and concerns.</Note>}

      {hasMatch&&(
        <div className="sm-row" style={{flexWrap:"wrap",gap:7,marginBottom:16}}>
          <span className="sm-eyebrow" style={{marginBottom:0,marginRight:4}}>Matched to</span>
          <span className="sm-pill sage">{skinType} skin</span>
          {concerns.slice(0,4).map(c=><span key={c} className="sm-pill pink">{c}</span>)}
        </div>
      )}

      <div className="sm-card sage tight" style={{marginBottom:24,display:"flex",flexDirection:"column",gap:12}}>
        <div className="sm-search">
          <Ic n="search" s={15} c="var(--muted)"/>
          <input className="sm-input" aria-label="Search products or ingredients" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by product or ingredient"/>
        </div>
        <div className="sm-scroll-x" role="tablist" aria-label="Product category">
          {cats.map(c=>(
            <button key={c} role="tab" aria-selected={cat===c} onClick={()=>setCat(c)} className={`sm-pill sm-pill-btn${cat===c?" act":""}`} style={{textTransform:"capitalize",padding:"7px 16px",fontSize:12.5}}>{c}</button>
          ))}
        </div>
        <div><Seg label="Budget" value={budget} onChange={setBudget} tabs={[["All","Any budget"],["Budget","Budget"],["Mid","Mid"],["Premium","Premium"],["Luxury","Luxury"]]} tone="pink"/></div>
      </div>

      {scannedProducts.length>0&&(
        <Section title="Your shelf" sub="Products you've scanned">
          <div className="sm-scroll-x">
            {scannedProducts.map(p=>(
              <div key={p.id} className="sm-stat" style={{minWidth:170,flexShrink:0,display:"flex",gap:10,alignItems:"center",padding:"10px 14px"}}>
                <span className="sm-tile-ic pink" style={{width:34,height:34,borderRadius:12}}><Ic n="bag" s={16} c="currentColor"/></span>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:12.5,fontWeight:600,color:"var(--txt)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.productName}</div>
                  <div style={{fontSize:11,color:"var(--muted)"}}>{p.brand}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {prods.length===0?(
        <EmptyState icon="search" title="Nothing matches yet" message="Try another category, a different budget, or a shorter search to see more products." actionLabel="Reset filters" onAction={()=>{setBudget("All");setSearch("");}}/>
      ):(
        <>
          {featured&&(
            <Section title="Your best match" sub={`Top ${cat} for your skin`}>
              <div className="sm-card deep" style={{display:"grid",gridTemplateColumns:"auto minmax(0,1fr)",gap:"16px 20px",alignItems:"start"}}>
                <span className="sm-tile-ic" style={{width:64,height:64,borderRadius:20,background:"#FBF7EC",color:SM.sageDeep}}><Ic n="bag" s={28} c="currentColor"/></span>
                <div style={{minWidth:0}}>
                  <div className="sm-row" style={{gap:8,flexWrap:"wrap",marginBottom:6}}>
                    <span className="sm-pill" style={{background:SM.pinkDeep,borderColor:SM.pinkDeep,color:"#fff",fontSize:10.5,fontWeight:600}}>Best match</span>
                    <span className={`sm-pill ${tierTone[featured.tier]}`} style={{fontSize:10.5}}>{featured.tier}</span>
                  </div>
                  <h3 className="cf" style={{fontSize:21,fontWeight:600,color:"var(--txt)",lineHeight:1.25}}>{featured.name}</h3>
                  <div style={{fontSize:12.5,color:"#4F6B3E",marginTop:2}}>{featured.brand}</div>
                </div>
                <div style={{gridColumn:"1 / -1"}} className="sm-stack">
                  {featured.why&&<p style={{fontSize:13.5,color:"var(--txt)",lineHeight:1.75}}>{featured.why}</p>}
                  <p style={{fontSize:12.5,color:"#4F6B3E",lineHeight:1.6}}>{featured.benefit}</p>
                  {ing(featured.ing)}
                  {USAGE_BY_CATEGORY[cat]&&<div style={{background:"rgba(255,252,244,.7)",borderRadius:14,padding:"10px 14px"}}><span className="sm-eyebrow" style={{color:"#4F6B3E"}}>How to use</span><p style={{fontSize:12.5,color:"var(--txt)",lineHeight:1.65,marginTop:3}}>{USAGE_BY_CATEGORY[cat]}</p></div>}
                  <div className="sm-row" style={{justifyContent:"space-between"}}>
                    <span className="cf" style={{fontSize:24,fontWeight:600,color:SM.pinkDeep}}>{featured.price}</span>
                    {rating(featured.rating)}
                  </div>
                </div>
              </div>
            </Section>
          )}
          {tiers.map(([tier,list])=>(
            <Section key={tier} title={featured?`Also for ${tier==="Mid"?"mid-range":tier.toLowerCase()} budgets`:tier} sub={tierNote[tier]} style={{marginBottom:22}}>
              <div className="sm-stack" style={{gap:10}}>
                {list.map(p=>(
                  <details key={p.name} className="sm-details sm-card tight">
                    <summary>
                      <div className="sm-prod-row">
                        <div className="sm-row" style={{minWidth:0}}>
                          <span className={`sm-tile-ic${tierTone[p.tier]==="pink"||tierTone[p.tier]==="red"?" pink":""}`} style={{width:38,height:38,borderRadius:13}}><Ic n="bag" s={17} c="currentColor"/></span>
                          <div style={{minWidth:0}}>
                            <div style={{fontSize:13.5,fontWeight:600,color:"var(--txt)"}}>{p.name}</div>
                            <div style={{fontSize:11.5,color:"var(--muted)"}}>{p.brand} · {p.benefit}</div>
                          </div>
                        </div>
                        <div className="sm-row" style={{gap:12}}>
                          <div style={{textAlign:"right"}}><div className="cf" style={{fontSize:16,fontWeight:600,color:SM.pinkDeep}}>{p.price}</div>{rating(p.rating)}</div>
                          <span className="sm-chev" aria-hidden><Ic n="chev" s={16} c="var(--muted)"/></span>
                        </div>
                      </div>
                    </summary>
                    <div className="sm-stack" style={{gap:10,marginTop:14,paddingTop:14,borderTop:"1px solid var(--border)"}}>
                      {p.why&&<p style={{fontSize:12.8,color:"var(--txt)",lineHeight:1.7}}>{p.why}</p>}
                      <div style={{fontSize:11.5,color:"var(--muted)"}}>Suitable for: {p.for.join(", ")}</div>
                      {ing(p.ing)}
                      {USAGE_BY_CATEGORY[cat]&&<p style={{fontSize:12,color:"var(--muted)",lineHeight:1.6}}><b style={{color:SM.sageDeep}}>How to use: </b>{USAGE_BY_CATEGORY[cat]}</p>}
                    </div>
                  </details>
                ))}
              </div>
            </Section>
          ))}
        </>
      )}
    </PageWrap>
  );
};

/* Food Database — a broader, searchable reference covering everyday
   Indian and international foods with approximate nutrition per typical
   serving. Values are general estimates, not lab measurements, and the
   "note" field stays to general wellness relevance, never a medical
   claim. This sits alongside (not instead of) the AI-generated diet
   plan above it. */
const FOOD_DB=[
  {name:"Dal (cooked, 1 cup)",cat:"Indian",cal:180,p:12,c:30,f:2,micro:"Folate, iron, fiber",note:"A steady plant-protein staple."},
  {name:"Rice, white (1 cup cooked)",cat:"Indian",cal:205,p:4,c:45,f:0.5,micro:"Manganese",note:"Pairs well with protein and vegetables for balance."},
  {name:"Roti (1 medium, whole wheat)",cat:"Indian",cal:85,p:3,c:18,f:0.5,micro:"Fiber, B vitamins",note:"A fiber-friendlier grain choice."},
  {name:"Paratha, plain (1)",cat:"Indian",cal:260,p:6,c:35,f:11,micro:"Modest, grain-based",note:"Enjoy alongside curd or vegetables."},
  {name:"Idli (2 pieces)",cat:"Indian",cal:120,p:4,c:24,f:0.5,micro:"B vitamins (fermented)",note:"Light and easy to digest."},
  {name:"Dosa, plain (1)",cat:"Indian",cal:170,p:4,c:29,f:4,micro:"B vitamins",note:"Pair with sambar for added protein."},
  {name:"Poha (1 cup)",cat:"Indian",cal:250,p:5,c:42,f:7,micro:"Iron (if fortified)",note:"A gentle, quick morning meal."},
  {name:"Upma (1 cup)",cat:"Indian",cal:220,p:6,c:35,f:7,micro:"B vitamins",note:"Add vegetables for extra micronutrients."},
  {name:"Khichdi (1 cup)",cat:"Indian",cal:240,p:9,c:38,f:5,micro:"Iron, folate",note:"A gentle, easy-to-digest combo meal."},
  {name:"Paneer (100g)",cat:"Indian",cal:265,p:18,c:4,f:20,micro:"Calcium",note:"A vegetarian protein and calcium source."},
  {name:"Soybean, cooked (1 cup)",cat:"Indian",cal:298,p:29,c:17,f:15,micro:"Iron, magnesium",note:"One of the higher plant-protein options."},
  {name:"Chickpeas, cooked (1 cup)",cat:"Indian",cal:270,p:15,c:45,f:4,micro:"Fiber, folate",note:"Filling and fiber-rich."},
  {name:"Rajma, cooked (1 cup)",cat:"Indian",cal:225,p:15,c:40,f:1,micro:"Iron, folate",note:"A classic protein-and-fiber pairing."},
  {name:"Mixed vegetables (1 cup, cooked)",cat:"Indian",cal:80,p:3,c:15,f:1,micro:"Vitamin A, C, fiber",note:"Antioxidant-rich, supports overall wellness."},
  {name:"Seasonal fruit (1 medium)",cat:"Indian",cal:70,p:1,c:18,f:0.3,micro:"Vitamin C, potassium",note:"A naturally sweet source of hydration and vitamin C."},
  {name:"Curd/Dahi (1 cup)",cat:"Indian",cal:150,p:8,c:11,f:8,micro:"Calcium, probiotics",note:"Probiotics may support gut and skin balance."},
  {name:"Buttermilk/Chaas (1 glass)",cat:"Indian",cal:40,p:2,c:4,f:1,micro:"Calcium, probiotics",note:"Light, hydrating and easy on digestion."},
  {name:"Eggs (2, whole)",cat:"Indian",cal:155,p:13,c:1,f:11,micro:"Choline, vitamin D, biotin",note:"Biotin and protein support skin and hair health."},
  {name:"Chicken breast, cooked (100g)",cat:"Indian",cal:165,p:31,c:0,f:3.6,micro:"B vitamins, selenium",note:"A lean, versatile protein source."},
  {name:"Fish, cooked (100g)",cat:"Indian",cal:150,p:22,c:0,f:6,micro:"Omega-3, vitamin D",note:"Omega-3s are commonly linked to skin hydration."},
  {name:"Oats (1 cup cooked)",cat:"International",cal:150,p:5,c:27,f:3,micro:"Fiber, magnesium",note:"A steady-release breakfast base."},
  {name:"Cereal, whole grain (1 cup)",cat:"International",cal:180,p:5,c:38,f:2,micro:"Iron (if fortified)",note:"Choose lower-sugar varieties when possible."},
  {name:"Yogurt, plain (1 cup)",cat:"International",cal:150,p:12,c:17,f:4,micro:"Calcium, probiotics",note:"A protein-rich, gut-friendly snack."},
  {name:"Salad, mixed greens + veg (1 bowl)",cat:"International",cal:120,p:3,c:12,f:7,micro:"Vitamin A, C, K",note:"A light, nutrient-dense option."},
  {name:"Sandwich, veggie (1)",cat:"International",cal:280,p:9,c:40,f:9,micro:"Fiber",note:"Whole grain bread adds extra fiber."},
  {name:"Pasta, whole wheat (1 cup)",cat:"International",cal:220,p:8,c:43,f:1.5,micro:"Fiber, B vitamins",note:"Add vegetables and lean protein for balance."},
  {name:"Wrap, grilled veg or chicken (1)",cat:"International",cal:320,p:18,c:35,f:12,micro:"Varies by filling",note:"A portable, balanced meal option."},
  {name:"Soup, vegetable (1 bowl)",cat:"International",cal:110,p:4,c:18,f:2.5,micro:"Vitamin A, C",note:"Warm, hydrating, and light."},
  {name:"Grilled chicken/fish (100g)",cat:"International",cal:180,p:28,c:0,f:7,micro:"B vitamins, omega-3 (fish)",note:"A lean, satisfying protein option."},
  {name:"Smoothie, fruit + yogurt (1 glass)",cat:"International",cal:210,p:7,c:38,f:3,micro:"Vitamin C, calcium",note:"An easy way to add fruit and probiotics."},
];
const FOOD_CATEGORIES=["All","Indian","International"];
const NutritionFoodDB=()=>{
  const [q,setQ]=useState("");
  const [cat,setCat]=useState("All");
  const list=FOOD_DB.filter(f=>(cat==="All"||f.cat===cat)&&(!q.trim()||f.name.toLowerCase().includes(q.trim().toLowerCase())));
  return(
    <div className="sm-card">
      <div className="sm-row" style={{justifyContent:"space-between",flexWrap:"wrap",gap:10,marginBottom:12}}>
        <div><h3 className="sm-card-title" style={{margin:0}}>Food database</h3><p className="sm-card-sub">Approximate values per typical serving. A general reference, not medical advice.</p></div>
        <Seg label="Cuisine" value={cat} onChange={setCat} tabs={FOOD_CATEGORIES.map(c=>[c,c])}/>
      </div>
      <div className="sm-search" style={{marginBottom:12}}>
        <Ic n="search" s={15} c="var(--muted)"/>
        <input className="sm-input" aria-label="Search foods" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search foods (dal, oats, paneer…)"/>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:380,overflowY:"auto",paddingRight:2}}>
        {list.length===0&&<p style={{fontSize:12.5,color:"var(--muted)",textAlign:"center",padding:"14px 0"}}>No foods matched. Try a different search.</p>}
        {list.map(f=>(
          <div key={f.name} style={{padding:"11px 14px",borderRadius:16,background:"rgba(224,235,208,.55)",border:"1px solid var(--border)"}}>
            <div className="sm-row" style={{justifyContent:"space-between",alignItems:"baseline",gap:8}}>
              <span style={{fontSize:13,fontWeight:600,color:"var(--txt)"}}>{f.name}</span>
              <span className="cf" style={{fontSize:14,color:SM.pinkDeep,fontWeight:600,whiteSpace:"nowrap"}}>{f.cal} kcal</span>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:7}}>
              <span className="sm-pill sage" style={{fontSize:10.5,padding:"1px 8px"}}>Protein {f.p}g</span>
              <span className="sm-pill" style={{fontSize:10.5,padding:"1px 8px"}}>Carbs {f.c}g</span>
              <span className="sm-pill pink" style={{fontSize:10.5,padding:"1px 8px"}}>Fat {f.f}g</span>
            </div>
            <div style={{fontSize:11.5,color:"var(--muted)",marginTop:6,lineHeight:1.5}}>{f.micro} · {f.note}</div>
          </div>
        ))}
      </div>
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
  const GOAL=8;
  const pct=Math.round(Math.min(water/GOAL,1)*100);
  const setGlasses=(n)=>{setWater(n);if(n>0)recordActivity("hydration");};
  const generate=async()=>{
    setLoading(true);setErr("");
    LS.set("diet_pref_type",dietType);LS.set("diet_pref_budget",budget);
    try{
      const p=await generateDietPlan(user,results,dietType,budget);
      setPlan(p);LS.set("diet_plan",{...p,_type:dietType,_budget:budget,_ts:Date.now()});
    }catch(e){setErr(friendlyAIError(e));}
    finally{setLoading(false);}
  };
  const R=54,C=2*Math.PI*R;
  const status=water>=GOAL?"Goal reached":water>=6?"Almost there":water>0?"Keep sipping":"Start your day with a glass";
  const mealSlots=[["Breakfast","sun",plan?.meals?.breakfast],["Lunch","leaf",plan?.meals?.lunch],["Dinner","moon",plan?.meals?.dinner],["Snacks","heart",plan?.meals?.snacks],["Drinks","drop",plan?.meals?.drinks]].filter(([,,items])=>items?.length>0);
  return(
    <PageWrap max={920}>
      <PageHeader icon={SCRAP+"nutrition.png"} eyebrow="Wellness" title="Nutrition & Hydration" sub="What you eat and drink shows up in how your skin feels."/>

      {/* Today: hydration + daily goals */}
      <div className="sm-split" style={{marginBottom:26}}>
        <div className="sm-card deep">
          <div className="sm-row" style={{justifyContent:"space-between",marginBottom:14}}>
            <div><div className="sm-eyebrow" style={{color:"#4F6B3E"}}>Water intake</div><h3 className="cf" style={{fontSize:19,fontWeight:600,color:"var(--txt)"}}>Today's hydration</h3></div>
            <span className={`sm-pill ${water>=GOAL?"sage":"pink"}`}>{status}</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:22,flexWrap:"wrap"}}>
            <div style={{position:"relative",width:132,height:132,flexShrink:0}}>
              <svg width="132" height="132" style={{transform:"rotate(-90deg)"}} role="img" aria-label={`${water} of ${GOAL} glasses`}>
                <circle cx="66" cy="66" r={R} fill="rgba(255,252,244,.6)" stroke="rgba(255,252,244,.9)" strokeWidth="10"/>
                <circle cx="66" cy="66" r={R} fill="none" stroke={water>=GOAL?SM.sageDeep:SM.pink} strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C-(pct/100)*C} style={{transition:"stroke-dashoffset .6s ease"}}/>
              </svg>
              <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                <span className="cf" style={{fontSize:32,fontWeight:600,color:"var(--txt)",lineHeight:1}}>{water}</span>
                <span style={{fontSize:11,color:"#4F6B3E"}}>of {GOAL} glasses</span>
              </div>
            </div>
            <div style={{flex:1,minWidth:200}}>
              <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:12}}>
                {Array.from({length:GOAL},(_,i)=>(
                  <button key={i} aria-label={`Set water intake to ${i+1} glasses`} aria-pressed={i<water} onClick={()=>setGlasses(i+1)} style={{width:30,height:30,flexShrink:0,borderRadius:9,border:`1.5px solid ${i<water?SM.sageDeep:"rgba(96,118,72,.35)"}`,background:i<water?SM.sage:"rgba(255,252,244,.7)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s"}}>
                    <Ic n="drop" s={13} c={i<water?"#fff":"#7F9A66"}/>
                  </button>
                ))}
              </div>
              <div className="sm-row" style={{gap:8}}>
                <button className="btn-o" onClick={()=>setGlasses(Math.max(0,water-1))} disabled={water===0} aria-label="Remove a glass" style={{padding:"7px 14px",fontSize:12.5}}>− Glass</button>
                <button className="btn" onClick={()=>setGlasses(Math.min(GOAL,water+1))} disabled={water>=GOAL} aria-label="Add a glass" style={{padding:"7px 16px",fontSize:12.5}}>+ Glass</button>
              </div>
            </div>
          </div>
        </div>
        <div className="sm-card pink">
          <div className="sm-eyebrow" style={{color:SM.pinkDeep}}>Daily goals</div>
          <h3 className="cf" style={{fontSize:19,fontWeight:600,color:"var(--txt)",marginBottom:14}}>Today at a glance</h3>
          <div className="sm-stack" style={{gap:13}}>
            <div>
              <div className="sm-row" style={{justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:12.8,color:"var(--txt)"}}>Water goal</span><span style={{fontSize:12,fontWeight:600,color:SM.pinkDeep}}>{pct}%</span></div>
              <Meter pct={pct} color={SM.pink}/>
            </div>
            <div className="sm-row" style={{justifyContent:"space-between"}}><span style={{fontSize:12.8,color:"var(--txt)"}}>Eating style</span><span className="sm-pill">{plan?._type||dietType}</span></div>
            <div className="sm-row" style={{justifyContent:"space-between"}}><span style={{fontSize:12.8,color:"var(--txt)"}}>Meal plan</span><span className={`sm-pill ${plan?"sage":""}`}>{plan?`${mealSlots.length} meal groups ready`:"Not created yet"}</span></div>
          </div>
        </div>
      </div>

      {/* Personalized plan */}
      <Section title="Your meal plan" sub="Built around your skin and your preferences">
        <div className="sm-card sage" style={{marginBottom:14}}>
          <div className="sm-grid g2" style={{marginBottom:16}}>
            <div><div className="sm-stat-label" style={{marginBottom:7}}>Eating style</div><Seg label="Diet type" value={dietType} onChange={setDietType} tabs={[["Vegetarian","Vegetarian"],["Non-Vegetarian","Non-veg"]]}/></div>
            <div><div className="sm-stat-label" style={{marginBottom:7}}>Budget</div><Seg label="Budget" value={budget} onChange={setBudget} tabs={[["Low","Low"],["Medium","Medium"],["Premium","Premium"]]} tone="pink"/></div>
          </div>
          {err&&<div style={{marginBottom:12}}><ErrorBox message={err} onRetry={generate}/></div>}
          <button className="btn" onClick={generate} disabled={loading} style={{width:"100%"}}>{loading?"Creating your plan…":plan?"Regenerate plan":"Create my meal plan"}</button>
          {!results&&<p style={{fontSize:11.5,color:"var(--muted)",marginTop:10,textAlign:"center"}}>Tip: a skin scan first lets this plan target your real concerns.</p>}
        </div>
        {loading&&<div className="sm-grid g2 r-col"><SkeletonCard/><SkeletonCard/><SkeletonCard/><SkeletonCard/></div>}
        {plan&&!loading&&(
          <div className="sm-stack">
            {plan.summary&&<Note icon="leaf" tone="sage">{plan.summary}</Note>}
            <div className="sm-grid">
              {mealSlots.map(([label,ic,items],idx)=>(
                <div key={label} className="sm-card">
                  <div className="sm-row" style={{marginBottom:12}}><span className={`sm-tile-ic${idx%2?" pink":""}`} style={{width:34,height:34,borderRadius:12}}><Ic n={ic} s={16} c="currentColor"/></span><h3 className="sm-card-title" style={{margin:0}}>{label}</h3></div>
                  <div className="sm-stack" style={{gap:11}}>
                    {items.map((it,i)=>(
                      <div key={i}>
                        <div style={{fontSize:13,fontWeight:600,color:"var(--txt)"}}>{it.food}</div>
                        <div style={{fontSize:12,color:"var(--muted)",lineHeight:1.55,marginTop:1}}>{it.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {plan.avoid?.length>0&&(
              <div className="sm-card pink">
                <h3 className="sm-card-title" style={{color:"#8A4A55"}}>Foods to go easy on</h3>
                <div className="sm-stack" style={{gap:9,marginTop:8}}>
                  {plan.avoid.map((a,i)=>(<div key={i} style={{fontSize:12.8,lineHeight:1.6}}><b style={{color:"var(--txt)"}}>{a.food}</b><span style={{color:"var(--muted)"}}> · {a.reason}</span></div>))}
                </div>
              </div>
            )}
          </div>
        )}
      </Section>

      {plan?.keyNutrients?.length>0&&(
        <Section title="Nutrition guidance" sub="The nutrients most worth prioritizing for you">
          <div className="sm-grid">
            {plan.keyNutrients.map((n,i)=>(
              <div key={i} className="sm-card tight sage">
                <div className="cf" style={{fontSize:16,fontWeight:600,color:"#4F6B3E"}}>{n.nutrient}</div>
                <p style={{fontSize:12.5,color:"var(--txt)",lineHeight:1.65,marginTop:4}}>{n.why}</p>
                {n.sources&&<p style={{fontSize:11.5,color:"var(--muted)",marginTop:6}}>Found in: {n.sources}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {results?.triggers?.length>0&&(
        <Section title="Food and skin links" sub="What your scan suggests to watch">
          <div className="sm-card">
            <div className="sm-stack" style={{gap:15}}>
              {results.triggers.map(t=>(
                <div key={t.food}>
                  <div className="sm-row" style={{justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:13,fontWeight:500,color:"var(--txt)"}}>{t.food}</span><span style={{fontSize:12,fontWeight:600,color:SM.pinkDeep}}>{t.correlation}% link</span></div>
                  <Meter pct={t.correlation} color={SM.pink}/>
                  <p style={{fontSize:12,color:"var(--muted)",marginTop:6,lineHeight:1.55}}>{t.insight}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}

      <Section title="Look something up" sub="Everyday Indian and international foods" style={{marginBottom:0}}>
        <NutritionFoodDB/>
      </Section>
    </PageWrap>
  );
};

const Challenges=()=>{
  const [joined,setJoined]=useState(()=>LS.get("challenges_joined",[]));
  const [progress,setProgress]=useState(()=>LS.get("challenges_progress",{}));
  const [celebrated,setCelebrated]=useState(null);
  const [surprise,setSurprise]=useState(null);
  const [rolling,setRolling]=useState(false);
  const CHALLENGES=[
    {id:"hydration7",icon:"drop",title:"7-Day Hydration",desc:"Drink your planned amount of water each day for 7 days.",duration:7,reward:"Hydration Hero"},
    {id:"glow30",icon:"spark",title:"30-Day Glow",desc:"Complete your morning and night routine every day for 30 days.",duration:30,reward:"Glow Master"},
    {id:"sleep14",icon:"moon",title:"14-Day Better Sleep",desc:"Sleep by 11 PM for 14 consecutive nights to support skin repair.",duration:14,reward:"Rest Royalty"},
    {id:"journal21",icon:"book",title:"21-Day Journal",desc:"Write one journal entry every day for 21 days.",duration:21,reward:"Reflection Champion"},
    {id:"nosugar7",icon:"heart",title:"7-Day Sugar Detox",desc:"Avoid refined sugar for 7 days and track how your skin responds.",duration:7,reward:"Clear Skin Warrior"},
    {id:"selfcare7",icon:"heart",title:"7-Day Self-Care",desc:"Do one intentional self-care act every day for 7 consecutive days.",duration:7,reward:"Self-Love Champion"},
    {id:"morning7",icon:"sun",title:"7-Day Morning Ritual",desc:"Start each morning with your full skincare routine, no skipping.",duration:7,reward:"Morning Star"},
    {id:"walk7",icon:"leaf",title:"7-Day Walk Challenge",desc:"Take a short walk outside every day for 7 days.",duration:7,reward:"Fresh Air Finder"},
    {id:"noskip7",icon:"ok",title:"7-Day No-Skip Skincare",desc:"Don't skip your routine, morning or night, for 7 days straight.",duration:7,reward:"No-Skip Champion"},
    {id:"mindful7",icon:"cycle",title:"7-Day Mindful Moments",desc:"Take 5 quiet minutes for yourself each day for 7 days.",duration:7,reward:"Mindful Soul"},
    {id:"balanced7",icon:"leaf",title:"7-Day Balanced Plate",desc:"Include a fruit or vegetable in every meal for 7 days.",duration:7,reward:"Balanced Bloom"},
    {id:"detox7",icon:"moon",title:"7-Day Digital Detox",desc:"One hour of no screens before bed, every night for 7 days.",duration:7,reward:"Calm Mind"},
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
  const leave=id=>{
    const j=joined.filter(x=>x!==id);setJoined(j);LS.set("challenges_joined",j);
    const p={...progress};delete p[id];setProgress(p);LS.set("challenges_progress",p);
  };
  const SEVEN_DAY_POOL=CHALLENGES.filter(c=>c.duration===7);
  const rollSurprise=()=>{
    setRolling(true);
    setTimeout(()=>{
      const pool=SEVEN_DAY_POOL.filter(c=>c.id!==surprise?.id);
      const list=pool.length?pool:SEVEN_DAY_POOL;
      setSurprise(list[Math.floor(Math.random()*list.length)]);setRolling(false);
    },650);
  };
  const acceptSurprise=()=>{
    if(!surprise)return;
    if(!joined.includes(surprise.id))join(surprise.id);
    setSurprise(null);
  };
  const isDone=(c)=>(progress[c.id]||0)>=c.duration;
  const active=CHALLENGES.filter(c=>joined.includes(c.id)&&!isDone(c));
  const finished=CHALLENGES.filter(c=>joined.includes(c.id)&&isDone(c));
  const discover=CHALLENGES.filter(c=>!joined.includes(c.id));
  const daysLogged=CHALLENGES.filter(c=>joined.includes(c.id)).reduce((n,c)=>n+(progress[c.id]||0),0);

  const ringOf=(pct,done)=>{
    const R=22,C=2*Math.PI*R;
    return(
      <svg width="56" height="56" style={{transform:"rotate(-90deg)",flexShrink:0}} aria-hidden>
        <circle cx="28" cy="28" r={R} fill="rgba(255,252,244,.7)" stroke="rgba(127,154,102,.25)" strokeWidth="5"/>
        <circle cx="28" cy="28" r={R} fill="none" stroke={done?SM.sageDeep:SM.pink} strokeWidth="5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C-(pct/100)*C} style={{transition:"stroke-dashoffset .6s"}}/>
      </svg>
    );
  };

  return(
    <PageWrap max={900}>
      <PageHeader icon={SCRAP+"challenges.png"} eyebrow="Wellness" title="Challenges" sub="Small commitments, just for you. No competition, no pressure."/>

      <div className="sm-grid g3" style={{marginBottom:24}}>
        <div className="sm-stat sage"><div className="sm-stat-label">Active</div><div className="sm-stat-value">{active.length}</div></div>
        <div className="sm-stat pink"><div className="sm-stat-label">Completed</div><div className="sm-stat-value">{finished.length}</div></div>
        <div className="sm-stat"><div className="sm-stat-label">Days logged</div><div className="sm-stat-value">{daysLogged}</div></div>
      </div>

      {celebrated&&(
        <div className="sm-card pink" style={{marginBottom:24,display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}} role="status">
          <span className="sm-tile-ic pink" style={{width:56,height:56,borderRadius:20,background:"#FBF7EC"}}><Ic n="trophy" s={26} c="currentColor"/></span>
          <div style={{flex:1,minWidth:200}}>
            <div className="sm-stamp" style={{marginBottom:8}}>Challenge complete</div>
            <h3 className="cf" style={{fontSize:20,fontWeight:600,color:"var(--txt)"}}>You earned: {celebrated.reward}</h3>
            <p style={{fontSize:12.8,color:"var(--muted)",lineHeight:1.6,marginTop:3}}>Finishing {celebrated.title} takes real steadiness. Well done.</p>
          </div>
          <button onClick={()=>setCelebrated(null)} className="btn-o" style={{fontSize:12.5,padding:"8px 18px"}}>Continue</button>
        </div>
      )}

      <Section title="In progress" sub={active.length?"Check in once each day you complete it":undefined}>
        {active.length===0?(
          <EmptyState icon="trophy" title="Nothing in progress" message="Pick a challenge below, or let Sumi choose a gentle 7-day one for you."/>
        ):(
          <div className="sm-grid">
            {active.map(c=>{
              const prog=progress[c.id]||0,pct=(prog/c.duration)*100;
              return(
                <div key={c.id} className="sm-card sage">
                  <div className="sm-row" style={{gap:14,marginBottom:12}}>
                    <div style={{position:"relative",width:56,height:56,flexShrink:0}}>
                      {ringOf(pct,false)}
                      <span style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",color:"#4F6B3E"}}><Ic n={c.icon} s={18} c="currentColor"/></span>
                    </div>
                    <div style={{minWidth:0}}>
                      <h3 className="cf" style={{fontSize:16.5,fontWeight:600,color:"var(--txt)",lineHeight:1.25}}>{c.title}</h3>
                      <div style={{fontSize:12,color:"#4F6B3E",marginTop:2}}>Day {prog} of {c.duration}</div>
                    </div>
                  </div>
                  <Meter pct={pct} color={SM.pink}/>
                  <p style={{fontSize:12.3,color:"var(--muted)",lineHeight:1.6,margin:"11px 0 14px"}}>{c.desc}</p>
                  <div className="sm-row" style={{gap:8}}>
                    <button className="btn" onClick={()=>tick(c.id)} style={{flex:1,fontSize:12.5,padding:"9px 14px"}}>Check in today</button>
                    <button className="btn-o" onClick={()=>leave(c.id)} title="Leave challenge" style={{fontSize:12,padding:"9px 14px"}}>Leave</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <div className="sm-card tight" style={{marginBottom:26,background:"linear-gradient(135deg,#FBEFEE,#EAF1DE)"}}>
        {!surprise?(
          <div className="sm-row" style={{justifyContent:"space-between",gap:14,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:200}}>
              <h3 className="sm-card-title" style={{margin:0}}>Not sure where to start?</h3>
              <p className="sm-card-sub">Let Sumi pick a gentle 7-day challenge for you.</p>
            </div>
            <button className="btn" onClick={rollSurprise} disabled={rolling} style={{padding:"10px 24px",fontSize:13}}>{rolling?"Choosing…":"Surprise me"}</button>
          </div>
        ):(
          <div style={{animation:rolling?"none":"fadeUp .4s ease"}}>
            <div className="sm-eyebrow" style={{color:SM.pinkDeep}}>Your random challenge</div>
            <div className="sm-row" style={{gap:14,margin:"10px 0",alignItems:"flex-start"}}>
              <span className="sm-tile-ic" style={{width:44,height:44,borderRadius:16}}><Ic n={surprise.icon} s={20} c="currentColor"/></span>
              <div><h3 className="cf" style={{fontSize:18,fontWeight:600,color:"var(--txt)"}}>{surprise.title}</h3><p style={{fontSize:12.5,color:"var(--muted)",lineHeight:1.6}}>{surprise.desc}</p></div>
            </div>
            <div className="sm-row" style={{gap:10,justifyContent:"flex-end",flexWrap:"wrap"}}>
              <button className="btn-o" onClick={rollSurprise} disabled={rolling} style={{fontSize:12.5,padding:"8px 18px"}}>Try another</button>
              <button className="btn" onClick={acceptSurprise} style={{fontSize:12.5,padding:"8px 20px"}}>{joined.includes(surprise.id)?"Already joined":"Accept challenge"}</button>
            </div>
          </div>
        )}
      </div>

      {finished.length>0&&(
        <Section title="Completed" sub="Every one of these was earned">
          <div className="sm-grid">
            {finished.map(c=>(
              <div key={c.id} className="sm-card tight" style={{display:"flex",gap:12,alignItems:"center"}}>
                <span className="sm-tile-ic" style={{background:SM.sage,color:"#fff",borderColor:SM.sage}}><Ic n="ok" s={18} c="currentColor"/></span>
                <div style={{minWidth:0,flex:1}}><div style={{fontSize:13.5,fontWeight:600,color:"var(--txt)"}}>{c.title}</div><div className="sm-row" style={{gap:5,fontSize:11.5,color:"var(--muted)"}}><Ic n="trophy" s={11} c={SM.gold}/>{c.reward}</div></div>
                <button className="btn-o" onClick={()=>leave(c.id)} style={{fontSize:11.5,padding:"6px 12px"}}>Restart</button>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Find your next one" sub={`${discover.length} to choose from`} style={{marginBottom:0}}>
        <div className="sm-grid">
          {discover.map((c,i)=>(
            <div key={c.id} className="sm-card tight" style={{display:"flex",flexDirection:"column",gap:10}}>
              <div className="sm-row" style={{justifyContent:"space-between"}}>
                <span className={`sm-tile-ic${i%2?" pink":""}`}><Ic n={c.icon} s={18} c="currentColor"/></span>
                <span className={`sm-pill ${c.duration>=21?"pink":"sage"}`} style={{fontSize:10.5}}>{c.duration} days</span>
              </div>
              <div><div style={{fontSize:14,fontWeight:600,color:"var(--txt)"}}>{c.title}</div><p style={{fontSize:12,color:"var(--muted)",lineHeight:1.6,marginTop:3}}>{c.desc}</p></div>
              <div className="sm-row" style={{justifyContent:"space-between",marginTop:"auto"}}>
                <span className="sm-row" style={{gap:5,fontSize:11,color:"var(--muted)"}}><Ic n="trophy" s={11} c={SM.gold}/>{c.reward}</span>
                <button className="btn-o" onClick={()=>join(c.id)} style={{fontSize:12,padding:"7px 16px"}}>Join</button>
              </div>
            </div>
          ))}
          {discover.length===0&&<p style={{fontSize:13,color:"var(--muted)"}}>You've joined every challenge. Beautiful.</p>}
        </div>
      </Section>
    </PageWrap>
  );
};

const Analytics=({scans,onNav})=>{
  const [tab,setTab]=useState("overview");
  const [range,setRange]=useState("all");
  const progress=computeProgress(scans||[]);
  const series=progress.series;
  const shown=range==="recent"?series.slice(-7):series;
  const goScan=onNav?()=>onNav("scan"):null;
  /* Concern history — how often each concern has come up across every
     check-in, scan or quiz alike. Plain frequency counts, never turned
     into a medical score, per the Skin Quiz spec's Analytics section. */
  const concernFreq=Object.entries((scans||[]).reduce((m,s)=>{(s.concerns||[]).forEach(c=>{m[c.name]=(m[c.name]||0)+1;});return m;},{})).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const sourceLabel=(s)=>s.source==="skin_quiz"?"Quiz":s.source==="combined"?"Scan + Quiz":"Scan";
  const tooltipStyle={background:"#FFFCF3",border:"1px solid rgba(112,132,86,.3)",borderRadius:12,color:"#4E5138",fontSize:11,boxShadow:"0 6px 18px rgba(86,100,60,.14)"};
  const axis={tick:{fill:"#6E7A59",fontSize:10},axisLine:false,tickLine:false};
  const METRICS=[["overallScore","Overall",SM.sageDeep,""],["hydrationLevel","Hydration",SM.sage,"%"],["elasticity","Elasticity",SM.pink,"%"],["brightness","Brightness",SM.red,"%"]];
  const avg=(k)=>series.length?Math.round(series.reduce((a,s)=>a+(s[k]||0),0)/series.length):0;

  /* Habits ↔ skin: for every scan, how many of the 7 days up to and
     including it had any logged activity. Real data only. */
  const acts=LS.get("activities",{});
  const activeDaysBefore=(ts)=>{let n=0;for(let i=0;i<7;i++){const k=new Date(ts-i*86400000).toISOString().split("T")[0];if(acts[k]?.length)n++;}return n;};
  const paired=(scans||[]).filter(s=>s.ts).map(s=>({...s,active:activeDaysBefore(s.ts)}));
  const steady=paired.filter(s=>s.active>=5),lighter=paired.filter(s=>s.active<5);
  const mean=(arr,k)=>{const vals=arr.map(s=>s[k]).filter(v=>v!=null);return vals.length?Math.round(vals.reduce((a,v)=>a+v,0)/vals.length):0;};
  const canCompare=steady.length>0&&lighter.length>0;

  const days28=lastDaysActivity(28);
  const activeDays=days28.filter(d=>d.acts.length>0).length;
  const mix=Object.keys(ACT_LABELS).map(k=>[k,lastDaysActivity(30).filter(d=>d.acts.includes(k)).length]).sort((a,b)=>b[1]-a[1]);
  const mixMax=Math.max(1,...mix.map(m=>m[1]));
  const streak=calcStreak();
  const todayHabits=LS.get("habits3",DEFAULT_HABITS);
  const todayDone=todayHabits.filter(h=>h.done).length;
  const todayWater=LS.get("water_today",0);
  const level=(n)=>n>=4?"l3":n>=2?"l2":n>=1?"l1":"";

  return(
    <PageWrap max={940}>
      <PageHeader icon={SCRAP+"analytics.png"} eyebrow="My Skin" title="Analytics" sub="How your skin and your habits are moving over time."
        right={<Seg label="Analytics sections" value={tab} onChange={setTab} tabs={[["overview","Trends"],["history","Scan history"],["habits","Habits"]]}/>}/>

      {tab==="overview"&&(
        !series.length?(
          <EmptyState icon="chart" title="Trends start with your first scan" message="Once you've scanned, this page charts hydration, brightness and more, scan by scan." actionLabel={goScan?"Start your first scan":undefined} onAction={goScan}/>
        ):(
          <div className="sm-stack" style={{gap:18}}>
            <div className="sm-grid g4">
              {METRICS.map(([k,l,c,u])=>{
                const vals=series.map(s=>s[k]||0);
                const cur=vals[vals.length-1];
                const d=vals.length>1?cur-vals[vals.length-2]:null;
                return(
                  <div key={k} className="sm-stat">
                    <div className="sm-stat-label">{l}</div>
                    <div className="sm-stat-value">{cur}<small>{u}</small></div>
                    <div className="sm-row" style={{justifyContent:"space-between",marginTop:8}}>
                      {d!=null?<Delta value={d} unit={u}/>:<span className="sm-stat-sub" style={{margin:0}}>First scan</span>}
                      <Sparkline data={vals.slice(-8)} color={c} w={64} h={26}/>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="sm-card">
              <div className="sm-row" style={{justifyContent:"space-between",flexWrap:"wrap",gap:10,marginBottom:10}}>
                <div><h3 className="sm-card-title" style={{margin:0}}>Skin health trends</h3><p className="sm-card-sub">{shown.length} scan{shown.length===1?"":"s"} shown</p></div>
                <Seg label="Range" value={range} onChange={setRange} tabs={[["recent","Recent"],["all","All time"]]}/>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={shown}>
                  <defs>
                    <linearGradient id="ag1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={SM.sage} stopOpacity={0.35}/><stop offset="95%" stopColor={SM.sage} stopOpacity={0}/></linearGradient>
                    <linearGradient id="ag2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={SM.pink} stopOpacity={0.35}/><stop offset="95%" stopColor={SM.pink} stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 4" stroke="rgba(127,154,102,.25)"/>
                  <XAxis dataKey="date" {...axis}/><YAxis {...axis}/>
                  <Tooltip contentStyle={tooltipStyle}/>
                  <Area type="monotone" dataKey="hydrationLevel" stroke={SM.sage} fill="url(#ag1)" strokeWidth={2.4} name="Hydration"/>
                  <Area type="monotone" dataKey="brightness" stroke={SM.pink} fill="url(#ag2)" strokeWidth={2.4} name="Brightness"/>
                </AreaChart>
              </ResponsiveContainer>
              <div className="sm-row" style={{gap:16,marginTop:6,fontSize:11.5,color:"var(--muted)"}}><span className="sm-row" style={{gap:6}}><i style={{width:10,height:10,borderRadius:"50%",background:SM.sage}}/>Hydration</span><span className="sm-row" style={{gap:6}}><i style={{width:10,height:10,borderRadius:"50%",background:SM.pink}}/>Brightness</span></div>
            </div>

            <div className="sm-split" style={{gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)"}}>
              <div className="sm-card sage">
                <h3 className="sm-card-title">Then and now</h3>
                <p className="sm-card-sub" style={{marginBottom:12}}>First scan, your average, and your latest</p>
                <div style={{display:"grid",gridTemplateColumns:"1.3fr 1fr 1fr 1fr",gap:"9px 8px",fontSize:12.5,alignItems:"center"}}>
                  <span/><b style={{color:"var(--muted)",fontWeight:500,fontSize:11}}>First</b><b style={{color:"var(--muted)",fontWeight:500,fontSize:11}}>Average</b><b style={{color:"var(--muted)",fontWeight:500,fontSize:11}}>Latest</b>
                  {METRICS.map(([k,l])=>(
                    <Fragment key={k}>
                      <span style={{color:"var(--txt)"}}>{l}</span>
                      <span>{series[0][k]||0}</span><span>{avg(k)}</span><b style={{color:SM.sageDeep}}>{series[series.length-1][k]||0}</b>
                    </Fragment>
                  ))}
                </div>
              </div>
              <div className="sm-card">
                <h3 className="sm-card-title">Overall score</h3>
                <p className="sm-card-sub" style={{marginBottom:6}}>Scan by scan</p>
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={shown}>
                    <CartesianGrid strokeDasharray="3 4" stroke="rgba(127,154,102,.25)"/>
                    <XAxis dataKey="date" {...axis}/><YAxis {...axis}/>
                    <Tooltip contentStyle={tooltipStyle}/>
                    <Line type="monotone" dataKey="overallScore" stroke={SM.red} strokeWidth={2.5} dot={{fill:SM.cream,stroke:SM.red,strokeWidth:2,r:3.5}} name="Overall"/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )
      )}

      {tab==="history"&&(
        !series.length?(
          <EmptyState icon="camera" title="No check-ins yet" message="Every scan or quiz you complete is saved here so you can look back on it." actionLabel={onNav?"Start Skin Analysis":undefined} onAction={onNav?()=>onNav("myskin"):null}/>
        ):(
          <div className="sm-stack" style={{gap:22}}>
            {concernFreq.length>0&&(
              <div className="sm-card">
                <h3 className="sm-card-title">Concern history</h3>
                <p className="sm-card-sub" style={{marginBottom:14}}>How often each concern has come up across your scans and quizzes. Just a count, never a medical score.</p>
                <div className="sm-stack" style={{gap:10}}>
                  {concernFreq.map(([name,count])=>(
                    <div key={name} className="sm-row" style={{justifyContent:"space-between"}}>
                      <span style={{fontSize:13,color:"var(--txt)"}}>{name}</span>
                      <span className="sm-pill sage" style={{fontSize:10.5}}>{count} check-in{count===1?"":"s"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="sm-stack" style={{gap:10}}>
              {[...(scans||[])].reverse().map((s,i)=>(
                <div key={s.ts||i} className="sm-card tight" style={{display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"}}>
                  {s.thumb?<img src={s.thumb} alt="" style={{width:52,height:52,borderRadius:14,objectFit:"cover",flexShrink:0}}/>:<span className="sm-tile-ic" style={{width:52,height:52,borderRadius:14}}><Ic n={s.source==="skin_quiz"?"book":"camera"} s={20} c="currentColor"/></span>}
                  <div style={{flex:"1 1 150px",minWidth:0}}>
                    <div className="sm-row" style={{gap:8}}><span style={{fontSize:13.5,fontWeight:600,color:"var(--txt)"}}>{s.date}</span><span className="sm-pill" style={{fontSize:9.5,padding:"2px 8px"}}>{sourceLabel(s)}</span></div>
                    <div style={{fontSize:11.5,color:"var(--muted)"}}>{[s.skinType&&`${s.skinType} skin`,s.concerns?.[0]?.name&&`Top focus: ${s.concerns[0].name}`].filter(Boolean).join(" · ")||"Skin analysis"}</div>
                  </div>
                  <div style={{display:"flex",gap:14}}>
                    {[["Overall",s.overallScore,""],["Hydration",s.hydrationLevel,"%"],["Bright",s.brightness,"%"]].map(([l,v,u])=>(
                      <div key={l} style={{textAlign:"center"}}><div className="cf" style={{fontSize:17,fontWeight:600,color:"var(--txt)"}}>{v??"–"}{v!=null?u:""}</div><div style={{fontSize:10,color:"var(--muted)"}}>{l}</div></div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {tab==="habits"&&(
        <div className="sm-stack" style={{gap:18}}>
          <div className="sm-grid g4">
            <div className="sm-stat sage"><div className="sm-stat-label">Active days</div><div className="sm-stat-value">{activeDays}<small>of 28</small></div></div>
            <div className="sm-stat pink"><div className="sm-stat-label">Current streak</div><div className="sm-stat-value">{streak}<small>{streak===1?"day":"days"}</small></div></div>
            <div className="sm-stat"><div className="sm-stat-label">Habits today</div><div className="sm-stat-value">{todayDone}<small>of {todayHabits.length}</small></div></div>
            <div className="sm-stat"><div className="sm-stat-label">Water today</div><div className="sm-stat-value">{todayWater}<small>of 8</small></div></div>
          </div>

          <div className="sm-split" style={{gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)"}}>
            <div className="sm-card">
              <h3 className="sm-card-title">Last 4 weeks</h3>
              <p className="sm-card-sub" style={{marginBottom:12}}>Each square is a day. Deeper green means more logged.</p>
              <div className="sm-cal" role="img" aria-label={`${activeDays} active days in the last 28`}>
                {days28.map((d,i)=><i key={d.key} className={`${level(d.acts.length)}${i===days28.length-1?" today":""}`} title={`${d.key}: ${d.acts.length} logged`}/>)}
              </div>
              <div className="sm-row" style={{gap:6,marginTop:12,fontSize:10.5,color:"var(--muted)"}}>Less<div className="sm-cal" style={{gridTemplateColumns:"repeat(4,14px)",gap:4}}><i/><i className="l1"/><i className="l2"/><i className="l3"/></div>More</div>
            </div>
            <div className="sm-card sage">
              <h3 className="sm-card-title">What you've been doing</h3>
              <p className="sm-card-sub" style={{marginBottom:12}}>Days with each kind of activity, last 30 days</p>
              <div className="sm-stack" style={{gap:12}}>
                {mix.map(([k,n],i)=>(
                  <div key={k}>
                    <div className="sm-row" style={{justifyContent:"space-between",fontSize:12.5,marginBottom:5}}><span style={{color:"var(--txt)"}}>{ACT_LABELS[k]}</span><span style={{color:"var(--muted)"}}>{n} day{n===1?"":"s"}</span></div>
                    <Meter pct={(n/mixMax)*100} color={i%2?SM.pink:SM.sage}/>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="sm-card pink">
            <h3 className="sm-card-title">Habits and your skin</h3>
            {canCompare?(
              <>
                <p className="sm-card-sub" style={{marginBottom:12}}>Scans taken after a steadier week (5+ active days) compared with lighter weeks.</p>
                <div className="sm-grid g2">
                  {[["Steadier weeks",steady],["Lighter weeks",lighter]].map(([l,arr])=>(
                    <div key={l} className="sm-stat" style={{background:"rgba(255,252,244,.7)"}}>
                      <div className="sm-stat-label">{l} · {arr.length} scan{arr.length===1?"":"s"}</div>
                      <div style={{display:"flex",gap:18,marginTop:6}}>
                        <div><div className="cf" style={{fontSize:20,fontWeight:600,color:"var(--txt)"}}>{mean(arr,"hydrationLevel")}%</div><div style={{fontSize:10.5,color:"var(--muted)"}}>hydration</div></div>
                        <div><div className="cf" style={{fontSize:20,fontWeight:600,color:"var(--txt)"}}>{mean(arr,"overallScore")}</div><div style={{fontSize:10.5,color:"var(--muted)"}}>overall</div></div>
                      </div>
                    </div>
                  ))}
                </div>
                <p style={{fontSize:11.5,color:"var(--muted)",marginTop:10,lineHeight:1.6}}>A pattern, not a promise: with only a few scans, small differences can be noise.</p>
              </>
            ):(
              <p className="sm-card-sub" style={{marginTop:4,lineHeight:1.7}}>{paired.length===0?"Scan your skin and log a few habits, and Sumi will show how a steady week lines up with your results.":"Once you have scans after both steadier and lighter weeks, this will compare them side by side."}</p>
            )}
          </div>
        </div>
      )}
    </PageWrap>
  );
};

const Journey=({scans,onNav})=>{
  const list=scans||[];
  const journal=LS.get("glowJournal",[]);
  const joinedChallenges=LS.get("challenges_joined",[]);
  const streak=calcStreak();
  const goMyskin=onNav?()=>onNav("myskin"):null;
  const prog=computeProgress(list);
  const first=list[0],latest=list[list.length-1];
  const daysSince=first?.ts?Math.max(0,Math.round((Date.now()-first.ts)/86400000)):0;
  const quizCount=list.filter(s=>s.source==="skin_quiz"||s.source==="combined").length;
  const scanCount=list.filter(s=>s.source!=="skin_quiz").length;
  const milestones=[
    {label:"First check-in",done:list.length>=1,icon:"camera"},
    {label:"3 check-ins",done:list.length>=3,icon:"chart"},
    {label:"7-day streak",done:streak>=7,icon:"spark"},
    {label:"First journal entry",done:journal.length>=1,icon:"book"},
    {label:"Skin Quiz completed",done:quizCount>=1,icon:"book"},
    {label:"5 check-ins",done:list.length>=5,icon:"star"},
    {label:"Joined a challenge",done:joinedChallenges.length>=1,icon:"trophy"},
  ];
  const doneCount=milestones.filter(m=>m.done).length;
  /* Only compare numeric fields when BOTH ends of the comparison actually
     have them — a quiz-only entry has no hydration/elasticity/brightness
     to measure, and showing "0" or a fabricated delta there would be
     exactly the kind of invented improvement the quiz spec warns against. */
  const changes=(prog.hasComparison&&first.overallScore!=null&&latest.overallScore!=null)?[["Overall","overallScore",""],["Hydration","hydrationLevel","%"],["Elasticity","elasticity","%"],["Brightness","brightness","%"]].filter(([,k])=>latest[k]!=null&&first[k]!=null).map(([l,k,u])=>({l,u,now:latest[k],delta:latest[k]-first[k]})):[];
  const scanDelta=(i)=>(i>0&&list[i].overallScore!=null&&list[i-1].overallScore!=null)?list[i].overallScore-list[i-1].overallScore:null;
  const sourceLabel=(s)=>s.source==="skin_quiz"?"Quiz":s.source==="combined"?"Scan + Quiz":"Scan";

  return(
    <PageWrap max={860}>
      <PageHeader icon={SCRAP+"my_journey.png"} eyebrow="My Skin" title="My Journey" sub="Your skin, told check-in by check-in."
        right={goMyskin&&<button className="btn-o" onClick={goMyskin} style={{display:"flex",alignItems:"center",gap:7,fontSize:12.5,padding:"9px 16px"}}><Ic n="plus" s={13} c="currentColor"/>New check-in</button>}/>

      {!list.length?(
        <EmptyState icon="spark" title="Your journey starts here" message="Complete an AI Skin Scan or the Skin Quiz and Sumi will begin building your personal timeline." actionLabel={goMyskin?"Start Skin Analysis":undefined} onAction={goMyskin}/>
      ):(
        <>
          <div className="sm-grid g4" style={{marginBottom:22}}>
            <div className="sm-stat sage"><div className="sm-stat-label">Check-ins</div><div className="sm-stat-value">{list.length}</div><div style={{fontSize:10.5,color:"var(--muted)",marginTop:4}}>{scanCount} scan{scanCount===1?"":"s"} · {quizCount} quiz{quizCount===1?"":"zes"}</div></div>
            <div className="sm-stat"><div className="sm-stat-label">Journey length</div><div className="sm-stat-value">{daysSince}<small>{daysSince===1?"day":"days"}</small></div></div>
            <div className="sm-stat pink"><div className="sm-stat-label">Streak</div><div className="sm-stat-value">{streak}<small>{streak===1?"day":"days"}</small></div></div>
            <div className="sm-stat"><div className="sm-stat-label">Journal entries</div><div className="sm-stat-value">{journal.length}</div></div>
          </div>

          <Section title="Milestones" sub={`${doneCount} of ${milestones.length} reached`}>
            <div className="sm-scroll-x" style={{flexWrap:"wrap",overflow:"visible"}}>
              {milestones.map(m=>(
                <span key={m.label} className={`sm-pill ${m.done?"sage":""}`} style={{padding:"7px 14px",fontSize:12,opacity:m.done?1:.62,borderStyle:m.done?"solid":"dashed"}}>
                  <Ic n={m.done?"ok":m.icon} s={13} c="currentColor"/>{m.label}
                </span>
              ))}
            </div>
          </Section>

          {changes.length>0&&(
            <Section title="How your skin has changed" sub={`From your first scan (${first.date}) to now`}>
              <div className="sm-grid g4">
                {changes.map(c=>(
                  <div key={c.l} className="sm-stat">
                    <div className="sm-stat-label">{c.l}</div>
                    <div className="sm-stat-value">{c.now}<small>{c.u}</small></div>
                    <div style={{marginTop:8}}><Delta value={c.delta} unit={c.u} suffix=" overall"/></div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="Check-in history" sub="Newest first" style={{marginBottom:0}}>
            <div className="sm-timeline">
              {[...list].map((s,i)=>({s,i})).reverse().map(({s,i})=>{
                const d=scanDelta(i);
                return(
                  <div key={s.ts||i} className="sm-tl-item">
                    <span className={`sm-tl-dot${i===list.length-1?" pink":""}`}/>
                    <div className="sm-card tight">
                      <div className="sm-row" style={{justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:8}}>
                        <div className="sm-row" style={{gap:8}}>
                          <span style={{fontSize:13.5,fontWeight:600,color:"var(--txt)"}}>{s.date}</span>
                          <span className="sm-pill" style={{fontSize:10.5,padding:"1px 9px"}}>{sourceLabel(s)}</span>
                          {i===list.length-1&&<span className="sm-pill pink" style={{fontSize:10.5,padding:"1px 9px"}}>Latest</span>}
                        </div>
                        <div className="sm-row" style={{gap:8}}>
                          {d!=null&&<Delta value={d} suffix=" vs previous"/>}
                          {s.overallScore!=null&&<span className="cf" style={{fontSize:20,fontWeight:600,color:SM.sageDeep}}>{s.overallScore}</span>}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                        {s.thumb&&<img src={s.thumb} alt="" style={{width:64,height:64,objectFit:"cover",borderRadius:14,flexShrink:0}}/>}
                        <div style={{minWidth:0}}>
                          <p style={{fontSize:12.5,color:"var(--muted)",lineHeight:1.65}}>{s.summary||"Skin analysis completed. Open your report for personalized insights."}</p>
                          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
                            {s.skinType&&<span className="sm-pill sage" style={{fontSize:10.5,padding:"1px 9px"}}>{s.skinType}</span>}
                            {s.concerns?.slice(0,3).map(c=><span key={c.name} className="sm-pill pink" style={{fontSize:10.5,padding:"1px 9px"}}>{c.name}</span>)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        </>
      )}
    </PageWrap>
  );
};

const MonthlyStory=({user,scans,habits,journalEntries})=>{
  const now=new Date();
  const month=now.toLocaleDateString("en-IN",{month:"long",year:"numeric"});
  const monthName=now.toLocaleDateString("en-IN",{month:"long"});
  const firstName=user?.name?.split(" ")[0]||"you";
  const inMonth=(ts)=>{if(!ts)return false;const d=new Date(ts);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();};
  const monthScans=(scans||[]).filter(s=>inMonth(s.ts));
  const monthEntries=(journalEntries||[]).filter(e=>inMonth(e.ts));
  const monthPrefix=now.toISOString().slice(0,7);
  const activeDays=lastDaysActivity(62).filter(d=>d.key.startsWith(monthPrefix)&&d.acts.length>0).length;
  const habitDone=habits?.filter(h=>h.done).length||0;
  const habitTotal=habits?.length||6;
  /* Most-felt mood + a line in the person's own words, both from real entries. */
  const moodCounts=monthEntries.reduce((m,e)=>{if(e.mood)m[e.mood]=(m[e.mood]||0)+1;return m;},{});
  const topMood=Object.entries(moodCounts).sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
  const gratitude=monthEntries.find(e=>e.gratitude&&e.gratitude.trim())?.gratitude||null;
  const mFirst=monthScans[0],mLast=monthScans[monthScans.length-1];
  const skinLine=(monthScans.length>=2&&mFirst&&mLast&&mFirst.hydrationLevel!=null&&mLast.hydrationLevel!=null)?[["Hydration","hydrationLevel"],["Brightness","brightness"],["Elasticity","elasticity"]].filter(([,k])=>mFirst[k]!=null&&mLast[k]!=null).map(([l,k])=>({l,d:mLast[k]-mFirst[k]})):[];
  /* What the month's check-ins (scan or quiz) actually focused on, in
     the person's own reported/observed concerns — never invented. */
  const monthConcernCounts=monthScans.reduce((m,s)=>{(s.concerns||[]).forEach(c=>{m[c.name]=(m[c.name]||0)+1;});return m;},{});
  const topMonthConcerns=Object.entries(monthConcernCounts).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([n])=>n);
  const highlights=[
    {icon:"chart",label:"Skin check-ins",value:monthScans.length},
    {icon:"book",label:"Journal entries",value:monthEntries.length},
    {icon:"calendar",label:"Active days",value:activeDays},
    {icon:"ok",label:"Habits done today",value:`${habitDone}/${habitTotal}`},
  ];
  const [shareMsg,setShareMsg]=useState("");
  const summaryText=`My ${month} with Sumi: ${monthScans.length} skin check-in${monthScans.length===1?"":"s"}, ${monthEntries.length} journal entr${monthEntries.length===1?"y":"ies"}, ${activeDays} active day${activeDays===1?"":"s"}.`;
  const flash=(m)=>{setShareMsg(m);setTimeout(()=>setShareMsg(""),2200);};
  const share=async()=>{
    try{
      if(navigator.share){await navigator.share({title:`My ${month} story`,text:summaryText});return;}
      await navigator.clipboard.writeText(summaryText);flash("Copied to clipboard");
    }catch{/* share sheet dismissed */}
  };
  const save=()=>{
    const body=[`Sumi story · ${month}`,"",summaryText,topMood?`Most felt mood: ${topMood}`:null,gratitude?`A line I wrote: "${gratitude}"`:null].filter(x=>x!==null).join("\n");
    const url=URL.createObjectURL(new Blob([body],{type:"text/plain"}));
    const a=document.createElement("a");a.href=url;a.download=`sumi-story-${monthPrefix}.txt`;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),500);flash("Story saved");
  };

  return(
    <PageWrap max={720}>
      <PageHeader icon={SCRAP+"monthly_story.png"} eyebrow="Monthly story" title={`${monthName}, in review`} sub={`A little journal of your month, ${firstName}.`}/>

      <div className="sm-paper" style={{marginTop:18}}>
        <span className="sm-tape"/>
        <div className="sm-row" style={{justifyContent:"space-between",flexWrap:"wrap",gap:10,marginBottom:20}}>
          <h2 className="cf" style={{fontSize:24,fontWeight:600,color:"var(--txt)"}}>{month}</h2>
          <span className="sm-stamp">This month</span>
        </div>

        <div className="sm-grid g2" style={{marginBottom:24}}>
          {highlights.map((h,i)=>(
            <div key={h.label} className="sm-stitch" style={{padding:"14px 16px",background:i%3===0?"rgba(224,235,208,.6)":i===1?"rgba(248,230,229,.7)":"rgba(255,252,244,.8)",display:"flex",alignItems:"center",gap:12}}>
              <span className={`sm-tile-ic${i===1?" pink":""}`} style={{width:36,height:36,borderRadius:12}}><Ic n={h.icon} s={16} c="currentColor"/></span>
              <div><div className="cf" style={{fontSize:24,fontWeight:600,color:"var(--txt)",lineHeight:1.1}}>{h.value}</div><div style={{fontSize:11.5,color:"var(--muted)"}}>{h.label}</div></div>
            </div>
          ))}
        </div>

        <div className="sm-stack" style={{gap:20}}>
          <div>
            <div className="sm-eyebrow">Your skin</div>
            {skinLine.length?(
              <div className="sm-row" style={{gap:8,flexWrap:"wrap",marginTop:8}}>
                {skinLine.map(s=><span key={s.l} className="sm-row" style={{gap:6,fontSize:13,color:"var(--txt)"}}>{s.l}<Delta value={s.d} unit="%"/></span>)}
              </div>
            ):topMonthConcerns.length?(
              <p style={{fontSize:13,color:"var(--txt)",marginTop:6,lineHeight:1.7}}>Your skin check-ins this month focused mostly on <b>{topMonthConcerns.join(" and ").toLowerCase()}</b>.</p>
            ):<p style={{fontSize:13,color:"var(--muted)",marginTop:6,lineHeight:1.7}}>{monthScans.length===1?"One check-in so far this month. A second one will show how things are shifting.":"No check-ins yet this month. A quick scan or quiz will add your skin to this page."}</p>}
          </div>
          <div>
            <div className="sm-eyebrow">How you felt</div>
            {topMood?<div className="sm-row" style={{gap:10,marginTop:8}}><MoodFace mood={topMood} size={34}/><span style={{fontSize:13.5,color:"var(--txt)"}}>Mostly <b>{topMood.toLowerCase()}</b> across {monthEntries.length} entr{monthEntries.length===1?"y":"ies"}.</span></div>
              :<p style={{fontSize:13,color:"var(--muted)",marginTop:6,lineHeight:1.7}}>Moods you log in your Glow Journal will gather here.</p>}
          </div>
          {gratitude&&(
            <div>
              <div className="sm-eyebrow">In your words</div>
              <p className="sm-hand" style={{marginTop:6}}>“{gratitude}”</p>
            </div>
          )}
          <div style={{borderTop:"1px dashed rgba(127,154,102,.5)",paddingTop:16}}>
            <div className="sm-eyebrow" style={{color:SM.pinkDeep}}>A note from Sumi</div>
            <p className="sm-hand" style={{marginTop:6}}>Not every day was perfect, and that's okay. You kept building habits with intention and learning about your body. That's real progress, {firstName}.</p>
          </div>
        </div>
      </div>

      <div className="sm-grid g2" style={{marginTop:22}}>
        <button className="btn" onClick={share} style={{display:"flex",alignItems:"center",gap:8,justifyContent:"center",fontSize:13}}><Ic n="share" s={15}/>Share story</button>
        <button className="btn-o" onClick={save} style={{display:"flex",alignItems:"center",gap:8,justifyContent:"center",fontSize:13}}><Ic n="dl" s={15}/>Save story</button>
      </div>
      <p role="status" aria-live="polite" style={{textAlign:"center",fontSize:12,color:SM.sageDeep,marginTop:10,minHeight:18}}>{shareMsg}</p>
    </PageWrap>
  );
};

/* Cycle Tracker lives in ./cycle/ (MenstrualTracker + wheel, timeline, hormone graph,
   full-screen period calendar, history, settings). PHASES / PHASE_CONTENT / TOPIC_CARDS
   moved verbatim to ./cycle/cycleContent.js. */

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
    <PageWrap max={760}>
      <PageHeader icon={SCRAP+"skin_forecast.png"} eyebrow="My Skin" title="Today's Skin Forecast" sub="Real-time weather, translated into what your skin needs today."/>

      {status==="idle"&&(
        <div className="sm-card sage" style={{textAlign:"center",padding:"32px 24px"}}>
          <div className="sm-empty-ic"><Ic n="forecast" s={26} c="currentColor"/></div>
          <h3 className="cf" style={{fontSize:19,fontWeight:600,color:"var(--txt)",marginBottom:6}}>Where are you today?</h3>
          <p style={{fontSize:13,color:"var(--muted)",marginBottom:18,lineHeight:1.7,maxWidth:380,margin:"0 auto 18px"}}>Share your location for a personalized forecast, or enter your city. Nothing is stored beyond this session.</p>
          <button className="btn" onClick={useMyLocation} style={{marginBottom:12}}>Use my location</button>
          <div><button className="btn-text" onClick={()=>setStatus("manual")} style={{color:"var(--muted)",fontWeight:500}}>Enter a city instead</button></div>
        </div>
      )}
      {(status==="locating"||status==="loading")&&(
        <div className="sm-stack">
          <div className="sm-card">
            <p style={{fontSize:12.5,color:"var(--muted)",marginBottom:14}} role="status">{status==="locating"?"Getting your location…":"Loading today's forecast…"}</p>
            <Skeleton rows={2} height={20}/>
          </div>
          <SkeletonCard/>
          <SkeletonCard/>
        </div>
      )}
      {status==="manual"&&(
        <div className="sm-card sage">
          {err&&<Note icon="alert" tone="pink" style={{marginBottom:14}}>{err}</Note>}
          <label htmlFor="fc-city" style={{fontSize:13,color:"var(--txt)",fontWeight:500,display:"block",marginBottom:10}}>Which city?</label>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <input id="fc-city" className="sm-input" value={cityInput} onChange={e=>setCityInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submitCity()} placeholder="e.g. Kolkata" style={{flex:1,minWidth:170,width:"auto"}}/>
            <button className="btn" onClick={submitCity} style={{padding:"10px 22px"}}>Get forecast</button>
          </div>
        </div>
      )}
      {status==="error"&&(
        <div className="sm-card pink" style={{textAlign:"center"}}>
          <p style={{fontSize:13,color:"#8A4A55",marginBottom:14,lineHeight:1.6}}>{err}</p>
          <button className="btn" onClick={()=>setStatus("manual")}>Try a city instead</button>
        </div>
      )}
      {status==="ready"&&weather&&(
        <div className="sm-stack" style={{gap:16}}>
          <div className="sm-card deep" style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:18}}>
            <div>
              <div className="sm-eyebrow" style={{color:"#4F6B3E"}}>{place}</div>
              <div className="cf" style={{fontSize:46,fontWeight:600,color:"var(--txt)",lineHeight:1.05,margin:"4px 0"}}>{weather.temp}°C</div>
              <div style={{fontSize:14,color:"#4F6B3E",fontWeight:500}}>{weather.condition}</div>
            </div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              {[["UV index",weather.uv,""],["Humidity",weather.humidity,"%"],...(weather.aqi!=null?[["AQI",weather.aqi,""]]:[])].map(([l,v,u])=>(
                <div key={l} style={{textAlign:"center",padding:"10px 16px",borderRadius:18,background:"rgba(255,252,244,.72)",minWidth:78}}>
                  <div className="cf" style={{fontSize:20,fontWeight:600,color:"var(--txt)"}}>{v}{u}</div>
                  <div style={{fontSize:10.5,color:"var(--muted)"}}>{l}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="sm-grid g2">
            <div className="sm-card">
              <div className="sm-row" style={{marginBottom:8}}><span className="sm-tile-ic pink" style={{width:34,height:34,borderRadius:12}}><Ic n="sun" s={17} c="currentColor"/></span><h3 className="sm-card-title" style={{margin:0}}>Sunscreen</h3></div>
              <p style={{fontSize:12.8,color:"var(--muted)",lineHeight:1.7}}>{advice.spf}</p>
            </div>
            <div className="sm-card">
              <div className="sm-row" style={{marginBottom:8}}><span className="sm-tile-ic" style={{width:34,height:34,borderRadius:12}}><Ic n="drop" s={17} c="currentColor"/></span><h3 className="sm-card-title" style={{margin:0}}>Moisturizer</h3></div>
              <p style={{fontSize:12.8,color:"var(--muted)",lineHeight:1.7}}>{advice.moisturizer}</p>
            </div>
          </div>
          {advice.tips.length>0&&(
            <div className="sm-card sage">
              <h3 className="sm-card-title" style={{marginBottom:12}}>Tips for today</h3>
              <div className="sm-stack" style={{gap:10}}>
                {advice.tips.map((t,i)=>(
                  <p key={i} style={{fontSize:12.8,color:"var(--txt)",lineHeight:1.7,paddingLeft:14,borderLeft:`3px solid ${i%2?SM.pink:SM.sage}`}}>{t}</p>
                ))}
              </div>
            </div>
          )}
          <button className="btn-text" onClick={()=>setStatus("idle")} style={{alignSelf:"center",color:"var(--muted)",fontWeight:500}}>Check a different location</button>
        </div>
      )}
    </PageWrap>
  );
};

const AICoach=({user,results,scans,onClose,onMinimize})=>{
  const [msgs,setMsgs]=useState(()=>LS.get("coach_msgs",[{role:"assistant",text:`Hi${user?.name?" "+user.name.split(" ")[0]:""}! I'm Sumi, your personal wellness companion. I can analyze your food choices, skincare routine, habits, or just be here to talk. What's on your mind today?`,ts:Date.now()}]));
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
      /* Only relevant, currently-known context is sent — never the whole
         profile on every request. Movement/Energy/Cycle are included only
         when the user has actually logged something for them. */
      const movePrefs=getMovementPrefs();
      const todaySignal=getEnergySleepToday();
      const cycleSnap=getCycleSnapshot();
      const ctx=JSON.stringify({
        name:user?.name,age:user?.age,skinType:results?.skinType,concerns:results?.concerns?.map(c=>c.name),
        stress:user?.stress,sleep:user?.sleep,diet:user?.diet,pcos:user?.pcos,thyroid:user?.thyroid,latestScore:results?.overallScore,
        movementPreference:movePrefs&&!movePrefs.skipped?{duration:movePrefs.duration,timing:movePrefs.timing,intensity:movePrefs.intensity,categories:movePrefs.categories,goal:movePrefs.goal}:undefined,
        todayEnergy:todaySignal?.energy,todaySleep:todaySignal?.sleep,
        cycleDay:cycleSnap?.day,cyclePhase:cycleSnap?.phase,
        todaySkinFeeling:getTodaySkinCheckIn()?.feeling,
      });
      const recentAdvice=LS.get("coach_advice_log",[]);
      const antiRepeat=recentAdvice.length?`\n\nADVICE YOU'VE ALREADY GIVEN RECENTLY (do not repeat these points verbatim. If relevant again, add new depth, a different angle, or acknowledge progress instead of restating):\n${recentAdvice.map((a,i)=>`${i+1}. ${a}`).join("\n")}`:"";
      const systemPrompt=`You are Sumi, a warm, empathetic AI wellness companion with expertise in skincare, nutrition, movement, and emotional wellbeing, built into the Sumi app.

APP KNOWLEDGE: Sumi's features include the Skin Quiz and AI Skin Scan (My Skin), personalized Skin Products, Skin Forecast, My Journey, Monthly Story and Analytics; Wellness's Challenges, Nutrition & Hydration, Movement (Steps, Yoga, Face, Movement, Gym, Mindfulness — plus a one-time Movement Preference Quiz), Energy & Sleep, and Glow Journal; the Cycle Tracker; and the daily Skin Check-in on Home. Point the user to the right section by name when relevant instead of trying to do that feature's job yourself in chat.

SAFETY BOUNDARIES: You are not a doctor, dermatologist, nutritionist, therapist or personal trainer, and must never claim to be. Give general, educational information; never diagnose. For skincare, make no guaranteed-outcome or treatment claims. For nutrition, never encourage extreme dieting, restriction or starvation, and never treat BMI as a diagnosis. For cycle-related topics, stay informational and phrase things as "some people notice" / "you may want to" rather than universal facts, and never claim every user experiences the same symptoms. For movement, keep suggestions general and low-pressure — never professional training advice. When a question calls for real medical, dermatological or mental-health care, say so gently and suggest seeing a professional.

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
      console.error("[Sumi Coach]",e?.message,new Date().toISOString());
      setErr(friendlyAIError(e));
    }finally{setLoading(false);}
  };

  const quickPrompts=["Analyze what I ate today","Review my skincare routine","I'm feeling frustrated about my skin","Help me build a better sleep habit","What should I eat for clearer skin?"];

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",minHeight:0}}>
      <div style={{padding:"14px 16px",borderBottom:"1px solid var(--border)",background:"var(--topbar)",display:"flex",gap:12,alignItems:"center",flexShrink:0}}>
        <div style={{width:44,height:52,borderRadius:12,overflow:"hidden",border:"2px solid var(--border)",flexShrink:0}}><SumiAvatar state="welcome" portrait size={52}/></div>
        <div style={{minWidth:0}}>
          <h2 className="cf" style={{fontSize:22,fontWeight:600,color:"var(--txt)"}}>Sumi</h2>
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
            {m.role==="assistant"&&<SumiAvatar state="welcome" size={34}/>}
            {/* minWidth:0 only — no flex-grow — so short replies still hug
               their content like a normal chat bubble; see the note on
               SumiMsg above for why this alone is the correct guard. */}
            <div style={{minWidth:0,maxWidth:"min(82%,480px)",padding:"12px 15px",borderRadius:m.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px",background:m.role==="user"?"linear-gradient(135deg,var(--plum-deep),var(--lav))":"var(--petal)",border:m.role==="user"?"none":"1px solid var(--border)"}}>
              <p style={{fontSize:13.5,color:m.role==="user"?"#fff":"var(--txt)",lineHeight:1.75}}>{m.text}</p>
            </div>
          </div>
        ))}
        {loading&&(
          <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
            <SumiAvatar state="analysis" size={34}/>
            <div style={{padding:"12px 16px",borderRadius:"16px 16px 16px 4px",background:"var(--petal)",border:"1px solid var(--border)"}}>
              <div style={{display:"flex",gap:5,alignItems:"center"}}>
                {[0,1,2].map(j=><div key={j} style={{width:7,height:7,borderRadius:"50%",background:"var(--soft)",animation:`gPulse 1.2s ease-in-out ${j*0.2}s infinite`}}/>)}
              </div>
            </div>
          </div>
        )}
        {err&&<div style={{textAlign:"center",padding:"10px",background:"rgba(245,163,163,.08)",borderRadius:10,border:"1px solid rgba(245,163,163,.2)"}}><p style={{fontSize:12,color:"#C4585F"}}>{err}</p></div>}
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
      const cats=["encouragement","wellness","progress"];
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

  /* The Skin Analysis screen has its own inline, page-integrated AI
     guidance element (SkinAICompanion) instead of this global floating
     avatar/bubble, so it no longer needs — or wants — this widget
     duplicating (and potentially overlapping) it. This check comes after
     every Hook above so the Hook call order never changes between
     renders, regardless of which page is active. */
  if(page==="scan"||page==="quiz")return null;

  return(
    <>
      {showBubble&&!open&&(
        <div role="button" tabIndex={0} aria-label="Open Sumi chat" className="kb-focusable chat-teaser" style={{animation:"fadeUp .4s ease",cursor:"pointer"}} onClick={()=>{setOpen(true);setMinimized(false);setShowBubble(false);}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setOpen(true);setMinimized(false);setShowBubble(false);}}}>
          <p style={{fontSize:12,color:"var(--txt)",lineHeight:1.65,fontStyle:"italic"}}>"{msg}"</p>
          <div style={{fontSize:10,color:"var(--muted)",marginTop:4,textAlign:"right"}}>. Sumi</div>
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
        <div className="floating-mini-bar kb-focusable" role="button" tabIndex={0} aria-label="Reopen Sumi chat" onClick={()=>setMinimized(false)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setMinimized(false);}}}>
          <div style={{width:26,height:26,borderRadius:"50%",overflow:"hidden",flexShrink:0}}><img src={AV.welcome} alt="" style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"50% 12%"}}/></div>
          <span style={{fontSize:13,color:"var(--txt)",flex:1}}>Sumi: tap to reopen</span>
          <button onClick={e=>{e.stopPropagation();setOpen(false);setMinimized(false);}} aria-label="Close chat" style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Ic n="x" s={16} c="var(--muted)"/></button>
        </div>
      )}
      {!open&&(
        <div ref={btnRef} className="floating-btn kb-focusable" role="button" tabIndex={0} aria-label="Open AI assistant" onClick={()=>{setOpen(true);setMinimized(false);setShowBubble(false);}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setOpen(true);setMinimized(false);setShowBubble(false);}}}>
          <img src={AV.welcome} alt="Open AI assistant" style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"50% 12%"}} onError={e=>{e.target.style.display="none";e.target.parentNode.style.background="linear-gradient(135deg,var(--plum-deep),var(--lav))";e.target.parentNode.innerHTML="<span style='font-family:Gabriela,Georgia,serif;font-size:26px;color:#F5E6EA;font-weight:600;display:flex;align-items:center;justify-content:center;height:100%'>S</span>";}}/>
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
const FUNCTIONAL="/sumi/functional/";
/* Final scrapbook icon set (source of truth: reference-assets folder) —
   the 3D pastel feature icons used for section headers and navigation. */
const SCRAP="/scrapbook/";

/* ── HUB CARD ───────────────────────────────────────────────────────────
   One consistent tile used by the My Skin and Wellness landing hubs. The hub
   itself never expands feature content inline; each tile opens its own page. */
const HubCard=({icon,label,sub,onClick,tone})=>(
  <button onClick={onClick} className="sm-card tight kb-focusable" style={{display:"flex",alignItems:"center",gap:14,cursor:"pointer",textAlign:"left",width:"100%",fontFamily:"inherit",background:tone==="pink"?"linear-gradient(160deg,#FBEFEE,#F5DFDE)":tone==="sage"?"linear-gradient(160deg,#EAF1DE,#DCE8CB)":undefined}}>
    <span className="sm-head-icon" style={{width:48,height:48}}><img src={icon} alt="" style={{width:30,height:30}}/></span>
    <div style={{minWidth:0,flex:1}}>
      <div style={{fontSize:13.5,fontWeight:600,color:"var(--txt)"}}>{label}</div>
      {sub&&<div style={{fontSize:11.5,color:"var(--muted)",marginTop:1}}>{sub}</div>}
    </div>
    <Ic n="chev" s={15} c="var(--muted)"/>
  </button>
);

/* MY SKIN → Skin Analysis. The two input methods (AI Skin Scan and Skin
   Quiz) are presented as equally-weighted, equally-intentional choices —
   neither is a "backup" for the other — per the redesign spec. Both
   ultimately write to the same `results`/`scans` SkinAnalysisProfile, so
   everything below (Report, Products, Forecast, Journey, Story,
   Analytics) already works from whichever one the person picks. */
const MySkinHub=({onNav,results,onQuiz})=>{
  const hasProfile=!!results;
  const sourceLabel=results?.source==="combined"?"your latest scan + quiz":results?.source==="skin_quiz"?"your Skin Quiz":results?.source==="photo_scan"?"your last scan":null;
  return(
    <PageWrap max={760}>
      <PageHeader icon={FUNCTIONAL+"01_skin.png"} eyebrow="My Skin" title="Skin Analysis" sub="How would you like to understand your skin?"/>

      <div className="sm-row quiz-choice-row" style={{gap:12,alignItems:"stretch",marginBottom:20}}>
        <button onClick={()=>onNav("scan")} className="quiz-choice-card kb-focusable">
          <span className="sm-head-icon" style={{width:34,height:34}}><img src={SCRAP+"skin_scan.png"} alt=""/></span>
          <span className="cf" style={{fontSize:14.5,fontWeight:600,color:"var(--txt)"}}>AI Skin Scan</span>
          <span style={{fontSize:11.5,color:"var(--muted)",lineHeight:1.5}}>Let Sumi read visible skin patterns from a photo.</span>
          <span className="btn" style={{marginTop:4,padding:"7px 14px",fontSize:11.5,display:"inline-flex",alignItems:"center",gap:5,alignSelf:"flex-start",pointerEvents:"none"}}><Ic n="camera" s={12} c="#FFFEFC"/>Scan My Skin</span>
        </button>
        <button onClick={()=>onQuiz(false)} className="quiz-choice-card kb-focusable" style={{background:"linear-gradient(160deg,#FBEFEE,#F5DFDE)",borderColor:"rgba(196,105,111,.22)"}}>
          <span className="sm-head-icon" style={{width:34,height:34}}><img src={SCRAP+"skin_quiz_icon.png"} alt=""/></span>
          <span className="cf" style={{fontSize:14.5,fontWeight:600,color:"var(--txt)"}}>Skin Quiz</span>
          <span style={{fontSize:11.5,color:"var(--muted)",lineHeight:1.5}}>Tell Sumi what you've been noticing about your skin.</span>
          <span className="btn" style={{marginTop:4,padding:"7px 14px",fontSize:11.5,display:"inline-flex",alignItems:"center",gap:5,alignSelf:"flex-start",background:SM.pinkDeep,pointerEvents:"none"}}><Ic n="book" s={12} c="#FFFEFC"/>Take the Quiz</span>
        </button>
      </div>

      {hasProfile&&(
        <Note icon="ok" tone="sage" style={{marginBottom:22}}>
          Your Skin Analysis is based on {sourceLabel}. {results.source!=="photo_scan"&&<button className="btn-text" onClick={()=>onQuiz(false)} style={{padding:0,fontWeight:700}}>Retake Skin Quiz</button>}
          {results.source==="skin_quiz"&&results.quizResponses&&<> · <button className="btn-text" onClick={()=>onQuiz(true)} style={{padding:0,fontWeight:700}}>Edit My Answers</button></>}
        </Note>
      )}

      <Section title="Explore" sub="Everything about your skin, in one place" style={{marginBottom:0}}>
        <div className="sm-grid">
          <HubCard icon={SCRAP+"skin_analysis.png"} label="Analysis Report" sub="Your latest results" onClick={()=>onNav("results")}/>
          <HubCard icon={SCRAP+"skin_products.png"} label="Skin Products" sub="Curated for your skin" onClick={()=>onNav("products")} tone="pink"/>
          <HubCard icon={SCRAP+"skin_forecast.png"} label="Skin Forecast" sub="Weather and your skin today" onClick={()=>onNav("forecast")}/>
          <HubCard icon={SCRAP+"my_journey.png"} label="My Journey" sub="Your progress over time" onClick={()=>onNav("journey")} tone="sage"/>
          <HubCard icon={SCRAP+"monthly_story.png"} label="Monthly Story" sub="This month, in review" onClick={()=>onNav("story")} tone="pink"/>
          <HubCard icon={SCRAP+"analytics.png"} label="Analytics" sub="Trends across your scans" onClick={()=>onNav("analytics")}/>
        </div>
      </Section>
    </PageWrap>
  );
};

const WellnessHub=({onNav})=>(
  <PageWrap max={760}>
    <PageHeader icon={SCRAP+"wellness.png"} eyebrow="Wellness" title="Wellness" sub="Habits and wellbeing, in one place."/>
    <div className="sm-grid">
      <HubCard icon={SCRAP+"challenges.png"} label="Challenges" sub="Small commitments, just for you" onClick={()=>onNav("challenges")} tone="sage"/>
      <HubCard icon={SCRAP+"nutrition.png"} label="Nutrition & Hydration" sub="Eat and drink for your skin" onClick={()=>onNav("nutrition")}/>
      <HubCard icon={MOVE_ICONS.parent} label="Movement" sub="Gentle movement, on your terms" onClick={()=>onNav("movement")} tone="sage"/>
      <HubCard icon={SCRAP+"sleep.png"} label="Energy & Sleep" sub="A quick daily check-in" onClick={()=>onNav("energy")} tone="pink"/>
      <HubCard icon={SCRAP+"glow_journal.png"} label="Glow Journal" sub="A little daily reflection" onClick={()=>onNav("journal")} tone="pink"/>
    </div>
  </PageWrap>
);

/* ══════════════════════════════════════════════════════════════════════
   MOVEMENT — Wellness → Movement. A gentle wellness companion, not a
   fitness app: six horizontally-scrollable categories (Walk, Home, Gym,
   Yoga, Skin & Face, Mindful), a one-time preference quiz that tailors
   what's shown first, and manual/integration-ready step logging (never
   fabricated step data). Source of truth for prefs: LS "movement_prefs".
   ══════════════════════════════════════════════════════════════════════ */
const MOVE_ICONS={
  parent:"/sumi/movement/movement_parent.png",
  walk:"/sumi/movement/walk.png",
  home:"/sumi/movement/home.png",
  gym:"/sumi/movement/gym.png",
  yoga:"/sumi/movement/yoga.png",
  skinface:"/sumi/movement/skinface.png",
  mindful:"/sumi/movement/mindful.png",
};
/* Sub-navigation order/labels: Steps | Yoga | Face | Movement | Gym |
   Mindfulness. Internal keys are left as-is (walk/home/gym/yoga/skinface/
   mindful) since movement_prefs, session data and the preference quiz's
   catMap already key off them — only the tab label/order changed. */
const MOVEMENT_TABS=[
  {key:"walk",label:"Steps",icon:MOVE_ICONS.walk},
  {key:"yoga",label:"Yoga",icon:MOVE_ICONS.yoga},
  {key:"skinface",label:"Face",icon:MOVE_ICONS.skinface},
  {key:"home",label:"Movement",icon:MOVE_ICONS.home},
  {key:"gym",label:"Gym",icon:MOVE_ICONS.gym},
  {key:"mindful",label:"Mindfulness",icon:MOVE_ICONS.mindful},
];
/* Session catalogue — general, educational, non-medical. Duration/difficulty
   are informational only; nothing here claims professional training or
   treatment outcomes (see the AI safety + product-copy rules in the brief). */
const MOVEMENT_SESSIONS={
  home:[
    {id:"h1",title:"Gentle Morning Wake-Up",min:5,level:"Beginner",desc:"Light stretches and mobility to start the day."},
    {id:"h2",title:"Low-Impact Full Body",min:10,level:"Beginner",desc:"Bodyweight basics — no equipment, no jumping."},
    {id:"h3",title:"Standing Mobility Flow",min:15,level:"Light",desc:"Joint-friendly movement you can do in socks."},
    {id:"h4",title:"Living Room Circuit",min:20,level:"Moderate",desc:"A gentle circuit that still gets your heart rate up a little."},
  ],
  gym:[
    {id:"g1",title:"Beginner Full Body",min:20,level:"Beginner",area:"Full Body",desc:"A simple introduction to gym machines and form."},
    {id:"g2",title:"Upper Body Basics",min:20,level:"Light",area:"Upper Body",desc:"Chest, back and arms with lighter loads."},
    {id:"g3",title:"Lower Body Basics",min:20,level:"Light",area:"Lower Body",desc:"Legs and glutes, beginner-friendly."},
    {id:"g4",title:"Strength Fundamentals",min:30,level:"Moderate",area:"Full Body",desc:"Slightly more challenging — go at your own pace."},
  ],
  yoga:[
    {id:"y1",title:"5-Minute Gentle Stretch",min:5,level:"Very gentle",desc:"A short unwind for tight shoulders and hips."},
    {id:"y2",title:"Morning Flexibility",min:10,level:"Gentle",desc:"Wake up the body without leaving the mat."},
    {id:"y3",title:"Mobility & Breath",min:15,level:"Light",desc:"Slow flow paired with steady breathing."},
    {id:"y4",title:"Wind-Down Yoga",min:20,level:"Gentle",desc:"A longer, calming sequence for the evening."},
  ],
  skinface:[
    {id:"sf1",title:"3-Minute Morning Massage",min:3,level:"Relaxation",desc:"A quick facial massage to start the day."},
    {id:"sf2",title:"5-Minute Relaxation Massage",min:5,level:"Relaxation",desc:"Cheek, jaw and temple relaxation."},
    {id:"sf3",title:"Jaw & Brow Release",min:5,level:"Relaxation",desc:"Gentle tension release for the jaw and brow."},
    {id:"sf4",title:"Scalp & Neck Reset",min:5,level:"Relaxation",desc:"Gentle scalp massage with neck relaxation."},
  ],
  mindful:[
    {id:"m1",title:"2-Minute Breather",min:2,level:"Calm",desc:"A short breathing reset for a busy moment."},
    {id:"m2",title:"5-Minute Meditation",min:5,level:"Calm",desc:"A short guided-style sit to settle the mind."},
    {id:"m3",title:"10-Minute Wind-Down",min:10,level:"Calm",desc:"Longer relaxation for the end of the day."},
  ],
};
const STEP_GOAL_OPTIONS=[3000,5000,7500,10000];
const getMovementPrefs=()=>LS.get("movement_prefs",null);
const getEnergySleepToday=()=>{
  const log=LS.get("energy_sleep_log",{});
  const today=new Date().toISOString().slice(0,10);
  return log[today]||null;
};
/* Cycle-aware helper — informational only, never prescriptive. Derives an
   approximate current day/phase from the user's own logged cycle history
   (menstrual_cycles), the same source of truth the Cycle Tracker uses.
   Returns null when there isn't enough data to estimate anything. */
const getCycleSnapshot=()=>{
  const cycles=LS.get("menstrual_cycles",[]);
  if(!cycles.length)return null;
  const prof=LS.get("smira_user",null);
  return buildSnapshot(cycles,{cycleLength:prof?.cycleLength,periodLength:prof?.periodLength});
};
/* Turns the user's own logged signals into gentle, non-prescriptive
   suggestions — always phrased as "some people" / "you may want to",
   never as instructions, and always deferring to what they actually
   logged today over any generic assumption. */
const getWellnessSuggestion=()=>{
  const prefs=getMovementPrefs();
  const today=getEnergySleepToday();
  const cycle=getCycleSnapshot();
  const gentle=prefs?.intensity==="Very gentle"||prefs?.intensity==="Light";
  if(today?.energy==="Very low"||today?.energy==="Low")
    return`Your energy check-in today was on the lower side — a short ${prefs?.duration||"5-minute"} ${gentle?"gentle stretch":"walk"} can be enough for today.`;
  if(today?.sleep==="Poor")
    return"Sleep was rough last night — consider keeping today's movement light and going easy on yourself.";
  if(cycle?.phase==="Menstrual")
    return"Some people prefer gentler movement around this point in their cycle. Based on your own tracking, a Yoga or Mindful session might feel good today.";
  if(prefs)
    return`Based on your Movement preferences, a ${prefs.duration||"10-minute"} session ${prefs.timing?`in the ${prefs.timing.toLowerCase()}`:""} could be a good fit today.`;
  return null;
};

const MovementPreferenceQuiz=({onDone,onCancel,existing})=>{
  const [i,setI]=useState(0);
  const [a,setA]=useState(existing||{});
  const steps=[
    {key:"activity",q:"How active are you on a typical day?",opts:["Mostly sitting","Lightly active","Moderately active","Very active"],multi:false},
    {key:"sitting",q:"How much of your day do you usually spend sitting?",opts:["Less than 3 hours","3–5 hours","5–8 hours","8+ hours"],multi:false},
    {key:"timing",q:"When do you usually have time to move?",opts:["Morning","Afternoon","Evening","Night","My schedule changes"],multi:false},
    {key:"duration",q:"What feels realistic for you?",opts:["5 minutes","10 minutes","15 minutes","20+ minutes"],multi:false},
    {key:"categories",q:"What kinds of movement do you enjoy?",sub:"Choose as many as you like",opts:["Walking","Home workouts","Gym","Yoga","Stretching","Mobility","Skin & Face","Mindful"],multi:true},
    {key:"goal",q:"What's your main goal right now?",opts:["Move more","Improve flexibility","Build consistency","Feel more energetic","General fitness","Relax / de-stress"],multi:true},
    {key:"intensity",q:"What intensity feels right?",opts:["Very gentle","Light","Moderate","Challenging"],multi:false},
    {key:"environment",q:"Where do you usually move?",opts:["Home","Outdoors","Gym","Anywhere"],multi:false},
  ];
  const s=steps[i];
  const val=a[s.key];
  const toggle=(opt)=>{
    if(s.multi){
      const cur=Array.isArray(val)?val:[];
      setA({...a,[s.key]:cur.includes(opt)?cur.filter(x=>x!==opt):[...cur,opt]});
    }else setA({...a,[s.key]:opt});
  };
  const canNext=s.multi?(Array.isArray(val)&&val.length>0):!!val;
  return(
    <PageWrap max={560}>
      <PageHeader icon={MOVE_ICONS.parent} eyebrow="Movement" title="A few quick questions" sub="One-time — helps Sumi tailor Movement to you. You can edit this anytime."/>
      <div className="sm-card" style={{marginBottom:18}}>
        <div className="sm-row" style={{gap:6,marginBottom:16}}>
          {steps.map((_,idx)=><span key={idx} style={{flex:1,height:4,borderRadius:2,background:idx<=i?SM.sage:"var(--border)"}}/>)}
        </div>
        <h3 className="cf" style={{fontSize:18,fontWeight:600,color:"var(--txt)",marginBottom:4}}>{s.q}</h3>
        {s.sub&&<p style={{fontSize:12,color:"var(--muted)",marginBottom:12}}>{s.sub}</p>}
        <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:s.sub?0:12}}>
          {s.opts.map(opt=>{
            const sel=s.multi?(Array.isArray(val)&&val.includes(opt)):val===opt;
            return(
              <button key={opt} onClick={()=>toggle(opt)} className="kb-focusable" style={{textAlign:"left",padding:"12px 16px",borderRadius:14,border:`1px solid ${sel?SM.sage:"var(--border)"}`,background:sel?"linear-gradient(160deg,#EAF1DE,#DCE8CB)":"var(--card)",cursor:"pointer",fontSize:13.5,fontWeight:sel?600:500,color:"var(--txt)"}}>{opt}</button>
            );
          })}
        </div>
      </div>
      <div className="sm-row" style={{justifyContent:"space-between"}}>
        <button className="btn-text" onClick={()=>i===0?onCancel?.():setI(i-1)}>{i===0?"Skip for now":"Back"}</button>
        <button className="btn" disabled={!canNext} style={{opacity:canNext?1:.5}} onClick={()=>{
          if(i<steps.length-1)setI(i+1);
          else{LS.set("movement_prefs",{...a,completedAt:Date.now()});onDone(a);}
        }}>{i<steps.length-1?"Next":"Save my preferences"}</button>
      </div>
    </PageWrap>
  );
};

const MovementSessionCard=({s,onStart})=>(
  <div className="sm-card tight" style={{display:"flex",flexDirection:"column",gap:8}}>
    <div style={{fontSize:14,fontWeight:600,color:"var(--txt)"}}>{s.title}</div>
    <div className="sm-row" style={{gap:6,flexWrap:"wrap"}}>
      <span className="sm-pill sage" style={{fontSize:10.5}}>{s.min} min</span>
      <span className="sm-pill" style={{fontSize:10.5}}>{s.level}</span>
      {s.area&&<span className="sm-pill pink" style={{fontSize:10.5}}>{s.area}</span>}
    </div>
    <p style={{fontSize:12,color:"var(--muted)",lineHeight:1.6}}>{s.desc}</p>
    <button className="btn" style={{alignSelf:"flex-start",padding:"8px 16px",fontSize:12.5}} onClick={()=>onStart(s)}>Start</button>
  </div>
);

const WalkTab=()=>{
  const [goal,setGoal]=useState(()=>LS.get("step_goal",7500));
  const [customGoal,setCustomGoal]=useState("");
  const [steps,setSteps]=useState(()=>{
    const log=LS.get("step_log",{});
    return log[new Date().toISOString().slice(0,10)]||0;
  });
  const [manual,setManual]=useState("");
  const saveSteps=(n)=>{
    const today=new Date().toISOString().slice(0,10);
    const log=LS.get("step_log",{});
    log[today]=n;LS.set("step_log",log);
    setSteps(n);
  };
  const pct=Math.min(100,Math.round((steps/goal)*100));
  const remaining=Math.max(0,goal-steps);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <Note icon="alert" tone="sage">Sumi isn't connected to a step-tracking device yet, so steps here are logged by you rather than measured automatically.</Note>
      <div className="sm-card">
        <div className="sm-eyebrow" style={{marginBottom:6}}>Today's Walk</div>
        <div className="cf" style={{fontSize:26,fontWeight:600,color:"var(--txt)"}}>{steps.toLocaleString()} / {goal.toLocaleString()} steps</div>
        <Meter pct={pct} color={SM.sage} h={10}/>
        <p style={{fontSize:12.5,color:"var(--muted)",marginTop:8}}>{remaining>0?`${remaining.toLocaleString()} to your goal`:"Goal reached today 🌿"}</p>
        <div className="sm-row" style={{gap:8,marginTop:14,flexWrap:"wrap"}}>
          <input className="sm-input" style={{maxWidth:140}} type="number" min={0} placeholder="Log steps" value={manual} onChange={e=>setManual(e.target.value)}/>
          <button className="btn" style={{padding:"9px 16px",fontSize:12.5}} onClick={()=>{const n=parseInt(manual,10);if(Number.isFinite(n)&&n>=0){saveSteps(n);setManual("");}}}>Log</button>
          <button className="btn-text" onClick={()=>saveSteps(steps+500)}>+500</button>
        </div>
      </div>
      <div className="sm-card tight">
        <div className="sm-eyebrow" style={{marginBottom:10}}>Step goal</div>
        <div className="sm-row" style={{gap:8,flexWrap:"wrap"}}>
          {STEP_GOAL_OPTIONS.map(g=>(
            <button key={g} onClick={()=>{setGoal(g);LS.set("step_goal",g);}} className="sm-pill sm-pill-btn" style={{fontSize:12}} aria-pressed={goal===g}>{g.toLocaleString()}</button>
          ))}
          <input className="sm-input" style={{maxWidth:110}} type="number" placeholder="Custom" value={customGoal} onChange={e=>setCustomGoal(e.target.value)}/>
          <button className="btn-text" onClick={()=>{const n=parseInt(customGoal,10);if(Number.isFinite(n)&&n>0){setGoal(n);LS.set("step_goal",n);setCustomGoal("");}}}>Set</button>
        </div>
      </div>
      <Section title="Quick walking options" sub="Pick a length that fits your day">
        <div className="sm-grid g4">
          {[10,20,30,0].map(m=>(
            <div key={m} className="sm-card tight" style={{textAlign:"center"}}>
              <div style={{fontSize:14,fontWeight:600,color:"var(--txt)"}}>{m===0?"Free walk":`${m} min`}</div>
              <button className="btn-text" style={{marginTop:4}} onClick={()=>{}}>Start</button>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
};

const Movement=()=>{
  const [prefs,setPrefs]=useState(()=>getMovementPrefs());
  const [quizOpen,setQuizOpen]=useState(false);
  const [editingPrefs,setEditingPrefs]=useState(false);
  const catMap={Walking:"walk",Home:"home","Home workouts":"home",Gym:"gym",Yoga:"yoga",Stretching:"yoga",Mobility:"yoga","Skin & Face":"skinface",Mindful:"mindful"};
  const defaultTab=(()=>{
    if(!prefs)return"walk";
    const first=(prefs.categories||[])[0];
    return catMap[first]||"walk";
  })();
  const [tab,setTab]=useState(defaultTab);
  useEffect(()=>{setTab(defaultTab);},[prefs]); // eslint-disable-line

  if(!prefs&&!quizOpen&&!editingPrefs){
    return(
      <PageWrap max={760}>
        <PageHeader icon={MOVE_ICONS.parent} eyebrow="Wellness" title="Movement" sub="A gentle companion for moving more, your way."/>
        <div className="sm-card" style={{textAlign:"center",padding:"32px 20px"}}>
          <img src={MOVE_ICONS.parent} alt="" style={{width:64,height:64,margin:"0 auto 14px"}}/>
          <h3 className="cf" style={{fontSize:18,fontWeight:600,color:"var(--txt)",marginBottom:6}}>Let's tailor Movement to you</h3>
          <p style={{fontSize:13,color:"var(--muted)",lineHeight:1.7,marginBottom:16}}>A short one-time quiz — helps Sumi show the right sessions, timing and intensity first.</p>
          <button className="btn" onClick={()=>setQuizOpen(true)}>Take the Movement Quiz</button>
          <div style={{marginTop:10}}><button className="btn-text" onClick={()=>setPrefs({skipped:true})}>Skip for now</button></div>
        </div>
      </PageWrap>
    );
  }
  if(quizOpen||editingPrefs){
    return<MovementPreferenceQuiz existing={editingPrefs?prefs:null} onCancel={()=>{setQuizOpen(false);setEditingPrefs(false);}} onDone={(a)=>{setPrefs(a);setQuizOpen(false);setEditingPrefs(false);}}/>;
  }

  const suggestion=getWellnessSuggestion();
  const sessions=tab==="walk"?null:MOVEMENT_SESSIONS[tab]||[];
  return(
    <PageWrap max={880}>
      <PageHeader icon={MOVE_ICONS.parent} eyebrow="Wellness" title="Movement" sub="A gentle companion for moving more, your way."
        right={<button className="btn-text" onClick={()=>setEditingPrefs(true)}>Edit Movement Preferences</button>}/>

      {suggestion&&<Note icon="ok" tone="sage" style={{marginBottom:16}}>{suggestion}</Note>}

      <div className="sm-scroll-x movement-tabs" role="tablist" aria-label="Movement category" style={{marginBottom:20,gap:8}}>
        {MOVEMENT_TABS.map(mt=>(
          <button key={mt.key} role="tab" aria-selected={tab===mt.key} onClick={()=>setTab(mt.key)}
            className={`sm-pill sm-pill-btn${tab===mt.key?" act":""}`}
            style={{display:"flex",alignItems:"center",gap:7,padding:"7px 14px 7px 8px",fontSize:12.5,flexShrink:0}}>
            <img src={mt.icon} alt="" style={{width:22,height:22,objectFit:"contain"}}/>{mt.label}
          </button>
        ))}
      </div>

      {tab==="walk"?<WalkTab/>:(
        <div className="sm-grid g2">
          {sessions.map(s=><MovementSessionCard key={s.id} s={s} onStart={()=>recordActivity("movement")}/>)}
        </div>
      )}

      {tab==="skinface"&&(
        <Note icon="leaf" tone="pink" style={{marginTop:16}}>Skin & Face sessions are gentle relaxation and massage — not a treatment for acne, wrinkles or any skin condition.</Note>
      )}
      {(tab==="gym"||tab==="home")&&(
        <Note icon="leaf" tone="sage" style={{marginTop:16}}>General movement ideas only — not personal training or medical guidance. Go at whatever pace feels right for your body.</Note>
      )}
    </PageWrap>
  );
};

/* ── ENERGY & SLEEP — Wellness → Energy & Sleep. Lightweight daily
   signals (not a sleep-disorder screener); feeds getWellnessSuggestion()
   and the AI's available context, same as the Daily Skin Check-in does
   for My Skin. */
const EnergySleep=()=>{
  const today=new Date().toISOString().slice(0,10);
  const [log,setLog]=useState(()=>LS.get("energy_sleep_log",{}));
  const entry=log[today]||{};
  const save=(patch)=>{
    const next={...log,[today]:{...entry,...patch}};
    setLog(next);LS.set("energy_sleep_log",next);
  };
  const suggestion=getWellnessSuggestion();
  return(
    <PageWrap max={640}>
      <PageHeader icon={SCRAP+"sleep.png"} eyebrow="Wellness" title="Energy & Sleep" sub="A quick daily signal — not a diagnosis, just a check-in."/>
      <div className="sm-card" style={{marginBottom:16}}>
        <div className="sm-eyebrow" style={{marginBottom:10}}>How did you sleep?</div>
        <div className="sm-row" style={{gap:8,flexWrap:"wrap"}}>
          {["Poor","Okay","Good","Great"].map(o=>(
            <button key={o} onClick={()=>save({sleep:o})} className="sm-pill sm-pill-btn" aria-pressed={entry.sleep===o} style={{fontSize:12.5}}>{o}</button>
          ))}
        </div>
        <input className="sm-input" style={{marginTop:10,maxWidth:220}} placeholder="Approx. hours (optional)" value={entry.sleepHours||""} onChange={e=>save({sleepHours:e.target.value})}/>
      </div>
      <div className="sm-card" style={{marginBottom:16}}>
        <div className="sm-eyebrow" style={{marginBottom:10}}>How is your energy today?</div>
        <div className="sm-row" style={{gap:8,flexWrap:"wrap"}}>
          {["Very low","Low","Okay","Good","Great"].map(o=>(
            <button key={o} onClick={()=>save({energy:o})} className="sm-pill sm-pill-btn" aria-pressed={entry.energy===o} style={{fontSize:12.5}}>{o}</button>
          ))}
        </div>
      </div>
      {suggestion&&<Note icon="ok" tone="sage">{suggestion}</Note>}
      <p style={{fontSize:11,color:"var(--muted)",marginTop:14,lineHeight:1.6}}>This is a personal, subjective signal — not a sleep-disorder screening. If sleep or energy struggles persist, it's worth mentioning to a doctor.</p>
    </PageWrap>
  );
};


/* Cycle Tracker used to only be reachable through the sidebar (hidden
   behind a hamburger drawer on mobile) or by falling under the "You" tab's
   match list — effectively buried, which the SUMI brand brief calls out
   as something the Cycle Tracker must never be. It's now its own
   first-class bottom-nav tab, one tap away like every other core feature. */
const BOTTOM_NAV_ITEMS=[
  {id:"dashboard",label:"Home",icon:FUNCTIONAL+"24_home.png",match:["dashboard"]},
  {id:"myskin",label:"My Skin",icon:FUNCTIONAL+"01_skin.png",match:["myskin","scan","quiz","results","products","forecast","journey","story","analytics"]},
  {id:"wellness",label:"Wellness",icon:SCRAP+"wellness.png",match:["wellness","challenges","nutrition","journal","movement","energy"]},
  {id:"menstrual",label:"Cycle",icon:SCRAP+"cycle_tracker.png",match:["menstrual"]},
  {id:"settings",label:"You",icon:FUNCTIONAL+"23_settings.png",match:["settings"]},
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
    <nav ref={navRef} className="smira-bottom-nav" aria-label="Primary" style={{position:"fixed",left:0,right:0,bottom:0,zIndex:150,justifyContent:"space-around",alignItems:"center",padding:"9px 6px calc(9px + var(--safe-b))",background:"#FBF8EE",borderTop:"1px solid rgba(96,118,72,.22)",boxShadow:"0 -2px 16px rgba(60,72,40,.06)"}}>
      {BOTTOM_NAV_ITEMS.map(item=>{
        const isActive=item.match.includes(active);
        return(
          <button key={item.id} onClick={()=>onNav(item.id)} aria-current={isActive?"page":undefined} className="bottom-nav-btn" style={{background:"transparent",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,padding:"5px 10px",borderRadius:14,minWidth:56,minHeight:44,transition:"transform .15s"}}>
            <img src={item.icon} alt="" style={{width:22,height:22,objectFit:"contain",filter:isActive?"none":"grayscale(1)",opacity:isActive?1:.62,transform:isActive?"scale(1.08)":"scale(1)",transition:"all .2s"}}/>
            <span style={{fontSize:10,fontWeight:isActive?700:500,color:isActive?"var(--coral)":"var(--muted)",fontFamily:"'Nunito',system-ui,sans-serif",transition:"color .2s"}}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
const Sidebar=({active,onNav,user,open,onClose})=>{
  const groups=[
    {label:null,items:[{id:"dashboard",icon:"home",label:"Home"}]},
    {label:"My Skin",items:[
      {id:"myskin",icon:"scan",label:"My Skin"},
      {id:"scan",icon:"camera",label:"AI Skin Scan"},
      {id:"quiz",icon:"book",label:"Skin Quiz"},
      {id:"results",icon:"chart",label:"Analysis Report"},
      {id:"products",icon:"bag",label:"Skin Products"},
      {id:"forecast",icon:"forecast",label:"Skin Forecast"},
      {id:"journey",icon:"spark",label:"My Journey"},
      {id:"story",icon:"star",label:"Monthly Story"},
      {id:"analytics",icon:"chart",label:"Analytics"},
    ]},
    {label:"Wellness",items:[
      {id:"wellness",icon:"heart",label:"Wellness"},
      {id:"challenges",icon:"trophy",label:"Challenges"},
      {id:"nutrition",icon:"leaf",label:"Nutrition"},
      {id:"movement",icon:"play",label:"Movement"},
      {id:"energy",icon:"star",label:"Energy & Sleep"},
      {id:"journal",icon:"book",label:"Glow Journal"},
    ]},
    {label:"Cycle",items:[{id:"menstrual",icon:"cycle",label:"Cycle Tracker"}]},
    {label:"You",items:[{id:"settings",icon:"gear",label:"Settings"}]},
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
            <AuraLogo size={52}/>
            <div style={{textAlign:"center"}}>
              <div style={{display:"flex",justifyContent:"center",marginBottom:2}}><Wordmark height={30}/></div>
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
            <div style={{fontSize:9,color:"var(--muted)",opacity:.6,letterSpacing:".08em",textAlign:"center"}}>SUMI · V5.0</div>
            <div style={{fontSize:8,color:"var(--muted)",opacity:.4,textAlign:"center"}}>A kinder you. Everyday.</div>
          </div>
        </div>
      </div>
    </>
  );
};

export default function App(){
  /* ── Theme ── SUMI is light-mode only. */
  const resolvedTheme="light";
  const T=LIGHT_T;

  const isOnline=useOnlineStatus();

  /* ── Auth ── */
  const [authUser,setAuthUser]=useState(()=>AUTH.getUser()); // instant cache for first paint
  const [authLoading,setAuthLoading]=useState(true);
  const [splashDone,setSplashDone]=useState(false);
  const [cloudHydrated,setCloudHydrated]=useState(false);

  const CLOUD_KEYS=["smira_user","smira_results","smira_scans","habits3","water_today","glowJournal","menstrual_cycles","cycle_logs","cycle_meta","diet_plan","coach_msgs"];
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
          if(cloud.cycle_logs!==undefined)LS.setSilent("cycle_logs",cloud.cycle_logs);
          if(cloud.cycle_meta!==undefined)LS.setSilent("cycle_meta",cloud.cycle_meta);
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
  /* "Edit My Answers" (prefill + let them change responses) vs "Retake
     Skin Quiz" (start fresh) are the same page, distinguished only by
     whether we hand the quiz its previous answers to start from. */
  const [quizEditing,setQuizEditing]=useState(false);
  const [habits,setHabits]=useState(()=>LS.get("habits3",DEFAULT_HABITS));
  const [,setWater]=useState(()=>LS.get("water_today",0));
  const [journalEntries,setJournalEntries]=useState(()=>LS.get("glowJournal",[]));

  const nav=(p)=>{setPage(p);LS.set("smira_page",p);setSideOpen(false);window.scrollTo(0,0);};
  /* Retake starts the quiz blank; Edit prefills it with the last answers
     on file so the person is adjusting, not starting over. */
  const goQuiz=(edit=false)=>{setQuizEditing(edit);nav("quiz");};

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
    ["smira_user","smira_results","smira_img","smira_scans","habits3","water_today","glowJournal","menstrual_cycles","cycle_logs","cycle_meta","diet_plan","diet_pref_type","diet_pref_budget","smira_page","auth_user","coach_msgs","notifs","movement_prefs","step_goal","step_log","energy_sleep_log","skin_checkin_log"].forEach(k=>LS.del(k));
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

  /* Shared handler for BOTH input methods (AI Skin Scan and Skin Quiz) —
     this is the single point where either source becomes the same
     normalized SkinAnalysisProfile the rest of the app reads from
     `results`/`scans`. `img` is a data URL for a photo scan, `null` for a
     standalone quiz (no photo to keep), or `undefined` with
     opts.keepImg to mean "this is a combined analysis — keep whichever
     photo is already on file". Numeric fields the current source can't
     actually measure (a quiz can't read hydration/elasticity/brightness
     from a face) are stored as null rather than a fabricated number, so
     downstream screens can tell "not measured" apart from "measured 0". */
  const handleResult=async(r,img,opts={})=>{
    const keepingExistingImg=img===undefined&&opts.keepImg;
    const nextImg=keepingExistingImg?scanImg:(img===undefined?null:img);
    setResults(r);
    if(!keepingExistingImg){setScanImg(nextImg);LS.set("smira_img",nextImg);}
    LS.set("smira_results",r);
    let thumb=null;
    if(nextImg)thumb=await makeThumb(nextImg).catch(()=>null);
    else if(keepingExistingImg&&scans.length)thumb=scans[scans.length-1].thumb||null;
    const entry={
      date:new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}),
      ts:Date.now(),
      source:r.source||(nextImg?"photo_scan":"skin_quiz"),
      overallScore:r.overallScore??null,
      hydrationLevel:r.hydrationLevel??null,
      elasticity:r.elasticity??null,
      brightness:r.brightness??null,
      skinType:r.skinType||null,
      skinAge:r.skinAge||null,
      concerns:(r.concerns||[]).map(c=>({name:c.name,severity:c.severity,confidence:c.confidence})),
      summary:r.aiSummary,
      thumb,
    };
    const next=[...scans,entry].slice(-30);
    setScans(next);LS.set("smira_scans",next);
    if(opts.navigate!==false)nav("results");
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
                <AuraLogo size={34}/>
                <Wordmark height={27}/>
              </div>
              <button onClick={()=>nav("settings")} style={{background:"none",border:"none",cursor:"pointer",padding:6,borderRadius:8,display:"flex",alignItems:"center",gap:6,color:T.muted}} title="Settings">
                <Ic n="gear" s={18} c={T.muted}/>
                {user?.name&&<span style={{fontSize:12,color:T.muted,display:"none"}} className="hide-mobile">{user.name.split(" ")[0]}</span>}
              </button>
            </div>
            <div key={page} className="page-fade" style={{padding:"0"}}>
              {page==="dashboard"&&<Dashboard user={user} results={results} onNav={nav} scans={scans} onQuiz={goQuiz}/>}
              {page==="myskin"&&<MySkinHub onNav={nav} results={results} onQuiz={goQuiz}/>}
              {page==="wellness"&&<WellnessHub onNav={nav}/>}
              {page==="scan"&&<SkinScan onResult={handleResult} onNav={nav} user={user} existingScans={scans} prevQuizResult={results?.source==="skin_quiz"?results:null}/>}
              {page==="quiz"&&<SkinQuiz onResult={handleResult} onNav={nav} user={user} prevPhotoResult={results&&(results.source==="photo_scan"||results.source==="combined")?results:null} initialAnswers={quizEditing?results?.quizResponses:null} onCancel={()=>nav("myskin")}/>}
              {page==="results"&&<Results results={results} img={scanImg} user={user} onNav={nav} scans={scans} onQuiz={goQuiz}/>}
              {page==="journal"&&<GlowJournal/>}
              {page==="products"&&<Products results={results} user={user}/>}
              {page==="nutrition"&&<Nutrition user={user} results={results}/>}
              {page==="challenges"&&<Challenges/>}
              {page==="movement"&&<Movement/>}
              {page==="energy"&&<EnergySleep/>}
              {page==="analytics"&&<Analytics scans={scans} onNav={nav}/>}
              {page==="journey"&&<Journey scans={scans} onNav={nav}/>}
              {page==="story"&&<MonthlyStory user={user} scans={scans} habits={habits} journalEntries={journalEntries}/>}
              {page==="forecast"&&<SkinForecast user={user} results={results}/>}
              {page==="menstrual"&&<MenstrualTracker scans={scans} user={user} onUpdateProfile={handleUpdateProfile} store={LS}/>}
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
