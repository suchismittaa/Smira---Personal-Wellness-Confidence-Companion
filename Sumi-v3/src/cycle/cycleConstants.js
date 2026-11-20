/* Shared constants for the Cycle Tracker (kept out of component files so
   React fast-refresh keeps working). */

export const KEY_CYCLES = "menstrual_cycles"; // period records (existing key)
export const KEY_LOGS = "cycle_logs";         // per-day symptoms & mood, separate from periods
export const KEY_META = "cycle_meta";         // small UI state: first-run hint, reminders already shown

export const CYCLE_OPTIONS = Array.from({ length: 25 }, (_, i) => 21 + i); // 21–45 days
export const PERIOD_OPTIONS = Array.from({ length: 10 }, (_, i) => 1 + i); // 1–10 days

export const SYMPTOMS = [
  ["cramps", "Cramps"], ["headache", "Headache"], ["bloating", "Bloating"], ["tender", "Tender breasts"],
  ["backache", "Back ache"], ["fatigue", "Tired"], ["nausea", "Nausea"], ["acne", "Breakouts"],
  ["cravings", "Cravings"], ["spotting", "Spotting"], ["sleep", "Poor sleep"],
];
export const MOODS = [
  ["calm", "Calm"], ["happy", "Happy"], ["energetic", "Energetic"], ["sensitive", "Sensitive"],
  ["anxious", "Anxious"], ["irritable", "Irritable"], ["low", "Low"],
];
export const NOTE_MAX = 280;
export const FLOWS = [["light", "Light"], ["medium", "Medium"], ["heavy", "Heavy"]];
export const ENERGY = [["low", "Low"], ["medium", "Okay"], ["high", "High"]];
