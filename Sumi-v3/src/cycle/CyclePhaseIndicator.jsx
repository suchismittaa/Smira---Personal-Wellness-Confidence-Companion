import { useEffect, useRef } from "react";
import { PHASES } from "./cycleContent.js";
import { phaseGradientCss } from "./cycleTheme.js";

/* Four phase pills; the active one is a bright gradient pill. The row
   scrolls on narrow screens and keeps the active pill centred. */
export default function CyclePhaseIndicator({ phase }) {
  const rowRef = useRef(null);
  useEffect(() => {
    const el = rowRef.current?.querySelector('[aria-current="true"]');
    if (el?.scrollIntoView) el.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [phase]);
  return (
    <div className="cy-phases" ref={rowRef} role="list" aria-label="Cycle phases">
      {PHASES.map((p) => {
        const active = p.id === phase;
        return (
          <span
            key={p.id}
            role="listitem"
            aria-current={active ? "true" : undefined}
            className={`cy-phase${active ? " is-active" : ""}`}
            style={active ? { background: phaseGradientCss(p.id) } : undefined}
          >
            {p.label}
          </span>
        );
      })}
    </div>
  );
}
