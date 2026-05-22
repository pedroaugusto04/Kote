export const routes = {
  setup: '/setup',
  home: '/',
  auth: '/auth',
  projects: '/projects',
  project: (projectSlug: string) => `/projects/${encodeURIComponent(projectSlug)}`,
  vault: '/vault',
  note: (noteId: string) => `/vault/${encodeURIComponent(noteId)}`,
  search: '/search',
  kanban: '/kanban',
  reminders: '/reminders',
  profile: '/profile',
  integrations: '/settings/integrations',
} as const;

export type View = 'home' | 'projects' | 'note' | 'search' | 'kanban' | 'reminders' | 'profile' | 'integrations';

export const navItems: Array<{ view: View; label: string; path: string }> = [
  { view: 'home', label: 'Home', path: routes.home },
  { view: 'projects', label: 'Projects', path: routes.projects },
  { view: 'search', label: 'Search', path: routes.search },
  { view: 'kanban', label: 'Kanban', path: routes.kanban },
  { view: 'reminders', label: 'Reminders', path: routes.reminders },
  { view: 'integrations', label: 'Integrations', path: routes.integrations },
];
