import type { PageContext } from '../../app/page-context';
import type { HomeNavigationTarget, HomePriority } from '../../shared/api/models/dashboard-home';
import { formatDisplayToken, formatUsDate, projectName, reminderDisplayDateTime } from '../../shared/utils/format';
import { Badge, EmptyState, PageHead, Panel } from '../../shared/ui/primitives';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { routes } from '../../app/routing/routes';
import { AttachmentIndicator } from '../../widgets/notes/AttachmentIndicator';

export function HomePage({ dashboard, openNote, openProject, createNote }: PageContext) {
  const { home } = dashboard;
  const activeWorkspace = dashboard.workspaces[0] || null;
  const hasRepositories = dashboard.projects.some((p) => p.repositories.length > 0);
  const needsIntegrationSetup = activeWorkspace && !hasRepositories;
  const activityByDay = home.activityByDay.map((point) => ({ ...point, label: formatUsDate(point.date) }));

  function openTarget(target: HomeNavigationTarget) {
    if (target.kind === 'project' && target.slug) {
      openProject(target.slug);
      return;
    }
    if (target.id) {
      openNote(target.id);
    }
  }

  function priorityTone(priority: HomePriority) {
    if (priority.type === 'reminder') return priority.isOverdue ? 'high' : (priority.status || priority.type);
    if (priority.severity) return priority.severity;
    if (priority.type === 'incident') return 'medium';
    return priority.status || priority.type;
  }

  function priorityLabel(priority: HomePriority) {
    if (priority.type === 'finding' && priority.severity) {
      return priority.severity;
    }
    if (priority.status) return priority.status;
    return priority.type;
  }

  function priorityMeta(priority: HomePriority) {
    if (priority.type === 'reminder' && (priority.reminderAt || priority.reminderDate)) {
      return `${projectName(dashboard.projects, priority.project)} / ${reminderDisplayDateTime(priority)}`;
    }
    return `${projectName(dashboard.projects, priority.project)} / ${formatUsDate(priority.date)}`;
  }

  return (
    <>
      <PageHead
        title="Home"
        subtitle={`Relevant updates from the last ${home.windowDays} days.`}
        action={
          createNote ? (
            <button className="icon-button" type="button" onClick={() => createNote()}>
              Quick note
            </button>
          ) : undefined
        }
      />
      <section className="home-layout">
        {needsIntegrationSetup ? (
          <Panel className="setup-inline-banner">
            <div>
              <strong>Finish setting up workspace integrations</strong>
              <p className="meta">Connect GitHub for push reviews and WhatsApp or Telegram to capture notes from conversations.</p>
            </div>
            <Link className="icon-button" to={routes.integrations}>Connect integrations</Link>
          </Panel>
        ) : null}

        <section className="home-kpis" aria-label="Operational indicators">
          {home.metrics.slice(0, 4).map((metric) => (
            <article className="home-kpi" key={metric.id}>
              <div className="home-kpi-head">
                <span className="card-kicker">{metric.label}</span>
              </div>
              <div className="home-kpi-body">
                <strong>{metric.value}</strong>
                <span className={`home-kpi-meta ${metric.tone || ''}`}>{metric.meta}</span>
              </div>
            </article>
          ))}
        </section>

        <section className="home-main-grid" aria-label="Operational summary">
          <Panel className="home-panel home-panel-priorities">
            <div className="panel-head">
              <h2>Priorities</h2>
              <span className="meta">top 5</span>
            </div>
            {home.priorities.length ? (
              <div className="list">
                {home.priorities.slice(0, 5).map((priority) => (
                  <article className="list-row clickable home-priority-row" key={priority.id} onClick={() => openTarget(priority.target)}>
                    <div className="list-row-body">
                      <div className="meta-row">
                        <Badge value={formatDisplayToken(priorityLabel(priority))} tone={priorityTone(priority)} />
                        <span className="meta">{priorityMeta(priority)}</span>
                      </div>
                      <h3>{priority.title}</h3>
                      <p>{priority.description}</p>
                    </div>
                    <span className="file-icon">{priority.type === 'finding' ? 'R' : '!'}</span>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState>No open priorities in this window.</EmptyState>
            )}
          </Panel>

          <Panel className="home-panel home-panel-activity">
            <div className="panel-head">
              <h2>Activity from the last 7 days</h2>
              <span className="meta">{home.activityByDay.reduce((total, point) => total + point.count, 0)} notes</span>
            </div>
            <div className="chart-box" aria-label="Activity chart by day">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityByDay} margin={{ left: 0, right: 10, top: 12, bottom: 0 }}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="var(--chart-axis)" fontSize={12} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} stroke="var(--chart-axis)" fontSize={12} width={28} />
                  <Tooltip
                    contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, color: 'var(--chart-tooltip-text)' }}
                    labelStyle={{ color: 'var(--chart-tooltip-text)' }}
                  />
                  <Area type="monotone" dataKey="count" name="Notes" stroke="var(--chart-area-stroke)" fill="var(--chart-area-fill)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel className="home-panel home-panel-projects">
            <div className="panel-head">
              <h2>Active projects</h2>
              <span className="meta">top 5</span>
            </div>
            {home.activityByProject.length ? (
              <div className="chart-box compact" aria-label="Activity chart by project">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={home.activityByProject} layout="vertical" margin={{ left: 4, right: 18, top: 8, bottom: 8 }}>
                    <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={116} stroke="var(--chart-axis)" fontSize={12} />
                    <Tooltip
                      contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, color: 'var(--chart-tooltip-text)' }}
                      labelStyle={{ color: 'var(--chart-tooltip-text)' }}
                    />
                    <Bar dataKey="count" name="Notes" fill="var(--chart-bar-fill)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState>No recent activity by project.</EmptyState>
            )}
            <div className="compact-links spaced">
              {home.activityByProject.slice(0, 5).map((project) => (
                <button className="home-project-link" type="button" key={project.project} onClick={() => openProject(project.project)}>
                  <span>{project.label}</span>
                  <Badge value={project.count} tone="active" />
                </button>
              ))}
            </div>
          </Panel>

          <Panel className="home-panel home-panel-events">
            <div className="panel-head">
              <h2>Relevant recent events</h2>
              <span className="meta">top 5</span>
            </div>
            {home.recentInterestingEvents.length ? (
              <div className="list">
                {home.recentInterestingEvents.slice(0, 5).map((event) => (
                  <article className="list-row clickable" key={event.id} onClick={() => openTarget(event.target)}>
                    <div className="list-row-body">
                      <div className="meta-row">
                        <Badge value={formatDisplayToken(event.category)} tone={event.category} />
                        <Badge value={formatDisplayToken(event.type)} tone={event.type} />
                        <Badge value={formatDisplayToken(event.status)} tone={event.status} />
                        <span className="meta">
                          {projectName(dashboard.projects, event.project)} / {formatUsDate(event.date)}
                        </span>
                        <AttachmentIndicator count={event.attachmentCount || 0} />
                      </div>
                      <h3>{event.title}</h3>
                      <p>{event.summary}</p>
                    </div>
                    <span className="file-icon">E</span>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState>No relevant events in this window.</EmptyState>
            )}
          </Panel>
        </section>
      </section>
    </>
  );
}
