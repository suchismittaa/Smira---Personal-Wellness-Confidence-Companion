import { useEffect, useId, useRef, useState } from "react";
import { CY, dayColor, moonPath, cycleMoon } from "./cycleTheme.js";
import { PHASES } from "./cycleContent.js";
import { prefersReducedMotion } from "./cycleUtils.js";

const VB = 400, C = VB / 2, RING = 158;

/* One moon-phase dot per cycle day, arranged clockwise, rotated so the
   selected day sits at the bottom inside a cream ring. The ring re-spins
   when the selection changes. Pure SVG + one rAF tween. */
export default function CycleWheel({ countdown, cycleLen, periodLen, ovDay, selectedDay, phase, hasData, onAddPeriod }) {
  const uid = useId().replace(/:/g, "");
  const L = Math.max(15, cycleLen);
  const [pos, setPos] = useState(selectedDay);
  const posRef = useRef(selectedDay);
  const lenRef = useRef(L);

  useEffect(() => {
    if (lenRef.current !== L || prefersReducedMotion()) {
      lenRef.current = L; posRef.current = selectedDay; setPos(selectedDay); return undefined;
    }
    const from = posRef.current;
    let delta = (((selectedDay - from) % L) + L) % L;
    if (delta > L / 2) delta -= L;
    if (Math.abs(delta) < 1e-3) return undefined;
    let raf, t0 = null;
    const step = (t) => {
      if (t0 == null) t0 = t;
      const p = Math.min(1, (t - t0) / 380);
      const v = p >= 1 ? selectedDay : from + delta * (1 - Math.pow(1 - p, 3));
      posRef.current = v; setPos(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [selectedDay, L]);

  const spacing = (2 * Math.PI * RING) / L;
  const r = Math.max(5, Math.min(15, spacing * 0.42));
  const dots = [];
  for (let d = 1; d <= L; d++) {
    const a = ((180 + ((d - pos) / L) * 360) * Math.PI) / 180;
    const x = C + RING * Math.sin(a), y = C - RING * Math.cos(a);
    const { k, waxing } = cycleMoon(d, L);
    const color = hasData ? dayColor(d, L, periodLen, ovDay) : CY.sageMid;
    const path = d === 1 ? null : moonPath(r, Math.max(k, 0.06));
    const isSel = hasData && d === Math.round(selectedDay);
    dots.push(
      <g key={d} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})${isSel ? " scale(1.14)" : ""}`} opacity={hasData ? 1 : 0.35}>
        {path ? (
          <path d={path} fill={color} transform={waxing ? undefined : "scale(-1 1)"} filter={isSel ? `url(#glow${uid})` : undefined} />
        ) : (
          <circle r={r - 0.8} fill="none" stroke={color} strokeWidth="1.4" />
        )}
      </g>
    );
  }

  /* selected-day cream ring is anchored to the bottom (where the selected dot lands) */
  const ringY = C + RING;

  let eyebrow = "Period in", big = "", small = null;
  switch (countdown.kind) {
    case "in": big = `${countdown.n} ${countdown.n === 1 ? "day" : "days"}`; break;
    case "period": eyebrow = "Period"; big = `Day ${countdown.day}`; break;
    case "due": eyebrow = "Period is"; big = "Due now"; break;
    case "late": eyebrow = "Period is"; big = `${countdown.n} ${countdown.n === 1 ? "day" : "days"} late`; break;
    case "stale": eyebrow = "Your log"; big = "Needs updating"; break;
    default: eyebrow = "Your cycle"; big = "Not started"; small = "Log a period to begin";
  }
  const bigSize = big.length > 9 ? "clamp(26px,8vw,36px)" : "clamp(34px,11vw,50px)";
  const label = hasData
    ? `Cycle day ${Math.round(selectedDay)} of ${L}, ${PHASES.find((p) => p.id === phase)?.label || ""} phase. ${eyebrow} ${big}.`
    : "No periods logged yet.";

  return (
    <div className="cy-wheel" role="img" aria-label={label}>
      <svg viewBox={`0 0 ${VB} ${VB}`} aria-hidden="true" focusable="false">
        <defs>
          <filter id={`glow${uid}`} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <radialGradient id={`halo${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#FBF7EC" stopOpacity=".7" /><stop offset="1" stopColor="#FBF7EC" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={C} cy={C} r={RING + 24} fill={`url(#halo${uid})`} />
        {dots}
        {hasData && (
          <circle cx={C} cy={ringY} r={r * 1.14 + 6} fill="none" stroke={CY.ink} strokeWidth="1.5" opacity=".9" />
        )}
      </svg>
      <div className="cy-wheel-center">
        <div className="cy-eyebrow">{eyebrow}</div>
        <div className="cy-big" style={{ fontSize: bigSize }}>{big}</div>
        {small && <div className="cy-small-note">{small}</div>}
        <button type="button" className="cy-pill-btn" onClick={onAddPeriod}>Add Period</button>
      </div>
    </div>
  );
}
