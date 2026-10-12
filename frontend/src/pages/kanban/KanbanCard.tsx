import { KEYBOARD_KEYS } from '../../shared/constants/keyboard.constants';
import { formatDisplayToken, reminderDisplayDateTime } from '../../shared/utils/format';
import type { ReminderBoardCard } from '../../shared/api/models/reminder';
import { Badge } from '../../shared/ui/primitives';

export interface KanbanCardProps {
  card: ReminderBoardCard;
  disabled: boolean;
  isDragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onOpen: (id: string) => void;
  projectLabel: string;
}

export function KanbanCard({
  card,
  disabled,
  isDragging,
  onDragStart,
  onDragEnd,
  onOpen,
  projectLabel,
}: KanbanCardProps) {
  const schedule = reminderDisplayDateTime(card);
  return (
    <article
      className={`kanban-card${isDragging ? ' dragging' : ''}`}
      draggable={!disabled}
      onClick={() => onOpen(card.id)}
      onDragEnd={onDragEnd}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', card.id);
        onDragStart(card.id);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === KEYBOARD_KEYS.ENTER || event.key === KEYBOARD_KEYS.SPACE) {
          event.preventDefault();
          onOpen(card.id);
        }
      }}
    >
      <div className="meta-row">
        <Badge value={formatDisplayToken(card.status)} tone={card.isOverdue ? 'high' : card.status} />
        <span className="meta">{projectLabel}</span>
      </div>
      <h3>{card.title}</h3>
      {card.noteText ? <p>{card.noteText}</p> : null}
      <span className="kanban-card-date">{schedule}</span>
    </article>
  );
}
