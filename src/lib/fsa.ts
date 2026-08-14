// File System Access integration (Phase 5).
//
// Two hard platform constraints shape this file (see architecture.md §2 and
// rules.md §1/§3):
//
//   1. The picker (`showOpenFilePicker`) may ONLY be called from a direct user
//      gesture inside the side panel or options page. Background service
//      workers cannot show pickers at all, and Chrome rejects the call without
//      transient user activation — so `pickMarkdownFile` must be the very
//      first thing an event handler does (no `await` before it).
//
//   2. FileSystemFileHandle objects are NOT JSON-serializable, so they can't
//      live in chrome.storage (architecture.md §3). They ARE structured-
//      cloneable, so we store them in raw IndexedDB (no wrapper library —
//      rules.md: solve it with the existing stack first) keyed by a generated
//      handleId, and store only that id string on the Project record.
//
//   3. Handle permission can lapse between sessions. `readConnectedFile`
//      calls `requestPermission({ mode: "read" })` before EVERY read and
//      treats both the thrown path and any non-"granted" result as a
//      reconnectable failure — never a crash (rules.md §3). The UI maps these
//      failures to "Reconnect this project's file", not a bare "error".

const DB_NAME = "breadcrumb";
const DB_VERSION = 1;
const HANDLE_STORE = "fileHandles";

/** Result of picking a markdown file: an id for the stored handle + initial content. */
export interface FileConnection {
  handleId: string;
  fileName: string;
  content: string;
}

/** Outcome of a permission-aware read of a previously connected file. */
export type FileReadResult =
  | { ok: true; content: string; fileName: string }
  | { ok: false; reason: "not-found" | "denied" };

// ---------------------------------------------------------------------------
// IndexedDB handle store
// ---------------------------------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) {
        db.createObjectStore(HANDLE_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Couldn't open the extension's file-handle store."));
  });
}

/** Persist a FileSystemFileHandle under a generated id (structured-cloneable). */
export async function saveFileHandle(handleId: string, handle: FileSystemFileHandle): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, "readwrite");
    tx.objectStore(HANDLE_STORE).put({ id: handleId, handle });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Couldn't save the file handle."));
  });
}

/** Look up a previously stored handle; null if the id is unknown. */
export async function getFileHandle(handleId: string): Promise<FileSystemFileHandle | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, "readonly");
    const request = tx.objectStore(HANDLE_STORE).get(handleId);
    request.onsuccess = () => resolve((request.result as { handle: FileSystemFileHandle } | undefined)?.handle ?? null);
    request.onerror = () => reject(request.error ?? new Error("Couldn't read the file handle."));
  });
}

// ---------------------------------------------------------------------------
// Picker + permission-aware reads
// ---------------------------------------------------------------------------

/**
 * Open the OS file picker for a `.md` file, persist the handle, and return
 * its id plus initial content. MUST be called directly from a user gesture
 * handler (see file header). Rejects on cancel (AbortError) or read failure —
 * callers surface the message inline.
 */
export async function pickMarkdownFile(): Promise<FileConnection> {
  const [handle] = await window.showOpenFilePicker({
    types: [
      {
        description: "Markdown file",
        accept: { "text/markdown": [".md", ".markdown"] },
      },
    ],
    multiple: false,
  });

  const handleId = crypto.randomUUID();
  await saveFileHandle(handleId, handle);

  const file = await handle.getFile();
  const content = await file.text();
  return { handleId, fileName: file.name, content };
}

/**
 * Read a connected file's current content, re-requesting permission first.
 * Returns a structured result — the caller decides what to show ("reconnect
 * this project's file" for any failure), this function never throws for a
 * lapsed/missing handle (rules.md §3).
 */
export async function readConnectedFile(handleId: string): Promise<FileReadResult> {
  let handle: FileSystemFileHandle | null;
  try {
    handle = await getFileHandle(handleId);
  } catch {
    return { ok: false, reason: "not-found" };
  }
  if (!handle) return { ok: false, reason: "not-found" };

  // Re-request before every read — permission can lapse between sessions and
  // there's no way to know without asking (rules.md §3). In the background
  // worker this resolves without a prompt when already granted; a "prompt"
  // state without activation resolves non-"granted", which is fine — the side
  // panel's Reconnect flow is the user-facing path to re-grant.
  let permission: PermissionState;
  try {
    permission = await handle.requestPermission({ mode: "read" });
  } catch {
    return { ok: false, reason: "denied" };
  }
  if (permission !== "granted") return { ok: false, reason: "denied" };

  try {
    const file = await handle.getFile();
    return { ok: true, content: await file.text(), fileName: file.name };
  } catch {
    // File locked, moved, or otherwise unreadable — same user-facing path as
    // a lapsed permission: reconnect.
    return { ok: false, reason: "denied" };
  }
}
