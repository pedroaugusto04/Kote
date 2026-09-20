import React, { useState, useMemo, useRef } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, AreaChart, Area, CartesianGrid, XAxis, YAxis } from 'recharts';
import { fetchAiTokenAnalytics } from '../../shared/api/client';
import type { AiTokenAnalyticsResponse } from '../../shared/api/models/ai-token-analytics';
import { formatCostComparison, formatProviderName, formatTokens } from '../../shared/utils/format';
import { Panel, EmptyState, Badge } from '../../shared/ui/primitives';
import { Select } from '../../shared/ui/select';
import { CalendarIcon } from '../../shared/ui/icons';

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

export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const DATE_PRESETS = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: 'All', days: null },
] as const;

const FILTER_LABELS = {
  ALL_PROJECTS: 'All Projects',
  ALL_MODELS: 'All Models',
  ALL_PROVIDERS: 'All Providers',
  DATE_FROM_PLACEHOLDER: 'YYYY-MM-DD',
  DATE_TO_PLACEHOLDER: 'YYYY-MM-DD',
  RESET_FILTERS: 'Reset Filters',
  NO_MATCHES: 'No AI sessions match the selected filters.',
} as const;

/**
 * Mask date input to strictly enforce YYYY-MM-DD format as user types.
 */
export function maskDateInput(raw: string, prevValue: string = ''): string {
  if (raw.length < prevValue.length && raw.endsWith('-')) {
    raw = raw.slice(0, -1);
  }
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) {
    return digits;
  }
  if (digits.length <= 6) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

interface DateFilterInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  ariaLabel: string;
  title: string;
}

function DateFilterInput({ value, onChange, placeholder, ariaLabel, title }: DateFilterInputProps) {
  const datePickerRef = useRef<HTMLInputElement>(null);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = maskDateInput(e.target.value, value);
    onChange(masked);
  };

  const handleCalendarClick = () => {
    if (datePickerRef.current) {
      if (typeof datePickerRef.current.showPicker === 'function') {
        try {
          datePickerRef.current.showPicker();
        } catch {
          datePickerRef.current.focus();
        }
      } else {
        datePickerRef.current.focus();
        datePickerRef.current.click();
      }
    }
  };

  return (
    <div className="date-filter-input-wrap">
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={handleTextChange}
        placeholder={placeholder}
        title={title}
        aria-label={ariaLabel}
        maxLength={10}
        className="date-filter-text-input"
      />
      <button
        type="button"
        className="date-filter-calendar-btn"
        aria-label={`Open calendar for ${ariaLabel}`}
        title="Open calendar picker"
        onClick={handleCalendarClick}
      >
        <CalendarIcon style={{ width: '13px', height: '13px' }} />
      </button>
      <input
        ref={datePickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={DATE_REGEX.test(value.trim()) ? value.trim() : ''}
        onChange={(e) => {
          if (e.target.value) {
            onChange(e.target.value);
          }
        }}
        className="date-filter-native-picker"
      />
    </div>
  );
}

