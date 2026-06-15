import { keepPreviousData, useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useState, useRef } from 'react';

import type { PageContext } from '../../app/page-context';
import { fetchAskHistory, fetchLatestProjectBrief, generateProjectBrief, runAsk } from '../../shared/api/client';
import { getErrorMessage } from '../../shared/api/error-message';
import type { AskHistoryResponse } from '../../shared/api/models/ask';
import type { ProjectBriefPanelResponse } from '../../shared/api/models/project-brief';
import type { AskAnswerCardItem } from '../../widgets/ask/ask-answer-card.models';
import { AskAnswerCard, projectLabel } from '../../widgets/ask/AskAnswerCard';
import { AskAiIcon } from '../../widgets/ask/AskAiIcon';
import { ProjectBriefPanel } from '../../widgets/projects/ProjectBriefPanel';
import { EmptyState, InlineMessage, PageHead, Panel } from '../../shared/ui/primitives';
import { Pagination } from '../../shared/ui/pagination';
import { Select } from '../../shared/ui/select';
import { notifyWarning } from '../../shared/ui/notifications';
import { notifyGeneralFormError } from '../../shared/forms/errors';
import { usePaginationState } from '../../shared/ui/use-pagination-state';
import './SearchPage.css';

const ASK_HISTORY_PAGE_SIZE = 5;

