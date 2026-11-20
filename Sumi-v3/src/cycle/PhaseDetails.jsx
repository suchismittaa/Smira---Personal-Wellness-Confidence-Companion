import { useState } from "react";
import { predictedRange } from "./cycleEngine.js";
import { PHASES, PHASE_CONTENT, TOPIC_CARDS } from "./cycleContent.js";

const d = (date) => date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const span = (a, b) => `${d(a)} – ${d(b)}`;

/* Phase information for the SELECTED date, built from the existing
   PHASE_CONTENT (skin + wellness text unchanged) and the engine's estimates.
   Everything is a general pattern that varies between individuals. */
export default function PhaseDetails({ ctx, stats, correlation, scanCount, selected }) {
  const [open, setOpen] = useState(null);
  const meta = PHASES.find((p) => p.id === ctx.phase);
  const info = PHASE_CONTENT[ctx.phase];
  const range = predictedRange(stats); // only when cycles vary a lot: show a range, not a false-precise date
  const estimate = ctx.projected || ctx.late || selected > stats.today;
  const basis =
    stats.basis === "history"
      ? `Based on your last ${stats.usedGaps.length} cycles (${stats.minLen}–${stats.maxLen} days, avg ${stats.avgCycleLen}).${stats.irregular ? " Your cycles vary quite a bit, so treat dates as a rough guide." : ""}`
      : stats.basis === "partial"
      ? "Based on 1 recorded cycle. Log a couple more and Sumi will learn your pattern."
      : `Using your usual cycle length of ${stats.avgCycleLen} days until there’s more history.`;

  return (
    <section className="cy-details" aria-label="About this phase">
      <header>
        <h2>{meta.label} phase</h2>
        <p>Day {ctx.shownDay}{ctx.late ? "+" : ""} · {info.duration}{estimate ? " · estimate" : ""}</p>
      </header>

      <dl className="cy-estimates">
        <div><dt>Next period</dt><dd>{range ? span(range.periodFrom, range.periodTo) : d(stats.predictedNext)}{stats.overdue ? " (not logged yet)" : ""}</dd></div>
        <div><dt>Ovulation</dt><dd>{range ? span(range.ovulationFrom, range.ovulationTo) : d(stats.ovulationDate)}</dd></div>
        <div><dt>Fertile window</dt><dd>{d(stats.fertileStartDate)} – {d(stats.fertileEndDate)}</dd></div>
      </dl>
      <p className="cy-fine">{basis} These are estimates, not confirmed records.</p>

      <div className="cy-info-row">
        <h3>What’s happening</h3>
        <p>{info.biology}</p>
        <p className="cy-soft">{info.whyFeel}</p>
      </div>

      <div className="cy-common" aria-label="Commonly reported">
        {info.common.map((c) => <span key={c}>{c}</span>)}
      </div>

      <ul className="cy-acc">
        {TOPIC_CARDS.map((tc) => {
          const isOpen = open === tc.key;
          return (
            <li key={tc.key}>
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : tc.key)}>
                <span>{tc.label}</span><i aria-hidden="true" className={isOpen ? "up" : ""} />
              </button>
              {isOpen && <p>{info[tc.key]}</p>}
            </li>
          );
        })}
        <li>
          <button type="button" aria-expanded={open === "attention"} onClick={() => setOpen(open === "attention" ? null : "attention")}>
            <span>When to pay attention</span><i aria-hidden="true" className={open === "attention" ? "up" : ""} />
          </button>
          {open === "attention" && (
            <div>
              <ul className="cy-attn">{info.attention.map((a) => <li key={a}>{a}</li>)}</ul>
              <p className="cy-fine">Sumi can’t diagnose anything. If something feels severe, persistent or unusual for you, it’s worth speaking with a healthcare professional.</p>
            </div>
          )}
        </li>
      </ul>

      {correlation && (
        <div className="cy-info-row">
          <h3>Your skin &amp; cycle</h3>
          <p className="cy-soft">Average skin score from your scans, by the phase they were taken in.</p>
          <ul className="cy-corr">
            {PHASES.filter((p) => correlation[p.id] !== undefined).map((p) => (
              <li key={p.id}><span>{p.label}</span><b>{correlation[p.id]}</b></li>
            ))}
          </ul>
          <p className="cy-fine">Based on {scanCount} scan{scanCount === 1 ? "" : "s"} matched to logged cycle dates.</p>
        </div>
      )}
      <p className="cy-fine">Hormone and symptom information describes general patterns that vary between individuals.</p>
    </section>
  );
}
