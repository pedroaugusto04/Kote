export type CreateProjectDto = {
  displayName: string;
  projectSlug: string;
  repositoryIds: string[];
  defaultTags: string[];
};

export type UpdateProjectDto = {
  projectId: string;
  displayName: string;
  repositoryIds: string[];
  defaultTags: string[];
};
