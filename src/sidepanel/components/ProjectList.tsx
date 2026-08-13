import type { Project } from "../../lib/types";
import { ProjectRow } from "./ProjectRow";

interface Props {
  projects: Project[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
}

export function ProjectList({ projects, onSelect, onDelete }: Props) {
  if (projects.length === 0) {
    return <p class="empty-hint">No projects yet — add one above.</p>;
  }
  return (
    <ul class="project-list">
      {projects.map((project) => (
        <ProjectRow key={project.id} project={project} onSelect={onSelect} onDelete={onDelete} />
      ))}
    </ul>
  );
}
