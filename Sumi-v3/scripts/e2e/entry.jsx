import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import MenstrualTracker from "../../src/cycle/MenstrualTracker.jsx";

/* Same contract as Sumi's LS (smira4_ prefix, set() notifies listeners) */
const LS = {
  _l: new Set(),
  get: (k, fb = null) => { try { const v = localStorage.getItem("smira4_" + k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set: (k, v) => { localStorage.setItem("smira4_" + k, JSON.stringify(v)); window.__lsSets = (window.__lsSets || []).concat(k); LS._l.forEach((f) => f(k, v)); },
  subscribe: (f) => { LS._l.add(f); return () => LS._l.delete(f); },
};
window.__LS = LS;
function Host() {
  const [user, setUser] = useState(() => LS.get("smira_user", { name: "Test", cycleLength: "28" }));
  return (
    <div>
      <div style={{ height: 62, background: "rgba(220,232,203,.92)" }} id="sumi-topbar">Sumi top bar</div>
      <MenstrualTracker scans={window.__scans || []} user={user} store={LS}
        onUpdateProfile={(u) => { setUser(u); LS.set("smira_user", u); }} />
    </div>
  );
}
createRoot(document.getElementById("root")).render(<Host />);
