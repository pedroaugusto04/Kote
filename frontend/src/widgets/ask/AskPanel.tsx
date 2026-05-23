import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';

import { fetchAskHistory, runAsk } from '../../shared/api/client';
import type { Project } from '../../shared/api/models/project';
import { DEFAULT_PAGE_SIZE } from '../../shared/api/models/pagination';
import { Pagination } from '../../shared/ui/pagination';
import { Select } from '../../shared/ui/select';
import { usePaginationState } from '../../shared/ui/use-pagination-state';
import { MarkdownView } from '../markdown/MarkdownView';
import { AskAiIcon } from './AskAiIcon';
import './AskPanel.css';

type SessionAskItem = {
  question: string;
  answer: string;
  projectSlug: string;
  sources: Array<{
    noteId: string;
    title: string;
    path: string;
  }>;
};

export function AskPanel({ openNote, projects }: { openNote: (id: string) => void; projects: Project[] }) {
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState('');
  const [projectSlug, setProjectSlug] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionItems, setSessionItems] = useState<SessionAskItem[]>([]);
  const { page, setPage } = usePaginationState(projectSlug);
  const bottomRef = useRef<HTMLDivElement>(null);
  const selectedProjectLabel = projectSlug
    ? projects.find((project) => project.projectSlug === projectSlug)?.displayName || projectSlug
    : 'All projects';
  const historyQuery = useQuery({
    queryKey: ['ask-history', projectSlug, page],
    queryFn: () => fetchAskHistory({ projectSlug, page, pageSize: DEFAULT_PAGE_SIZE }),
    enabled: showHistory,
    placeholderData: keepPreviousData,
  });
  const history = historyQuery.data?.history || [];

  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, isLoading]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const queryText = question.trim();
    if (!queryText || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await runAsk({ question: queryText, projectSlug });
      if (result && result.ok) {
        setSessionItems((current) => [
          ...current,
          {
            question: queryText,
            answer: result.answer,
            projectSlug,
            sources: result.sources || [],
          },
        ]);
        setQuestion('');
        setPage(1);
        await queryClient.invalidateQueries({ queryKey: ['ask-history'] });
      } else {
        setError('Could not generate an answer. Please try again.');
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred while communicating with the AI.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuestion(suggestion);
  };

  return (
    <div className="ask-panel-container">
      {!showHistory && sessionItems.length === 0 && !isLoading && (
        <div className="ask-welcome">
          <div className="ask-welcome-title">
            <span className="ask-ai-mark">
              <AskAiIcon className="ask-ai-mark-icon" />
            </span>
            <h3>Ask your Knowledge Base</h3>
          </div>
          <p>
            Get answers compiled directly from your notes using AI.
          </p>
          <div className="ask-suggestions">
            <span className="suggestion-title">Try asking:</span>
            <button
              className="suggestion-btn"
              type="button"
              onClick={() =>
                handleSuggestionClick('What are the main decisions recently?')
              }
            >
              "What are the main decisions recently?"
            </button>
            <button
              className="suggestion-btn"
              type="button"
              onClick={() =>
                handleSuggestionClick(
                  'Summarize the deployment rollout status.'
                )
              }
            >
              "Summarize the deployment rollout status."
            </button>
          </div>
        </div>
      )}

      {!showHistory && sessionItems.length > 0 && (
        <div className="ask-history-list">
          {sessionItems.map((item, index) => (
            <AskAnswerCard
              key={`${item.question}-${index}`}
              item={item}
              openNote={openNote}
              projects={projects}
            />
          ))}
        </div>
      )}

      <div className="ask-history-toolbar">
        <button
          className="icon-button"
          type="button"
          onClick={() => setShowHistory((current) => !current)}
        >
          {showHistory ? 'Hide history' : 'Show history'}
        </button>
      </div>

      {showHistory && historyQuery.isLoading && (
        <div className="inline-message">Loading history...</div>
      )}

      {showHistory && history.length > 0 && (
        <div className={`ask-history-list ${historyQuery.isPlaceholderData ? 'stale-data' : ''}`}>
          {history.map((item) => (
            <AskAnswerCard key={item.id} item={item} openNote={openNote} projects={projects} />
          ))}
          {historyQuery.data?.pagination ? (
            <Pagination compact pagination={historyQuery.data.pagination} onPageChange={setPage} />
          ) : null}
        </div>
      )}

      {showHistory && !historyQuery.isLoading && history.length === 0 && (
        <div className="inline-message">No Ask AI history for this filter.</div>
      )}

      {isLoading && (
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
      )}

      <div ref={bottomRef} />

      {(error || (showHistory && historyQuery.isError)) && (
        <div className="inline-message error">
          {error || 'Could not load Ask AI history.'}
        </div>
      )}

      <form className="ask-input-form" onSubmit={handleSubmit}>
        <Select
          ariaLabel="Filter Ask AI by project"
          className="ask-project-select"
          disabled={isLoading}
          options={[
            { value: '', label: 'All projects' },
            ...projects.map((project) => ({
              value: project.projectSlug,
              label: project.displayName,
            })),
          ]}
          value={projectSlug}
          onChange={setProjectSlug}
        />
        <input
          disabled={isLoading}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question about your knowledge..."
          type="text"
        />
        <button className="icon-button" disabled={isLoading || !question.trim()} type="submit">
          {isLoading ? '...' : 'Ask'}
        </button>
      </form>
    </div>
  );
}

function AskAnswerCard({
  item,
  openNote,
  projects,
}: {
  item: {
    question: string;
    answer: string;
    projectSlug: string;
    sources: Array<{
      noteId: string;
      title: string;
      path: string;
    }>;
  };
  openNote: (id: string) => void;
  projects: Project[];
}) {
  return (
    <div className="ask-qa-card">
      <div className="ask-question-bubble">
        <span className="question-text">{item.question}</span>
        <span className="ask-project-chip">{projectLabel(item.projectSlug, projects)}</span>
      </div>
      <div className="ask-answer-container">
        <div className="ask-answer-header">
          <div className="ask-ai-identity">
            <AskAiIcon className="ask-ai-identity-icon" />
            <strong>Assistant</strong>
          </div>
        </div>
        <div className="ask-answer-body">
          <MarkdownView markdown={item.answer} />
        </div>
        {item.sources.length > 0 && (
          <div className="ask-sources-footer">
            <span className="sources-label">Sources:</span>
            <div className="sources-list">
              {item.sources.map((source) => (
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
        )}
      </div>
    </div>
  );
}

function projectLabel(projectSlug: string, projects: Project[]) {
  if (!projectSlug) return 'All projects';
  return projects.find((project) => project.projectSlug === projectSlug)?.displayName || projectSlug;
}
