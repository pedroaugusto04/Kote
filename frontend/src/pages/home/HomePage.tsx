import type { PageContext } from '../../app/page-context';
import type { HomeNavigationTarget, HomePriority } from '../../shared/api/models/dashboard-home';
import { projectName } from '../../entities/format';
import { Badge, EmptyState, PageHead, Panel } from '../../shared/ui/primitives';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function HomePage({ dashboard, openNote, openReview, setSelectedProject }: PageContext) {
  const { home } = dashboard;

  function openTarget(target: HomeNavigationTarget) {
    if (target.kind === 'review' && target.id) {
      openReview(target.id);
      return;
    }
    if (target.kind === 'project' && target.slug) {
      setSelectedProject(target.slug);
      return;
    }
    if (target.id) {
      openNote(target.id);
      return;
    }
    const note = target.path ? dashboard.notes.find((candidate) => candidate.path === target.path || candidate.path.endsWith(target.path || '')) : undefined;
    if (note) openNote(note.id);
  }

  function priorityTone(priority: HomePriority) {
    if (priority.severity) return priority.severity;
    if (priority.type === 'reminder' && priority.description.toLowerCase().includes('vencido')) return 'high';
    if (priority.type === 'incident') return 'medium';
    return priority.status || priority.type;
  }

  return (
    <>
      <PageHead title="Home operacional" subtitle={`Prioridades, mudancas e projetos ativos nos ultimos ${home.windowDays} dias.`} />
      <section className="home-layout">
        <section className="home-kpis" aria-label="Indicadores operacionais">
          {home.metrics.slice(0, 4).map((metric) => (
            <article className="home-kpi" key={metric.id}>
              <span className="card-kicker">{metric.label}</span>
              <strong>{metric.value}</strong>
              <span className={`home-kpi-meta ${metric.tone || ''}`}>{metric.meta}</span>
            </article>
          ))}
        </section>

        <section className="grid cols-2 home-main-grid">
          <Panel className="home-priorities">
            <div className="panel-head">
              <h2>Prioridades</h2>
              <span className="meta">ate 5 itens</span>
            </div>
            {home.priorities.length ? (
              <div className="list">
                {home.priorities.slice(0, 5).map((priority) => (
                  <article className="list-row clickable home-priority-row" key={priority.id} onClick={() => openTarget(priority.target)}>
                    <div>
                      <div className="meta-row">
                        <Badge value={priority.type} tone={priorityTone(priority)} />
                        <span className="meta">
                          {projectName(dashboard.projects, priority.project)} / {priority.date}
                        </span>
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

          <Panel>
            <div className="panel-head">
              <h2>Atividade dos ultimos 7 dias</h2>
              <span className="meta">{home.activityByDay.reduce((total, point) => total + point.count, 0)} notas</span>
            </div>
            <div className="chart-box" aria-label="Grafico de atividade por dia">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={home.activityByDay} margin={{ left: 0, right: 10, top: 12, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(148, 163, 184, 0.14)" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="#8da0ae" fontSize={12} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} stroke="#8da0ae" fontSize={12} width={28} />
                  <Tooltip contentStyle={{ background: '#0f171d', border: '1px solid rgba(148, 163, 184, 0.22)', borderRadius: 8 }} labelStyle={{ color: '#d8e2ea' }} />
                  <Area type="monotone" dataKey="count" name="Notas" stroke="#53c7de" fill="rgba(83, 199, 222, 0.22)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel>
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
                <button className="home-project-link" type="button" key={project.project} onClick={() => setSelectedProject(project.project)}>
                  <span>{project.label}</span>
                  <Badge value={project.count} tone="active" />
                </button>
              ))}
            </div>
          </Panel>

          <Panel>
            <div className="panel-head">
              <h2>Eventos recentes relevantes</h2>
              <span className="meta">ate 5 notas</span>
            </div>
            {home.recentInterestingEvents.length ? (
              <div className="list">
                {home.recentInterestingEvents.slice(0, 5).map((event) => (
                  <article className="list-row clickable" key={event.id} onClick={() => openTarget(event.target)}>
                    <div>
                      <div className="meta-row">
                        <Badge value={event.type} tone={event.type} />
                        <span className="meta">
                          {projectName(dashboard.projects, event.project)} / {event.date}
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
