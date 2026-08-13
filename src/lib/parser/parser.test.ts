// Parser test suite — the one place rules.md section 1 makes tests
// non-negotiable ("this logic is the most likely to silently regress").
// Covers every case phases.md names explicitly: well-structured markdown,
// checkbox-only, header-only, prose-only, empty, and malformed/garbage input
// — plus the "never throws" and "never infers a percentage" contracts.

import { describe, expect, it } from "vitest";
import { DEFAULT_CHECKPOINT, parse } from "./index";
import { MAX_CHECKPOINT_TEXT } from "./heuristics";

describe("parse: rule 1 — explicit Progress/Status line", () => {
  it("uses a Progress line with a stated percentage (progressPercent + explicit)", () => {
    const md = `# Reading group

## Chapter 3

Progress: 60%

- [x] read chapter 3
- [ ] take notes on chapter 4
`;
    expect(parse(md)).toEqual({
      text: "60%",
      detectedFrom: "explicit",
      progressPercent: 60,
    });
  });

  it("uses a Status line as plain text without a percentage", () => {
    const md = "Status: In progress — refactoring the storage layer";
    expect(parse(md)).toEqual({
      text: "In progress — refactoring the storage layer",
      detectedFrom: "explicit",
    });
  });

  it("takes the most recent Progress/Status line when several exist", () => {
    const md = `Status: just starting

Progress: 42%`;
    expect(parse(md)).toEqual({
      text: "42%",
      detectedFrom: "explicit",
      progressPercent: 42,
    });
  });

  it("matches case-insensitively, allows a space before the colon, and tolerates a full-width colon", () => {
    expect(parse("progress : 25%")).toEqual({
      text: "25%",
      detectedFrom: "explicit",
      progressPercent: 25,
    });
    expect(parse("status：finished")).toEqual({
      text: "finished",
      detectedFrom: "explicit",
    });
  });

  it("supports decimal and spaced percentages", () => {
    expect(parse("Progress: 62.5%").progressPercent).toBe(62.5);
    expect(parse("Progress: 30 %").progressPercent).toBe(30);
  });

  it("clamps out-of-range stated percentages to 0–100", () => {
    expect(parse("Progress: 150%").progressPercent).toBe(100);
    expect(parse("Progress: 0%").progressPercent).toBe(0);
  });

  it("never sets progressPercent without an explicit statement", () => {
    expect(parse("Progress: halfway through the migration").progressPercent).toBeUndefined();
  });

  it("ignores a bare 'Status:' line with no value", () => {
    const md = `Status:

- [ ] do the thing`;
    expect(parse(md)).toEqual({ text: "do the thing", detectedFrom: "explicit" });
  });
});

describe("parse: rule 2 — most recent checkbox", () => {
  it("uses the most recent checkbox task in checkbox-only markdown", () => {
    const md = "- [ ] fix the sidebar z-index\n- [x] ship the parser\n- [ ] write the docs";
    expect(parse(md)).toEqual({ text: "write the docs", detectedFrom: "explicit" });
  });

  it("handles * and numbered list markers too", () => {
    expect(parse("* [ ] starred task")).toEqual({ text: "starred task", detectedFrom: "explicit" });
    expect(parse("1. [ ] numbered task")).toEqual({ text: "numbered task", detectedFrom: "explicit" });
  });

  it("includes the nearest preceding heading as context", () => {
    const md = `# Notes

## Chapter 3

- [x] read chapter 3
- [ ] take notes on chapter 4
`;
    expect(parse(md)).toEqual({
      text: "Chapter 3 — take notes on chapter 4",
      detectedFrom: "explicit",
    });
  });

  it("uses the heading alone when the checkbox has no task text", () => {
    expect(parse("## Chapter 3\n\n- [ ]")).toEqual({ text: "Chapter 3", detectedFrom: "explicit" });
  });

  it("is marked explicit (a checkbox is a progress marker, not a guess)", () => {
    expect(parse("- [ ] task").detectedFrom).toBe("explicit");
  });

  it("never derives a percentage from checkbox ratios", () => {
    const md = "## Progress\n- [x] done\n- [ ] pending\n- [ ] pending too";
    const cp = parse(md);
    expect(cp.text).toBe("Progress — pending too");
    expect(cp.detectedFrom).toBe("explicit");
    expect(cp.progressPercent).toBeUndefined();
  });
});

describe("parse: rule 3 — most recent ## / ### heading", () => {
  it("uses the most recent h2/h3 heading in header-only markdown", () => {
    const md = `# Title

## First section

### Second section
`;
    expect(parse(md)).toEqual({ text: "Second section", detectedFrom: "inferred" });
  });

  it("falls through to the last paragraph when only an h1 title exists", () => {
    expect(parse("# My project")).toEqual({ text: "My project", detectedFrom: "inferred" });
  });

  it("is marked inferred (a header is context, not an explicit status)", () => {
    expect(parse("## In progress").detectedFrom).toBe("inferred");
  });
});

