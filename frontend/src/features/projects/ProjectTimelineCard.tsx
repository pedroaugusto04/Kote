import type { Dashboard } from '../../shared/api/models/dashboard';
import type { NoteSummary } from '../../shared/api/models/note';
import type { ProjectTimelineItem } from '../../shared/api/models/project-timeline';
import { formatDisplayToken, formatUsDate, formatUsDateTime, getCleanSummary, getTimelineNodeColor, projectName } from '../../shared/utils/format';
import { buildNoteDisplayTags } from '../../shared/utils/note-tags';
import { Badge, Tags } from '../../shared/ui/primitives';
import { PencilIcon, TrashIcon } from '../../shared/ui/icons';
import { AttachmentIndicator } from '../../widgets/notes/AttachmentIndicator';
import { QuickNoteStatusActions } from '../../widgets/notes/QuickNoteStatusActions';
import { SourceBadge } from '../../widgets/notes/SourceBadge';

function PinIcon({ active }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1em', height: '1em' }}>
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-.44-1.24l-2.33-2.91a2 2 0 0 1-.43-1.24V5a2 2 0 0 0-2-2h-3.6a2 2 0 0 0-2 2v4.85a2 2 0 0 1-.43 1.24l-2.33 2.91a2 2 0 0 0-.44 1.24z" />
    </svg>
  );
}

export function ProjectTimelineCard({
  item,
  dashboard,
  isPinPending,
  onOpen,
  onOpenFullPage,
  onEdit,
  onDelete,
  onPin,
}: {
  item: ProjectTimelineItem;
  dashboard: Dashboard;
  isPinPending?: boolean;
  onOpen: (noteId: string) => void;
  onOpenFullPage?: (noteId: string) => void;
  onEdit?: (note: NoteSummary) => void;
  onDelete?: (note: NoteSummary) => void;
  onPin?: (noteId: string, pinned: boolean) => void;
}) {
  const activeSource = item.source || item.sourceChannel;
  const displayTags = buildNoteDisplayTags({ tags: item.tags, categories: item.categories });

  return (
    <article
      className="project-timeline-item clickable"
      key={item.id}
      onClick={() => onOpen(item.noteId)}
      onDoubleClick={() => onOpenFullPage?.(item.noteId)}
    >
      <div
        className="project-timeline-marker"
        aria-hidden="true"
        style={{
          backgroundColor: getTimelineNodeColor(item.category, item.type),
          boxShadow: `0 0 6px ${getTimelineNodeColor(item.category, item.type)}`,
        }}
      />
      <div className="project-timeline-card">
        <div className="project-timeline-meta">
          {item.isPinned && (
            <span className="pinned-badge" title="Pinned Note" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--amber)', fontSize: '11px', fontWeight: 'bold' }}>
              <PinIcon active /> Pinned
            </span>
          )}
          {displayTags.length ? <Tags items={displayTags} /> : null}
          <span className="meta meta-date">{formatUsDate(item.date)}</span>
          <span className="meta meta-time"> {formatUsDateTime(item.date).split(' ')[1]}</span>
          <span className="meta meta-project">{projectName(dashboard.projects, item.project)}</span>
          <AttachmentIndicator count={item.attachmentCount || 0} />
          <Badge value={formatDisplayToken(item.status)} tone={item.status} />
        </div>
        {onPin && (
          <button
            aria-label={item.isPinned ? `Unpin note ${item.title}` : `Pin note ${item.title}`}
            className={`row-action-button pin ${item.isPinned ? 'active' : ''}`}
            title={item.isPinned ? 'Unpin' : 'Pin'}
            type="button"
            disabled={isPinPending}
            onClick={(event) => {
              event.stopPropagation();
              onPin(item.noteId, !item.isPinned);
            }}
            style={{
              position: 'absolute',
              top: '14px',
              right: '14px',
              zIndex: 2,
            }}
          >
            <PinIcon active={item.isPinned} />
          </button>
        )}
        <div className="project-timeline-body">
          <div>
            <h3>{item.title}</h3>
            <SourceBadge source={activeSource} iconSize={16} />
            <p>{getCleanSummary(item.summary)}</p>
          </div>
          <div className="row-actions" style={{ display: 'flex', alignItems: 'center', gap: '6px', alignSelf: 'flex-end', marginTop: 'auto' }}>
            <QuickNoteStatusActions
              note={{
                id: item.noteId,
                title: item.title,
                status: item.status,
                project: item.project,
                tags: item.tags,
              }}
              compact
            />
            {onEdit ? (
              <button
                aria-label={`Edit note ${item.title}`}
                className="row-action-button edit"
                title="Edit"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit(item);
                }}
              >
                <PencilIcon />
              </button>
            ) : null}
            {onDelete ? (
              <button
                aria-label={`Delete note ${item.title}`}
                className="row-action-button danger"
                title="Delete"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(item);
                }}
              >
                <TrashIcon />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
