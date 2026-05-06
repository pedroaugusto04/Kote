import type { Project } from '../../domain/projects.js';
import type { Workspace } from '../../domain/workspaces.js';
import type { DashboardHomeSummary } from './dashboard-home.models.js';

export type DashboardView = {
  workspaces: Workspace[];
  projects: Project[];
  home: DashboardHomeSummary;
};
