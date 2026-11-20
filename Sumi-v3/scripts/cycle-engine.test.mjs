// Run with:  node scripts/cycle-engine.test.mjs   (no dependencies)
import assert from "node:assert/strict";
import * as E from "../src/cycle/cycleEngine.js";
import * as Logs from "../src/cycle/cycleLogs.js";
import * as Rem from "../src/cycle/reminders.js";
import * as Rep from "../src/cycle/report.js";

let pass = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("  ok  " + name); } catch (e) { console.error("FAIL  " + name + "\n      " + e.message); process.exitCode = 1; } };
const D = (s) => E.fromISO(s);
const NOW = D("2026-11-14");

console.log("migration");
t("legacy {id,date,length} keeps id/date/length and gains days", () => {
  const [r] = E.normalizeCycles([{ id: "c_1700000000000_ab", date: "2026-10-12", length: 5 }]);
  assert.equal(r.id, "c_1700000000000_ab"); assert.equal(r.date, "2026-10-12"); assert.equal(r.length, 5);
  assert.deepEqual(r.days, ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
  assert.equal(r.endDate, "2026-10-16"); assert.equal(r.createdAt, 1700000000000);
});
t("legacy record without length: one day, duration NOT invented", () => {
  const [r] = E.normalizeCycles([{ id: "x", date: "2026-10-12" }]);
  assert.deepEqual(r.days, ["2026-10-12"]); assert.equal(r.length, undefined); assert.equal(r.durationUnknown, true);
});
t("legacy record with no id gets one; bad dates dropped; full ISO timestamp accepted", () => {
  const r = E.normalizeCycles([{ date: "2026-10-12T00:00:00.000Z", length: 4 }, { date: "garbage" }, null]);
  assert.equal(r.length, 1); assert.ok(r[0].id.startsWith("c_"));
});
t("normalisation is idempotent", () => {
  const a = E.normalizeCycles([{ id: "a", date: "2026-09-01", length: 5 }, { id: "b", date: "2026-09-29" }], 111);
  const b = E.normalizeCycles(a, 222);
  assert.deepEqual(a, b);
});
t("needsMigration true for legacy, false after", () => {
  const raw = [{ id: "a", date: "2026-09-01", length: 5 }];
  assert.equal(E.needsMigration(raw), true);
  assert.equal(E.needsMigration(E.normalizeCycles(raw)), false);
});
t("old readers still work on migrated data (date + length)", () => {
  const [r] = E.normalizeCycles([{ id: "a", date: "2026-09-01", length: 5 }]);
  assert.equal(new Date(r.date).toISOString().slice(0, 10), "2026-09-01"); assert.equal(Number.isFinite(r.length), true);
});

console.log("grouping / editing");
t("consecutive days form one period; far days form another", () => {
  const g = E.groupDays(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-29", "2026-09-30"]);
  assert.equal(g.length, 2); assert.equal(g[0].length, 3);
});
t("non-consecutive days within gap stay one period (individual dates)", () => {
  const g = E.groupDays(["2026-09-01", "2026-09-03", "2026-09-04"]);
  assert.equal(g.length, 1); assert.equal(g[0].length, 3);
});
t("edit keeps ids stable, only changed record gets new updatedAt", () => {
  const base = E.normalizeCycles([{ id: "a", date: "2026-08-04", length: 5 }, { id: "b", date: "2026-09-01", length: 5 }], 100);
  const sel = [...base[0].days, "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]; // b shortened to 4
  const out = E.applyEditedDays(base, sel, 999);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, "a"); assert.equal(out[0].updatedAt, 100);
  assert.equal(out[1].id, "b"); assert.equal(out[1].length, 4); assert.equal(out[1].updatedAt, 999); assert.equal(out[1].createdAt, 100);
});
t("adding a missing historical period creates a new record, others untouched", () => {
  const base = E.normalizeCycles([{ id: "a", date: "2026-08-04", length: 5 }, { id: "b", date: "2026-09-29", length: 5 }], 100);
  const all = base.flatMap((r) => r.days).concat(["2026-09-01", "2026-09-02", "2026-09-03"]);
  const out = E.applyEditedDays(base, all, 500);
  assert.equal(out.length, 3); assert.equal(out[1].date, "2026-09-01"); assert.equal(out[1].createdAt, 500);
  assert.equal(out[0].id, "a"); assert.equal(out[2].id, "b");
});
t("deselecting every day of one record removes only that record", () => {
  const base = E.normalizeCycles([{ id: "a", date: "2026-08-04", length: 5 }, { id: "b", date: "2026-09-01", length: 5 }, { id: "c", date: "2026-09-29", length: 4 }]);
  const out = E.applyEditedDays(base, [...base[0].days, ...base[2].days]);
  assert.deepEqual(out.map((r) => r.id), ["a", "c"]);
});
t("shifting a period by a day keeps its id (overlap match)", () => {
  const base = E.normalizeCycles([{ id: "a", date: "2026-09-01", length: 5 }], 1);
  const out = E.applyEditedDays(base, ["2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"], 2);
  assert.equal(out.length, 1); assert.equal(out[0].id, "a"); assert.equal(out[0].date, "2026-09-02");
});
t("editing a duration-unknown record clears the flag", () => {
  const base = E.normalizeCycles([{ id: "a", date: "2026-09-01" }], 1);
  const out = E.applyEditedDays(base, ["2026-09-01", "2026-09-02", "2026-09-03"], 2);
  assert.equal(out[0].durationUnknown, undefined); assert.equal(out[0].length, 3);
});
t("untouched duration-unknown record stays unknown", () => {
  const base = E.normalizeCycles([{ id: "a", date: "2026-09-01" }], 1);
  const out = E.applyEditedDays(base, ["2026-09-01"], 2);
  assert.equal(out[0].durationUnknown, true); assert.equal(out[0].updatedAt, 1);
});

console.log("validation");
t("rejects NEW future days, allows already-saved ones", () => {
  assert.equal(E.validateSelection(["2026-11-20"], [], NOW).ok, false);
  assert.equal(E.validateSelection(["2026-11-20"], ["2026-11-20"], NOW).ok, true);
});
t("rejects a 15-day span, accepts 14", () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => E.addDaysISO("2026-10-01", i));
  assert.equal(E.validateSelection(mk(15), [], NOW).ok, false);
  assert.equal(E.validateSelection(mk(14), [], NOW).ok, true);
});
t("warns on periods starting <15 days apart (non-blocking)", () => {
  const v = E.validateSelection(["2026-10-01", "2026-10-10"], [], NOW);
  assert.equal(v.ok, true); assert.equal(v.warnings.length, 1);
});

