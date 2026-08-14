// Boundary tests for the relative-time helper. The parser suite is the
// non-negotiable one per rules.md, but timestamp bucketing is the same class
// of fiddly boundary math, so a few cheap cases are worth locking in.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDate, relativeTime } from "./time";

describe("relativeTime", () => {
  const NOW = new Date("2026-08-14T12:00:00Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function atOffset(ms: number): string {
    return new Date(NOW.getTime() - ms).toISOString();
  }

  it("says just now for under a minute", () => {
    expect(relativeTime(atOffset(0))).toBe("just now");
    expect(relativeTime(atOffset(59_999))).toBe("just now");
  });

  it("buckets minutes with singular/plural", () => {
    expect(relativeTime(atOffset(60_000))).toBe("1 minute ago");
    expect(relativeTime(atOffset(59 * MIN))).toBe("59 minutes ago");
  });

  it("buckets hours with singular/plural", () => {
    expect(relativeTime(atOffset(60 * MIN))).toBe("1 hour ago");
    expect(relativeTime(atOffset(23 * HOUR))).toBe("23 hours ago");
  });

  it("buckets days with singular/plural", () => {
    expect(relativeTime(atOffset(1 * DAY))).toBe("1 day ago");
    expect(relativeTime(atOffset(29 * DAY))).toBe("29 days ago");
  });

  it("buckets months and years", () => {
    expect(relativeTime(atOffset(30 * DAY))).toBe("1 month ago");
    expect(relativeTime(atOffset(364 * DAY))).toBe("12 months ago");
    expect(relativeTime(atOffset(365 * DAY))).toBe("1 year ago");
    expect(relativeTime(atOffset(3 * 365 * DAY))).toBe("3 years ago");
  });

  it("treats future timestamps as just now instead of negative durations", () => {
    expect(relativeTime(new Date(NOW.getTime() + 10 * MIN).toISOString())).toBe("just now");
  });

  it("never throws on malformed input", () => {
    expect(relativeTime("not-a-date")).toBe("unknown");
    expect(relativeTime("")).toBe("unknown");
  });
});

describe("formatDate", () => {
  it("formats a valid ISO date", () => {
    expect(formatDate("2026-08-14T12:00:00Z")).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
  });

  it("never throws on malformed input", () => {
    expect(formatDate("nope")).toBe("unknown");
  });
});

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
