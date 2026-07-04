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
  reminders: '/reminders',
  profile: '/profile',
  integrations: '/automations/integrations',
  subscription: '/automations/subscription',
  automations: '/automations',
  help: '/help',
  extensionPrivacy: '/extension/privacy',
} as const;

export type View = 'home' | 'map' | 'projects' | 'note' | 'search' | 'reminders' | 'profile' | 'integrations' | 'subscription' | 'help' | 'automations';


export const navItems: Array<{ view: View; label: string; path: string }> = [
  { view: 'home', label: 'Home', path: routes.home },
  { view: 'projects', label: 'Projects', path: routes.projects },
  { view: 'search', label: 'Ask AI', path: routes.search },
  { view: 'reminders', label: 'Reminders', path: routes.reminders },
  { view: 'map', label: 'Map', path: routes.map },
];
