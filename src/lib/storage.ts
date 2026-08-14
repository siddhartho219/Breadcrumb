// Storage layer — `chrome.storage.local` is the single source of truth for
// project/settings data (architecture.md section 4; rules.md section 1).
// Every read/write is wrapped in try/catch and surfaces failures by throwing,
// so the UI can render a real inline error state instead of a silent no-op
// (rules.md section 3).
//
// Schema: { projects: Project[], settings: Settings, onboardingSeen: boolean }.
// Phase 7 adds the settings WRITE path (saveSettings), the data escape hatch
// (exportAllData / importAllData / resetAllData — rules.md §3), and the
// first-run flag (get/setOnboardingSeen). The settings READ helper landed in
// Phase 6 so staleness math reads real stored thresholds.
//
// Mutations here deliberately do NOT touch the UI directly — callers update
// their own state from return values, and `subscribeProjects()` lets any
// context (background worker, options page) notify the panel of changes.

import type { Category, MdSource, Project, Settings } from "./types";
import { parse } from "./parser";

export const PROJECTS_KEY = "projects";
export const SETTINGS_KEY = "settings";
/** First-run onboarding flag (Phase 7). Separate key on purpose: adding a
    field to the Settings interface would need a migration per rules.md §4;
    a dedicated key is additive and needs none. Missing → "not seen yet". */
export const ONBOARDING_KEY = "onboardingSeen";

export const CATEGORIES: readonly Category[] = [
  "community",
  "academic",
  "personal",
  "custom",
];

/**
 * Pure settings normalizer: merge an arbitrary stored/imported record over
 * DEFAULT_SETTINGS, sanitizing garbage/partial fields so staleness math can
 * never see an undefined threshold. Used by getSettings (storage reads) and
 * importAllData (file reads).
 */
function normalizeSettings(raw: Partial<Settings> | undefined | null): Settings {
  if (raw === undefined || raw === null || typeof raw !== "object") {
    return { ...DEFAULT_SETTINGS, staleness: { ...DEFAULT_SETTINGS.staleness } };
  }
  const rawStaleness = raw.staleness;
  return {
    staleness: {
      freshUnderDays:
        typeof rawStaleness?.freshUnderDays === "number"
          ? rawStaleness.freshUnderDays
          : DEFAULT_SETTINGS.staleness.freshUnderDays,
      agingUnderDays:
        typeof rawStaleness?.agingUnderDays === "number"
          ? rawStaleness.agingUnderDays
          : DEFAULT_SETTINGS.staleness.agingUnderDays,
    },
    defaultCategory:
      typeof raw.defaultCategory === "string" && CATEGORIES.includes(raw.defaultCategory as Category)
        ? (raw.defaultCategory as Category)
        : DEFAULT_SETTINGS.defaultCategory,
  };
}

/**
 * Fallback settings (architecture.md §3: freshUnderDays 2, agingUnderDays 7).
 * `defaultCategory` has no documented default — "personal" is the tool's
 * reason for existing (design.md §2) and Phase 7 makes it user-controllable.
 */
export const DEFAULT_SETTINGS: Settings = {
  staleness: { freshUnderDays: 2, agingUnderDays: 7 },
  defaultCategory: "personal",
};

/**
 * Read stored settings, merging over DEFAULT_SETTINGS. Phase 6 needs this so
 * staleness is computed from REAL stored thresholds (Phase 7's UI will write
 * them) — never hardcoded. A missing record, a partial record, or garbage
 * fields all resolve to the defaults, so staleness math can never see an
 * undefined threshold. Throws (like every storage read) on a genuine read
 * failure, so callers can surface an inline error instead of a silent no-op.
 */
export async function getSettings(): Promise<Settings> {
  try {
    const data = await chrome.storage.local.get(SETTINGS_KEY);
    return normalizeSettings(data[SETTINGS_KEY] as Partial<Settings> | undefined);
  } catch (err) {
    throw new Error("Couldn't load settings — try again.", { cause: err });
  }
}

