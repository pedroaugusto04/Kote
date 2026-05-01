export type Repository = {
  id: string;
  workspaceSlug: string;
  externalId: string;
  fullName: string;
  htmlUrl: string | null;
  description: string | null;
  defaultBranch: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  projectSlug: string;
  displayName: string;
  repositories: Repository[];
  workspaceSlug: string;
  aliases: string[];
  defaultTags: string[];
  enabled: boolean;
};
