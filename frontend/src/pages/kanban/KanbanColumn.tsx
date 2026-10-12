import type { Project } from '../../shared/api/models/project';
import type { ReminderBoardCard, ReminderBoardColumn, ReminderBoardColumnKey } from '../../shared/api/models/reminder';
import { KanbanColumnInfinitePagination } from '../../shared/ui/kanban-column-infinite-pagination';
import { projectName } from '../../shared/utils/format';
import { KanbanCard } from './KanbanCard';
import type { kanbanBoardColumns } from './kanban-board.columns';

export interface KanbanColumnProps {
  column: typeof kanbanBoardColumns[number];
  data: ReminderBoardColumn;
  isFetching: boolean;
  draggedId: string;
  setDraggedId: (id: string) => void;
  statusMutationPending: boolean;
  handleDrop: (columnKey: ReminderBoardColumnKey) => void;
  handleColumnPageChange: (columnKey: ReminderBoardColumnKey, page: number) => void;
  openNote: (id: string) => void;
  projects: Project[];
}

export function KanbanColumn({
  column,
  data,
  isFetching,
  draggedId,
  setDraggedId,
  statusMutationPending,
  handleDrop,
  handleColumnPageChange,
  openNote,
  projects,
}: KanbanColumnProps) {
  return (
    <section
      aria-label={column.title}
      aria-disabled={!column.targetStatus}
      className={`kanban-column${column.targetStatus ? '' : ' kanban-column-blocked-drop'}`}
      key={column.key}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        handleDrop(column.key);
      }}
    >
      <header className="kanban-column-header">
        <h2>{column.title}</h2>
        <span>{data.total}</span>
      </header>
      <div className="kanban-column-list">
        {data.items.map((card: ReminderBoardCard) => (
          <KanbanCard
            card={card}
            disabled={statusMutationPending}
            isDragging={card.id === draggedId}
            key={card.id}
            onDragStart={setDraggedId}
            onDragEnd={() => setDraggedId('')}
            onOpen={openNote}
            projectLabel={projectName(projects, card.project)}
          />
        ))}
        {data.items.length === 0 ? <p className="kanban-empty">{column.empty}</p> : null}
        <KanbanColumnInfinitePagination
          columnKey={column.key}
          pagination={data}
          isLoading={isFetching}
          onPageChange={handleColumnPageChange}
        />
      </div>
    </section>
  );
}
