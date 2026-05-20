import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MarkdownView } from '../../../src/widgets/markdown/MarkdownView';

describe('MarkdownView', () => {
  it('renders bold inline markdown in list items', () => {
    render(<MarkdownView markdown="- **Performance for Large Datasets:** avoid full scans." />);

    const title = screen.getByText('Performance for Large Datasets:');
    expect(title.tagName).toBe('STRONG');
    expect(screen.getByText(/avoid full scans/i)).toBeInTheDocument();
  });

  it('renders review finding severities as colorable badges', () => {
    render(<MarkdownView markdown="- [LOW] Minor cleanup\n- [MEDIUM] Missing guard\n- [HIGH] Data leak risk\n- [CRITICAL] Broken auth" />);

    expect(screen.getByText('[LOW]')).toHaveClass('markdown-severity-low');
    expect(screen.getByText('[MEDIUM]')).toHaveClass('markdown-severity-medium');
    expect(screen.getByText('[HIGH]')).toHaveClass('markdown-severity-high');
    expect(screen.getByText('[CRITICAL]')).toHaveClass('markdown-severity-critical');
  });
});
