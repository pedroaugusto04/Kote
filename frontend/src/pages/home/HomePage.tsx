import type { PageContext } from '../../app/page-context';
import type { HomeNavigationTarget, HomePriority } from '../../shared/api/models/dashboard-home';
import { formatDisplayToken, formatUsDate, formatUsDateTime, formatDateInUserTimeZone, formatTimeInUserTimeZone, projectName, reminderDisplayDateTime, typeIcon, getCleanSummary, noteTypeLabel, getTimelineNodeColor } from '../../shared/utils/format';
import { makeTitleClickable } from '../../shared/utils/text';
import { Badge, EmptyState, PageHead, Panel, Tags } from '../../shared/ui/primitives';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { OnboardingChecklist } from '../../features/onboarding/OnboardingChecklist';
import { AttachmentIndicator } from '../../widgets/notes/AttachmentIndicator';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllProjectsTimeline, fetchGithubBackfillStatus, fetchProjectTimeline, fetchProductivityInsights } from '../../shared/api/client';
import { Select } from '../../shared/ui/select';
import { SourceBadge } from '../../widgets/notes/SourceBadge';
import { buildNoteDisplayTags } from '../../shared/utils/note-tags';

export function HomePage({ dashboard, openNote, openProject, createNote }: PageContext) {
  const { home } = dashboard;
  const activeWorkspace = dashboard.workspaces[0] || null;
  const workspaceSlug = activeWorkspace?.workspaceSlug || '';
  const backfillJobId = (() => {
    if (!workspaceSlug) return null;
    try {
      return localStorage.getItem(`kb-github-backfill-job-${workspaceSlug}`);
    } catch {
      return null;
    }
  })();

  const backfillStatusQuery = useQuery({
    queryKey: ['home-github-backfill-status', workspaceSlug, backfillJobId],
    queryFn: () => fetchGithubBackfillStatus(workspaceSlug, backfillJobId || ''),
    enabled: Boolean(workspaceSlug && backfillJobId),
    refetchInterval: (query) => {
      const status = query.state.data?.job?.status;
      if (!status || status === 'completed' || status === 'failed' || status === 'quota_exceeded') {
        return false;
      }
      return 2500;
    },
  });
  const backfillRunning = backfillStatusQuery.data?.job?.status === 'queued'
    || backfillStatusQuery.data?.job?.status === 'running';
  const activityByDay = home.activityByDay.map((point) => ({ ...point, label: formatUsDate(point.date) }));
  const TIMELINE_SIZE = 5;

  const [selectedTimelineProject, setSelectedTimelineProject] = useState<string>('');
  const [activeActivityTab, setActiveActivityTab] = useState<'notes' | 'ai' | 'hours'>('notes');

  const productivityQuery = useQuery({
    queryKey: ['home-productivity-insights'],
    queryFn: fetchProductivityInsights,
    staleTime: 60_000,
  });

  const pInsights = productivityQuery.data;

  // Helpers for timezone mapping
  const formatDateStr = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

  const addDays = (dateStr: string, days: number): string => {
    const d = new Date(`${dateStr}T12:00:00`); // Parse mid-day to avoid DST edge-cases
    d.setDate(d.getDate() + days);
    return formatDateStr(d);
  };

  const getOffsetDateStr = (daysOffset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    return formatDateStr(d);
  };

  const nowDt = new Date();
  const todayStr = formatDateStr(nowDt);
  const yesterdayStr = formatDateStr(new Date(nowDt.getTime() - 24 * 60 * 60 * 1000));

  let currentStreak = 0;
  let weeklyAiData: { label: string; sessions: number }[] = [];
  let hourlyCounts: { hour: number; label: string; Activity: number }[] = [];
  let totalAiInteractions = 0;

  if (pInsights) {
    const activities = pInsights.activities || [];
    totalAiInteractions = activities.filter((a) => a.isAi).length;

    // 1. Calculate active usage streak
    const activeDays = new Set(
      activities.map((a) => {
        const d = new Date(a.createdAt);
        return formatDateStr(d);
      })
    );

    let startCheckingFrom: string | null = null;
    if (activeDays.has(todayStr)) {
      startCheckingFrom = todayStr;
    } else if (activeDays.has(yesterdayStr)) {
      startCheckingFrom = yesterdayStr;
    }

    if (startCheckingFrom) {
      let currentCheckStr = startCheckingFrom;
      while (activeDays.has(currentCheckStr)) {
        currentStreak++;
        currentCheckStr = addDays(currentCheckStr, -1);
      }
    }

    // 2. Weekly AI Sessions (last 4 weeks)
    for (let i = 3; i >= 0; i--) {
      const startOffset = -i * 7 - 6;
      const endOffset = -i * 7;
      const startStr = getOffsetDateStr(startOffset);
      const endStr = getOffsetDateStr(endOffset);

      const count = activities.filter((a) => {
        const d = new Date(a.createdAt);
        const dayStr = formatDateStr(d);
        return a.isAi && dayStr >= startStr && dayStr <= endStr;
      }).length;

      const formatShortDate = (str: string) => {
        const [, m, d] = str.split('-');
        return `${d}/${m}`;
      };

      weeklyAiData.push({
        label: `${formatShortDate(startStr)} to ${formatShortDate(endStr)}`,
        sessions: count,
      });
    }

    // 3. Hourly Activity (last 30 days)
    hourlyCounts = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      Activity: 0,
    }));

    const thirtyDaysAgoStr = getOffsetDateStr(-30);
    activities.forEach((a) => {
      const d = new Date(a.createdAt);
      const dayStr = formatDateStr(d);
      if (dayStr >= thirtyDaysAgoStr) {
        const hour = d.getHours();
        hourlyCounts[hour].Activity += 1;
      }
    });
  }

  const timelineQuery = useQuery({
    queryKey: ['home-project-timeline', selectedTimelineProject],
    queryFn: () => selectedTimelineProject
      ? fetchProjectTimeline(selectedTimelineProject, { page: 1, pageSize: TIMELINE_SIZE, category: 'all', status: '', orderByPin: false })
      : fetchAllProjectsTimeline({ page: 1, pageSize: TIMELINE_SIZE, category: 'all', status: '', orderByPin: false }),
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
    if (priority.type === 'reminder' && priority.reminderAt) {
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
        {activeWorkspace ? (
          <OnboardingChecklist dashboard={dashboard} workspaceSlug={workspaceSlug} />
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

          {/* New Streak KPI Card */}
          {pInsights && (
            <article className="home-kpi insights-kpi-card" key="streak-kpi">
              <div className="home-kpi-head">
                <span className="card-kicker">Usage Streak</span>
                <span className="kpi-symbol">🔥</span>
              </div>
              <div className="home-kpi-body">
                <strong>{currentStreak} {currentStreak === 1 ? 'day' : 'days'}</strong>
                <span className="home-kpi-meta active">Consecutive active days</span>
              </div>
            </article>
          )}

          {/* New AI Interactions KPI Card */}
          {pInsights && (
            <article className="home-kpi insights-kpi-card" key="ai-kpi">
              <div className="home-kpi-head">
                <span className="card-kicker">AI Interactions</span>
                <span className="kpi-symbol">🤖</span>
              </div>
              <div className="home-kpi-body">
                <strong>{totalAiInteractions}</strong>
                <span className="home-kpi-meta">AI searches & chats</span>
              </div>
            </article>
          )}
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

          <Panel className="home-panel home-panel-activity insights-tabbed-panel">
            <div className="panel-head tab-header-container">
              <div className="tab-buttons">
                <button
                  type="button"
                  className={`tab-btn ${activeActivityTab === 'notes' ? 'active' : ''}`}
                  onClick={() => setActiveActivityTab('notes')}
                >
                  Notes (7d)
                </button>
                {pInsights && (
                  <>
                    <button
                      type="button"
                      className={`tab-btn ${activeActivityTab === 'ai' ? 'active' : ''}`}
                      onClick={() => setActiveActivityTab('ai')}
                    >
                      AI Sessions
                    </button>
                    <button
                      type="button"
                      className={`tab-btn ${activeActivityTab === 'hours' ? 'active' : ''}`}
                      onClick={() => setActiveActivityTab('hours')}
                    >
                      Peak Hours (24h)
                    </button>
                  </>
                )}
              </div>
              <span className="meta">
                {activeActivityTab === 'notes' && `${home.activityByDay.reduce((total, point) => total + point.count, 0)} notes`}
                {activeActivityTab === 'ai' && `${totalAiInteractions} total`}
                {activeActivityTab === 'hours' && `30-day pattern`}
              </span>
            </div>
            <div className="chart-box" aria-label="Activity chart">
              <ResponsiveContainer width="100%" height="100%">
                {activeActivityTab === 'notes' ? (
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
                ) : activeActivityTab === 'ai' ? (
                  <AreaChart data={weeklyAiData} margin={{ left: 0, right: 10, top: 12, bottom: 0 }}>
                    <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="var(--chart-axis)" fontSize={12} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} stroke="var(--chart-axis)" fontSize={12} width={28} />
                    <Tooltip
                      contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, color: 'var(--chart-tooltip-text)' }}
                      labelStyle={{ color: 'var(--chart-tooltip-text)' }}
                    />
                    <Area type="monotone" dataKey="sessions" name="AI Sessions" stroke="var(--chart-area-stroke)" fill="var(--chart-area-fill)" strokeWidth={2} />
                  </AreaChart>
                ) : (
                  <BarChart data={hourlyCounts} margin={{ left: 0, right: 10, top: 12, bottom: 0 }}>
                    <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="var(--chart-axis)" fontSize={11} interval={2} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} stroke="var(--chart-axis)" fontSize={12} width={28} />
                    <Tooltip
                      contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, color: 'var(--chart-tooltip-text)' }}
                      labelStyle={{ color: 'var(--chart-tooltip-text)' }}
                    />
                    <Bar dataKey="Activity" fill="var(--chart-bar-fill)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                )}
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
              <EmptyState>
                {backfillRunning
                  ? `Importing your recent GitHub commits… ${backfillStatusQuery.data?.job?.processed ?? 0}/${backfillStatusQuery.data?.job?.total ?? 0} processed.`
                  : 'No timeline events found for this project.'}
              </EmptyState>
            ) : (
              <div className="home-timeline">
                {timelineItems.map((item) => {
                  const activeSource = item.source || item.sourceChannel;
                  const displayTags = buildNoteDisplayTags({ tags: item.tags, categories: item.categories });
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
                          {displayTags.length ? <Tags items={displayTags} /> : null}
                          <span className="meta">
                            {projectName(dashboard.projects, item.project)} / {formatDateInUserTimeZone(item.date)} {formatTimeInUserTimeZone(item.date)}
                          </span>
                          <AttachmentIndicator count={item.attachmentCount || 0} />
                          <Badge value={formatDisplayToken(item.status)} tone={item.status} />
                        </div>
                        <h3 className="home-timeline-title">
                          {(() => {
                            const { text: titleText, url: titleUrl } = makeTitleClickable(item.title);
                            return titleUrl ? (
                              <>
                                {titleText} - <a href={titleUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: 'var(--accent)', textDecoration: 'underline' }}>{titleUrl}</a>
                              </>
                            ) : item.title;
                          })()}
                        </h3>
                        <SourceBadge source={activeSource} iconSize={16} />
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
