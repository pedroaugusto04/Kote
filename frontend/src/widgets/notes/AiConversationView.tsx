import { useState } from 'react';
import { MarkdownView } from '../markdown/MarkdownView';
import type { AiConversationTurn } from './ai-conversation';
import { CopyIcon, CheckIcon } from '../../shared/ui/icons';

function TurnCopyButton({ content, role }: { content: string; role: 'user' | 'assistant' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const label = copied ? 'Copied!' : role === 'assistant' ? 'Copy response' : 'Copy prompt';

  return (
    <button
      type="button"
      className={`ai-conversation-copy-btn ${copied ? 'copied' : ''}`}
      onClick={handleCopy}
      title={label}
      aria-label={label}
    >
      {copied ? (
        <CheckIcon style={{ width: '12px', height: '12px' }} />
      ) : (
        <CopyIcon style={{ width: '12px', height: '12px' }} />
      )}
      <span>{copied ? 'Copied!' : 'Copy'}</span>
    </button>
  );
}

export function AiConversationView({ turns }: { turns: AiConversationTurn[] }) {
  return (
    <div className="ai-conversation">
      {turns.map((turn, index) => (
        <div
          key={index}
          className={`ai-conversation-turn ai-conversation-turn--${turn.role}`}
        >
          <div className="ai-conversation-role">
            <div className="ai-conversation-role-main">
              <span className="ai-conversation-role-icon" aria-hidden="true">
                {turn.role === 'user' ? '👤' : '✨'}
              </span>
              <span className="ai-conversation-role-label">
                {turn.role === 'user' ? 'User' : 'Assistant'}
              </span>
              <span className="ai-conversation-turn-index">#{index + 1}</span>
            </div>
            <TurnCopyButton content={turn.content} role={turn.role} />
          </div>
          <div className="ai-conversation-content">
            <MarkdownView markdown={turn.content} />
          </div>
        </div>
      ))}
    </div>
  );
}
