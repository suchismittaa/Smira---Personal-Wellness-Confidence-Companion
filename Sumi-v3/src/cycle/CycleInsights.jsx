import { useMemo } from "react";
import { regularityInsight } from "./cycleEngine.js";
import { summarizeLogs } from "./cycleLogs.js";
import { toISO, addDaysISO } from "./cycleEngine.js";

/* Compact stats strip for the History tab: averages, regularity, a tiny bar
   chart of recent cycle lengths, and what you logged most in the last 90
   days. Everything here is derived from confirmed records and logs. */
export default function CycleInsights({ stats, logs }) {
  const reg = regularityInsight(stats);
  const lens = stats.previousCycleLengths.slice(-6);
  const top = Math.max(...lens, 1);
  const recent = useMemo(() => {
    const end = toISO(stats.today);
    return summarizeLogs(logs, addDaysISO(end, -89), end);
  }, [logs, stats.today]);
  const common = [...recent.symptoms.slice(0, 3), ...recent.moods.slice(0, 1)].map((x) => x.label);
  return (
    <section className="cy-insights" aria-label="Cycle statistics">
      <dl className="cy-stats">
        <div><dt>Average cycle</dt><dd>{stats.avgCycleLen} days{stats.basis === "preference" ? "*" : ""}</dd></div>
        <div><dt>Average period</dt><dd>{stats.avgPeriodLen} {stats.avgPeriodLen === 1 ? "day" : "days"}</dd></div>
        <div><dt>Regularity</dt><dd>{reg.label}</dd></div>
      </dl>
      <p className="cy-fine" style={{ margin: "8px 0 0" }}>{reg.detail}{stats.basis === "preference" ? " *Your setting, until you have logged more cycles." : ""}</p>
      {lens.length > 0 && (
        <div className="cy-bars" role="img" aria-label={`Recent cycle lengths in days: ${lens.join(", ")}`}>
          {lens.map((n, i) => (
            <span key={i} className="cy-bar"><i style={{ height: `${Math.round(10 + (n / top) * 34)}px` }} /><b>{n}</b></span>
          ))}
        </div>
      )}
      {common.length > 0 && <p className="cy-fine" style={{ margin: "10px 0 0" }}>Most logged lately: {common.join(", ")}.</p>}
    </section>
  );
}
