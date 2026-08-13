// Checkpoint detection heuristics — hand-rolled regex/line-scanning only
// (rules.md section 2: no markdown parsing library). This is exactly the
// "genuinely fiddly, easy to fix incorrectly without context" logic rules.md
// section 4 calls out by name, so every rule below documents WHY it exists,
// what it matches, and how it can be tuned without breaking the others.
//
// Priority order (phases.md Phase 3, and the PRD's "extract the most recent
// one"): the rules are applied top-to-bottom in parse() and the first rule
// that finds something wins. Within a rule, "most recent" means the LAST
// occurrence in the document — a memory.md file is read top-to-bottom, so the
// bottom carries the freshest state.
//
// All rules operate on the raw text as a string[] of lines. They must NEVER
// throw (rules.md section 3) and must always produce a usable string or null.

export const MAX_CHECKPOINT_TEXT = 280;

/**
 * Normalize extracted text for storage/display: strip control characters
 * (except tab — tabs can legitimately appear in markdown) so binary junk or
 * null bytes in garbage input never end up in the checkpoint, then collapse
 * internal whitespace runs to single spaces.
 */
export function cleanText(raw: string): string {
  const stripped = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  return stripped.replace(/\s+/g, " ").trim();
}

/**
 * Defensive cap on checkpoint length. A memory.md line can in theory be
 * megabytes long (a minified blob pasted in by accident); a checkpoint that
 * large would bloat storage and render pathologically. Truncation here is a
 * storage/parser safety floor — UI-level ellipsis/truncation polish is Phase 7.
 */
export function truncate(text: string): string {
  if (text.length <= MAX_CHECKPOINT_TEXT) return text;
  return `${text.slice(0, MAX_CHECKPOINT_TEXT).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// Rule 1: explicit "Progress:" / "Status:" line
// ---------------------------------------------------------------------------

// A line like "Progress: 60%" or "Status: In progress — refactoring storage".
// Case-insensitive label, optional space before the colon, and a full-width
// colon (：) accepted since users paste from varied locales. Requires at
// least one character of value — a bare "Status:" carries no checkpoint.
const STATUS_LINE_RE = /^\s*(?:progress|status)\s*[:：]\s*(.+)$/i;

// A stated percentage inside the value, e.g. "Progress: 60%", "62.5%",
// "30 %". This is the ONLY place a percentage may come from — architecture.md
// is explicit that progressPercent is set only when the source markdown
// states one, never inferred from checkbox ratios or anything else.
const PERCENT_RE = /(\d{1,3}(?:[.,]\d+)?)\s*%/;

/** Parse a stated percentage, clamped to 0–100 (a progress bar can't exceed it). */
function parsePercent(value: string): number | undefined {
  const match = PERCENT_RE.exec(value);
  if (!match) return undefined;
  const raw = Number(match[1].replace(",", "."));
  if (!Number.isFinite(raw)) return undefined;
  return Math.min(100, Math.max(0, raw));
}

export interface StatusResult {
  text: string;
  progressPercent?: number;
}

/**
 * Find the most recent "Progress:"/"Status:" line. Returns null when no line
 * matches or the latest one has an empty value. Iterating and overwriting
 * naturally keeps the LAST match ("most recent wins").
 */
export function findStatusLine(lines: string[]): StatusResult | null {
  let result: StatusResult | null = null;
  for (const line of lines) {
    const match = STATUS_LINE_RE.exec(line);
    if (!match) continue;
    const rawValue = match[1].trim();
    if (!rawValue) continue; // "Status:" with nothing after it isn't a checkpoint

    const text = truncate(cleanText(rawValue));
    const progressPercent = parsePercent(rawValue);
    result =
      progressPercent !== undefined
        ? { text, progressPercent }
        : { text };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Rule 2: most recent checkbox and its context
// ---------------------------------------------------------------------------

// Common markdown task-list markers: "- [ ]", "* [x]", "+ [ ]", "1. [ ]".
// The checked state is captured but deliberately not used for anything yet —
// the task text is the checkpoint, and a progress percentage must NEVER be
// derived from checked/unchecked ratios (architecture.md).
const CHECKBOX_LINE_RE = /^\s*(?:[-*+]|\d+[.)])\s*\[([ xX])\]\s*(.*)$/;

// Any ATX heading, for finding the section a checkbox lives under.
const HEADING_RE = /^\s*(#{1,6})\s+(.+)$/;

/**
 * Find the most recent checkbox and return its task text. "Most recent" =
 * scanning from the bottom; the first checkbox found is the one used.
 *
 * "Surrounding context" (phases.md): when the checkbox sits under a heading,
 * the checkpoint is "Heading — task" so a bare task like "take notes" still
 * reads clearly in the row ("Chapter 3 — take notes"). The nearest heading
 * ABOVE the checkbox (any level) is used — blank lines between them are fine,
 * since markdown headings are usually followed by a blank line. If the task
 * text is empty (a bare "- [ ]"), the heading alone is used.
 */
export function findCheckboxContext(lines: string[]): string | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const checkbox = CHECKBOX_LINE_RE.exec(lines[i]);
    if (!checkbox) continue;

    // Search upward from the checkbox for the nearest heading.
    let headingText: string | null = null;
    for (let j = i - 1; j >= 0; j--) {
      const heading = HEADING_RE.exec(lines[j]);
      if (heading) {
        headingText = truncate(cleanText(heading[2]));
        break;
      }
    }

    const task = truncate(cleanText(checkbox[2]));
    if (headingText && task) return `${headingText} — ${task}`;
    if (task) return task;
    if (headingText) return headingText;
    // A bare "- [ ]" with no heading above is not usable — keep scanning.
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rule 3: most recent ## / ### heading
// ---------------------------------------------------------------------------

// phases.md names `##`/`###` specifically — sub-structure headings carry
// progress info ("## In progress", "### Chapter 3"), while an h1 is usually
// just the document title and would make a useless checkpoint. This rule is
// the FIRST inference fallback, so it does NOT fire when rules 1-2 matched.
const H2_H3_RE = /^\s*#{2,3}\s+(.+)$/;

/** Most recent `##`/`###` heading text, or null. h1 (and h4+) ignored. */
export function findLastHeading(lines: string[]): string | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = H2_H3_RE.exec(lines[i]);
    if (match) return truncate(cleanText(match[1]));
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rule 4: last non-empty paragraph
// ---------------------------------------------------------------------------

// A paragraph is a contiguous run of non-empty lines (blank line separates
// paragraphs). Leading list markers ("- item") and heading markers ("# Title")
// are stripped so a document that ends in a list or has only an h1 title still
// yields clean text rather than "- - item1 item2" or "# Title".
const LINE_MARKER_RE = /^\s*(?:[-*+]|\d+[.)]|#{1,6})\s+/;

/**
 * The last non-empty paragraph, with multiple lines joined by a single space.
 * Returns null only when the document has no non-empty lines at all.
 */
export function findLastParagraph(lines: string[]): string | null {
  let end = lines.length - 1;
  while (end >= 0 && lines[end].trim() === "") end--;
  if (end < 0) return null;

  let start = end;
  while (start - 1 >= 0 && lines[start - 1].trim() !== "") start--;

  const parts = lines
    .slice(start, end + 1)
    .map((line) => line.trim().replace(LINE_MARKER_RE, ""));
  const text = cleanText(parts.join(" "));
  return text ? truncate(text) : null;
}
