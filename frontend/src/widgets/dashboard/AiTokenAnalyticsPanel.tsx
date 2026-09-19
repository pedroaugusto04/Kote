import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, AreaChart, Area, CartesianGrid, XAxis, YAxis } from 'recharts';
import { fetchAiTokenAnalytics } from '../../shared/api/client';
import type { AiTokenAnalyticsResponse } from '../../shared/api/models/ai-token-analytics';
import { formatCostComparison, formatProviderName, formatTokens } from '../../shared/utils/format';
import { Panel, EmptyState, Badge } from '../../shared/ui/primitives';
import { Select } from '../../shared/ui/select';

interface AiTokenAnalyticsPanelProps {
  workspaceSlug?: string;
  projectSlug?: string;
}

const MODEL_PALETTE = [
  '#8b5cf6', // Violet / Purple
  '#3b82f6', // Blue
  '#10b981', // Emerald / Green
  '#f59e0b', // Amber / Orange
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#6366f1', // Indigo
  '#14b8a6', // Teal
  '#f43f5e', // Rose
];

const AI_ANALYTICS_TAB = {
  MODELS: 'models',
  TREND: 'trend',
} as const;

type AiAnalyticsTab = (typeof AI_ANALYTICS_TAB)[keyof typeof AI_ANALYTICS_TAB];

const AI_ANALYTICS_QUERY_KEY = 'ai-token-analytics';
const AI_ANALYTICS_STALE_TIME_MS = 60_000;

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const DATE_PRESETS = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: 'All', days: null },
] as const;

const FILTER_LABELS = {
  ALL_MODELS: 'All Models',
  ALL_PROVIDERS: 'All Providers',
  DATE_FROM_PLACEHOLDER: 'YYYY-MM-DD',
  DATE_TO_PLACEHOLDER: 'YYYY-MM-DD',
  RESET_FILTERS: 'Reset Filters',
  NO_MATCHES: 'No AI sessions match the selected filters.',
} as const;