export function SearchPage({ dashboard, openNote }: PageContext) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'ask' | 'brief'>('ask');
  const [questionInput, setQuestionInput] = useState('');
  const [projectSlug, setProjectSlug] = useState('');
  const [askAnswer, setAskAnswer] = useState<AskAnswerCardItem | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [hiddenLatestBriefProjects, setHiddenLatestBriefProjects] = useState<Record<string, boolean>>({});

  const { page: historyPage, setPage: setHistoryPage } = usePaginationState(`ask-history:${projectSlug}`);

  const handleHistoryPageChange = (newPage: number) => {
    setHistoryPage(newPage);
  };

  const selectedProjectLabel = projectLabel(projectSlug, dashboard.projects);

  const historyQuery = useQuery({
    queryKey: ['ask-history', projectSlug, historyPage],
    queryFn: () => fetchAskHistory({ projectSlug, page: historyPage, pageSize: ASK_HISTORY_PAGE_SIZE }),
    enabled: showHistory,
    placeholderData: keepPreviousData,
  });

  // Project Brief state & queries — scoped to the selected project
  const briefProjectSlug = projectSlug || 'all';
  const briefQueryKey = ['project-brief', briefProjectSlug];
  const latestBriefQuery = useQuery<ProjectBriefPanelResponse>({
    queryKey: briefQueryKey,
    queryFn: () => fetchLatestProjectBrief(briefProjectSlug),
    enabled: false,
  });
  const generateBriefMutation = useMutation({
    mutationFn: (slug: string) => generateProjectBrief(slug),
    onSuccess: (response, slug) => {
      queryClient.setQueryData<ProjectBriefPanelResponse>(['project-brief', slug], response);
      setHiddenLatestBriefProjects((current) => ({ ...current, [slug]: false }));
    },
    onError: (error) => notifyGeneralFormError(error, 'Could not generate the project brief.'),
  });
  const showLatestBrief = () => {
    const currentBrief = latestBriefQuery.data;
    if (currentBrief && 'source' in currentBrief && currentBrief.source === 'history' && !hiddenLatestBriefProjects[briefProjectSlug]) {
      setHiddenLatestBriefProjects((current) => ({ ...current, [briefProjectSlug]: true }));
      return;
    }
    setHiddenLatestBriefProjects((current) => ({ ...current, [briefProjectSlug]: false }));
    if (currentBrief && 'source' in currentBrief && currentBrief.source === 'history') return;
    void latestBriefQuery.refetch();
  };
  const selectedBriefResponse = hiddenLatestBriefProjects[briefProjectSlug] && latestBriefQuery.data && 'source' in latestBriefQuery.data && latestBriefQuery.data.source === 'history'
    ? undefined
    : latestBriefQuery.data;

  const handleAsk = async (overrideQuestion?: string) => {
    const question = (overrideQuestion ?? questionInput).trim();
    if (isAsking) return;
    if (!question) {
      notifyWarning('Type something before asking AI.');
      return;
    }

    setIsAsking(true);
    setAskError(null);
    setAskAnswer(null);

    try {
      const result = await runAsk({ question, projectSlug });
      if (result?.ok) {
        setAskAnswer({
          question,
          answer: result.answer,
          projectSlug,
          sources: result.sources || [],
        });
        setAskError(null);
        setHistoryPage(1);
        await queryClient.invalidateQueries({ queryKey: ['ask-history'] });
      } else {
        setAskError('Could not generate an answer. Please try again.');
      }
    } catch (error: unknown) {
      setAskError(error instanceof Error ? error.message : 'An unexpected error occurred while communicating with the AI.');
    } finally {
      setIsAsking(false);
    }
  };

  const handlePromptClick = (promptText: string) => {
    setQuestionInput(promptText);
    void handleAsk(promptText);
  };

  return (
    <>
      <PageHead
        title="Ask AI"
        subtitle="Ask questions, generate project briefs, and explore your AI history."
        action={
          <Select
            ariaLabel="Filter by project"
            className="page-head-select"
            options={[
              { value: '', label: 'All projects' },
              ...dashboard.projects.map((project) => ({
                value: project.projectSlug,
                label: project.displayName,
              })),
            ]}
            value={projectSlug}
            onChange={(nextProjectSlug) => {
              setProjectSlug(nextProjectSlug);
              setAskAnswer(null);
              setAskError(null);
            }}
          />
        }
      />

      <div className="segmented-control" style={{ maxWidth: '360px', marginBottom: '20px' }}>
        <button
          className={activeTab === 'ask' ? 'active' : ''}
          onClick={() => setActiveTab('ask')}
          type="button"
        >
          Ask AI
        </button>
        <button
          className={activeTab === 'brief' ? 'active' : ''}
          onClick={() => setActiveTab('brief')}
          type="button"
        >
          Project Briefs
        </button>
      </div>

      {activeTab === 'ask' ? (
        <div className={`ask-ai-workspace ${showHistory ? 'has-history' : ''}`}>
          <div className="ask-ai-main-pane">
            {/* Question input */}
            <section className="search-box ask-ai-input-section">
              <div className="ask-ai-input-row">
                <AskAiIcon className="ask-ai-input-icon" />
                <input
                  aria-label="Ask a question"
                  autoComplete="off"
                  enterKeyHint="send"
                  spellCheck={false}
                  type="text"
                  value={questionInput}
                  onChange={(event) => setQuestionInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleAsk();
                    }
                  }}
                  placeholder="Ask anything about your notes..."
                />
                <button className="icon-button ask-ai-send-btn" disabled={isAsking} type="button" onClick={() => handleAsk()}>
                  {isAsking ? 'Asking...' : 'Ask'}
                </button>
                <button
                  aria-expanded={showHistory}
                  className={`icon-button secondary ask-ai-history-toggle ${showHistory ? 'active' : ''}`}
                  type="button"
                  onClick={() => setShowHistory((current) => !current)}
                >
                  {showHistory ? 'Hide history' : 'Show history'}
                </button>
              </div>
            </section>

            {/* AI Answer */}
            {isAsking ? <AskAnswerSkeleton question={questionInput.trim()} projectLabel={selectedProjectLabel} /> : null}

            {!isAsking && askAnswer ? (
              <Panel className="ai-answer-card-panel">
                <AskAnswerCard item={askAnswer} openNote={openNote} projects={dashboard.projects} />
              </Panel>
            ) : null}

            {!isAsking && !askAnswer ? (
              <AskWaitingState onPromptClick={handlePromptClick} />
            ) : null}

            {askError ? <InlineMessage className="ask-error-message" tone="error">{askError}</InlineMessage> : null}
          </div>

          {/* History Panel */}
          {showHistory ? (
            <div className="ask-ai-history-pane">
              <AskHistoryInline
                historyQuery={historyQuery}
                projects={dashboard.projects}
                setPage={handleHistoryPageChange}
                onSelect={(item) => {
                  setAskAnswer({
                    question: item.question,
                    answer: item.answer,
                    projectSlug: item.projectSlug,
                    sources: item.sources,
                  });
                  setAskError(null);
                  setShowHistory(false);
                }}
              />
            </div>
          ) : null}
        </div>
      ) : (
        /* Project Brief */
        <Panel className="ask-ai-brief-panel">
          <ProjectBriefPanel
            response={selectedBriefResponse}
            loading={generateBriefMutation.isPending && generateBriefMutation.variables === briefProjectSlug}
            historyLoading={latestBriefQuery.isFetching}
            error={generateBriefMutation.isError && generateBriefMutation.variables === briefProjectSlug
              ? getErrorMessage(generateBriefMutation.error, 'Could not generate the project brief.')
              : ''}
            historyError={latestBriefQuery.isError
              ? getErrorMessage(latestBriefQuery.error, 'Could not load the latest project brief.')
              : ''}
            onGenerate={() => generateBriefMutation.mutate(briefProjectSlug)}
            onShowLatest={showLatestBrief}
            onOpenNote={openNote}
          />
        </Panel>
      )}
    </>
  );
}

