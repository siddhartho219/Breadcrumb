import type { Project } from "../../lib/types";

interface Props {
  project: Project;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
}

export function ProjectRow({ project, onSelect, onDelete }: Props) {
  const categoryLabel =
    project.category === "custom" && project.customCategoryLabel
      ? project.customCategoryLabel
      : project.category;

  function handleDelete(e: MouseEvent) {
    e.stopPropagation();
    if (!window.confirm(`Delete "${project.name}"? This can't be undone.`)) return;
    void onDelete(project.id); // errors surface in App's shared error banner
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(project.id);
    }
  }

  return (
    <li
      class="project-row"
      role="button"
      tabIndex={0}
      onClick={() => onSelect(project.id)}
      onKeyDown={handleKeyDown}
    >
      <div class="project-main">
        <span class="project-name">{project.name}</span>
        {project.checkpoint.text && (
          <span class="project-checkpoint" title={project.checkpoint.text}>
            {project.checkpoint.text}
          </span>
        )}
      </div>
      <span class="category-tag">{categoryLabel}</span>
      <button type="button" class="btn-delete" onClick={handleDelete}>
        Delete
      </button>
    </li>
  );
}
