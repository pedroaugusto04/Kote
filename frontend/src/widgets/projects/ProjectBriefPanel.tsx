import type { ProjectBriefPanelResponse } from '../../shared/api/models/project-brief';

export type ProjectBriefPanelProps = {
  response?: ProjectBriefPanelResponse;
  loading: boolean;
  historyLoading: boolean;
  error: string;
  historyError: string;
  onGenerate: () => void;
  onShowLatest: () => void;
  onOpenNote: (noteId: string) => void;
};

export function ProjectBriefPanel({
  response,
  loading,
  historyLoading,
  error,
  historyError,
  onGenerate,
  onShowLatest,
  onOpenNote,
}: ProjectBriefPanelProps) {
  const brief = response?.brief;
  const source = response && 'source' in response ? response.source : '';
  const hasNoSavedBrief = source === 'none';
  const isFallback = Boolean(response && 'fallback' in response && response.fallback);
  const busy = loading || historyLoading;
  return (
    <section className="project-brief-panel" aria-label="Project brief">
      <div className="project-brief-head">
        <div>
          <h3>Project brief</h3>
          <p>{brief ? `Generated ${new Date(brief.generatedAt).toLocaleString('en-US')}` : hasNoSavedBrief ? 'No saved brief yet.' : 'Generate a new brief or show the latest saved one.'}</p>
        </div>
        <div className="project-brief-actions">
          <button className="icon-button" disabled={busy} type="button" onClick={onGenerate}>
            {loading ? 'Generating...' : 'Generate brief'}
          </button>
          <button className="icon-button secondary" disabled={busy} type="button" onClick={onShowLatest}>
            {historyLoading ? 'Loading...' : source === 'history' ? 'Hide latest' : 'Show latest'}
          </button>
        </div>
      </div>
      {isFallback ? (
        <div className="project-brief-fallback" role="status">Showing the latest saved brief because generation failed.</div>
      ) : null}
      {source === 'history' ? (
        <div className="project-brief-fallback" role="status">Showing the latest saved brief.</div>
      ) : null}
      {error || historyError ? <div className="project-brief-error" role="alert">{error || historyError}</div> : null}
      {brief ? (
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