export function AiTokenAnalyticsPanel({ workspaceSlug, projectSlug }: AiTokenAnalyticsPanelProps) {
  const [activeTab, setActiveTab] = useState<AiAnalyticsTab>(AI_ANALYTICS_TAB.MODELS);

  const [selectedModel, setSelectedModel] = useState<string>('');
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Validated date query parameters (only send when complete YYYY-MM-DD)
  const queryStartDate = DATE_REGEX.test(startDate.trim()) ? startDate.trim() : undefined;
  const queryEndDate = DATE_REGEX.test(endDate.trim()) ? endDate.trim() : undefined;

  const { data, isLoading, isError } = useQuery<AiTokenAnalyticsResponse>({
    queryKey: [
      AI_ANALYTICS_QUERY_KEY,
      workspaceSlug,
      projectSlug,
      queryStartDate,
      queryEndDate,
      selectedModel,
      selectedProvider,
    ],
    queryFn: () =>
      fetchAiTokenAnalytics({
        workspaceSlug,
        projectSlug,
        startDate: queryStartDate,
        endDate: queryEndDate,
        model: selectedModel || undefined,
        provider: selectedProvider || undefined,
      }),
    staleTime: AI_ANALYTICS_STALE_TIME_MS,
    placeholderData: (previousData) => previousData,
  });

  const isFiltered = Boolean(startDate || endDate || selectedModel || selectedProvider);

  const activeFilterCount =
    (startDate ? 1 : 0) +
    (endDate ? 1 : 0) +
    (selectedModel ? 1 : 0) +
    (selectedProvider ? 1 : 0);

  const handleDatePreset = (days: number | null) => {
    if (days === null) {
      setStartDate('');
      setEndDate('');
      return;
    }
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(end.toISOString().slice(0, 10));
  };

  const handleResetFilters = () => {
    setSelectedModel('');
    setSelectedProvider('');
    setStartDate('');
    setEndDate('');
  };

  const modelOptions = useMemo(() => {
    const list = data?.availableModels || [];
    return [
      { value: '', label: FILTER_LABELS.ALL_MODELS },
      ...list.map((m) => ({ value: m, label: m })),
    ];
  }, [data?.availableModels]);

  const providerOptions = useMemo(() => {
    const list = data?.availableProviders || [];
    return [
      { value: '', label: FILTER_LABELS.ALL_PROVIDERS },
      ...list.map((p) => ({ value: p, label: formatProviderName(p) })),
    ];
  }, [data?.availableProviders]);

  if (isLoading && !data) {
    return (
      <Panel className="home-panel ai-token-panel">
        <div className="panel-head">
          <h2>AI Token & Cost Analytics</h2>
        </div>
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)' }}>
          Loading AI token analytics...
        </div>
      </Panel>
    );
  }

  if (isError || !data) {
    return (
      <Panel className="home-panel ai-token-panel">
        <div className="panel-head">
          <h2>AI Token & Cost Analytics</h2>
        </div>
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--red)' }}>
          Failed to load AI token analytics.
        </div>
      </Panel>
    );
  }

  const hasSessions = data.totalAiSessions > 0;
  const showInitialEmptyState = !hasSessions && !isFiltered;

  const pieData = (data.byModel || []).map((item, index) => ({
    name: item.model,
    value: item.totalTokens,
    percentage: item.percentage,
    cost: item.estimatedCostUsd,
    rate: formatCostComparison(item.estimatedCostUsd, item.totalTokens, item.rates),
    sessionCount: item.sessionCount,
    color: MODEL_PALETTE[index % MODEL_PALETTE.length],
  }));

  const trendData = (data.dailyTrend || []).map((d) => ({
    ...d,
    label: d.date.slice(5), // MM-DD
    tokens: d.totalTokens,
    cost: d.estimatedCostUsd,
  }));

  return (
    <Panel className="home-panel ai-token-panel" style={{ overflow: 'hidden' }}>
      <div
        className="panel-head"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span> AI Token Analytics & Costs</span>
            <Badge value={`${data.totalAiSessions} sessions`} tone="accent" />
            {isFiltered && (
              <Badge value={`${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''}`} tone="neutral" />
            )}
          </h2>
        </div>
        {hasSessions && (
          <div className="tab-buttons" style={{ display: 'flex', gap: '4px' }}>
            <button
              type="button"
              className={`tab-btn ${activeTab === AI_ANALYTICS_TAB.MODELS ? 'active' : ''}`}
              onClick={() => setActiveTab(AI_ANALYTICS_TAB.MODELS)}
            >
              Model Share
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === AI_ANALYTICS_TAB.TREND ? 'active' : ''}`}
              onClick={() => setActiveTab(AI_ANALYTICS_TAB.TREND)}
            >
              Daily Trend
            </button>
          </div>
        )}
      </div>

      {/* Filter Controls Bar */}
      {!showInitialEmptyState && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            alignItems: 'center',
            padding: '10px 16px',
            background: 'rgba(255, 255, 255, 0.02)',
            borderBottom: '1px solid var(--border)',
            fontSize: '12px',
          }}
        >
          {/* Model Filter */}
          <div style={{ minWidth: '150px' }}>
            <Select
              ariaLabel="Filter by Model"
              className="page-head-select"
              options={modelOptions}
              value={selectedModel}
              onChange={setSelectedModel}
            />
          </div>

          {/* Provider Filter */}
          <div style={{ minWidth: '140px' }}>
            <Select
              ariaLabel="Filter by Provider"
              className="page-head-select"
              options={providerOptions}
              value={selectedProvider}
              onChange={setSelectedProvider}
            />
          </div>

          {/* Date Filter Range */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--muted)', fontSize: '11px', fontWeight: 600 }}>Date:</span>
            <input
              type="text"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder={FILTER_LABELS.DATE_FROM_PLACEHOLDER}
              title="Start date (YYYY-MM-DD)"
              aria-label="Start date (YYYY-MM-DD)"
              maxLength={10}
              style={{
                width: '105px',
                padding: '6px 8px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--card-bg, rgba(0, 0, 0, 0.2))',
                color: 'var(--text)',
                fontSize: '12px',
                fontFamily: 'var(--mono, monospace)',
              }}
            />
            <span style={{ color: 'var(--muted)', fontSize: '11px' }}>to</span>
            <input
              type="text"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              placeholder={FILTER_LABELS.DATE_TO_PLACEHOLDER}
              title="End date (YYYY-MM-DD)"
              aria-label="End date (YYYY-MM-DD)"
              maxLength={10}
              style={{
                width: '105px',
                padding: '6px 8px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--card-bg, rgba(0, 0, 0, 0.2))',
                color: 'var(--text)',
                fontSize: '12px',
                fontFamily: 'var(--mono, monospace)',
              }}
            />

            {/* Quick Presets */}
            <div style={{ display: 'flex', gap: '4px', marginLeft: '4px' }}>
              {DATE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handleDatePreset(preset.days)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    border: '1px solid var(--border)',
                    background: 'rgba(255, 255, 255, 0.04)',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reset Filters Button */}
          {isFiltered && (
            <button
              type="button"
              onClick={handleResetFilters}
              style={{
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                border: '1px solid var(--border)',
                background: 'rgba(239, 68, 68, 0.1)',
                color: 'var(--red, #ef4444)',
                cursor: 'pointer',
                marginLeft: 'auto',
              }}
            >
              {FILTER_LABELS.RESET_FILTERS}
            </button>
          )}
        </div>
      )}

      {showInitialEmptyState ? (
        <EmptyState>
          No AI token data available yet.
        </EmptyState>
      ) : !hasSessions ? (
        <div style={{ padding: '36px 16px', textAlign: 'center' }}>
          <div style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '12px' }}>
            {FILTER_LABELS.NO_MATCHES}
          </div>
          <button
            type="button"
            onClick={handleResetFilters}
            className="btn btn-secondary"
            style={{ fontSize: '12px', padding: '6px 14px' }}
          >
            {FILTER_LABELS.RESET_FILTERS}
          </button>
        </div>
      ) : (
        <div style={{ padding: '16px' }}>
          {/* KPI Summary Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '12px',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                background: 'var(--card-bg, rgba(255, 255, 255, 0.03))',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '12px 14px',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Est. Total Cost
              </div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--emerald, #10b981)', marginTop: '4px' }}>
                ${data.totalEstimatedCostUsd.toFixed(4)}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                USD (live dynamic pricing)
              </div>
            </div>

            <div
              style={{
                background: 'var(--card-bg, rgba(255, 255, 255, 0.03))',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '12px 14px',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Total Tokens
              </div>
              <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px' }}>
                {formatTokens(data.totalTokens)}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                {formatTokens(data.totalInputTokens)} in / {formatTokens(data.totalOutputTokens)} out
              </div>
            </div>

            <div
              style={{
                background: 'var(--card-bg, rgba(255, 255, 255, 0.03))',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '12px 14px',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                AI Sessions
              </div>
              <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px' }}>
                {data.totalAiSessions}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                Matching sessions
              </div>
            </div>

            <div
              style={{
                background: 'var(--card-bg, rgba(255, 255, 255, 0.03))',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '12px 14px',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Top Model
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={data.topModel}>
                {data.topModel}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                {data.byModel[0]?.percentage || 0}% of filtered tokens{data.byModel[0] ? ` • (${formatCostComparison(data.byModel[0].estimatedCostUsd, data.byModel[0].totalTokens, data.byModel[0].rates)})` : ''}
              </div>
            </div>
          </div>

          {/* Main Visual: Model Share or Daily Trend */}
          {activeTab === AI_ANALYTICS_TAB.MODELS ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', alignItems: 'center' }}>
              {/* Donut Chart */}
              <div style={{ width: '100%', height: '220px', position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((entry) => (
                        <Cell key={`cell-${entry.name}`} fill={entry.color} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: unknown, name: unknown, item: any) => [
                        `${formatTokens(Number(val) || 0)} tokens (${item?.payload?.percentage || 0}%) • $${(Number(item?.payload?.cost) || 0).toFixed(4)}${item?.payload?.rate ? ` (${item?.payload?.rate})` : ''}`,
                        String(name || ''),
                      ]}
                      contentStyle={{
                        background: 'var(--bg-elevated, #1f2937)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: 'var(--text)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Breakdown List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {data.byModel.map((modelItem, idx) => {
                  const color = MODEL_PALETTE[idx % MODEL_PALETTE.length];
                  const comparisonFormatted = formatCostComparison(modelItem.estimatedCostUsd, modelItem.totalTokens, modelItem.rates);
                  return (
                    <div
                      key={modelItem.model}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        background: 'rgba(255, 255, 255, 0.02)',
                        borderRadius: '6px',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {modelItem.model}
                        </span>
                        {comparisonFormatted && (
                          <span style={{ color: 'var(--muted)', fontSize: '11px', whiteSpace: 'nowrap' }}>
                            ({comparisonFormatted})
                          </span>
                        )}
                        <span style={{ color: 'var(--muted)', fontSize: '11px' }}>
                          ({modelItem.sessionCount} sess)
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                        <span style={{ fontWeight: 600, color: 'var(--accent, #a78bfa)' }}>
                          {modelItem.percentage}%
                        </span>
                        <span style={{ color: 'var(--muted)' }}>
                          {formatTokens(modelItem.totalTokens)}
                        </span>
                        <span style={{ color: 'var(--emerald, #10b981)', fontWeight: 600 }}>
                          ${modelItem.estimatedCostUsd.toFixed(4)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Daily Trend Area Chart */
            <div style={{ width: '100%', height: '220px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ left: 0, right: 10, top: 12, bottom: 0 }}>
                  <CartesianGrid stroke="var(--chart-grid, rgba(255,255,255,0.05))" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="var(--chart-axis, #9ca3af)" fontSize={12} />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    stroke="var(--chart-axis, #9ca3af)"
                    fontSize={12}
                    width={40}
                    tickFormatter={(v) => formatTokens(v)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--chart-tooltip-bg, #1f2937)',
                      border: '1px solid var(--chart-tooltip-border, rgba(255,255,255,0.1))',
                      borderRadius: 8,
                      color: 'var(--chart-tooltip-text, #fff)',
                    }}
                    formatter={(val: unknown, name: unknown) => [
                      name === 'tokens' ? `${Number(val).toLocaleString()} tokens` : `$${Number(val).toFixed(4)}`,
                      name === 'tokens' ? 'Tokens' : 'Est. Cost',
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="tokens"
                    name="Tokens"
                    stroke="#8b5cf6"
                    fill="rgba(139, 92, 246, 0.2)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
