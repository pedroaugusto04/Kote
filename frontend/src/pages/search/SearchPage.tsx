import { keepPreviousData, useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { PageContext } from '../../app/page-context';
import { KEYBOARD_KEYS } from '../../shared/constants/keyboard.constants';
import { UI_MESSAGES } from '../../shared/constants/ui.constants';
import { SEARCH_MESSAGES } from './search.constants';
import {
  fetchAskHistory,
  fetchLatestProjectBrief,
  fetchProjectBriefHistory,
  generateProjectBrief,
  runAsk,
} from '../../shared/api/client';
import { getErrorMessage } from '../../shared/api/error-message';
import { formatDateIso } from '../../shared/utils/format';
import type { AskHistoryResponse } from '../../shared/api/models/ask';
import type {
  ProjectBriefPanelResponse,
  ProjectBriefHistoryResponse,
  ProjectBriefHistoryRecord,
} from '../../shared/api/models/project-brief';
import type { AskAnswerCardItem } from '../../widgets/ask/ask-answer-card.models';
import { AskAnswerCard, projectLabel } from '../../widgets/ask/AskAnswerCard';
import { AskAiIcon } from '../../widgets/ask/AskAiIcon';
import { AskAnswerSkeleton } from '../../widgets/ask/AskAnswerSkeleton';
import { ProjectBriefPanel } from '../../widgets/projects/ProjectBriefPanel';
import { ProjectBriefSavedSource } from '../../shared/api/models/project-brief';
import { EmptyState, InlineMessage, PageHead, Panel } from '../../shared/ui/primitives';
import { Pagination } from '../../shared/ui/pagination';
import { Select } from '../../shared/ui/select';
import { notifyWarning } from '../../shared/ui/notifications';
import { notifyGeneralFormError } from '../../shared/forms/errors';
import { usePaginationState } from '../../shared/ui/use-pagination-state';
import './SearchPage.css';


export function SearchPage({ dashboard, openNote }: PageContext) {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'ask' | 'brief'>('ask');
  const [questionInput, setQuestionInput] = useState('');
  const [projectSlug, setProjectSlug] = useState('');
  const [askAnswer, setAskAnswer] = useState<AskAnswerCardItem | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const [showBriefHistory, setShowBriefHistory] = useState(false);
  const [selectedBrief, setSelectedBrief] = useState<ProjectBriefPanelResponse | null>(null);

  useEffect(() => {
    if (searchParams.get('focus') === 'input' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [searchParams]);

  const { page: historyPage, setPage: setHistoryPage } = usePaginationState(`ask-history:${projectSlug}`);
  const { page: briefHistoryPage, setPage: setBriefHistoryPage } = usePaginationState(`brief-history:${projectSlug}`);

  const handleHistoryPageChange = (newPage: number) => {
    setHistoryPage(newPage);
  };

  const selectedProjectLabel = projectLabel(projectSlug, dashboard.projects);

  const historyQuery = useQuery({
    queryKey: ['ask-history', projectSlug, historyPage],
    queryFn: () => fetchAskHistory({ projectSlug, page: historyPage, pageSize: 5 }),
    enabled: showHistory,
    placeholderData: keepPreviousData,
  });

  const briefProjectSlug = projectSlug || 'all';

  const latestBriefQuery = useQuery({
    queryKey: ['latest-brief', briefProjectSlug],
    queryFn: () => fetchLatestProjectBrief(briefProjectSlug),
    enabled: activeTab === 'brief',
    staleTime: 60_000,
  });

  const briefHistoryQuery = useQuery({
    queryKey: ['brief-history', briefProjectSlug, briefHistoryPage],
    queryFn: () => fetchProjectBriefHistory(briefProjectSlug, { page: briefHistoryPage, pageSize: 5 }),
    enabled: showBriefHistory,
    placeholderData: keepPreviousData,
  });

  const generateBriefMutation = useMutation({
    mutationFn: (slug: string) => generateProjectBrief(slug),
    onSuccess: (response) => {
      setSelectedBrief(response);
      void queryClient.invalidateQueries({ queryKey: ['brief-history'] });
      void queryClient.invalidateQueries({ queryKey: ['latest-brief'] });
    },
    onError: (error) => notifyGeneralFormError(error, SEARCH_MESSAGES.ERRORS.COULD_NOT_GENERATE_BRIEF),
  });

  // selectedBrief (user-generated or history pick) takes precedence over the auto-loaded latest brief
  const displayedBrief: ProjectBriefPanelResponse | undefined = selectedBrief
    || (latestBriefQuery.data?.brief ? latestBriefQuery.data : undefined)
    || undefined;

  const totalNotes = dashboard.home.metrics.find((m) => m.id === 'total-notes')?.value ?? 0;
  const totalAskQueries = dashboard.home.metrics.find((m) => m.id === 'total-ask-queries')?.value ?? 0;
  const firstGithubProject = dashboard.projects.find((project) => project.repositories.length > 0);
  const onboardingPrompts = totalNotes >= 3 && totalAskQueries === 0 && firstGithubProject
    ? [
      `What changed in my recent commits for ${firstGithubProject.displayName}?`,
      `Summarize the main risks captured for ${firstGithubProject.displayName}.`,
      'What technical decisions are documented in my workspace?',
    ]
    : undefined;

  const handleAsk = async (overrideQuestion?: string) => {
    const question = (overrideQuestion ?? questionInput).trim();
    if (isAsking) return;
    if (!question) {
      notifyWarning(SEARCH_MESSAGES.VALIDATION.TYPE_BEFORE_ASKING);
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
        setAskError(SEARCH_MESSAGES.ERRORS.COULD_NOT_GENERATE_ANSWER);
      }
    } catch (error: unknown) {
      setAskError(error instanceof Error ? error.message : SEARCH_MESSAGES.ERRORS.UNEXPECTED_ERROR);
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
        title={SEARCH_MESSAGES.PAGE_TITLE}
        subtitle={SEARCH_MESSAGES.PAGE_SUBTITLE}
        action={
          <Select
            ariaLabel={SEARCH_MESSAGES.FILTER.FILTER_BY_PROJECT}
            className="page-head-select"
            options={[
              { value: '', label: SEARCH_MESSAGES.FILTER.ALL_PROJECTS },
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
              setSelectedBrief(null);
              setShowBriefHistory(false);
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
          {SEARCH_MESSAGES.TABS.ASK_AI}
        </button>
        <button
          className={activeTab === 'brief' ? 'active' : ''}
          onClick={() => setActiveTab('brief')}
          type="button"
        >
          {SEARCH_MESSAGES.TABS.PROJECT_BRIEFS}
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
                  ref={inputRef}
                  aria-label={SEARCH_MESSAGES.INPUT.PLACEHOLDER}
                  autoComplete="off"
                  enterKeyHint="send"
                  spellCheck={false}
                  type="text"
                  value={questionInput}
                  onChange={(event) => setQuestionInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === KEYBOARD_KEYS.ENTER) {
                      event.preventDefault();
                      handleAsk();
                    }
                  }}
                  placeholder={UI_MESSAGES.ASK_ANYTHING}
                />
                <button className="icon-button ask-ai-send-btn" disabled={isAsking} type="button" onClick={() => handleAsk()}>
                  {isAsking ? UI_MESSAGES.ASKING : SEARCH_MESSAGES.INPUT.ASK_BUTTON}
                </button>
                <button
                  aria-expanded={showHistory}
                  className={`icon-button secondary ask-ai-history-toggle ${showHistory ? 'active' : ''}`}
                  type="button"
                  onClick={() => setShowHistory((current) => !current)}
                >
                  {showHistory ? SEARCH_MESSAGES.INPUT.HIDE_HISTORY : SEARCH_MESSAGES.INPUT.SHOW_HISTORY}
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
              <AskWaitingState prompts={onboardingPrompts} onPromptClick={handlePromptClick} />
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
        <div className={`ask-ai-workspace ${showBriefHistory ? 'has-history' : ''}`}>
          <div className="ask-ai-main-pane">
            <Panel className="ask-ai-brief-panel">
              <ProjectBriefPanel
                response={displayedBrief}
                loading={(generateBriefMutation.isPending && generateBriefMutation.variables === briefProjectSlug) || (latestBriefQuery.isLoading && !selectedBrief)}
                error={generateBriefMutation.isError && generateBriefMutation.variables === briefProjectSlug
                  ? getErrorMessage(generateBriefMutation.error, 'Could not generate the project brief.')
                  : ''}
                showHistory={showBriefHistory}
                onGenerate={() => {
                  setSelectedBrief(null);
                  generateBriefMutation.mutate(briefProjectSlug);
                }}
                onToggleHistory={() => setShowBriefHistory((current) => !current)}
                onOpenNote={openNote}
              />
            </Panel>
          </div>

          {/* History Panel */}
          {showBriefHistory ? (
            <div className="ask-ai-history-pane">
              <BriefHistoryInline
                historyQuery={briefHistoryQuery}
                setPage={setBriefHistoryPage}
                onSelect={(item) => {
                  setSelectedBrief({
                    ok: true,
                    source: ProjectBriefSavedSource.History,
                    brief: item.brief,
                  });
                  setShowBriefHistory(false);
                }}
              />
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}

function BriefHistoryInline({
  historyQuery,
  setPage,
  onSelect,
}: {
  historyQuery: UseQueryResult<ProjectBriefHistoryResponse>;
  setPage: (page: number) => void;
  onSelect: (item: ProjectBriefHistoryRecord) => void;
}) {
  const history = historyQuery.data?.items || [];

  return (
    <Panel className="ask-ai-history-panel">
      <h2>{SEARCH_MESSAGES.HISTORY.BRIEF_HISTORY_TITLE}</h2>

      {historyQuery.isLoading ? (
        <div className="inline-message">{SEARCH_MESSAGES.HISTORY.LOADING}</div>
      ) : historyQuery.isError ? (
        <InlineMessage tone="error">{SEARCH_MESSAGES.HISTORY.COULD_NOT_LOAD_BRIEF_HISTORY}</InlineMessage>
      ) : history.length === 0 ? (
        <EmptyState>{SEARCH_MESSAGES.HISTORY.NO_BRIEF_HISTORY}</EmptyState>
      ) : (
        <>
          <div className={`ask-history-list ${historyQuery.isPlaceholderData ? 'stale-data' : ''}`}>
            {history.map((item) => (
              <button className="ask-history-item" key={item.id} type="button" onClick={() => onSelect(item)}>
                <div className="ask-history-item-header">
                  <span className="ask-history-question">
                    {item.brief.summary.length > 50
                      ? `${item.brief.summary.slice(0, 50)}...`
                      : item.brief.summary}
                  </span>
                </div>
                <div className="ask-history-item-meta">
                  <span className="ask-history-project">{item.model}</span>
                  <span className="ask-history-date">{formatDateIso(item.generatedAt)}</span>
                </div>
                <span className="ask-history-answer">{item.brief.status}</span>
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
      <h2>{SEARCH_MESSAGES.HISTORY.ASK_HISTORY_TITLE}</h2>

      {historyQuery.isLoading ? (
        <div className="inline-message">{SEARCH_MESSAGES.HISTORY.LOADING}</div>
      ) : historyQuery.isError ? (
        <InlineMessage tone="error">{SEARCH_MESSAGES.HISTORY.COULD_NOT_LOAD_ASK_HISTORY}</InlineMessage>
      ) : history.length === 0 ? (
        <EmptyState>{SEARCH_MESSAGES.HISTORY.NO_ASK_HISTORY}</EmptyState>
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
                  <span className="ask-history-date">{formatDateIso(item.createdAt)}</span>
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

function AskWaitingState({ prompts, onPromptClick }: { prompts?: string[]; onPromptClick: (text: string) => void }) {
  const suggestedPrompts = prompts?.length ? prompts : SEARCH_MESSAGES.SUGGESTED_PROMPTS;
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
        <h3>{SEARCH_MESSAGES.WAITING_STATE.TITLE}</h3>
        <p>{SEARCH_MESSAGES.WAITING_STATE.DESCRIPTION}</p>
      </div>
      <div className="ask-suggested-prompts">
        <span className="suggested-title">{SEARCH_MESSAGES.WAITING_STATE.SUGGESTED_TITLE}</span>
        <div className="suggested-grid">
          {suggestedPrompts.map((prompt, i) => (
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
