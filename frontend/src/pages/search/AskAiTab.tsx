import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { PageContext } from '../../app/page-context';
import { KEYBOARD_KEYS } from '../../shared/constants/keyboard.constants';
import { UI_MESSAGES } from '../../shared/constants/ui.constants';
import { SEARCH_MESSAGES } from './search.constants';
import {
  fetchAskConversations,
  fetchConversationTurns,
  fetchCurrentUser,
  runAsk,
} from '../../shared/api/client';
import { QUERY_KEYS } from '../../shared/constants/query-keys.constants';
import type { ChatMessage, AskConversationTurn } from '../../shared/api/models/ask';
import { AskAiIcon } from '../../widgets/ask/AskAiIcon';
import { InlineMessage } from '../../shared/ui/primitives';
import { notifyWarning } from '../../shared/ui/notifications';
import { usePaginationState } from '../../shared/ui/use-pagination-state';
import { UserAvatar } from '../../shared/ui/user-avatar';
import { TypewriterMarkdown } from '../../widgets/markdown/TypewriterMarkdown';
import { AskWaitingState } from './AskWaitingState';
import { AskHistoryInline } from './AskHistoryInline';

export interface AskAiTabProps {
  projectSlug: string;
  dashboard: PageContext['dashboard'];
  openNote: (noteId: string) => void;
}

export function AskAiTab({
  projectSlug,
  dashboard,
  openNote,
}: AskAiTabProps) {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const bottomInputRef = useRef<HTMLInputElement>(null);
  const freshMessageIdRef = useRef<string | null>(null);

  const [questionInput, setQuestionInput] = useState('');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

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

  useEffect(() => {
    setActiveConversationId(null);
    setMessages([]);
    setAskError(null);
  }, [projectSlug]);

  const { page: historyPage, setPage: setHistoryPage } = usePaginationState(`ask-history:${projectSlug}`);

  const historyQuery = useQuery({
    queryKey: ['ask-conversations', projectSlug, historyPage],
    queryFn: () => fetchAskConversations({ projectSlug, page: historyPage, pageSize: 5 }),
    enabled: showHistory,
    placeholderData: keepPreviousData,
  });

  const handleHistoryPageChange = (newPage: number) => {
    setHistoryPage(newPage);
  };

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
        freshMessageIdRef.current = assistantMsg.id;
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
        freshMessageIdRef.current = null;
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
          <section className="ask-ai-input-section">
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
                      <strong>{msg.role === 'user' ? (currentUser?.displayName || 'You') : 'Kote Assistant'}</strong>
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
                        <TypewriterMarkdown
                          markdown={msg.content}
                          animationKey={msg.id}
                          animated={msg.id === freshMessageIdRef.current}
                        />
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
                      <strong>Kote Assistant</strong>
                    </div>
                    <div className="message-body">
                      <AskAiIcon className="ask-ai-identity-icon ask-ai-pulse" />
                      <strong>{SEARCH_MESSAGES.SKELETON.THINKING}</strong>
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
  );
}
