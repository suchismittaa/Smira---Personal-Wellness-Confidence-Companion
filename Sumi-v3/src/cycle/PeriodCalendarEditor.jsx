import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, diffDays, diffSelection, fromISO, predictedPeriodDays, toISO } from "./cycleEngine.js";
import { Chevron, ConfirmDialog } from "./cycleUi.jsx";
import { haptic, useFocusTrap, useLatest } from "./cycleUtils.js";

const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOLD_MS = 380;
const MONTHS_AHEAD = 12, YEARS_BACK = 5;
const ym = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;
const monthName = (key) => new Date(+key.slice(0, 4), +key.slice(5) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
const shiftYM = (key, n) => { const d = new Date(+key.slice(0, 4), +key.slice(5) - 1 + n, 1); return ym(d.getFullYear(), d.getMonth()); };
const short = (iso, withYear) => fromISO(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
const spanLabel = (r, curYear) => {
  const a = fromISO(r.date), b = fromISO(r.endDate);
  const yr = a.getFullYear() !== curYear || b.getFullYear() !== curYear;
  if (r.date === r.endDate) return short(r.date, yr);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${a.getDate()}–${b.getDate()} ${a.toLocaleDateString("en-IN", { month: "short" })}${yr ? " " + a.getFullYear() : ""}`;
  return `${short(r.date)} – ${short(r.endDate, yr)}`;
};

/* A slightly wobbly circle, like a date ringed with a pen. Every state uses the
   same shape so the grid stays calm; state is carried by fill, ring and dash
   (never by colour alone). */
const BLOB = "M20 3.2C29.6 2.4 37.4 9.8 36.8 20.4C36.3 30.4 29.2 37.2 19.6 36.8C10 36.4 3.3 29.4 3.6 19.4C3.9 9.8 10.7 3.8 20 3.2Z";
const MARK = {
  saved: { fill: "var(--cy-rose)", stroke: "var(--cy-rose)", w: 1.4 },
  new: { fill: "var(--cy-butter)", stroke: "var(--cy-rose)", w: 2.4 },
  removed: { fill: "none", stroke: "var(--cy-rose)", w: 1.6, dash: "3.2 3.2" },
  predicted: { fill: "var(--cy-blush)", stroke: "var(--cy-pink)", w: 1.6, dash: "1.2 3.6", cap: "round" },
};
const Marker = ({ kind }) => {
  const s = MARK[kind];
  if (!s) return null;
  return (
    <svg className={`cy-mk kind-${kind}`} width="42" height="42" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <path d={BLOB} fill={s.fill} stroke={s.stroke} strokeWidth={s.w} strokeDasharray={s.dash} strokeLinecap={s.cap || "butt"} strokeLinejoin="round" />
    </svg>
  );
};

const KIND_TEXT = {
  saved: "Logged period day", new: "Selected, not saved yet", removed: "Logged period day, will be removed",
  predicted: "Predicted period day, an estimate", none: "No period",
};

const isosBetween = (a, b) => {
  const [x, y] = a <= b ? [a, b] : [b, a];
  const out = [];
  for (let d = fromISO(x); toISO(d) <= y; d = addDays(d, 1)) out.push(toISO(d));
  return out;
};

/* One month grid. Memoised on strings so toggling a day re-renders only this
   month and nothing else. */
const MonthBlock = memo(function MonthBlock({ y, m, selStr, flashStr, saved, predicted, today, onCellClick }) {
  const sel = useMemo(() => new Set(selStr ? selStr.split(",") : []), [selStr]);
  const flash = useMemo(() => new Set(flashStr ? flashStr.split(",") : []), [flashStr]);
  const lead = new Date(y, m, 1).getDay();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(<span key={`b${i}`} className="cy-cell blank" />);
  for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) {
    const date = new Date(y, m, d);
    const iso = toISO(date);
    const isSel = sel.has(iso), isSaved = saved.has(iso);
    const future = diffDays(today, date) > 0;
    const isToday = diffDays(today, date) === 0;
    let kind = "none";
    if (isSel && isSaved) kind = "saved";
    else if (isSel) kind = "new";
    else if (isSaved) kind = "removed";
    else if (predicted.has(iso)) kind = "predicted";
    const locked = future && !isSaved;
    const label = `${date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${isToday ? ", today" : ""}. ${KIND_TEXT[kind]}${locked ? ". Future date, can’t be logged" : ""}`;
    cells.push(
      <button
        key={iso}
        type="button"
        data-iso={iso}
        className={`cy-cell k-${kind}${locked ? " future" : ""}${isToday ? " today" : ""}${flash.has(iso) ? " flash" : ""}`}
        aria-pressed={isSel}
        aria-label={label}
        onClick={(e) => onCellClick(e, date)}
      >
        <Marker kind={kind} />
        <span className="cy-cell-n">{d}</span>
      </button>
    );
  }
  return (
    <section className="cy-month" data-ym={ym(y, m)} aria-label={monthName(ym(y, m))}>
      <div className="cy-month-grid">{cells}</div>
    </section>
  );
});

const LEGEND = [["saved", "Saved"], ["new", "New"], ["removed", "Removed"], ["predicted", "Predicted"]];

/* Full-screen monthly calendar. Previous / Next move one month at a time; tap
   any day to add or remove it (days don't have to be consecutive). Hold and
   drag, or shift-click, selects a run of days within a month.
   • The selection lives HERE, in component state, and survives month changes.
     Nothing is written to storage (or synced) until Save succeeds.
   • Saved & still selected = filled rose ring · newly added = butter fill with a
     rose ring · saved-but-deselected = dashed ring · predicted = dotted ring.
   • Predictions are drawn but never selectable as fact: tapping one logs a
     real, confirmed day only if it is today or earlier. */
export default function PeriodCalendarEditor({ records, stats, today, initialMonth, onSave, onCancel }) {
  const saved = useMemo(() => new Set(records.flatMap((r) => r.days)), [records]);
  const [sel, setSel] = useState(() => new Set(saved));
  const [viewYM, setViewYM] = useState(() => { const d = initialMonth || today; return ym(d.getFullYear(), d.getMonth()); });
  const [flash, setFlash] = useState(() => new Set());
  const [confirm, setConfirm] = useState(null); // 'discard' | 'clear'
  const [msg, setMsg] = useState("");
  const [errors, setErrors] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [ranging, setRanging] = useState(false);
  const dialogRef = useRef(null);
  const scrollerRef = useRef(null);
  const press = useRef(null);
  const holdTimer = useRef(0);
  const drag = useRef(null);
  const suppress = useRef(false);
  const lastTap = useRef(null);
  const flashTimer = useRef(0);
  const selRef = useLatest(sel);
  const predicted = useMemo(() => predictedPeriodDays(stats, 14), [stats]);
  const { added, removed } = useMemo(() => diffSelection(saved, sel), [saved, sel]);
  const dirty = added.length + removed.length > 0;

  const minKey = useMemo(() => {
    const floor = ym(today.getFullYear() - YEARS_BACK, today.getMonth());
    const first = records.length ? records[0].date.slice(0, 7) : floor;
    return first < floor ? first : floor;
  }, [records, today]);
  const maxKey = useMemo(() => shiftYM(ym(today.getFullYear(), today.getMonth()), MONTHS_AHEAD), [today]);

  const selByMonth = useMemo(() => {
    const o = {};
    [...sel].sort().forEach((iso) => { const k = iso.slice(0, 7); (o[k] = o[k] || []).push(iso); });
    return o;
  }, [sel]);
  const flashStr = useMemo(() => [...flash].filter((i) => i.startsWith(viewYM)).sort().join(","), [flash, viewYM]);

  useFocusTrap(dialogRef);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => { document.body.style.overflow = prev; clearTimeout(holdTimer.current); clearTimeout(flashTimer.current); };
  }, []);

  /* a reload or tab close with unsaved edits asks first */
  const dirtyRef = useLatest(dirty);
  useEffect(() => {
    const warn = (e) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyRef]);

  const tryCancel = () => (dirty ? setConfirm("discard") : onCancel());
  const cancelRef = useLatest(tryCancel);
  const confirmRef = useLatest(confirm);
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape" && !confirmRef.current) cancelRef.current(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [cancelRef, confirmRef]);

  const goTo = (key) => {
    if (key < minKey || key > maxKey) return;
    clearTimeout(holdTimer.current); press.current = null;
    setMsg("");
    setViewYM(key);
  };
  const goMonth = (n) => goTo(shiftYM(viewYM, n));
  const curYear = today.getFullYear();
  const chips = useMemo(() => [...records].reverse(), [records]);
  const jumpToPeriod = (r) => {
    goTo(r.date.slice(0, 7));
    setFlash(new Set(r.days));
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(new Set()), 1800);
  };

  /* while a range drag is active, stop the grid scrolling under the finger */
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    const stop = (e) => { if (drag.current) e.preventDefault(); };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  }, []);

  const isFuture = (iso) => diffDays(today, fromISO(iso)) > 0;
  const applyRange = (base, a, b, mode) => {
    const n = new Set(base);
    isosBetween(a, b).forEach((iso) => {
      if (mode === "add") { if (!isFuture(iso)) n.add(iso); } else n.delete(iso);
    });
    return n;
  };

  const toggle = (date) => {
    const iso = toISO(date);
    setErrors([]); setWarnings([]);
    if (isFuture(iso) && !saved.has(iso)) { setMsg("You can only log period days up to today."); return; }
    setMsg("");
    lastTap.current = iso;
    setSel((s) => { const n = new Set(s); if (n.has(iso)) n.delete(iso); else n.add(iso); return n; });
  };
  const onCellClick = (e, date) => {
    if (suppress.current) return;
    const iso = toISO(date);
    if (e.shiftKey && lastTap.current && lastTap.current !== iso) {
      setErrors([]); setWarnings([]); setMsg("");
      const mode = selRef.current.has(lastTap.current) ? "add" : "remove";
      setSel(applyRange(selRef.current, lastTap.current, iso, mode));
      return;
    }
    toggle(date);
  };
  const clickRef = useLatest(onCellClick);
  const stableClick = useCallback((e, d) => clickRef.current(e, d), [clickRef]);

  /* press-and-hold, then drag across days */
  const endHold = () => { clearTimeout(holdTimer.current); press.current = null; };
  const onDown = (e) => {
    if (e.button > 0) return;
    const cell = e.target.closest?.("[data-iso]");
    if (!cell) return;
    const iso = cell.dataset.iso;
    press.current = { x: e.clientX, y: e.clientY, iso, id: e.pointerId };
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      const p = press.current;
      if (!p || (isFuture(p.iso) && !saved.has(p.iso))) return;
      const mode = selRef.current.has(p.iso) ? "remove" : "add";
      drag.current = { anchor: p.iso, mode, base: new Set(selRef.current) };
      try { scrollerRef.current.setPointerCapture(p.id); } catch { /* not capturable */ }
      haptic(15);
      setErrors([]); setWarnings([]); setMsg("");
      setSel(applyRange(drag.current.base, p.iso, p.iso, mode));
      setRanging(true);
    }, HOLD_MS);
  };
  const onMove = (e) => {
    const d = drag.current;
    if (d) {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-iso]");
      if (el) setSel(applyRange(d.base, d.anchor, el.dataset.iso, d.mode));
      return;
    }
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) endHold(); // a scroll, not a hold
  };
  const onUp = () => {
    endHold();
    if (drag.current) {
      drag.current = null;
      suppress.current = true; // swallow the click this gesture would otherwise produce
      setTimeout(() => { suppress.current = false; }, 120);
      setRanging(false);
    }
  };

  const clearAll = () => {
    setErrors([]); setWarnings([]);
    setSel(new Set());
    setMsg(saved.size ? "All dates cleared. Save to confirm, or Cancel to keep them." : "");
  };
  const doSave = () => {
    const res = onSave([...sel]);
    if (!res.ok) { setErrors(res.errors || ["Couldn’t save."]); return; }
    setWarnings(res.warnings || []);
  };
  const trySave = () => { if (sel.size === 0 && saved.size > 0) setConfirm("clear"); else doSave(); };

  const summary = ranging
    ? "Drag across days, then let go"
    : dirty
    ? [added.length ? `${added.length} added` : null, removed.length ? `${removed.length} removed` : null].filter(Boolean).join(" · ")
    : "Tap a day to add or remove it";
  const [vy, vm] = [+viewYM.slice(0, 4), +viewYM.slice(5) - 1];
  const inMonth = (selByMonth[viewYM] || []);

  return (
    <div className="cy-editor" role="dialog" aria-modal="true" aria-labelledby="cy-ed-title" ref={dialogRef} tabIndex={-1}>
      <header className="cy-ed-head">
        <button type="button" className="cy-ed-cancel" onClick={tryCancel}>Cancel</button>
        <h1 id="cy-ed-title">Edit Period</h1>
        {sel.size > 0
          ? <button type="button" className="cy-ed-clear" onClick={clearAll}>Clear all</button>
          : <span className="cy-ed-spacer" aria-hidden="true" />}
      </header>

      <div className="cy-monthbar">
        <button type="button" onClick={() => goMonth(-1)} disabled={viewYM <= minKey} aria-label="Previous month"><Chevron dir="left" /></button>
        <div aria-live="polite" data-testid="cy-visible-month">{monthName(viewYM)}</div>
        <button type="button" onClick={() => goMonth(1)} disabled={viewYM >= maxKey} aria-label="Next month"><Chevron dir="right" /></button>
      </div>

      <div className="cy-chiprow" role="group" aria-label="Your logged periods">
        <button type="button" className="cy-pchip today" onClick={() => goTo(ym(today.getFullYear(), today.getMonth()))}>Today</button>
        {chips.length === 0 && <span className="cy-chip-empty">No periods yet — tap the days you bled</span>}
        {chips.map((r) => {
          const kept = r.days.filter((d) => sel.has(d)).length;
          const state = kept === 0 ? "gone" : kept !== r.days.length ? "edited" : "";
          return (
            <button key={r.id} type="button" className={`cy-pchip ${state}`} onClick={() => jumpToPeriod(r)}
              aria-label={`Go to period ${spanLabel(r, curYear)}${state === "gone" ? ", marked for removal" : state === "edited" ? ", edited" : ""}`}>
              <b>{spanLabel(r, curYear)}</b>
              <span>{r.durationUnknown ? "?" : `${r.days.length}d`}</span>
            </button>
          );
        })}
      </div>

      <div className="cy-week" aria-hidden="true">{WEEK.map((w) => <span key={w}>{w}</span>)}</div>

      <div
        className={`cy-scroller-cal${ranging ? " ranging" : ""}`}
        ref={scrollerRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <MonthBlock key={viewYM} y={vy} m={vm} selStr={inMonth.join(",")} flashStr={flashStr}
          saved={saved} predicted={predicted} today={today} onCellClick={stableClick} />
        <ul className="cy-ed-legend" aria-label="Key">
          {LEGEND.map(([k, l]) => <li key={k}><Marker kind={k} /><span>{l}</span></li>)}
        </ul>
        {sel.size > 0 && (
          <p className="cy-ed-count">{sel.size} {sel.size === 1 ? "day" : "days"} selected{inMonth.length !== sel.size ? ` · ${inMonth.length} in ${new Date(vy, vm, 1).toLocaleDateString("en-US", { month: "long" })}` : ""}</p>
        )}
      </div>

      <footer className="cy-ed-foot">
        <p className="cy-ed-note" role="status" aria-live="polite">{msg || summary}</p>
        {errors.length > 0 && <ul className="cy-ed-errors" role="alert">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        {warnings.length > 0 && <ul className="cy-ed-warn">{warnings.map((e) => <li key={e}>{e}</li>)}</ul>}
        <button type="button" className="cy-save" onClick={trySave} disabled={!dirty}>Save</button>
      </footer>

      {confirm === "discard" && (
        <ConfirmDialog
          title="Discard changes?"
          body="Your unsaved period edits will be lost."
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          danger
          onConfirm={onCancel}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === "clear" && (
        <ConfirmDialog
          title="Remove all logged periods?"
          body="You’ve deselected every logged day. Saving will clear your entire period history."
          confirmLabel="Remove all"
          cancelLabel="Go back"
          danger
          onConfirm={() => { setConfirm(null); doSave(); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
