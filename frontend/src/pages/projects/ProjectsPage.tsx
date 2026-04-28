import { useParams } from 'react-router-dom';

import type { PageContext } from '../../app/page-context';
import { PageHead, Panel, Tags } from '../../shared/ui/primitives';
import { NoteRow } from '../../widgets/notes/NoteRow';
import { ProjectCard } from '../../widgets/projects/ProjectCard';

export function ProjectsPage({ dashboard, selectedProject, setSelectedProject, openNote }: PageContext) {
  const params = useParams();
  const routeProject = params.projectSlug ? decodeURIComponent(params.projectSlug) : '';
  const selectedSlug = routeProject || selectedProject;
  const selected = dashboard.projects.find((project) => project.projectSlug === selectedSlug) || dashboard.projects[0];
  const notes = dashboard.notes.filter((note) => !selected || note.project === selected.projectSlug);

  return (
    <>
      <PageHead title="Projetos" subtitle="Timeline de conhecimento por repositorio e atividade recente." />
      <section className="grid cols-3">
        {dashboard.projects.map((project) => (
          <ProjectCard key={project.projectSlug} project={project} onOpen={setSelectedProject} />
        ))}
      </section>
      {selected ? (
        <Panel className="spaced">
          <div className="page-head">
            <div>
              <h2>{selected.displayName}</h2>
              <p>{selected.repoFullName}</p>
            </div>
            <Tags items={selected.defaultTags} />
          </div>
          <div className="timeline">
            {notes.map((note) => (
              <div className="timeline-item" key={note.id}>
                <NoteRow note={note} dashboard={dashboard} onOpen={openNote} />
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </>
  );
}
