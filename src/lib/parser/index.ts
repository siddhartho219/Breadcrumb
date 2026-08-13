// Public checkpoint parser — the single entry point the rest of the app
// imports. It applies the four detection rules in strict priority order
// (phases.md Phase 3):
//
//   1. explicit "Progress:" / "Status:" line      → detectedFrom: "explicit"
//   2. most recent checkbox (with heading context) → detectedFrom: "explicit"
//   3. most recent ## / ### heading                → detectedFrom: "inferred"
//   4. last non-empty paragraph                    → detectedFrom: "inferred"
//
// Contract (rules.md section 3): parse() must NEVER throw, no matter what
// input it receives. Malformed, empty, or garbage content falls back to the
// defined default. progressPercent is set ONLY when the markdown explicitly
// states a percentage (rule 1) — never inferred (architecture.md Checkpoint).

import type { Checkpoint } from "../types";
import {
  findCheckboxContext,
  findLastHeading,
  findLastParagraph,
  findStatusLine,
} from "./heuristics";

/** Defined fallback per rules.md section 3 — the "nothing recognized" answer. */
export const DEFAULT_CHECKPOINT: Checkpoint = {
  text: "No checkpoint detected yet",
  detectedFrom: "inferred",
};

export function parse(content: string): Checkpoint {
  try {
    // Defensive: only strings can be parsed; anything else is "no content".
    if (typeof content !== "string") return { ...DEFAULT_CHECKPOINT };

    // Normalize line endings (CRLF / lone CR / LF) so scanning is uniform.
    const lines = content.split(/\r\n|\r|\n/);

    // Rule 1 — explicit status line. findStatusLine already keeps the most
    // recent match, so the first hit here is authoritative.
    const status = findStatusLine(lines);
    if (status) {
      return {
        text: status.text,
        detectedFrom: "explicit",
        ...(status.progressPercent !== undefined ? { progressPercent: status.progressPercent } : {}),
      };
    }

    // Rule 2 — most recent checkbox.
    const checkbox = findCheckboxContext(lines);
    if (checkbox) {
      return { text: checkbox, detectedFrom: "explicit" };
    }

    // Rule 3 — most recent ## / ### heading.
    const heading = findLastHeading(lines);
    if (heading) {
      return { text: heading, detectedFrom: "inferred" };
    }

    // Rule 4 — last non-empty paragraph.
    const paragraph = findLastParagraph(lines);
    if (paragraph) {
      return { text: paragraph, detectedFrom: "inferred" };
    }

    return { ...DEFAULT_CHECKPOINT };
  } catch {
    // Last line of defense: even a bug in a heuristic must not take down a
    // project row render. Fall back to the defined default.
    return { ...DEFAULT_CHECKPOINT };
  }
}
