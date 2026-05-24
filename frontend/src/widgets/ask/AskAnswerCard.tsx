import type { Project } from '../../shared/api/models/project';
import { MarkdownView } from '../markdown/MarkdownView';
import type { AskAnswerCardItem } from './ask-answer-card.models';
import { AskAiIcon } from './AskAiIcon';
import './AskAnswerCard.css';

export function AskAnswerCard({
  item,
  openNote,
  projects,
}: {
  item: AskAnswerCardItem;
  openNote: (id: string) => void;
  projects: Project[];
}) {
  const sourceCount = item.sources.length;

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
          <span className="ask-source-count">Based on {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}</span>
        </div>
        <div className="ask-answer-body">
          <MarkdownView markdown={item.answer} />
        </div>
        {sourceCount > 0 ? (
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
        ) : (
          <div className="inline-message warning">No source notes were returned for this answer.</div>
        )}
      </div>
    </div>
  );
}

export function projectLabel(projectSlug: string, projects: Project[]) {
  if (!projectSlug) return 'All projects';
  return projects.find((project) => project.projectSlug === projectSlug)?.displayName || projectSlug;
}
