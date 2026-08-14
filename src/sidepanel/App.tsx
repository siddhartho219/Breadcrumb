import { useEffect, useState } from "preact/hooks";
import type { Project, Settings } from "../lib/types";
import {
  addProject,
  connectProjectFileSource,
  DEFAULT_SETTINGS,
  deleteProject,
  getProjects,
  getSettings,
  subscribeProjects,
  syncProjectContent,
  updateProject,
} from "../lib/storage";
import type { NewProjectInput, SyncResult } from "../lib/storage";
import type { FileConnection } from "../lib/fsa";
import { AddProjectForm } from "./components/AddProjectForm";
import { ProjectList } from "./components/ProjectList";
import { ProjectDetail } from "./components/ProjectDetail";

// Phase 4: dashboard layout per design.md — brand header, collapsible add
// form, category-filtered project list with checkpoint/progress/last-worked
// per row, and the detail view for raw markdown + re-sync.
export function App() {
  const [projects, setProjects] = useState<Project[] | null>(null); // null = loading
  const [settings, setSettings] = useState<Settings | null>(null); // null until loaded
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Load projects AND settings together: rows need the stored staleness
    // thresholds (Phase 6 — read from Settings, never hardcoded), and if
    // either read fails the user sees one clear inline error instead of a
    // half-rendered list (rules.md §3 — no silent failures).
    function refresh() {
      Promise.all([getProjects(), getSettings()])
        .then(([list, storedSettings]) => {
          if (cancelled) return;
          setProjects(list);
          setSettings(storedSettings);
          setLoadError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          setLoadError(err instanceof Error ? err.message : "Couldn't load projects — try again.");
        });
    }

    refresh();
    // Keep the list in sync when another context (background worker, options
    // page) writes project data.
    const unsubscribe = subscribeProjects(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Re-render once a minute so relative "last worked" times stay current
  // without any storage writes (design.md's 11px meta timestamps).
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const selectedProject = selectedId
    ? (projects ?? []).find((p) => p.id === selectedId) ?? null
    : null;

  async function handleAdd(input: NewProjectInput) {
    const project = await addProject(input); // rejects → AddProjectForm shows inline error
    // Idempotent append: chrome.storage.onChanged (which drives refresh()) can
    // land before or after this promise's continuation — Chrome gives no
    // ordering guarantee between the set() resolution and the event dispatch.
    // If the listener's refresh already included the new project, a plain
    // append would create TWO rows sharing the same id key, and duplicate
    // React/Preact keys corrupt keyed reconciliation (rows can show another
    // project's data). Filter out any existing copy first so the key set stays
    // unique no matter which path lands first.
    setProjects((prev) =>
      prev ? [...prev.filter((p) => p.id !== project.id), project] : [project],
    );
    setShowForm(false);
  }

  async function handleDelete(id: string) {
    try {
      await deleteProject(id);
      setProjects((prev) => (prev ?? []).filter((p) => p.id !== id));
      setDeleteError(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Couldn't delete project — try again.");
    }
  }

  function handleSelect(id: string) {
    setSelectedId(id);
    setDetailError(null);
    // architecture.md §3: lastViewedAt moves when the detail view opens.
    void updateProject(id, { lastViewedAt: new Date().toISOString() }).catch((err) => {
      setDetailError(err instanceof Error ? err.message : "Couldn't update project — try again.");
    });
  }

  async function handleSync(id: string, newContent: string): Promise<SyncResult> {
    const result = await syncProjectContent(id, newContent); // rejects → ProjectDetail shows error
    setProjects((prev) => (prev ?? []).map((p) => (p.id === id ? result.project : p)));
    return result;
  }

  // Phase 5: connect/reconnect a live local file. The storage write is a
  // read-modify-write keyed by id, and the onChanged-driven refresh() will
  // replace state with the stored list — the same idempotent pattern as
  // handleAdd, so a poll racing this write can't duplicate entries.
  async function handleConnect(id: string, connection: FileConnection) {
    const updated = await connectProjectFileSource(id, connection.handleId, connection.content);
    setProjects((prev) => (prev ?? []).map((p) => (p.id === id ? updated : p)));
  }

  function handleBack() {
    setSelectedId(null);
    setDetailError(null);
  }

  if (selectedProject) {
    return (
      <div class="panel">
        <header class="panel-header">
          <span class="brand">Breadcrumb</span>
        </header>
        <main class="panel-body">
          <ProjectDetail
            project={selectedProject}
            onBack={handleBack}
            onSync={handleSync}
            onConnect={handleConnect}
            error={detailError}
          />
        </main>
      </div>
    );
  }

  return (
    <div class="panel">
      <header class="panel-header">
        <span class="brand">Breadcrumb</span>
      </header>
      <main class="panel-body">
        {deleteError && (
          <p class="form-error" role="alert">
            {deleteError}
          </p>
        )}
        {showForm && <AddProjectForm onAdd={handleAdd} onCancel={() => setShowForm(false)} />}
        <section aria-label="Projects">
          <div class="section-head">
            <h2 class="section-title">Projects</h2>
            {!showForm && (
              <button type="button" class="btn-primary btn-small" onClick={() => setShowForm(true)}>
                + Add project
              </button>
            )}
          </div>
          {projects === null ? (
            <p class="empty-hint">Loading…</p>
          ) : loadError ? (
            <p class="form-error" role="alert">
              {loadError}
            </p>
          ) : (
            <ProjectList
              projects={projects}
              staleness={(settings ?? DEFAULT_SETTINGS).staleness}
              onSelect={handleSelect}
              onDelete={handleDelete}
            />
          )}
        </section>
      </main>
    </div>
  );
}