/**
 * Phase 7: the settings WRITE path. Validates the shape before persisting —
 * thresholds must be whole days with "stale after" strictly later than
 * "fresh under" (the staleness boundary semantics in lib/staleness.ts), and
 * the default category must be a real Category. Throws a user-readable
 * message on invalid input so the options page can show an inline error.
 */
export async function saveSettings(settings: Settings): Promise<Settings> {
  const { freshUnderDays, agingUnderDays } = settings.staleness;
  if (!Number.isInteger(freshUnderDays) || freshUnderDays < 0) {
    throw new Error('"Fresh under" must be a whole number of days.');
  }
  if (!Number.isInteger(agingUnderDays) || agingUnderDays < 0) {
    throw new Error('"Stale after" must be a whole number of days.');
  }
  if (agingUnderDays <= freshUnderDays) {
    throw new Error('"Stale after" must be greater than "fresh under".');
  }
  if (!CATEGORIES.includes(settings.defaultCategory)) {
    throw new Error("Unknown default category.");
  }
  try {
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    return settings;
  } catch (err) {
    throw new Error("Couldn't save settings — try again.", { cause: err });
  }
}

/** Whether the first-run explanation has been dismissed. Missing key → false
    (a fresh install should see it once). */
export async function getOnboardingSeen(): Promise<boolean> {
  try {
    const data = await chrome.storage.local.get(ONBOARDING_KEY);
    return data[ONBOARDING_KEY] === true;
  } catch (err) {
    throw new Error("Couldn't load your data — try again.", { cause: err });
  }
}

export async function setOnboardingSeen(seen: boolean): Promise<void> {
  try {
    await chrome.storage.local.set({ [ONBOARDING_KEY]: seen });
  } catch (err) {
    throw new Error("Couldn't save your preferences — try again.", { cause: err });
  }
}

export interface NewProjectInput {
  name: string;
  category: Category;
  customCategoryLabel?: string;
  /** Optional at add time — Phase 2 lets the form collect it; empty keeps the default. */
  mdRawContent?: string;
  /**
   * Phase 5: when the form connected a local file, the IndexedDB handle id.
   * When set, the project starts with mdSource: { type: "fsa" } and
   * mdRawContent is the file's initial content. Must not be combined with a
   * manual-paste intent — providing it makes the project file-connected.
   */
  fsaHandleId?: string;
}

/** Result of a re-sync: the stored project plus whether anything actually changed. */
export interface SyncResult {
  project: Project;
  changed: boolean;
}

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
    // Phase 5: a connected file makes the project fsa-sourced from birth;
    // otherwise it starts manual.
    mdSource: input.fsaHandleId
      ? { type: "fsa", handleId: input.fsaHandleId }
      : { type: "manual", lastPastedAt: now },
    // Phase 3: checkpoint is derived from whatever content exists. parse()
    // never throws and returns the defined default for empty content.
    checkpoint: parse(input.mdRawContent ?? ""),
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

  // Data invariant (Phase 3): the stored checkpoint must always match the
  // stored markdown. If a caller patches mdRawContent through this generic
  // path without providing a checkpoint of its own, recompute it here so the
  // two can never drift apart.
  const checkpoint =
    patch.checkpoint !== undefined
      ? patch.checkpoint
      : patch.mdRawContent !== undefined
        ? parse(patch.mdRawContent)
        : projects[index].checkpoint;

  const updated: Project = { ...projects[index], ...patch, id, checkpoint };
  projects[index] = updated;

  try {
    await writeProjects(projects);
  } catch (err) {
    throw new Error("Couldn't save changes — try again.", { cause: err });
  }
  return updated;
}

/**
 * Shared content-apply used by every path that lands new markdown: re-derives
 * the checkpoint (Phase 3 invariant) and bumps `lastContentChangeAt` to `now`.
 * Callers decide the source and whether a diff is required first.
 */
