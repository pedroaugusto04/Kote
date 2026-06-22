import '@testing-library/jest-dom/vitest';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithAppProviders } from '../../../src/app/test-utils';
import { FloatingNoteNavigation } from '../../../src/widgets/notes/FloatingNoteNavigation';

describe('FloatingNoteNavigation', () => {
  it('does not render when there are no notes', () => {
    renderWithAppProviders(
      <FloatingNoteNavigation
        previousNoteId={null}
        nextNoteId={null}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    );

    expect(screen.queryByTitle('Previous note')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Next note')).not.toBeInTheDocument();
  });

  it('does not render on mobile', () => {
    renderWithAppProviders(
      <FloatingNoteNavigation
        previousNoteId="note-1"
        nextNoteId="note-2"
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        isMobile={true}
      />,
    );

    expect(screen.queryByTitle('Previous note')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Next note')).not.toBeInTheDocument();
  });

  it('renders both buttons on desktop when both notes exist', () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();

    renderWithAppProviders(
      <FloatingNoteNavigation
        previousNoteId="note-1"
        nextNoteId="note-2"
        onPrevious={onPrevious}
        onNext={onNext}
        isMobile={false}
      />,
    );

    expect(screen.getByTitle('Previous note')).toBeInTheDocument();
    expect(screen.getByTitle('Next note')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Previous note'));
    expect(onPrevious).toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Next note'));
    expect(onNext).toHaveBeenCalled();
  });

  it('renders only previous button when next note does not exist', () => {
    const onPrevious = vi.fn();

    renderWithAppProviders(
      <FloatingNoteNavigation
        previousNoteId="note-1"
        nextNoteId={null}
        onPrevious={onPrevious}
        onNext={vi.fn()}
        isMobile={false}
      />,
    );

    expect(screen.getByTitle('Previous note')).toBeInTheDocument();
    expect(screen.queryByTitle('Next note')).not.toBeInTheDocument();
  });

  it('renders only next button when previous note does not exist', () => {
    const onNext = vi.fn();

    renderWithAppProviders(
      <FloatingNoteNavigation
        previousNoteId={null}
        nextNoteId="note-2"
        onPrevious={vi.fn()}
        onNext={onNext}
        isMobile={false}
      />,
    );

    expect(screen.queryByTitle('Previous note')).not.toBeInTheDocument();
    expect(screen.getByTitle('Next note')).toBeInTheDocument();
  });
});
