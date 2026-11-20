import { useState } from "react";
import { CYCLE_OPTIONS, PERIOD_OPTIONS } from "./cycleConstants.js";

function Switch({ checked, onChange, label, hint }) {
  return (
    <label className="cy-switch">
      <span><b>{label}</b>{hint && <em>{hint}</em>}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

const askNotify = () => {
  try { if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission(); } catch { /* unsupported */ }
};

/* `prefs` = { reminders:{period,fertile}, sound }. Everything here is opt-in
   and off by default; history is never touched by changing a setting. */
export default function CycleSettings({ stats, prefs, onSave }) {
  const [cycle, setCycle] = useState(stats.prefCycle);
  const [period, setPeriod] = useState(stats.prefPeriod);
  const [rPeriod, setRPeriod] = useState(!!prefs.reminders?.period);
  const [rFertile, setRFertile] = useState(!!prefs.reminders?.fertile);
  const [sound, setSound] = useState(!!prefs.sound);
  const dirty =
    cycle !== stats.prefCycle || period !== stats.prefPeriod ||
    rPeriod !== !!prefs.reminders?.period || rFertile !== !!prefs.reminders?.fertile || sound !== !!prefs.sound;
  return (
    <section className="cy-settings" aria-label="Cycle settings">
      <div className="cy-fields">
        <label>
          <span>Average cycle length</span>
          <select value={cycle} onChange={(e) => setCycle(+e.target.value)}>
            {CYCLE_OPTIONS.map((n) => <option key={n} value={n}>{n} days</option>)}
          </select>
        </label>
        <label>
          <span>Average period duration</span>
          <select value={period} onChange={(e) => setPeriod(+e.target.value)}>
            {PERIOD_OPTIONS.map((n) => <option key={n} value={n}>{n} {n === 1 ? "day" : "days"}</option>)}
          </select>
        </label>
      </div>
      <p className="cy-hint">
        Used only until you’ve logged enough periods to calculate your own averages — your recorded history always takes priority.
        {stats.basis !== "preference" && ` Right now your history gives a ${stats.avgCycleLen}-day cycle.`}
      </p>

      <h2 className="cy-set-h">Reminders</h2>
      <Switch checked={rPeriod} onChange={(v) => { setRPeriod(v); if (v) askNotify(); }} label="Period coming up" hint="A heads-up in the 2 days before your estimated period" />
      <Switch checked={rFertile} onChange={(v) => { setRFertile(v); if (v) askNotify(); }} label="Fertile window starts" hint="Estimate only — not a method of contraception" />
      <p className="cy-hint">Reminders appear when you open Sumi. Sumi doesn’t send notifications while the app is closed.</p>

      <h2 className="cy-set-h">Feedback</h2>
      <Switch checked={sound} onChange={setSound} label="Soft sound when saving" hint="A gentle chime. Saving always gives a light vibration where your device supports it." />

      <button type="button" className="cy-btn-solid" style={{ marginTop: 18 }} disabled={!dirty}
        onClick={() => onSave({ cycleLength: cycle, periodLength: period, reminders: { period: rPeriod, fertile: rFertile }, sound })}>
        Save settings
      </button>
    </section>
  );
}
