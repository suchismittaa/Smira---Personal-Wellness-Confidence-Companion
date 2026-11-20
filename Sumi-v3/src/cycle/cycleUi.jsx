import { useEffect, useRef } from "react";
import { useFocusTrap, useLatest } from "./cycleUtils.js";

/* Small shared pieces for the cycle module. */

export function ConfirmDialog({ title, body, confirmLabel, cancelLabel = "Cancel", danger, onConfirm, onCancel }) {
  const ref = useRef(null);
  const boxRef = useRef(null);
  const cancelRef = useLatest(onCancel);
  useFocusTrap(boxRef);
  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") { e.stopPropagation(); cancelRef.current(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [cancelRef]);
  return (
    <div className="cy-dialog-scrim" onClick={onCancel}>
      <div className="cy-dialog" ref={boxRef} role="alertdialog" aria-modal="true" aria-labelledby="cy-dlg-t" aria-describedby="cy-dlg-b" onClick={(e) => e.stopPropagation()}>
        <h2 id="cy-dlg-t">{title}</h2>
        <p id="cy-dlg-b">{body}</p>
        <div className="cy-dialog-actions">
          <button type="button" ref={ref} className="cy-btn-quiet" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={`cy-btn-solid${danger ? " danger" : ""}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function Toast({ message, tone }) {
  if (!message) return null;
  return <div className={`cy-toast${tone === "warn" ? " warn" : ""}`} role="status" aria-live="polite">{message}</div>;
}

export const Chevron = ({ dir = "left", size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {dir === "left" ? <path d="M19 12H5M11 6l-6 6 6 6" /> : <path d="M5 12h14M13 6l6 6-6 6" />}
  </svg>
);
