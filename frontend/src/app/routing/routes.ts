export const routes = {
  home: '/',
  projects: '/projects',
  project: (projectSlug: string) => `/projects/${encodeURIComponent(projectSlug)}`,
  vault: '/vault',
  note: (noteId: string) => `/vault/${encodeURIComponent(noteId)}`,
  reviews: '/reviews',
  review: (reviewId: string) => `/reviews/${encodeURIComponent(reviewId)}`,
  search: '/search',
  reminders: '/reminders',
  integrations: '/settings/integrations',
} as const;

export type View = 'home' | 'projects' | 'vault' | 'reviews' | 'search' | 'reminders' | 'integrations';

export const navItems: Array<{ view: View; label: string; path: string }> = [
  { view: 'home', label: 'Home', path: routes.home },
  { view: 'projects', label: 'Projetos', path: routes.projects },
  { view: 'vault', label: 'Vault', path: routes.vault },
  { view: 'reviews', label: 'Reviews IA', path: routes.reviews },
  { view: 'search', label: 'Busca', path: routes.search },
  { view: 'reminders', label: 'Lembretes', path: routes.reminders },
  { view: 'integrations', label: 'Integracoes', path: routes.integrations },
];
