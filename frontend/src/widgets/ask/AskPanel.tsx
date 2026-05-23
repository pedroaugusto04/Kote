import { useState, useRef, useEffect } from 'react';

import { runAsk } from '../../shared/api/client';
import { MarkdownView } from '../markdown/MarkdownView';
import { AskAiIcon } from './AskAiIcon';
import './AskPanel.css';

type HistoryItem = {
  question: string;
  answer: string;
  sources: Array<{
    noteId: string;
    title: string;
    path: string;
  }>;
};

export function AskPanel({ openNote }: { openNote: (id: string) => void }) {
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

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
      const result = await runAsk({ question: queryText });
      if (result && result.ok) {
        setHistory((prev) => [
          ...prev,
          {
            question: queryText,
            answer: result.answer,
            sources: result.sources || [],
          },
        ]);
        setQuestion('');
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
      {history.length === 0 && !isLoading && (
        <div className="ask-welcome">
          <div className="ask-welcome-title">
            <span className="ask-ai-mark">
              <AskAiIcon className="ask-ai-mark-icon" />
            </span>
            <h3>Ask your Knowledge Base</h3>
          </div>
          <p>
            Get answers compiled directly from your notes using semantic search.
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

      {history.length > 0 && (
        <div className="ask-history-list">
          {history.map((item, index) => (
            <div className="ask-qa-card" key={index}>
              <div className="ask-question-bubble">
                <span className="question-text">{item.question}</span>
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
          ))}
        </div>
      )}

      {isLoading && (
        <div className="ask-qa-card skeleton-card">
          <div className="ask-question-bubble">
            <span className="question-text">{question}</span>
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

      {error && <div className="inline-message error">{error}</div>}

      <form className="ask-input-form" onSubmit={handleSubmit}>
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
