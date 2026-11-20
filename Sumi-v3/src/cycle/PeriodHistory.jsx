import { useState } from "react";
import { diffDays, fromISO } from "./cycleEngine.js";
import { ConfirmDialog } from "./cycleUi.jsx";
import CycleInsights from "./CycleInsights.jsx";
import { describeLog } from "./cycleLogs.js";

const f = (iso, year) => fromISO(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) });
const range = (r) => (r.date === r.endDate ? f(r.date, true) : `${f(r.date)} – ${f(r.endDate, true)}`);

export default function PeriodHistory({ stats, logs = {}, onAdd, onEdit, onDelete, onExport, onEditDay }) {
  const [askDelete, setAskDelete] = useState(null);
  const recs = stats.records;
  const list = [...recs].reverse();
  const dayKeys = Object.keys(logs).sort().reverse().slice(0, 14);
  return (
    <section className="cy-history" aria-label="Period history">
      {recs.length === 0 ? (
        <div className="cy-empty">
          <p>No periods logged yet.</p>
          <button type="button" className="cy-pill-btn" onClick={onAdd}>Add Period</button>
        </div>
      ) : (
        <>
          <div className="cy-hist-top">
            <button type="button" className="cy-export" onClick={onExport}>Export for doctor</button>
          </div>
          <CycleInsights stats={stats} logs={logs} />
          <ul>
            {list.map((r) => {
              const i = recs.indexOf(r);
              const next = recs[i + 1];
              const cyc = next ? diffDays(fromISO(r.date), fromISO(next.date)) : null;
              const current = !next;
              return (
                <li key={r.id}>
                  <div className="cy-hist-main">
                    <strong>{range(r)}</strong>
                    <span>
                      {r.durationUnknown ? "Duration not recorded" : `${r.length} ${r.length === 1 ? "day" : "days"}`}
                      {" · "}
                      {cyc != null ? `${cyc}-day cycle` : current ? "Current cycle" : ""}
                    </span>
                  </div>
                  <div className="cy-hist-actions">
                    <button type="button" onClick={() => onEdit(r)} aria-label={`Edit period starting ${f(r.date, true)}`}>Edit</button>
                    <button type="button" className="danger" onClick={() => setAskDelete(r)} aria-label={`Delete period starting ${f(r.date, true)}`}>Delete</button>
                  </div>
                </li>
              );
            })}
          </ul>
          {dayKeys.length > 0 && (
            <>
              <h2 className="cy-set-h">Daily notes</h2>
              <ul>
                {dayKeys.map((iso) => (
                  <li key={iso}>
                    <div className="cy-hist-main"><strong>{f(iso, true)}</strong><span>{describeLog(logs[iso]) || "Note added"}</span></div>
                    <div className="cy-hist-actions"><button type="button" onClick={() => onEditDay(iso)} aria-label={`Edit notes for ${f(iso, true)}`}>Edit</button></div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {askDelete && (
        <ConfirmDialog
          title="Delete this period?"
          body={`${range(askDelete)} will be removed from your history. Your other periods aren’t affected. This can’t be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => { const r = askDelete; setAskDelete(null); onDelete(r); }}
          onCancel={() => setAskDelete(null)}
        />
      )}
    </section>
  );
}
