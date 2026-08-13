import { useEffect, useState } from "preact/hooks";
import type { Project } from "../lib/types";
import {
  addProject,
  deleteProject,
  getProjects,
  subscribeProjects,
  syncProjectContent,
  updateProject,
} from "../lib/storage";
import type { NewProjectInput, SyncResult } from "../lib/storage";
import { AddProjectForm } from "./components/AddProjectForm";
import { ProjectList } from "./components/ProjectList";
import { ProjectDetail } from "./components/ProjectDetail";

// Phase 2: project detail view (raw markdown + re-sync) reachable by clicking
// a row. Still no styling pass beyond the mono raw-markdown exception — the
// real design pass is Phase 4 (see phases.md).
export function App() {
  const [projects, setProjects] = useState<Project[] | null>(null); // null = loading
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    function refresh() {
      getProjects()
        .then((list) => {
          if (cancelled) return;
          setProjects(list);
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

  const selectedProject = selectedId
    ? (projects ?? []).find((p) => p.id === selectedId) ?? null
    : null;

  async function handleAdd(input: NewProjectInput) {
    const project = await addProject(input); // rejects → AddProjectForm shows inline error
    setProjects((prev) => (prev ? [...prev, project] : [project]));
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
          <ProjectDetail project={selectedProject} onBack={handleBack} onSync={handleSync} error={detailError} />
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
        <AddProjectForm onAdd={handleAdd} />
        {deleteError && (
          <p class="form-error" role="alert">
            {deleteError}
          </p>
        )}
        <section aria-label="Projects">
          <h2 class="section-title">Projects</h2>
          {projects === null ? (
            <p class="empty-hint">Loading…</p>
          ) : loadError ? (
            <p class="form-error" role="alert">
              {loadError}
            </p>
          ) : (
            <ProjectList projects={projects} onSelect={handleSelect} onDelete={handleDelete} />
          )}
        </section>
      </main>
    </div>
  );
}
