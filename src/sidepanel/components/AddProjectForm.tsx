import { useState } from "preact/hooks";
import type { NewProjectInput } from "../../lib/storage";
import { readFileAsText } from "../../lib/file";
import { pickMarkdownFile } from "../../lib/fsa";

interface Props {
  onAdd: (input: NewProjectInput) => Promise<void>;
  /** When provided, renders a ghost Cancel button (design.md §4 secondary action). */
  onCancel?: () => void;
}

const CATEGORY_OPTIONS: { value: NewProjectInput["category"]; label: string }[] = [
  { value: "community", label: "Community" },
  { value: "academic", label: "Academic" },
  { value: "personal", label: "Personal" },
  { value: "custom", label: "Custom" },
];

// Phase 2: name + category + markdown (paste via textarea or .md file upload).
// Either input path feeds the same content state — the form doesn't need both.
// The markdown field itself is optional: a project can be added now and given
// content later via re-sync in its detail view.
export function AddProjectForm({ onAdd, onCancel }: Props) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<NewProjectInput["category"]>("personal");
  const [customLabel, setCustomLabel] = useState("");
  const [mdContent, setMdContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  // Phase 5: when a local file was connected via the picker, the IndexedDB
  // handle id to store on the new project. Cleared if the user edits the
  // textarea afterwards — typed content diverges from the file, so the
  // project falls back to a manual source (the poll would otherwise
  // overwrite their edit with the file's content).
  const [fsaHandleId, setFsaHandleId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCustom = category === "custom";
  const nameValid = name.trim().length > 0;
  const labelValid = !isCustom || customLabel.trim().length > 0;
  const canSubmit = nameValid && labelValid && !submitting;

  async function handleFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      setMdContent(text);
      setFileName(file.name);
      // An uploaded file is a one-time manual snapshot, not a connection.
      setFsaHandleId(null);
      setFileError(null);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Couldn't read the file — try again.");
    } finally {
      // Allow re-selecting the same file: change won't re-fire otherwise.
      input.value = "";
    }
  }

  // Phase 5: connect a live local file. pickMarkdownFile() opens the OS
  // picker, so it must run before any await — setState calls don't yield the
  // event loop, so calling it first here keeps the user gesture intact.
  async function handleConnectFile() {
    setConnecting(true);
    setFileError(null);
    try {
      const connection = await pickMarkdownFile();
      setMdContent(connection.content);
      setFsaHandleId(connection.handleId);
      setFileName(`Connected: ${connection.fileName} — updates automatically`);
    } catch (err) {
      setFileError(
        err instanceof Error && err.name === "AbortError"
          ? null // user cancelled the picker — not an error
          : err instanceof Error
            ? err.message
            : "Couldn't connect the file — try again.",
      );
    } finally {
      setConnecting(false);
    }
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onAdd({
        name: name.trim(),
        category,
        customCategoryLabel: isCustom ? customLabel.trim() : undefined,
        mdRawContent: mdContent,
        fsaHandleId: fsaHandleId ?? undefined,
      });
      setName("");
      setCustomLabel("");
      setMdContent("");
      setFileName(null);
      setFsaHandleId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save project — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form class="project-form" onSubmit={handleSubmit}>
      <div class="form-row">
        <label for="project-name">Name</label>
        <input
          id="project-name"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          placeholder="e.g. Reading group"
          required
        />
      </div>
      <div class="form-row">
        <label for="project-category">Category</label>
        <select
          id="project-category"
          value={category}
          onChange={(e) => setCategory((e.target as HTMLSelectElement).value as NewProjectInput["category"])}
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      {isCustom && (
        <div class="form-row">
          <label for="custom-category-label">Custom category name</label>
          <input
            id="custom-category-label"
            value={customLabel}
            onInput={(e) => setCustomLabel((e.target as HTMLInputElement).value)}
            placeholder="e.g. Research"
            required
          />
        </div>
      )}
      <div class="form-row">
        <label for="project-md">Markdown content (optional)</label>
        <textarea
          id="project-md"
          value={mdContent}
          onInput={(e) => {
            setMdContent((e.target as HTMLTextAreaElement).value);
            setFileName(null);
            // Typed content diverges from the connected file → manual.
            if (fsaHandleId) setFsaHandleId(null);
          }}
          placeholder="Paste your memory.md content here, or upload a .md file below."
        />
      </div>
      <div class="form-row">
        <label for="project-md-file">Or upload a .md file</label>
        <input id="project-md-file" type="file" accept=".md" onChange={handleFile} />
      </div>
      <div class="form-row">
        <div class="form-actions">
          <button type="button" class="btn-ghost" onClick={handleConnectFile} disabled={connecting}>
            {connecting ? "Connecting…" : "Connect local file"}
          </button>
          <span class="empty-hint">
            {fileName ? fileName : "Pick a .md file — changes on disk update automatically."}
          </span>
        </div>
        {fileError && (
          <p class="form-error" role="alert">
            {fileError}
          </p>
        )}
      </div>
      {error && (
        <p class="form-error" role="alert">
          {error}
        </p>
      )}
      <div class="form-actions">
        <button type="submit" class="btn-primary" disabled={!canSubmit}>
          {submitting ? "Adding…" : "Add project"}
        </button>
        {onCancel && (
          <button type="button" class="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
