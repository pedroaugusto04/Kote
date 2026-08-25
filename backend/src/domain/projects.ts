export const SPECIAL_PROJECT_SLUGS = {
  INBOX: 'inbox',
  ALL_PROJECTS: 'all projects',
} as const;

export type SpecialProjectSlug = (typeof SPECIAL_PROJECT_SLUGS)[keyof typeof SPECIAL_PROJECT_SLUGS];

export function isSpecialProjectSlug(slug?: string | null): boolean {
  if (!slug) return true;
  const s = slug.trim().toLowerCase();
  return s === '' || s === SPECIAL_PROJECT_SLUGS.INBOX || s === SPECIAL_PROJECT_SLUGS.ALL_PROJECTS;
}

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

