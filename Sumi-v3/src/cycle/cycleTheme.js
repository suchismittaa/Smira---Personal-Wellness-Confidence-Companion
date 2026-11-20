/* Visual tokens + SVG geometry for the Cycle Tracker. Everything here is
   scoped to the cycle module — Sumi's global theme is untouched. */

/* Sumi's own palette (same values as SM / LIGHT_T in App.jsx) — the tracker
   follows the app's "vintage botanical" look instead of having its own theme. */
export const CY = {
  ink: "#4E5138", muted: "#6E7A59", paper: "#FBF7EC",
  sage: "#7F9A66", sageDeep: "#4F6B3E", sageMid: "#A9BC93", sageSoft: "#E0EBD0",
  pink: "#D98A93", pinkDeep: "#B4636B", pinkSoft: "#F6E4E3",
  red: "#C4696F", redDeep: "#B4636B", gold: "#B8902A", butter: "#F3EAD3",
  coral: "#C4696F", apricot: "#D9B08C",
};

/* Tokens Sumi has no CSS variable for. Everything Sumi already exposes
   (--txt, --muted, --card, --border, --pill-*, --wine …) is used directly in
   cycle.css, so the tracker follows the app's theme automatically. */
export const CY_VARS = {
  "--cy-paper": CY.paper, "--cy-red": CY.red, "--cy-red-deep": CY.redDeep,
  "--cy-pink": CY.pink, "--cy-wine": CY.pinkDeep, "--cy-sage": CY.sage,
  "--cy-sage-deep": CY.sageDeep, "--cy-sage-soft": CY.sageSoft, "--cy-gold": CY.gold,
  "--cy-rose": CY.pinkDeep, "--cy-blush": CY.pinkSoft, "--cy-butter": CY.butter,
};

/* Phase colours — all from Sumi's palette: red & pink (period), sage greens
   (follicular), deep sage → gold (ovulation), apricot → pink → coral (luteal). */
export const PHASE_GRADIENT = {
  menstrual: [CY.red, CY.pink],
  follicular: [CY.sageMid, CY.sage],
  ovulation: [CY.sageDeep, CY.gold],
  luteal: [CY.apricot, CY.pink, CY.coral],
};
export const phaseGradientCss = (id) => `linear-gradient(90deg, ${PHASE_GRADIENT[id].join(", ")})`;

/* Hormone curves — four distinct Sumi colours (coral, sage, gold, apricot). */
export const HORMONES = [
  { key: "progesterone", label: "Progesterone", color: CY.sage },
  { key: "fsh", label: "FSH", color: CY.apricot },
  { key: "lh", label: "LH", color: CY.gold },
  { key: "estrogen", label: "Estrogen", color: CY.coral },
];

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => {
  const A = hex(a), B = hex(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
};

/* Smooth colour for each cycle day, interpolated between keyframes so the ring
   blends rather than banding: red → pink (period) → sage greens (follicular) →
   deep sage → gold (ovulation) → apricot → pink → coral (luteal). */
export function dayColor(day, len, periodLen, ovDay) {
  const P = Math.min(periodLen, len - 1);
  const folEnd = Math.max(P + 1, ovDay - 2);
  const folMid = Math.round((P + 1 + folEnd) / 2);
  const lutMid = Math.round((ovDay + 3 + len) / 2);
  const raw = [
    [1, CY.red], [P, CY.pink],
    [P + 1, CY.sageMid], [folMid, CY.sage], [folEnd, CY.sageDeep],
    [ovDay - 1, CY.sageDeep], [ovDay, CY.gold], [ovDay + 1, CY.gold],
    [ovDay + 2, CY.apricot], [ovDay + 3, CY.apricot], [lutMid, CY.pink], [len, CY.coral],
  ];
  const ks = [];
  raw.filter(([d]) => d >= 1 && d <= len).sort((a, b) => a[0] - b[0]).forEach((k) => {
    if (!ks.length || ks[ks.length - 1][0] < k[0]) ks.push(k);
  });
  if (day <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    if (day <= ks[i][0]) {
      const [d0, c0] = ks[i - 1], [d1, c1] = ks[i];
      return mix(c0, c1, (day - d0) / (d1 - d0));
    }
  }
  return ks[ks.length - 1][1];
}

/* Lit portion of a moon of radius r centred on (0,0). k = illuminated
   fraction (0..1). Waxing moons are lit on the right; mirror for waning. */
export function moonPath(r, k) {
  if (k >= 0.97) return `M ${-r} 0 A ${r} ${r} 0 1 1 ${r} 0 A ${r} ${r} 0 1 1 ${-r} 0 Z`;
  if (k <= 0.03) return null;
  const rx = Math.max(0.01, r * Math.abs(1 - 2 * k));
  return `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} A ${rx} ${r} 0 0 ${k < 0.5 ? 0 : 1} 0 ${-r} Z`;
}

/* Illumination for a cycle day: new moon on day 1, full around the middle. */
export const cycleMoon = (day, len) => {
  const f = ((day - 1) / len) % 1;
  return { k: (1 - Math.cos(2 * Math.PI * f)) / 2, waxing: f < 0.5 };
};

/* Droplet used by the editor calendar. Centred on (0,0), ~2r tall. */
export const dropletPath = (w = 17, h = 24) =>
  `M 0 ${-h} C ${w * 0.15} ${-h * 0.62} ${w} ${-h * 0.18} ${w} ${h * 0.34} A ${w} ${w} 0 0 1 ${-w} ${h * 0.34} C ${-w} ${-h * 0.18} ${-w * 0.15} ${-h * 0.62} 0 ${-h} Z`;
