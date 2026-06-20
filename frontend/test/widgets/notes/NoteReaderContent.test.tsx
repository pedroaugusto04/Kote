import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetRequestStateForTests } from '../../../src/shared/api/request';
import { NoteAttachments } from '../../../src/widgets/notes/NoteReaderContent';

afterEach(() => {
  cleanup();
  resetRequestStateForTests();
  vi.restoreAllMocks();
});

describe('NoteAttachments', () => {
  it('previews markdown attachments inside the app', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('# Runbook\n\n- **Deploy** safely.', { status: 200 }));

    render(
      <NoteAttachments
        attachments={[
          {
            id: 'attachment-md',
            fileName: 'runbook.md',
            mimeType: 'text/markdown',
            sizeBytes: 128,
            url: '/api/notes/note-1/attachments/attachment-md/content',
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('link', { name: /runbook.md/i }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Runbook' })).toBeInTheDocument();
    expect(screen.getByText('Deploy')).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/notes/note-1/attachments/attachment-md/content',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('previews structured text attachments by extension when the mime type is generic', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    render(
      <NoteAttachments
        attachments={[
          {
            id: 'attachment-json',
            fileName: 'payload.json',
            mimeType: 'application/octet-stream',
            sizeBytes: 11,
            url: '/api/notes/note-1/attachments/attachment-json/content',
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('link', { name: /payload.json/i }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('Preview of payload.json')).toHaveTextContent('{"ok":true}');
    });
  });
});