console.log("statistics");
const rec = (...pairs) => pairs.map(([d, l], i) => ({ id: "r" + i, date: d, length: l }));
t("no history → uses configured cycle/period length, basis=preference", () => {
  const s = E.computeStats([], { cycleLength: "32", periodLength: "6" }, NOW);
  assert.equal(s.avgCycleLen, 32); assert.equal(s.avgPeriodLen, 6); assert.equal(s.basis, "preference"); assert.equal(s.predictedNext, null);
});
t("average cycle from real gaps (28, 30 → 29), period avg from lengths", () => {
  const s = E.computeStats(rec(["2026-08-01", 5], ["2026-08-29", 4], ["2026-09-28", 6]), { cycleLength: 28 }, NOW);
  assert.deepEqual(s.usedGaps, [28, 30]); assert.equal(s.avgCycleLen, 29); assert.equal(s.avgPeriodLen, 5); assert.equal(s.basis, "history");
});
t("one gap → basis partial; outlier gaps (>60) ignored", () => {
  const s = E.computeStats(rec(["2026-05-01", 5], ["2026-08-01", 5], ["2026-08-30", 5]), {}, NOW);
  assert.deepEqual(s.usedGaps, [29]); assert.equal(s.basis, "partial");
});
t("irregular flag when spread > 7 days", () => {
  const s = E.computeStats(rec(["2026-05-01", 5], ["2026-05-22", 5], ["2026-06-26", 5], ["2026-07-20", 5]), {}, NOW);
  assert.equal(s.irregular, true);
});
t("predicted next = last start + avg; ovulation & fertile window consistent", () => {
  const s = E.computeStats(rec(["2026-09-17", 5], ["2026-10-15", 5]), {}, NOW);
  assert.equal(E.toISO(s.predictedNext), "2026-11-12");
  assert.equal(s.ovDay, 14); assert.equal(E.toISO(s.ovulationDate), "2026-10-28");
  assert.equal(E.toISO(s.fertileStartDate), "2026-10-23"); assert.equal(E.toISO(s.fertileEndDate), "2026-10-29");
});
t("non-28-day cycle (35) shifts ovulation to day 21", () => {
  const s = E.computeStats([], { cycleLength: 35 }, NOW);
  assert.equal(s.ovDay, 21);
});
t("short cycle (21) ovulation never lands inside the period", () => {
  const s = E.computeStats([], { cycleLength: 21, periodLength: 7 }, NOW);
  assert.ok(s.ovDay >= 10); assert.ok(s.ovDay <= 19);
});
t("changing preference never touches history", () => {
  const raw = rec(["2026-09-17", 5], ["2026-10-15", 5]);
  const a = E.computeStats(raw, { cycleLength: 28 }, NOW), b = E.computeStats(raw, { cycleLength: 40 }, NOW);
  assert.equal(a.avgCycleLen, b.avgCycleLen); assert.equal(a.records.length, 2);
});

