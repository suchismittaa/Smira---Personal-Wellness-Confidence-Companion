import { useEffect, useRef } from "react";

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* Light haptic tap where supported (mostly Android). Silent no-op elsewhere. */
export function haptic(ms = 12) {
  try { if (!prefersReducedMotion()) navigator.vibrate?.(ms); } catch { /* unsupported */ }
}

/* Very soft two-note chime, only ever called when the user turned sound on. */
export function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const t = ctx.currentTime;
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.11);
      g.gain.exponentialRampToValueAtTime(0.05, t + i * 0.11 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.11 + 0.28);
      o.connect(g); g.connect(ctx.destination);
      o.start(t + i * 0.11); o.stop(t + i * 0.11 + 0.3);
    });
    setTimeout(() => ctx.close?.(), 900);
  } catch { /* audio blocked */ }
}

/* Keeps the newest version of a callback without re-subscribing listeners. */
export function useLatest(value) {
  const ref = useRef(value);
  useEffect(() => { ref.current = value; });
  return ref;
}

/* Focus trap for modal layers. Layers stack: only the top-most one handles Tab,
   and focus returns to whatever had it before the layer opened. */
const stack = [];
const FOCUSABLE = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
export function useFocusTrap(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const previous = document.activeElement;
    stack.push(el);
    const onKey = (e) => {
      if (e.key !== "Tab" || stack[stack.length - 1] !== el) return;
      const items = [...el.querySelectorAll(FOCUSABLE)].filter((n) => n.getClientRects().length > 0);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1], active = document.activeElement;
      const inside = el.contains(active);
      if (e.shiftKey && (!inside || active === first)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (!inside || active === last)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const i = stack.indexOf(el); if (i >= 0) stack.splice(i, 1);
      if (previous && previous.focus && document.contains(previous)) previous.focus();
    };
  }, [ref]);
}
