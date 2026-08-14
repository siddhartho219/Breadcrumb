// Staleness mapping (Phase 6) — pure date math in, category out. No side
// effects, no chrome.* calls: this module exists so the exact fresh/aging/
// stale boundary semantics are unit-testable in isolation (rules.md §4: keep
// logic in small, named lib functions, not embedded in components).
//
// Boundary semantics (documented once, tested everywhere):
//   - "stale" : days >= agingUnderDays   (architecture.md §3: ">= this is
//                                          stale")
//   - "fresh" : days <= freshUnderDays   (design.md §2: "updated within
//                                          freshUnderDays" — inclusive)
//   - "aging" : everything between.
// With the defaults (2 / 7) that means: days 0–2 fresh, 3–6 aging, 7+ stale.
// If the thresholds ever collide (freshUnderDays >= agingUnderDays), the
// stale check wins — the badge exists to nudge, so a misconfigured threshold
// should err toward the louder signal, never toward hiding a neglected
// project.

import type { Project, Settings } from "./types";

export type StalenessLevel = "fresh" | "aging" | "stale";

/**
 * design.md §2 staleness colors. This is the ONLY copy the background service
 * worker can use — `chrome.action.setBadgeBackgroundColor` needs a concrete
 * hex, and the worker has no access to CSS custom properties. Keep in sync
 * with `tokens.css` (--stale-fresh / --stale-aging / --stale-stale); per
 * design.md's explicit constraint, these three colors must not appear
 * anywhere else in the UI.
 */
export const STALENESS_COLORS: Record<StalenessLevel, string> = {
  fresh: "#4ade80",
  aging: "#facc15",
  stale: "#f87171",
};

const DAY_MS = 86_400_000;

/**
 * Whole days since an ISO timestamp, floored. Pure — `now` is injectable for
 * tests. A future timestamp (clock skew, bad device clock) counts as 0 ("just
 * now"); a malformed timestamp returns NaN, which callers must treat as stale
 * (an unreadable "last worked" date should nudge, never hide).
 */
export function daysSince(iso: string, now: number = Date.now()): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return Number.NaN;
  const diff = now - then;
  if (diff < 0) return 0;
  return Math.floor(diff / DAY_MS);
}

/** fresh | aging | stale from a raw day count + the settings thresholds. Pure. */
export function stalenessLevel(
  days: number,
  thresholds: Settings["staleness"],
): StalenessLevel {
  // NaN (malformed timestamp) is treated as stale — the nudge signal.
  if (Number.isNaN(days)) return "stale";
  if (days >= thresholds.agingUnderDays) return "stale";
  if (days <= thresholds.freshUnderDays) return "fresh";
  return "aging";
}

/** Convenience: level for a single project. `now` injectable for tests. */
export function projectStaleness(
  project: Project,
  thresholds: Settings["staleness"],
  now: number = Date.now(),
): StalenessLevel {
  return stalenessLevel(daysSince(project.lastContentChangeAt, now), thresholds);
}

export interface BadgeState {
  /** Most-stale level across all projects; null when there are none. */
  level: StalenessLevel | null;
  /** Badge text. "" hides the badge entirely (nothing needs nudging yet). */
  text: string;
  /** Badge background color (a design.md §2 staleness color), or null when
      the badge is hidden. */
  color: string | null;
}

/**
 * The toolbar badge reflects the MOST-STALE project across all projects
 * (architecture.md §1: "color-coded staleness dot"; PRD.md v1: "a toolbar
 * badge reflecting the most-stale project"). The badge text is a single space
 * — Chrome renders it as a small colored dot, which is exactly the
 * color-coded signal the docs describe.
 *
 * Design decision (deliberate, documented for later phases): when every
 * project is fresh — or there are no projects — the badge is cleared. An
 * always-on badge would be permanent toolbar noise; the per-row dots already
 * show green for fresh projects, so the toolbar badge only appears the moment
 * a project crosses into aging and turns red once any project is stale.
 *
 * rules.md §3: each project's staleness calculation is wrapped in its own
 * try/catch — one malformed record (a throwing timestamp getter, garbage
 * thresholds) must not blank the badge for every other project; it counts as
 * stale instead.
 */
export function badgeFor(
  projects: Project[],
  thresholds: Settings["staleness"],
  now: number = Date.now(),
): BadgeState {
  const rank: Record<StalenessLevel, number> = { fresh: 0, aging: 1, stale: 2 };
  let worstLevel: StalenessLevel | null = null;

  for (const project of projects) {
    let level: StalenessLevel;
    try {
      level = projectStaleness(project, thresholds, now);
    } catch {
      // rules.md §3: a bad record nudges rather than blanks the badge.
      level = "stale";
    }
    if (worstLevel === null || rank[level] > rank[worstLevel]) {
      worstLevel = level;
    }
  }

  if (worstLevel === null || worstLevel === "fresh") {
    return { level: worstLevel, text: "", color: null };
  }
  return { level: worstLevel, text: " ", color: STALENESS_COLORS[worstLevel] };
}
