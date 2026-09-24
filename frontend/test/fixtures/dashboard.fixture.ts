import type { Dashboard } from '../../src/shared/api/models/dashboard';
import type { NoteSummary } from '../../src/shared/api/models/note';
import type { Project } from '../../src/shared/api/models/project';
import type { Workspace } from '../../src/shared/api/models/workspace';
import { NoteStatus } from '../../src/shared/api/models/note-status';

export function createMockWorkspace(overrides?: Partial<Workspace>): Workspace {
  return {
    workspaceSlug: 'default',
    displayName: 'Default',
    ...overrides,
  };
}

export function createMockProject(overrides?: Partial<Project>): Project {
  return {
    projectSlug: 'platform',
    displayName: 'Platform',
    repositories: [],
    workspaceSlug: 'default',
    defaultTags: [],
    enabled: true,
    favorite: false,
    ...overrides,
  };
}

export function createMockNote(overrides?: Partial<NoteSummary>): NoteSummary {
  return {
    id: 'note-1',
    path: '20 Inbox/platform/note-1.md',
    type: 'event',
    title: 'Note 1',
    project: 'platform',
    workspace: 'default',
    folderId: null,
    categories: [],
    tags: ['test'],
    date: '2026-04-27',
    status: NoteStatus.Active,
    summary: 'Resumo da nota',
    source: 'manual-api',
    sourceChannel: 'manual',
    attachmentCount: 0,
    ...overrides,
  };
}

export function createMockDashboard(overrides?: Partial<Dashboard>): Dashboard {
  return {
    workspaces: [createMockWorkspace()],
    projects: [createMockProject()],
    notes: [],
    reminders: [],
    home: {
      windowDays: 7,
      metrics: [],
      activityByDay: [],
      activityByProject: [],
      priorities: [],
      recentInterestingEvents: [],
    },
    ...overrides,
  };
}
