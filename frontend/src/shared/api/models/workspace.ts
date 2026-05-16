import type { Repository } from './project.js';

export type Workspace = {
  workspaceSlug: string;
  displayName: string;
};

export type CreateWorkspaceResponse = {
  ok: true;
  workspace: Workspace;
  initialProject: {
    projectSlug: string;
    displayName: string;
    repositories: Repository[];
    workspaceSlug: string;
    defaultTags: string[];
    enabled: boolean;
  };
};
