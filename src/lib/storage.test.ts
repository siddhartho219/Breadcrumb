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
  connectProjectFileSource,
  DEFAULT_SETTINGS,
  deleteProject,
  getProjects,
  getSettings,
  PROJECTS_KEY,
  SETTINGS_KEY,
  subscribeProjects,
  syncFromFile,
  syncProjectContent,
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

  describe("markdown content (Phase 2)", () => {
    it("stores pasted/uploaded content as-is at add time", async () => {
      const content = "# Notes\n\n- [x] read chapter 2\n";
      const project = await addProject({
        name: "Reading group",
        category: "community",
        mdRawContent: content,
      });

      expect(project.mdRawContent).toBe(content);
      expect(project.mdSource).toEqual({ type: "manual", lastPastedAt: project.createdAt });
      expect((await getProjects())[0].mdRawContent).toBe(content);
    });

    it("keeps the empty default when no markdown is provided", async () => {
      const project = await addProject({ name: "Plain", category: "personal" });
      expect(project.mdRawContent).toBe("");
    });

    it("computes the checkpoint from provided content at add time", async () => {
      const project = await addProject({
        name: "A",
        category: "personal",
        mdRawContent: "- [ ] write the tests",
      });
      expect(project.checkpoint).toEqual({ text: "write the tests", detectedFrom: "explicit" });
    });

    it("keeps the default checkpoint when no content is provided", async () => {
      const project = await addProject({ name: "A", category: "personal" });
      expect(project.checkpoint).toEqual({
        text: "No checkpoint detected yet",
        detectedFrom: "inferred",
      });
    });

    it("re-computes the checkpoint when content changes via re-sync", async () => {
      const project = await addProject({
        name: "A",
        category: "personal",
        mdRawContent: "- [ ] old task",
      });
      const result = await syncProjectContent(project.id, "Progress: 50%");
      expect(result.changed).toBe(true);
      expect(result.project.checkpoint).toEqual({
        text: "50%",
        detectedFrom: "explicit",
        progressPercent: 50,
      });
    });

    it("recomputes the checkpoint when mdRawContent is patched through updateProject", async () => {
      const project = await addProject({ name: "A", category: "personal" });
      const updated = await updateProject(project.id, { mdRawContent: "Status: done" });
      expect(updated.checkpoint).toEqual({ text: "done", detectedFrom: "explicit" });
    });

    it("leaves the checkpoint alone when patching unrelated fields", async () => {
      const project = await addProject({
        name: "A",
        category: "personal",
        mdRawContent: "Status: in progress",
      });
      const updated = await updateProject(project.id, { lastViewedAt: "2026-02-01T00:00:00.000Z" });
      expect(updated.checkpoint).toEqual({ text: "in progress", detectedFrom: "explicit" });
    });

    it("is a no-op when re-synced content is identical (timestamp untouched, no write)", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      try {
        const project = await addProject({
          name: "A",
          category: "personal",
          mdRawContent: "same content",
        });
        const storedBefore = store.get(PROJECTS_KEY);

        const result = await syncProjectContent(project.id, "same content");

        expect(result.changed).toBe(false);
        expect(result.project.lastContentChangeAt).toBe(project.lastContentChangeAt);
        // Reference-identical stored array proves no write happened at all.
        expect(store.get(PROJECTS_KEY)).toBe(storedBefore);
      } finally {
        vi.useRealTimers();
      }
    });

    it("bumps lastContentChangeAt and records the manual source only on real change", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      try {
        const project = await addProject({
          name: "A",
          category: "personal",
          mdRawContent: "v1",
        });

        vi.setSystemTime(new Date("2026-01-01T00:05:00.000Z"));
        const result = await syncProjectContent(project.id, "v2");

        expect(result.changed).toBe(true);
        expect(result.project.mdRawContent).toBe("v2");
        expect(result.project.lastContentChangeAt).toBe("2026-01-01T00:05:00.000Z");
        expect(result.project.mdSource).toEqual({
          type: "manual",
          lastPastedAt: "2026-01-01T00:05:00.000Z",
        });
        expect(store.get(PROJECTS_KEY)).toEqual([result.project]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("rejects re-sync for an unknown project id", async () => {
      await expect(syncProjectContent("ghost", "x")).rejects.toThrow(/ghost/);
    });
  });

  describe("file connection (Phase 5)", () => {
    it("creates a project with an fsa source when a handle id is provided", async () => {
      const project = await addProject({
        name: "Knit log",
        category: "personal",
        fsaHandleId: "handle-1",
        mdRawContent: "# Knitting\n\nProgress: 40%",
      });

      expect(project.mdSource).toEqual({ type: "fsa", handleId: "handle-1" });
      expect(project.mdRawContent).toContain("Progress: 40%");
      expect(project.checkpoint.progressPercent).toBe(40);
    });

    it("syncFromFile updates content/checkpoint/timestamp but keeps the fsa source", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      try {
        const project = await addProject({
          name: "A",
          category: "personal",
          fsaHandleId: "h1",
          mdRawContent: "v1",
        });

        vi.setSystemTime(new Date("2026-01-01T00:05:00.000Z"));
        const result = await syncFromFile(project.id, "# v2\n\nProgress: 30%");

        expect(result.changed).toBe(true);
        expect(result.project.mdRawContent).toBe("# v2\n\nProgress: 30%");
        expect(result.project.lastContentChangeAt).toBe("2026-01-01T00:05:00.000Z");
        expect(result.project.mdSource).toEqual({ type: "fsa", handleId: "h1" }); // unchanged
        expect(result.project.checkpoint.progressPercent).toBe(30);
      } finally {
        vi.useRealTimers();
      }
    });

    it("syncFromFile is a no-op for identical content (no write, timestamp untouched)", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      try {
        const project = await addProject({
          name: "A",
          category: "personal",
          fsaHandleId: "h1",
          mdRawContent: "same",
        });
        const storedBefore = store.get(PROJECTS_KEY);

        const result = await syncFromFile(project.id, "same");

        expect(result.changed).toBe(false);
        expect(result.project.lastContentChangeAt).toBe(project.lastContentChangeAt);
        expect(store.get(PROJECTS_KEY)).toBe(storedBefore); // no write at all
      } finally {
        vi.useRealTimers();
      }
    });

    it("syncFromFile rejects for an unknown project id", async () => {
      await expect(syncFromFile("ghost", "x")).rejects.toThrow(/ghost/);
    });

    it("connectProjectFileSource switches a manual project to fsa and stores content", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      try {
        const project = await addProject({ name: "A", category: "personal", mdRawContent: "old" });

        vi.setSystemTime(new Date("2026-01-01T00:05:00.000Z"));
        const updated = await connectProjectFileSource(project.id, "h2", "new file content");

        expect(updated.mdSource).toEqual({ type: "fsa", handleId: "h2" });
        expect(updated.mdRawContent).toBe("new file content");
        expect(updated.lastContentChangeAt).toBe("2026-01-01T00:05:00.000Z");
      } finally {
        vi.useRealTimers();
      }
    });

    it("connectProjectFileSource does not bump lastContentChangeAt for identical content", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      try {
        const project = await addProject({
          name: "A",
          category: "personal",
          mdRawContent: "same",
        });

        const updated = await connectProjectFileSource(project.id, "h3", "same");

        expect(updated.mdSource).toEqual({ type: "fsa", handleId: "h3" });
        expect(updated.mdRawContent).toBe("same");
        // A pure source switch isn't "working on" the project.
        expect(updated.lastContentChangeAt).toBe(project.lastContentChangeAt);
      } finally {
        vi.useRealTimers();
      }
    });

    it("connectProjectFileSource rejects for an unknown project id", async () => {
      await expect(connectProjectFileSource("ghost", "h", "x")).rejects.toThrow(/ghost/);
    });

    it("manual re-sync overrides an fsa source (explicit override contract)", async () => {
      const project = await addProject({
        name: "A",
        category: "personal",
        fsaHandleId: "h1",
        mdRawContent: "file content",
      });

      const result = await syncProjectContent(project.id, "manually pasted");

      expect(result.changed).toBe(true);
      expect(result.project.mdSource.type).toBe("manual");
    });
  });

  describe("settings (Phase 6)", () => {
    it("returns the defaults when nothing has been stored yet", async () => {
      expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    });

    it("reads real stored thresholds instead of hardcoding them", async () => {
      store.set(SETTINGS_KEY, { staleness: { freshUnderDays: 3, agingUnderDays: 14 } });
      const settings = await getSettings();
      expect(settings.staleness).toEqual({ freshUnderDays: 3, agingUnderDays: 14 });
      expect(settings.defaultCategory).toBe(DEFAULT_SETTINGS.defaultCategory);
    });

    it("merges partial records over the defaults", async () => {
      store.set(SETTINGS_KEY, { staleness: { freshUnderDays: 1 } });
      const settings = await getSettings();
      expect(settings.staleness.freshUnderDays).toBe(1);
      expect(settings.staleness.agingUnderDays).toBe(DEFAULT_SETTINGS.staleness.agingUnderDays);
      expect(settings.defaultCategory).toBe(DEFAULT_SETTINGS.defaultCategory);
    });

    it("sanitizes garbage threshold fields back to defaults", async () => {
      store.set(SETTINGS_KEY, { staleness: { freshUnderDays: "soon", agingUnderDays: null } });
      expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    });

    it("throws a user-readable error on a read failure", async () => {
      const failingChrome = {
        storage: {
          local: {
            async get(): Promise<Record<string, unknown>> {
              throw new Error("disk on fire");
            },
          },
        },
      };
      (globalThis as Record<string, unknown>).chrome = failingChrome;
      await expect(getSettings()).rejects.toThrow(/Couldn't load settings/);
    });
  });

  it("notifies subscribers on project OR settings changes from another context", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeProjects(listener);

    const handler = onChanged.mock.calls[0][0] as (
      changes: Record<string, unknown>,
      areaName: string,
    ) => void;

    handler({ projects: {} }, "local");
    expect(listener).toHaveBeenCalledTimes(1);

    // Phase 6: settings changes (new staleness thresholds) also refresh the
    // panel so rows re-render with the new thresholds.
    handler({ settings: {} }, "local");
    expect(listener).toHaveBeenCalledTimes(2);

    handler({ projects: {} }, "sync"); // other area → no notify
    handler({ unrelated: {} }, "local"); // unknown key → no notify
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    handler({ projects: {} }, "local");
    expect(listener).toHaveBeenCalledTimes(2); // unsubscribed → no notify
  });
});
