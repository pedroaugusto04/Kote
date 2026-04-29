export type CreateProjectInput = {
  displayName: string;
  projectSlug: string;
  repoFullName: string;
  aliases: string[];
  defaultTags: string[];
};