describe("parse: rule 4 — last non-empty paragraph", () => {
  it("uses the last paragraph in prose-only markdown", () => {
    const md = `Some notes about the parser.

More context here.`;
    expect(parse(md)).toEqual({ text: "More context here.", detectedFrom: "inferred" });
  });

  it("joins a multi-line paragraph with single spaces", () => {
    const md = `First paragraph.

Second paragraph
spans two lines.`;
    expect(parse(md)).toEqual({ text: "Second paragraph spans two lines.", detectedFrom: "inferred" });
  });

  it("strips list markers from a document that ends in a plain list", () => {
    const md = `Notes:

- first idea
- second idea`;
    expect(parse(md)).toEqual({ text: "first idea second idea", detectedFrom: "inferred" });
  });
});

describe("parse: empty and degenerate content", () => {
  it("returns the defined default for empty content", () => {
    expect(parse("")).toEqual(DEFAULT_CHECKPOINT);
  });

  it("returns the defined default for whitespace-only content", () => {
    expect(parse("   \n\n\t\n  ")).toEqual(DEFAULT_CHECKPOINT);
  });

  it("returns the defined default for a non-string input without throwing", () => {
    expect(parse(null as unknown as string)).toEqual(DEFAULT_CHECKPOINT);
    expect(parse(undefined as unknown as string)).toEqual(DEFAULT_CHECKPOINT);
  });
});

describe("parse: malformed / garbage content never throws", () => {
  it("handles binary-looking junk with null bytes", () => {
    const junk = "\u0000\u0001\u0002\u0003\u0004\r\n\u0000\u0007P\u0000K\u0003\u0004\u0000";
    const cp = parse(junk);
    expect(cp).toEqual({ text: "PK", detectedFrom: "inferred" });
  });

  it("handles an extremely long single-line input (truncated, not thrown)", () => {
    const long = "a".repeat(1_000_000);
    const cp = parse(long);
    expect(cp.detectedFrom).toBe("inferred");
    expect(cp.text.length).toBeLessThanOrEqual(MAX_CHECKPOINT_TEXT + 1); // 280 + ellipsis
    expect(cp.text.endsWith("…")).toBe(true);
  });

  it("handles random keyboard gibberish", () => {
    const gibberish = "qwerty 12345 \n \n !@#$%^&*() \u0000";
    const cp = parse(gibberish);
    expect(cp).toEqual({ text: "!@#$%^&*()", detectedFrom: "inferred" });
  });

  it("handles deeply malformed markdown structures", () => {
    const cp = parse("] ] [ ] ] [[[ [x] ]] #######\n\n- - - -\n\n##");
    expect(cp.detectedFrom).toBe("inferred");
    expect(typeof cp.text).toBe("string");
    expect(cp.text.length).toBeGreaterThan(0);
  });

  it("handles CRLF line endings", () => {
    const md = "Progress: 30%\r\n\r\n- [ ] a task\r\n";
    expect(parse(md)).toEqual({ text: "30%", detectedFrom: "explicit", progressPercent: 30 });
  });
});

describe("parse: a real memory.md-style file", () => {
  // Representative of the memory.md habit the PRD is built around: a title,
  // a status line with a stated percentage, a checkbox list, and trailing
  // prose. Rule 1 wins and surfaces the explicit status.
  const sample = `# Breadcrumb — where I left off

## Reading group
- [x] read chapter 2
- [ ] take notes on chapter 3
- [ ] prep questions for Thursday

Progress: 40%

Next session: focus on chapter 3 notes, then skim chapter 4.
`;

  it("produces a sensible checkpoint for a well-structured file", () => {
    expect(parse(sample)).toEqual({
      text: "40%",
      detectedFrom: "explicit",
      progressPercent: 40,
    });
  });

  // The same file without the status line: the checkbox rule takes over and
  // keeps the heading context so the checkpoint still reads clearly.
  it("falls back to checkbox-with-context when no status line exists", () => {
    const noStatus = sample.replace(/^Progress: 40%$/m, "");
    expect(parse(noStatus)).toEqual({
      text: "Reading group — prep questions for Thursday",
      detectedFrom: "explicit",
    });
  });

  // And with no checkboxes either, the last heading is the sensible cue.
  it("falls back to the most recent heading with only headers and prose", () => {
    const headersOnly = sample.replace(/^Progress: 40%$/m, "").replace(/^- .*$/gm, "");
    expect(parse(headersOnly)).toEqual({ text: "Reading group", detectedFrom: "inferred" });
  });
});
