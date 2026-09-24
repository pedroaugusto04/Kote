import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '../../src/app/providers/theme';
import { AppTopbar } from '../../src/layouts/AppTopbar';

function renderTopbar(overrides: Partial<React.ComponentProps<typeof AppTopbar>> = {}) {
  const props: React.ComponentProps<typeof AppTopbar> = {
    isMobileNavOpen: false,
    onToggleMobileNav: vi.fn(),
    topbarTitle: 'Home',
    activeWorkspaceDisplayName: 'Default',
    searchValue: '',
    onSearchChange: vi.fn(),
    onSearchKeyDown: vi.fn(),
    isPopoverOpen: false,
    onFocusSearch: vi.fn(),
    isSearching: false,
    focusedIndex: -1,
    onSelectResult: vi.fn(),
    onAskAiShortcut: vi.fn(),
    commandBarRef: { current: null },
    profileMenuRef: { current: null },
    isProfileMenuOpen: true,
    onToggleProfileMenu: vi.fn(),
    currentUser: { displayName: 'User', email: 'user@example.com', avatarUrl: null },
    showQuotaWarningDot: false,
    quotaStatus: null,
    view: 'home',
    onSignOut: vi.fn(),
    onExportData: vi.fn(),
    isExportingData: false,
    ...overrides,
  };

  return render(
    <MemoryRouter>
      <ThemeProvider>
        <AppTopbar {...props} />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('AppTopbar global export action', () => {
  it('places Export data between Automations and Documentation and triggers the callback', () => {
    const onExportData = vi.fn();
    renderTopbar({ onExportData });

    const menuItems = screen.getAllByRole('menuitem');
    const labels = menuItems.map((item) => item.textContent?.trim());
    expect(labels.indexOf('Export data')).toBeGreaterThan(labels.indexOf('Automations'));
    expect(labels.indexOf('Export data')).toBeLessThan(labels.indexOf('Documentation'));

    fireEvent.click(screen.getByRole('menuitem', { name: 'Export data' }));
    expect(onExportData).toHaveBeenCalledTimes(1);
  });

  it('disables the action while the export is being generated', () => {
    renderTopbar({ isExportingData: true });
    expect(screen.getByRole('menuitem', { name: 'Exporting...' })).toBeDisabled();
  });
});