console.log("context / countdown / phase");
const S = E.computeStats(rec(["2026-09-17", 5], ["2026-10-15", 5]), {}, D("2026-10-25")); // L=28, next 2026-11-12
t("current cycle day & phase on logged day / mid-cycle / luteal", () => {
  assert.equal(E.contextFor(S, D("2026-10-15")).day, 1);
  assert.equal(E.contextFor(S, D("2026-10-17")).phase, "menstrual");
  assert.equal(E.contextFor(S, D("2026-10-22")).phase, "follicular");
  assert.equal(E.contextFor(S, D("2026-10-28")).phase, "ovulation");
  assert.equal(E.contextFor(S, D("2026-11-05")).phase, "luteal");
});
t("countdown is relative to the selected date and positive", () => {
  assert.deepEqual([E.countdownFor(S, D("2026-10-25")).kind, E.countdownFor(S, D("2026-10-25")).n], ["in", 18]);
  assert.equal(E.countdownFor(S, D("2026-10-30")).n, 13);
});
t("selected logged day → period day, not a countdown", () => {
  const c = E.countdownFor(S, D("2026-10-16")); assert.equal(c.kind, "period"); assert.equal(c.day, 2);
});
t("past cycle uses the ACTUAL next start (28 days between 17 Sep and 15 Oct)", () => {
  const c = E.countdownFor(S, D("2026-10-01")); assert.equal(c.n, 14);
});
t("future date past predicted start projects the next cycle (no negative)", () => {
  const c = E.countdownFor(S, D("2026-11-20")); assert.equal(c.kind, "in"); assert.ok(c.n > 0);
});
const OD = E.computeStats(rec(["2026-09-17", 5], ["2026-10-15", 5]), {}, D("2026-11-14")); // 2 days late
t("overdue → 'late' message with count, never negative", () => {
  const c = E.countdownFor(OD, D("2026-11-14")); assert.equal(c.kind, "late"); assert.equal(c.n, 2);
});
t("overdue on the due day → 'due'; future dates while overdue → 'due'", () => {
  const due = E.computeStats(rec(["2026-09-17", 5], ["2026-10-15", 5]), {}, D("2026-11-12"));
  assert.equal(E.countdownFor(due, D("2026-11-12")).kind, "due");
  assert.equal(E.countdownFor(OD, D("2026-11-20")).kind, "due");
});
t("overdue does NOT create an implicit period record", () => {
  assert.equal(OD.records.length, 2); assert.equal(E.contextFor(OD, D("2026-11-14")).logged, false);
  assert.equal(E.contextFor(OD, D("2026-11-14")).phase, "luteal");
});
t("very stale log → 'stale' prompt", () => {
  const st = E.computeStats(rec(["2026-05-01", 5], ["2026-05-29", 5]), {}, D("2026-11-14"));
  assert.equal(E.countdownFor(st, D("2026-11-14")).kind, "stale");
});
t("no records → none", () => { assert.equal(E.countdownFor(E.computeStats([], {}, NOW), NOW).kind, "none"); });
t("dates before first record project backwards without throwing", () => {
  const c = E.contextFor(S, D("2026-08-30")); assert.ok(c.day >= 1 && c.day <= 28); assert.equal(c.projected, true);
});
t("snapshot keeps legacy shape {day, phase(Capitalised), avgLen}", () => {
  const snap = E.buildSnapshot(rec(["2026-10-15", 5]), {}, D("2026-10-16"));
  assert.deepEqual(Object.keys(snap).sort(), ["avgLen", "day", "phase"]); assert.equal(snap.phase, "Menstrual"); assert.equal(snap.day, 2);
  assert.equal(E.buildSnapshot([], {}, NOW), null);
});
t("predicted period days exclude logged days and start at predicted next", () => {
  const p = E.predictedPeriodDays(S); assert.ok(p.has("2026-11-12")); assert.ok(!p.has("2026-10-15")); assert.ok(p.has("2026-12-10"));
});

