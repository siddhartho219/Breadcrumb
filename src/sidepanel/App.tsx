import { useEffect, useState } from "preact/hooks";
import type { Project } from "../lib/types";
import { addProject, deleteProject, getProjects, subscribeProjects } from "../lib/storage";
import type { NewProjectInput } from "../lib/storage";
import { AddProjectForm } from "./components/AddProjectForm";
import { ProjectList } from "./components/ProjectList";

// Phase 1: plain list of projects (name + category), add form, delete per row.
// No styling pass yet — that's Phase 4 (see phases.md).
export function App() {
  const [projects, setProjects] = useState<Project[] | null>(null); // null = loading
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
            <ProjectList projects={projects} onDelete={handleDelete} />
          )}
        </section>
      </main>
    </div>
  );
}
