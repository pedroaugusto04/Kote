import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import type { PageContext } from '../../app/page-context';
import { fetchReminderBoard, updateReminderStatus } from '../../shared/api/client';
import { invalidateNoteRelatedQueries } from '../../shared/api/note-query';
import { ReminderBoardColumnKey } from '../../shared/api/models/reminder';
import type { ReminderBoardColumn } from '../../shared/api/models/reminder';
import { notifyGeneralFormError } from '../../shared/forms/errors';
import { notifyWarning } from '../../shared/ui/notifications';
import { PageHead } from '../../shared/ui/primitives';
import { Select } from '../../shared/ui/select';
import { kanbanBoardColumns, type ReminderBoardTargetStatus } from './kanban-board.columns';
import { KanbanColumn } from './KanbanColumn';

const BOARD_LIMIT = 5;

const DEFAULT_COLUMN_DATA: ReminderBoardColumn = {
  items: [],
  total: 0,
  page: 1,
  pageSize: BOARD_LIMIT,
  totalPages: 1,
  hasNext: false,
  hasPrevious: false,
};

export interface KanbanPageProps extends PageContext {
  embedMode?: boolean;
  projectSlug?: string;
  onProjectChange?: (slug: string) => void;
}

export function KanbanPage({
  dashboard,
  openNote,
  embedMode = false,
  projectSlug: externalProjectSlug,
  onProjectChange: externalOnProjectChange,
}: KanbanPageProps) {
  const queryClient = useQueryClient();
  const workspaceSlug = dashboard.workspaces[0]?.workspaceSlug || '';
  const [internalProjectSlug, setInternalProjectSlug] = useState('');
  const [draggedId, setDraggedId] = useState('');
  const [columnPages, setColumnPages] = useState<Record<ReminderBoardColumnKey, number>>({
    [ReminderBoardColumnKey.Overdue]: 1,
    [ReminderBoardColumnKey.Upcoming]: 1,
    [ReminderBoardColumnKey.Resolved]: 1,
    [ReminderBoardColumnKey.Archived]: 1,
  });

  const projectSlug = externalProjectSlug !== undefined ? externalProjectSlug : internalProjectSlug;
  const setProjectSlug = externalOnProjectChange !== undefined ? externalOnProjectChange : setInternalProjectSlug;

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
      [ReminderBoardColumnKey.Overdue]: 1,
      [ReminderBoardColumnKey.Upcoming]: 1,
      [ReminderBoardColumnKey.Resolved]: 1,
      [ReminderBoardColumnKey.Archived]: 1,
    });
  }

  return (
    <>
      {!embedMode && (
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
      )}
      <div className="kanban-board" aria-busy={boardQuery.isFetching || statusMutation.isPending}>
        {kanbanBoardColumns.map((column) => {
          const data = board?.[column.key] || DEFAULT_COLUMN_DATA;
          return (
            <KanbanColumn
              column={column}
              data={data}
              draggedId={draggedId}
              isFetching={boardQuery.isFetching}
              key={column.key}
              projects={dashboard.projects}
              statusMutationPending={statusMutation.isPending}
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


