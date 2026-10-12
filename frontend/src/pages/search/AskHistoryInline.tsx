import type { UseQueryResult } from '@tanstack/react-query';

import type { PageContext } from '../../app/page-context';
import { SEARCH_MESSAGES } from './search.constants';
import { formatDateIso } from '../../shared/utils/format';
import type { AskConversationsResponse } from '../../shared/api/models/ask';
import { projectLabel } from '../../widgets/ask/AskAnswerCard';
import { EmptyState, InlineMessage, Panel } from '../../shared/ui/primitives';
import { Pagination } from '../../shared/ui/pagination';

export interface AskHistoryInlineProps {
  conversationsQuery: UseQueryResult<AskConversationsResponse>;
  projects: PageContext['dashboard']['projects'];
  setPage: (page: number) => void;
  onSelect: (conversationId: string) => void;
}

export function AskHistoryInline({
  conversationsQuery,
  projects,
  setPage,
  onSelect,
}: AskHistoryInlineProps) {
  const conversations = conversationsQuery.data?.conversations || [];

  return (
    <Panel className="ask-ai-history-panel">
      <h2>{SEARCH_MESSAGES.HISTORY.ASK_HISTORY_TITLE}</h2>

      {conversationsQuery.isLoading ? (
        <div className="inline-message">{SEARCH_MESSAGES.HISTORY.LOADING}</div>
      ) : conversationsQuery.isError ? (
        <InlineMessage tone="error">{SEARCH_MESSAGES.HISTORY.COULD_NOT_LOAD_ASK_HISTORY}</InlineMessage>
      ) : conversations.length === 0 ? (
        <EmptyState>{SEARCH_MESSAGES.HISTORY.NO_ASK_HISTORY}</EmptyState>
      ) : (
        <>
          <div className={`ask-history-list ${conversationsQuery.isPlaceholderData ? 'stale-data' : ''}`}>
            {conversations.map((item) => {
              const project = projects.find((p) => p.id === item.projectId);
              const projectSlug = project?.projectSlug || '';
              return (
                <button className="ask-history-item" key={item.conversationId} type="button" onClick={() => onSelect(item.conversationId)}>
                  <div className="ask-history-item-header">
                    <span className="ask-history-question">{item.title}</span>
                  </div>
                  <div className="ask-history-item-meta">
                    <span className="ask-history-project">{projectLabel(projectSlug, projects)}</span>
                    <span className="ask-history-date">{formatDateIso(item.createdAt)}</span>
                  </div>
                </button>
              );
            })}
          </div>
          {conversationsQuery.data?.pagination ? (
            <Pagination compact disableScrollToTop pagination={conversationsQuery.data.pagination} onPageChange={setPage} />
          ) : null}
        </>
      )}
    </Panel>
  );
}
