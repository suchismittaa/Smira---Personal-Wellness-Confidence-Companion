import { useEffect, useMemo, useRef, useState } from "react";
import HormoneGraph from "./HormoneGraph.jsx";
import { addDays, diffDays, hormoneSeries, predictedPeriodDays, toISO } from "./cycleEngine.js";
import { prefersReducedMotion } from "./cycleUtils.js";

export const COL = 56;
const BEFORE = 120, AFTER = 150, GRAPH_H = 150;
const BUF = 30, STEP = 15; // columns of graph drawn beyond each screen edge / window step
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* Horizontal date strip + hormone graph in ONE scroller, so the curves slide
   under the dates. The cream centre line is fixed; whichever day sits under it
   is the selected day. Dragging selects live (the wheel spins along); releasing
   settles on the nearest day.

   Performance: the strip is ~15,000px wide, but only a window of the graph
   (visible columns + BUF each side, ≈80 columns) is actually drawn, and the
   window moves in STEP-column jumps — so scrolling doesn't re-render 270 days
   of SVG curves. */
export default function CycleTimeline({ stats, selected, onSelect, hasData, loggedNotes }) {
  const today = stats.today;
  const start = useMemo(() => addDays(today, -BEFORE), [today]);
  const N = BEFORE + AFTER + 1;
  const selIdx = clamp(diffDays(start, selected), 0, N - 1);
  const scRef = useRef(null);
  const [vw, setVw] = useState(360);
  const [winStart, setWinStart] = useState(() => Math.max(0, Math.floor((selIdx - BUF) / STEP) * STEP));
  const userScroll = useRef(false);
  const lock = useRef(false);
  const lockTimer = useRef(0);
  const settleTimer = useRef(0);
  const raf = useRef(0);
  const first = useRef(true);
  const selIdxRef = useRef(selIdx);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { selIdxRef.current = selIdx; onSelectRef.current = onSelect; });

  useEffect(() => {
    const el = scRef.current;
    if (!el) return undefined;
    const measure = () => setVw(el.clientWidth || 360);
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pad = Math.max(0, vw / 2 - COL / 2);
  const winLen = Math.min(N, Math.ceil(vw / COL) + 2 * BUF + STEP);
  const s0 = clamp(winStart, 0, N - winLen);

  const series = useMemo(() => (hasData ? hormoneSeries(stats, start, N) : null), [stats, start, N, hasData]);
  const loggedSet = stats.loggedDays;
  const predicted = useMemo(() => predictedPeriodDays(stats, 8), [stats]);

  const syncWindow = (el) => {
    const firstCol = Math.round(el.scrollLeft / COL);
    const ns = Math.max(0, Math.floor((firstCol - BUF) / STEP) * STEP);
    setWinStart((cur) => (cur === ns ? cur : ns));
  };

  /* programmatic scroll when the selection changes from outside (tap, Today, editor) */
  useEffect(() => {
    const el = scRef.current;
    if (!el || userScroll.current) return;
    setWinStart(Math.max(0, Math.floor((selIdx - BUF) / STEP) * STEP));
    const target = selIdx * COL;
    if (Math.abs(el.scrollLeft - target) < 2) { first.current = false; return; }
    lock.current = true;
    el.scrollTo({ left: target, behavior: first.current || prefersReducedMotion() ? "auto" : "smooth" });
    first.current = false;
    clearTimeout(lockTimer.current);
    lockTimer.current = setTimeout(() => { lock.current = false; }, 520);
  }, [selIdx, vw]);

  useEffect(() => () => { clearTimeout(lockTimer.current); clearTimeout(settleTimer.current); cancelAnimationFrame(raf.current); }, []);

  const onScroll = () => {
    const el = scRef.current; if (!el) return;
    syncWindow(el); // keep the graph window under the viewport even during programmatic scrolls
    if (lock.current) return;
    userScroll.current = true;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const idx = clamp(Math.round(el.scrollLeft / COL), 0, N - 1);
      if (idx !== selIdxRef.current) onSelectRef.current(addDays(start, idx));
    });
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const idx = clamp(Math.round(el.scrollLeft / COL), 0, N - 1);
      lock.current = true;
      el.scrollTo({ left: idx * COL, behavior: prefersReducedMotion() ? "auto" : "smooth" });
      clearTimeout(lockTimer.current);
      lockTimer.current = setTimeout(() => { lock.current = false; userScroll.current = false; }, 360);
    }, 150);
  };

  const onKey = (e) => {
    const d = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    if (!d) return;
    e.preventDefault();
    onSelect(addDays(start, clamp(selIdx + d, 0, N - 1)));
  };

  const cells = [];
  for (let i = 0; i < N; i++) {
    const date = addDays(start, i);
    const iso = toISO(date);
    const isSel = i === selIdx;
    const isToday = i === BEFORE;
    const logged = loggedSet.has(iso);
    const pred = !logged && predicted.has(iso);
    const hasNote = !!loggedNotes?.[iso];
    cells.push(
      <button
        key={iso}
        type="button"
        className={`cy-day${isSel ? " is-sel" : ""}`}
        tabIndex={isSel ? 0 : -1}
        aria-pressed={isSel}
        aria-current={isToday ? "date" : undefined}
        aria-label={`${date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}${isToday ? ", today" : ""}${logged ? ", logged period day" : pred ? ", predicted period day" : ""}${hasNote ? ", symptoms logged" : ""}`}
        onClick={() => { userScroll.current = false; onSelect(date); }}
        style={{ width: COL }}
      >
        <span className="cy-day-wd">{WD[date.getDay()]}</span>
        <span className="cy-day-n">{date.getDate()}</span>
        <span className="cy-day-marks" aria-hidden="true">
          <span className={`cy-day-mark${logged ? " logged" : pred ? " pred" : isToday ? " today" : ""}`} />
          {hasNote && <span className="cy-day-log" />}
        </span>
      </button>
    );
  }

  return (
    <div className="cy-timeline" role="group" aria-label="Choose a date" onKeyDown={onKey}>
      <div className="cy-scroller" ref={scRef} onScroll={onScroll}>
        <div style={{ width: pad * 2 + N * COL, paddingLeft: pad, paddingRight: pad, boxSizing: "border-box" }}>
          <div className="cy-days" style={{ width: N * COL }}>{cells}</div>
          <div className="cy-graph" style={{ width: N * COL, height: GRAPH_H, "--col": `${COL}px` }}>
            {hasData && series ? (
              <div style={{ position: "absolute", left: s0 * COL, top: 0 }} data-window-start={s0} data-window-len={winLen}>
                <HormoneGraph data={series.slice(s0, s0 + winLen)} width={winLen * COL} height={GRAPH_H} colW={COL} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="cy-centerline" aria-hidden="true" style={{ height: GRAPH_H }}><i /></div>
      {!hasData && <p className="cy-graph-empty">Log a period to see your illustrative hormone pattern.</p>}
    </div>
  );
}
