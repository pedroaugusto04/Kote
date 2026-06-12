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
          <ProjectBriefSection title="Summary" items={[brief.summary]} />
          <ProjectBriefSection title="Status" items={[brief.status]} />
          <ProjectBriefSection title="Recent changes" items={brief.recentChanges} />
          <ProjectBriefSection title="Decisions" items={brief.decisions} />
          <ProjectBriefSection title="Open items" items={brief.openItems} />
          <ProjectBriefSection title="Risks" items={brief.risks} />
          <ProjectBriefSection title="Next steps" items={brief.nextSteps} />
          <div className="project-brief-section">
            <strong>Sources</strong>
            {brief.sources.length > 0 ? (
              <ul>
                {brief.sources.map((source) => (
                  <li key={source.noteId}>
                    <button className="project-brief-source" type="button" onClick={() => onOpenNote(source.noteId)}>
                      {source.title || source.path || source.noteId}
                    </button>
                    <span className="meta">{source.date}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No sources.</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ProjectBriefSection({ title, items }: { title: string; items: string[] }) {
  const filtered = items.map((item) => item.trim()).filter(Boolean);
  return (
    <div className="project-brief-section">
      <strong>{title}</strong>
      {filtered.length > 0 ? (
        <ul>
          {filtered.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}
        </ul>
      ) : (
        <p>None.</p>
      )}
    </div>
  );
}
