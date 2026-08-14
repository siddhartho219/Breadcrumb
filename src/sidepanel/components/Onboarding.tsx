interface Props {
  /** Dismiss the screen (persists the shown-once flag). Rejects on write
      failure so the user can retry instead of silently re-seeing it. */
  onDone: () => Promise<void>;
  busy: boolean;
  error: string | null;
}

// Phase 7: the one-short-screen first-run onboarding (phases.md). Shown only
// when the shown-once flag is unset AND there are no projects yet — someone
// who has imported data is clearly not new. Copy stays short: the panel is
// narrow, and the point is a 5-second orientation, not a tour.
export function Onboarding({ onDone, busy, error }: Props) {
  return (
    <div class="empty-state onboarding">
      <h1 class="empty-state-title">Track where you left off</h1>
      <ul class="onboarding-list">
        <li>Keep a short memory.md-style note per project</li>
        <li>Paste it in, or connect a local file</li>
        <li>Breadcrumb extracts your checkpoint automatically</li>
        <li>A colored dot nudges you back when a project goes quiet</li>
      </ul>
      {error && (
        <p class="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="button" class="btn-primary" onClick={() => void onDone()} disabled={busy}>
        {busy ? "One sec…" : "Get started"}
      </button>
    </div>
  );
}
