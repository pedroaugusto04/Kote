import type { PageContext } from '../../app/page-context';
import type { HomeNavigationTarget, HomePriority } from '../../shared/api/models/dashboard-home';
import { formatDisplayToken, formatUsDate, formatUsDateTime, noteTypeLabel, projectName, reminderDisplayDateTime, typeIcon, getCleanSummary } from '../../shared/utils/format';
import { Badge, EmptyState, PageHead, Panel } from '../../shared/ui/primitives';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { routes } from '../../app/routing/routes';
import { AttachmentIndicator } from '../../widgets/notes/AttachmentIndicator';
import { SourceBadge } from '../../widgets/notes/SourceBadge';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllProjectsTimeline, fetchProjectTimeline } from '../../shared/api/client';
import { Select } from '../../shared/ui/select';

export function HomePage({ dashboard, openNote, openProject, createNote }: PageContext) {
  const { home } = dashboard;
  const activeWorkspace = dashboard.workspaces[0] || null;
  const hasRepositories = dashboard.projects.some((p) => p.repositories.length > 0);
  const needsIntegrationSetup = activeWorkspace && !hasRepositories;
  const activityByDay = home.activityByDay.map((point) => ({ ...point, label: formatUsDate(point.date) }));
  const TIMELINE_SIZE = 5;

  const [selectedTimelineProject, setSelectedTimelineProject] = useState<string>('');

  const timelineQuery = useQuery({
    queryKey: ['home-project-timeline', selectedTimelineProject],
    queryFn: () => selectedTimelineProject
      ? fetchProjectTimeline(selectedTimelineProject, { page: 1, pageSize: TIMELINE_SIZE, category: 'all', status: '' })
      : fetchAllProjectsTimeline({ page: 1, pageSize: TIMELINE_SIZE, category: 'all', status: '' }),
    staleTime: 0,
  });

  const timelineItems = timelineQuery.data?.timeline || [];

  const projectOptions = [
    { value: '', label: 'All Projects' },
    ...dashboard.projects.map((project) => ({
      value: project.projectSlug,
      label: project.displayName,
    })),
  ];

  function getTimelineNodeColor(category: string, type: string) {
    if (category === 'github-push') return 'var(--cyan)';
    if (category === 'whatsapp') return 'var(--green)';
    if (type === 'incident') return 'var(--red)';
    if (type === 'decision' || category === 'decision') return 'var(--amber)';
    return 'var(--muted)';
  }

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

          <Panel className="home-panel home-panel-timeline">
            <div className="panel-head">
              <h2>Project Activity Timeline</h2>
              <Select
                ariaLabel="Filter timeline by project"
                className="timeline-project-select"
                options={projectOptions}
                value={selectedTimelineProject}
                onChange={setSelectedTimelineProject}
              />
            </div>
            {timelineQuery.isPending ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>Loading timeline...</div>
            ) : timelineQuery.isError ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--red)' }}>Failed to load timeline.</div>
            ) : timelineItems.length === 0 ? (
              <EmptyState>No timeline events found for this project.</EmptyState>
            ) : (
              <div className="home-timeline">
                {timelineItems.map((item) => {
                  const activeSource = item.source || item.sourceChannel;
                  return (
                    <article className="home-timeline-item clickable" key={item.id} onClick={() => openNote(item.noteId)}>
                      <div
                        className="home-timeline-dot"
                        style={{
                          color: getTimelineNodeColor(item.category, item.type),
                          backgroundColor: getTimelineNodeColor(item.category, item.type),
                        }}
                      />
                      <div className="home-timeline-content">
                        <div className="home-timeline-meta">
                          <Badge value={formatDisplayToken(item.category)} tone={item.category} />
                          <Badge value={noteTypeLabel(item.type)} tone={item.type} />
                          <Badge value={formatDisplayToken(item.status)} tone={item.status} />
                          <span className="meta">
                            {projectName(dashboard.projects, item.project)} / {formatUsDate(item.date)}
                          </span>
                          <AttachmentIndicator count={item.attachmentCount || 0} />
                        </div>
                        <h3 className="home-timeline-title">
                          {item.title}
                        </h3>
                        <SourceBadge source={activeSource} />
                        <p className="home-timeline-summary">{getCleanSummary(item.summary)}</p>
                      </div>
                      <span className="file-icon">{typeIcon(item.type)}</span>
                    </article>
                  );
                })}
              </div>
            )}
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
        </section>
      </section>
    </>
  );
}
