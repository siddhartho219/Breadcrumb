import { useState } from "preact/hooks";
import type { NewProjectInput } from "../../lib/storage";

interface Props {
  onAdd: (input: NewProjectInput) => Promise<void>;
}

const CATEGORY_OPTIONS: { value: NewProjectInput["category"]; label: string }[] = [
  { value: "community", label: "Community" },
  { value: "academic", label: "Academic" },
  { value: "personal", label: "Personal" },
  { value: "custom", label: "Custom" },
];

// Phase 1: name + category only (no markdown field — that's Phase 2).
export function AddProjectForm({ onAdd }: Props) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<NewProjectInput["category"]>("personal");
  const [customLabel, setCustomLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCustom = category === "custom";
  const nameValid = name.trim().length > 0;
  const labelValid = !isCustom || customLabel.trim().length > 0;
  const canSubmit = nameValid && labelValid && !submitting;

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
      });
      setName("");
      setCustomLabel("");
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
