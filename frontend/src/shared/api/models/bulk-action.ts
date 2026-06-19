export const bulkActionTypeValues = ['resolve', 'archive'] as const;

export type BulkActionType = (typeof bulkActionTypeValues)[number];

export const BulkActionType = {
  Resolve: 'resolve' as const,
  Archive: 'archive' as const,
} as const;

export const bulkStatusUpdateValues = ['resolved', 'archived'] as const;

export type BulkStatusUpdate = (typeof bulkStatusUpdateValues)[number];

export const BulkStatusUpdate = {
  Resolved: 'resolved' as const,
  Archived: 'archived' as const,
} as const;
