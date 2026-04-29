export type CreateProjectInput = {
  displayName: string;
  projectSlug: string;
  repoFullName: string;
  aliases: string[];
  defaultTags: string[];
};

export type UpdateProjectInput = {
  projectSlug: string;
  displayName: string;
  repoFullName: string;
  aliases: string[];
  defaultTags: string[];
};
