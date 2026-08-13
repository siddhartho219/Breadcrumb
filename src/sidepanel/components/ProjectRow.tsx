import type { Project } from "../../lib/types";

interface Props {
  project: Project;
  onDelete: (id: string) => Promise<void>;
}

export function ProjectRow({ project, onDelete }: Props) {
  const categoryLabel =
    project.category === "custom" && project.customCategoryLabel
      ? project.customCategoryLabel
      : project.category;

  function handleDelete() {
    if (!window.confirm(`Delete "${project.name}"? This can't be undone.`)) return;
    void onDelete(project.id); // errors surface in App's shared error banner
  }

  return (
    <li class="project-row">
      <span class="project-name">{project.name}</span>
      <span class="category-tag">{categoryLabel}</span>
      <button type="button" class="btn-delete" onClick={handleDelete}>
        Delete
      </button>
    </li>
  );
}
