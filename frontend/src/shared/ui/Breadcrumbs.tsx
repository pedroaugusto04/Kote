import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { noteDetailQueryOptions } from '../api/note-query';
import type { Project } from '../api/models/project';

type BreadcrumbsProps = {
  projects: Project[];
};

export function Breadcrumbs({ projects }: BreadcrumbsProps) {
  const { pathname } = useLocation();

  // Detect if we are on a note detail page
  const matchVault = pathname.match(/^\/vault\/([^/]+)/);
  const noteId = matchVault ? decodeURIComponent(matchVault[1]) : null;
  const noteQuery = useQuery({
    ...noteDetailQueryOptions(noteId || ''),
    enabled: !!noteId,
  });

  // If path is exactly "/" (home page), we don't render breadcrumbs
  if (pathname === '/' || pathname === '') {
    return null;
  }

  // Generate breadcrumb items
  const items: { label: string; to?: string }[] = [];

  // Always start with Home
  items.push({ label: 'Home', to: '/' });

  if (pathname.startsWith('/projects')) {
    const matchProject = pathname.match(/^\/projects\/([^/]+)/);
    const projectSlug = matchProject ? decodeURIComponent(matchProject[1]) : null;

    if (projectSlug) {
      items.push({ label: 'Projects', to: '/projects' });
      const project = projects.find((p) => p.projectSlug === projectSlug);
      items.push({ label: project ? project.displayName : projectSlug });
    } else {
      items.push({ label: 'Projects' });
    }
  } else if (pathname.startsWith('/map')) {
    const matchMapProject = pathname.match(/^\/map\/([^/]+)/);
    const projectSlug = matchMapProject ? decodeURIComponent(matchMapProject[1]) : null;

    if (projectSlug) {
      items.push({ label: 'Knowledge Map', to: '/map' });
      const project = projects.find((p) => p.projectSlug === projectSlug);
      items.push({ label: project ? project.displayName : projectSlug });
    } else {
      items.push({ label: 'Knowledge Map' });
    }
  } else if (pathname.startsWith('/vault')) {
    items.push({ label: 'Projects', to: '/projects' });
    if (noteQuery.data) {
      const project = projects.find((p) => p.projectSlug === noteQuery.data.project);
      if (project) {
        items.push({
          label: project.displayName,
          to: `/projects/${project.projectSlug}`,
        });
      }
      items.push({ label: noteQuery.data.title });
    } else {
      items.push({ label: 'Note' });
    }
  } else if (pathname === '/search') {
    items.push({ label: 'Search' });
  } else if (pathname === '/kanban') {
    items.push({ label: 'Kanban' });
  } else if (pathname === '/reminders') {
    items.push({ label: 'Reminders' });
  } else if (pathname === '/profile') {
    items.push({ label: 'Profile' });
  } else if (pathname.startsWith('/settings/integrations')) {
    items.push({ label: 'Settings', to: '/profile' });
    items.push({ label: 'Integrations' });
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
    <nav className="global-breadcrumbs" aria-label="Breadcrumbs">
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