function AskAnswerSkeleton({ question, projectLabel: selectedProjectLabel }: { question: string; projectLabel: string }) {
  return (
    <div className="ask-qa-card skeleton-card">
      <div className="ask-question-bubble">
        <span className="question-text">{question}</span>
        <span className="ask-project-chip">{selectedProjectLabel}</span>
      </div>
      <div className="ask-answer-container">
        <div className="ask-answer-header">
          <div className="ask-ai-identity">
            <AskAiIcon className="ask-ai-identity-icon ask-ai-pulse" />
            <strong>Thinking...</strong>
          </div>
        </div>
        <div className="ask-skeleton-lines">
          <div className="skeleton-line line-1"></div>
          <div className="skeleton-line line-2"></div>
          <div className="skeleton-line line-3"></div>
        </div>
      </div>
    </div>
  );
}

function AskHistoryInline({
  historyQuery,
  projects,
  setPage,
  onSelect,
}: {
  historyQuery: UseQueryResult<AskHistoryResponse>;
  projects: PageContext['dashboard']['projects'];
  setPage: (page: number) => void;
  onSelect: (item: AskAnswerCardItem) => void;
}) {
  const history = historyQuery.data?.history || [];

  return (
    <Panel className="ask-ai-history-panel">
      <h2>Question History</h2>

      {historyQuery.isLoading ? (
        <div className="inline-message">Loading history...</div>
      ) : historyQuery.isError ? (
        <InlineMessage tone="error">Could not load Ask AI history.</InlineMessage>
      ) : history.length === 0 ? (
        <EmptyState>No Ask AI history for this filter.</EmptyState>
      ) : (
        <>
          <div className={`ask-history-list ${historyQuery.isPlaceholderData ? 'stale-data' : ''}`}>
            {history.map((item) => (
              <button className="ask-history-item" key={item.id} type="button" onClick={() => onSelect(item)}>
                <div className="ask-history-item-header">
                  <span className="ask-history-question">{item.question}</span>
                  <span className={`confidence-dot ${item.confidence || 'medium'}`} title={`Confidence: ${item.confidence || 'medium'}`} />
                </div>
                <div className="ask-history-item-meta">
                  <span className="ask-history-project">{projectLabel(item.projectSlug, projects)}</span>
                  <span className="ask-history-date">{formatDate(item.createdAt)}</span>
                </div>
                <span className="ask-history-answer">{item.answer}</span>
              </button>
            ))}
          </div>
          {historyQuery.data?.pagination ? (
            <Pagination compact disableScrollToTop pagination={historyQuery.data.pagination} onPageChange={setPage} />
          ) : null}
        </>
      )}
    </Panel>
  );
}

function AskWaitingState({ onPromptClick }: { onPromptClick: (text: string) => void }) {
  const SUGGESTED_PROMPTS = [
    'Summarize my recent notes',
    'What are my action items?',
    'What is the status of platform?',
    'Review key decisions made',
  ];

  return (
    <div className="ask-waiting-card">
      <div className="ask-waiting-visual">
        <div className="ai-core-pulse">
          <div className="core-ring ring-1"></div>
          <div className="core-ring ring-2"></div>
          <div className="core-ring ring-3"></div>
          <div className="core-center">
            <AskAiIcon className="waiting-ai-icon" />
          </div>
        </div>
      </div>
      <div className="ask-waiting-text">
        <h3>Ask AI Assistant</h3>
        <p>Ask questions, query your notes, or get summaries instantly using neural search.</p>
      </div>
      <div className="ask-suggested-prompts">
        <span className="suggested-title">Suggested Prompts</span>
        <div className="suggested-grid">
          {SUGGESTED_PROMPTS.map((prompt, i) => (
            <button
              key={i}
              className="suggested-chip"
              type="button"
              onClick={() => onPromptClick(prompt)}
            >
              <span className="chip-text">{prompt}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

