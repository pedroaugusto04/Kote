import { type RefObject, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { routes, type View } from '../app/routing/routes';
import { UserAvatar } from '../shared/ui/user-avatar';
import { ThemeToggle } from '../shared/ui/theme-toggle';
import { AskAiIcon } from '../widgets/ask/AskAiIcon';
import { QuotaUsageWidget } from '../features/quota/QuotaUsageWidget';
import { getCleanSummary } from '../shared/utils/format';
import { UI_MESSAGES } from '../shared/constants/ui.constants';
import type { QuotaAndBillingStatusDTO } from '../shared/api/billing';

interface SearchMatchItem {
  id: string;
  title: string;
  summary?: string | null;
  project: string;
}

interface AppTopbarProps {
  isMobileNavOpen: boolean;
  onToggleMobileNav: () => void;
  topbarTitle: string;
  activeWorkspaceDisplayName: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  isPopoverOpen: boolean;
  onFocusSearch: () => void;
  isSearching: boolean;
  searchResults?: SearchMatchItem[];
  focusedIndex: number;
  onSelectResult: (noteId: string) => void;
  onAskAiShortcut: () => void;
  commandBarRef: RefObject<HTMLDivElement | null>;
  profileMenuRef: RefObject<HTMLDivElement | null>;
  isProfileMenuOpen: boolean;
  onToggleProfileMenu: () => void;
  currentUser?: {
    displayName?: string;
    email?: string;
    avatarUrl?: string | null;
  } | null;
  showQuotaWarningDot: boolean;
  quotaStatus?: QuotaAndBillingStatusDTO | null;
  view: View;
  onSignOut: () => void;
}

export function AppTopbar({
  isMobileNavOpen,
  onToggleMobileNav,
  topbarTitle,
  activeWorkspaceDisplayName,
  searchValue,
  onSearchChange,
  onSearchKeyDown,
  isPopoverOpen,
  onFocusSearch,
  isSearching,
  searchResults,
  focusedIndex,
  onSelectResult,
  onAskAiShortcut,
  commandBarRef,
  profileMenuRef,
  isProfileMenuOpen,
  onToggleProfileMenu,
  currentUser,
  showQuotaWarningDot,
  quotaStatus,
  view,
  onSignOut,
}: AppTopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar-leading">
        <button
          aria-label={UI_MESSAGES.MENU}
          aria-controls="app-sidebar"
          aria-expanded={isMobileNavOpen}
          className="mobile-nav-toggle"
          onClick={onToggleMobileNav}
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          </svg>
        </button>
        <div className="topbar-context" aria-live="polite">
          <strong>{topbarTitle}</strong>
          <span>{activeWorkspaceDisplayName}</span>
        </div>
      </div>
      <div className="command-bar-container" ref={commandBarRef}>
        <label className="command-bar">
          <span>&gt;_</span>
          <input
            type="search"
            placeholder={UI_MESSAGES.SEARCH_NOTES_PATHS_OR_TAGS}
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            onFocus={onFocusSearch}
            onKeyDown={onSearchKeyDown}
          />
          <button
            aria-label={UI_MESSAGES.ASK_AI_SEMANTIC_SEARCH}
            className="ask-ai-shortcut-btn"
            onClick={onAskAiShortcut}
            title={UI_MESSAGES.ASK_AI_SEMANTIC_SEARCH}
            type="button"
          >
            <AskAiIcon className="ask-ai-shortcut-icon" />
          </button>
        </label>
        {isPopoverOpen && searchValue.trim() && (
          <div className="command-bar-popover" role="listbox">
            {isSearching ? (
              <div className="command-bar-popover-status">{UI_MESSAGES.SEARCHING}</div>
            ) : searchResults?.length ? (
              searchResults.map((match, index) => (
                <button
                  key={match.id}
                  className={`command-bar-result-item ${index === focusedIndex ? 'focused' : ''}`}
                  onClick={() => onSelectResult(match.id)}
                  type="button"
                  role="option"
                  aria-selected={index === focusedIndex}
                >
                  <div className="result-main">
                    <span className="result-title">{match.title}</span>
                    {match.summary ? <span className="result-path">{getCleanSummary(match.summary)}</span> : null}
                  </div>
                  <div className="result-meta">
                    <span className="result-project-badge">{match.project}</span>
                  </div>
                </button>
              ))
            ) : (
              <div className="command-bar-popover-status">{UI_MESSAGES.NO_NOTES_FOUND}</div>
            )}
          </div>
        )}
      </div>
      <div className="topbar-meta">
        <div className="profile-menu" ref={profileMenuRef}>
          <button
            aria-expanded={isProfileMenuOpen}
            aria-haspopup="menu"
            aria-label={UI_MESSAGES.USER_MENU}
            className={`topbar-link topbar-icon ${view === 'profile' || view === 'integrations' || view === 'subscription' ? 'active' : ''}`}
            onClick={onToggleProfileMenu}
            title={UI_MESSAGES.USER_MENU}
            type="button"
            style={{ position: 'relative' }}
          >
            <UserAvatar
              avatarUrl={currentUser?.avatarUrl}
              className="topbar-avatar"
              displayName={currentUser?.displayName}
              email={currentUser?.email}
            />
            {showQuotaWarningDot && (
              <span
                title="AI credit quota is running low"
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'hsl(38, 90%, 52%)',
                  border: '2px solid var(--surface-1)',
                }}
              />
            )}
          </button>
          {isProfileMenuOpen ? (
            <div className="profile-menu-popover" role="menu">
              <div className="profile-menu-user">
                <UserAvatar
                  avatarUrl={currentUser?.avatarUrl}
                  className="profile-menu-avatar"
                  displayName={currentUser?.displayName}
                  email={currentUser?.email}
                />
                <div className="profile-menu-copy">
                  <strong>{currentUser?.displayName || UI_MESSAGES.LOADING_USER}</strong>
                  <span>{currentUser?.email || UI_MESSAGES.LOADING_EMAIL}</span>
                </div>
              </div>
              <Link className="profile-menu-link" role="menuitem" to={routes.profile}>
                {UI_MESSAGES.MY_PROFILE}
              </Link>
              <Link className="profile-menu-link" role="menuitem" to={routes.integrations}>
                {UI_MESSAGES.INTEGRATIONS}
              </Link>
              <Link className="profile-menu-link" role="menuitem" to={routes.subscription}>
                Subscription
              </Link>
              {quotaStatus && (
                <div style={{ padding: '12px 12px 4px', borderTop: '1px solid var(--border-subtle)', marginTop: 4 }}>
                  <QuotaUsageWidget status={quotaStatus} compact aiOnly hideTitle={false} />
                </div>
              )}
              <Link className="profile-menu-link" role="menuitem" to={routes.automations}>
                Automations
              </Link>
              <Link className="profile-menu-link" role="menuitem" to={routes.help}>
                {UI_MESSAGES.DOCUMENTATION}
              </Link>
            </div>
          ) : null}
        </div>
        <ThemeToggle className="topbar-link theme-toggle" />
        <button
          className="topbar-link"
          type="button"
          onClick={onSignOut}
        >
          {UI_MESSAGES.SIGN_OUT}
        </button>
      </div>
    </header>
  );
}
