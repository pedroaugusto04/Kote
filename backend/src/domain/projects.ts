export type Project = {
  projectSlug: string;
  displayName: string;
  repoFullName: string;
  workspaceSlug: string;
  aliases: string[];
  defaultTags: string[];
  enabled: boolean;
};
