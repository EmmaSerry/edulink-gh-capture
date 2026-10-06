/** Slowly drifting colour orbs behind the whole app (pure CSS, cheap). */
export function CaptureBackdrop() {
  return (
    <div className="capture-orbs" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}
