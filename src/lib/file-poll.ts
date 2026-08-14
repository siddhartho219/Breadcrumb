// The background worker's periodic file-poll (Phase 5). Kept OUT of the
// service-worker entry point so it's unit-testable against a mocked
// chrome.storage + mocked fsa read layer (rules.md: keep logic in small named
// lib functions, not embedded in components/entry points).
//
// Race discipline (learned from the Phase 4 duplicate-row bug): this loop
// NEVER appends or reorders — each project update goes through the storage
// layer's own fresh read-modify-write (`syncFromFile`), which replaces in
// place by id and performs a direct string diff before writing. Combined with
// the side panel's idempotent, storage-event-driven refresh, a poll cannot
// create duplicate project entries.
//
// One malformed project must not blank the whole loop (rules.md §3): every
// per-project read/sync is individually caught and counted as skipped.

import { getProjects, syncFromFile } from "./storage";
import { readConnectedFile } from "./fsa";

export interface FilePollResult {
  /** Connected (fsa-sourced) projects examined this run. */
  checked: number;
  /** Projects whose stored content actually changed this run. */
  updated: number;
  /** Connected projects skipped (permission lapsed, handle missing, or read error). */
  skipped: number;
}

/** Re-read every file-connected project and sync real content changes. Never throws. */
export async function runFilePoll(): Promise<FilePollResult> {
  let projects;
  try {
    projects = await getProjects();
  } catch {
    // Can't even read the project list — nothing to do; the next alarm retries.
    return { checked: 0, updated: 0, skipped: 0 };
  }

  const result: FilePollResult = { checked: 0, updated: 0, skipped: 0 };

  for (const project of projects) {
    if (project.mdSource.type !== "fsa") continue;
    result.checked++;

    let read;
    try {
      read = await readConnectedFile(project.mdSource.handleId);
    } catch {
      result.skipped++;
      continue;
    }
    if (!read.ok) {
      // Permission lapsed or handle missing — the side panel's detail view
      // surfaces the "Reconnect" state; nothing to write here.
      result.skipped++;
      continue;
    }

    try {
      const sync = await syncFromFile(project.id, read.content);
      if (sync.changed) result.updated++;
    } catch {
      // Storage write failed (or the project was deleted mid-poll) — count
      // and move on; the next alarm retries.
      result.skipped++;
    }
  }

  return result;
}
