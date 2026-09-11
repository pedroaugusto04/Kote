import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { navItems, routes, type View } from '../app/routing/routes';
import { BrandMark } from '../shared/ui/brand-mark';
import { Sparkline } from '../shared/ui/Sparkline';
import { ProjectCoverageBadge } from '../features/projects/components/ProjectCoverageBadge';
import { HomeIcon, ProjectsIcon, RemindersIcon, MapIcon } from '../shared/ui/icons';
import { AskAiIcon } from '../widgets/ask/AskAiIcon';
import { UI_MESSAGES } from '../shared/constants/ui.constants';
import type { Dashboard } from '../shared/api/models/dashboard';

const navIconMap: Record<View, React.ReactNode> = {
  home: <HomeIcon className="nav-item-icon" />,
  projects: <ProjectsIcon className="nav-item-icon" />,
  search: <AskAiIcon className="nav-item-icon" />,
  reminders: <RemindersIcon className="nav-item-icon" />,
  map: <MapIcon className="nav-item-icon" />,
  note: null,
  profile: null,
  integrations: null,
  subscription: null,
  help: null,
  automations: null,
};

interface AppSidebarProps {
  isMobileNavOpen: boolean;
  onCloseMobileNav: () => void;
  view: View;
  activeWorkspace: {
    workspaceSlug: string;
    displayName: string;
  };
  projects: Dashboard['projects'];
  selectedProject: string;
  onOpenProject: (slug: string) => void;
  onToggleFavorite: (slug: string, favorite: boolean) => void;
}

export function AppSidebar({
  isMobileNavOpen,
  onCloseMobileNav,
  view,
  activeWorkspace,
  projects,
  selectedProject,
  onOpenProject,
  onToggleFavorite,
}: AppSidebarProps) {
  const [isProjectsExpanded, setIsProjectsExpanded] = useState(false);

  return (
    <>
      <button
        aria-label={UI_MESSAGES.CLOSE_NAVIGATION}
        aria-hidden={!isMobileNavOpen}
        className={`mobile-nav-backdrop ${isMobileNavOpen ? 'visible' : ''}`}
        onClick={onCloseMobileNav}
        tabIndex={isMobileNavOpen ? 0 : -1}
        type="button"
      />
      <aside className={`sidebar ${isMobileNavOpen ? 'open' : ''}`} aria-label={UI_MESSAGES.VAULT_NAVIGATION} id="app-sidebar">
        <div className="sidebar-main-content">
          <Link className="brand" to={routes.home} aria-label={UI_MESSAGES.GO_TO_HOME}>
            <BrandMark />
            <div>
              <strong>{UI_MESSAGES.KNOWLEDGE_VAULT}</strong>
              <span>{UI_MESSAGES.DEVELOPER_KNOWLEDGE_BASE}</span>
            </div>
          </Link>
          <nav className="main-nav" aria-label={UI_MESSAGES.MAIN_SECTIONS}>
            {navItems.map((item) => (
              <NavLink
                className={({ isActive }) => `nav-item ${isActive || view === item.view ? 'active' : ''}`}
                end={item.path === routes.home}
                key={item.view}
                onClick={onCloseMobileNav}
                to={item.path}
              >
                {navIconMap[item.view]}
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
          <section className="sidebar-section">
            <div className="section-label">{UI_MESSAGES.WORKSPACE}</div>
            <div
              className="workspace-pill workspace-pill-static"
              aria-label={`${UI_MESSAGES.CURRENT_WORKSPACE} ${activeWorkspace.workspaceSlug}`}
              role="status"
            >
              <span className="status-dot" />
              <span className="workspace-pill-copy">
                <strong>{activeWorkspace.displayName}</strong>
                <small>{activeWorkspace.workspaceSlug}</small>
              </span>
            </div>
          </section>
          <section className="sidebar-section">
            <div className="section-label-header">
              <div className="section-label">{UI_MESSAGES.PROJECTS}</div>
              {projects.length > 8 && (
                <button
                  className="section-toggle-btn"
                  type="button"
                  onClick={() => setIsProjectsExpanded((prev) => !prev)}
                >
                  {isProjectsExpanded ? 'Collapse' : `All (${projects.length})`}
                </button>
              )}
            </div>
            <div className="tree">
              {(isProjectsExpanded ? projects : projects.slice(0, 8)).map((project) => (
                <div className="tree-item-row" key={project.projectSlug}>
                  <button
                    className={`tree-item ${project.projectSlug === selectedProject ? 'active' : ''}`}
                    type="button"
                    onClick={() => {
                      onOpenProject(project.projectSlug);
                      onCloseMobileNav();
                    }}
                  >
                    <ProjectsIcon className="tree-item-icon" />
                    <span className="tree-item-label">{project.displayName}</span>
                    {project.activitySparkline && (
                      <div className="project-sparkline" style={{ width: '40px', height: '16px', marginLeft: 'auto', marginRight: '4px', flexShrink: 0 }}>
                        <Sparkline
                          data={project.activitySparkline}
                          width={40}
                          height={16}
                          stroke={project.projectSlug === selectedProject ? 'var(--text)' : 'var(--muted)'}
                          strokeWidth={1.5}
                        />
                      </div>
                    )}
                  </button>
                  <ProjectCoverageBadge
                    projectSlug={project.projectSlug}
                    projectDisplayName={project.displayName}
                    onlyCircle
                  />
                  <button
                    aria-label={project.favorite ? UI_MESSAGES.UNSTAR : UI_MESSAGES.STAR}
                    className={`favorite-star ${project.favorite ? 'active' : ''}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleFavorite(project.projectSlug, !project.favorite);
                    }}
                    type="button"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill={project.favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
        <div className="sidebar-footer">
          <Link to={routes.help} className="sidebar-footer-link" onClick={onCloseMobileNav}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 16, height: 16 }}>
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>Help & Documentation</span>
          </Link>
        </div>
      </aside>
    </>
  );
}
