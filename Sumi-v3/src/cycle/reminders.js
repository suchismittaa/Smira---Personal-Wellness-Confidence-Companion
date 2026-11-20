import { diffDays, toISO } from "./cycleEngine.js";

/* Opt-in, in-app reminders. They are shown when Sumi is opened — there is no
   background push service, so nothing is sent while the app is closed.
   `prefs` = { period:boolean, fertile:boolean }. `seen` = { period:iso, fertile:iso }
   (the day each was last shown), so each appears at most once a day. */
export function getReminders(stats, prefs = {}, seen = {}, today = stats.today) {
  const out = [];
  if (!stats.lastStart || stats.stale) return out;
  const todayISO = toISO(today);

  if (prefs.period && seen.period !== todayISO && stats.lateDays === 0) {
    const n = diffDays(today, stats.predictedNext);
    if (n >= 0 && n <= 2) {
      out.push({
        id: "period",
        text: n === 0 ? "Your period is likely to start today." : `Your period is likely in ${n} ${n === 1 ? "day" : "days"}.`,
      });
    }
  }
  if (prefs.fertile && seen.fertile !== todayISO && stats.lateDays === 0) {
    const n = diffDays(today, stats.fertileStartDate);
    if (n === 0 || n === 1) {
      out.push({
        id: "fertile",
        text: n === 0 ? "Your estimated fertile window starts today." : "Your estimated fertile window starts tomorrow.",
      });
    }
  }
  return out;
}
