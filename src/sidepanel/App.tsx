// Phase 0: static shell only. Project list, add-project form, and storage
// wiring arrive in Phase 1 — see phases.md. This file's only job right now
// is to prove the side panel loads and renders inside Chrome.

export function App() {
  return (
    <div class="panel">
      <header class="panel-header">
        <span class="brand">Breadcrumb</span>
      </header>
      <main class="empty-state">
        <p>No projects yet.</p>
        <button class="btn-primary" disabled>
          + Add project
        </button>
        <p style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
          (Phase 0 scaffold — add/track flow lands in Phase 1)
        </p>
      </main>
    </div>
  );
}
