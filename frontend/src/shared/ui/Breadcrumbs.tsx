import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { noteDetailQueryOptions } from '../api/note-query';
import type { Project } from '../api/models/project';
import { routes } from '../../app/routing/routes';
import { UI_MESSAGES } from '../constants/ui.constants';

type BreadcrumbsProps = {
  projects: Project[];
};

export function Breadcrumbs({ projects }: BreadcrumbsProps) {
  const { pathname } = useLocation();

  // Detect if we are on a note detail page
  const matchVault = pathname.match(new RegExp(`^${routes.vault}/([^/]+)`));
  const noteId = matchVault ? decodeURIComponent(matchVault[1]) : null;
  const noteQuery = useQuery({
    ...noteDetailQueryOptions(noteId || ''),
    enabled: !!noteId,
  });

  // If path is exactly "/" (home page), we don't render breadcrumbs
  if (pathname === routes.home || pathname === '') {
    return null;
  }

  // Generate breadcrumb items
  const items: { label: string; to?: string }[] = [];

  // Always start with Home
  items.push({ label: UI_MESSAGES.HOME, to: routes.home });

  if (pathname.startsWith(routes.projects)) {
    const matchProject = pathname.match(new RegExp(`^${routes.projects}/([^/]+)`));
    const projectSlug = matchProject ? decodeURIComponent(matchProject[1]) : null;

    if (projectSlug) {
      items.push({ label: UI_MESSAGES.PROJECTS, to: routes.projects });
      const project = projects.find((p) => p.projectSlug === projectSlug);
      items.push({ label: project ? project.displayName : projectSlug });
    } else {
      items.push({ label: UI_MESSAGES.PROJECTS });
    }
  } else if (pathname.startsWith(routes.map)) {
    const matchMapProject = pathname.match(new RegExp(`^${routes.map}/([^/]+)`));
    const projectSlug = matchMapProject ? decodeURIComponent(matchMapProject[1]) : null;

    if (projectSlug) {
      items.push({ label: UI_MESSAGES.KNOWLEDGE_MAP, to: routes.map });
      const project = projects.find((p) => p.projectSlug === projectSlug);
      items.push({ label: project ? project.displayName : projectSlug });
    } else {
      items.push({ label: UI_MESSAGES.KNOWLEDGE_MAP });
    }
  } else if (pathname.startsWith(routes.vault)) {
    items.push({ label: UI_MESSAGES.PROJECTS, to: routes.projects });
    if (noteQuery.data) {
      const project = projects.find((p) => p.projectSlug === noteQuery.data.project);
      if (project) {
        items.push({
          label: project.displayName,
          to: routes.project(project.projectSlug),
        });
      }
      items.push({ label: noteQuery.data.title });
    } else {
      items.push({ label: UI_MESSAGES.NOTE });
    }
  } else if (pathname === routes.search) {
    items.push({ label: UI_MESSAGES.SEARCH });
  } else if (pathname === routes.kanban) {
    items.push({ label: UI_MESSAGES.KANBAN });
  } else if (pathname === routes.reminders) {
    items.push({ label: UI_MESSAGES.REMINDERS });
  } else if (pathname === routes.profile) {
    items.push({ label: UI_MESSAGES.PROFILE });
  } else if (pathname.startsWith(routes.integrations)) {
    items.push({ label: UI_MESSAGES.SETTINGS, to: routes.profile });
    items.push({ label: UI_MESSAGES.INTEGRATIONS });
  } else {
    // Fallback: split the path
    const parts = pathname.split('/').filter(Boolean);
    parts.forEach((part, index) => {
      const label = part.charAt(0).toUpperCase() + part.slice(1);
      const isLast = index === parts.length - 1;
      const to = '/' + parts.slice(0, index + 1).join('/');
      items.push({ label, to: isLast ? undefined : to });
    });
  }

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
