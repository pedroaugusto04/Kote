import { SEARCH_MESSAGES } from './search.constants';
import { AskAiIcon } from '../../widgets/ask/AskAiIcon';

export interface AskWaitingStateProps {
  prompts?: string[];
  onPromptClick: (text: string) => void;
}

export function AskWaitingState({ prompts, onPromptClick }: AskWaitingStateProps) {
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
