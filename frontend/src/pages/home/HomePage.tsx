import type { PageContext } from '../../app/page-context';
import type { HomeNavigationTarget, HomePriority } from '../../shared/api/models/dashboard-home';
import { formatUsDate, noteStatusLabel, projectName } from '../../entities/format';
import { Badge, EmptyState, PageHead, Panel } from '../../shared/ui/primitives';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { routes } from '../../app/routing/routes';

export function HomePage({ dashboard, openNote, openProject }: PageContext) {
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
    if (priority.type === 'reminder') return priority.status || priority.type;
    if (priority.severity) return priority.severity;
    if (priority.type === 'incident') return 'medium';
    return priority.status || priority.type;
  }

  function priorityLabel(priority: HomePriority) {
    if (priority.status) return noteStatusLabel(priority.status);
    return priority.type;
  }

  function priorityMeta(priority: HomePriority) {
    if (priority.type === 'reminder' && priority.reminderDate) {
      const time = priority.reminderTime ? ` ${priority.reminderTime}` : '';
      return `${projectName(dashboard.projects, priority.project)} / ${formatUsDate(priority.reminderDate)}${time}`;
    }
    return `${projectName(dashboard.projects, priority.project)} / ${formatUsDate(priority.date)}`;
  }

  return (
    <>
      <PageHead title="Home" subtitle={`Informações relevantes dos últimos ${home.windowDays} dias.`} />
      <section className="home-layout">
        {needsIntegrationSetup ? (
          <Panel className="setup-inline-banner">
            <div>
              <strong>Finalize as integrações do workspace</strong>
              <p className="meta">Conecte GitHub para reviews de push e WhatsApp ou Telegram para capturar notas por conversa.</p>
            </div>
            <Link className="icon-button" to={routes.integrations}>Conectar integrações</Link>
          </Panel>
        ) : null}

        <section className="home-kpis" aria-label="Indicadores operacionais">
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

        <section className="home-main-grid" aria-label="Resumo operacional">
          <Panel className="home-panel home-panel-priorities">
            <div className="panel-head">
              <h2>Prioridades</h2>
              <span className="meta">top 5</span>
            </div>
            {home.priorities.length ? (
              <div className="list">
                {home.priorities.slice(0, 5).map((priority) => (
                  <article className="list-row clickable home-priority-row" key={priority.id} onClick={() => openTarget(priority.target)}>
                    <div className="list-row-body">
                      <div className="meta-row">
                        <Badge value={priorityLabel(priority)} tone={priorityTone(priority)} />
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
              <EmptyState>Nenhuma prioridade aberta nesta janela.</EmptyState>
            )}
          </Panel>

          <Panel className="home-panel home-panel-activity">
            <div className="panel-head">
              <h2>Atividade dos ultimos 7 dias</h2>
              <span className="meta">{home.activityByDay.reduce((total, point) => total + point.count, 0)} notas</span>
            </div>
            <div className="chart-box" aria-label="Grafico de atividade por dia">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityByDay} margin={{ left: 0, right: 10, top: 12, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(148, 163, 184, 0.14)" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="#8da0ae" fontSize={12} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} stroke="#8da0ae" fontSize={12} width={28} />
                  <Tooltip contentStyle={{ background: '#0f171d', border: '1px solid rgba(148, 163, 184, 0.22)', borderRadius: 8 }} labelStyle={{ color: '#d8e2ea' }} />
                  <Area type="monotone" dataKey="count" name="Notas" stroke="#53c7de" fill="rgba(83, 199, 222, 0.22)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel className="home-panel home-panel-projects">
            <div className="panel-head">
              <h2>Projetos em movimento</h2>
              <span className="meta">top 5</span>
            </div>
            {home.activityByProject.length ? (
              <div className="chart-box compact" aria-label="Grafico de atividade por projeto">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={home.activityByProject} layout="vertical" margin={{ left: 4, right: 18, top: 8, bottom: 8 }}>
                    <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" horizontal={false} />
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={116} stroke="#8da0ae" fontSize={12} />
                    <Tooltip contentStyle={{ background: '#0f171d', border: '1px solid rgba(148, 163, 184, 0.22)', borderRadius: 8 }} labelStyle={{ color: '#d8e2ea' }} />
                    <Bar dataKey="count" name="Notas" fill="#7dd3a5" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState>Sem atividade recente por projeto.</EmptyState>
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
              <h2>Eventos recentes relevantes</h2>
              <span className="meta">top 5</span>
            </div>
            {home.recentInterestingEvents.length ? (
              <div className="list">
                {home.recentInterestingEvents.slice(0, 5).map((event) => (
                  <article className="list-row clickable" key={event.id} onClick={() => openTarget(event.target)}>
                    <div className="list-row-body">
                      <div className="meta-row">
                        <Badge value={event.type} tone={event.type} />
                        <span className="meta">
                          {projectName(dashboard.projects, event.project)} / {formatUsDate(event.date)}
                        </span>
                      </div>
                      <h3>{event.title}</h3>
                      <p>{event.summary}</p>
                    </div>
                    <span className="file-icon">E</span>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState>Sem eventos relevantes nesta janela.</EmptyState>
            )}
          </Panel>
        </section>
      </section>
    </>
  );
}
