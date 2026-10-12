import '@testing-library/jest-dom/vitest';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithAppProviders } from '../../../src/app/test-utils';
import { HelpPage } from '../../../src/pages/help/HelpPage';

describe('HelpPage', () => {
  it('renders documentation layout with default overview section and GitHub link', () => {
    renderWithAppProviders(<HelpPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'What is Kote?' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Help sections' })).toBeInTheDocument();

    const githubLink = screen.getByRole('link', { name: /view on github/i });
    expect(githubLink).toBeInTheDocument();
    expect(githubLink).toHaveAttribute('href', 'https://github.com/pedroaugusto04/Knowledge-Base');
  });

  it('navigates between sections when clicking navigation items or next/previous buttons', () => {
    renderWithAppProviders(<HelpPage />);

    // Click Next button
    const nextButton = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextButton);

    expect(screen.getByRole('heading', { level: 1, name: 'Projects & Notes' })).toBeInTheDocument();

    // Click Previous button
    const prevButton = screen.getByRole('button', { name: /previous/i });
    fireEvent.click(prevButton);

    expect(screen.getByRole('heading', { level: 1, name: 'What is Kote?' })).toBeInTheDocument();

    // Click specific section in navigation
    const aiChatNav = screen.getByRole('button', { name: /ask ai/i });
    fireEvent.click(aiChatNav);

    expect(screen.getByRole('heading', { level: 1, name: 'AI-Powered Chat' })).toBeInTheDocument();
  });
});
