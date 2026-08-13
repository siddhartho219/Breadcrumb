import { useState } from "preact/hooks";
import type { NewProjectInput } from "../../lib/storage";
import { readFileAsText } from "../../lib/file";

interface Props {
  onAdd: (input: NewProjectInput) => Promise<void>;
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
export function AddProjectForm({ onAdd }: Props) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<NewProjectInput["category"]>("personal");
  const [customLabel, setCustomLabel] = useState("");
  const [mdContent, setMdContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
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
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onAdd({
        name: name.trim(),
        category,
        customCategoryLabel: isCustom ? customLabel.trim() : undefined,
        mdRawContent: mdContent,
      });
      setName("");
      setCustomLabel("");
      setMdContent("");
      setFileName(null);
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
          }}
          placeholder="Paste your memory.md content here, or upload a .md file below."
        />
      </div>
      <div class="form-row">
        <label for="project-md-file">Or upload a .md file</label>
        <input id="project-md-file" type="file" accept=".md" onChange={handleFile} />
        {fileName && <p class="empty-hint">Loaded {fileName}.</p>}
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
      <button type="submit" class="btn-primary" disabled={!canSubmit}>
        {submitting ? "Adding…" : "Add project"}
      </button>
    </form>
  );
}
