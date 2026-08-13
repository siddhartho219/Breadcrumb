// Storage layer — `chrome.storage.local` is the single source of truth for
// project/settings data (architecture.md section 4; rules.md section 1).
// Every read/write is wrapped in try/catch and surfaces failures by throwing,
// so the UI can render a real inline error state instead of a silent no-op
// (rules.md section 3).
//
// Schema: { projects: Project[], settings: Settings }. Settings helpers land
// with Phase 7 (options page); this file only manages projects for now.
//
// Mutations here deliberately do NOT touch the UI directly — callers update
// their own state from return values, and `subscribeProjects()` lets any
// context (background worker, options page) notify the panel of changes.

import type { Category, Checkpoint, Project } from "./types";

export const PROJECTS_KEY = "projects";

export interface NewProjectInput {
  name: string;
  category: Category;
  customCategoryLabel?: string;
  /** Optional at add time — Phase 2 lets the form collect it; empty keeps the default. */
  mdRawContent?: string;
}

/** Result of a re-sync: the stored project plus whether anything actually changed. */
export interface SyncResult {
  project: Project;
  changed: boolean;
}

// Defined fallback per rules.md section 3 — never crash, always have a value.
const DEFAULT_CHECKPOINT: Checkpoint = {
  text: "No checkpoint detected yet",
  detectedFrom: "inferred",
};

function newId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

async function readProjects(): Promise<Project[]> {
  const data = await chrome.storage.local.get(PROJECTS_KEY);
  const raw = data[PROJECTS_KEY];
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new Error(`Stored "${PROJECTS_KEY}" is not an array — project data looks corrupted.`);
  }
  return raw as Project[];
}

async function writeProjects(projects: Project[]): Promise<void> {
  await chrome.storage.local.set({ [PROJECTS_KEY]: projects });
}

export async function getProjects(): Promise<Project[]> {
  try {
    const projects = await readProjects();
    // New projects are appended with the highest `order`; render in that order.
    return [...projects].sort((a, b) => a.order - b.order);
  } catch (err) {
    throw new Error("Couldn't load projects — try again.", { cause: err });
  }
}

export async function addProject(input: NewProjectInput): Promise<Project> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Project name can't be empty.");
  }
  const isCustom = input.category === "custom";
  const customCategoryLabel = isCustom ? input.customCategoryLabel?.trim() : undefined;
  if (isCustom && !customCategoryLabel) {
    throw new Error("Custom projects need a category label.");
  }

  let projects: Project[];
  try {
    projects = await readProjects();
  } catch (err) {
    throw new Error("Couldn't load projects — try again.", { cause: err });
  }

  const now = nowIso();
  // Fields the UI doesn't collect yet get sensible defaults (per phases.md)
  // so the stored shape is complete from day one.
  const project: Project = {
    id: newId(),
    name,
    category: input.category,
    customCategoryLabel,
    mdRawContent: input.mdRawContent ?? "",
    mdSource: { type: "manual", lastPastedAt: now },
    checkpoint: { ...DEFAULT_CHECKPOINT },
    createdAt: now,
    lastContentChangeAt: now,
    lastViewedAt: now,
    order: projects.reduce((max, p) => Math.max(max, p.order), -1) + 1,
  };

  try {
    await writeProjects([...projects, project]);
  } catch (err) {
    throw new Error("Couldn't save project — try again.", { cause: err });
  }
  return project;
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<Project> {
  let projects: Project[];
  try {
    projects = await readProjects();
  } catch (err) {
    throw new Error("Couldn't load projects — try again.", { cause: err });
  }

  const index = projects.findIndex((p) => p.id === id);
  if (index === -1) {
    throw new Error(`Couldn't find a project with id "${id}".`);
  }

  const updated: Project = { ...projects[index], ...patch, id };
  projects[index] = updated;

  try {
    await writeProjects(projects);
  } catch (err) {
    throw new Error("Couldn't save changes — try again.", { cause: err });
  }
  return updated;
}

/**
 * Manual re-sync (phases.md Phase 2): replaces a project's markdown content
 * with freshly pasted/uploaded text. `lastContentChangeAt` ("last worked")
 * only moves when the new content actually differs from what's stored — an
 * identical re-sync performs no write at all. Re-syncing always records a
 * manual source, which also overrides a future fsa connection (Phase 5).
 */
export async function syncProjectContent(id: string, newContent: string): Promise<SyncResult> {
  let projects: Project[];
  try {
    projects = await readProjects();
  } catch (err) {
    throw new Error("Couldn't load projects — try again.", { cause: err });
  }

  const index = projects.findIndex((p) => p.id === id);
  if (index === -1) {
    throw new Error(`Couldn't find a project with id "${id}".`);
  }

  const current = projects[index];
  // Direct string comparison — no timestamp bump (and no write) for a no-op.
  if (current.mdRawContent === newContent) {
    return { project: current, changed: false };
  }

  const now = nowIso();
  const updated: Project = {
    ...current,
    mdRawContent: newContent,
    mdSource: { type: "manual", lastPastedAt: now },
    lastContentChangeAt: now,
  };
  projects[index] = updated;

  try {
    await writeProjects(projects);
  } catch (err) {
    throw new Error("Couldn't save changes — try again.", { cause: err });
  }
  return { project: updated, changed: true };
}

export async function deleteProject(id: string): Promise<void> {
  let projects: Project[];
  try {
    projects = await readProjects();
  } catch (err) {
    throw new Error("Couldn't load projects — try again.", { cause: err });
  }

  const remaining = projects.filter((p) => p.id !== id);
  if (remaining.length === projects.length) {
    throw new Error(`Couldn't find a project with id "${id}" to delete.`);
  }

  try {
    await writeProjects(remaining);
  } catch (err) {
    throw new Error("Couldn't delete project — try again.", { cause: err });
  }
}

type ProjectsListener = () => void;

const listeners = new Set<ProjectsListener>();
let storageListenerAttached = false;

function attachStorageListener(): void {
  if (storageListenerAttached) return;
  storageListenerAttached = true;
  // React to writes from any extension context (background worker, options
  // page, another panel) so this panel never shows a stale list.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && PROJECTS_KEY in changes) {
      for (const listener of listeners) listener();
    }
  });
}

/** Subscribe to project changes from any context. Returns an unsubscribe fn. */
export function subscribeProjects(listener: ProjectsListener): () => void {
  attachStorageListener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
