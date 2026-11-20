import { useEffect, useRef, useState } from "react";
import { ENERGY, FLOWS, MOODS, NOTE_MAX, SYMPTOMS } from "./cycleConstants.js";
import { useFocusTrap, useLatest } from "./cycleUtils.js";

/* Bottom sheet for one day's symptoms + mood + short note. Stored apart from
   period records (cycle_logs), so it can never change a period. */
export default function DayLogSheet({ date, entry, onSave, onClose }) {
  const [symptoms, setSymptoms] = useState(() => new Set(entry?.symptoms || []));
  const [mood, setMood] = useState(entry?.mood || null);
  const [flow, setFlow] = useState(entry?.flow || null);
  const [energy, setEnergy] = useState(entry?.energy || null);
  const [note, setNote] = useState(entry?.note || "");
  const ref = useRef(null);
  const closeRef = useLatest(onClose);
  useFocusTrap(ref);
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [closeRef]);
  const toggle = (id) => setSymptoms((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const title = date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const empty = !symptoms.size && !mood && !flow && !energy && !note.trim();
  return (
    <div className="cy-sheet-scrim" onClick={onClose}>
      <div className="cy-sheet" ref={ref} role="dialog" aria-modal="true" aria-labelledby="cy-dl-t" onClick={(e) => e.stopPropagation()}>
        <div className="cy-sheet-grip" aria-hidden="true" />
        <h2 id="cy-dl-t">How are you feeling?</h2>
        <p className="cy-hint" style={{ marginTop: -8 }}>{title}</p>

        <div className="cy-chips-wrap">
          <span className="cy-chips-label">Flow</span>
          <div className="cy-chips">
            {FLOWS.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={flow === id} className={flow === id ? "" : "off"} onClick={() => setFlow(flow === id ? null : id)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="cy-chips-wrap">
          <span className="cy-chips-label">Symptoms</span>
          <div className="cy-chips lav">
            {SYMPTOMS.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={symptoms.has(id)} className={symptoms.has(id) ? "" : "off"} onClick={() => toggle(id)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="cy-chips-wrap">
          <span className="cy-chips-label">Mood</span>
          <div className="cy-chips lav">
            {MOODS.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={mood === id} className={mood === id ? "" : "off"} onClick={() => setMood(mood === id ? null : id)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="cy-chips-wrap">
          <span className="cy-chips-label">Energy</span>
          <div className="cy-chips lav">
            {ENERGY.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={energy === id} className={energy === id ? "" : "off"} onClick={() => setEnergy(energy === id ? null : id)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="cy-fields" style={{ marginTop: 16 }}>
          <label>
            <span>Note <em>(private, optional)</em></span>
            <textarea value={note} maxLength={NOTE_MAX} rows={3} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <div className="cy-sheet-actions">
          <button type="button" className="cy-btn-quiet" onClick={onClose}>Cancel</button>
          <button type="button" className="cy-btn-solid" onClick={() => onSave({ symptoms: [...symptoms], mood, energy, flow, note })}>
            {empty && entry ? "Clear day" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
