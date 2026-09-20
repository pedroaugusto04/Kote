import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiConversationView } from '../../../src/widgets/notes/AiConversationView';
import type { AiConversationTurn } from '../../../src/widgets/notes/ai-conversation';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AiConversationView', () => {
  const turns: AiConversationTurn[] = [
    { role: 'user', content: 'Como posso refatorar esta funcao?' },
    { role: 'assistant', content: 'Voce pode extrair a logica para uma funcao pura:\n```ts\nconst x = 1;\n```' },
  ];

  it('renders all conversation turns with roles and indices', () => {
    render(<AiConversationView turns={turns} />);

    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('Assistant')).toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('Como posso refatorar esta funcao?')).toBeInTheDocument();
  });

  it('allows copying the turn content to clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<AiConversationView turns={turns} />);

    const copyButtons = screen.getAllByRole('button', { name: /copy/i });
    expect(copyButtons.length).toBeGreaterThanOrEqual(2);

    fireEvent.click(copyButtons[1]);

    expect(writeTextMock).toHaveBeenCalledWith(turns[1].content);
    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });
  });
});