console.log("hormones");
t("curves peak where expected and scale with cycle length", () => {
  for (const L of [24, 28, 35]) {
    const ov = E.ovulationDayFor(L, 5), arr = Array.from({ length: L }, (_, i) => E.hormonesAt(i + 1, L, ov));
    const argmax = (k) => arr.map((h) => h[k]).indexOf(Math.max(...arr.map((h) => h[k]))) + 1;
    assert.equal(argmax("lh"), ov - 1); assert.ok(Math.abs(argmax("estrogen") - (ov - 1)) <= 1);
    assert.ok(argmax("progesterone") > ov); assert.ok(arr.every((h) => Object.values(h).every((v) => v >= 0 && v <= 1.2)));
  }
});
t("series is continuous across a cycle boundary (no jump > 0.45)", () => {
  const ser = E.hormoneSeries(S, D("2026-09-01"), 120);
  for (let i = 1; i < ser.length; i++) for (const k of ["estrogen", "progesterone", "lh", "fsh"]) assert.ok(Math.abs(ser[i][k] - ser[i - 1][k]) < 0.45, `${k} jump at ${ser[i].iso}`);
});
t("moon fraction in [0,1)", () => { const f = E.moonFraction(NOW); assert.ok(f >= 0 && f < 1); });


console.log("irregular range / normalised fast-path");
t("regular cycles → no range; irregular → range from shortest to longest", () => {
  const reg = E.computeStats(rec(["2026-08-01", 5], ["2026-08-29", 5], ["2026-09-26", 5]), {}, NOW);
  assert.equal(E.predictedRange(reg), null);
  const irr = E.computeStats(rec(["2026-05-01", 5], ["2026-05-22", 5], ["2026-06-26", 5], ["2026-07-20", 5]), {}, NOW);
  const r = E.predictedRange(irr);
  assert.equal(E.toISO(r.periodFrom), E.toISO(E.addDays(D("2026-07-20"), 21)));
  assert.equal(E.toISO(r.periodTo), E.toISO(E.addDays(D("2026-07-20"), 35)));
});
t("normalized fast-path gives identical stats", () => {
  const raw = rec(["2026-08-01", 5], ["2026-08-29", 4], ["2026-09-28", 6]);
  const a = E.computeStats(raw, {}, NOW), b = E.computeStats(E.normalizeCycles(raw), {}, NOW, { normalized: true });
  assert.equal(a.avgCycleLen, b.avgCycleLen); assert.equal(a.avgPeriodLen, b.avgPeriodLen);
});

