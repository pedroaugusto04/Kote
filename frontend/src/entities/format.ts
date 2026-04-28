import type { Project } from '../shared/api/models/project';

export function projectName(projects: Project[], slug: string) {
  return projects.find((project) => project.projectSlug === slug)?.displayName || slug;
}

export function typeIcon(type: string) {
  return (
    {
      note: 'N',
      event: 'E',
      knowledge: 'K',
      decision: 'D',
      incident: 'B',
      bug: 'B',
      review: 'R',
      reminder: 'T',
      article: 'A',
      asset: 'S',
    }[type] || 'F'
  );
}
