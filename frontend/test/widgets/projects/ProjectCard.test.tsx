import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProjectCard } from '../../../src/widgets/projects/ProjectCard';

describe('ProjectCard', () => {
  it('renders project metadata and emits the selected slug', () => {
    const onOpen = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(
      <ProjectCard
        deleteDisabled={false}
        onDelete={onDelete}
        onEdit={onEdit}
        onOpen={onOpen}
        project={{
          projectSlug: 'n8n-automations',
          displayName: 'N8N Automations',
          repositories: [{ id: '1', workspaceSlug: 'default', externalId: '0', fullName: 'acme/repo', htmlUrl: null, description: null, defaultBranch: null, createdAt: '', updatedAt: '' }],
          workspaceSlug: 'default',
          defaultTags: ['backend', 'automation'],
          enabled: true,
      favorite: false,
        }}
      />,
    );

    fireEvent.click(screen.getByText('N8N Automations'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit project N8N Automations' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete project N8N Automations' }));

    expect(screen.getByText('acme/repo')).toBeInTheDocument();
    expect(onOpen).toHaveBeenCalledWith('n8n-automations');
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
