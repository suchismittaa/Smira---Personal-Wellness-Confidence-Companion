import { diffDays, fromISO, toISO, startOfDay, addDays } from "./cycleEngine.js";
import { summarizeLogs } from "./cycleLogs.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (d) => (typeof d === "string" ? fromISO(d) : d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/* One-page, print-ready summary a person can show their doctor. Built entirely
   on-device; free-text notes are deliberately NOT included. */
export function buildReportHtml({ stats, logs = {}, name = "", now = new Date() }) {
  const today = startOfDay(now);
  const recs = stats.records.slice(-12);
  const rows = recs.map((r) => {
    const i = stats.records.indexOf(r);
    const next = stats.records[i + 1];
    const cyc = next ? diffDays(fromISO(r.date), fromISO(next.date)) : null;
    return `<tr><td>${esc(fmt(r.date))}</td><td>${esc(fmt(r.endDate))}</td><td>${r.durationUnknown ? "not recorded" : r.length}</td><td>${cyc ?? "current"}</td></tr>`;
  }).reverse().join("");
  const since = toISO(addDays(today, -90));
  const sum = summarizeLogs(logs, since, toISO(today));
  const listOf = (a) => a.slice(0, 8).map((x) => `${esc(x.label)} (${x.count})`).join(", ") || "none logged";
  const range = stats.minLen != null ? `${stats.minLen}–${stats.maxLen} days` : "not enough data";
  const basis = stats.basis === "history" ? `calculated from ${stats.usedGaps.length} recorded cycles` : stats.basis === "partial" ? "calculated from 1 recorded cycle" : "based on the person’s own setting (not enough history)";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Cycle summary</title>
<style>
@page{size:A4;margin:14mm}
*{box-sizing:border-box}body{font:12px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;color:#4E5138;margin:0}
h1{font-size:20px;margin:0 0 2px}h2{font-size:13px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.06em;color:#B4636B}
.meta{color:#6E7A59;margin:0 0 10px}table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #BCCCA6}th{font-size:11px;color:#6E7A59;font-weight:600}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.k{border:1px solid #BCCCA6;border-radius:8px;padding:8px 10px}
.k b{display:block;font-size:16px}.k span{font-size:11px;color:#6E7A59}.fine{font-size:10.5px;color:#6E7A59;margin-top:16px}
</style></head><body>
<h1>Menstrual cycle summary</h1>
<p class="meta">${name ? `Prepared for ${esc(name)} · ` : ""}Generated ${esc(fmt(today))} from the Sumi app</p>
<div class="grid">
<div class="k"><b>${stats.avgCycleLen} days</b><span>Average cycle length (${esc(basis)})</span></div>
<div class="k"><b>${esc(range)}</b><span>Range of recorded cycle lengths${stats.irregular ? " — varies by more than 7 days" : ""}</span></div>
<div class="k"><b>${stats.avgPeriodLen} days</b><span>Average period duration</span></div>
</div>
<h2>Recorded periods (most recent first)</h2>
${rows ? `<table><thead><tr><th>First day</th><th>Last day</th><th>Days of bleeding</th><th>Cycle length (days)</th></tr></thead><tbody>${rows}</tbody></table>` : "<p>No periods recorded.</p>"}
<h2>Symptoms &amp; mood, last 90 days</h2>
<p><b>Days with an entry:</b> ${sum.days}<br><b>Symptoms:</b> ${listOf(sum.symptoms)}<br><b>Mood:</b> ${listOf(sum.moods)}</p>
<p class="fine">Every period listed was entered by the person using the app. Predictions are not included. This summary is self-reported, is not a medical record or diagnosis, and free-text notes are not included.</p>
</body></html>`;
}

/* Prints through a hidden iframe (no popup, no dependency). The user chooses
   “Save as PDF” in the print dialog. */
export function printReport(html) {
  const frame = document.createElement("iframe");
  frame.setAttribute("data-cy-report", "1");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  frame.srcdoc = html;
  frame.onload = () => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { /* print unavailable */ }
    setTimeout(() => frame.remove(), 120000);
  };
  document.body.appendChild(frame);
  return frame;
}
