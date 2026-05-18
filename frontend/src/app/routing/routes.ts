export const routes = {
  setup: '/setup',
  home: '/',
  auth: '/auth',
  projects: '/projects',
  project: (projectSlug: string) => `/projects/${encodeURIComponent(projectSlug)}`,
  vault: '/vault',
  note: (noteId: string) => `/vault/${encodeURIComponent(noteId)}`,
  search: '/search',
  reminders: '/reminders',
  integrations: '/settings/integrations',
} as const;

export type View = 'home' | 'projects' | 'note' | 'search' | 'reminders' | 'integrations';

export const navItems: Array<{ view: View; label: string; path: string }> = [
  { view: 'home', label: 'Home', path: routes.home },
  { view: 'projects', label: 'Projects', path: routes.projects },
  { view: 'search', label: 'Search', path: routes.search },
  { view: 'reminders', label: 'Reminders', path: routes.reminders },
  { view: 'integrations', label: 'Integrations', path: routes.integrations },
];
