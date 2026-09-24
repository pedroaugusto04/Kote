import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

import { ProjectDecisionsPanel } from '../../../src/features/projects/ProjectDecisionsPanel';
import * as client from '../../../src/shared/api/client';

vi.mock('../../../src/shared/ui/notifications', () => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));

const mockDecisionsData = {
  items: [
    {
      id: 'note-1-1',
      noteId: 'note-1',
      noteTitle: 'Database Migration',
      notePath: 'notes/db.md',
      projectSlug: 'kote-app',
      sourceChannel: 'vscode',
      occurredAt: '2026-03-01T10:00:00.000Z',
      kind: 'decision',
      text: 'Adopt Postgres with Drizzle ORM for strong typing and pooling.',
      status: 'current',
      files: ['src/db.ts', 'src/schema.ts'],
      entities: ['Postgres', 'Drizzle'],
    },
    {
      id: 'note-2-1',
      noteId: 'note-2',
      noteTitle: 'In-Memory Cache Trial',
      notePath: 'notes/cache.md',
      projectSlug: 'kote-app',
      sourceChannel: 'cli',
      occurredAt: '2026-03-02T15:00:00.000Z',
      kind: 'failed_attempt',
      text: 'Tried Redis standalone instance; high network latency over WAN.',
      status: 'rejected',
      files: ['src/cache.ts'],
      entities: ['Redis'],
    },
  ],
  availableFiles: ['src/db.ts', 'src/schema.ts', 'src/cache.ts'],
  pagination: {
    page: 1,
    pageSize: 15,
    total: 2,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false,
  },
};

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('ProjectDecisionsPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(client, 'fetchProjectDecisions').mockResolvedValue(mockDecisionsData as any);
    vi.spyOn(client, 'exportProjectAdrsZip').mockResolvedValue({ filename: 'adrs.zip' } as any);
  });

  it('renders decisions toolbar, decision cards and affected files', async () => {
    renderWithClient(<ProjectDecisionsPanel projectSlug="kote-app" />);

    // Check toolbar and filters
    expect(screen.getByPlaceholderText(/Search decisions.../i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export ADRs/i })).toBeInTheDocument();

    // Check decision cards rendered
    expect(await screen.findByText('Adopt Postgres with Drizzle ORM for strong typing and pooling.')).toBeInTheDocument();
    expect(screen.getByText('Tried Redis standalone instance; high network latency over WAN.')).toBeInTheDocument();

    // Check kind tags
    expect(screen.getByText('Decision')).toBeInTheDocument();
    expect(screen.getByText('Failed Attempt')).toBeInTheDocument();

    // Check file chips (in file filter select and on card)
    expect(screen.getAllByText('db.ts')).toHaveLength(2);
    expect(screen.getAllByText('cache.ts')).toHaveLength(2);
  });

  it('triggers onOpenNote callback when note title button is clicked', async () => {
    const handleOpenNote = vi.fn();
    renderWithClient(<ProjectDecisionsPanel projectSlug="kote-app" onOpenNote={handleOpenNote} />);

    const noteButton = await screen.findByRole('button', { name: /Database Migration/i });
    fireEvent.click(noteButton);

    expect(handleOpenNote).toHaveBeenCalledWith('note-1');
  });

  it('triggers onOpenNote callback when clicking the decision card itself', async () => {
    const handleOpenNote = vi.fn();
    renderWithClient(<ProjectDecisionsPanel projectSlug="kote-app" onOpenNote={handleOpenNote} />);

    const cardText = await screen.findByText('Adopt Postgres with Drizzle ORM for strong typing and pooling.');
    fireEvent.click(cardText);

    expect(handleOpenNote).toHaveBeenCalledWith('note-1');
  });

  it('triggers exportProjectAdrsZip when clicking Export ADRs button', async () => {
    renderWithClient(<ProjectDecisionsPanel projectSlug="kote-app" />);

    const exportButton = screen.getByRole('button', { name: /Export ADRs/i });
    fireEvent.click(exportButton);

    await screen.findByRole('button', { name: /Export ADRs/i });
    expect(client.exportProjectAdrsZip).toHaveBeenCalledWith('kote-app', expect.objectContaining({
      kind: 'all',
    }));
  });

  it('debounces search input before triggering search request', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    renderWithClient(<ProjectDecisionsPanel projectSlug="kote-app" />);

    const searchInput = screen.getByPlaceholderText(/Search decisions.../i);
    fireEvent.change(searchInput, { target: { value: 'postgres' } });

    // Not yet called with search 'postgres'
    expect(client.fetchProjectDecisions).not.toHaveBeenCalledWith('kote-app', expect.objectContaining({
      search: 'postgres',
    }));

    // Advance debounce duration
    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(client.fetchProjectDecisions).toHaveBeenCalledWith('kote-app', expect.objectContaining({
      search: 'postgres',
    }));

    vi.useRealTimers();
  });

  it('does not render an UNKNOWN badge when item status is unknown', async () => {
    vi.spyOn(client, 'fetchProjectDecisions').mockResolvedValueOnce({
      ...mockDecisionsData,
      items: [
        {
          ...mockDecisionsData.items[0],
          id: 'note-3-1',
          status: 'unknown',
        },
      ],
    } as any);

    renderWithClient(<ProjectDecisionsPanel projectSlug="kote-app" />);

    expect(await screen.findByText('Adopt Postgres with Drizzle ORM for strong typing and pooling.')).toBeInTheDocument();
    expect(screen.queryByText(/UNKNOWN/i)).not.toBeInTheDocument();
  });
});
