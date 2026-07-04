import { MarkdownView } from '../markdown/MarkdownView';
import type { AiConversationTurn } from './ai-conversation';

export function AiConversationView({ turns }: { turns: AiConversationTurn[] }) {
  return (
    <div className="ai-conversation">
      {turns.map((turn, index) => (
        <div
          key={index}
          className={`ai-conversation-turn ai-conversation-turn--${turn.role}`}
        >
          <div className="ai-conversation-role">
            <span className="ai-conversation-role-icon" aria-hidden="true">
              {turn.role === 'user' ? '👤' : '🤖'}
            </span>
            <span className="ai-conversation-role-label">
              {turn.role === 'user' ? 'User' : 'Assistant'}
            </span>
          </div>
          <div className="ai-conversation-content">
            <MarkdownView markdown={turn.content} />
          </div>
        </div>
      ))}
    </div>
  );
}