export function AiTokenAnalyticsPanel({ workspaceSlug, projectSlug }: AiTokenAnalyticsPanelProps) {
  const isDirectProjectTab = Boolean(projectSlug);
  const [activeTab, setActiveTab] = useState<AiAnalyticsTab>(AI_ANALYTICS_TAB.MODELS);

  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const effectiveProjectSlug = isDirectProjectTab ? projectSlug : (selectedProject || undefined);

  // Validated date query parameters (only send when complete YYYY-MM-DD)
  const queryStartDate = DATE_REGEX.test(startDate.trim()) ? startDate.trim() : undefined;
  const queryEndDate = DATE_REGEX.test(endDate.trim()) ? endDate.trim() : undefined;

  const { data, isPending, isLoading, isError } = useQuery<AiTokenAnalyticsResponse>({
    queryKey: [
      AI_ANALYTICS_QUERY_KEY,
      workspaceSlug,
      effectiveProjectSlug,
      queryStartDate,
      queryEndDate,
      selectedModel,
      selectedProvider,
    ],
    queryFn: () =>
      fetchAiTokenAnalytics({
        workspaceSlug,
        projectSlug: effectiveProjectSlug,
        startDate: queryStartDate,
        endDate: queryEndDate,
        model: selectedModel || undefined,
        provider: selectedProvider || undefined,
      }),
    staleTime: AI_ANALYTICS_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const isFiltered = Boolean(
    startDate ||
      endDate ||
      selectedModel ||
      selectedProvider ||
      (!isDirectProjectTab && selectedProject)
  );

  const activeFilterCount =
    (startDate ? 1 : 0) +
    (endDate ? 1 : 0) +
    (selectedModel ? 1 : 0) +
    (selectedProvider ? 1 : 0) +
    (!isDirectProjectTab && selectedProject ? 1 : 0);

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
    if (!isDirectProjectTab) {
      setSelectedProject('');
    }
    setSelectedModel('');
    setSelectedProvider('');
    setStartDate('');
    setEndDate('');
  };

  const projectOptions = useMemo(() => {
    const list = data?.availableProjects || [];
    return [
      { value: '', label: FILTER_LABELS.ALL_PROJECTS },
      ...list.map((p) => ({ value: p, label: p })),
    ];
  }, [data?.availableProjects]);

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

  if (isPending || isLoading || !data) {
    if (isError) {
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

    return (
      <Panel className="home-panel ai-token-panel">
        <div className="panel-head">
          <h2>AI Token & Cost Analytics</h2>
        </div>
        <div style={{ padding: '48px 32px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="global-loading-spinner" style={{ width: '36px', height: '36px' }} />
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
    <Panel className="home-panel ai-token-panel">
      <div className="panel-head ai-token-panel-head">
        <div>
          <h2>
            <span>AI Token Analytics & Costs</span>
            <Badge value={`${data.totalAiSessions} sessions`} tone="accent" />
            {isFiltered && (
              <Badge value={`${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''}`} tone="neutral" />
            )}
          </h2>
        </div>
        {hasSessions && (
          <div className="tab-buttons">
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
        <div className="ai-token-filter-bar">
          {/* Project Filter */}
          {!isDirectProjectTab && (
            <div className="ai-token-filter-item">
              <Select
                ariaLabel="Filter by Project"
                className="page-head-select"
                options={projectOptions}
                value={selectedProject}
                onChange={setSelectedProject}
              />
            </div>
          )}

          {/* Model Filter */}
          <div className="ai-token-filter-item">
            <Select
              ariaLabel="Filter by Model"
              className="page-head-select"
              options={modelOptions}
              value={selectedModel}
              onChange={setSelectedModel}
            />
          </div>

          {/* Provider Filter */}
          <div className="ai-token-filter-item">
            <Select
              ariaLabel="Filter by Provider"
              className="page-head-select"
              options={providerOptions}
              value={selectedProvider}
              onChange={setSelectedProvider}
            />
          </div>

          {/* Date Filter Range with Mask & Calendar */}
          <div className="ai-token-date-range-group">
            <span className="ai-token-date-label">Date:</span>
            <DateFilterInput
              value={startDate}
              onChange={setStartDate}
              placeholder={FILTER_LABELS.DATE_FROM_PLACEHOLDER}
              title="Start date (YYYY-MM-DD)"
              ariaLabel="Start date (YYYY-MM-DD)"
            />
            <span className="ai-token-date-to-label">to</span>
            <DateFilterInput
              value={endDate}
              onChange={setEndDate}
              placeholder={FILTER_LABELS.DATE_TO_PLACEHOLDER}
              title="End date (YYYY-MM-DD)"
              ariaLabel="End date (YYYY-MM-DD)"
            />

            {/* Quick Presets */}
            <div className="ai-token-presets-group">
              {DATE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handleDatePreset(preset.days)}
                  className="icon-button secondary ai-token-preset-btn"
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
              className="icon-button secondary ai-token-reset-btn"
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
            className="icon-button secondary"
            style={{ fontSize: '12px', padding: '6px 14px', minHeight: '32px' }}
          >
            {FILTER_LABELS.RESET_FILTERS}
          </button>
        </div>
      ) : (
        <div className="ai-token-content">
          {/* KPI Summary Cards */}
          <div className="ai-token-kpis">
            <div className="ai-token-kpi-card">
              <div className="ai-token-kpi-title">
                Est. Total Cost
              </div>
              <div className="ai-token-kpi-val cost">
                ${data.totalEstimatedCostUsd.toFixed(4)}
              </div>
              <div className="ai-token-kpi-sub">
                USD (live dynamic pricing)
              </div>
            </div>

            <div className="ai-token-kpi-card">
              <div className="ai-token-kpi-title">
                Total Tokens
              </div>
              <div className="ai-token-kpi-val">
                {formatTokens(data.totalTokens)}
              </div>
              <div className="ai-token-kpi-sub">
                {formatTokens(data.totalInputTokens)} in / {formatTokens(data.totalOutputTokens)} out
              </div>
            </div>

            <div className="ai-token-kpi-card">
              <div className="ai-token-kpi-title">
                AI Sessions
              </div>
              <div className="ai-token-kpi-val">
                {data.totalAiSessions}
              </div>
              <div className="ai-token-kpi-sub">
                Matching sessions
              </div>
            </div>

            <div className="ai-token-kpi-card">
              <div className="ai-token-kpi-title">
                Top Model
              </div>
              <div
                className="ai-token-kpi-val"
                style={{ fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={data.topModel}
              >
                {data.topModel}
              </div>
              <div className="ai-token-kpi-sub">
                {data.byModel[0]?.percentage || 0}% of filtered tokens{data.byModel[0] ? ` • (${formatCostComparison(data.byModel[0].estimatedCostUsd, data.byModel[0].totalTokens, data.byModel[0].rates)})` : ''}
              </div>
            </div>
          </div>

          {/* Main Visual: Model Share or Daily Trend */}
          {activeTab === AI_ANALYTICS_TAB.MODELS ? (
            <div className="ai-token-model-share-layout">
              {/* Donut Chart */}
              <div className="ai-token-chart-container">
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
              <div className="ai-token-model-list">
                {data.byModel.map((modelItem, idx) => {
                  const color = MODEL_PALETTE[idx % MODEL_PALETTE.length];
                  const comparisonFormatted = formatCostComparison(modelItem.estimatedCostUsd, modelItem.totalTokens, modelItem.rates);
                  return (
                    <div key={modelItem.model} className="ai-token-model-row">
                      <div className="ai-token-model-left">
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={modelItem.model}>
                          {modelItem.model}
                        </span>
                        {comparisonFormatted && (
                          <span style={{ color: 'var(--muted)', fontSize: '11px', whiteSpace: 'nowrap' }}>
                            ({comparisonFormatted})
                          </span>
                        )}
                        <span style={{ color: 'var(--muted)', fontSize: '11px', whiteSpace: 'nowrap' }}>
                          ({modelItem.sessionCount} sess)
                        </span>
                      </div>
                      <div className="ai-token-model-right">
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
            <div style={{ width: '100%', height: '220px', minWidth: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ left: 0, right: 8, top: 12, bottom: 0 }}>
                  <CartesianGrid stroke="var(--chart-grid, rgba(255,255,255,0.05))" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="var(--chart-axis, #9ca3af)" fontSize={11} minTickGap={16} />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    stroke="var(--chart-axis, #9ca3af)"
                    fontSize={10}
                    width={44}
                    domain={[0, 'auto']}
                    tickFormatter={(v) => formatTokens(Number(v) || 0)}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const item = payload[0]?.payload as (typeof trendData)[number] | undefined;
                      if (!item) return null;
                      return (
                        <div
                          style={{
                            background: 'var(--chart-tooltip-bg, #1f2937)',
                            border: '1px solid var(--chart-tooltip-border, rgba(255,255,255,0.1))',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            color: 'var(--chart-tooltip-text, #fff)',
                            fontSize: '12px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                          }}
                        >
                          <div style={{ fontWeight: 600, marginBottom: '6px', color: 'var(--muted)' }}>
                            {item.date}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8b5cf6', display: 'inline-block' }} />
                            <span>Tokens: <strong>{Number(item.tokens).toLocaleString()}</strong></span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                            <span>Est. Cost: <strong>${Number(item.cost).toFixed(4)}</strong></span>
                          </div>
                          {typeof item.sessionCount === 'number' && (
                            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                              {item.sessionCount} session{item.sessionCount !== 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      );
                    }}
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
