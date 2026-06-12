import { keepPreviousData, useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';

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
  const [questionInput, setQuestionInput] = useState('');
  const [projectSlug, setProjectSlug] = useState('');
  const [askAnswer, setAskAnswer] = useState<AskAnswerCardItem | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [hiddenLatestBriefProjects, setHiddenLatestBriefProjects] = useState<Record<string, boolean>>({});

  const { page: historyPage, setPage: setHistoryPage } = usePaginationState(`ask-history:${projectSlug}`);
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

  const handleAsk = async () => {
    const question = questionInput.trim();
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

  return (
    <>
      <PageHead title="Ask AI" subtitle="Ask questions, generate project briefs, and explore your AI history." />

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
          <button className="icon-button ask-ai-send-btn" disabled={isAsking} type="button" onClick={handleAsk}>
            {isAsking ? 'Asking...' : 'Ask'}
          </button>
        </div>
        <div className="ask-ai-filters">
          <Select
            ariaLabel="Filter by project"
            className="ask-ai-filter"
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

      {/* History inline */}
      {showHistory ? (
        <AskHistoryInline
          historyQuery={historyQuery}
          projects={dashboard.projects}
          setPage={setHistoryPage}
          onSelect={(item) => {
            setAskAnswer({
              question: item.question,
              answer: item.answer,
              projectSlug: item.projectSlug,
              sources: item.sources,
            });
            setAskError(null);
          }}
        />
      ) : null}

      {/* AI Answer */}
      {isAsking ? <AskAnswerSkeleton question={questionInput.trim()} projectLabel={selectedProjectLabel} /> : null}

      {!isAsking && askAnswer ? (
        <Panel className="ai-answer-card-panel">
          <AskAnswerCard item={askAnswer} openNote={openNote} projects={dashboard.projects} />
        </Panel>
      ) : null}

      {askError ? <InlineMessage className="ask-error-message" tone="error">{askError}</InlineMessage> : null}

      {/* Project Brief */}
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
            <AskAiIcon className="ask-ai-identity-icon" />
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
                <span className="ask-history-question">{item.question}</span>
                <span className="ask-history-project">{projectLabel(item.projectSlug, projects)}</span>
                <span className="ask-history-answer">{item.answer}</span>
              </button>
            ))}
          </div>
          {historyQuery.data?.pagination ? (
            <Pagination compact pagination={historyQuery.data.pagination} onPageChange={setPage} />
          ) : null}
        </>
      )}
    </Panel>
  );
}
