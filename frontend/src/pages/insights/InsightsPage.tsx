import { useQuery } from '@tanstack/react-query';
import { fetchProductivityInsights } from '../../shared/api/client';
import { PageHead, Panel, Badge, EmptyState } from '../../shared/ui/primitives';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid } from 'recharts';
import './InsightsPage.css';

export function InsightsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['productivity-insights'],
    queryFn: fetchProductivityInsights,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="insights-loading" role="status">
        <div className="spinner" />
        <span>Calculando seus insights de produtividade...</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="insights-error">
        <EmptyState>
          Não foi possível carregar os insights de produtividade. Por favor, tente novamente mais tarde.
        </EmptyState>
      </div>
    );
  }

  const { activities, categories } = data;

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

  const now = new Date();
  const todayStr = formatDateStr(now);
  const yesterdayStr = formatDateStr(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  // 1. Calculate active usage streak
  const activeDays = new Set(
    activities.map((a) => {
      const d = new Date(a.createdAt);
      return formatDateStr(d);
    })
  );

  let currentStreak = 0;
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
  const weeklyData = [];
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

    weeklyData.push({
      label: `${formatShortDate(startStr)} a ${formatShortDate(endStr)}`,
      sessions: count,
    });
  }

  // 3. Hourly Activity (last 30 days)
  const hourlyCounts = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    Atividade: 0,
  }));

  const thirtyDaysAgoStr = getOffsetDateStr(-30);
  let totalRecentActions = 0;

  activities.forEach((a) => {
    const d = new Date(a.createdAt);
    const dayStr = formatDateStr(d);
    if (dayStr >= thirtyDaysAgoStr) {
      const hour = d.getHours();
      hourlyCounts[hour].Atividade += 1;
      totalRecentActions += 1;
    }
  });

  // Find peak hour range
  const peakHourObj = [...hourlyCounts].sort((a, b) => b.Atividade - a.Atividade)[0];
  const peakHourStr = peakHourObj && peakHourObj.Atividade > 0 
    ? `${String(peakHourObj.hour).padStart(2, '0')}:00 - ${String((peakHourObj.hour + 1) % 24).padStart(2, '0')}:00`
    : 'Nenhum pico recente';

  // 4. Category calculations
  const totalCategoryNotes = categories.reduce((sum, cat) => sum + cat.count, 0);

  // Motivational streaks messages
  const streakMessage = currentStreak === 0
    ? 'Comece hoje! Crie uma nota rápida ou pergunte algo ao Ask AI para iniciar seu streak. 🚀'
    : currentStreak >= 7
    ? 'Consistência incrível! Você está no modo hiperfoco esta semana. 🔥'
    : 'Belo streak de uso! Continue evoluindo seu conhecimento. 🌟';

  return (
    <>
      <PageHead
        title="Insights de Produtividade"
        subtitle="Analise seus hábitos de trabalho, sessões com a IA e evolução de conhecimento."
      />
      <div className="insights-layout">
        
        {/* Top KPIs Summary Section */}
        <section className="insights-kpis">
          <article className="insights-kpi streak-card">
            <div className="kpi-icon">🔥</div>
            <div className="kpi-info">
              <span className="card-kicker">Streak Atual</span>
              <strong>{currentStreak} {currentStreak === 1 ? 'dia' : 'dias'}</strong>
              <p className="kpi-subtext">{streakMessage}</p>
            </div>
          </article>

          <article className="insights-kpi peak-card">
            <div className="kpi-icon">⚡</div>
            <div className="kpi-info">
              <span className="card-kicker">Horário de Pico</span>
              <strong>{peakHourStr}</strong>
              <p className="kpi-subtext">Baseado nas suas ações dos últimos 30 dias.</p>
            </div>
          </article>

          <article className="insights-kpi ai-card">
            <div className="kpi-icon">🤖</div>
            <div className="kpi-info">
              <span className="card-kicker">Copiloto Ativo</span>
              <strong>
                {activities.filter(a => a.isAi).length} Interações
              </strong>
              <p className="kpi-subtext">Total de chat e prompts resolvidos por IA.</p>
            </div>
          </article>
        </section>

        {/* Main Grid: Weekly AI and Categories */}
        <section className="insights-main-grid">
          
          <Panel className="insights-panel graph-panel">
            <div className="panel-head">
              <h2>Sessões AI por Semana</h2>
              <span className="meta">Últimas 4 semanas</span>
            </div>
            {activities.filter(a => a.isAi).length === 0 ? (
              <EmptyState>Nenhuma sessão com inteligência artificial registrada ainda.</EmptyState>
            ) : (
              <div className="chart-wrapper">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weeklyData} margin={{ left: 0, right: 10, top: 12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="aiGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="var(--chart-axis)" fontSize={12} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} stroke="var(--chart-axis)" fontSize={12} width={28} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--chart-tooltip-bg)',
                        border: '1px solid var(--chart-tooltip-border)',
                        borderRadius: 8,
                        color: 'var(--chart-tooltip-text)'
                      }}
                      labelStyle={{ color: 'var(--chart-tooltip-text)' }}
                    />
                    <Area type="monotone" dataKey="sessions" name="Sessões AI" stroke="var(--accent)" fill="url(#aiGradient)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <Panel className="insights-panel categories-panel">
            <div className="panel-head">
              <h2>Categorias Mais Trabalhadas</h2>
              <span className="meta">Foco por notas</span>
            </div>
            {categories.length === 0 ? (
              <EmptyState>Nenhuma categoria com notas associadas nos últimos 90 dias.</EmptyState>
            ) : (
              <div className="categories-list">
                {categories.map((cat) => {
                  const percentage = totalCategoryNotes > 0 ? Math.round((cat.count / totalCategoryNotes) * 100) : 0;
                  return (
                    <article className="category-progress-item" key={cat.id}>
                      <div className="category-progress-details">
                        <div className="category-info-badge">
                          <span className="category-dot" style={{ backgroundColor: cat.color }} />
                          <span className="category-name">{cat.name}</span>
                        </div>
                        <span className="category-percentage">
                          {cat.count} {cat.count === 1 ? 'nota' : 'notas'} ({percentage}%)
                        </span>
                      </div>
                      <div className="progress-bar-bg">
                        <div
                          className="progress-bar-fill"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: cat.color
                          }}
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </Panel>
        </section>

        {/* Hourly Heatmap Section */}
        <section className="insights-hourly-section">
          <Panel className="insights-panel hourly-panel">
            <div className="panel-head">
              <h2>Distribuição de Horas Mais Produtivas</h2>
              <span className="meta">Volume de atividade por hora local (últimos 30 dias)</span>
            </div>
            {totalRecentActions === 0 ? (
              <EmptyState>Nenhuma atividade de escrita ou busca registrada nos últimos 30 dias.</EmptyState>
            ) : (
              <div className="chart-wrapper hourly-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyCounts} margin={{ left: 0, right: 10, top: 12, bottom: 0 }}>
                    <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="var(--chart-axis)" fontSize={11} interval={2} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} stroke="var(--chart-axis)" fontSize={12} width={28} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--chart-tooltip-bg)',
                        border: '1px solid var(--chart-tooltip-border)',
                        borderRadius: 8,
                        color: 'var(--chart-tooltip-text)'
                      }}
                      labelStyle={{ color: 'var(--chart-tooltip-text)' }}
                    />
                    <Bar dataKey="Atividade" fill="var(--chart-bar-fill)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </section>
      </div>
    </>
  );
}
