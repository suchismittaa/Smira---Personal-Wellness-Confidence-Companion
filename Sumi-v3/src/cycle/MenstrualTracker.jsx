import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./cycle.css";
import CycleWheel from "./CycleWheel.jsx";
import CycleTimeline from "./CycleTimeline.jsx";
import CyclePhaseIndicator from "./CyclePhaseIndicator.jsx";
import PhaseDetails from "./PhaseDetails.jsx";
import PeriodCalendarEditor from "./PeriodCalendarEditor.jsx";
import PeriodLogger from "./PeriodLogger.jsx";
import PeriodHistory from "./PeriodHistory.jsx";
import CycleSettings from "./CycleSettings.jsx";
import DayLogSheet from "./DayLogSheet.jsx";
import { Toast } from "./cycleUi.jsx";
import { CY_VARS, HORMONES } from "./cycleTheme.js";
import { useCycleStore } from "./useCycleStore.js";
import { chime, haptic } from "./cycleUtils.js";
import { describeLog } from "./cycleLogs.js";
import { getReminders } from "./reminders.js";
import { buildReportHtml, printReport } from "./report.js";
import {
  applyEditedDays, computeStats, contextFor, countdownFor, diffDays, fromISO, phaseCorrelation, startOfDay, toISO, validateSelection,
} from "./cycleEngine.js";

/* Keeps "today" correct if the app stays open past midnight. */
function useToday() {
  const [today, setToday] = useState(() => startOfDay(new Date()));
  useEffect(() => {
    const check = () => setToday((t) => { const n = startOfDay(new Date()); return n.getTime() === t.getTime() ? t : n; });
    const id = setInterval(check, 60000);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", check); };
  }, []);
  return today;
}

/* `store` is Sumi's LS abstraction (passed in from App.jsx so this module has no
   import cycle). Persistence lives in useCycleStore; unsaved calendar selections
   live only in React state and are never written, so they are never synced. */
