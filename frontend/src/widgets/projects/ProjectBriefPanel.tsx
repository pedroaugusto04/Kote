import type { ProjectBriefPanelResponse } from '../../shared/api/models/project-brief';
import { UI_MESSAGES } from '../../shared/constants/ui.constants';

export type ProjectBriefPanelProps = {
  response?: ProjectBriefPanelResponse;
  loading: boolean;
  error: string;
  showHistory: boolean;
  onGenerate: () => void;
  onToggleHistory: () => void;
  onOpenNote: (noteId: string) => void;
};

function BriefIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function BriefWaitingState() {
  return (
    <div className="brief-waiting-card">
      <div className="brief-waiting-visual">
        <div className="brief-core-pulse">
          <div className="brief-core-ring ring-1"></div>
          <div className="brief-core-ring ring-2"></div>
          <div className="brief-core-ring ring-3"></div>
          <div className="brief-core-center">
            <BriefIcon className="waiting-brief-icon" />
          </div>
        </div>
      </div>
      <div className="brief-waiting-content">
        <h3>Project Brief Assistant</h3>
        <p>Click "Generate brief" or "Show history" above to synthesize project-wide activities, decisions, and risks.</p>
      </div>
    </div>
  );
}

function BriefThinkingState() {
  return (
    <div className="brief-thinking-card">
      <div className="brief-thinking-visual">
        <div className="brief-thinking-pulse">
          <div className="brief-core-ring ring-1 pulsing"></div>
          <div className="brief-core-ring ring-2 pulsing"></div>
          <div className="brief-core-ring ring-3 pulsing"></div>
          <div className="brief-core-center">
            <BriefIcon className="waiting-brief-icon rotating-icon" />
          </div>
        </div>
      </div>
      <div className="brief-thinking-content">
        <h3>Analyzing Notes & Decisions...</h3>
        <p>Our AI model is compiling project updates, extracting decisions, and preparing the layout.</p>
      </div>
      <div className="brief-thinking-skeleton-grid">
        <div className="brief-skeleton-section full-width">
          <div className="skeleton-title-bar"></div>
          <div className="skeleton-text-bar line-1"></div>
          <div className="skeleton-text-bar line-2"></div>
        </div>
        <div className="brief-skeleton-section">
          <div className="skeleton-title-bar"></div>
          <div className="skeleton-text-bar line-1"></div>
          <div className="skeleton-text-bar line-2"></div>
        </div>
        <div className="brief-skeleton-section">
          <div className="skeleton-title-bar"></div>
          <div className="skeleton-text-bar line-1"></div>
          <div className="skeleton-text-bar line-2"></div>
        </div>
        <div className="brief-skeleton-section">
          <div className="skeleton-title-bar"></div>
          <div className="skeleton-text-bar line-1"></div>
          <div className="skeleton-text-bar line-2"></div>
        </div>
        <div className="brief-skeleton-section">
          <div className="skeleton-title-bar"></div>
          <div className="skeleton-text-bar line-1"></div>
          <div className="skeleton-text-bar line-2"></div>
        </div>
      </div>
    </div>
  );
}

export function ProjectBriefPanel({
  response,
  loading,
  error,
  showHistory,
  onGenerate,
  onToggleHistory,
  onOpenNote,
}: ProjectBriefPanelProps) {
  const brief = response?.brief;
  const source = response && 'source' in response ? response.source : '';
  const hasNoSavedBrief = source === 'none';
  const isFallback = Boolean(response && 'fallback' in response && response.fallback);
  const busy = loading;

  return (
    <section className="project-brief-panel" aria-label={UI_MESSAGES.PROJECT_BRIEF}>
      <div className="project-brief-head">
        <div>
          <h3>{UI_MESSAGES.PROJECT_BRIEF}</h3>
          <p>{brief ? `Generated ${new Date(brief.generatedAt).toLocaleString('en-US')}` : hasNoSavedBrief ? 'No saved brief yet.' : 'Generate a new brief or view history.'}</p>
        </div>
        <div className="project-brief-actions">
          <button className="icon-button" disabled={busy} type="button" onClick={onGenerate}>
            {loading ? 'Generating...' : 'Generate brief'}
          </button>
          <button
            aria-expanded={showHistory}
            className={`icon-button secondary project-brief-history-toggle ${showHistory ? 'active' : ''}`}
            disabled={busy}
            type="button"
            onClick={onToggleHistory}
          >
            {showHistory ? 'Hide history' : 'Show history'}
          </button>
        </div>
      </div>

      {isFallback ? (
        <div className="project-brief-fallback" role="status">Showing the latest saved brief because generation failed.</div>
      ) : null}
      {error ? <div className="project-brief-error" role="alert">{error}</div> : null}

      {busy ? (
        <BriefThinkingState />
      ) : brief ? (
        <div className="project-brief-grid">
          <ProjectBriefSection title="Summary" items={[brief.summary]} isText />
          <ProjectBriefSection title="Status" items={[brief.status]} isText />
          <ProjectBriefSection title="Recent changes" items={brief.recentChanges} />
          <ProjectBriefSection title="Decisions" items={brief.decisions} />
          <ProjectBriefSection title="Open items" items={brief.openItems} />
          <ProjectBriefSection title="Risks" items={brief.risks} />
          <ProjectBriefSection title="Next steps" items={brief.nextSteps} />
          <div className="project-brief-section-card sources-section">
            <div className="project-brief-section-header">
              <span className="project-brief-section-tag">Sources</span>
            </div>
            {brief.sources.length > 0 ? (
              <div className="project-brief-sources-list">
                {brief.sources.map((source) => (
                  <button
                     className="source-link-btn project-brief-source-chip"
                     key={source.noteId}
                     type="button"
                     onClick={() => onOpenNote(source.noteId)}
                  >
                    <span className="source-chip-title">{source.title || source.path || source.noteId}</span>
                    {source.date ? <span className="source-chip-date">{source.date}</span> : null}
                  </button>
                ))}
              </div>
            ) : (
              <p className="project-brief-section-empty">No sources.</p>
            )}
          </div>
        </div>
      ) : !error ? (
        <BriefWaitingState />
      ) : null}
    </section>
  );
}

function ProjectBriefSection({ title, items, isText = false }: { title: string; items: string[]; isText?: boolean }) {
  const filtered = items.map((item) => item.trim()).filter(Boolean);
  return (
    <div className="project-brief-section-card">
      <div className="project-brief-section-header">
        <span className="project-brief-section-tag">{title}</span>
      </div>
      {filtered.length > 0 ? (
        isText ? (
          <p className="project-brief-section-text">{filtered[0]}</p>
        ) : (
          <ul className="project-brief-section-list">
            {filtered.map((item, index) => (
              <li key={`${title}-${index}`} className="project-brief-section-item">
                <span className="brief-bullet-marker"></span>
                <span className="brief-item-content">{item}</span>
              </li>
            ))}
          </ul>
        )
      ) : (
        <p className="project-brief-section-empty">None.</p>
      )}
    </div>
  );
}
