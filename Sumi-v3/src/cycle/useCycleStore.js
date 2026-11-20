import { useCallback, useEffect, useState } from "react";
import { KEY_CYCLES, KEY_LOGS, KEY_META } from "./cycleConstants.js";
import { needsMigration, normalizeCycles } from "./cycleEngine.js";
import { normalizeLogs, withDayLog } from "./cycleLogs.js";

const OWN_KEYS = [KEY_CYCLES, KEY_LOGS, KEY_META];

/* Owns everything the tracker persists. All writes go through `store.set()`
   (Sumi's LS), which is what the app's Firestore push-sync listens to, so
   account isolation and sync are unchanged. Records are normalised ONCE here,
   on load; later edits keep them normalised. */
export function useCycleStore(store) {
  const [records, setRecords] = useState(() => {
    const raw = store.get(KEY_CYCLES, []);
    const norm = normalizeCycles(raw);
    if (needsMigration(raw)) store.set(KEY_CYCLES, norm); // lossless: legacy `date`/`length` are kept
    return norm;
  });
  const [logs, setLogs] = useState(() => normalizeLogs(store.get(KEY_LOGS, {})));
  const [meta, setMeta] = useState(() => {
    const m = store.get(KEY_META, {});
    return m && typeof m === "object" && !Array.isArray(m) ? m : {};
  });
  const [syncIssue, setSyncIssue] = useState(false);

  /* A failed cloud push never loses data (it is already in localStorage); we
     only say so, and push again when the connection comes back. */
  useEffect(() => {
    const mine = (e) => e.detail?.keys?.some((k) => OWN_KEYS.includes(k));
    const bad = (e) => { if (mine(e)) setSyncIssue(true); };
    const ok = (e) => { if (mine(e)) setSyncIssue(false); };
    const online = () => OWN_KEYS.forEach((k) => { const v = store.get(k, null); if (v !== null) store.set(k, v); });
    window.addEventListener("sumi:sync-error", bad);
    window.addEventListener("sumi:sync-ok", ok);
    window.addEventListener("online", online);
    return () => { window.removeEventListener("sumi:sync-error", bad); window.removeEventListener("sumi:sync-ok", ok); window.removeEventListener("online", online); };
  }, [store]);

  const saveRecords = useCallback((next) => { setRecords(next); store.set(KEY_CYCLES, next); }, [store]);
  const saveDayLog = useCallback((iso, entry) => {
    setLogs((cur) => { const next = withDayLog(cur, iso, entry); store.set(KEY_LOGS, next); return next; });
  }, [store]);
  const patchMeta = useCallback((patch) => {
    setMeta((cur) => { const next = { ...cur, ...patch }; store.set(KEY_META, next); return next; });
  }, [store]);

  return { records, saveRecords, logs, saveDayLog, meta, patchMeta, syncIssue };
}
