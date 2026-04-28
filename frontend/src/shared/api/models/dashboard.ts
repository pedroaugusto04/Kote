import type { DashboardHomeSummary } from './dashboard-home';
import type { NoteSummary } from './note';
import type { Project } from './project';
import type { Reminder } from './reminder';
import type { Review } from './review';
import type { Workspace } from './workspace';

export type Dashboard = {
  workspaces: Workspace[];
  projects: Project[];
  notes: NoteSummary[];
  reviews: Review[];
  reminders: Reminder[];
  home: DashboardHomeSummary;
};

export type DashboardPayload = Omit<Dashboard, 'home'> & {
  home?: DashboardHomeSummary;
};