console.log("symptom / mood logs");
t("normalizeLogs drops junk, unknown ids, empty days; clamps note", () => {
  const n = Logs.normalizeLogs({ "2026-11-01": { symptoms: ["cramps", "bogus", "cramps"], mood: "calm", note: "x".repeat(400) }, "bad": { symptoms: ["cramps"] }, "2026-11-02": { symptoms: [], mood: "nope", note: "  " } });
  assert.deepEqual(Object.keys(n), ["2026-11-01"]); assert.deepEqual(n["2026-11-01"].symptoms, ["cramps"]); assert.equal(n["2026-11-01"].note.length, 280);
});
t("withDayLog adds, updates, and removes (empty) without mutating input", () => {
  const a = {}; const b = Logs.withDayLog(a, "2026-11-01", { symptoms: ["cramps"], mood: null, note: "" }, 5);
  assert.deepEqual(a, {}); assert.equal(b["2026-11-01"].updatedAt, 5);
  const c = Logs.withDayLog(b, "2026-11-01", { symptoms: [], mood: null, note: "" }); assert.deepEqual(c, {});
});
t("logs never touch period records (separate shape/key)", () => { assert.equal(Object.values(Logs.normalizeLogs({ "2026-11-01": { symptoms: ["cramps"] } }))[0].days, undefined); });
t("summarizeLogs ranks by frequency inside the window only", () => {
  const l = Logs.normalizeLogs({ "2026-11-01": { symptoms: ["cramps", "fatigue"], mood: "low" }, "2026-11-02": { symptoms: ["cramps"], mood: "low" }, "2026-01-01": { symptoms: ["acne"] } });
  const s = Logs.summarizeLogs(l, "2026-10-01", "2026-11-14");
  assert.equal(s.days, 2); assert.equal(s.symptoms[0].id, "cramps"); assert.equal(s.symptoms[0].count, 2); assert.ok(!s.symptoms.find((x) => x.id === "acne")); assert.equal(s.moods[0].count, 2);
});

console.log("reminders");
const RS = (today) => E.computeStats(rec(["2026-09-17", 5], ["2026-10-15", 5]), {}, D(today)); // next 2026-11-12, fertile 11-… 
t("off by default: nothing returned", () => { assert.deepEqual(Rem.getReminders(RS("2026-11-10"), {}, {}), []); });
t("period reminder only within 2 days, with correct wording", () => {
  const on = { period: true };
  assert.equal(Rem.getReminders(RS("2026-11-09"), on).length, 0);
  assert.equal(Rem.getReminders(RS("2026-11-10"), on)[0].text, "Your period is likely in 2 days.");
  assert.equal(Rem.getReminders(RS("2026-11-11"), on)[0].text, "Your period is likely in 1 day.");
  assert.equal(Rem.getReminders(RS("2026-11-12"), on)[0].text, "Your period is likely to start today.");
});
t("no period reminder once overdue or when log is stale", () => {
  assert.equal(Rem.getReminders(RS("2026-11-14"), { period: true }).length, 0);
});
t("fertile reminder fires the day before and the day of the window start", () => {
  const s = RS("2026-10-22"); // fertile start = 2026-10-23
  assert.equal(Rem.getReminders(s, { fertile: true })[0].text, "Your estimated fertile window starts tomorrow.");
  assert.equal(Rem.getReminders(RS("2026-10-23"), { fertile: true })[0].text, "Your estimated fertile window starts today.");
  assert.equal(Rem.getReminders(RS("2026-10-20"), { fertile: true }).length, 0);
});
t("a reminder already shown today is suppressed", () => {
  assert.equal(Rem.getReminders(RS("2026-11-10"), { period: true }, { period: "2026-11-10" }).length, 0);
  assert.equal(Rem.getReminders(RS("2026-11-11"), { period: true }, { period: "2026-11-10" }).length, 1);
});

