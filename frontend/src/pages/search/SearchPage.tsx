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
  fetchAskConversations,
  fetchConversationTurns,
  fetchCurrentUser,
} from '../../shared/api/client';
import { getErrorMessage } from '../../shared/api/error-message';
import { formatDateIso } from '../../shared/utils/format';
import { QUERY_KEYS } from '../../shared/constants/query-keys.constants';
import type { ChatMessage, AskConversationTurn, AskConversationsResponse } from '../../shared/api/models/ask';
import type {
  ProjectBriefPanelResponse,
  ProjectBriefHistoryResponse,
  ProjectBriefHistoryRecord,
} from '../../shared/api/models/project-brief';
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
import { UserAvatar } from '../../shared/ui/user-avatar';
import { MarkdownView } from '../../widgets/markdown/MarkdownView';
import './SearchPage.css';


export function SearchPage({ dashboard, openNote }: PageContext) {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const bottomInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'ask' | 'brief'>(() => {
    const tabParam = searchParams.get('tab');
    return tabParam === 'brief' ? 'brief' : 'ask';
  });
  const [questionInput, setQuestionInput] = useState('');
  const [projectSlug, setProjectSlug] = useState('');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const [showBriefHistory, setShowBriefHistory] = useState(false);
  const [selectedBrief, setSelectedBrief] = useState<ProjectBriefPanelResponse | null>(null);

  const currentUserQuery = useQuery({
    queryKey: QUERY_KEYS.AUTH.ME,
    queryFn: fetchCurrentUser,
  });
  const currentUser = currentUserQuery.data?.user;

  useEffect(() => {
    if (searchParams.get('focus') === 'input' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [searchParams]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isAsking]);

  const { page: historyPage, setPage: setHistoryPage } = usePaginationState(`ask-history:${projectSlug}`);
  const { page: briefHistoryPage, setPage: setBriefHistoryPage } = usePaginationState(`brief-history:${projectSlug}`);

  const handleHistoryPageChange = (newPage: number) => {
    setHistoryPage(newPage);
  };

  const selectedProjectLabel = projectLabel(projectSlug, dashboard.projects);

  const historyQuery = useQuery({
    queryKey: ['ask-conversations', projectSlug, historyPage],
    queryFn: () => fetchAskConversations({ projectSlug, page: historyPage, pageSize: 5 }),
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


  const handleAsk = async (overrideQuestion?: string) => {
    const question = (overrideQuestion ?? questionInput).trim();
    if (isAsking) return;
    if (!question) {
      notifyWarning(SEARCH_MESSAGES.VALIDATION.TYPE_BEFORE_ASKING);
      return;
    }

    setIsAsking(true);
    setAskError(null);

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      content: question,
      timestamp: new Date().toISOString(),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setQuestionInput('');

    // Sliced conversation history for sliding window (last 5 turns)
    const historyTurns: AskConversationTurn[] = [];
    for (let i = 0; i < nextMessages.length - 1; i++) {
      const current = nextMessages[i];
      const next = nextMessages[i + 1];
      if (current.role === 'user' && next.role === 'assistant') {
        historyTurns.push({
          question: current.content,
          answer: next.content,
          projectSlug: projectSlug,
          timestamp: current.timestamp,
        });
      }
    }
    const conversationHistory = historyTurns.slice(-5);

    try {
      const result = await runAsk({
        question,
        projectSlug: projectSlug || undefined,
        conversationId: activeConversationId || undefined,
        conversationHistory,
      });
      if (result?.ok) {
        const assistantMsg: ChatMessage = {
          id: String(Date.now() + 1),
          role: 'assistant',
          content: result.answer,
          timestamp: new Date().toISOString(),
          sources: result.sources || [],
          relatedNotes: result.relatedNotes || [],
        };
        setMessages((prev) => [...prev, assistantMsg]);
        if (result.conversationId) {
          setActiveConversationId(result.conversationId);
        }
        setAskError(null);
        setHistoryPage(1);
        await queryClient.invalidateQueries({ queryKey: ['ask-conversations'] });
        setTimeout(() => {
          bottomInputRef.current?.focus();
        }, 50);
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

  const handleSelectConversation = async (conversationId: string) => {
    setIsAsking(true);
    setAskError(null);
    try {
      const response = await fetchConversationTurns(conversationId);
      if (response?.ok && response.turns) {
        const chatMessages: ChatMessage[] = [];
        response.turns.forEach((turn) => {
          chatMessages.push({
            id: `${turn.id}-q`,
            role: 'user',
            content: turn.question,
            timestamp: turn.createdAt,
          });
          chatMessages.push({
            id: `${turn.id}-a`,
            role: 'assistant',
            content: turn.answer,
            timestamp: turn.createdAt,
            sources: turn.sources || [],
            relatedNotes: turn.relatedNotes || [],
          });
        });
        setMessages(chatMessages);
        setActiveConversationId(conversationId);
        setShowHistory(false);
        setTimeout(() => {
          bottomInputRef.current?.focus();
        }, 50);
      } else {
        setAskError(SEARCH_MESSAGES.ERRORS.UNEXPECTED_ERROR);
      }
    } catch (error: unknown) {
      setAskError(error instanceof Error ? error.message : SEARCH_MESSAGES.ERRORS.UNEXPECTED_ERROR);
    } finally {
      setIsAsking(false);
    }
  };

  const handleNewConversation = () => {
    setActiveConversationId(null);
    setMessages([]);
    setQuestionInput('');
    setAskError(null);
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
              setActiveConversationId(null);
              setMessages([]);
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
            {/* Top Action Bar when chat is active, otherwise welcome input section */}
            {messages.length > 0 ? (
              <div className="ask-ai-active-header">
                <div className="ask-ai-header-left">
                  <AskAiIcon className="ask-ai-input-icon" />
                  <h2>Conversations</h2>
                </div>
                <div className="ask-ai-header-actions">
                  <button
                    className="icon-button secondary ask-ai-new-chat-btn"
                    type="button"
                    onClick={handleNewConversation}
                  >
                    New Chat
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
              </div>
            ) : (
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
            )}

            {/* Chat Messages List */}
            {messages.length > 0 ? (
              <div className="ask-conversation-container">
                <div className="ask-messages-list">
                  {messages.map((msg) => (
                    <div key={msg.id} className={`ask-message-bubble ${msg.role}`}>
                      <div className="message-avatar-wrapper">
                        {msg.role === 'user' ? (
                          <UserAvatar
                            avatarUrl={currentUser?.avatarUrl}
                            displayName={currentUser?.displayName}
                            email={currentUser?.email}
                            className="chat-user-avatar"
                          />
                        ) : (
                          <AskAiIcon className="message-assistant-icon" />
                        )}
                      </div>
                      <div className="message-content-wrapper">
                        <div className="message-meta">
                          <strong>{msg.role === 'user' ? (currentUser?.displayName || 'You') : 'Assistant'}</strong>
                          {msg.role === 'assistant' && msg.sources && (
                            <span className="ask-source-count">
                              Based on {msg.sources.length} {msg.sources.length === 1 ? 'source' : 'sources'}
                            </span>
                          )}
                        </div>
                        <div className="message-body">
                          {msg.role === 'user' ? (
                            <span className="question-text">{msg.content}</span>
                          ) : (
                            <MarkdownView markdown={msg.content} />
                          )}
                        </div>
                        {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 ? (
                          <div className="ask-sources-footer">
                            <span className="sources-label">Sources:</span>
                            <div className="sources-list">
                              {msg.sources.map((source) => (
                                <button
                                  className="source-link-btn"
                                  key={source.noteId}
                                  type="button"
                                  onClick={() => openNote(source.noteId)}
                                >
                                  {source.title || source.path}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : msg.role === 'assistant' ? (
                          <div className="inline-message warning">No source notes were returned for this answer.</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {isAsking && (
                    <div className="ask-message-bubble assistant loading-bubble">
                      <div className="message-avatar-wrapper">
                        <AskAiIcon className="message-assistant-icon" />
                      </div>
                      <div className="message-content-wrapper">
                        <div className="message-meta">
                          <strong>Assistant</strong>
                        </div>
                        <div className="message-body">
                          <div className="skeleton-line pulse" style={{ width: '40%', height: '14px', borderRadius: '4px', background: 'var(--line-soft)', marginBottom: '8px' }} />
                          <div className="skeleton-line pulse" style={{ width: '85%', height: '14px', borderRadius: '4px', background: 'var(--line-soft)', marginBottom: '8px' }} />
                          <div className="skeleton-line pulse" style={{ width: '60%', height: '14px', borderRadius: '4px', background: 'var(--line-soft)' }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Bottom Input for Active Chat turns */}
                <div className="ask-ai-bottom-input-container">
                  <div className="ask-ai-input-row">
                    <input
                      ref={bottomInputRef}
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
                      placeholder="Type a message..."
                      disabled={isAsking}
                    />
                    <button className="icon-button ask-ai-send-btn" disabled={isAsking || !questionInput.trim()} type="button" onClick={() => handleAsk()}>
                      {isAsking ? UI_MESSAGES.ASKING : SEARCH_MESSAGES.INPUT.ASK_BUTTON}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {messages.length === 0 && !isAsking ? (
              <AskWaitingState onPromptClick={handlePromptClick} />
            ) : null}

            {askError ? <InlineMessage className="ask-error-message" tone="error">{askError}</InlineMessage> : null}
          </div>

          {/* History Panel */}
          {showHistory ? (
            <div className="ask-ai-history-pane">
              <AskHistoryInline
                conversationsQuery={historyQuery}
                projects={dashboard.projects}
                setPage={handleHistoryPageChange}
                onSelect={handleSelectConversation}
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
  conversationsQuery,
  projects,
  setPage,
  onSelect,
}: {
  conversationsQuery: UseQueryResult<AskConversationsResponse>;
  projects: PageContext['dashboard']['projects'];
  setPage: (page: number) => void;
  onSelect: (conversationId: string) => void;
}) {
  const conversations = conversationsQuery.data?.conversations || [];

  return (
    <Panel className="ask-ai-history-panel">
      <h2>{SEARCH_MESSAGES.HISTORY.ASK_HISTORY_TITLE}</h2>

      {conversationsQuery.isLoading ? (
        <div className="inline-message">{SEARCH_MESSAGES.HISTORY.LOADING}</div>
      ) : conversationsQuery.isError ? (
        <InlineMessage tone="error">{SEARCH_MESSAGES.HISTORY.COULD_NOT_LOAD_ASK_HISTORY}</InlineMessage>
      ) : conversations.length === 0 ? (
        <EmptyState>{SEARCH_MESSAGES.HISTORY.NO_ASK_HISTORY}</EmptyState>
      ) : (
        <>
          <div className={`ask-history-list ${conversationsQuery.isPlaceholderData ? 'stale-data' : ''}`}>
            {conversations.map((item) => {
              const project = projects.find((p) => p.id === item.projectId);
              const projectSlug = project?.projectSlug || '';
              return (
                <button className="ask-history-item" key={item.conversationId} type="button" onClick={() => onSelect(item.conversationId)}>
                  <div className="ask-history-item-header">
                    <span className="ask-history-question">{item.title}</span>
                  </div>
                  <div className="ask-history-item-meta">
                    <span className="ask-history-project">{projectLabel(projectSlug, projects)}</span>
                    <span className="ask-history-date">{formatDateIso(item.createdAt)}</span>
                  </div>
                </button>
              );
            })}
          </div>
          {conversationsQuery.data?.pagination ? (
            <Pagination compact disableScrollToTop pagination={conversationsQuery.data.pagination} onPageChange={setPage} />
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
