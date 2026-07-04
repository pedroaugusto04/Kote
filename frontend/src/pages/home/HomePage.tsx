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
            <button className="px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-500 hover:bg-cyan-600 text-black shadow-sm transition-colors cursor-pointer" type="button" onClick={() => createNote()}>
              Quick note
            </button>
          ) : undefined
        }
      />
      <div className="space-y-6">
        {activeWorkspace ? (
          <OnboardingChecklist dashboard={dashboard} workspaceSlug={workspaceSlug} />
        ) : null}

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Operational indicators">
          {home.metrics.slice(0, 4).map((metric) => (
            <article className="bg-panel border border-line/40 rounded-xl p-5 shadow-card dark:shadow-card-dark flex flex-col justify-between transition-all hover:border-line/70 duration-300" key={metric.id}>
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{metric.label}</span>
              </div>
              <div className="flex flex-col text-left">
                <strong className="text-2xl font-bold text-text-strong tracking-tight">{metric.value}</strong>
                <span className={`text-[11px] mt-1 ${metric.tone === 'success' || metric.tone === 'active' ? 'text-emerald-500 font-medium' : metric.tone === 'error' || metric.tone === 'failed' ? 'text-rose-500 font-medium' : 'text-muted'}`}>{metric.meta}</span>
              </div>
            </article>
          ))}

          {/* New Streak KPI Card */}
          {pInsights && (
            <article className="bg-panel border border-line/40 rounded-xl p-5 shadow-card dark:shadow-card-dark flex flex-col justify-between transition-all hover:border-line/70 duration-300" key="streak-kpi">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Usage Streak</span>
                <span className="text-base">🔥</span>
              </div>
              <div className="flex flex-col text-left">
                <strong className="text-2xl font-bold text-text-strong tracking-tight">{currentStreak} {currentStreak === 1 ? 'day' : 'days'}</strong>
                <span className="text-[11px] text-emerald-500 font-medium mt-1">Consecutive active days</span>
              </div>
            </article>
          )}

          {/* New AI Interactions KPI Card */}
          {pInsights && (
            <article className="bg-panel border border-line/40 rounded-xl p-5 shadow-card dark:shadow-card-dark flex flex-col justify-between transition-all hover:border-line/70 duration-300" key="ai-kpi">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">AI Interactions</span>
                <span className="text-base">✨</span>
              </div>
              <div className="flex flex-col text-left">
                <strong className="text-2xl font-bold text-text-strong tracking-tight">{totalAiInteractions}</strong>
                <span className="text-[11px] text-muted mt-1">AI searches & chats</span>
              </div>
            </article>
          )}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6" aria-label="Operational summary">
          <Panel className="home-panel home-panel-priorities lg:col-span-6 flex flex-col h-full justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-line/30">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-text-strong">Priorities</h2>
                <span className="text-[10px] text-muted font-medium uppercase tracking-wider">top 5</span>
              </div>
              {home.priorities.length ? (
                <div className="space-y-3">
                  {home.priorities.slice(0, 5).map((priority) => (
                    <article className="flex items-start justify-between p-3.5 rounded-lg border border-line/30 hover:border-line/60 bg-panel/30 hover:bg-line/10 transition-all cursor-pointer" key={priority.id} onClick={() => openTarget(priority.target)}>
                      <div className="flex-1 min-w-0 pr-4 text-left">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Badge value={formatDisplayToken(priorityLabel(priority))} tone={priorityTone(priority)} />
                          <span className="text-[10px] text-muted font-medium">{priorityMeta(priority)}</span>
                        </div>
                        <h3 className="text-xs font-semibold text-text-strong truncate">{priority.title}</h3>
                        <p className="text-[11px] text-muted mt-1 line-clamp-2 leading-relaxed">{priority.description}</p>
                      </div>
                      <span className="flex items-center justify-center w-5 h-5 rounded bg-line/45 text-[10px] font-semibold text-text-strong flex-shrink-0">{priority.type === 'finding' ? 'R' : '!'}</span>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState>No open priorities in this window.</EmptyState>
              )}
            </div>
          </Panel>

          <Panel className="home-panel home-panel-activity lg:col-span-6 flex flex-col h-full justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-line/30">
                <div className="flex gap-1">
                  <button
                    type="button"
                    className={`px-3 py-1 text-xs font-medium rounded-md hover:bg-line/25 text-text hover:text-text-strong transition-all cursor-pointer ${activeActivityTab === 'notes' ? 'bg-line/40 text-text-strong font-semibold shadow-sm border border-line/10' : ''}`}
                    onClick={() => setActiveActivityTab('notes')}
                  >
                    Notes (7d)
                  </button>
                  {pInsights && (
                    <>
                      <button
                        type="button"
                        className={`px-3 py-1 text-xs font-medium rounded-md hover:bg-line/25 text-text hover:text-text-strong transition-all cursor-pointer ${activeActivityTab === 'ai' ? 'bg-line/40 text-text-strong font-semibold shadow-sm border border-line/10' : ''}`}
                        onClick={() => setActiveActivityTab('ai')}
                      >
                        AI Sessions
                      </button>
                      <button
                        type="button"
                        className={`px-3 py-1 text-xs font-medium rounded-md hover:bg-line/25 text-text hover:text-text-strong transition-all cursor-pointer ${activeActivityTab === 'hours' ? 'bg-line/40 text-text-strong font-semibold shadow-sm border border-line/10' : ''}`}
                        onClick={() => setActiveActivityTab('hours')}
                      >
                        Peak Hours (24h)
                      </button>
                    </>
                  )}
                </div>
                <span className="text-[10px] text-muted font-medium uppercase tracking-wider">
                  {activeActivityTab === 'notes' && `${home.activityByDay.reduce((total, point) => total + point.count, 0)} notes`}
                  {activeActivityTab === 'ai' && `${totalAiInteractions} total`}
                  {activeActivityTab === 'hours' && `30-day pattern`}
                </span>
              </div>
              <div className="h-[240px] w-full flex items-center justify-center" aria-label="Activity chart">
                <ResponsiveContainer width="100%" height="100%">
                  {activeActivityTab === 'notes' ? (
                    <AreaChart data={activityByDay} margin={{ left: 0, right: 10, top: 12, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border-subtle)" vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="var(--muted)" fontSize={11} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} stroke="var(--muted)" fontSize={11} width={24} />
                      <Tooltip
                        contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text-strong)', fontSize: 11 }}
                        labelStyle={{ color: 'var(--text)' }}
                      />
                      <Area type="monotone" dataKey="count" name="Notes" stroke="var(--cyan)" fill="rgba(83, 199, 222, 0.08)" strokeWidth={2} />
                    </AreaChart>
                  ) : activeActivityTab === 'ai' ? (
                    <AreaChart data={weeklyAiData} margin={{ left: 0, right: 10, top: 12, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border-subtle)" vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="var(--muted)" fontSize={11} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} stroke="var(--muted)" fontSize={11} width={24} />
                      <Tooltip
                        contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text-strong)', fontSize: 11 }}
                        labelStyle={{ color: 'var(--text)' }}
                      />
                      <Area type="monotone" dataKey="sessions" name="AI Sessions" stroke="var(--cyan)" fill="rgba(83, 199, 222, 0.08)" strokeWidth={2} />
                    </AreaChart>
                  ) : (
                    <BarChart data={hourlyCounts} margin={{ left: 0, right: 10, top: 12, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border-subtle)" vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="var(--muted)" fontSize={10} interval={2} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} stroke="var(--muted)" fontSize={11} width={24} />
                      <Tooltip
                        contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text-strong)', fontSize: 11 }}
                        labelStyle={{ color: 'var(--text)' }}
                      />
                      <Bar dataKey="Activity" fill="var(--green)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          </Panel>

          <Panel className="home-panel home-panel-timeline lg:col-span-8 flex flex-col">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-line/30">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-strong">Project Activity Timeline</h2>
              <Select
                ariaLabel="Filter timeline by project"
                className="text-xs text-text-soft bg-panel/50 border border-line/60 rounded px-2 py-1 outline-none"
                options={projectOptions}
                value={selectedTimelineProject}
                onChange={setSelectedTimelineProject}
              />
            </div>
            {timelineQuery.isPending ? (
              <div className="py-8 text-center text-xs text-muted">Loading timeline...</div>
            ) : timelineQuery.isError ? (
              <div className="py-8 text-center text-xs text-rose-500">Failed to load timeline.</div>
            ) : timelineItems.length === 0 ? (
              <EmptyState>
                {backfillRunning
                  ? `Importing your recent GitHub commits… ${backfillStatusQuery.data?.job?.processed ?? 0}/${backfillStatusQuery.data?.job?.total ?? 0} processed.`
                  : 'No timeline events found for this project.'}
              </EmptyState>
            ) : (
              <div className="relative border-l border-line/50 pl-5 ml-2.5 py-1 space-y-4">
                {timelineItems.map((item) => {
                  const activeSource = item.source || item.sourceChannel;
                  const displayTags = buildNoteDisplayTags({ tags: item.tags, categories: item.categories });
                  return (
                    <article className="relative flex items-start gap-4 p-4 rounded-xl border border-line/30 hover:border-line/75 bg-panel/20 hover:bg-line/10 transition-all cursor-pointer text-left" key={item.id} onClick={() => openNote(item.noteId)}>
                      <div
                        className="absolute -left-[26px] top-6 w-2.5 h-2.5 rounded-full ring-4 ring-background"
                        style={{
                          color: getTimelineNodeColor(item.category, item.type),
                          backgroundColor: getTimelineNodeColor(item.category, item.type),
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          {displayTags.length ? <Tags items={displayTags} /> : null}
                          <span className="text-[10px] text-muted font-medium">
                            {projectName(dashboard.projects, item.project)} / {formatDateInUserTimeZone(item.date)} {formatTimeInUserTimeZone(item.date)}
                          </span>
                          <AttachmentIndicator count={item.attachmentCount || 0} />
                          <Badge value={formatDisplayToken(item.status)} tone={item.status} />
                        </div>
                        <h3 className="text-xs font-semibold text-text-strong leading-snug">
                          {(() => {
                            const { text: titleText, url: titleUrl } = makeTitleClickable(item.title);
                            return titleUrl ? (
                              <>
                                {titleText} - <a href={titleUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-cyan-500 underline hover:text-cyan-400">{titleUrl}</a>
                              </>
                            ) : item.title;
                          })()}
                        </h3>
                        <div className="mt-1.5 flex items-center">
                          <SourceBadge source={activeSource} iconSize={14} />
                        </div>
                        <p className="text-[11px] text-muted mt-2 leading-relaxed line-clamp-2">{getCleanSummary(item.summary)}</p>
                      </div>
                      <span className="flex items-center justify-center w-5 h-5 rounded bg-line/40 text-[10px] font-semibold text-text-strong flex-shrink-0">{typeIcon(item.type)}</span>
                    </article>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel className="home-panel home-panel-projects lg:col-span-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-line/30">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-text-strong">Active projects</h2>
                <span className="text-[10px] text-muted font-medium uppercase tracking-wider">top 5</span>
              </div>
              {home.activityByProject.length ? (
                <div className="h-[180px] w-full flex items-center justify-center" aria-label="Activity chart by project">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={home.activityByProject} layout="vertical" margin={{ left: 4, right: 18, top: 8, bottom: 8 }}>
                      <CartesianGrid stroke="var(--border-subtle)" horizontal={false} />
                      <XAxis type="number" hide allowDecimals={false} />
                      <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={80} stroke="var(--muted)" fontSize={11} />
                      <Tooltip
                        contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text-strong)', fontSize: 11 }}
                        labelStyle={{ color: 'var(--text)' }}
                      />
                      <Bar dataKey="count" name="Notes" fill="var(--green)" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState>No recent activity by project.</EmptyState>
              )}
              <div className="space-y-2 mt-4">
                {home.activityByProject.slice(0, 5).map((project) => (
                  <button className="flex items-center justify-between w-full p-2.5 rounded-lg border border-line/30 hover:border-line/60 hover:bg-line/15 transition-all text-xs font-medium text-text-soft hover:text-text-strong cursor-pointer" type="button" key={project.project} onClick={() => openProject(project.project)}>
                    <span>{project.label}</span>
                    <Badge value={project.count} tone="active" />
                  </button>
                ))}
              </div>
            </div>
          </Panel>
        </section>
      </div>
    </>
  );
}
