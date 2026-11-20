/* ─────────────────────────────────────────────────────────────────────────
   Sumi cycle engine — pure functions, no React, no storage.

   Record shape stored under `menstrual_cycles` (backward compatible):
     {
       id, date,            // `date` = first bleeding day, ISO yyyy-mm-dd (legacy field, kept)
       endDate,             // last bleeding day
       days: [iso, ...],    // USER-CONFIRMED bleeding days (may be non-consecutive)
       length,              // number of bleeding days (legacy field, kept; absent if unknown)
       durationUnknown?,    // legacy record that never stored a duration
       createdAt, updatedAt // epoch ms
     }
   Old readers only look at `date` and `length`, so they keep working.
   Predictions are never stored here — only things the user confirmed.
   ───────────────────────────────────────────────────────────────────────── */

/**
 * @typedef {Object} PeriodRecord  One logged period (what is stored under `menstrual_cycles`).
 * @property {string}   id               Stable id, e.g. "c_1762000000000_ab12cd".
 * @property {string}   date             First bleeding day, "YYYY-MM-DD" (legacy field name, kept).
 * @property {string}   endDate          Last bleeding day.
 * @property {string[]} days             Sorted, user-confirmed bleeding days (may be non-consecutive).
 * @property {number}   [length]         Count of bleeding days; absent when `durationUnknown`.
 * @property {boolean}  [durationUnknown] Legacy record that never stored a duration.
 * @property {number}   createdAt        Epoch ms.
 * @property {number}   updatedAt        Epoch ms.
 *
 * @typedef {Object} CycleContext  Where a calendar date sits in its cycle (see contextFor).
 * @property {number} day        Day of cycle (can exceed cycleLen when late).
 * @property {number} shownDay   `day` capped at cycleLen, used for the wheel.
 * @property {number} cycleLen
 * @property {number} periodLen
 * @property {number} ovDay
 * @property {"menstrual"|"follicular"|"ovulation"|"luteal"} phase
 * @property {boolean} late      Past a missed prediction (never turned into a record).
 * @property {boolean} projected Estimated beyond recorded history.
 * @property {boolean} logged    The date is a confirmed bleeding day.
 * @property {Date} nextStart    Actual next start if recorded, otherwise predicted.
 */

export const MAX_PERIOD_DAYS = 14;
export const GROUP_GAP = 3; // bleeding days ≤3 days apart belong to the same period
export const MIN_CYCLE = 15;
export const MAX_CYCLE = 60;
export const DEFAULT_CYCLE_LEN = 28;
export const DEFAULT_PERIOD_LEN = 5;
export const STALE_LATE_DAYS = 60;

/* ── date helpers (local calendar days, DST-safe) ───────────────────── */
const pad = (n) => String(n).padStart(2, "0");
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromISO = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(d.getTime()) || d.getMonth() !== +m[2] - 1 ? null : d;
};
export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const diffDays = (a, b) =>
  Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
export const sameDay = (a, b) => diffDays(a, b) === 0;
export const addDaysISO = (iso, n) => toISO(addDays(fromISO(iso), n));

/* Accepts "2026-10-12", a full ISO timestamp, or anything Date can parse. */
const parseAnyDate = (v) => {
  if (v == null || v === "") return null;
  const direct = fromISO(v);
  if (direct) return direct;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : startOfDay(d);
};

