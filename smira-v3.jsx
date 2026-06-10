
import { useState, useEffect, useRef, useCallback } from "react";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, BarChart, Bar
} from "recharts";

/* ═══════════════════════════════════════════════════════════════════════════
   SMIRA V3 — Personal Wellness & Confidence Companion
   New: Rose/Plum palette, Confidence Score™, Glow Journal, Emotional AI,
   Avatar Companion, Skin Forecast, Monthly Story, Community Challenges,
   Food Trigger Correlation AI, Smira Memory
═══════════════════════════════════════════════════════════════════════════ */

const LS = {
  get: (k, fb = null) => { try { const v = localStorage.getItem("smira3_" + k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem("smira3_" + k, JSON.stringify(v)); } catch {} },
  del: (k) => { try { localStorage.removeItem("smira3_" + k); } catch {} },
};

// ── PALETTE: Dusky Rose → Deep Plum ─────────────────────────────────────────
// From screenshot: #F5E6EA → #F0C4CC → #D4879A → #B55C79 → #8B3A57 → #6B2244 → #4A1530 → #2E0E1F
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,400;1,600&family=DM+Sans:wght@300;400;500;600;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    :root{
      --dp:#1A0B12;--deep:#2E0E1F;--plum:#4A1530;--wine:#6B2244;
      --berry:#8B3A57;--rose:#B55C79;--blush:#D4879A;--petal:#F0C4CC;--mist:#F5E6EA;
      --card:rgba(74,21,48,0.45);--border:rgba(181,92,121,0.18);
      --txt:#F5E6EA;--muted:#C4909F;--soft:#D4879A;
      --ok:#A8E6C9;--warn:#F5D5A3;--err:#F5A3A3;
      --accent:linear-gradient(135deg,#B55C79,#6B2244);
      --glow:linear-gradient(135deg,#D4879A,#8B3A57);
    }
    html,body{height:100%;background:var(--dp);color:var(--txt);font-family:'DM Sans',sans-serif;overflow-x:hidden;}
    ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:#1A0B12}::-webkit-scrollbar-thumb{background:#6B2244;border-radius:2px}
    .cf{font-family:'Cormorant Garamond',serif}
    .glass{background:var(--card);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid var(--border);border-radius:20px;}
    .glow{box-shadow:0 0 32px rgba(181,92,121,0.2);}
    .btn{background:linear-gradient(135deg,#8B3A57,#B55C79);border:none;color:#F5E6EA;padding:12px 28px;border-radius:50px;font-family:'DM Sans',sans-serif;font-weight:600;font-size:14px;cursor:pointer;transition:all .3s;letter-spacing:.3px;}
    .btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 28px rgba(139,58,87,.55);}
    .btn:disabled{opacity:.45;cursor:not-allowed;}
    .btn-o{background:transparent;border:1px solid rgba(181,92,121,.35);color:#D4879A;padding:10px 22px;border-radius:50px;font-family:'DM Sans',sans-serif;font-weight:500;font-size:14px;cursor:pointer;transition:all .3s;}
    .btn-o:hover{background:rgba(181,92,121,.1);}
    .inp{background:rgba(255,255,255,.04);border:1px solid rgba(181,92,121,.18);border-radius:12px;padding:12px 16px;color:#F5E6EA;font-family:'DM Sans',sans-serif;font-size:14px;width:100%;outline:none;transition:border .3s;}
    .inp:focus{border-color:#D4879A;background:rgba(181,92,121,.07);}
    .inp::placeholder{color:#6B4455;}
    .sel{background:rgba(20,8,15,.95);border:1px solid rgba(181,92,121,.18);border-radius:12px;padding:12px 16px;color:#F5E6EA;font-family:'DM Sans',sans-serif;font-size:14px;width:100%;outline:none;cursor:pointer;}
    .tag{background:rgba(181,92,121,.14);border:1px solid rgba(181,92,121,.28);color:#D4879A;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:500;}
    @keyframes floatY{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
    @keyframes gPulse{0%,100%{opacity:.5}50%{opacity:1}}
    @keyframes scanLine{0%{top:0%}100%{top:98%}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    @keyframes heartbeat{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
    @keyframes slideIn{from{transform:translateX(-100%)}to{transform:translateX(0)}}
    @keyframes confetti{0%{transform:translateY(0) rotate(0deg);opacity:1}100%{transform:translateY(200px) rotate(720deg);opacity:0}}
    .fade-up{animation:fadeUp .5s ease forwards;}
    .orb{position:absolute;border-radius:50%;filter:blur(90px);pointer-events:none;animation:gPulse 5s ease-in-out infinite;}
    .scan-anim{position:absolute;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#D4879A,transparent);animation:scanLine 1.8s linear infinite;}
    .shimmer-bg{background:linear-gradient(90deg,rgba(255,255,255,.03) 25%,rgba(255,255,255,.08) 50%,rgba(255,255,255,.03) 75%);background-size:200% 100%;animation:shimmer 1.8s infinite;}
    .nav-link{color:#9A6677;font-size:13px;font-weight:500;cursor:pointer;padding:9px 14px;border-radius:10px;transition:all .2s;display:flex;align-items:center;gap:9px;border:none;background:transparent;width:100%;text-align:left;}
    .nav-link:hover,.nav-link.act{color:#D4879A;background:rgba(181,92,121,.13);}
    .pbar{height:5px;background:rgba(181,92,121,.1);border-radius:3px;overflow:hidden;}
    .pfill{height:100%;border-radius:3px;transition:width 1.2s ease;}
    .tab-btn{padding:9px 17px;border-radius:10px;font-size:13px;font-weight:500;cursor:pointer;transition:all .2s;color:#9A6677;border:none;background:transparent;}
    .tab-btn.act{background:rgba(181,92,121,.18);color:#D4879A;}
    .check-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(181,92,121,.07);}
    .check-row:last-child{border-bottom:none;}
    .streak{background:linear-gradient(135deg,#B55C79,#6B2244);padding:4px 13px;border-radius:20px;font-size:12px;font-weight:700;color:#F5E6EA;}
    .concern-zone{position:absolute;border-radius:50%;border:2px solid;animation:gPulse 2s ease-in-out infinite;cursor:pointer;}
    .tip-card{animation:fadeUp .5s ease;}
    .conf-ring{animation:heartbeat 2.5s ease-in-out infinite;}
    @media(max-width:768px){
      .sidebar-overlay{display:block!important;}
      .app-sidebar{transform:translateX(-100%);transition:transform .3s;position:fixed;z-index:100;height:100vh;}
      .app-sidebar.open{transform:translateX(0);animation:slideIn .3s ease;}
      .app-main{margin-left:0!important;}
      .hamburger{display:flex!important;}
      .hide-mobile{display:none!important;}
    }
    .sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99;}
    .hamburger{display:none;background:none;border:none;cursor:pointer;padding:8px;color:#D4879A;flex-direction:column;gap:5px;}
    .hamburger span{display:block;width:22px;height:2px;background:#D4879A;border-radius:2px;}
    .mood-btn{padding:10px 16px;border-radius:14px;border:1px solid rgba(181,92,121,.22);background:rgba(181,92,121,.06);cursor:pointer;transition:all .2s;font-size:20px;display:flex;flex-direction:column;align-items:center;gap:4px;}
    .mood-btn.sel,.mood-btn:hover{background:rgba(181,92,121,.2);border-color:#D4879A;transform:scale(1.06);}
    .challenge-card{background:linear-gradient(135deg,rgba(139,58,87,.22),rgba(74,21,48,.4));border:1px solid rgba(181,92,121,.25);border-radius:18px;padding:20px;}
    .avatar-bubble{position:fixed;bottom:28px;right:28px;z-index:200;cursor:pointer;}
    .avatar-msg{position:absolute;bottom:72px;right:0;background:rgba(30,10,20,.95);border:1px solid rgba(181,92,121,.35);border-radius:14px 14px 4px 14px;padding:12px 16px;width:220px;font-size:13px;color:#F0C4CC;line-height:1.65;box-shadow:0 8px 32px rgba(0,0,0,.4);}
  `}</style>
);

// ── ICONS ────────────────────────────────────────────────────────────────────
const Ic = ({ n, s = 18, c = "currentColor" }) => {
  const d = {
    home: <svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    scan: <svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/><circle cx="12" cy="12" r="4"/></svg>,
    chart: <svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    bag: <svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
    leaf: <svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><path d="M17 8C8 10 5.9 16.17 3.82 21.6c4.8-1.5 9.5-5 11.18-9.6"/><path d="M17 8c1.5 3.5-.5 8-3 11"/><path d="M17 8s1-6-6-8"/></svg>,
    bot: <svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>,
    send: <svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    star: <svg width={s} height={s} fill={c} viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
    ok: <svg width={s} height={s} fill="none" stroke={c} strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
    alert: <svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    journal: <svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>,
    drop: <svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/></svg>,
    dl: <svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
    cycle: <svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
    heart: <svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>,
    trophy: <svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><polyline points="8 15 8 21"/><polyline points="16 15 16 21"/><line x1="5" y1="21" x2="19" y2="21"/><path d="M7.5 15h9M17 5H7L5 2H19L17 5z"/><path d="M5 5a7 7 0 0014 0"/></svg>,
    spark: <svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    compare: <svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="18"/><rect x="14" y="3" width="7" height="18"/></svg>,
    x: <svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    share: <svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
    forecast: <svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24"><path d="M17.5 19H9a7 7 0 113.19-13.28A5.5 5.5 0 1117.5 19z"/></svg>,
  };
  return d[n] || null;
};

// ── ANIMATED RING ────────────────────────────────────────────────────────────
const Ring = ({ score, size = 110, label = "", color = "#D4879A", subtitle = "" }) => {
  const [s, setS] = useState(0);
  useEffect(() => { const t = setTimeout(() => setS(score), 120); return () => clearTimeout(t); }, [score]);
  const r = (size - 16) / 2, circ = 2 * Math.PI * r, off = circ - (s / 100) * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(181,92,121,.1)" strokeWidth="6" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.4s ease" }} />
        <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle"
          style={{ fill: "#F5E6EA", fontSize: size/5, fontWeight: 700, fontFamily: "DM Sans", transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px` }}>{s}</text>
        <text x={size/2} y={size/2+size/5.5} textAnchor="middle" dominantBaseline="middle"
          style={{ fill: "#9A6677", fontSize: size/10, fontFamily: "DM Sans", transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px` }}>/100</text>
      </svg>
      {label && <span style={{ fontSize: 12, color: "#9A6677", fontWeight: 500 }}>{label}</span>}
      {subtitle && <span style={{ fontSize: 10, color: "#6B4455" }}>{subtitle}</span>}
    </div>
  );
};

const ConfBar = ({ pct, color = "#D4879A" }) => {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(pct), 200); return () => clearTimeout(t); }, [pct]);
  return <div className="pbar"><div className="pfill" style={{ width: `${w}%`, background: `linear-gradient(90deg,${color}60,${color})` }} /></div>;
};

// ── SKIN TIPS ────────────────────────────────────────────────────────────────
const TIPS = [
  "💧 Your skin is not a problem to fix — it's a living part of you that deserves care, not criticism.",
  "☀️ Consistency matters more than perfection. One missed day won't undo weeks of progress.",
  "🌙 Beauty sleep is real: your skin rebuilds collagen between 11 PM–2 AM. Rest is self-care.",
  "🥑 Omega-3 rich foods like walnuts and flaxseed reduce inflammation from the inside out.",
  "🌿 Niacinamide works for almost every skin type — brightening, pore-minimizing, and calming.",
  "🧘 Stress is one of the biggest triggers for breakouts. Taking a breath is skincare too.",
  "🍬 High sugar spikes insulin, which increases androgen hormones linked to breakouts.",
  "💕 You are worthy of care exactly as you are right now — not after your skin clears up.",
  "🫧 Cleansing for 60 seconds is significantly more effective than a quick rinse.",
  "📱 Your phone touches your face constantly — clean it daily to reduce bacterial transfer.",
];
const SkinTip = () => {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * TIPS.length));
  const [key, setKey] = useState(0);
  const next = () => { setIdx(i => (i + 1) % TIPS.length); setKey(k => k + 1); };
  return (
    <div style={{ padding: "18px 22px", borderRadius: 18, background: "linear-gradient(135deg,rgba(181,92,121,.14),rgba(107,34,68,.12))", border: "1px solid rgba(181,92,121,.22)", cursor: "pointer" }} onClick={next}>
      <div style={{ fontSize: 11, color: "#D4879A", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>Today's Reminder · tap to refresh</div>
      <p key={key} className="tip-card" style={{ fontSize: 13, color: "#F0C4CC", lineHeight: 1.75 }}>{TIPS[idx]}</p>
    </div>
  );
};

// ── DATA ─────────────────────────────────────────────────────────────────────
const WEEKLY = [
  { day: "Mon", acne: 45, hydration: 62, brightness: 55, confidence: 58 },
  { day: "Tue", acne: 48, hydration: 65, brightness: 57, confidence: 60 },
  { day: "Wed", acne: 42, hydration: 68, brightness: 60, confidence: 63 },
  { day: "Thu", acne: 38, hydration: 70, brightness: 63, confidence: 67 },
  { day: "Fri", acne: 35, hydration: 72, brightness: 65, confidence: 70 },
  { day: "Sat", acne: 32, hydration: 74, brightness: 68, confidence: 73 },
  { day: "Sun", acne: 30, hydration: 75, brightness: 70, confidence: 76 },
];
const MONTHLY = [{ week: "Wk 1", score: 48, confidence: 52 }, { week: "Wk 2", score: 55, confidence: 58 }, { week: "Wk 3", score: 61, confidence: 65 }, { week: "Wk 4", score: 68, confidence: 76 }];

const DEFAULT_HABITS = [
  { id: 1, icon: "☀️", label: "Morning skincare routine", done: false },
  { id: 2, icon: "💧", label: "8 glasses of water", done: false },
  { id: 3, icon: "🌙", label: "Night routine + cleanse", done: false },
  { id: 4, icon: "🧴", label: "SPF applied", done: false },
  { id: 5, icon: "🧘", label: "Stress relief / breathing", done: false },
  { id: 6, icon: "🥗", label: "Skin-friendly meal", done: false },
];

const ALL_PRODUCTS = {
  cleanser: [
    { name: "CeraVe Foaming Cleanser", brand: "CeraVe", price: "₹699", tier: "Budget", rating: 4.5, ing: ["Niacinamide", "Ceramides"], benefit: "Removes excess oil without stripping", for: ["Oily", "Combination", "Acne"] },
    { name: "La Roche-Posay Effaclar", brand: "LRP", price: "₹1,299", tier: "Mid", rating: 4.7, ing: ["Salicylic Acid", "Zinc"], benefit: "Targets acne-prone skin", for: ["Acne", "Oily"] },
    { name: "Cetaphil Gentle Cleanser", brand: "Cetaphil", price: "₹599", tier: "Budget", rating: 4.4, ing: ["Glycerin", "Niacinamide"], benefit: "Ultra-gentle for sensitive skin", for: ["Dry", "Sensitive", "Normal"] },
    { name: "Tatcha The Rice Wash", brand: "Tatcha", price: "₹3,499", tier: "Luxury", rating: 4.8, ing: ["Japanese Rice", "Green Tea"], benefit: "Gentle brightening deep cleanse", for: ["All"] },
  ],
  serum: [
    { name: "Minimalist Niacinamide 10%", brand: "Minimalist", price: "₹399", tier: "Budget", rating: 4.6, ing: ["Niacinamide 10%", "Zinc 1%"], benefit: "Pore minimizing + oil control", for: ["Oily", "Combination", "Acne"] },
    { name: "Minimalist Alpha Arbutin", brand: "Minimalist", price: "₹449", tier: "Budget", rating: 4.5, ing: ["Alpha Arbutin 2%", "Hyaluronic Acid"], benefit: "Fades dark spots and pigmentation", for: ["Hyperpigmentation", "Dark Circles"] },
    { name: "Paula's Choice BHA 2%", brand: "Paula's Choice", price: "₹2,199", tier: "Mid", rating: 4.8, ing: ["Salicylic Acid 2%", "Green Tea"], benefit: "Unclogs pores deeply", for: ["Acne", "Blackheads"] },
    { name: "SkinCeuticals C E Ferulic", brand: "SkinCeuticals", price: "₹8,999", tier: "Luxury", rating: 4.9, ing: ["Vitamin C 15%", "Ferulic Acid"], benefit: "Antioxidant protection + glow", for: ["Hyperpigmentation", "Dullness"] },
  ],
  moisturizer: [
    { name: "Neutrogena Hydro Boost", brand: "Neutrogena", price: "₹799", tier: "Budget", rating: 4.5, ing: ["Hyaluronic Acid", "Glycerin"], benefit: "Lightweight deep hydration", for: ["Dry", "Dehydration", "Normal"] },
    { name: "Dot & Key Water Drench", brand: "Dot & Key", price: "₹649", tier: "Budget", rating: 4.3, ing: ["Hyaluronic Acid", "Ceramides"], benefit: "Intensely hydrating gel cream", for: ["Combination", "Oily"] },
    { name: "Kiehl's Ultra Facial Cream", brand: "Kiehl's", price: "₹2,800", tier: "Mid", rating: 4.7, ing: ["Squalane", "Glacial Glycoprotein"], benefit: "Long-lasting barrier repair", for: ["Dry", "Sensitive"] },
    { name: "La Mer Crème de la Mer", brand: "La Mer", price: "₹18,500", tier: "Luxury", rating: 4.9, ing: ["Miracle Broth™", "Seaweed"], benefit: "Ultimate repair and regeneration", for: ["All"] },
  ],
  sunscreen: [
    { name: "Minimalist SPF 50 PA++++", brand: "Minimalist", price: "₹349", tier: "Budget", rating: 4.6, ing: ["Zinc Oxide", "Hyaluronic Acid"], benefit: "Invisible finish, broad spectrum", for: ["All"] },
    { name: "Biore UV Aqua Rich", brand: "Biore", price: "₹899", tier: "Budget", rating: 4.8, ing: ["Uvinul A Plus", "Tinosorb S"], benefit: "Ultra-lightweight, water-resistant", for: ["Oily", "Combination"] },
    { name: "Isntree Hyaluronic Acid SPF 50+", brand: "Isntree", price: "₹1,199", tier: "Mid", rating: 4.7, ing: ["HA", "Ceramides", "SPF50+"], benefit: "Hydrating + high protection", for: ["Dry", "Sensitive"] },
    { name: "Supergoop Unseen Sunscreen", brand: "Supergoop", price: "₹3,200", tier: "Luxury", rating: 4.9, ing: ["SPF 40", "Meadowfoam Seed"], benefit: "Makeup primer + invisible protection", for: ["All"] },
  ],
};

const MEALS = [
  { day: "Monday", breakfast: "Oats + berries + flaxseeds + green tea", lunch: "Dal rice + sautéed spinach + curd", dinner: "Grilled salmon + quinoa + broccoli", snack: "Walnuts + dark chocolate" },
  { day: "Tuesday", breakfast: "Moong dal chilla + coconut chutney", lunch: "Rajma chawal + salad + buttermilk", dinner: "Tofu stir-fry + brown rice + bok choy", snack: "Amla juice + almonds" },
  { day: "Wednesday", breakfast: "Avocado toast + boiled eggs + turmeric milk", lunch: "Palak paneer + whole wheat roti", dinner: "Grilled chicken + sweet potato + greens", snack: "Papaya + pumpkin seeds" },
  { day: "Thursday", breakfast: "Idli + sambar + coconut chutney", lunch: "Mixed veg curry + brown rice + raita", dinner: "Lentil soup + roti + cucumber", snack: "Carrots + hummus" },
  { day: "Friday", breakfast: "Banana smoothie (no sugar) + poha", lunch: "Chole + roti + onion salad", dinner: "Baked fish + roasted vegetables + quinoa", snack: "Kiwi + flaxseeds" },
  { day: "Saturday", breakfast: "Pancakes (oat flour) + berries + honey", lunch: "Buddha bowl — rice, chickpeas, tahini", dinner: "Paneer tikka + roti + mint chutney", snack: "Mixed nuts + green tea" },
  { day: "Sunday", breakfast: "Dosa + sambar + coconut + boiled egg", lunch: "Dal khichdi + ghee + papad + curd", dinner: "Grilled prawn + brown rice + salad", snack: "Almond milk + dates" },
];

// ── CONFIDENCE SCORE CALCULATOR ───────────────────────────────────────────────
const calcConfidenceScore = (habits, water, journalEntries, scans) => {
  const habitPct = habits ? (habits.filter(h => h.done).length / habits.length) * 100 : 50;
  const waterPct = Math.min((water / 8) * 100, 100);
  const journalBonus = Math.min((journalEntries?.length || 0) * 5, 20);
  const scanBonus = Math.min((scans?.length || 0) * 3, 15);
  return Math.round((habitPct * 0.35 + waterPct * 0.25 + journalBonus + scanBonus + 30));
};

// ── AVATAR COMPANION ─────────────────────────────────────────────────────────
const AVATAR_MSGS = [
  "You're doing beautifully. Every small habit adds up. 🌸",
  "Your skin journey is uniquely yours — comparison steals joy.",
  "I noticed you've been consistent this week. That's everything. ✨",
  "Skin conditions are normal. You are not less beautiful because of them.",
  "Progress isn't always visible. But it's always happening. 💕",
  "Today's self-care is tomorrow's confidence. Keep going!",
  "You're more than your skin. Always have been. Always will be. 🌹",
];
const AvatarCompanion = ({ name }) => {
  const [open, setOpen] = useState(false);
  const [msgIdx] = useState(() => Math.floor(Math.random() * AVATAR_MSGS.length));
  return (
    <div className="avatar-bubble" onClick={() => setOpen(o => !o)}>
      {open && <div className="avatar-msg">{AVATAR_MSGS[msgIdx]}<div style={{ marginTop: 6, fontSize: 11, color: "#9A6677" }}>Your Smira companion</div></div>}
      <div className="conf-ring" style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg,#8B3A57,#D4879A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: "0 4px 20px rgba(181,92,121,.5)", border: "2px solid rgba(240,196,204,.3)" }}>
        🌸
      </div>
    </div>
  );
};

// ── LANDING ──────────────────────────────────────────────────────────────────
const Landing = ({ onEnter }) => (
  <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", padding: 24, textAlign: "center" }}>
    <div className="orb" style={{ width: 500, height: 500, background: "rgba(139,58,87,.2)", top: "-10%", left: "-10%", animationDelay: "0s" }} />
    <div className="orb" style={{ width: 400, height: 400, background: "rgba(74,21,48,.3)", bottom: "-5%", right: "-5%", animationDelay: "2.5s" }} />
    <div className="orb" style={{ width: 300, height: 300, background: "rgba(181,92,121,.15)", top: "30%", right: "15%", animationDelay: "1.2s" }} />
    <div style={{ zIndex: 10, maxWidth: 560, position: "relative" }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg,#8B3A57,#D4879A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: "0 4px 20px rgba(181,92,121,.4)" }}>🌸</div>
          <span className="cf" style={{ fontSize: 36, fontWeight: 600, background: "linear-gradient(135deg,#F0C4CC,#D4879A)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Smira</span>
          <span style={{ fontSize: 11, color: "#8B3A57", background: "rgba(139,58,87,.2)", padding: "3px 9px", borderRadius: 20, fontWeight: 600, letterSpacing: ".04em" }}>V3</span>
        </div>
        <h1 className="cf" style={{ fontSize: "clamp(36px,6vw,58px)", fontWeight: 300, lineHeight: 1.2, marginBottom: 20, letterSpacing: "-.01em" }}>
          You're already<br />
          <em style={{ background: "linear-gradient(135deg,#F0C4CC,#B55C79)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontStyle: "italic" }}>beautiful.</em><br />
          Let's also make you<br /><em style={{ background: "linear-gradient(135deg,#D4879A,#6B2244)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>feel it.</em>
        </h1>
        <p style={{ color: "#9A6677", fontSize: 15, lineHeight: 1.8, maxWidth: 420, margin: "0 auto 36px" }}>
          Smira isn't about fixing what's "wrong" with your skin. It's about understanding your body, building confidence, and celebrating your progress — one day at a time.
        </p>
        <button className="btn" onClick={onEnter} style={{ padding: "16px 44px", fontSize: 15, letterSpacing: ".03em" }}>Begin Your Journey ✨</button>
      </div>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 32 }}>
        {["🔬 Real AI Skin Analysis", "💕 Confidence Score™", "📖 Glow Journal", "🌿 Wellness Companion", "🔮 Skin Forecast"].map(t => (
          <div key={t} style={{ fontSize: 12, color: "#B55C79", padding: "6px 14px", background: "rgba(181,92,121,.1)", borderRadius: 20, border: "1px solid rgba(181,92,121,.2)" }}>{t}</div>
        ))}
      </div>
    </div>
  </div>
);

// ── ONBOARDING ───────────────────────────────────────────────────────────────
const Onboarding = ({ onDone }) => {
  const [step, setStep] = useState(0);
  const [d, setD] = useState({ name: "", email: "", age: "", gender: "", height: "", weight: "", diet: "", water: "6-8 glasses", sleep: "7-8 hrs", stress: "Moderate", exercise: "3-4x/week", pcos: false, pcod: false, thyroid: false, diabetes: false, hypertension: false, menstrualTracking: false, skinGoal: [], wellnessGoal: [] });
  const upd = (k, v) => setD(x => ({ ...x, [k]: v }));
  const toggle = (k) => setD(x => ({ ...x, [k]: !x[k] }));
  const toggleGoal = (g, arr) => setD(x => ({ ...x, [arr]: x[arr].includes(g) ? x[arr].filter(i => i !== g) : [...x[arr], g] }));

  const steps = [
    { title: "Welcome to Smira V3", sub: "Your personal wellness & confidence companion", icon: "🌸" },
    { title: "About You", sub: "Help us personalize your journey", icon: "👤" },
    { title: "Body & Lifestyle", sub: "Your habits shape your skin and confidence", icon: "🌿" },
    { title: "Health Background", sub: "Optional — helps us personalize deeply", icon: "💊" },
    { title: "Your Skin Goals", sub: "What matters to you?", icon: "✨" },
    { title: "Wellness Goals", sub: "Smira goes beyond skincare", icon: "💕" },
  ];

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", position: "relative" }}>
      <div className="orb" style={{ width: 380, height: 380, background: "rgba(139,58,87,.18)", top: "5%", right: "3%" }} />
      <div style={{ width: "100%", maxWidth: 500, zIndex: 10, position: "relative" }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "#9A6677" }}>Step {step + 1} of {steps.length}</span>
            <span style={{ fontSize: 12, color: "#D4879A", fontWeight: 600 }}>{Math.round(((step + 1) / steps.length) * 100)}%</span>
          </div>
          <div className="pbar"><div className="pfill" style={{ width: `${((step + 1) / steps.length) * 100}%`, background: "linear-gradient(90deg,#6B2244,#D4879A)" }} /></div>
        </div>
        <div className="glass glow" style={{ padding: "38px 34px", borderRadius: 26 }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>{steps[step].icon}</div>
            <h2 className="cf" style={{ fontSize: 28, marginBottom: 6, fontWeight: 400 }}>{steps[step].title}</h2>
            <p style={{ color: "#9A6677", fontSize: 13 }}>{steps[step].sub}</p>
          </div>
          {step === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {["🔬 Real AI vision skin analysis", "💕 Confidence Score™ — not beauty score", "📖 Glow Journal for emotional growth", "🔮 Skin Forecast predictions", "🤖 Emotionally intelligent AI coach", "🏆 Monthly Smira Story recap"].map(t => (
                <div key={t} style={{ fontSize: 13, color: "#F0C4CC", padding: "9px 14px", background: "rgba(181,92,121,.08)", borderRadius: 10, border: "1px solid rgba(181,92,121,.12)" }}>{t}</div>
              ))}
            </div>
          )}
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <input className="inp" placeholder="Full Name *" value={d.name} onChange={e => upd("name", e.target.value)} />
              <input className="inp" placeholder="Email Address" type="email" value={d.email} onChange={e => upd("email", e.target.value)} />
              <input className="inp" placeholder="Age *" type="number" value={d.age} onChange={e => upd("age", e.target.value)} />
              <select className="sel" value={d.gender} onChange={e => upd("gender", e.target.value)}>
                <option value="">Select Gender</option>
                <option>Female</option><option>Male</option><option>Non-binary</option><option>Prefer not to say</option>
              </select>
            </div>
          )}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <input className="inp" placeholder="Height (cm)" type="number" value={d.height} onChange={e => upd("height", e.target.value)} />
                <input className="inp" placeholder="Weight (kg)" type="number" value={d.weight} onChange={e => upd("weight", e.target.value)} />
              </div>
              <select className="sel" value={d.diet} onChange={e => upd("diet", e.target.value)}>
                <option value="">Diet Preference</option>
                <option>Vegetarian</option><option>Vegan</option><option>Non-Vegetarian</option><option>Eggetarian</option>
              </select>
              {[{ label: "Daily Water Intake", key: "water", opts: ["< 4 glasses", "4-6 glasses", "6-8 glasses", "8+ glasses"] }, { label: "Sleep Duration", key: "sleep", opts: ["< 5 hrs", "5-6 hrs", "7-8 hrs", "8+ hrs"] }, { label: "Stress Level", key: "stress", opts: ["Low", "Moderate", "High", "Very High"] }].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 11, color: "#9A6677", display: "block", marginBottom: 5 }}>{f.label}</label>
                  <select className="sel" value={d[f.key]} onChange={e => upd(f.key, e.target.value)}>{f.opts.map(o => <option key={o}>{o}</option>)}</select>
                </div>
              ))}
            </div>
          )}
          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <p style={{ fontSize: 12, color: "#9A6677", marginBottom: 6 }}>Select any that apply — helps us personalize deeply:</p>
              {[{ k: "pcos", l: "PCOS", desc: "Polycystic Ovary Syndrome" }, { k: "pcod", l: "PCOD", desc: "Polycystic Ovarian Disease" }, { k: "thyroid", l: "Thyroid Disorder", desc: "Hypo / Hyperthyroidism" }, { k: "diabetes", l: "Diabetes", desc: "Type 1 or 2" }, { k: "menstrualTracking", l: "Track Menstrual Cycle", desc: "For hormonal skin insights" }].map(c => (
                <div key={c.k} onClick={() => toggle(c.k)}
                  style={{ display: "flex", alignItems: "center", gap: 13, padding: "12px 15px", borderRadius: 12, cursor: "pointer", background: d[c.k] ? "rgba(181,92,121,.18)" : "rgba(255,255,255,.03)", border: `1px solid ${d[c.k] ? "#D4879A" : "rgba(181,92,121,.1)"}`, transition: "all .2s" }}>
                  <div style={{ width: 21, height: 21, borderRadius: 6, background: d[c.k] ? "linear-gradient(135deg,#8B3A57,#D4879A)" : "rgba(181,92,121,.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {d[c.k] && <Ic n="ok" s={12} c="#fff" />}
                  </div>
                  <div><div style={{ fontSize: 14, fontWeight: 500 }}>{c.l}</div><div style={{ fontSize: 11, color: "#6B4455" }}>{c.desc}</div></div>
                </div>
              ))}
            </div>
          )}
          {step === 4 && (
            <div>
              <p style={{ fontSize: 13, color: "#9A6677", marginBottom: 13 }}>Choose your skin goals:</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
                {["Clear Acne", "Fade Pigmentation", "Deep Hydration", "Anti-Aging", "Even Skin Tone", "Reduce Pores", "Glow & Radiance", "Soothe Redness", "Tackle Dark Circles", "Oil Control"].map(g => (
                  <div key={g} onClick={() => toggleGoal(g, "skinGoal")}
                    style={{ padding: "8px 16px", borderRadius: 24, cursor: "pointer", fontSize: 13, fontWeight: 500, transition: "all .2s", background: d.skinGoal.includes(g) ? "linear-gradient(135deg,#8B3A57,#D4879A)" : "rgba(181,92,121,.1)", color: d.skinGoal.includes(g) ? "#fff" : "#D4879A", border: `1px solid ${d.skinGoal.includes(g) ? "transparent" : "rgba(181,92,121,.2)"}` }}>{g}</div>
                ))}
              </div>
            </div>
          )}
          {step === 5 && (
            <div>
              <p style={{ fontSize: 13, color: "#9A6677", marginBottom: 13 }}>What wellness areas matter to you?</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
                {["Build Confidence", "Improve Sleep", "Reduce Stress", "Better Nutrition", "Consistent Habits", "Hormonal Balance", "Mental Wellness", "Track Progress", "Self-Care Rituals"].map(g => (
                  <div key={g} onClick={() => toggleGoal(g, "wellnessGoal")}
                    style={{ padding: "8px 16px", borderRadius: 24, cursor: "pointer", fontSize: 13, fontWeight: 500, transition: "all .2s", background: d.wellnessGoal.includes(g) ? "linear-gradient(135deg,#8B3A57,#D4879A)" : "rgba(181,92,121,.1)", color: d.wellnessGoal.includes(g) ? "#fff" : "#D4879A", border: `1px solid ${d.wellnessGoal.includes(g) ? "transparent" : "rgba(181,92,121,.2)"}` }}>{g}</div>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 11, marginTop: 28 }}>
            {step > 0 && <button className="btn-o" onClick={() => setStep(s => s - 1)} style={{ flex: 1 }}>Back</button>}
            <button className="btn" onClick={() => step < steps.length - 1 ? setStep(s => s + 1) : onDone(d)} style={{ flex: 2 }} disabled={step === 1 && !d.name}>
              {step === steps.length - 1 ? "Start My Journey 🌸" : "Continue →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── VISION AI ANALYSIS ───────────────────────────────────────────────────────
const getMediaType = (dataUrl) => {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  const raw = match ? match[1] : "image/jpeg";
  // Anthropic only accepts jpeg, png, gif, webp
  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  return allowed.includes(raw) ? raw : "image/jpeg";
};

const resizeImageIfNeeded = (dataUrl) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1120;
      if (img.width <= MAX && img.height <= MAX) { resolve(dataUrl); return; }
      const canvas = document.createElement("canvas");
      const scale = MAX / Math.max(img.width, img.height);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
};

const runVisionAnalysis = async (imgData, user) => {
  // Resize large images and detect correct media type
  const resized = await resizeImageIfNeeded(imgData);
  const mediaType = getMediaType(resized);
  const base64Data = resized.split(",")[1];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: `You are a professional dermatologist AI for Smira V3. Analyze facial skin from photos. CRITICAL philosophy: Never imply skin conditions make someone less beautiful. Frame everything supportively and empathetically. Skin conditions are normal and manageable. Return ONLY valid JSON, no markdown.`,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
        { type: "text", text: `Analyze this person's skin compassionately. Return JSON: {overallScore:number(40-90),hydrationLevel:number(30-90),elasticity:number(40-90),brightness:number(30-85),skinAge:string,skinType:string,aiSummary:string(2-3 warm supportive sentences acknowledging skin normally while noting what's present),emotionalNote:string(1 affirming sentence),concerns:[{name,severity:"Low|Moderate|High",confidence:number,color:string,description:string}](max4),rootCauses:[{cause,probability:number,icon}](max4),heatZones:[{x:number,y:number,label,color,intensity:"Low|Medium|High"}](max4),dynamicQuestions:[{q,opts:[string]}](max2),forecast:{hydration30days:number,brightnessChange:string,recommendation:string},triggers:[{food:string,correlation:number,insight:string}](max3)} User context: ${user?.pcos?"PCOS":""} ${user?.thyroid?"thyroid":""} age ${user?.age} ${user?.stress} stress ${user?.sleep} sleep` }
      ]}],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`API error ${res.status}: ${errBody}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "API returned an error");

  const text = data?.content?.[0]?.text || "{}";
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    // If JSON parse fails, extract JSON from text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error("Could not parse AI response as JSON");
  }
};

// ── SKIN SCAN ────────────────────────────────────────────────────────────────
const SkinScan = ({ onResult, user, existingScans }) => {
  const [mode, setMode] = useState("upload");
  const [img, setImg] = useState(null);
  const [progress, setProgress] = useState(0);
  const [stepTxt, setStepTxt] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [err, setErr] = useState("");
  const vidRef = useRef(null);
  const canRef = useRef(null);
  const fileRef = useRef(null);

  const STEPS = ["Detecting facial boundaries...", "Reading skin texture...", "Mapping concern zones...", "Checking hydration markers...", "Identifying patterns with care...", "Building your personal insights...", "Preparing your compassionate report..."];

  const doAnalysis = useCallback(async (imgData) => {
    setAnalyzing(true); setProgress(0); setErr("");
    let p = 0, si = 0;
    setStepTxt(STEPS[0]);
    const ticker = setInterval(() => {
      p = Math.min(p + Math.random() * 12 + 3, 88);
      setProgress(Math.round(p));
      si = Math.min(Math.floor(p / (88 / STEPS.length)), STEPS.length - 1);
      setStepTxt(STEPS[si]);
    }, 500);
    try {
      const result = await runVisionAnalysis(imgData, user);
      clearInterval(ticker);
      setProgress(100);
      setStepTxt("Ready ✨");
      setTimeout(() => { onResult(result, imgData); setAnalyzing(false); }, 700);
    } catch (e) {
      clearInterval(ticker);
      setErr("Analysis couldn't complete. Please check your connection and try again.");
      setAnalyzing(false); setProgress(0);
    }
  }, [user, onResult]);

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = ev => { setImg(ev.target.result); setMode("preview"); };
    r.readAsDataURL(f);
  };

  if (analyzing) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "65vh", padding: 24 }}>
      <div className="glass" style={{ padding: "52px 44px", borderRadius: 28, textAlign: "center", maxWidth: 360 }}>
        <div style={{ position: "relative", width: 130, height: 130, margin: "0 auto 28px" }}>
          <svg width="130" height="130" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="65" cy="65" r="55" fill="none" stroke="rgba(181,92,121,.1)" strokeWidth="6" />
            <circle cx="65" cy="65" r="55" fill="none" stroke="#D4879A" strokeWidth="6" strokeDasharray="345" strokeDashoffset={345-(progress/100)*345} strokeLinecap="round" style={{ transition:"stroke-dashoffset .4s" }} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: "#D4879A" }}>{progress}%</span>
          </div>
        </div>
        <h3 className="cf" style={{ fontSize: 24, marginBottom: 10, fontWeight: 400 }}>Reading your skin with care</h3>
        <p style={{ color: "#D4879A", fontSize: 13, marginBottom: 8 }}>{stepTxt}</p>
        <p style={{ color: "#6B4455", fontSize: 12 }}>Powered by Smira AI Vision</p>
      </div>
    </div>
  );

  return (
    <div style={{ padding: "28px 22px", maxWidth: 680, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="cf" style={{ fontSize: 34, marginBottom: 7, fontWeight: 400 }}>Skin Analysis</h1>
        <p style={{ color: "#9A6677", fontSize: 13, lineHeight: 1.7 }}>Your skin is unique and beautiful. This analysis is here to help you understand it better — not judge it.</p>
      </div>
      {err && <div style={{ background: "rgba(245,163,163,.08)", border: "1px solid rgba(245,163,163,.25)", borderRadius: 12, padding: "12px 16px", marginBottom: 18, display: "flex", gap: 9, alignItems: "center" }}><Ic n="alert" s={15} c="#F5A3A3" /><span style={{ fontSize: 13, color: "#F5A3A3" }}>{err}</span></div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {[["upload", "📤 Upload Photo"], ["camera", "📷 Use Camera"]].map(([m, l]) => (
          <button key={m} onClick={() => m === "camera" ? (async () => { setMode("camera"); try { const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } }); if (vidRef.current) { vidRef.current.srcObject = s; vidRef.current.play(); } } catch { setMode("upload"); setErr("Camera not accessible."); } })() : fileRef.current?.click()}
            style={{ flex: 1, padding: "13px", borderRadius: 14, border: `1px solid ${mode === m ? "#D4879A" : "rgba(181,92,121,.2)"}`, background: mode === m ? "rgba(181,92,121,.15)" : "rgba(255,255,255,.02)", color: mode === m ? "#D4879A" : "#9A6677", cursor: "pointer", fontSize: 14, fontWeight: 500, transition: "all .2s" }}>{l}</button>
        ))}
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />

      {(mode === "upload" || mode === "preview") && (
        <div onClick={() => !img && fileRef.current?.click()}
          style={{ border: `2px dashed ${img ? "rgba(181,92,121,.35)" : "rgba(181,92,121,.2)"}`, borderRadius: 20, padding: "44px 24px", textAlign: "center", cursor: img ? "default" : "pointer", background: "rgba(181,92,121,.04)", transition: "all .3s", minHeight: 200 }}>
          {img ? (
            <div>
              <img src={img} alt="preview" style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 16, objectFit: "contain" }} />
              <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "center" }}>
                <button className="btn-o" onClick={() => { setImg(null); setMode("upload"); }} style={{ fontSize: 13 }}>Retake</button>
                <button className="btn" onClick={() => doAnalysis(img)} style={{ padding: "11px 28px", fontSize: 14 }}>Analyze with AI ✨</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 48, marginBottom: 14 }}>🌸</div>
              <p style={{ color: "#9A6677", fontSize: 14, lineHeight: 1.65 }}>Tap to upload a clear, well-lit photo<br /><span style={{ fontSize: 12, color: "#6B4455" }}>Your photo is analyzed privately and never stored permanently</span></p>
            </div>
          )}
        </div>
      )}

      {mode === "camera" && (
        <div style={{ borderRadius: 20, overflow: "hidden", position: "relative", background: "rgba(181,92,121,.06)" }}>
          <video ref={vidRef} style={{ width: "100%", borderRadius: 20, maxHeight: 340, objectFit: "cover" }} />
          <div className="scan-anim" />
          <canvas ref={canRef} style={{ display: "none" }} />
          <div style={{ padding: "14px", display: "flex", gap: 10, justifyContent: "center" }}>
            <button className="btn-o" onClick={() => { vidRef.current?.srcObject?.getTracks().forEach(t => t.stop()); setMode("upload"); }}>Cancel</button>
            <button className="btn" onClick={() => {
              const ctx = canRef.current?.getContext("2d");
              if (!ctx || !vidRef.current) return;
              canRef.current.width = vidRef.current.videoWidth;
              canRef.current.height = vidRef.current.videoHeight;
              ctx.drawImage(vidRef.current, 0, 0);
              const data = canRef.current.toDataURL("image/jpeg", 0.85);
              vidRef.current.srcObject?.getTracks().forEach(t => t.stop());
              setImg(data);
              doAnalysis(data);
            }}>Capture & Analyze ✨</button>
          </div>
        </div>
      )}

      {existingScans?.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#9A6677", marginBottom: 14 }}>Previous Scans</h3>
          <div style={{ display: "flex", gap: 9, overflowX: "auto", paddingBottom: 6 }}>
            {existingScans.slice(-5).reverse().map((s, i) => (
              <div key={i} className="glass" style={{ padding: "12px 14px", borderRadius: 14, flexShrink: 0, textAlign: "center", minWidth: 90 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#D4879A", marginBottom: 3 }}>{s.score}</div>
                <div style={{ fontSize: 10, color: "#6B4455" }}>{s.date}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── RESULTS ──────────────────────────────────────────────────────────────────
const Results = ({ results, img, user, onNav, scans }) => {
  const [tab, setTab] = useState("overview");
  const concernColors = { Low: "#A8E6C9", Moderate: "#F0C4CC", High: "#F5A3A3" };
  if (!results) return (
    <div style={{ padding: "28px 22px", textAlign: "center", maxWidth: 500, margin: "0 auto" }}>
      <div style={{ fontSize: 56, marginBottom: 18 }}>🌸</div>
      <h2 className="cf" style={{ fontSize: 28, marginBottom: 10, fontWeight: 400 }}>No analysis yet</h2>
      <p style={{ color: "#9A6677", marginBottom: 24, fontSize: 14 }}>Complete your first skin scan to see your personalized results and begin your journey.</p>
      <button className="btn" onClick={() => onNav("scan")}>Start Skin Analysis ✨</button>
    </div>
  );
  const radar = [
    { s: "Hydration", v: results.hydrationLevel || 62 },
    { s: "Brightness", v: results.brightness || 60 },
    { s: "Elasticity", v: results.elasticity || 70 },
    { s: "Clarity", v: 100 - (results.concerns?.find(c => c.name === "Acne")?.confidence || 40) },
    { s: "Evenness", v: results.overallScore || 68 },
  ];
  return (
    <div style={{ padding: "24px 22px", maxWidth: 920, margin: "0 auto" }}>
      {/* Emotional affirmation banner */}
      {results.emotionalNote && (
        <div style={{ marginBottom: 20, padding: "16px 22px", borderRadius: 16, background: "linear-gradient(135deg,rgba(181,92,121,.15),rgba(74,21,48,.2))", border: "1px solid rgba(181,92,121,.25)", display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 22 }}>🌸</span>
          <p style={{ fontSize: 14, color: "#F0C4CC", lineHeight: 1.7, fontStyle: "italic" }}>{results.emotionalNote}</p>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 13, marginBottom: 24 }}>
        <div className="glass glow" style={{ padding: "18px 14px", borderRadius: 18, textAlign: "center" }}><Ring score={results.overallScore || 68} size={90} label="Overall" /></div>
        <div className="glass" style={{ padding: "18px 14px", borderRadius: 18, textAlign: "center" }}><Ring score={results.hydrationLevel || 62} size={90} label="Hydration" color="#7EC8E3" /></div>
        <div className="glass" style={{ padding: "18px 14px", borderRadius: 18, textAlign: "center" }}><Ring score={results.elasticity || 71} size={90} label="Elasticity" color="#A8E6C9" /></div>
        <div className="glass" style={{ padding: "18px 14px", borderRadius: 18, textAlign: "center" }}><Ring score={results.brightness || 60} size={90} label="Brightness" color="#F0C4CC" /></div>
        <div className="glass" style={{ padding: "18px 14px", borderRadius: 18, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5 }}>
          <div style={{ fontSize: 30, fontWeight: 700, background: "linear-gradient(135deg,#F0C4CC,#D4879A)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{results.skinAge || "--"}</div>
          <div style={{ fontSize: 11, color: "#9A6677" }}>Skin Age</div>
          <span style={{ fontSize: 10, color: "#A8E6C9", background: "rgba(168,230,201,.1)", padding: "2px 8px", borderRadius: 10 }}>Actual: {user?.age || "–"}</span>
        </div>
      </div>
      {results.aiSummary && (
        <div style={{ marginBottom: 22, padding: "18px 22px", borderRadius: 16, background: "rgba(181,92,121,.1)", border: "1px solid rgba(181,92,121,.2)" }}>
          <div style={{ fontSize: 11, color: "#D4879A", fontWeight: 600, marginBottom: 7, textTransform: "uppercase", letterSpacing: ".06em" }}>Smira AI Summary</div>
          <p style={{ fontSize: 14, color: "#F0C4CC", lineHeight: 1.8 }}>{results.aiSummary}</p>
        </div>
      )}
      <div style={{ display: "flex", gap: 5, marginBottom: 22, overflowX: "auto", paddingBottom: 3 }}>
        {[["overview","📊 Overview"],["concerns","🔍 Concerns"],["heatmap","🗺️ Heat Map"],["forecast","🔮 Forecast"],["triggers","⚡ Triggers"],["routine","📋 Routine"]].map(([t,l]) => (
          <button key={t} className={`tab-btn${tab===t?" act":""}`} onClick={() => setTab(t)} style={{ whiteSpace: "nowrap" }}>{l}</button>
        ))}
      </div>
      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <div className="glass" style={{ padding: 22, borderRadius: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Skin Radar</h3>
            <ResponsiveContainer width="100%" height={200}><RadarChart data={radar}><PolarGrid stroke="rgba(181,92,121,.15)" /><PolarAngleAxis dataKey="s" tick={{ fill: "#9A6677", fontSize: 11 }} /><Radar dataKey="v" stroke="#D4879A" fill="rgba(212,135,154,.18)" fillOpacity={0.7} /></RadarChart></ResponsiveContainer>
          </div>
          <div className="glass" style={{ padding: 22, borderRadius: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Score Breakdown</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              {results.concerns?.slice(0,5).map(c => (
                <div key={c.name}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: "#F0C4CC" }}>{c.name}</span>
                    <span style={{ fontWeight: 600, color: "#D4879A" }}>{c.score || c.confidence}/100</span>
                  </div>
                  <ConfBar pct={c.score || c.confidence} color={c.color || "#D4879A"} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {tab === "concerns" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
          {results.concerns?.map(c => (
            <div key={c.name} className="glass" style={{ padding: "18px 20px", borderRadius: 16, borderLeft: `3px solid ${c.color || "#D4879A"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{c.name}</div>
                  <span style={{ fontSize: 12, color: concernColors[c.severity] || "#9A6677", fontWeight: 500 }}>{c.severity} severity</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: c.color || "#D4879A" }}>{c.confidence}%</div>
                  <div style={{ fontSize: 10, color: "#6B4455" }}>AI confidence</div>
                </div>
              </div>
              <ConfBar pct={c.confidence} color={c.color || "#D4879A"} />
              {c.description && <p style={{ fontSize: 12, color: "#9A6677", marginTop: 10, lineHeight: 1.6 }}>{c.description}</p>}
            </div>
          ))}
        </div>
      )}
      {tab === "heatmap" && (
        <div className="glass" style={{ padding: 24, borderRadius: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Concern Zone Map</h3>
          <p style={{ fontSize: 13, color: "#9A6677", marginBottom: 20 }}>Areas where AI detected skin concerns. All zones are manageable — none define your beauty.</p>
          <div style={{ position: "relative", maxWidth: 360, margin: "0 auto" }}>
            {img ? <img src={img} alt="face" style={{ width: "100%", borderRadius: 14, objectFit: "cover", maxHeight: 360 }} />
              : <div style={{ width: "100%", paddingBottom: "100%", borderRadius: 14, background: "rgba(181,92,121,.08)", position: "relative" }}><div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}><span style={{ fontSize: 40 }}>👤</span></div></div>}
            {results.heatZones?.map((z,i) => (
              <div key={i} className="concern-zone" style={{ left:`${z.x}%`, top:`${z.y}%`, width:z.intensity==="High"?48:z.intensity==="Medium"?36:26, height:z.intensity==="High"?48:z.intensity==="Medium"?36:26, borderColor:z.color, background:`${z.color}22`, transform:"translate(-50%,-50%)" }}>
                <div style={{ position:"absolute", bottom:"100%", left:"50%", transform:"translateX(-50%)", whiteSpace:"nowrap", background:"rgba(26,11,18,.92)", border:`1px solid ${z.color}40`, padding:"2px 7px", borderRadius:6, fontSize:10, color:z.color, fontWeight:600, marginBottom:4 }}>{z.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === "forecast" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="glass" style={{ padding: "22px 24px", borderRadius: 20, background: "linear-gradient(135deg,rgba(181,92,121,.14),rgba(74,21,48,.2))" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 24 }}>🔮</span>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>30-Day Skin Forecast</h3>
                <p style={{ fontSize: 12, color: "#9A6677" }}>Based on your current routine and habits</p>
              </div>
            </div>
            {results.forecast ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
                  <div style={{ background: "rgba(181,92,121,.1)", borderRadius: 14, padding: "16px" }}>
                    <div style={{ fontSize: 11, color: "#9A6677", marginBottom: 5 }}>Hydration (projected)</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#7EC8E3" }}>+{results.forecast.hydration30days || 12}%</div>
                    <div style={{ fontSize: 11, color: "#6B4455" }}>in 30 days</div>
                  </div>
                  <div style={{ background: "rgba(181,92,121,.1)", borderRadius: 14, padding: "16px" }}>
                    <div style={{ fontSize: 11, color: "#9A6677", marginBottom: 5 }}>Brightness trend</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#F0C4CC" }}>{results.forecast.brightnessChange || "Improving gradually"}</div>
                  </div>
                </div>
                <div style={{ background: "rgba(168,230,201,.08)", border: "1px solid rgba(168,230,201,.2)", borderRadius: 14, padding: "14px 18px" }}>
                  <div style={{ fontSize: 11, color: "#A8E6C9", fontWeight: 600, marginBottom: 5 }}>AI Recommendation</div>
                  <p style={{ fontSize: 13, color: "#F0C4CC", lineHeight: 1.7 }}>{results.forecast.recommendation || "Maintain your current routine consistency. Small, daily actions lead to visible improvements within 4–6 weeks."}</p>
                </div>
              </div>
            ) : (
              <p style={{ color: "#9A6677", fontSize: 14 }}>Forecast will generate after your first scan.</p>
            )}
          </div>
          <div className="glass" style={{ padding: 22, borderRadius: 18 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Projected Score Trend</h3>
            <ResponsiveContainer width="100%" height={160}><AreaChart data={MONTHLY}><defs><linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#D4879A" stopOpacity={0.28} /><stop offset="95%" stopColor="#D4879A" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="rgba(181,92,121,.1)" /><XAxis dataKey="week" tick={{ fill:"#9A6677", fontSize:10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill:"#9A6677", fontSize:10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background:"#2E0E1F", border:"1px solid rgba(181,92,121,.2)", borderRadius:9, color:"#F5E6EA", fontSize:11 }} /><Area type="monotone" dataKey="score" stroke="#D4879A" fill="url(#fg)" strokeWidth={2} name="Skin Score" /></AreaChart></ResponsiveContainer>
          </div>
        </div>
      )}
      {tab === "triggers" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="glass" style={{ padding: "16px 20px", borderRadius: 14, display: "flex", gap: 10, alignItems: "center", background: "rgba(245,213,163,.06)", border: "1px solid rgba(245,213,163,.18)" }}>
            <Ic n="alert" s={15} c="#F5D5A3" /><p style={{ fontSize: 13, color: "#F5D5A3", lineHeight: 1.6 }}>AI-estimated correlations based on your profile. Not medical advice. Consult a dermatologist for clinical guidance.</p>
          </div>
          {(results.triggers || [{ food: "High-sugar foods", correlation: 68, insight: "Sugar spikes insulin, which can trigger androgen hormones linked to breakouts." }, { food: "Dairy products", correlation: 45, insight: "Some people find dairy influences hormonal acne — worth tracking for 4 weeks." }, { food: "Processed foods", correlation: 55, insight: "Trans fats can increase inflammatory markers that show in skin texture." }]).map(t => (
            <div key={t.food} className="glass" style={{ padding: "18px 20px", borderRadius: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>🍽️ {t.food}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#D4879A" }}>{t.correlation}%</div>
              </div>
              <ConfBar pct={t.correlation} color="#D4879A" />
              <p style={{ fontSize: 12, color: "#9A6677", marginTop: 10, lineHeight: 1.6 }}>{t.insight}</p>
            </div>
          ))}
        </div>
      )}
      {tab === "routine" && (
        <div>
          {[["🌅 Morning Routine", ["Gentle cleanser — 60 sec", "Niacinamide serum — 2–3 drops, wait 60s", "Lightweight gel moisturizer", "SPF 50+ sunscreen — always last"]], ["🌙 Night Routine", ["Oil cleanser → water cleanser (double cleanse)", "BHA exfoliant (Mon / Wed / Fri only)", "Treatment serum (retinol or Vitamin C)", "Rich nourishing night cream"]], ["📅 Weekly", ["Chemical exfoliation x2", "Hydrating sheet mask (Sunday)", "Clay mask for T-zone (Saturday)", "1 rest day — no actives"]]].map(([title, items]) => (
            <div key={title} className="glass" style={{ padding: "20px 22px", borderRadius: 18, marginBottom: 14 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>{title}</h3>
              {items.map((item, i) => (
                <div key={i} className="check-row">
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: "rgba(181,92,121,.18)", display: "flex", alignItems: "center", justifyContent: "center", color: "#D4879A", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                  <span style={{ fontSize: 13, color: "#F0C4CC" }}>{item}</span>
                </div>
              ))}
            </div>
          ))}
          <button className="btn" onClick={() => onNav("products")} style={{ width: "100%" }}>View Recommended Products →</button>
        </div>
      )}
    </div>
  );
};

// ── CONFIDENCE SCORE ─────────────────────────────────────────────────────────
const ConfidenceScore = ({ habits, water, journalEntries, scans }) => {
  const score = calcConfidenceScore(habits, water, journalEntries, scans);
  const clamped = Math.min(100, Math.max(0, score));
  const color = clamped >= 70 ? "#A8E6C9" : clamped >= 50 ? "#D4879A" : "#F0C4CC";
  return (
    <div className="glass glow" style={{ padding: "24px", borderRadius: 22, background: "linear-gradient(135deg,rgba(139,58,87,.2),rgba(107,34,68,.2))", border: "1px solid rgba(181,92,121,.28)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, color: "#9A6677", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Confidence Score™</div>
          <div style={{ fontSize: 34, fontWeight: 700, color }}>
            {clamped}
            <span style={{ fontSize: 16, color: "#9A6677", fontWeight: 400 }}>/100</span>
          </div>
          <div style={{ fontSize: 12, color: "#9A6677", marginTop: 3 }}>{clamped >= 75 ? "Thriving 🌟" : clamped >= 55 ? "Growing 🌱" : "Building momentum 💕"}</div>
        </div>
        <div className="conf-ring" style={{ fontSize: 36 }}>💕</div>
      </div>
      <ConfBar pct={clamped} color={color} />
      <p style={{ fontSize: 12, color: "#9A6677", marginTop: 12, lineHeight: 1.6 }}>Based on habit consistency, hydration, journaling, and self-care — not appearance.</p>
      <div style={{ display: "flex", gap: 9, marginTop: 14, flexWrap: "wrap" }}>
        {[["Habits", `${habits?.filter(h=>h.done).length || 0}/${habits?.length || 6}`, "#D4879A"], ["Water", `${water || 0}/8`, "#7EC8E3"], ["Journal", `${journalEntries?.length || 0} entries`, "#F0C4CC"]].map(([l,v,c]) => (
          <div key={l} style={{ flex: 1, minWidth: 80, background: "rgba(181,92,121,.1)", borderRadius: 10, padding: "9px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: c }}>{v}</div>
            <div style={{ fontSize: 10, color: "#6B4455" }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── GLOW JOURNAL ─────────────────────────────────────────────────────────────
const GlowJournal = () => {
  const [entries, setEntries] = useState(() => LS.get("glowJournal", []));
  const [form, setForm] = useState({ mood: "", confidence: 5, energy: 5, note: "", gratitude: "" });
  const [tab, setTab] = useState("write");
  const [saving, setSaving] = useState(false);
  const MOODS = [["😊","Happy"],["😌","Calm"],["😔","Low"],["😤","Frustrated"],["🥰","Confident"],["😰","Anxious"]];

  const save = () => {
    if (!form.mood && !form.note) return;
    setSaving(true);
    const entry = { ...form, date: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), ts: Date.now() };
    const next = [entry, ...entries].slice(0, 60);
    setEntries(next);
    LS.set("glowJournal", next);
    setForm({ mood: "", confidence: 5, energy: 5, note: "", gratitude: "" });
    setTimeout(() => setSaving(false), 1000);
  };

  return (
    <div style={{ padding: "24px 22px", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="cf" style={{ fontSize: 34, marginBottom: 7, fontWeight: 400 }}>Glow Journal</h1>
        <p style={{ color: "#9A6677", fontSize: 13 }}>A private space to reflect on your emotional journey and self-care progress.</p>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
        {[["write","✍️ Write"],["entries","📚 Past Entries"],["insights","✨ Insights"]].map(([t,l]) => (
          <button key={t} className={`tab-btn${tab===t?" act":""}`} onClick={() => setTab(t)}>{l}</button>
        ))}
      </div>
      {tab === "write" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="glass" style={{ padding: "22px", borderRadius: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>How are you feeling today?</h3>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {MOODS.map(([emoji, label]) => (
                <button key={label} className={`mood-btn${form.mood === label ? " sel" : ""}`} onClick={() => setForm(f => ({ ...f, mood: label }))}>
                  <span style={{ fontSize: 22 }}>{emoji}</span>
                  <span style={{ fontSize: 10, color: form.mood === label ? "#F0C4CC" : "#9A6677" }}>{label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="glass" style={{ padding: "22px", borderRadius: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              {[["Confidence level", "confidence"], ["Energy level", "energy"]].map(([label, key]) => (
                <div key={key}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <label style={{ fontSize: 12, color: "#9A6677" }}>{label}</label>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#D4879A" }}>{form[key]}/10</span>
                  </div>
                  <input type="range" min={1} max={10} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) }))} style={{ width: "100%", accentColor: "#B55C79" }} />
                </div>
              ))}
            </div>
          </div>
          <div className="glass" style={{ padding: "22px", borderRadius: 20 }}>
            <label style={{ fontSize: 12, color: "#9A6677", display: "block", marginBottom: 8 }}>Today's note — how did your skin or confidence feel?</label>
            <textarea className="inp" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. 'I felt stressed about my skin today but reminded myself that breakouts are temporary...'" rows={4} style={{ resize: "vertical", lineHeight: 1.65 }} />
          </div>
          <div className="glass" style={{ padding: "22px", borderRadius: 20 }}>
            <label style={{ fontSize: 12, color: "#D4879A", display: "block", marginBottom: 8 }}>🌸 Gratitude entry</label>
            <input className="inp" value={form.gratitude} onChange={e => setForm(f => ({ ...f, gratitude: e.target.value }))} placeholder="One thing you're grateful for about your body or self today..." />
          </div>
          <button className="btn" onClick={save} style={{ width: "100%" }}>{saving ? "✅ Saved!" : "Save Entry 🌸"}</button>
        </div>
      )}
      {tab === "entries" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {entries.length === 0 ? (
            <div style={{ textAlign: "center", padding: "44px 24px" }}>
              <div style={{ fontSize: 48, marginBottom: 14 }}>📖</div>
              <p style={{ color: "#9A6677" }}>Your journal is empty. Write your first entry above.</p>
            </div>
          ) : entries.map((e, i) => (
            <div key={e.ts || i} className="glass" style={{ padding: "18px 20px", borderRadius: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                  <span style={{ fontSize: 16 }}>{MOODS.find(m => m[1] === e.mood)?.[0] || "📝"}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#F0C4CC" }}>{e.mood || "Reflection"}</span>
                </div>
                <span style={{ fontSize: 11, color: "#6B4455" }}>{e.date}</span>
              </div>
              <div style={{ display: "flex", gap: 10, marginBottom: e.note ? 10 : 0 }}>
                <span className="tag">Confidence {e.confidence}/10</span>
                <span className="tag">Energy {e.energy}/10</span>
              </div>
              {e.note && <p style={{ fontSize: 13, color: "#9A6677", lineHeight: 1.65 }}>{e.note}</p>}
              {e.gratitude && <p style={{ fontSize: 12, color: "#D4879A", marginTop: 8, fontStyle: "italic" }}>🌸 {e.gratitude}</p>}
            </div>
          ))}
        </div>
      )}
      {tab === "insights" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {entries.length < 3 ? (
            <div style={{ textAlign: "center", padding: "32px" }}>
              <div style={{ fontSize: 42, marginBottom: 12 }}>✨</div>
              <p style={{ color: "#9A6677", fontSize: 14 }}>Write at least 3 journal entries to unlock emotional insights.</p>
            </div>
          ) : (
            <>
              <div className="glass" style={{ padding: "22px", borderRadius: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Confidence Trend</h3>
                <ResponsiveContainer width="100%" height={150}>
                  <AreaChart data={entries.slice(0,14).reverse().map((e,i) => ({ day: `Day ${i+1}`, confidence: e.confidence, energy: e.energy }))}>
                    <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#D4879A" stopOpacity={0.28} /><stop offset="95%" stopColor="#D4879A" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(181,92,121,.1)" />
                    <XAxis dataKey="day" tick={{ fill:"#9A6677", fontSize:9 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0,10]} tick={{ fill:"#9A6677", fontSize:9 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background:"#2E0E1F", border:"1px solid rgba(181,92,121,.2)", borderRadius:9, color:"#F5E6EA", fontSize:11 }} />
                    <Area type="monotone" dataKey="confidence" stroke="#D4879A" fill="url(#cg)" strokeWidth={2} name="Confidence" />
                    <Line type="monotone" dataKey="energy" stroke="#A8E6C9" strokeWidth={2} dot={false} name="Energy" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="glass" style={{ padding: "20px 22px", borderRadius: 18, background: "linear-gradient(135deg,rgba(181,92,121,.12),rgba(74,21,48,.15))" }}>
                <div style={{ fontSize: 11, color: "#D4879A", fontWeight: 600, marginBottom: 9, textTransform: "uppercase", letterSpacing: ".06em" }}>Smira Insight</div>
                <p style={{ fontSize: 14, color: "#F0C4CC", lineHeight: 1.8 }}>
                  You've journaled {entries.length} times. Average confidence: <strong style={{ color: "#D4879A" }}>{(entries.reduce((a,e) => a + e.confidence, 0) / entries.length).toFixed(1)}/10</strong>. 
                  {entries[0]?.confidence > entries[entries.length-1]?.confidence ? " Your confidence has been growing — keep nurturing that. 🌸" : " Some days are harder. That's normal. You're still showing up — and that matters."}
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ── COMMUNITY CHALLENGES ─────────────────────────────────────────────────────
const Challenges = () => {
  const [joined, setJoined] = useState(() => LS.get("challenges_joined", []));
  const [progress, setProgress] = useState(() => LS.get("challenges_progress", {}));

  const CHALLENGES = [
    { id: "hydration7", emoji: "💧", title: "7-Day Hydration Challenge", desc: "Drink 8 glasses of water every day for 7 days.", duration: 7, reward: "Hydration Hero" },
    { id: "glow30", emoji: "🌸", title: "30-Day Glow Challenge", desc: "Complete your morning and night routine every single day.", duration: 30, reward: "Glow Master" },
    { id: "sleep14", emoji: "🌙", title: "14-Day Better Sleep", desc: "Sleep by 11 PM for 14 consecutive nights.", duration: 14, reward: "Rest Royalty" },
    { id: "journal21", emoji: "📖", title: "21-Day Glow Journal", desc: "Write one journal entry every day for 21 days.", duration: 21, reward: "Reflection Queen" },
    { id: "nosugar7", emoji: "🍎", title: "7-Day Sugar Detox", desc: "Avoid refined sugar for 7 days and track your skin changes.", duration: 7, reward: "Clear Skin Warrior" },
    { id: "selfcare7", emoji: "💕", title: "7-Day Self-Care Challenge", desc: "Do one intentional self-care act every day.", duration: 7, reward: "Self-Love Champion" },
  ];

  const join = (id) => {
    const next = joined.includes(id) ? joined.filter(j => j !== id) : [...joined, id];
    setJoined(next); LS.set("challenges_joined", next);
  };
  const tick = (id) => {
    const cur = progress[id] || 0;
    const ch = CHALLENGES.find(c => c.id === id);
    const next = { ...progress, [id]: Math.min(cur + 1, ch.duration) };
    setProgress(next); LS.set("challenges_progress", next);
  };

  return (
    <div style={{ padding: "24px 22px", maxWidth: 800, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="cf" style={{ fontSize: 34, marginBottom: 7, fontWeight: 400 }}>Challenges</h1>
        <p style={{ color: "#9A6677", fontSize: 13, lineHeight: 1.7 }}>Personal challenges to build confidence and healthy habits. These are just for you — not competitions.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))", gap: 16 }}>
        {CHALLENGES.map(c => {
          const isJoined = joined.includes(c.id);
          const prog = progress[c.id] || 0;
          const done = prog >= c.duration;
          const pct = (prog / c.duration) * 100;
          return (
            <div key={c.id} className="challenge-card" style={{ opacity: done ? 0.9 : 1, position: "relative" }}>
              {done && <div style={{ position: "absolute", top: 12, right: 12, background: "linear-gradient(135deg,#A8E6C9,#68C99A)", borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 700, color: "#0A2A1A" }}>✅ Completed!</div>}
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
                <span style={{ fontSize: 28 }}>{c.emoji}</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#F0C4CC", marginBottom: 4 }}>{c.title}</div>
                  <div style={{ fontSize: 12, color: "#9A6677", lineHeight: 1.6 }}>{c.desc}</div>
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9A6677", marginBottom: 6 }}>
                  <span>{prog} / {c.duration} days</span>
                  <span style={{ color: "#D4879A", fontWeight: 600 }}>🏆 {c.reward}</span>
                </div>
                <ConfBar pct={pct} color={done ? "#A8E6C9" : "#D4879A"} />
              </div>
              <div style={{ display: "flex", gap: 9 }}>
                <button className={isJoined ? "btn" : "btn-o"} onClick={() => join(c.id)} style={{ flex: 1, fontSize: 12, padding: "9px 14px" }}>
                  {isJoined ? (done ? "Done! 🎉" : "Joined ✓") : "Join Challenge"}
                </button>
                {isJoined && !done && <button className="btn-o" onClick={() => tick(c.id)} style={{ fontSize: 12, padding: "9px 14px" }}>+1 Day</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── MONTHLY STORY ────────────────────────────────────────────────────────────
const MonthlyStory = ({ user, scans, habits, journalEntries }) => {
  const month = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const habitDone = habits?.filter(h => h.done).length || 0;
  const totalH = habits?.length || 6;
  const confScore = calcConfidenceScore(habits, 6, journalEntries, scans);
  const highlights = [
    { emoji: "💧", label: "Hydration improvement", value: "+18%", color: "#7EC8E3" },
    { emoji: "💕", label: "Confidence Score", value: `${confScore}/100`, color: "#D4879A" },
    { emoji: "📖", label: "Journal entries", value: journalEntries?.length || 0, color: "#F0C4CC" },
    { emoji: "✅", label: "Habits completed", value: `${habitDone}/${totalH}`, color: "#A8E6C9" },
    { emoji: "🔬", label: "Skin scans", value: scans?.length || 0, color: "#D4879A" },
  ];

  return (
    <div style={{ padding: "24px 22px", maxWidth: 640, margin: "0 auto" }}>
      <div style={{ marginBottom: 28, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🌟</div>
        <h1 className="cf" style={{ fontSize: "clamp(28px,5vw,42px)", fontWeight: 300, lineHeight: 1.2, marginBottom: 10 }}>Your Smira Story</h1>
        <p style={{ color: "#D4879A", fontSize: 15, fontWeight: 500 }}>{month}</p>
      </div>
      <div className="glass glow" style={{ padding: "28px", borderRadius: 26, background: "linear-gradient(135deg,rgba(139,58,87,.25),rgba(46,14,31,.6))", marginBottom: 18 }}>
        <h2 className="cf" style={{ fontSize: 22, fontWeight: 400, marginBottom: 18, textAlign: "center", color: "#F0C4CC" }}>
          {user?.name?.split(" ")[0] || "You"}'s Highlights 🌸
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          {highlights.map(h => (
            <div key={h.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "rgba(181,92,121,.1)", borderRadius: 14 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 20 }}>{h.emoji}</span>
                <span style={{ fontSize: 13, color: "#F0C4CC" }}>{h.label}</span>
              </div>
              <span style={{ fontSize: 16, fontWeight: 700, color: h.color }}>{h.value}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="glass" style={{ padding: "22px 24px", borderRadius: 20, marginBottom: 16, background: "linear-gradient(135deg,rgba(181,92,121,.12),rgba(74,21,48,.18))" }}>
        <div style={{ fontSize: 11, color: "#D4879A", fontWeight: 600, marginBottom: 9, textTransform: "uppercase", letterSpacing: ".07em" }}>Monthly Message from Smira 🤖</div>
        <p style={{ fontSize: 14, color: "#F0C4CC", lineHeight: 1.85, fontStyle: "italic" }}>
          "This month you showed up for yourself. Not every day was perfect — and that's okay. What matters is that you're building habits with intention, learning about your body, and choosing self-care over self-criticism. That's real progress. Keep going, {user?.name?.split(" ")[0] || "beautiful"}."
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
        <button className="btn" style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", fontSize: 13 }}>
          <Ic n="share" s={15} /> Share Story
        </button>
        <button className="btn-o" style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", fontSize: 13 }}>
          <Ic n="dl" s={15} /> Save as PDF
        </button>
      </div>
    </div>
  );
};

// ── PRODUCTS ─────────────────────────────────────────────────────────────────
const Products = ({ results }) => {
  const [cat, setCat] = useState("cleanser");
  const skinType = results?.skinType || "Combination";
  const concerns = results?.concerns?.map(c => c.name) || ["Acne"];
  const filter = (prods) => prods.filter(p => p.for.includes("All") || p.for.some(f => concerns.includes(f) || f === skinType));
  const cats = ["cleanser", "serum", "moisturizer", "sunscreen"];
  const tierColor = { Budget: "#A8E6C9", Mid: "#F5D5A3", Luxury: "#F0C4CC" };
  return (
    <div style={{ padding: "24px 22px", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="cf" style={{ fontSize: 32, marginBottom: 7, fontWeight: 400 }}>Product Recommendations</h1>
        <p style={{ color: "#9A6677", fontSize: 13 }}>Curated for <strong style={{ color: "#D4879A" }}>{skinType}</strong> skin · {concerns.slice(0,3).join(", ")}</p>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
        {cats.map(c => <button key={c} onClick={() => setCat(c)} style={{ padding: "9px 20px", borderRadius: 24, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, textTransform: "capitalize", background: cat===c ? "linear-gradient(135deg,#8B3A57,#D4879A)" : "rgba(181,92,121,.1)", color: cat===c ? "#fff" : "#D4879A", transition: "all .2s" }}>{c}</button>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 16 }}>
        {filter(ALL_PRODUCTS[cat] || []).map(p => (
          <div key={p.name} className="glass glow" style={{ padding: "18px", borderRadius: 16, display: "flex", flexDirection: "column", gap: 11 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: "rgba(181,92,121,.14)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🧴</div>
              <span style={{ background: `${tierColor[p.tier] || "#F5D5A3"}18`, color: tierColor[p.tier], padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, border: `1px solid ${tierColor[p.tier]}35` }}>{p.tier}</span>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: "#9A6677", marginTop: 2 }}>{p.brand}</div>
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{p.ing.map(i => <span key={i} className="tag" style={{ fontSize: 10 }}>{i}</span>)}</div>
            <div style={{ fontSize: 12, color: "#F0C4CC" }}>{p.benefit}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#D4879A" }}>{p.price}</span>
              <div style={{ display: "flex", gap: 3, alignItems: "center" }}><Ic n="star" s={12} c="#F5D5A3" /><span style={{ fontSize: 12, fontWeight: 600, color: "#F5D5A3" }}>{p.rating}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── NUTRITION ────────────────────────────────────────────────────────────────
const Nutrition = ({ results, user }) => {
  const [day, setDay] = useState(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);
  const [water, setWater] = useState(() => LS.get("water_today", 4));
  useEffect(() => { LS.set("water_today", water); }, [water]);
  return (
    <div style={{ padding: "24px 22px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="cf" style={{ fontSize: 32, marginBottom: 7, fontWeight: 400 }}>Nutrition & Hydration</h1>
        <p style={{ color: "#9A6677", fontSize: 13 }}>Food is your skin's foundation — feed it with care.</p>
      </div>
      <div className="glass" style={{ padding: "22px", borderRadius: 20, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>💧 Water Tracker</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 9, marginBottom: 14 }}>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} onClick={() => setWater(i + 1)} style={{ width: 46, height: 46, borderRadius: 13, background: i < water ? "linear-gradient(135deg,#7EC8E3,#4AAFCC)" : "rgba(126,200,227,.1)", border: `1px solid ${i < water ? "#7EC8E3" : "rgba(126,200,227,.2)"}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all .2s", fontSize: 20 }}>
              {i < water ? "💧" : "🫙"}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 14, color: "#7EC8E3", fontWeight: 600, marginBottom: 6 }}>{water} of 8 glasses</div>
        <ConfBar pct={(water / 8) * 100} color="#7EC8E3" />
      </div>
      <div className="glass" style={{ padding: "22px", borderRadius: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>📅 7-Day Skin Meal Plan</h3>
        <div style={{ display: "flex", gap: 7, marginBottom: 18, overflowX: "auto", paddingBottom: 4 }}>
          {MEALS.map((m, i) => (
            <button key={m.day} onClick={() => setDay(i)} style={{ padding: "7px 14px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", background: day===i ? "linear-gradient(135deg,#8B3A57,#D4879A)" : "rgba(181,92,121,.1)", color: day===i ? "#fff" : "#D4879A", transition: "all .2s" }}>{m.day.slice(0,3)}</button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(185px,1fr))", gap: 12 }}>
          {[["🌅 Breakfast", MEALS[day].breakfast], ["☀️ Lunch", MEALS[day].lunch], ["🌙 Dinner", MEALS[day].dinner], ["🍎 Snack", MEALS[day].snack]].map(([l, v]) => (
            <div key={l} style={{ background: "rgba(181,92,121,.07)", borderRadius: 13, padding: "14px 15px" }}>
              <div style={{ fontSize: 11, color: "#D4879A", fontWeight: 600, marginBottom: 6 }}>{l}</div>
              <div style={{ fontSize: 13, color: "#F0C4CC", lineHeight: 1.65 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── ANALYTICS ────────────────────────────────────────────────────────────────
const Analytics = ({ scans }) => {
  const [period, setPeriod] = useState("weekly");
  return (
    <div style={{ padding: "24px 22px", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="cf" style={{ fontSize: 32, marginBottom: 7, fontWeight: 400 }}>Progress Analytics</h1>
          <p style={{ color: "#9A6677", fontSize: 13 }}>Celebrate every step forward — progress isn't always linear.</p>
        </div>
        <div style={{ display: "flex", gap: 6, background: "rgba(181,92,121,.08)", padding: 5, borderRadius: 12 }}>
          {["weekly","monthly"].map(p => <button key={p} onClick={() => setPeriod(p)} style={{ padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: period===p ? "linear-gradient(135deg,#8B3A57,#D4879A)" : "transparent", color: period===p ? "#fff" : "#9A6677", transition: "all .2s", textTransform: "capitalize" }}>{p}</button>)}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 13, marginBottom: 22 }}>
        {[["Skin Score","68","+8","#D4879A"],["Hydration","72","+10","#7EC8E3"],["Brightness","70","+12","#F0C4CC"],["Confidence","76","+16","#A8E6C9"]].map(([l,v,c,col]) => (
          <div key={l} className="glass" style={{ padding: "18px 16px", borderRadius: 16, textAlign: "center" }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: col }}>{v}</div>
            <div style={{ fontSize: 11, color: "#9A6677", margin: "4px 0" }}>{l}</div>
            <span style={{ fontSize: 11, color: "#A8E6C9", background: "rgba(168,230,201,.1)", padding: "2px 7px", borderRadius: 18 }}>{c} this {period==="weekly"?"week":"month"}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        {[["Hydration Trend",WEEKLY,"hydration","#7EC8E3","day"],["Confidence Growth",WEEKLY,"confidence","#D4879A","day"],["Monthly Skin Score",MONTHLY,"score","#F0C4CC","week"],["Brightness",WEEKLY,"brightness","#A8E6C9","day"]].map(([title,data,key,color,xKey]) => (
          <div key={title} className="glass" style={{ padding: "20px 18px", borderRadius: 18 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{title}</h3>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={data}>
                <defs><linearGradient id={`ag${key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={color} stopOpacity={0.25} /><stop offset="95%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(181,92,121,.09)" />
                <XAxis dataKey={xKey} tick={{ fill:"#9A6677", fontSize:9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:"#9A6677", fontSize:9 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background:"#2E0E1F", border:"1px solid rgba(181,92,121,.2)", borderRadius:9, color:"#F5E6EA", fontSize:11 }} />
                <Area type="monotone" dataKey={key} stroke={color} fill={`url(#ag${key})`} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── JOURNEY ──────────────────────────────────────────────────────────────────
const Journey = ({ scans }) => {
  const [compare, setCompare] = useState(false);
  const months = [{ month: "January", score: 48, note: "Started skin journey 🌱", icon: "🔴" }, { month: "February", score: 55, note: "Added Niacinamide serum", icon: "🟠" }, { month: "March", score: 61, note: "Better sleep + more water", icon: "🟡" }, { month: "April", score: 68, note: "Consistent routine — glowing! ✨", icon: "🟢" }];
  return (
    <div style={{ padding: "24px 22px", maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="cf" style={{ fontSize: 32, marginBottom: 7, fontWeight: 400 }}>Your Journey</h1>
          <p style={{ color: "#9A6677", fontSize: 13 }}>Every month is a chapter in your story — all of them count.</p>
        </div>
        <button className="btn-o" onClick={() => setCompare(c => !c)} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13 }}><Ic n="compare" s={14} /> Before/After</button>
      </div>
      {compare && (
        <div className="glass" style={{ padding: "22px", borderRadius: 20, marginBottom: 22 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>📸 Before & After</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[["Before", scans?.[0], "January 2026", 48], ["Latest", scans?.[scans?.length-1], "April 2026", 68]].map(([label, scan, date, score]) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ borderRadius: 14, overflow: "hidden", background: "rgba(181,92,121,.08)", aspectRatio: "4/5", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {scan?.img ? <img src={scan.img} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ textAlign: "center" }}><div style={{ fontSize: 40 }}>📷</div><div style={{ fontSize: 11, color: "#6B4455", marginTop: 8 }}>Photo here</div></div>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: label === "Latest" ? "#A8E6C9" : "#9A6677" }}>{label}</div>
                <div style={{ fontSize: 11, color: "#6B4455" }}>{date}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#D4879A", marginTop: 5 }}>{score}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ position: "relative", paddingLeft: 36 }}>
        <div style={{ position: "absolute", left: 12, top: 0, bottom: 0, width: 2, background: "linear-gradient(180deg,#8B3A57,#D4879A,#F0C4CC)" }} />
        {months.map((m, i) => (
          <div key={m.month} style={{ marginBottom: 24, position: "relative" }}>
            <div style={{ position: "absolute", left: -24, top: 10, width: 12, height: 12, borderRadius: "50%", background: "linear-gradient(135deg,#8B3A57,#D4879A)", border: "2px solid #1A0B12" }} />
            <div className="glass" style={{ padding: "18px 20px", borderRadius: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{m.month}</div>
                  <div style={{ fontSize: 13, color: "#9A6677", marginTop: 2 }}>{m.note}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#D4879A" }}>{m.score}</div>
                  <div style={{ fontSize: 10, color: "#6B4455" }}>Skin Score</div>
                </div>
              </div>
              <ConfBar pct={m.score} color="#D4879A" />
              {i > 0 && <div style={{ marginTop: 8, fontSize: 12, color: "#A8E6C9" }}>↑ +{m.score - months[i-1].score} pts from {months[i-1].month}</div>}
            </div>
          </div>
        ))}
      </div>
      <div className="glass" style={{ padding: "22px", borderRadius: 18, textAlign: "center", background: "rgba(139,58,87,.15)" }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>🌸</div>
        <h3 className="cf" style={{ fontSize: 20, fontWeight: 400, marginBottom: 8 }}>You've come so far.</h3>
        <p style={{ color: "#9A6677", fontSize: 14, lineHeight: 1.8 }}>+20 points in 4 months. At this pace, your goal is just around the corner.<br /><strong style={{ color: "#D4879A" }}>Every small action matters.</strong></p>
      </div>
    </div>
  );
};

// ── MENSTRUAL TRACKER ────────────────────────────────────────────────────────
const MenstrualTracker = () => {
  const [lastPeriod, setLastPeriod] = useState(() => LS.get("lastPeriod", ""));
  const [cycleLen, setCycleLen] = useState(() => LS.get("cycleLen", 28));
  const [saved, setSaved] = useState(false);
  const [phase, setPhase] = useState("");
  useEffect(() => {
    if (lastPeriod) {
      const d = Math.floor((new Date() - new Date(lastPeriod)) / 86400000);
      if (d <= 5) setPhase("🔴 Menstrual Phase — Your skin may be more sensitive. Gentle routine only, extra hydration.");
      else if (d <= 13) setPhase("🌱 Follicular Phase — Rising estrogen brings a natural glow. Great time for actives.");
      else if (d <= 16) setPhase("✨ Ovulation — Peak estrogen. Skin often looks its best right now.");
      else if (d <= 22) setPhase("🌿 Luteal Phase — Progesterone rises, pores may enlarge. Acne risk increases slightly.");
      else setPhase("⚠️ Late Luteal — Breakouts may appear. Be gentle with yourself — this is hormonal, not permanent.");
    }
  }, [lastPeriod]);
  const save = () => { LS.set("lastPeriod", lastPeriod); LS.set("cycleLen", cycleLen); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  const nextPeriod = lastPeriod ? new Date(new Date(lastPeriod).getTime() + cycleLen * 86400000).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "--";
  return (
    <div style={{ padding: "24px 22px", maxWidth: 680, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="cf" style={{ fontSize: 32, marginBottom: 7, fontWeight: 400 }}>Cycle Tracker</h1>
        <p style={{ color: "#9A6677", fontSize: 13 }}>Understanding your cycle helps you understand your skin — and yourself.</p>
      </div>
      <div className="glass" style={{ padding: "24px", borderRadius: 20, marginBottom: 18 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Cycle Details</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div><label style={{ fontSize: 11, color: "#9A6677", display: "block", marginBottom: 6 }}>Last Period Start Date</label><input className="inp" type="date" value={lastPeriod} onChange={e => setLastPeriod(e.target.value)} /></div>
          <div><label style={{ fontSize: 11, color: "#9A6677", display: "block", marginBottom: 6 }}>Cycle Length: <strong style={{ color: "#D4879A" }}>{cycleLen} days</strong></label><input type="range" min={21} max={35} value={cycleLen} onChange={e => setCycleLen(Number(e.target.value))} style={{ width: "100%", accentColor: "#B55C79" }} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="glass" style={{ padding: "14px", borderRadius: 14, textAlign: "center" }}><div style={{ fontSize: 10, color: "#9A6677", marginBottom: 4 }}>Next Period</div><div style={{ fontSize: 14, fontWeight: 700, color: "#F0C4CC" }}>{nextPeriod}</div></div>
            <div className="glass" style={{ padding: "14px", borderRadius: 14, textAlign: "center" }}><div style={{ fontSize: 10, color: "#9A6677", marginBottom: 4 }}>Cycle Length</div><div style={{ fontSize: 14, fontWeight: 700, color: "#D4879A" }}>{cycleLen} days</div></div>
          </div>
          <button className="btn" onClick={save} style={{ width: "100%" }}>{saved ? "✅ Saved!" : "Save Cycle Info"}</button>
        </div>
      </div>
      {phase && <div className="glass" style={{ padding: "20px 22px", borderRadius: 18, marginBottom: 18, borderLeft: "3px solid #D4879A", background: "linear-gradient(135deg,rgba(181,92,121,.12),rgba(107,34,68,.1))" }}><div style={{ fontSize: 11, color: "#D4879A", fontWeight: 600, marginBottom: 7, textTransform: "uppercase", letterSpacing: ".06em" }}>Current Cycle Phase</div><p style={{ fontSize: 14, color: "#F0C4CC", lineHeight: 1.75 }}>{phase}</p></div>}
      <div className="glass" style={{ padding: "20px 22px", borderRadius: 18 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Skin Through Your Cycle</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[["Day 1–5","Menstrual","#F5A3A3","Sensitive, dull. Avoid actives. Hydrate and soothe."],["Day 6–13","Follicular","#A8E6C9","Estrogen rises — skin improves! Try gentle exfoliants."],["Day 14–16","Ovulation","#F5D5A3","Peak estrogen → natural glow."],["Day 17–22","Luteal","#F0C4CC","Oilier skin, pore enlargement, acne risk."],["Day 23–28","PMS Phase","#F5A3A3","Breakouts possible. Reduce sugar, increase zinc."]].map(([days,phase,col,desc]) => (
            <div key={phase} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "11px 14px", background: "rgba(181,92,121,.05)", borderRadius: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: col, marginTop: 6, flexShrink: 0 }} />
              <div><div style={{ fontSize: 13, fontWeight: 600, color: col }}>{phase} <span style={{ color: "#6B4455", fontWeight: 400 }}>({days})</span></div><div style={{ fontSize: 12, color: "#9A6677", marginTop: 2 }}>{desc}</div></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── AI COACH ─────────────────────────────────────────────────────────────────
const AICoach = ({ user, results, scans }) => {
  const [msgs, setMsgs] = useState(() => LS.get("coachMsgs3", [
    { role: "assistant", text: `Hi ${user?.name?.split(" ")[0] || "there"} 🌸 I'm your Smira wellness companion. I'm here to support your skin journey AND your confidence journey. You can ask me anything — about skincare, habits, how you're feeling, or just talk. What's on your mind today?` }
  ]));
  const [inp, setInp] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  useEffect(() => { LS.set("coachMsgs3", msgs.slice(-30)); }, [msgs]);
  const hints = ["Why am I breaking out?", "Help me feel confident today", "PCOS skin care tips", "I'm frustrated with my skin", "Foods to reduce inflammation", "Build a self-care habit"];
  const send = async (text) => {
    if (!text.trim() || loading) return;
    const userMsg = { role: "user", text };
    const newMsgs = [...msgs, userMsg];
    setMsgs(newMsgs); setInp(""); setLoading(true);
    try {
      const ctx = results ? `Skin: ${results.skinType}, score ${results.overallScore}/100, concerns: ${results.concerns?.map(c=>c.name+"("+c.severity+")").join(", ")}. PCOS=${user?.pcos}, thyroid=${user?.thyroid}. Stress=${user?.stress}. Sleep=${user?.sleep}.` : "No scan yet.";
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `You are Smira's emotionally intelligent AI wellness companion. You combine skin expertise, wellness coaching, and emotional support. CRITICAL PHILOSOPHY: Never imply skin conditions make someone less beautiful. If the user expresses frustration, insecurity, or discouragement about their skin or appearance, acknowledge their feelings first before giving advice. Always remind users that skin conditions are normal, progress takes time, and they are worthy exactly as they are. Use warm, supportive language. Be concise (3-5 sentences). Use 1-2 emojis max per response. Never diagnose. Always suggest dermatologist for medical concerns. User profile: ${ctx}`,
          messages: newMsgs.slice(-12).map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text })),
        }),
      });
      const data = await res.json();
      setMsgs(m => [...m, { role: "assistant", text: data?.content?.[0]?.text || "Connection issue — please try again." }]);
    } catch { setMsgs(m => [...m, { role: "assistant", text: "I'm having trouble connecting right now. Please try again in a moment." }]); }
    setLoading(false);
  };
  return (
    <div style={{ padding: "24px 22px", maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column" }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="cf" style={{ fontSize: 30, marginBottom: 5, fontWeight: 400 }}>Smira AI Coach</h1>
        <p style={{ color: "#9A6677", fontSize: 13 }}>Your emotionally intelligent skin & wellness companion</p>
      </div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }}>
        {hints.map(h => <button key={h} onClick={() => send(h)} style={{ padding: "6px 13px", borderRadius: 18, border: "1px solid rgba(181,92,121,.22)", background: "rgba(181,92,121,.07)", color: "#D4879A", fontSize: 11, cursor: "pointer", transition: "all .2s" }} onMouseEnter={e => e.currentTarget.style.background="rgba(181,92,121,.18)"} onMouseLeave={e => e.currentTarget.style.background="rgba(181,92,121,.07)"}>{h}</button>)}
      </div>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, minHeight: 300, maxHeight: "50vh", marginBottom: 16, paddingRight: 4 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", gap: 10, flexDirection: m.role === "user" ? "row-reverse" : "row", alignItems: "flex-end" }}>
            <div style={{ width: 33, height: 33, borderRadius: 10, background: m.role === "assistant" ? "linear-gradient(135deg,#8B3A57,#D4879A)" : "rgba(181,92,121,.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 15 }}>{m.role === "assistant" ? "🌸" : "👤"}</div>
            <div style={{ maxWidth: "76%", background: m.role === "user" ? "linear-gradient(135deg,rgba(139,58,87,.4),rgba(181,92,121,.3))" : "rgba(46,14,31,.85)", border: "1px solid rgba(181,92,121,.14)", borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", padding: "12px 16px" }}>
              <p style={{ fontSize: 14, lineHeight: 1.75, color: "#F0C4CC" }}>{m.text}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <div style={{ width: 33, height: 33, borderRadius: 10, background: "linear-gradient(135deg,#8B3A57,#D4879A)", display: "flex", alignItems: "center", justifyContent: "center" }}>🌸</div>
            <div className="glass shimmer-bg" style={{ padding: "12px 18px", borderRadius: "16px 16px 16px 4px", minWidth: 80 }}>
              <div style={{ display: "flex", gap: 5 }}>{[0,1,2].map(j => <div key={j} style={{ width: 7, height: 7, borderRadius: "50%", background: "#D4879A", animation: `gPulse 1s ease ${j*.28}s infinite` }} />)}</div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: "flex", gap: 9 }}>
        <input className="inp" value={inp} onChange={e => setInp(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && send(inp)} placeholder="Ask about skin, wellness, or how you're feeling..." style={{ flex: 1 }} />
        <button className="btn" onClick={() => send(inp)} disabled={loading || !inp.trim()} style={{ padding: "12px 18px", flexShrink: 0 }}><Ic n="send" s={15} /></button>
      </div>
      <button onClick={() => { setMsgs([]); LS.del("coachMsgs3"); }} style={{ marginTop: 10, background: "none", border: "none", color: "#4A2030", fontSize: 12, cursor: "pointer", textAlign: "right" }}>Clear conversation</button>
    </div>
  );
};

// ── DASHBOARD ────────────────────────────────────────────────────────────────
const Dashboard = ({ user, results, onNav, scans }) => {
  const [habits, setHabits] = useState(() => LS.get("habits3", DEFAULT_HABITS));
  const [water, setWater] = useState(() => LS.get("water_today", 4));
  const [journalEntries] = useState(() => LS.get("glowJournal", []));
  const streak = LS.get("streak", 23);
  useEffect(() => { LS.set("habits3", habits); }, [habits]);
  useEffect(() => { LS.set("water_today", water); }, [water]);
  const done = habits.filter(h => h.done).length;
  const toggle = id => setHabits(h => h.map(x => x.id === id ? { ...x, done: !x.done } : x));
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div style={{ padding: "24px 22px", maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 14 }}>
        <div>
          <h1 className="cf" style={{ fontSize: 32, marginBottom: 5, fontWeight: 400 }}>{greeting}, {user?.name?.split(" ")[0] || "Beautiful"} 🌸</h1>
          <p style={{ color: "#9A6677", fontSize: 13 }}>{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className="streak">🔥 {streak} day streak</span>
          <button className="btn" onClick={() => onNav("scan")} style={{ display: "flex", alignItems: "center", gap: 7, padding: "11px 20px", fontSize: 13 }}><Ic n="scan" s={15} /> Scan Today</button>
        </div>
      </div>

      {/* Confidence Score™ — hero metric */}
      <ConfidenceScore habits={habits} water={water} journalEntries={journalEntries} scans={scans} />

      <div style={{ height: 18 }} />

      {/* Metrics row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(185px,1fr))", gap: 13, marginBottom: 20 }}>
        {[
          { l: "Skin Health Score", v: results?.overallScore ?? "—", u: "/100", c: "#D4879A", i: "🔬", ch: results ? "+8 this week" : "Scan to start" },
          { l: "Hydration", v: results?.hydrationLevel ?? "—", u: "%", c: "#7EC8E3", i: "💧", ch: "+5 today" },
          { l: "Habits Today", v: `${done}/${habits.length}`, u: "", c: "#A8E6C9", i: "✅", ch: `${habits.length-done} remaining` },
          { l: "Water Intake", v: water, u: " glasses", c: "#F0C4CC", i: "🥤", ch: "Goal: 8 glasses" },
        ].map(m => (
          <div key={m.l} className="glass glow" style={{ padding: "18px 16px", borderRadius: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 9 }}>
              <span style={{ fontSize: 20 }}>{m.i}</span>
              <span style={{ fontSize: 11, color: "#A8E6C9", background: "rgba(168,230,201,.1)", padding: "2px 8px", borderRadius: 10, maxWidth: 120, textAlign: "right", lineHeight: 1.4 }}>{m.ch}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: m.c }}>{m.v}<span style={{ fontSize: 12, color: "#9A6677" }}>{m.u}</span></div>
            <div style={{ fontSize: 11, color: "#6B4455", marginTop: 3 }}>{m.l}</div>
          </div>
        ))}
      </div>

      {!results && (
        <div className="glass" style={{ padding: "30px 28px", borderRadius: 20, marginBottom: 18, textAlign: "center", background: "linear-gradient(135deg,rgba(139,58,87,.18),rgba(181,92,121,.08))", border: "1px solid rgba(181,92,121,.28)" }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🌸</div>
          <h3 className="cf" style={{ fontSize: 22, marginBottom: 8, fontWeight: 400 }}>Start your skin journey</h3>
          <p style={{ color: "#9A6677", fontSize: 14, marginBottom: 22, lineHeight: 1.7 }}>Your first AI skin analysis will help us personalize everything — from product recommendations to your Confidence Score™.</p>
          <button className="btn" onClick={() => onNav("scan")} style={{ padding: "13px 32px", fontSize: 14 }}>Analyze My Skin ✨</button>
        </div>
      )}

      <SkinTip />
      <div style={{ height: 16 }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 18 }}>
        {/* Habit tracker */}
        <div className="glass" style={{ padding: "20px", borderRadius: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600 }}>Today's Habits</h3>
            <span style={{ fontSize: 13, color: "#D4879A", fontWeight: 700 }}>{done}/{habits.length}</span>
          </div>
          <ConfBar pct={(done/habits.length)*100} color="#D4879A" />
          <div style={{ height: 8 }} />
          {habits.map(h => (
            <div key={h.id} className="check-row" onClick={() => toggle(h.id)} style={{ cursor: "pointer" }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: h.done ? "linear-gradient(135deg,#8B3A57,#D4879A)" : "rgba(181,92,121,.1)", border: h.done ? "none" : "1px solid rgba(181,92,121,.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .2s" }}>
                {h.done && <Ic n="ok" s={11} c="#fff" />}
              </div>
              <span style={{ fontSize: 13, color: h.done ? "#6B4455" : "#F0C4CC", textDecoration: h.done ? "line-through" : "none" }}>{h.icon} {h.label}</span>
            </div>
          ))}
        </div>
        {/* Water */}
        <div className="glass" style={{ padding: "20px", borderRadius: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>💧 Water Tracker</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} onClick={() => setWater(i+1)} style={{ width: 42, height: 42, borderRadius: 12, background: i < water ? "linear-gradient(135deg,#7EC8E3,#4AAFCC)" : "rgba(126,200,227,.08)", border: `1px solid ${i < water ? "#7EC8E3" : "rgba(126,200,227,.18)"}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all .2s", fontSize: 18 }}>{i < water ? "💧" : "🫙"}</div>
            ))}
          </div>
          <div style={{ fontSize: 14, color: "#7EC8E3", fontWeight: 600, marginBottom: 6 }}>{water} of 8 glasses</div>
          <ConfBar pct={(water/8)*100} color="#7EC8E3" />
          <p style={{ fontSize: 12, color: "#6B4455", marginTop: 10, lineHeight: 1.6 }}>Hydration supports the skin barrier, reduces dullness, and improves elasticity.</p>
        </div>
      </div>

      {/* AI Insight */}
      <div className="glass" style={{ padding: "18px 22px", borderRadius: 17, background: "linear-gradient(135deg,rgba(139,58,87,.18),rgba(181,92,121,.08))", border: "1px solid rgba(181,92,121,.25)", marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: "linear-gradient(135deg,#8B3A57,#D4879A)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18 }}>🌸</div>
          <div>
            <div style={{ fontSize: 11, color: "#D4879A", fontWeight: 600, marginBottom: 5, textTransform: "uppercase", letterSpacing: ".06em" }}>Smira AI Insight</div>
            <p style={{ fontSize: 14, color: "#F0C4CC", lineHeight: 1.8 }}>
              {results
                ? `Your ${results.skinType?.toLowerCase() || "skin"} is showing ${results.concerns?.[0]?.name || "some patterns"} — this is common and completely manageable. ${results.emotionalNote || "You're doing great by staying consistent with your routine."}`
                : "Complete your first skin scan to get AI-powered insights personalized to your unique skin profile and goals."}
            </p>
          </div>
        </div>
      </div>

      {results && (
        <div className="glass" style={{ padding: "20px", borderRadius: 18 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>📈 This Week's Trend</h3>
          <ResponsiveContainer width="100%" height={150}><AreaChart data={WEEKLY}><defs><linearGradient id="dbg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#D4879A" stopOpacity={0.25}/><stop offset="95%" stopColor="#D4879A" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="rgba(181,92,121,.09)" /><XAxis dataKey="day" tick={{ fill:"#9A6677", fontSize:10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill:"#9A6677", fontSize:10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background:"#2E0E1F", border:"1px solid rgba(181,92,121,.2)", borderRadius:9, color:"#F5E6EA", fontSize:11 }} /><Area type="monotone" dataKey="hydration" stroke="#D4879A" fill="url(#dbg)" strokeWidth={2} name="Hydration" /><Line type="monotone" dataKey="brightness" stroke="#F0C4CC" strokeWidth={2} dot={false} name="Brightness" /></AreaChart></ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
const Sidebar = ({ active, onNav, user, open, onClose }) => {
  const nav = [
    { id: "dashboard", label: "Dashboard", icon: "home" },
    { id: "scan", label: "Skin Analysis", icon: "scan" },
    { id: "results", label: "My Results", icon: "chart" },
    { id: "confidence", label: "Confidence Score™", icon: "heart" },
    { id: "journal", label: "Glow Journal", icon: "journal" },
    { id: "products", label: "Products", icon: "bag" },
    { id: "nutrition", label: "Nutrition", icon: "leaf" },
    { id: "challenges", label: "Challenges", icon: "trophy" },
    { id: "analytics", label: "Analytics", icon: "chart" },
    { id: "journey", label: "Journey", icon: "spark" },
    { id: "story", label: "Monthly Story", icon: "star" },
    { id: "coach", label: "AI Coach", icon: "bot" },
    { id: "cycle", label: "Cycle Tracker", icon: "cycle" },
  ];
  const go = (id) => { onNav(id); onClose(); };
  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={`app-sidebar${open ? " open" : ""}`}
        style={{ width: 222, background: "rgba(20,8,15,.97)", borderRight: "1px solid rgba(181,92,121,.1)", display: "flex", flexDirection: "column", padding: "22px 12px", height: "100vh", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, paddingLeft: 7, marginBottom: 26 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#8B3A57,#D4879A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🌸</div>
          <span className="cf" style={{ fontSize: 22, fontWeight: 600, background: "linear-gradient(135deg,#F0C4CC,#D4879A)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Smira</span>
          <span style={{ fontSize: 10, color: "#8B3A57", background: "rgba(139,58,87,.2)", padding: "2px 6px", borderRadius: 8, fontWeight: 600 }}>V3</span>
        </div>
        <div style={{ background: "rgba(181,92,121,.1)", borderRadius: 11, padding: "11px 13px", marginBottom: 18, display: "flex", gap: 9, alignItems: "center" }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#8B3A57,#D4879A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>{user?.name?.[0]?.toUpperCase() || "S"}</div>
          <div style={{ overflow: "hidden" }}>
            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#F0C4CC" }}>{user?.name || "Smira User"}</div>
            <div style={{ fontSize: 10, color: "#6B4455" }}>{user?.skinGoal?.[0] || "Wellness journey"}</div>
          </div>
        </div>
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
          {nav.map(item => (
            <button key={item.id} className={`nav-link${active===item.id?" act":""}`} onClick={() => go(item.id)}>
              <Ic n={item.icon} s={15} c={active===item.id ? "#D4879A" : "#6B4455"} />
              {item.label}
              {item.id === "coach" && <span style={{ marginLeft: "auto", fontSize: 9, background: "#8B3A57", color: "#F0C4CC", padding: "1px 5px", borderRadius: 8 }}>AI</span>}
              {item.id === "confidence" && <span style={{ marginLeft: "auto", fontSize: 9, background: "rgba(181,92,121,.25)", color: "#D4879A", padding: "1px 5px", borderRadius: 8 }}>NEW</span>}
            </button>
          ))}
        </nav>
        <div style={{ fontSize: 10, color: "#2E1525", lineHeight: 1.5, paddingLeft: 4, paddingBottom: 6, marginTop: 10 }}>
          ⚠️ Not a medical device. Consult a dermatologist for medical advice.
        </div>
      </aside>
    </>
  );
};

// ── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState(() => LS.get("screen3", "landing"));
  const [page, setPage] = useState(() => LS.get("page3", "dashboard"));
  const [user, setUser] = useState(() => LS.get("user3", null));
  const [results, setResults] = useState(() => LS.get("results3", null));
  const [scans, setScans] = useState(() => LS.get("scans3", []));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [journalEntries] = useState(() => LS.get("glowJournal", []));
  const [habits] = useState(() => LS.get("habits3", DEFAULT_HABITS));

  useEffect(() => { LS.set("screen3", screen); }, [screen]);
  useEffect(() => { LS.set("page3", page); }, [page]);
  useEffect(() => { LS.set("user3", user); }, [user]);
  useEffect(() => { LS.set("results3", results); }, [results]);
  useEffect(() => { LS.set("scans3", scans.slice(-15)); }, [scans]);

  const handleOnboard = (data) => { setUser(data); setScreen("app"); setPage("dashboard"); };
  const handleResult = (r, imgData) => {
    setResults(r);
    const newScan = { date: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short" }), score: r.overallScore, img: imgData };
    setScans(s => [...s, newScan]);
    setPage("results");
  };
  const nav = (p) => { setPage(p); setSidebarOpen(false); };
  const reset = () => { ["screen3","page3","user3","results3","scans3","habits3","water_today","cycles","lastPeriod","cycleLen","coachMsgs3","glowJournal","challenges_joined","challenges_progress"].forEach(k => LS.del(k)); window.location.reload(); };

  if (screen === "landing") return (<><GlobalStyles /><Landing onEnter={() => setScreen("onboarding")} /></>);
  if (screen === "onboarding") return (<><GlobalStyles /><Onboarding onDone={handleOnboard} /></>);

  return (
    <>
      <GlobalStyles />
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar active={page} onNav={nav} user={user} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="app-main" style={{ flex: 1, overflowY: "auto", background: "linear-gradient(135deg,#1A0B12 0%,#200D16 55%,#160910 100%)", minHeight: "100vh" }}>
          {/* Mobile top bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1px solid rgba(181,92,121,.07)", position: "sticky", top: 0, background: "rgba(26,11,18,.93)", backdropFilter: "blur(14px)", zIndex: 10 }}>
            <button className="hamburger" onClick={() => setSidebarOpen(true)} style={{ display: "flex" }}><span /><span /><span /></button>
            <span className="cf hide-mobile" style={{ fontSize: 20, fontWeight: 600, background: "linear-gradient(135deg,#F0C4CC,#D4879A)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Smira</span>
            <span style={{ flex: 1 }} />
            <button onClick={reset} style={{ background: "none", border: "none", color: "#3A1525", fontSize: 11, cursor: "pointer" }}>Reset</button>
          </div>
          {page === "dashboard" && <Dashboard user={user} results={results} onNav={nav} scans={scans} />}
          {page === "scan" && <SkinScan onResult={handleResult} user={user} existingScans={scans} />}
          {page === "results" && <Results results={results} img={scans?.[scans.length-1]?.img} user={user} onNav={nav} scans={scans} />}
          {page === "confidence" && <ConfidenceScore habits={habits} water={LS.get("water_today", 4)} journalEntries={journalEntries} scans={scans} />}
          {page === "journal" && <GlowJournal />}
          {page === "products" && <Products results={results} />}
          {page === "nutrition" && <Nutrition results={results} user={user} />}
          {page === "challenges" && <Challenges />}
          {page === "analytics" && <Analytics scans={scans} />}
          {page === "journey" && <Journey scans={scans} />}
          {page === "story" && <MonthlyStory user={user} scans={scans} habits={habits} journalEntries={journalEntries} />}
          {page === "coach" && <AICoach user={user} results={results} scans={scans} />}
          {page === "cycle" && <MenstrualTracker />}
        </main>
      </div>
      <AvatarCompanion name={user?.name} />
    </>
  );
}
