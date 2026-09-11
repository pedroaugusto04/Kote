import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KnowledgeMapLoading } from '../../../src/features/projects/knowledge-map/KnowledgeMapLoading';

describe('KnowledgeMapLoading', () => {
  it('renders loading status, default label, and subtext with accessible role', () => {
    render(<KnowledgeMapLoading />);

    const loadingContainer = screen.getByRole('status', { name: 'Loading map...' });
    expect(loadingContainer).toBeInTheDocument();
    expect(screen.getByText('Loading map...')).toBeInTheDocument();
    expect(screen.getByText('Mapping project notes, tags, and relationships')).toBeInTheDocument();
  });

  it('renders custom label and subtext when provided', () => {
    render(
      <KnowledgeMapLoading
        label="Carregando mapa do projeto..."
        subtext="Sintetizando notas e conexões do grafo"
      />,
    );

    expect(screen.getByRole('status', { name: 'Carregando mapa do projeto...' })).toBeInTheDocument();
    expect(screen.getByText('Carregando mapa do projeto...')).toBeInTheDocument();
    expect(screen.getByText('Sintetizando notas e conexões do grafo')).toBeInTheDocument();
  });

  it('renders SVG graphic with nodes, links, and pulse rings', () => {
    const { container } = render(<KnowledgeMapLoading />);

    const svg = container.querySelector('svg.knowledge-map-loading-svg');
    expect(svg).toBeInTheDocument();

    const baseLinks = container.querySelectorAll('.km-loading-link-base');
    const activeLinks = container.querySelectorAll('.km-loading-link-active');
    expect(baseLinks).toHaveLength(8);
    expect(activeLinks).toHaveLength(8);

    const nodes = container.querySelectorAll('.km-loading-node');
    expect(nodes).toHaveLength(7);

    const projectNode = container.querySelector('.km-loading-node.project');
    expect(projectNode).toBeInTheDocument();

    const rings = container.querySelectorAll('.km-loading-ring');
    expect(rings).toHaveLength(2);
  });
});
