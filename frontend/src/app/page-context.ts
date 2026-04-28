import type { Dashboard } from '../shared/api/models/dashboard';

export type PageContext = {
  dashboard: Dashboard;
  selectedProject: string;
  selectedNoteId: string;
  selectedReviewId: string;
  setSelectedProject: (slug: string) => void;
  openNote: (id: string) => void;
  openReview: (id: string) => void;
};
