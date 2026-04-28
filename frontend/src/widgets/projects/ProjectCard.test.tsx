import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProjectCard } from './ProjectCard';

describe('ProjectCard', () => {
  it('renders project metadata and emits the selected slug', () => {
    const onOpen = vi.fn();

    render(
      <ProjectCard
        onOpen={onOpen}
        project={{
          projectSlug: 'n8n-automations',
          displayName: 'N8N Automations',
          repoFullName: 'acme/repo',
          workspaceSlug: 'default',
          aliases: ['n8n'],
          defaultTags: ['backend', 'automation'],
          enabled: true,
        }}
      />,
    );

    fireEvent.click(screen.getByText('N8N Automations'));

    expect(screen.getByText('acme/repo')).toBeInTheDocument();
    expect(onOpen).toHaveBeenCalledWith('n8n-automations');
  });
});
