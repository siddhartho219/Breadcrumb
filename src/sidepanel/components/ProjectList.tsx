import { useState } from "preact/hooks";
import type { Category, Project } from "../../lib/types";
import { ProjectRow } from "./ProjectRow";

type Filter = "all" | Category;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "community", label: "Community" },
  { value: "academic", label: "Academic" },
  { value: "personal", label: "Personal" },
  { value: "custom", label: "Custom" },
];

interface Props {
  projects: Project[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
}

// Phase 4: category filter/grouping control per phases.md. Filter state is
// local to the list; the add button lives in App's section header.
export function ProjectList({ projects, onSelect, onDelete }: Props) {
  const [filter, setFilter] = useState<Filter>("all");

  const visible = filter === "all" ? projects : projects.filter((p) => p.category === filter);

  if (projects.length === 0) {
    return <p class="empty-hint">No projects yet — add your first project.</p>;
  }

  return (
    <>
      <div class="filter-bar" role="group" aria-label="Filter by category">
        {FILTERS.map((f) => (
          <button
            type="button"
            key={f.value}
            class={`filter-chip${filter === f.value ? " filter-chip--active" : ""}`}
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p class="empty-hint">No projects in this category yet.</p>
      ) : (
        <ul class="project-list">
          {visible.map((project) => (
            <ProjectRow key={project.id} project={project} onSelect={onSelect} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </>
  );
}
