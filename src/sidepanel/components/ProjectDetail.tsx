import { useState } from "preact/hooks";
import type { Project } from "../../lib/types";
import type { SyncResult } from "../../lib/storage";
import { readFileAsText } from "../../lib/file";

interface Props {
  project: Project;
  onBack: () => void;
  onSync: (id: string, newContent: string) => Promise<SyncResult>;
  /** App-level error banner (e.g. a failed lastViewedAt write). */
  error: string | null;
}

// Phase 2: detail view shows the raw markdown and a manual re-sync action.
// Raw content renders in the mono type tokens (design.md §3) — the one Phase 4
// token pulled early, per the phase boundary.
export function ProjectDetail({ project, onBack, onSync, error }: Props) {
  const [mdContent, setMdContent] = useState(project.mdRawContent);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

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

  return (
    <div class="detail">
      <div class="detail-header">
        <button type="button" class="btn-ghost" onClick={onBack}>
          ← Back
        </button>
        <h1 class="detail-title">{project.name}</h1>
      </div>

      {error && (
        <p class="form-error" role="alert">
          {error}
        </p>
      )}

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
        <button type="submit" class="btn-primary" disabled={submitting}>
          {submitting ? "Saving…" : "Re-sync content"}
        </button>
      </form>
    </div>
  );
}
