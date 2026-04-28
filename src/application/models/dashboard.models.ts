import type { Project } from '../../domain/projects.js';
import type { Workspace } from '../../domain/workspaces.js';
import type { DashboardHomeSummary } from './dashboard-home.models.js';
import type { ReminderView } from './reminder.models.js';
import type { ReviewView } from './review.models.js';
import type { VaultNoteSummary } from './vault-note.models.js';

export type DashboardView = {
  workspaces: Workspace[];
  projects: Project[];
  notes: VaultNoteSummary[];
  reviews: ReviewView[];
  reminders: ReminderView[];
  home: DashboardHomeSummary;
};
