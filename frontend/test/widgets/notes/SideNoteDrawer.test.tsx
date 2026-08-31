import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithAppProviders } from '../../../src/app/test-utils';
import { SideNoteDrawer } from '../../../src/widgets/notes/SideNoteDrawer';
import { UI_MESSAGES } from '../../../src/shared/constants/ui.constants';
import type { NoteDetail } from '../../../src/shared/api/models/note';
import { NoteStatus } from '../../../src/shared/api/models/note-status';

const apiSpies = vi.hoisted(() => ({
  fetchNote: vi.fn(),
}));

vi.mock('../../../src/shared/api/client', () => ({
  fetchNote: apiSpies.fetchNote,
}));

const mockNote: NoteDetail = {
  id: 'note-drawer-1',
  path: '20 Inbox/platform/drawer-note.md',
  type: 'event',
  title: 'Drawer Note Title',
  project: 'platform',
  workspace: 'default',
  folderId: null,
  categories: [],
  tags: ['testing'],
  date: '2026-05-01',
  status: NoteStatus.Active,
  summary: 'Drawer note summary content',
  markdown: '# Drawer Note Title\n\nFull note body in drawer.',
  frontmatter: {},
  links: [],
  origin: 'manual-api',
  attachments: [],
  source: 'manual-api',
  sourceChannel: 'manual',
  attachmentCount: 0,
  editor: null,
  navigation: { previous: null, next: null },
};

describe('SideNoteDrawer', () => {
  beforeEach(() => {
    apiSpies.fetchNote.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders note details and triggers download when clicking Download .md button', async () => {
    apiSpies.fetchNote.mockResolvedValue(mockNote);
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/drawer-blob');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderWithAppProviders(
      <SideNoteDrawer
        noteId="note-drawer-1"
        onClose={vi.fn()}
        onOpenFullPage={vi.fn()}
        dashboardProjects={[]}
      />,
    );

    expect(await screen.findByRole('heading', { name: mockNote.title })).toBeInTheDocument();

    const downloadBtn = screen.getByRole('button', { name: `${UI_MESSAGES.DOWNLOAD_NOTE} ${mockNote.title}` });
    expect(downloadBtn).toBeInTheDocument();
    expect(downloadBtn).toHaveTextContent(UI_MESSAGES.DOWNLOAD_MD_BUTTON);
    expect(downloadBtn).toHaveAttribute('title', UI_MESSAGES.DOWNLOAD_NOTE_MD);

    fireEvent.click(downloadBtn);

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/drawer-blob');

    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
    clickSpy.mockRestore();
  });
});
