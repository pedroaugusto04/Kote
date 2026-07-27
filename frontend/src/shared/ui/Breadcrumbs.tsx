import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { noteDetailQueryOptions } from '../api/note-query';
import type { Project } from '../api/models/project';
import { routes } from '../../app/routing/routes';
import { UI_MESSAGES } from '../constants/ui.constants';

type BreadcrumbsProps = {
  projects: Project[];
};

type BreadcrumbItem = { label: string; to?: string };

type BreadcrumbNote = {
  project: string;
  title: string;
};

function projectDisplayName(projects: Project[], projectSlug: string) {
  return projects.find((project) => project.projectSlug === projectSlug)?.displayName || projectSlug;
}

function pathSlug(pathname: string, route: string) {
  const match = pathname.match(new RegExp(`^${route}/([^/]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function fallbackBreadcrumbs(pathname: string): BreadcrumbItem[] {
  return pathname.split('/').filter(Boolean).map((part, index, parts) => {
    const label = part.charAt(0).toUpperCase() + part.slice(1);
    const isLast = index === parts.length - 1;
    const to = `/${parts.slice(0, index + 1).join('/')}`;
    return { label, to: isLast ? undefined : to };
  });
}

function buildProjectBreadcrumbs(pathname: string, projects: Project[]): BreadcrumbItem[] {
  const projectSlug = pathSlug(pathname, routes.projects);
  if (!projectSlug) return [{ label: UI_MESSAGES.PROJECTS }];
  return [
    { label: UI_MESSAGES.PROJECTS, to: routes.projects },
    { label: projectDisplayName(projects, projectSlug) },
  ];
}

function buildKnowledgeMapBreadcrumbs(pathname: string, projects: Project[]): BreadcrumbItem[] {
  const projectSlug = pathSlug(pathname, routes.map);
  if (!projectSlug) return [{ label: UI_MESSAGES.KNOWLEDGE_MAP }];
  return [
    { label: UI_MESSAGES.KNOWLEDGE_MAP, to: routes.map },
    { label: projectDisplayName(projects, projectSlug) },
  ];
}

function buildVaultBreadcrumbs(note: BreadcrumbNote | undefined, projects: Project[]): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [{ label: UI_MESSAGES.PROJECTS, to: routes.projects }];
  if (!note) return [...items, { label: UI_MESSAGES.NOTE }];

  const project = projects.find((item) => item.projectSlug === note.project);
  if (project) {
    items.push({
      label: project.displayName,
      to: routes.project(project.projectSlug),
    });
  }
  items.push({ label: note.title });
  return items;
}

function buildBreadcrumbItems(pathname: string, projects: Project[], note: BreadcrumbNote | undefined): BreadcrumbItem[] {
  const home = { label: UI_MESSAGES.HOME, to: routes.home };

  if (pathname.startsWith(routes.projects)) return [home, ...buildProjectBreadcrumbs(pathname, projects)];
  if (pathname.startsWith(routes.map)) return [home, ...buildKnowledgeMapBreadcrumbs(pathname, projects)];
  if (pathname.startsWith(routes.vault)) return [home, ...buildVaultBreadcrumbs(note, projects)];
  if (pathname === routes.search) return [home, { label: UI_MESSAGES.SEARCH }];
  if (pathname === routes.reminders) return [home, { label: UI_MESSAGES.REMINDERS }];
  if (pathname === routes.profile) return [home, { label: UI_MESSAGES.PROFILE }];
  if (pathname.startsWith(routes.integrations)) {
    return [home, { label: UI_MESSAGES.SETTINGS, to: routes.profile }, { label: UI_MESSAGES.INTEGRATIONS }];
  }

  return [home, ...fallbackBreadcrumbs(pathname)];
}

export function Breadcrumbs({ projects }: BreadcrumbsProps) {
  const { pathname } = useLocation();

  const noteId = pathSlug(pathname, routes.vault);
  const noteQuery = useQuery({
    ...noteDetailQueryOptions(noteId || ''),
    enabled: !!noteId,
  });

  if (pathname === routes.home || pathname === '') {
    return null;
  }

  const items = buildBreadcrumbItems(pathname, projects, noteQuery.data);

  return (
    <nav className="global-breadcrumbs" aria-label={UI_MESSAGES.BREADCRUMBS}>
      <ol className="breadcrumbs-list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={index} className="breadcrumbs-item">
              {index > 0 && <span className="breadcrumbs-separator" aria-hidden="true">/</span>}
              {item.to && !isLast ? (
                <Link to={item.to} className="breadcrumbs-link">
                  {item.label}
                </Link>
              ) : (
                <span className="breadcrumbs-current">{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
