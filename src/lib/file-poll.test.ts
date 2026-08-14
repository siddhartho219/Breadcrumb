// Tests for the background worker's file-poll loop (Phase 5). Uses the same
// in-memory chrome.storage mock as storage.test.ts so the REAL diff-before-
// write path runs, and mocks lib/fsa's readConnectedFile (IndexedDB isn't
// available in the Node test env). The scenarios mirror what the alarm can
// hit: changed files, unchanged files, lapsed permissions, missing handles,
// and a throwing project — none of which may crash the loop.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { addProject, PROJECTS_KEY } from "./storage";
import { runFilePoll } from "./file-poll";
import { readConnectedFile } from "./fsa";

vi.mock("./fsa", () => ({
  readConnectedFile: vi.fn(),
}));

const mockedRead = vi.mocked(readConnectedFile);

const store = new Map<string, unknown>();

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
      onChanged: { addListener: vi.fn() },
    },
  };
  (globalThis as Record<string, unknown>).chrome = chromeMock;
}

beforeEach(() => {
  store.clear();
  installChromeMock();
  mockedRead.mockReset();
});

async function seedProject(name: string, opts: { fsa?: boolean; content?: string } = {}) {
  return addProject({
    name,
    category: "personal",
    ...(opts.fsa ? { fsaHandleId: `handle-${name}`, mdRawContent: opts.content ?? "" } : {}),
  });
}

describe("runFilePoll", () => {
  it("ignores manual-sourced projects entirely", async () => {
    await seedProject("Manual", { content: "x" });
    mockedRead.mockResolvedValue({ ok: true, content: "y", fileName: "m.md" });

    const result = await runFilePoll();

    expect(result).toEqual({ checked: 0, updated: 0, skipped: 0 });
    expect(mockedRead).not.toHaveBeenCalled();
  });

  it("syncs a connected project when its file content changed", async () => {
    const project = await seedProject("Connected", { fsa: true, content: "v1" });
    mockedRead.mockResolvedValue({ ok: true, content: "v2", fileName: "c.md" });

    const result = await runFilePoll();

    expect(result).toEqual({ checked: 1, updated: 1, skipped: 0 });
    const stored = store.get(PROJECTS_KEY) as Array<{ id: string; mdRawContent: string }>;
    expect(stored.find((p) => p.id === project.id)?.mdRawContent).toBe("v2");
  });

  it("does not write when the file content is identical", async () => {
    const project = await seedProject("Same", { fsa: true, content: "unchanged" });
    mockedRead.mockResolvedValue({ ok: true, content: "unchanged", fileName: "s.md" });

    const result = await runFilePoll();

    expect(result).toEqual({ checked: 1, updated: 0, skipped: 0 });
    const stored = store.get(PROJECTS_KEY) as Array<{ id: string; lastContentChangeAt: string }>;
    expect(stored.find((p) => p.id === project.id)?.lastContentChangeAt).toBe(
      project.lastContentChangeAt,
    );
  });

  it("skips projects whose permission lapsed or handle is missing", async () => {
    await seedProject("A", { fsa: true, content: "a" });
    await seedProject("B", { fsa: true, content: "b" });
    mockedRead
      .mockResolvedValueOnce({ ok: false, reason: "denied" })
      .mockResolvedValueOnce({ ok: false, reason: "not-found" });

    const result = await runFilePoll();

    expect(result).toEqual({ checked: 2, updated: 0, skipped: 2 });
    const stored = store.get(PROJECTS_KEY) as Array<{ mdRawContent: string }>;
    expect(stored.map((p) => p.mdRawContent)).toEqual(["a", "b"]); // untouched
  });

  it("continues past a throwing project (one bad record can't blank the loop)", async () => {
    await seedProject("Bad", { fsa: true, content: "bad" });
    await seedProject("Good", { fsa: true, content: "g1" });
    mockedRead
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ ok: true, content: "g2", fileName: "g.md" });

    const result = await runFilePoll();

    expect(result).toEqual({ checked: 2, updated: 1, skipped: 1 });
    const stored = store.get(PROJECTS_KEY) as Array<{ mdRawContent: string }>;
    expect(stored.map((p) => p.mdRawContent)).toEqual(["bad", "g2"]);
  });

  it("returns zeroes (never throws) when the project list can't be read", async () => {
    (store as Map<string, unknown>).set(PROJECTS_KEY, "not-an-array");

    const result = await runFilePoll();

    expect(result).toEqual({ checked: 0, updated: 0, skipped: 0 });
    expect(mockedRead).not.toHaveBeenCalled();
  });

  it("keeps the fsa source across a successful poll update", async () => {
    await seedProject("S", { fsa: true, content: "s1" });
    mockedRead.mockResolvedValue({ ok: true, content: "s2", fileName: "s.md" });

    await runFilePoll();

    const stored = store.get(PROJECTS_KEY) as Array<{ mdSource: { type: string; handleId: string } }>;
    expect(stored[0].mdSource).toEqual({ type: "fsa", handleId: "handle-S" });
  });
});
