import { useEffect, useMemo, useRef, useState } from "react";
import { useFocusTrap, useLatest } from "./cycleUtils.js";
import { MAX_PERIOD_DAYS, addDaysISO, diffDays, fromISO, toISO } from "./cycleEngine.js";

const fmt = (iso) => fromISO(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/* Bottom sheet for logging a period: first day, last day (optional while it
   is still going), and — for spotting or skipped days — tap individual days
   off. Nothing is stored until Save; predicted days are never offered. */
export default function PeriodLogger({ today, savedDays, onSave, onClose }) {
  const todayISO = toISO(today);
  const [start, setStart] = useState(todayISO);
  const [end, setEnd] = useState("");
  const [off, setOff] = useState(() => new Set());
  const [errors, setErrors] = useState([]);
  const firstRef = useRef(null);
  const sheetRef = useRef(null);
  const closeRef = useLatest(onClose);
  useFocusTrap(sheetRef);
  useEffect(() => { firstRef.current?.focus(); }, []);
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [closeRef]);

  const range = useMemo(() => {
    if (!fromISO(start)) return [];
    if (!end || !fromISO(end)) return [start];
    const n = diffDays(fromISO(start), fromISO(end));
    if (n < 0 || n >= MAX_PERIOD_DAYS) return [start];
    return Array.from({ length: n + 1 }, (_, i) => addDaysISO(start, i));
  }, [start, end]);
  const days = range.filter((d) => !off.has(d));
  const already = days.filter((d) => savedDays.has(d)).length;
  const endMax = fromISO(start) && diffDays(today, fromISO(addDaysISO(start, MAX_PERIOD_DAYS - 1))) < 0 ? addDaysISO(start, MAX_PERIOD_DAYS - 1) : todayISO;

  const save = () => {
    const errs = [];
    if (!fromISO(start)) errs.push("Choose the first day of bleeding.");
    else if (start > todayISO) errs.push("The first day can’t be in the future.");
    if (end && fromISO(end)) {
      if (end < start) errs.push("The last day can’t be before the first day.");
      else if (end > todayISO) errs.push("The last day can’t be in the future.");
      else if (diffDays(fromISO(start), fromISO(end)) >= MAX_PERIOD_DAYS) errs.push(`A period can span at most ${MAX_PERIOD_DAYS} days.`);
    }
    if (!errs.length && days.length === 0) errs.push("Select at least one bleeding day.");
    if (errs.length) { setErrors(errs); return; }
    const res = onSave(days);
    if (!res.ok) setErrors(res.errors);
  };

  const onStart = (v) => { setStart(v); setOff(new Set()); setErrors([]); if (end && v > end) setEnd(""); };
  const onEnd = (v) => { setEnd(v); setOff(new Set()); setErrors([]); };

  return (
    <div className="cy-sheet-scrim" onClick={onClose}>
      <div className="cy-sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="cy-lg-t" onClick={(e) => e.stopPropagation()}>
        <div className="cy-sheet-grip" aria-hidden="true" />
        <h2 id="cy-lg-t">Add Period</h2>
        <div className="cy-fields">
          <label>
            <span>First day of bleeding</span>
            <input ref={firstRef} type="date" value={start} max={todayISO} onChange={(e) => onStart(e.target.value)} />
          </label>
          <label>
            <span>Last day <em>(leave empty if it’s still going)</em></span>
            <input type="date" value={end} min={start} max={endMax} onChange={(e) => onEnd(e.target.value)} />
          </label>
        </div>

        {range.length > 1 && (
          <div className="cy-chips-wrap">
            <span className="cy-chips-label">Bleeding days — tap to skip a day</span>
            <div className="cy-chips">
              {range.map((d) => (
                <button key={d} type="button" aria-pressed={!off.has(d)} className={off.has(d) ? "off" : ""}
                  onClick={() => setOff((s) => { const n = new Set(s); if (n.has(d)) n.delete(d); else n.add(d); return n; })}>
                  {fmt(d)}
                </button>
              ))}
            </div>
          </div>
        )}

        {already > 0 && <p className="cy-hint">{already} of these {already === 1 ? "day is" : "days are"} already logged — they’ll be merged, not duplicated.</p>}
        {errors.length > 0 && <ul className="cy-ed-errors" role="alert">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}

        <div className="cy-sheet-actions">
          <button type="button" className="cy-btn-quiet" onClick={onClose}>Cancel</button>
          <button type="button" className="cy-btn-solid" onClick={save}>Save period</button>
        </div>
      </div>
    </div>
  );
}
