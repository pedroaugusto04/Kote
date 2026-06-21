export const routes = {
  setup: '/setup',
  home: '/',
  auth: '/auth',
  map: '/map',
  projects: '/projects',
  project: (projectSlug: string) => `/projects/${encodeURIComponent(projectSlug)}`,
  projectMap: (projectSlug: string) => `/map/${encodeURIComponent(projectSlug)}`,
  vault: '/vault',
  note: (noteId: string) => `/vault/${encodeURIComponent(noteId)}`,
  search: '/search',
  kanban: '/kanban',
  reminders: '/reminders',
  profile: '/profile',
  integrations: '/settings/integrations',
  subscription: '/settings/subscription',
  help: '/help',
} as const;

export type View = 'home' | 'map' | 'projects' | 'note' | 'search' | 'kanban' | 'reminders' | 'profile' | 'integrations' | 'subscription' | 'help';


export const navItems: Array<{ view: View; label: string; path: string }> = [
  { view: 'home', label: 'Home', path: routes.home },
  { view: 'projects', label: 'Projects', path: routes.projects },
  { view: 'search', label: 'Ask AI', path: routes.search },
  { view: 'kanban', label: 'Kanban', path: routes.kanban },
  { view: 'reminders', label: 'Reminders', path: routes.reminders },
  { view: 'map', label: 'Map', path: routes.map },
];
