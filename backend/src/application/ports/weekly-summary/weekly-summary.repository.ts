export interface WeeklySummaryUserNoteCount {
  userId: string;
  noteCount: number;
}

export interface WeeklySummaryNoteRow {
  id: string;
  userId: string;
  title: string;
  summary: string | null;
  projectId: string | null;
  createdAt: Date | string;
  projectSlug: string | null;
}

export interface WeeklySummaryUser {
  id: string;
  email: string;
  displayName: string | null;
}

export abstract class WeeklySummaryRepository {
  abstract listUserNoteCountsForRange(
    startIso: string,
    endIso: string,
    limit: number,
    offset: number,
  ): Promise<WeeklySummaryUserNoteCount[]>;

  abstract listUsersByIds(userIds: string[]): Promise<WeeklySummaryUser[]>;

  abstract getDependencyCountsByProject(
    userId: string,
  ): Promise<Record<string, { critical: number; recommended: number; optional: number }>>;

  abstract listUserWorkspaceSlugs(userId: string): Promise<string[]>;

  abstract listNotesForUserRange(
    userId: string,
    startIso: string,
    endIso: string,
  ): Promise<WeeklySummaryNoteRow[]>;
}
