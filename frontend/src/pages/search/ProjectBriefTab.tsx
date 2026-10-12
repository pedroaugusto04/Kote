import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { SEARCH_MESSAGES } from './search.constants';
import {
  fetchLatestProjectBrief,
  fetchProjectBriefHistory,
  generateProjectBrief,
} from '../../shared/api/client';
import { getErrorMessage } from '../../shared/api/error-message';
import {
  ProjectBriefSavedSource,
  type ProjectBriefPanelResponse,
} from '../../shared/api/models/project-brief';
import { ProjectBriefPanel } from '../../widgets/projects/ProjectBriefPanel';
import { Panel } from '../../shared/ui/primitives';
import { notifyGeneralFormError } from '../../shared/forms/errors';
import { usePaginationState } from '../../shared/ui/use-pagination-state';
import { BriefHistoryInline } from './BriefHistoryInline';

export interface ProjectBriefTabProps {
  projectSlug: string;
  workspaceSlug: string;
  openNote: (noteId: string) => void;
}

export function ProjectBriefTab({
  projectSlug,
  workspaceSlug,
  openNote,
}: ProjectBriefTabProps) {
  const queryClient = useQueryClient();
  const [showBriefHistory, setShowBriefHistory] = useState(false);
  const [selectedBrief, setSelectedBrief] = useState<ProjectBriefPanelResponse | null>(null);

  const { page: briefHistoryPage, setPage: setBriefHistoryPage } = usePaginationState(`brief-history:${projectSlug}`);
  const briefProjectSlug = projectSlug || 'all';

  useEffect(() => {
    setSelectedBrief(null);
    setShowBriefHistory(false);
  }, [projectSlug]);

  const latestBriefQuery = useQuery({
    queryKey: ['latest-brief', briefProjectSlug, workspaceSlug],
    queryFn: () => fetchLatestProjectBrief(briefProjectSlug, workspaceSlug),
    staleTime: 60_000,
  });

  const briefHistoryQuery = useQuery({
    queryKey: ['brief-history', briefProjectSlug, workspaceSlug, briefHistoryPage],
    queryFn: () => fetchProjectBriefHistory(briefProjectSlug, { page: briefHistoryPage, pageSize: 5, workspaceSlug }),
    enabled: showBriefHistory,
    placeholderData: keepPreviousData,
  });

  const generateBriefMutation = useMutation({
    mutationFn: (slug: string) => generateProjectBrief(slug, workspaceSlug),
    onSuccess: (response) => {
      setSelectedBrief(response);
      void queryClient.invalidateQueries({ queryKey: ['brief-history'] });
      void queryClient.invalidateQueries({ queryKey: ['latest-brief'] });
    },
    onError: (error) => notifyGeneralFormError(error, SEARCH_MESSAGES.ERRORS.COULD_NOT_GENERATE_BRIEF),
  });

  const displayedBrief: ProjectBriefPanelResponse | undefined = selectedBrief
    || (latestBriefQuery.data?.brief ? latestBriefQuery.data : undefined)
    || undefined;

  return (
    <div className={`ask-ai-workspace ${showBriefHistory ? 'has-history' : ''}`}>
      <div className="ask-ai-main-pane">
        <Panel className="ask-ai-brief-panel">
          <ProjectBriefPanel
            response={displayedBrief}
            loading={(generateBriefMutation.isPending && generateBriefMutation.variables === briefProjectSlug) || (latestBriefQuery.isLoading && !selectedBrief)}
            error={generateBriefMutation.isError && generateBriefMutation.variables === briefProjectSlug
              ? getErrorMessage(generateBriefMutation.error, 'Could not generate the project brief.')
              : latestBriefQuery.isError && !selectedBrief
                ? getErrorMessage(latestBriefQuery.error, 'Could not load the project brief.')
              : ''}
            showHistory={showBriefHistory}
            onGenerate={() => {
              setSelectedBrief(null);
              generateBriefMutation.mutate(briefProjectSlug);
            }}
            onToggleHistory={() => setShowBriefHistory((current) => !current)}
            onOpenNote={openNote}
          />
        </Panel>
      </div>

      {showBriefHistory ? (
        <div className="ask-ai-history-pane">
          <BriefHistoryInline
            historyQuery={briefHistoryQuery}
            setPage={setBriefHistoryPage}
            onSelect={(item) => {
              setSelectedBrief({
                ok: true,
                source: ProjectBriefSavedSource.History,
                brief: item.brief,
              });
              setShowBriefHistory(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
