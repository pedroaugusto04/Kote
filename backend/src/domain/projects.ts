export const SPECIAL_PROJECT_SLUGS = {
  INBOX: 'inbox',
  ALL_PROJECTS: 'all projects',
} as const;

export type SpecialProjectSlug = (typeof SPECIAL_PROJECT_SLUGS)[keyof typeof SPECIAL_PROJECT_SLUGS];

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
  workspaceSlug: string;
  repositories: Repository[];
  defaultTags: string[];
  enabled: boolean;
  favorite: boolean;
  activitySparkline?: { date: string; count: number }[];
};

