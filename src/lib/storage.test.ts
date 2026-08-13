// Smoke tests for the Phase 1 storage layer. `chrome.storage` only exists
// inside a real extension, so we install an in-memory mock standing in for
// chrome.storage.local and exercise the real storage.ts code paths: CRUD
// round-trip, default field values, validation, ordering, error paths, and
// the pub/sub. Persistence itself is guaranteed by Chrome — what we prove here
// is that every read/write goes through chrome.storage.local (never
// localStorage) and that the schema round-trips intact.
//
// NOTE: importing this module must not touch `chrome` (listener attachment is
// lazy inside subscribeProjects), so the mock can be installed per-test.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addProject,
  deleteProject,
  getProjects,
  PROJECTS_KEY,
  subscribeProjects,
  updateProject,
} from "./storage";

const store = new Map<string, unknown>();
const onChanged = vi.fn();

function installChromeMock(): void {
  const chromeMock = {
    storage: {
      local: {
        async get(keys?: string | string[] | null): Promise<Record<string, unknown>> {
          if (keys == null) return Object.fromEntries(store);
          const out: Record<string, unknown> = {};
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            if (store.has(key)) out[key] = store.get(key);
          }
          return out;
        },
        async set(items: Record<string, unknown>): Promise<void> {
          for (const [key, value] of Object.entries(items)) store.set(key, value);
        },
        async remove(keys: string | string[]): Promise<void> {
          for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key);
        },
      },
      onChanged: {
        addListener: onChanged,
      },
    },
  };
  (globalThis as Record<string, unknown>).chrome = chromeMock;
}

beforeEach(() => {
  store.clear();
  onChanged.mockClear();
  installChromeMock();
});

describe("storage", () => {
  it("returns [] when nothing has been stored yet", async () => {
    expect(await getProjects()).toEqual([]);
  });

  it("adds a project with the full shape and sensible defaults", async () => {
    const project = await addProject({ name: "  Reading group  ", category: "community" });

    expect(project.name).toBe("Reading group");
    expect(project.category).toBe("community");
    expect(project.customCategoryLabel).toBeUndefined();
    // Fields not collected by the Phase 1 UI get defaults.
    expect(project.mdRawContent).toBe("");
    expect(project.mdSource).toEqual({ type: "manual", lastPastedAt: project.createdAt });
    expect(project.checkpoint).toEqual({
      text: "No checkpoint detected yet",
      detectedFrom: "inferred",
    });
    expect(project.order).toBe(0);
    expect(project.createdAt).toBe(project.lastContentChangeAt);
    expect(project.lastViewedAt).toBe(project.createdAt);
    expect(project.id).toBeTruthy();

    // Written through chrome.storage.local — the mock's backing store.
    const stored = store.get(PROJECTS_KEY) as unknown[];
    expect(stored).toHaveLength(1);
    expect(stored[0]).toEqual(project);

    expect(await getProjects()).toEqual([project]);
  });

  it("stores a custom category label when category is custom", async () => {
    const project = await addProject({
      name: "Thesis",
      category: "custom",
      customCategoryLabel: "  Research  ",
    });
    expect(project.category).toBe("custom");
    expect(project.customCategoryLabel).toBe("Research");
  });

  it("rejects a custom project without a label", async () => {
    await expect(addProject({ name: "Thesis", category: "custom" })).rejects.toThrow(
      /custom/i,
    );
    expect(store.has(PROJECTS_KEY)).toBe(false);
  });

  it("rejects an empty project name", async () => {
    await expect(addProject({ name: "   ", category: "personal" })).rejects.toThrow(
      /empty/i,
    );
    expect(store.has(PROJECTS_KEY)).toBe(false);
  });

  it("assigns increasing order so the list stays stable", async () => {
    const a = await addProject({ name: "A", category: "community" });
    const b = await addProject({ name: "B", category: "academic" });
    const c = await addProject({ name: "C", category: "personal" });
    expect([a.order, b.order, c.order]).toEqual([0, 1, 2]);
    expect((await getProjects()).map((p) => p.name)).toEqual(["A", "B", "C"]);
  });

  it("updates a project and persists the patch", async () => {
    const project = await addProject({ name: "Old name", category: "personal" });
    const updated = await updateProject(project.id, { name: "New name" });

    expect(updated.name).toBe("New name");
    expect(updated.category).toBe("personal"); // untouched fields survive
    expect(updated.id).toBe(project.id);

    expect((await getProjects())[0]).toEqual(updated);
    expect(store.get(PROJECTS_KEY)).toEqual([updated]);
  });

  it("rejects updates for an unknown project id", async () => {
    await expect(updateProject("nope", { name: "X" })).rejects.toThrow(/nope/);
  });

  it("deletes a project and persists the removal", async () => {
    const a = await addProject({ name: "Keep", category: "community" });
    const b = await addProject({ name: "Remove", category: "personal" });

    await deleteProject(b.id);

    const remaining = await getProjects();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(a.id);
    expect(store.get(PROJECTS_KEY)).toEqual(remaining);
  });

  it("rejects deletes for an unknown project id", async () => {
    await expect(deleteProject("ghost")).rejects.toThrow(/ghost/);
  });

  it("notifies subscribers on project changes from another context", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeProjects(listener);

    const handler = onChanged.mock.calls[0][0] as (
      changes: Record<string, unknown>,
      areaName: string,
    ) => void;

    handler({ projects: {} }, "local");
    expect(listener).toHaveBeenCalledTimes(1);

    handler({ settings: {} }, "local"); // unrelated key → no notify
    handler({ projects: {} }, "sync"); // other area → no notify
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    handler({ projects: {} }, "local");
    expect(listener).toHaveBeenCalledTimes(1); // unsubscribed → no notify
  });
});
