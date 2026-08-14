import type { Project, Settings } from "../../lib/types";
import { formatDate, relativeTime } from "../../lib/time";
import { ProgressBar } from "./ProgressBar";
import { StalenessDot } from "./StalenessDot";

interface Props {
  project: Project;
  /** Stored staleness thresholds (Phase 6) — passed down from App's loaded
      Settings so rows reflect real thresholds, not hardcoded values. */
  staleness: Settings["staleness"];
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
}

// design.md §4 row: name + checkpoint + progress + "last worked" on one
// continuous surface, separated by 1px --border-subtle dividers (no card
// shadow), with a quiet --surface-raised hover (no scale/transform).
export function ProjectRow({ project, staleness, onSelect, onDelete }: Props) {
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
      {/* Leading edge: the staleness dot (design.md §4) — 6px, color-coded
          via the staleness tokens, with an accessible text alternative. */}
      <StalenessDot
        lastContentChangeAt={project.lastContentChangeAt}
        staleness={staleness}
      />
      <div class="project-main">
        <span class="project-name">{project.name}</span>
        {project.checkpoint.text && (
          <span class="project-checkpoint" title={project.checkpoint.text}>
            {project.checkpoint.text}
          </span>
        )}
        <div class="project-meta">
          <ProgressBar
            progressPercent={project.checkpoint.progressPercent}
            detectedFrom={project.checkpoint.detectedFrom}
            label={`Progress for ${project.name}`}
          />
          <span
            class="project-last-worked"
            title={`Last worked: ${formatDate(project.lastContentChangeAt)}`}
          >
            {relativeTime(project.lastContentChangeAt)}
          </span>
        </div>
      </div>
      <div class="project-side">
        <span class={`category-tag category-tag--${project.category}`}>{categoryLabel}</span>
        <button type="button" class="btn-delete" onClick={handleDelete}>
          Delete
        </button>
      </div>
    </li>
  );
}
