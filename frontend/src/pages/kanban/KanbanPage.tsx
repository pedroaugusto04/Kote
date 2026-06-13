import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import type { PageContext } from '../../app/page-context';
import { formatDisplayToken, projectName, reminderDisplayDateTime } from '../../shared/utils/format';
import { fetchReminderBoard, updateReminderStatus } from '../../shared/api/client';
import { invalidateNoteRelatedQueries } from '../../shared/api/note-query';
import type { ReminderBoardCard, ReminderBoardColumnKey } from '../../shared/api/models/reminder';
import { notifyGeneralFormError } from '../../shared/forms/errors';
import { notifyWarning } from '../../shared/ui/notifications';
import { Badge, PageHead } from '../../shared/ui/primitives';
import { Select } from '../../shared/ui/select';
import { KanbanColumnInfinitePagination, useKanbanColumnPaginatedItems } from '../../shared/ui/kanban-column-infinite-pagination';
import { kanbanBoardColumns, type ReminderBoardTargetStatus } from './kanban-board.columns';

const BOARD_LIMIT = 5;

const DEFAULT_COLUMN_DATA = {
  items: [] as any[],
  total: 0,
  page: 1,
  pageSize: BOARD_LIMIT,
  totalPages: 1,
  hasNext: false,
  hasPrevious: false,
};

export function KanbanPage({ dashboard, openNote }: PageContext) {
  const queryClient = useQueryClient();
  const workspaceSlug = dashboard.workspaces[0]?.workspaceSlug || '';
  const [projectSlug, setProjectSlug] = useState('');
  const [draggedId, setDraggedId] = useState('');
  const [columnPages, setColumnPages] = useState<Record<ReminderBoardColumnKey, number>>({
    overdue: 1,
    upcoming: 1,
    resolved: 1,
    archived: 1,
  });
  const projectOptions = useMemo(() => [
    { value: '', label: 'All projects' },
    ...dashboard.projects
      .filter((project) => !workspaceSlug || project.workspaceSlug === workspaceSlug)
      .map((project) => ({ value: project.projectSlug, label: project.displayName })),
  ], [dashboard.projects, workspaceSlug]);

  const boardQuery = useQuery({
    queryKey: ['reminder-board', workspaceSlug, projectSlug, columnPages],
    queryFn: () => fetchReminderBoard({ workspaceSlug, projectSlug, limitPerColumn: BOARD_LIMIT, columnPage: columnPages }),
    placeholderData: keepPreviousData,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReminderBoardTargetStatus }) => updateReminderStatus(id, status),
    onSuccess: async () => {
      await invalidateNoteRelatedQueries(queryClient);
    },
    onError: (error) => notifyGeneralFormError(error, 'Could not update the reminder status.'),
  });

  const board = boardQuery.data?.columns;

  function handleDrop(columnKey: ReminderBoardColumnKey) {
    if (!draggedId) return;
    const column = kanbanBoardColumns.find((item) => item.key === columnKey);
    setDraggedId('');
    if (!column) return;
    if (!column.targetStatus) {
      if (column.blockedDropMessage) notifyWarning(column.blockedDropMessage);
      return;
    }
    statusMutation.mutate({ id: draggedId, status: column.targetStatus });
  }

  function handleColumnPageChange(columnKey: ReminderBoardColumnKey, page: number) {
    setColumnPages((prev) => ({ ...prev, [columnKey]: page }));
  }

  function handleProjectChange(newProjectSlug: string) {
    setProjectSlug(newProjectSlug);
    setColumnPages({
      overdue: 1,
      upcoming: 1,
      resolved: 1,
      archived: 1,
    });
  }

  return (
    <>
      <PageHead
        title={(
          <div className="page-head-title-row">
            <h1>Kanban</h1>
            <label className="sr-only" htmlFor="kanban-project-select">Filter by project</label>
            <Select
              ariaLabel="Filter by project"
              className="page-head-select"
              id="kanban-project-select"
              options={projectOptions}
              value={projectSlug}
              onChange={handleProjectChange}
            />
          </div>
        )}
        subtitle=""
      />
      <div className="kanban-board" aria-busy={boardQuery.isFetching || statusMutation.isPending}>
        {kanbanBoardColumns.map((column) => {
          const data = board?.[column.key] || DEFAULT_COLUMN_DATA;
          return (
            <KanbanColumn
              column={column}
              data={data}
              draggedId={draggedId}
              isFetching={boardQuery.isFetching}
              isPlaceholderData={boardQuery.isPlaceholderData}
              key={column.key}
              projects={dashboard.projects}
              statusMutationPending={statusMutation.isPending}
              projectSlug={projectSlug}
              workspaceSlug={workspaceSlug}
              handleColumnPageChange={handleColumnPageChange}
              handleDrop={handleDrop}
              openNote={openNote}
              setDraggedId={setDraggedId}
            />
          );
        })}
      </div>
    </>
  );
}

interface KanbanColumnProps {
  column: typeof kanbanBoardColumns[number];
  data: typeof DEFAULT_COLUMN_DATA;
  workspaceSlug: string;
  projectSlug: string;
  isPlaceholderData: boolean;
  isFetching: boolean;
  draggedId: string;
  setDraggedId: (id: string) => void;
  statusMutationPending: boolean;
  handleDrop: (columnKey: ReminderBoardColumnKey) => void;
  handleColumnPageChange: (columnKey: ReminderBoardColumnKey, page: number) => void;
  openNote: (id: string) => void;
  projects: any[];
}

function KanbanColumn({
  column,
  data,
  workspaceSlug,
  projectSlug,
  isPlaceholderData,
  isFetching,
  draggedId,
  setDraggedId,
  statusMutationPending,
  handleDrop,
  handleColumnPageChange,
  openNote,
  projects,
}: KanbanColumnProps) {
  const {
    loadedPage,
    visibleItems,
  } = useKanbanColumnPaginatedItems({
    items: data.items,
    pagination: data,
    resetKey: `${workspaceSlug}:${projectSlug}:${column.key}`,
    isPlaceholderData,
  });

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
        {visibleItems.map((card: ReminderBoardCard) => (
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
        {visibleItems.length === 0 ? <p className="kanban-empty">{column.empty}</p> : null}
        <KanbanColumnInfinitePagination
          columnKey={column.key}
          pagination={data}
          isLoading={isFetching || data.page > loadedPage}
          onPageChange={handleColumnPageChange}
        />
      </div>
    </section>
  );
}

function KanbanCard({
  card,
  disabled,
  isDragging,
  onDragStart,
  onDragEnd,
  onOpen,
  projectLabel,
}: {
  card: ReminderBoardCard;
  disabled: boolean;
  isDragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onOpen: (id: string) => void;
  projectLabel: string;
}) {
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
        if (event.key === 'Enter' || event.key === ' ') {
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
