export type Workspace = {
  workspaceSlug: string;
  displayName: string;
  githubRepos: string[];
  projectSlugs: string[];
};

export type CreateWorkspaceResponse = {
  ok: true;
  workspace: Workspace;
  initialProject: {
    projectSlug: string;
    displayName: string;
    repoFullName: string;
    workspaceSlug: string;
    aliases: string[];
    defaultTags: string[];
    enabled: boolean;
  };
};
