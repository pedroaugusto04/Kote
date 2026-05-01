export type CreateProjectInput = {
  displayName: string;
  projectSlug: string;
  repositoryIds: string[];
  aliases: string[];
  defaultTags: string[];
};

export type UpdateProjectInput = {
  projectSlug: string;
  displayName: string;
  repositoryIds: string[];
  aliases: string[];
  defaultTags: string[];
};
