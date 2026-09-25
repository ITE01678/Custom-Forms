import { useEffect, useRef } from "react";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Generic "are you sure?" dialog — this app had no confirmation pattern
 *  before form deletion needed one, since nothing else here is destructive
 *  enough to warrant blocking a click on a confirmation. */
export function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger, busy, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Distinguishes a genuine backdrop click from a text-selection drag that
  // starts inside the message and ends up over the backdrop — the browser
  // fires a single `click` on the nearest common ancestor of the mousedown
  // and mouseup targets in that case, which is the overlay itself, making
  // it indistinguishable from a real backdrop click by `onClick` alone.
  // Only treat it as a real backdrop click when BOTH the mousedown and the
  // click landed directly on the overlay (never inside the panel).
  const mouseDownOnOverlay = useRef(false);

  useEffect(() => {
    if (busy) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel]);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div
      className="confirm-dialog__overlay"
      onMouseDown={(e) => {
        mouseDownOnOverlay.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (!busy && e.target === e.currentTarget && mouseDownOnOverlay.current) onCancel();
      }}
    >
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <h2 id="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog__actions">
          <button ref={cancelRef} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className={danger ? "btn-danger" : "btn-primary"} onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
