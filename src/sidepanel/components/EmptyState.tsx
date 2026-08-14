interface Props {
  onAdd: () => void;
}

// Phase 7: no-projects-yet view per design.md's empty-state notes — centered,
// --text-secondary copy, ONE clear --accent CTA, no illustration/mascot. The
// CTA opens the same add form as the header button (which is hidden while the
// empty state is showing, so there's exactly one call to action).
export function EmptyState({ onAdd }: Props) {
  return (
    <div class="empty-state">
      <h1 class="empty-state-title">No projects yet</h1>
      <p>
        Add your first project and Breadcrumb will remember where you left off in it — and nudge
        you back when it goes quiet.
      </p>
      <button type="button" class="btn-primary" onClick={onAdd}>
        + Add your first project
      </button>
    </div>
  );
}
