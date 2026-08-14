import { useEffect, useState } from "preact/hooks";
import type { Project } from "../../lib/types";
import type { SyncResult } from "../../lib/storage";
import { readFileAsText } from "../../lib/file";
import { pickMarkdownFile, readConnectedFile } from "../../lib/fsa";
import type { FileConnection } from "../../lib/fsa";
import { formatDate, relativeTime } from "../../lib/time";
import { ProgressBar } from "./ProgressBar";

interface Props {
  project: Project;
  onBack: () => void;
  onSync: (id: string, newContent: string) => Promise<SyncResult>;
  /** Phase 5: connect/reconnect a live local file. Rejects → inline error. */
  onConnect: (id: string, connection: FileConnection) => Promise<void>;
  /** App-level error banner (e.g. a failed lastViewedAt write). */
  error: string | null;
}

/** Connection status of a file-connected project, checked on view open. */
type ConnectionStatus =
  | { state: "not-connected" }
  | { state: "checking" }
  | { state: "ok"; fileName: string }
  | { state: "needs-reconnect" };

// Phase 2 view rebuilt for Phase 4: checkpoint + progress, absolute/relative
// timestamps (architecture.md §3 — "first added" and "last worked"), raw
// markdown in the mono tokens (design.md §3), and the manual re-sync action.
// Per design.md §4, Re-sync is a ghost/secondary button.
export function ProjectDetail({ project, onBack, onSync, onConnect, error }: Props) {
  const [mdContent, setMdContent] = useState(project.mdRawContent);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>({ state: "not-connected" });

  // Phase 5: for a file-connected project, check permission/readability on
  // open. This drives the "Connected …" vs "permission lapsed — Reconnect"
  // states. Content updates themselves are owned by the background worker's
  // alarm poll; this check only reports connection health.
  const handleId = project.mdSource.type === "fsa" ? project.mdSource.handleId : null;
  useEffect(() => {
    if (!handleId) {
      setConnection({ state: "not-connected" });
      return;
    }
    let cancelled = false;
    setConnection({ state: "checking" });
    void readConnectedFile(handleId)
      .then((result) => {
        if (cancelled) return;
        setConnection(result.ok ? { state: "ok", fileName: result.fileName } : { state: "needs-reconnect" });
      })
      .catch(() => {
        if (!cancelled) setConnection({ state: "needs-reconnect" });
      });
    return () => {
      cancelled = true;
    };
  }, [handleId]);

  async function handleFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      setMdContent(text);
      setFileName(file.name);
      setFileError(null);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Couldn't read the file — try again.");
    } finally {
      // Allow re-selecting the same file: change won't re-fire otherwise.
      input.value = "";
    }
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setStatus(null);
    try {
      const result = await onSync(project.id, mdContent);
      setMdContent(result.project.mdRawContent);
      setFileName(null);
      setStatus(result.changed ? "Content updated." : "No changes — content is already current.");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't save changes — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConnectFile() {
    setConnecting(true);
    setConnectError(null);
    try {
      // pickMarkdownFile() opens the OS picker and must run before any await
      // (user gesture). Reconnecting replaces the stored handle + content.
      const connection = await pickMarkdownFile();
      await onConnect(project.id, connection);
      setMdContent(connection.content);
    } catch (err) {
      if (!(err instanceof Error && err.name === "AbortError")) {
        setConnectError(
          err instanceof Error ? err.message : "Couldn't connect the file — try again.",
        );
      }
    } finally {
      setConnecting(false);
    }
  }

  const isExplicit = project.checkpoint.detectedFrom === "explicit";

  return (
    <div class="detail">
      <div class="detail-header">
        <button type="button" class="btn-ghost" onClick={onBack}>
          ← Back
        </button>
        <div class="detail-heading">
          <h1 class="detail-title">{project.name}</h1>
          <p class="detail-meta">
            Added {formatDate(project.createdAt)} · Last worked {relativeTime(project.lastContentChangeAt)}
          </p>
        </div>
      </div>

      {error && (
        <p class="form-error" role="alert">
          {error}
        </p>
      )}

      <section aria-label="Checkpoint">
        <h2 class="section-title">Checkpoint</h2>
        <p class="detail-checkpoint">{project.checkpoint.text}</p>
        <div class="detail-progress">
          <ProgressBar
            progressPercent={project.checkpoint.progressPercent}
            detectedFrom={project.checkpoint.detectedFrom}
            label={`Progress for ${project.name}`}
          />
          <span class="detail-progress-hint">
            {isExplicit
              ? `Explicit — ${project.checkpoint.progressPercent}% stated in the file`
              : "Inferred — the file didn't state a percentage"}
          </span>
        </div>
      </section>

      <section aria-label="Local file">
        <h2 class="section-title">Local file</h2>
        {handleId === null ? (
          <>
            <p class="empty-hint">
              Connect a local .md file and changes on disk will appear automatically — no
              re-paste needed.
            </p>
            <div class="form-actions">
              <button type="button" class="btn-ghost" onClick={handleConnectFile} disabled={connecting}>
                {connecting ? "Connecting…" : "Connect file"}
              </button>
            </div>
          </>
        ) : connection.state === "checking" ? (
          <p class="empty-hint">Checking connection…</p>
        ) : connection.state === "ok" ? (
          <p class="empty-hint">
            Connected to {connection.fileName} — changes on disk appear automatically within a
            few minutes.
          </p>
        ) : (
          <>
            <p class="form-error">
              Can't read the connected file — permission may have lapsed. Reconnect to restore
              automatic updates.
            </p>
            <div class="form-actions">
              <button type="button" class="btn-ghost" onClick={handleConnectFile} disabled={connecting}>
                {connecting ? "Connecting…" : "Reconnect file"}
              </button>
            </div>
          </>
        )}
        {connectError && (
          <p class="form-error" role="alert">
            {connectError}
          </p>
        )}
      </section>

      <section aria-label="Markdown content">
        <h2 class="section-title">Markdown content</h2>
        {project.mdRawContent ? (
          <pre class="markdown-raw">{project.mdRawContent}</pre>
        ) : (
          <p class="empty-hint">No markdown content yet — use Re-sync below to add some.</p>
        )}
      </section>

      <form class="project-form" onSubmit={handleSubmit}>
        <h2 class="section-title">Re-sync content</h2>
        <p class="empty-hint">
          Paste fresh content or upload a .md file. The "last worked" timestamp only moves when
          the content actually changes.
        </p>
        <div class="form-row">
          <label for="resync-md">New markdown content</label>
          <textarea
            id="resync-md"
            value={mdContent}
            onInput={(e) => {
              setMdContent((e.target as HTMLTextAreaElement).value);
              setFileName(null);
            }}
            placeholder="Paste the updated content here, or upload a .md file below."
          />
        </div>
        <div class="form-row">
          <label for="resync-md-file">Or upload a .md file</label>
          <input id="resync-md-file" type="file" accept=".md" onChange={handleFile} />
          {fileName && <p class="empty-hint">Loaded {fileName}.</p>}
          {fileError && (
            <p class="form-error" role="alert">
              {fileError}
            </p>
          )}
        </div>
        {formError && (
          <p class="form-error" role="alert">
            {formError}
          </p>
        )}
        {status && (
          <p class="empty-hint" role="status">
            {status}
          </p>
        )}
        <div class="form-actions">
          <button type="submit" class="btn-ghost" disabled={submitting}>
            {submitting ? "Saving…" : "Re-sync content"}
          </button>
        </div>
      </form>
    </div>
  );
}
