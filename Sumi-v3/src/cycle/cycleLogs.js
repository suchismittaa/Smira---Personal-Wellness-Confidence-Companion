/* Per-day symptom / mood log. Stored under its own key (`cycle_logs`) as
   { "2026-11-14": { symptoms:[id], mood:id|null, note:"", updatedAt } } so it
   can never disturb period records. */
import { ENERGY, FLOWS, MOODS, NOTE_MAX, SYMPTOMS } from "./cycleConstants.js";
import { fromISO } from "./cycleEngine.js";

const SYM_IDS = new Set(SYMPTOMS.map((s) => s[0]));
const MOOD_IDS = new Set(MOODS.map((m) => m[0]));
const FLOW_IDS = new Set(FLOWS.map((f) => f[0]));
const ENERGY_IDS = new Set(ENERGY.map((e) => e[0]));
const labelOf = (list, id) => (list.find((x) => x[0] === id) || [id, id])[1];

export function normalizeLogs(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  Object.entries(raw).forEach(([iso, v]) => {
    if (!fromISO(iso) || !v || typeof v !== "object") return;
    const symptoms = Array.isArray(v.symptoms) ? [...new Set(v.symptoms.filter((s) => SYM_IDS.has(s)))] : [];
    const mood = MOOD_IDS.has(v.mood) ? v.mood : null;
    const note = typeof v.note === "string" ? v.note.slice(0, NOTE_MAX).trim() : "";
    const flow = FLOW_IDS.has(v.flow) ? v.flow : null;
    const energy = ENERGY_IDS.has(v.energy) ? v.energy : null;
    if (!symptoms.length && !mood && !note && !flow && !energy) return;
    out[iso] = { symptoms, mood, energy, flow, note, updatedAt: Number.isFinite(v.updatedAt) ? v.updatedAt : Date.now() };
  });
  return out;
}

/* Returns a NEW object; an empty entry removes the day. */
export function withDayLog(logs, iso, entry, now = Date.now()) {
  const next = { ...logs };
  const clean = normalizeLogs({ [iso]: { ...entry, updatedAt: now } })[iso];
  if (clean) next[iso] = clean; else delete next[iso];
  return next;
}

export function describeLog(entry) {
  if (!entry) return "";
  const parts = [];
  if (entry.flow) parts.push(`${labelOf(FLOWS, entry.flow)} flow`);
  entry.symptoms.forEach((s) => parts.push(labelOf(SYMPTOMS, s)));
  if (entry.mood) parts.push(labelOf(MOODS, entry.mood));
  if (entry.energy) parts.push(`${labelOf(ENERGY, entry.energy)} energy`);
  return parts.join(" · ");
}

/* Counts of symptoms / moods between two ISO dates (inclusive). */
export function summarizeLogs(logs, fromIso, toIso) {
  const sym = {}, mood = {}, flow = {}, energy = {};
  let days = 0;
  Object.entries(logs).forEach(([iso, e]) => {
    if (iso < fromIso || iso > toIso) return;
    days++;
    e.symptoms.forEach((s) => { sym[s] = (sym[s] || 0) + 1; });
    if (e.mood) mood[e.mood] = (mood[e.mood] || 0) + 1;
    if (e.flow) flow[e.flow] = (flow[e.flow] || 0) + 1;
    if (e.energy) energy[e.energy] = (energy[e.energy] || 0) + 1;
  });
  const rank = (o, list) => Object.entries(o).map(([id, count]) => ({ id, label: labelOf(list, id), count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { days, symptoms: rank(sym, SYMPTOMS), moods: rank(mood, MOODS), flows: rank(flow, FLOWS), energies: rank(energy, ENERGY) };
}
