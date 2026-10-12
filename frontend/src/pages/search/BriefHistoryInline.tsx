import type { UseQueryResult } from '@tanstack/react-query';

import { SEARCH_MESSAGES } from './search.constants';
import { formatDateIso } from '../../shared/utils/format';
import type {
  ProjectBriefHistoryResponse,
  ProjectBriefHistoryRecord,
} from '../../shared/api/models/project-brief';
import { EmptyState, InlineMessage, Panel } from '../../shared/ui/primitives';
import { Pagination } from '../../shared/ui/pagination';

export interface BriefHistoryInlineProps {
  historyQuery: UseQueryResult<ProjectBriefHistoryResponse>;
  setPage: (page: number) => void;
  onSelect: (item: ProjectBriefHistoryRecord) => void;
}

export function BriefHistoryInline({
  historyQuery,
  setPage,
  onSelect,
}: BriefHistoryInlineProps) {
  const history = historyQuery.data?.items || [];

  return (
    <Panel className="ask-ai-history-panel">
      <h2>{SEARCH_MESSAGES.HISTORY.BRIEF_HISTORY_TITLE}</h2>

      {historyQuery.isLoading ? (
        <div className="inline-message">{SEARCH_MESSAGES.HISTORY.LOADING}</div>
      ) : historyQuery.isError ? (
        <InlineMessage tone="error">{SEARCH_MESSAGES.HISTORY.COULD_NOT_LOAD_BRIEF_HISTORY}</InlineMessage>
      ) : history.length === 0 ? (
        <EmptyState>{SEARCH_MESSAGES.HISTORY.NO_BRIEF_HISTORY}</EmptyState>
      ) : (
        <>
          <div className={`ask-history-list ${historyQuery.isPlaceholderData ? 'stale-data' : ''}`}>
            {history.map((item) => (
              <button className="ask-history-item" key={item.id} type="button" onClick={() => onSelect(item)}>
                <div className="ask-history-item-header">
                  <span className="ask-history-question">
                    {item.brief.summary.length > 50
                      ? `${item.brief.summary.slice(0, 50)}...`
                      : item.brief.summary}
                  </span>
                </div>
                <div className="ask-history-item-meta">
                  <span className="ask-history-project">{item.model}</span>
                  <span className="ask-history-date">{formatDateIso(item.generatedAt)}</span>
                </div>
                <span className="ask-history-answer">{item.brief.status}</span>
              </button>
            ))}
          </div>
          {historyQuery.data?.pagination ? (
            <Pagination compact disableScrollToTop pagination={historyQuery.data.pagination} onPageChange={setPage} />
          ) : null}
        </>
      )}
    </Panel>
  );
}
