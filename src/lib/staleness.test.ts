// Unit tests for the Phase 6 staleness mapping (rules.md §4: pure, small,
// independently testable). Covers the boundary semantics of fresh/aging/
// stale, malformed timestamps, threshold collisions, and the badge state for
// the most-stale project — including the rules.md §3 guarantee that one
// malformed record can't blank the badge for everything else.

import { describe, expect, it } from "vitest";
import {
  badgeFor,
  daysSince,
  projectStaleness,
  stalenessLevel,
  STALENESS_COLORS,
} from "./staleness";
import type { Project, Settings } from "./types";

const THRESHOLDS: Settings["staleness"] = { freshUnderDays: 2, agingUnderDays: 7 };
const NOW = Date.parse("2026-08-14T00:00:00.000Z");

function iso(daysAgo: number): string {
  return new Date(NOW - daysAgo * 86_400_000).toISOString();
}

function project(partial: Partial<Project> = {}): Project {
  return {
    id: "p",
    name: "P",
    category: "personal",
    mdRawContent: "",
    mdSource: { type: "manual", lastPastedAt: iso(1) },
    checkpoint: { text: "x", detectedFrom: "inferred" },
    createdAt: iso(10),
    lastContentChangeAt: iso(0),
    lastViewedAt: iso(0),
    order: 0,
    ...partial,
  };
}

describe("daysSince", () => {
  it("counts whole days, floored", () => {
    expect(daysSince(iso(0), NOW)).toBe(0);
    expect(daysSince(iso(1), NOW)).toBe(1);
    expect(daysSince(iso(2), NOW)).toBe(2);
    expect(daysSince(iso(2.5), NOW)).toBe(2); // floor — 2.5 days isn't 3
    expect(daysSince(iso(9), NOW)).toBe(9);
  });

  it("treats future timestamps (clock skew) as 0", () => {
    expect(daysSince(iso(-5), NOW)).toBe(0);
  });

  it("returns NaN for a malformed timestamp", () => {
    expect(Number.isNaN(daysSince("garbage", NOW))).toBe(true);
    expect(Number.isNaN(daysSince("", NOW))).toBe(true);
  });
});

describe("stalenessLevel", () => {
  it("maps the default thresholds (2 / 7): 0–2 fresh, 3–6 aging, 7+ stale", () => {
    expect(stalenessLevel(0, THRESHOLDS)).toBe("fresh");
    expect(stalenessLevel(1, THRESHOLDS)).toBe("fresh");
    expect(stalenessLevel(2, THRESHOLDS)).toBe("fresh"); // inclusive boundary
    expect(stalenessLevel(3, THRESHOLDS)).toBe("aging");
    expect(stalenessLevel(6, THRESHOLDS)).toBe("aging");
    expect(stalenessLevel(7, THRESHOLDS)).toBe("stale"); // inclusive boundary
    expect(stalenessLevel(30, THRESHOLDS)).toBe("stale");
  });

  it("respects custom thresholds from stored settings", () => {
    const custom = { freshUnderDays: 5, agingUnderDays: 10 };
    expect(stalenessLevel(5, custom)).toBe("fresh");
    expect(stalenessLevel(6, custom)).toBe("aging");
    expect(stalenessLevel(9, custom)).toBe("aging");
    expect(stalenessLevel(10, custom)).toBe("stale");
  });

  it("treats a malformed timestamp (NaN days) as stale — nudge, never hide", () => {
    expect(stalenessLevel(Number.NaN, THRESHOLDS)).toBe("stale");
  });

  it("lets stale win when thresholds collide", () => {
    const collided = { freshUnderDays: 7, agingUnderDays: 7 };
    expect(stalenessLevel(6, collided)).toBe("fresh");
    expect(stalenessLevel(7, collided)).toBe("stale");
  });
});

describe("projectStaleness", () => {
  it("uses lastContentChangeAt — never lastViewedAt — to drive staleness", () => {
    const workedLongAgo = project({
      lastContentChangeAt: iso(9),
      lastViewedAt: iso(0), // looked at recently, but not worked on
    });
    expect(projectStaleness(workedLongAgo, THRESHOLDS, NOW)).toBe("stale");
  });
});

describe("badgeFor", () => {
  it("hides the badge when there are no projects", () => {
    expect(badgeFor([], THRESHOLDS, NOW)).toEqual({ level: null, text: "", color: null });
  });

  it("clears the badge when everything is fresh", () => {
    const projects = [project({ lastContentChangeAt: iso(0) }), project({ id: "q", lastContentChangeAt: iso(2) })];
    expect(badgeFor(projects, THRESHOLDS, NOW)).toEqual({
      level: "fresh",
      text: "",
      color: null,
    });
  });

  it("shows an amber dot when the most-stale project is aging", () => {
    const projects = [
      project({ lastContentChangeAt: iso(1) }),
      project({ id: "q", lastContentChangeAt: iso(4) }), // aging
    ];
    expect(badgeFor(projects, THRESHOLDS, NOW)).toEqual({
      level: "aging",
      text: " ",
      color: STALENESS_COLORS.aging,
    });
  });

  it("reflects the most-stale project when levels differ (stale beats aging)", () => {
    const projects = [
      project({ lastContentChangeAt: iso(1) }), // fresh
      project({ id: "q", lastContentChangeAt: iso(4) }), // aging
      project({ id: "r", lastContentChangeAt: iso(12) }), // stale
    ];
    expect(badgeFor(projects, THRESHOLDS, NOW)).toEqual({
      level: "stale",
      text: " ",
      color: STALENESS_COLORS.stale,
    });
  });

  it("uses the stored thresholds, not hardcoded ones", () => {
    const aggressive = { freshUnderDays: 1, agingUnderDays: 3 };
    const projects = [project({ lastContentChangeAt: iso(2) })];
    // With default thresholds 2 days would be fresh (badge cleared); with the
    // stored 1/3 thresholds it's aging.
    expect(badgeFor(projects, aggressive, NOW)).toEqual({
      level: "aging",
      text: " ",
      color: STALENESS_COLORS.aging,
    });
    expect(badgeFor(projects, THRESHOLDS, NOW)).toEqual({
      level: "fresh",
      text: "",
      color: null,
    });
  });

  it("a malformed record contributes stale but never blanks the badge (rules.md §3)", () => {
    const throwing = project({});
    Object.defineProperty(throwing, "lastContentChangeAt", {
      get() {
        throw new Error("corrupt record");
      },
    });
    // Alone: doesn't crash, yields the stale nudge.
    expect(badgeFor([throwing], THRESHOLDS, NOW)).toEqual({
      level: "stale",
      text: " ",
      color: STALENESS_COLORS.stale,
    });
    // Among healthy records: the bad one can't blank the badge for the rest.
    const projects = [throwing, project({ lastContentChangeAt: iso(1) })];
    expect(badgeFor(projects, THRESHOLDS, NOW)).toEqual({
      level: "stale",
      text: " ",
      color: STALENESS_COLORS.stale,
    });
  });
});