console.log("doctor report");
t("report lists periods + stats, escapes HTML, omits notes and predictions", () => {
  const s = E.computeStats(rec(["2026-08-06", 5], ["2026-09-03", 4], ["2026-10-01", 5]), {}, NOW);
  const logs = Logs.normalizeLogs({ "2026-11-10": { symptoms: ["cramps"], mood: "low", note: "SECRET NOTE" } });
  const h = Rep.buildReportHtml({ stats: s, logs, name: "<b>Ana</b>", now: NOW });
  assert.ok(h.includes("&lt;b&gt;Ana&lt;/b&gt;")); assert.ok(!h.includes("<b>Ana</b>")); assert.ok(!h.includes("SECRET NOTE"));
  assert.ok(h.includes("28 days")); assert.ok(h.includes("Cramps (1)")); assert.equal((h.match(/<tr><td>/g) || []).length, 3);
  assert.ok(!/predicted|next period/i.test(h.replace("Predictions are not included", "")));
});
t("report caps at 12 periods so it stays one page", () => {
  const many = Array.from({ length: 20 }, (_, i) => ["2025-" + String((i % 9) + 1).padStart(2, "0") + "-0" + ((i % 8) + 1), 5]);
  const s = E.computeStats(Array.from({ length: 20 }, (_, i) => ({ id: "x" + i, date: E.toISO(E.addDays(D("2025-01-01"), i * 28)), length: 5 })), {}, NOW);
  assert.equal((Rep.buildReportHtml({ stats: s, now: NOW }).match(/<tr><td>/g) || []).length, 12);
});


console.log("flow / energy / regularity");
t("flow and energy are kept; unknown values dropped; old entries still load", () => {
  const n = Logs.normalizeLogs({ "2026-11-01": { symptoms: [], flow: "heavy", energy: "low" }, "2026-11-02": { symptoms: ["cramps"], flow: "gushing", energy: "max" }, "2026-11-03": { symptoms: [], flow: "bogus" } });
  assert.equal(n["2026-11-01"].flow, "heavy"); assert.equal(n["2026-11-01"].energy, "low");
  assert.equal(n["2026-11-02"].flow, null); assert.equal(n["2026-11-02"].energy, null);
  assert.equal(n["2026-11-03"], undefined);
});
t("describeLog mentions flow and energy; summarizeLogs counts them", () => {
  const l = Logs.normalizeLogs({ "2026-11-01": { flow: "light", energy: "high", symptoms: ["cramps"] }, "2026-11-02": { flow: "light", symptoms: [] } });
  assert.equal(Logs.describeLog(l["2026-11-01"]), "Light flow · Cramps · High energy");
  const s = Logs.summarizeLogs(l, "2026-11-01", "2026-11-30");
  assert.equal(s.flows[0].id, "light"); assert.equal(s.flows[0].count, 2); assert.equal(s.energies[0].id, "high");
});
t("regularityInsight: unknown / regular / fairly / varies", () => {
  const mk = (arr) => ({ previousCycleLengths: arr });
  assert.equal(E.regularityInsight(mk([28])).level, "unknown");
  assert.equal(E.regularityInsight(mk([28, 29, 28])).level, "regular");
  assert.equal(E.regularityInsight(mk([26, 30, 32])).level, "fairly");
  assert.equal(E.regularityInsight(mk([24, 35, 28])).level, "varies");
});

console.log(`\n${pass} passed${process.exitCode ? " — WITH FAILURES" : ""}`);