export default function MenstrualTracker({ scans, user, onUpdateProfile, store }) {
  const today = useToday();
  const { records, saveRecords, logs, saveDayLog, meta, patchMeta, syncIssue } = useCycleStore(store);
  const [tab, setTab] = useState("today"); // today | history | settings
  const [selected, setSelected] = useState(today);
  const [editor, setEditor] = useState(null); // { month: Date }
  const [logger, setLogger] = useState(false);
  const [dayLog, setDayLog] = useState(null); // Date being logged, or null
  const [toast, setToast] = useState({ msg: "", tone: "" });
  const toastTimer = useRef(0);

  const stats = useMemo(
    () => computeStats(records, { cycleLength: user?.cycleLength, periodLength: user?.periodLength }, today, { normalized: true }),
    [records, user?.cycleLength, user?.periodLength, today]
  );
  const hasData = stats.records.length > 0;
  const ctx = hasData ? contextFor(stats, selected) : null;
  const countdown = useMemo(() => countdownFor(stats, selected), [stats, selected]);
  const correlation = useMemo(() => phaseCorrelation(stats, scans), [stats, scans]);
  const savedDays = stats.loggedDays;
  const selectedISO = toISO(selected);
  const canLogDay = diffDays(today, selected) <= 0;
  const entry = logs[selectedISO];
  const dayEntry = dayLog ? logs[toISO(dayLog)] : undefined;

  const say = useCallback((msg, tone = "") => {
    setToast({ msg, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast({ msg: "", tone: "" }), 2800);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const feedback = () => { haptic(15); if (user?.cycleSound) chime(); };

  /* ── opt-in reminders (shown when the app is opened) ── */
  const remPrefs = user?.cycleReminders;
  const todayISO = toISO(today);
  const reminders = useMemo(() => getReminders(stats, remPrefs, meta.seen || {}, today), [stats, remPrefs, meta.seen, today]);
  const notified = useRef(new Set());
  useEffect(() => {
    try {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      getReminders(stats, remPrefs, meta.notified || {}, today).forEach((r) => {
        if (notified.current.has(r.id)) return;
        notified.current.add(r.id);
        new Notification("Sumi", { body: r.text, tag: `sumi-${r.id}` }); // eslint-disable-line no-new
        patchMeta({ notified: { ...(meta.notified || {}), [r.id]: todayISO } });
      });
    } catch { /* notifications unavailable */ }
  }, [stats, remPrefs, meta.notified, today, todayISO, patchMeta]);
  const dismissReminder = (id) => patchMeta({ seen: { ...(meta.seen || {}), [id]: todayISO } });

  /* Shared by the calendar editor and the Add Period sheet. `days` is the FULL
     set of confirmed bleeding days after the edit. */
  const commitDays = (days, doneMsg) => {
    const v = validateSelection(days, [...savedDays], today);
    if (!v.ok) return v;
    saveRecords(applyEditedDays(records, days, Date.now()));
    setEditor(null); setLogger(false);
    feedback();
    say(doneMsg);
    return v;
  };
  const onEditorSave = (days) => commitDays(days, "Period saved");
  const onLogSave = (newDays) => commitDays([...savedDays, ...newDays], "Period added");
  const onDelete = (rec) => { saveRecords(records.filter((r) => r.id !== rec.id)); say("Period deleted"); };
  const onSettings = ({ cycleLength, periodLength, reminders: rem, sound }) => {
    onUpdateProfile?.({ ...user, cycleLength: String(cycleLength), periodLength: String(periodLength), cycleReminders: rem, cycleSound: sound });
    say("Settings saved");
  };
  const onDayLogSave = (e) => { saveDayLog(toISO(dayLog), e); setDayLog(null); feedback(); say("Day saved"); };
  const onExport = () => {
    printReport(buildReportHtml({ stats, logs, name: user?.name || "" }));
    say("Choose “Save as PDF” in the print window");
  };

  const openEditor = (month) => setEditor({ month: month || (hasData && selected <= today ? selected : today) });
  const isToday = selected.getTime() === today.getTime();
  const showHint = !hasData && !meta.hintSeen;

  return (
    <div className="cy-root" style={CY_VARS}>
      <h1 className="cy-sr">Cycle</h1>
      <nav className="cy-tabs" aria-label="Cycle sections">
        <div role="tablist">
          {[["today", "Today"], ["history", "History"], ["settings", "Settings"]].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        {tab === "today" && (
          <button type="button" className="cy-edit-btn" onClick={() => openEditor()} aria-label="Edit period dates in a calendar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>
            <span>Edit Period</span>
          </button>
        )}
      </nav>

      {syncIssue && <p className="cy-sync" role="status">Saved on this device. Sumi couldn’t reach the cloud and will retry when you’re back online.</p>}
      {reminders.map((r) => (
        <div key={r.id} className="cy-reminder" role="status">
          <span>{r.text} <em>(estimate)</em></span>
          <button type="button" onClick={() => dismissReminder(r.id)} aria-label="Dismiss reminder">×</button>
        </div>
      ))}

      {tab === "today" && (
        <>
          <CycleWheel
            countdown={countdown}
            cycleLen={ctx ? ctx.cycleLen : stats.avgCycleLen}
            periodLen={ctx ? ctx.periodLen : stats.avgPeriodLen}
            ovDay={ctx ? ctx.ovDay : stats.ovDay}
            selectedDay={ctx ? ctx.shownDay : 1}
            phase={ctx?.phase}
            hasData={hasData}
            onAddPeriod={() => { setLogger(true); if (showHint) patchMeta({ hintSeen: true }); }}
          />
          {showHint && (
            <p className="cy-firstrun" role="note">
              Tap <b>Add Period</b> to log your first one.
              <button type="button" onClick={() => patchMeta({ hintSeen: true })}>Got it</button>
            </p>
          )}
          {!isToday && (
            <button type="button" className="cy-today-chip" onClick={() => setSelected(today)}>Back to today</button>
          )}
          <CycleTimeline stats={stats} selected={selected} onSelect={setSelected} hasData={hasData} loggedNotes={logs} />
          <ul className="cy-legend" aria-label="Hormone legend">
            {[...HORMONES].reverse().map((h) => (
              <li key={h.key}><i style={{ background: h.color }} aria-hidden="true" />{h.label}</li>
            ))}
          </ul>
          <p className="cy-fine cy-center">LH = luteinizing hormone · FSH = follicle-stimulating hormone. Illustrative typical patterns, not measurements or test results.</p>
          <CyclePhaseIndicator phase={ctx?.phase} />
          {canLogDay && (
            <button type="button" className="cy-log-btn" onClick={() => setDayLog(selected)}>
              <span>{isToday ? "Today" : selected.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
              {entry ? <b>{describeLog(entry) || "Note added"}</b> : <b>Log symptoms &amp; mood</b>}
            </button>
          )}
          {ctx && <PhaseDetails ctx={ctx} stats={stats} correlation={correlation} scanCount={scans?.length || 0} selected={selected} />}
        </>
      )}

      {tab === "history" && (
        <PeriodHistory
          stats={stats}
          logs={logs}
          onEditDay={(iso) => setDayLog(fromISO(iso))}
          onAdd={() => setLogger(true)}
          onEdit={(r) => openEditor(fromISO(r.date))}
          onDelete={onDelete}
          onExport={onExport}
        />
      )}

      {tab === "settings" && (
        <CycleSettings stats={stats} prefs={{ reminders: remPrefs, sound: user?.cycleSound }} onSave={onSettings} />
      )}

      <Toast message={toast.msg} tone={toast.tone} />

      {logger && <PeriodLogger today={today} savedDays={savedDays} onSave={onLogSave} onClose={() => setLogger(false)} />}
      {dayLog && <DayLogSheet key={toISO(dayLog)} date={dayLog} entry={dayEntry} onSave={onDayLogSave} onClose={() => setDayLog(null)} />}
      {editor && (
        <PeriodCalendarEditor
          records={stats.records}
          stats={stats}
          today={today}
          initialMonth={editor.month}
          onSave={onEditorSave}
          onCancel={() => setEditor(null)}
        />
      )}
    </div>
  );
}
