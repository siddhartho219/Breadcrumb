// Client-side markdown file reading for the paste/upload flow (Phase 2).
// Reads the file locally via the File API — no network calls — and stores the
// text as-is. Parsing/checkpoint detection is Phase 3 and never happens here.

export async function readFileAsText(file: File): Promise<string> {
  try {
    return await file.text();
  } catch (err) {
    throw new Error("Couldn't read the file — try again.", { cause: err });
  }
}
