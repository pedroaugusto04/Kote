import { slugify } from './strings.js';

export type Project = {
  projectSlug: string;
  displayName: string;
  repoFullName: string;
  workspaceSlug: string;
  aliases: string[];
  defaultTags: string[];
  enabled: boolean;
};

export async function loadProjects(_manifestPath: string): Promise<Project[]> {
  return [];
}

export function findProject(projects: Project[], value: string): Project | undefined {
  const target = slugify(value);
  if (!target) return undefined;
  return projects.find((project) => {
    return project.projectSlug === target || project.aliases.includes(target) || slugify(project.displayName) === target;
  });
}

export async function saveProjects(manifestPath: string, projects: Project[]): Promise<void> {
  void manifestPath;
  void projects;
  throw new Error('filesystem_project_manifest_removed_use_content_repository');
}

export async function upsertProjects(
  manifestPath: string,
  items: Array<Partial<Project> & Pick<Project, 'projectSlug' | 'displayName'>>,
): Promise<Project[]> {
  const current = await loadProjects(manifestPath);
  const bySlug = new Map(current.map((project) => [project.projectSlug, project]));
  for (const item of items) {
    const projectSlug = slugify(item.projectSlug) || 'inbox';
    const existing = bySlug.get(projectSlug);
    bySlug.set(projectSlug, {
      projectSlug,
      displayName: String(item.displayName || existing?.displayName || projectSlug).trim(),
      repoFullName: String(item.repoFullName || existing?.repoFullName || '').trim(),
      workspaceSlug: slugify(String(item.workspaceSlug || existing?.workspaceSlug || '')),
      aliases: Array.from(
        new Set([...(existing?.aliases || []), ...((item.aliases || []).map((value) => slugify(String(value || ''))).filter(Boolean) as string[])]),
      ),
      defaultTags: Array.from(
        new Set([
          ...(existing?.defaultTags || []),
          ...((item.defaultTags || []).map((value) => slugify(String(value || ''))).filter(Boolean) as string[]),
        ]),
      ),
      enabled: item.enabled ?? existing?.enabled ?? true,
    });
  }
  const result = Array.from(bySlug.values());
  await saveProjects(manifestPath, result);
  return result;
}

export function ensureProject(projects: Project[], projectSlug: string): Project {
  const project = findProject(projects, projectSlug);
  if (project) return project;
  const slug = slugify(projectSlug) || 'inbox';
  return {
    projectSlug: slug,
    displayName: slug === 'inbox' ? 'Inbox' : slug,
    repoFullName: '',
    workspaceSlug: '',
    aliases: [],
    defaultTags: [],
    enabled: true,
  };
}
