import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { PageContext } from '../../app/page-context';
import { PageHead } from '../../shared/ui/primitives';
import { SEARCH_MESSAGES } from './search.constants';
import { AskAiTab } from './AskAiTab';
import { ProjectBriefTab } from './ProjectBriefTab';
import './SearchPage.css';

export function SearchPage({ dashboard, openNote, projectScope = '' }: PageContext) {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'ask' | 'brief'>(() => {
    const tabParam = searchParams.get('tab');
    return tabParam === 'brief' ? 'brief' : 'ask';
  });

  const activeWorkspace = dashboard?.workspaces[0] || null;
  const workspaceSlug = activeWorkspace?.workspaceSlug || '';

  return (
    <>
      <PageHead
        title={SEARCH_MESSAGES.PAGE_TITLE}
        subtitle={SEARCH_MESSAGES.PAGE_SUBTITLE}
      />

      <div className="segmented-control" style={{ maxWidth: '360px', marginBottom: '20px' }}>
        <button
          className={activeTab === 'ask' ? 'active' : ''}
          onClick={() => setActiveTab('ask')}
          type="button"
        >
          {SEARCH_MESSAGES.TABS.ASK_AI}
        </button>
        <button
          className={activeTab === 'brief' ? 'active' : ''}
          onClick={() => setActiveTab('brief')}
          type="button"
        >
          {SEARCH_MESSAGES.TABS.PROJECT_BRIEFS}
        </button>
      </div>

      {activeTab === 'ask' ? (
        <AskAiTab
          dashboard={dashboard}
          openNote={openNote}
          projectSlug={projectScope}
        />
      ) : (
        <ProjectBriefTab
          openNote={openNote}
          projectSlug={projectScope}
          workspaceSlug={workspaceSlug}
        />
      )}
    </>
  );
}
