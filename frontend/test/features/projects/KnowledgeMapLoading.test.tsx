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

  it('renders visual loading graphic with nodes and links marked aria-hidden', () => {
    const { container } = render(<KnowledgeMapLoading />);

    const graphic = container.querySelector('.knowledge-map-loading-graphic');
    expect(graphic).toBeInTheDocument();
    expect(graphic).toHaveAttribute('aria-hidden', 'true');

    const svg = container.querySelector('svg.knowledge-map-loading-svg');
    expect(svg).toBeInTheDocument();

    const baseLinks = container.querySelectorAll('.km-loading-link-base');
    expect(baseLinks.length).toBeGreaterThan(0);

    const nodes = container.querySelectorAll('.km-loading-node');
    expect(nodes.length).toBeGreaterThan(0);

    const projectNode = container.querySelector('.km-loading-node.project');
    expect(projectNode).toBeInTheDocument();
  });
});
