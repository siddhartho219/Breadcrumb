// Display helpers for timestamps (Phase 4). "Last worked" per architecture.md
// §3 is `lastContentChangeAt` — these helpers only format, they never decide
// which timestamp drives anything.
//
// Hand-rolled on purpose: rules.md's "no heavy frameworks" stance rules out a
// date library for what is ~20 lines of boundary math. Future timestamps
// (clock skew, bad device clocks) are treated as "just now" rather than a
// negative-duration string.

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** "2 days ago" — relative to now. Never throws; bad input yields "unknown". */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";

  const diffMs = Date.now() - then;
  if (diffMs < MINUTE_MS) return "just now";

  const minutes = Math.floor(diffMs / MINUTE_MS);
  if (minutes < 60) return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;

  const hours = Math.floor(diffMs / HOUR_MS);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;

  const days = Math.floor(diffMs / DAY_MS);
  // Years first: 365+ days reads as "1 year ago", not "12 months ago".
  const years = Math.floor(days / 365);
  if (years >= 1) return years === 1 ? "1 year ago" : `${years} years ago`;
  if (days >= 30) {
    const months = Math.floor(days / 30);
    return months === 1 ? "1 month ago" : `${months} months ago`;
  }
  if (days >= 1) return days === 1 ? "1 day ago" : `${days} days ago`;
  return "just now";
}

/** Absolute short date for the detail view ("Aug 14, 2026"). Never throws. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
