import { IntegrationSetupStatus } from '../../contracts/enums.js';
import type { Project } from '../../domain/projects.js';
import type { Workspace } from '../../domain/workspaces.js';

export function configuredEnv(env: Record<string, boolean>): string[] {
  return Object.entries(env)
    .filter(([, configured]) => configured)
    .map(([name]) => name);
}

export function missingEnv(env: Record<string, boolean>): string[] {
  return Object.entries(env)
    .filter(([, configured]) => !configured)
    .map(([name]) => name);
}

export function statusFromFlags(flags: boolean[]): IntegrationSetupStatus {
  if (flags.every(Boolean)) return IntegrationSetupStatus.Connected;
  if (flags.some(Boolean)) return IntegrationSetupStatus.Partial;
  return IntegrationSetupStatus.Missing;
}

export function absoluteUrl(baseUrl: string, pathname: string): string {
  if (!baseUrl) return pathname;
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${baseUrl}${normalizedPath}`;
}

export function link(label: string, url: string, external = true) {
  return { label, url, external };
}

export function workspaceRepos(workspace: Workspace | undefined, projects: Project[]): string[] {
  const workspaceProjectRepos = projects
    .filter((project) => !workspace || project.workspaceSlug === workspace.workspaceSlug || workspace.projectSlugs.includes(project.projectSlug))
    .map((project) => project.repoFullName)
    .filter(Boolean);
  return Array.from(new Set([...(workspace?.githubRepos || []), ...workspaceProjectRepos]));
}

export function secretConfigured(value: string): boolean {
  return Boolean(value.trim());
}
