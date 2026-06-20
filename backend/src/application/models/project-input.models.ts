export type CreateProjectInput = {
  displayName: string;
  projectSlug: string;
  repositoryIds: string[];
  defaultTags: string[];
};

export type UpdateProjectInput = {
  projectId?: string;
  projectSlug?: string;
  displayName: string;
  repositoryIds: string[];
  defaultTags: string[];
};
