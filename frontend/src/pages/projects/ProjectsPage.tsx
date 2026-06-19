import type { ProjectsPageContext } from '../../app/page-context';
import { ProjectsWorkspace } from '../../features/projects/ProjectsWorkspace';

export function ProjectsPage({ dashboard, selectedProject, openProject, openNote, editNote, deleteNote, createNote }: ProjectsPageContext) {
  return (
    <ProjectsWorkspace
      dashboard={dashboard}
      selectedProject={selectedProject}
      openProject={openProject}
      openNote={openNote}
      editNote={editNote}
      deleteNote={deleteNote}
      createNote={createNote}
    />
  );
}
