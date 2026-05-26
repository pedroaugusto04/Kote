import type { NoteSummary } from '../shared/api/models/note';
import type { Dashboard } from '../shared/api/models/dashboard';

export type PageContext = {
  dashboard: Dashboard;
  selectedProject: string;
  selectedNoteId: string;
  setSelectedProject: (slug: string) => void;
  openProject: (slug: string) => void;
  openNote: (id: string) => void;
  editNote: (noteId: string) => void;
  createNote?: (projectSlug?: string) => void;
  deleteNote: (note: Pick<NoteSummary, 'id' | 'title'>) => void;
};

export type ProjectsPageContext = Pick<
  PageContext,
  'dashboard' | 'selectedProject' | 'openProject' | 'openNote' | 'editNote' | 'deleteNote'
>;