function applyContent(project: Project, newContent: string, source: MdSource, now: string): Project {
  return {
    ...project,
    mdRawContent: newContent,
    // Phase 3: checkpoint must always match the stored markdown.
    checkpoint: parse(newContent),
    mdSource: source,
    lastContentChangeAt: now,
  };
}

/**
 * Manual re-sync (phases.md Phase 2): replaces a project's markdown content
 * with freshly pasted/uploaded text. `lastContentChangeAt` ("last worked")
 * only moves when the new content actually differs from what's stored — an
 * identical re-sync performs no write at all. Re-syncing always records a
 * manual source, which also overrides a connected file (Phase 5) — that's the
 * explicit-override contract from phases.md.
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
  const updated = applyContent(current, newContent, { type: "manual", lastPastedAt: now }, now);
  projects[index] = updated;

  try {
    await writeProjects(projects);
  } catch (err) {
    throw new Error("Couldn't save changes — try again.", { cause: err });
  }
  return { project: updated, changed: true };
}

/**
 * Phase 5: the background worker's write path. Same diff-before-write
 * semantics as `syncProjectContent`, but it keeps the project's existing
 * mdSource untouched — a file-connected project stays file-connected across
 * polls. The manual override (which switches mdSource to manual) remains
 * `syncProjectContent`. Used by lib/file-poll.ts.
 */
export async function syncFromFile(id: string, newContent: string): Promise<SyncResult> {
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
  if (current.mdRawContent === newContent) {
    return { project: current, changed: false };
  }

  const now = nowIso();
  const updated = applyContent(current, newContent, current.mdSource, now);
  projects[index] = updated;

  try {
    await writeProjects(projects);
  } catch (err) {
    throw new Error("Couldn't save changes — try again.", { cause: err });
  }
  return { project: updated, changed: true };
}

/**
 * Phase 5: connect (or reconnect) a local file to an existing project.
 * Sets mdSource to fsa and stores the file's content. `lastContentChangeAt`
 * only moves when the content actually differs from what's stored — a pure
 * source switch (manual → fsa with identical content) doesn't count as
 * "working on" the project.
 */
export async function connectProjectFileSource(
  id: string,
  handleId: string,
  content: string,
): Promise<Project> {
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
  const source: MdSource = { type: "fsa", handleId };
  const updated =
    current.mdRawContent === content
      ? { ...current, mdSource: source }
      : applyContent(current, content, source, nowIso());
  projects[index] = updated;

  try {
    await writeProjects(projects);
  } catch (err) {
    throw new Error("Couldn't save the file connection — try again.", { cause: err });
  }
  return updated;
}

/**
 * Phase 7: export everything as a JSON string (options page downloads it).
 * Versioned envelope so a future migration can recognize old exports. FSA
 * handles live in IndexedDB and are NOT serializable — the exported projects
 * keep their handleId strings, and reconnecting after import is expected.
 */
export interface ExportPayload {
  version: 1;
  exportedAt: string;
  projects: Project[];
  settings: Settings;
}

const EXPORT_VERSION = 1;

export async function exportAllData(): Promise<string> {
  try {
    const [projects, settings] = await Promise.all([getProjects(), getSettings()]);
    const payload: ExportPayload = {
      version: EXPORT_VERSION,
      exportedAt: nowIso(),
      projects,
      settings,
    };
    return JSON.stringify(payload, null, 2);
  } catch (err) {
    throw new Error("Couldn't export your data — try again.", { cause: err });
  }
}

/** Strict shape check for one imported project record. The id, not the name,
    is the real identity (duplicate names are fine; duplicate ids are not). */