export const genCycleId = () => `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/* ── migration / normalisation ──────────────────────────────────────── */
const idTimestamp = (id) => {
  const m = /^c_(\d{10,})_/.exec(String(id || ""));
  return m ? +m[1] : null;
};

export function normalizeRecord(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object") return null;
  const startFromField = parseAnyDate(raw.date ?? raw.startDate);
  let days = [];
  if (Array.isArray(raw.days)) {
    days = [...new Set(raw.days.map((x) => fromISO(x)).filter(Boolean).map(toISO))].sort();
  }
  let durationUnknown = false;
  if (!days.length) {
    if (!startFromField) return null;
    const len = Math.round(Number(raw.length));
    if (Number.isFinite(len) && len > 0) {
      const n = Math.min(len, MAX_PERIOD_DAYS);
      days = Array.from({ length: n }, (_, i) => toISO(addDays(startFromField, i)));
    } else {
      days = [toISO(startFromField)];
      durationUnknown = true;
    }
  } else if (raw.durationUnknown && days.length === 1) {
    durationUnknown = true;
  }
  const created = Number.isFinite(raw.createdAt) ? raw.createdAt : idTimestamp(raw.id) ?? now;
  const out = {
    ...raw,
    id: raw.id || genCycleId(),
    date: days[0],
    endDate: days[days.length - 1],
    days,
    createdAt: created,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : created,
  };
  delete out.startDate;
  if (durationUnknown) {
    out.durationUnknown = true;
    delete out.length; // never invent a duration the user did not give
  } else {
    out.length = days.length;
    delete out.durationUnknown;
  }
  return out;
}

export function normalizeCycles(raw, now = Date.now()) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  raw.forEach((r) => {
    const n = normalizeRecord(r, now);
    if (!n) return;
    if (seen.has(n.id)) n.id = genCycleId();
    seen.add(n.id);
    out.push(n);
  });
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/* True when stored data is missing the new fields and should be written back. */
export const needsMigration = (raw) =>
  Array.isArray(raw) &&
  raw.some((r) => !r || !r.id || !Array.isArray(r.days) || !r.endDate || !Number.isFinite(r.createdAt) || !Number.isFinite(r.updatedAt));

/* ── grouping selected bleeding days into periods ───────────────────── */
export function groupDays(isoDays, maxGap = GROUP_GAP) {
  const sorted = [...new Set(isoDays)].filter((x) => fromISO(x)).sort();
  const groups = [];
  sorted.forEach((iso) => {
    const g = groups[groups.length - 1];
    if (g && diffDays(fromISO(g[g.length - 1]), fromISO(iso)) <= maxGap) g.push(iso);
    else groups.push([iso]);
  });
  return groups;
}

const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/* Turns the full set of selected days back into records, keeping the stable
   id / createdAt of an existing record whenever a group overlaps it. Records
   whose days did not change are returned untouched (same updatedAt). */
export function applyEditedDays(existing, selectedIsoDays, now = Date.now()) {
  const recs = normalizeCycles(existing, now);
  const groups = groupDays(selectedIsoDays);
  const pairs = [];
  groups.forEach((g, gi) => {
    const gs = new Set(g);
    recs.forEach((r, ri) => {
      const overlap = r.days.filter((d) => gs.has(d)).length;
      if (overlap > 0) pairs.push({ gi, ri, overlap });
    });
  });
  pairs.sort((a, b) => b.overlap - a.overlap || a.gi - b.gi);
  const gMatch = new Map();
  const rUsed = new Set();
  pairs.forEach((p) => {
    if (gMatch.has(p.gi) || rUsed.has(p.ri)) return;
    gMatch.set(p.gi, p.ri);
    rUsed.add(p.ri);
  });
  const out = groups.map((g, gi) => {
    const ri = gMatch.get(gi);
    if (ri == null) {
      return { id: genCycleId(), date: g[0], endDate: g[g.length - 1], days: g, length: g.length, createdAt: now, updatedAt: now };
    }
    const r = recs[ri];
    if (sameList(r.days, g)) return r;
    const next = { ...r, date: g[0], endDate: g[g.length - 1], days: g, length: g.length, updatedAt: now };
    delete next.durationUnknown;
    return next;
  });
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/* Records that exist before/after an edit, for "N added · M removed" copy. */
export function diffSelection(savedDays, selectedDays) {
  const saved = new Set(savedDays);
  const sel = new Set(selectedDays);
  return {
    added: [...sel].filter((d) => !saved.has(d)),
    removed: [...saved].filter((d) => !sel.has(d)),
  };
}

/* ── validation ─────────────────────────────────────────────────────── */
export function validateSelection(selectedIsoDays, savedIsoDays = [], today = new Date()) {
  const errors = [];
  const warnings = [];
  const t = startOfDay(today);
  const saved = new Set(savedIsoDays);
  const valid = [];
  selectedIsoDays.forEach((iso) => {
    const d = fromISO(iso);
    if (!d) errors.push(`“${iso}” is not a valid date.`);
    else valid.push(iso);
  });
  const newFuture = valid.filter((iso) => diffDays(t, fromISO(iso)) > 0 && !saved.has(iso));
  if (newFuture.length) errors.push("Bleeding days can only be logged up to today.");
  const groups = groupDays(valid);
  groups.forEach((g) => {
    const span = diffDays(fromISO(g[0]), fromISO(g[g.length - 1])) + 1;
    if (span > MAX_PERIOD_DAYS) {
      errors.push(`The period starting ${g[0]} spans ${span} days. A single period can span at most ${MAX_PERIOD_DAYS} days — check the dates.`);
    }
  });
  for (let i = 1; i < groups.length; i++) {
    const gap = diffDays(fromISO(groups[i - 1][0]), fromISO(groups[i][0]));
    if (gap < MIN_CYCLE) warnings.push(`Two periods start only ${gap} days apart (${groups[i - 1][0]} and ${groups[i][0]}). That’s unusually short.`);
  }
  return { ok: errors.length === 0, errors, warnings };
}

/* ── statistics ─────────────────────────────────────────────────────── */
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const RECENT = 6;

export function phaseOfDay(day, cycleLen, periodLen) {
  const ov = ovulationDayFor(cycleLen, periodLen);
  if (day <= Math.min(periodLen, cycleLen)) return "menstrual";
  if (day < ov - 1) return "follicular";
  if (day <= ov + 1) return "ovulation";
  return "luteal";
}

/* Cycle day on which ovulation is estimated: ~14 days before the next
   period, but never inside the period or so late it leaves no luteal phase. */
export function ovulationDayFor(cycleLen, periodLen) {
  const raw = cycleLen - 14;
  return Math.min(cycleLen - 2, Math.max(periodLen + 3, Math.min(raw, cycleLen - 3)));
}

/* `opts.normalized` skips re-normalising records that already came through
   normalizeCycles() (the tracker normalises once, on load). */
export function computeStats(rawRecords, prefs = {}, now = new Date(), opts = {}) {
  const today = startOfDay(now);
  const prefCycle = clampInt(prefs.cycleLength, 21, 45, DEFAULT_CYCLE_LEN);
  const prefPeriod = clampInt(prefs.periodLength, 1, 10, DEFAULT_PERIOD_LEN);
  const records = opts.normalized ? rawRecords : normalizeCycles(rawRecords);
  const gaps = records.slice(1).map((r, i) => ({
    fromId: records[i].id,
    days: diffDays(fromISO(records[i].date), fromISO(r.date)),
  }));
  const valid = gaps.filter((g) => g.days >= MIN_CYCLE && g.days <= MAX_CYCLE);
  const used = valid.slice(-RECENT).map((g) => g.days);
  const avgCycleLen = used.length ? Math.round(mean(used)) : prefCycle;
  const basis = used.length >= 2 ? "history" : used.length === 1 ? "partial" : "preference";
  const known = records.filter((r) => !r.durationUnknown && Number.isFinite(r.length)).slice(-RECENT).map((r) => r.length);
  const avgPeriodLen = known.length ? Math.round(mean(known)) : prefPeriod;
  const minLen = used.length ? Math.min(...used) : null;
  const maxLen = used.length ? Math.max(...used) : null;
  const irregular = used.length >= 2 && maxLen - minLen > 7;

  const last = records.length ? records[records.length - 1] : null;
  const lastStart = last ? fromISO(last.date) : null;
  const predictedNext = lastStart ? addDays(lastStart, avgCycleLen) : null;
  const overdue = !!predictedNext && diffDays(predictedNext, today) >= 0;
  const lateDays = overdue ? diffDays(predictedNext, today) : 0;
  const ovDay = ovulationDayFor(avgCycleLen, avgPeriodLen);
  const dayset = new Set();
  records.forEach((r) => r.days.forEach((d) => dayset.add(d)));

  return {
    records, gaps, usedGaps: used, previousCycleLengths: valid.map((g) => g.days),
    avgCycleLen, avgPeriodLen, minLen, maxLen, irregular, basis,
    prefCycle, prefPeriod,
    lastStart, predictedNext, overdue, lateDays,
    stale: overdue && lateDays > STALE_LATE_DAYS,
    ovDay,
    ovulationDate: lastStart ? addDays(lastStart, ovDay - 1) : null,
    fertileStartDate: lastStart ? addDays(lastStart, ovDay - 5 - 1) : null,
    fertileEndDate: lastStart ? addDays(lastStart, ovDay + 1 - 1) : null,
    loggedDays: dayset,
    today,
  };
}

function clampInt(v, lo, hi, fb) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fb;
}

/* ── per-date cycle context ─────────────────────────────────────────── */
/* For any calendar date: which cycle is it in, what day, which phase, and
   when does the next period start. Dates inside recorded history use the real
   cycle boundaries; dates beyond are projected from the average, and dates
   after a MISSED prediction are flagged `late` rather than assumed to be a
   new period (predictions never become records on their own). */
export function contextFor(stats, date) {
  const { records, avgCycleLen: L, avgPeriodLen: P, today } = stats;
  const d = startOfDay(date);
  if (!records.length) return null;
  const iso = toISO(d);
  const logged = stats.loggedDays.has(iso);

  let idx = -1;
  records.forEach((r, i) => { if (diffDays(fromISO(r.date), d) >= 0) idx = i; });

  let start, len, periodLen, nextStart, day, projected = false, late = false, recorded = false;

  if (idx === -1) {
    const first = fromISO(records[0].date);
    const k = Math.ceil(diffDays(d, first) / L);
    start = addDays(first, -k * L);
    len = L; periodLen = P; nextStart = addDays(start, L); projected = true;
    day = diffDays(start, d) + 1;
  } else {
    const rec = records[idx];
    const next = records[idx + 1];
    start = fromISO(rec.date);
    periodLen = rec.durationUnknown ? P : Math.max(1, rec.length);
    day = diffDays(start, d) + 1;
    if (next) {
      const g = diffDays(start, fromISO(next.date));
      len = g >= 10 && g <= 90 ? g : L;
      nextStart = fromISO(next.date);
      recorded = true;
    } else {
      len = L;
      const pred1 = addDays(start, L);
      if (diffDays(pred1, d) < 0) { nextStart = pred1; recorded = true; }
      else if (stats.overdue) { nextStart = pred1; late = true; }
      else {
        const k = Math.floor(diffDays(start, d) / L);
        start = addDays(start, k * L);
        day = diffDays(start, d) + 1;
        nextStart = addDays(start, L); projected = true;
      }
    }
  }
  const cappedDay = Math.min(day, len);
  const ovDay = ovulationDayFor(len, periodLen);
  let phase = late ? "luteal" : phaseOfDay(cappedDay, len, periodLen);
  if (logged) phase = "menstrual";
  return {
    date: d, iso, day, shownDay: cappedDay, cycleLen: len, periodLen, ovDay,
    phase, late, projected, recorded, logged, cycleStart: start, nextStart,
  };
}

/* What the wheel's centre says for a given date. Never negative. */
export function countdownFor(stats, date) {
  if (!stats.records.length) return { kind: "none" };
  const ctx = contextFor(stats, date);
  const d = startOfDay(date);
  if (ctx.logged) return { kind: "period", day: ctx.day, ctx };
  if (stats.stale && diffDays(stats.predictedNext, d) >= 0) return { kind: "stale", ctx };
  if (ctx.late) {
    if (diffDays(stats.today, d) > 0) return { kind: "due", ctx };
    const n = diffDays(stats.predictedNext, d);
    return n <= 0 ? { kind: "due", ctx } : { kind: "late", n, ctx };
  }
  const n = Math.max(1, diffDays(d, ctx.nextStart));
  return { kind: "in", n, ctx };
}

/* When cycles vary a lot a single date over-promises, so return a range:
   next period (earliest–latest from the shortest/longest recent cycle) and the
   matching ovulation range. null when cycles are regular or data is thin. */
export function predictedRange(stats) {
  if (!stats.irregular || !stats.lastStart) return null;
  return {
    periodFrom: addDays(stats.lastStart, stats.minLen),
    periodTo: addDays(stats.lastStart, stats.maxLen),
    ovulationFrom: addDays(stats.lastStart, stats.minLen - 14),
    ovulationTo: addDays(stats.lastStart, stats.maxLen - 14),
  };
}

/* Predicted bleeding days (future cycles) for the editor calendar. */
export function predictedPeriodDays(stats, monthsAhead = 8) {
  const out = new Set();
  if (!stats.lastStart) return out;
  const horizon = addDays(stats.today, monthsAhead * 31);
  let s = stats.predictedNext;
  for (let i = 0; i < 24 && diffDays(s, horizon) > 0; i++) {
    for (let k = 0; k < stats.avgPeriodLen; k++) {
      const iso = toISO(addDays(s, k));
      if (!stats.loggedDays.has(iso)) out.add(iso);
    }
    s = addDays(s, stats.avgCycleLen);
  }
  return out;
}

/* Skin-scan ↔ phase correlation (kept from the previous tracker). */
export function phaseCorrelation(stats, scans) {
  if (!stats.records.length || !scans?.length) return null;
  const buckets = { menstrual: [], follicular: [], ovulation: [], luteal: [] };
  const firstStart = fromISO(stats.records[0].date);
  scans.forEach((s) => {
    if (!s.ts || s.overallScore == null) return;
    const d = startOfDay(new Date(s.ts));
    if (diffDays(firstStart, d) < 0 || diffDays(stats.today, d) > 0) return;
    const ctx = contextFor(stats, d);
    if (ctx && !ctx.late) buckets[ctx.phase].push(s.overallScore);
  });
  const out = {};
  Object.entries(buckets).forEach(([k, v]) => { if (v.length) out[k] = Math.round(mean(v)); });
  return Object.keys(out).length >= 2 ? out : null;
}

/* Used by getCycleSnapshot() in App.jsx (wellness suggestions etc.). */
export function buildSnapshot(rawRecords, prefs = {}, now = new Date()) {
  const stats = computeStats(rawRecords, prefs, now);
  if (!stats.records.length) return null;
  const ctx = contextFor(stats, stats.today);
  const label = ctx.phase.charAt(0).toUpperCase() + ctx.phase.slice(1);
  return { day: ctx.day, phase: label, avgLen: stats.avgCycleLen };
}

/* ── illustrative hormone curves (NOT measurements) ──────────────────── */
const gauss = (day, mu, w, len) => {
  let dd = Math.abs(day - mu);
  dd = Math.min(dd, Math.abs(day - mu - len), Math.abs(day - mu + len));
  return Math.exp(-(dd * dd) / (2 * w * w));
};

export function hormonesAt(day, len, ovDay) {
  const s = len / 28;
  const peak = ovDay - 1;
  const lutealMid = ovDay + (len - ovDay) * 0.5;
  const lutealW = Math.max(1.8, (len - ovDay) / 3.4);
  const e = 0.13 + 0.7 * gauss(day, peak, Math.max(1.6, 2.3 * s), len) + 0.34 * gauss(day, lutealMid, lutealW, len);
  const p = 0.09 + 0.84 * gauss(day, lutealMid, lutealW * 0.95, len);
  const lh = 0.1 + 0.9 * gauss(day, peak, 1.05, len);
  const fsh = 0.13 + 0.36 * gauss(day, 3, Math.max(1.8, 2.2 * s), len) + 0.34 * gauss(day, peak, 1.2, len);
  return { estrogen: e, progesterone: p, lh, fsh };
}

export function hormoneSeries(stats, startDate, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const date = addDays(startDate, i);
    const ctx = contextFor(stats, date);
    const h = ctx ? hormonesAt(ctx.shownDay, ctx.cycleLen, ctx.ovDay) : null;
    out.push({ i, iso: toISO(date), ...(h || {}) });
  }
  return out;
}

/* ── real lunar phase, used for the editor's ordinary-day glyphs ───────── */
export function moonFraction(date) {
  // Reference new moon: 2000-01-06 18:14 UTC; synodic month 29.530588853 days.
  const t = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12) / 86400000;
  const ref = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
  const f = ((t - ref) / 29.530588853) % 1;
  return f < 0 ? f + 1 : f;
}

/* ── regularity insight (plain-language, never diagnostic) ───────────── */
export function regularityInsight(stats) {
  const g = stats.previousCycleLengths || [];
  if (g.length < 2) return { level: "unknown", label: "Not enough data yet", detail: "Log at least three periods to see how regular your cycles are." };
  const recent = g.slice(-RECENT);
  const spread = Math.max(...recent) - Math.min(...recent);
  if (spread <= 3) return { level: "regular", spread, label: "Very regular", detail: `Your last ${recent.length} cycles varied by ${spread} ${spread === 1 ? "day" : "days"} at most.` };
  if (spread <= 7) return { level: "fairly", spread, label: "Fairly regular", detail: `Your last ${recent.length} cycles varied by up to ${spread} days, which is common.` };
  return { level: "varies", spread, label: "Varies a lot", detail: `Your last ${recent.length} cycles ranged ${Math.min(...recent)}–${Math.max(...recent)} days, so dates are a rough guide. If this worries you, a doctor can help.` };
}