function isValidProjectRecord(value: unknown): value is Project {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  if (typeof p.id !== "string" || p.id.length === 0) return false;
  if (typeof p.name !== "string") return false;
  if (typeof p.category !== "string" || !CATEGORIES.includes(p.category as Category)) return false;
  if (p.customCategoryLabel !== undefined && typeof p.customCategoryLabel !== "string") return false;
  if (typeof p.mdRawContent !== "string") return false;
  const src = p.mdSource as { type?: unknown; lastPastedAt?: unknown; handleId?: unknown } | undefined;
  if (typeof src !== "object" || src === null) return false;
  if (src.type === "manual") {
    if (typeof src.lastPastedAt !== "string") return false;
  } else if (src.type === "fsa") {
    if (typeof src.handleId !== "string" || src.handleId.length === 0) return false;
  } else {
    return false;
  }
  const cp = p.checkpoint as { text?: unknown; detectedFrom?: unknown; progressPercent?: unknown } | undefined;
  if (typeof cp !== "object" || cp === null) return false;
  if (typeof cp.text !== "string") return false;
  if (cp.detectedFrom !== "explicit" && cp.detectedFrom !== "inferred") return false;
  if (cp.progressPercent !== undefined && typeof cp.progressPercent !== "number") return false;
  for (const key of ["createdAt", "lastContentChangeAt", "lastViewedAt"] as const) {
    if (typeof p[key] !== "string") return false;
  }
  if (typeof p.order !== "number") return false;
  return true;
}

export interface ImportResult {
  /** Number of projects written (0 when the file carried none). */
  projects: number;
}

/**
 * Phase 7: import a JSON export. Validation is ALL-or-nothing — the entire
 * shape is checked before a single write, so malformed data can never corrupt
 * storage (rules.md §3). Present keys replace what's stored; absent keys leave
 * the corresponding data untouched. Projects are validated strictly (our
 * exact export shape, unique ids); settings are normalized leniently the same
 * way getSettings handles a partial record.
 */
export async function importAllData(json: string): Promise<ImportResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("That file doesn't look like a Breadcrumb export (not valid JSON).");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("That file doesn't look like a Breadcrumb export.");
  }
  const payload = parsed as Record<string, unknown>;

  if (payload.version !== undefined && payload.version !== EXPORT_VERSION) {
    throw new Error("That file was made by a different version of Breadcrumb.");
  }

  let projects: Project[] | undefined;
  if (payload.projects !== undefined) {
    if (!Array.isArray(payload.projects)) {
      throw new Error("That file's projects aren't a list — nothing was imported.");
    }
    const ids = new Set<string>();
    projects = payload.projects.map((record, i) => {
      if (!isValidProjectRecord(record)) {
        throw new Error(
          `Project #${i + 1} in that file isn't valid Breadcrumb data — nothing was imported.`,
        );
      }
      if (ids.has(record.id)) {
        throw new Error("Two projects in that file share the same id — nothing was imported.");
      }
      ids.add(record.id);
      return record;
    });
  }

  let settings: Settings | undefined;
  if (payload.settings !== undefined) {
    settings = normalizeSettings(payload.settings as Partial<Settings>);
  }

  try {
    const toWrite: Record<string, unknown> = {};
    if (projects !== undefined) toWrite[PROJECTS_KEY] = projects;
    if (settings !== undefined) toWrite[SETTINGS_KEY] = settings;
    await chrome.storage.local.set(toWrite);
    return { projects: projects?.length ?? 0 };
  } catch (err) {
    throw new Error("Couldn't import — try again.", { cause: err });
  }
}

/**
 * Phase 7: the rules.md §3 escape hatch. Clears every key this extension
 * owns, regardless of what state storage is in — chrome.storage remove() of
 * absent keys is a no-op success, so the only failure mode is a genuine
 * storage error, which is surfaced rather than swallowed.
 */
export async function resetAllData(): Promise<void> {
  try {
    await chrome.storage.local.remove([PROJECTS_KEY, SETTINGS_KEY, ONBOARDING_KEY]);
  } catch (err) {
    throw new Error("Couldn't reset your data — try again.", { cause: err });
  }
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
  // page, another panel) so this panel never shows a stale list — or stale
  // staleness thresholds once Phase 7 edits settings.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && (PROJECTS_KEY in changes || SETTINGS_KEY in changes)) {
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
