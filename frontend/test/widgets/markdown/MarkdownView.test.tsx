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

  it('renders bold review finding headers with nested severities correctly', () => {
    const { container } = render(<MarkdownView markdown="- **[MEDIUM] The filtering logic is repeated**" />);

    const badge = container.querySelector('.markdown-severity-medium');
    expect(badge).toBeInTheDocument();
    expect(badge?.textContent).toBe('[MEDIUM]');
    expect(badge?.closest('strong')).toBeInTheDocument();
    expect(container.querySelector('strong')?.textContent).toContain('The filtering logic is repeated');
  });

  it('renders a code block with language using CodeBlockView', () => {
    const { container } = render(<MarkdownView markdown={"```typescript\nconst x = 1;\n```"} />);
    
    expect(container.querySelector('.markdown-code-block')).toBeInTheDocument();
    expect(screen.getByText('typescript')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
    expect(container.querySelector('code')?.textContent).toBe('const x = 1;');
  });

  it('renders a code block without language using CodeBlockView with fallback language', () => {
    const { container } = render(<MarkdownView markdown={"```\nconst x = 1;\n```"} />);
    
    expect(container.querySelector('.markdown-code-block')).toBeInTheDocument();
    expect(screen.getByText('code')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
    expect(container.querySelector('code')?.textContent).toBe('const x = 1;');
  });

  it('renders inline code as standard code tag', () => {
    const { container } = render(<MarkdownView markdown={"Use the `const x = 1` syntax."} />);
    
    expect(container.querySelector('.markdown-code-block')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy/i })).not.toBeInTheDocument();
    const codeTag = container.querySelector('code');
    expect(codeTag).toBeInTheDocument();
    expect(codeTag?.textContent).toBe('const x = 1');
  });

  it('does not render raw HTML from untrusted markdown', () => {
    const { container } = render(
      <MarkdownView markdown={'<img src=x onerror="alert(1)">\n\n<script>alert(1)</script>'} />,
    );

    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.querySelector('script')).not.toBeInTheDocument();
    expect(container).toHaveTextContent('<img src=x onerror="alert(1)">');
    expect(container).toHaveTextContent('<script>alert(1)</script>');
  });

  it('strips unsafe markdown link protocols', () => {
    const { container } = render(<MarkdownView markdown={'[Open me](javascript:alert(1))'} />);

    const link = container.querySelector('a');
    expect(link).toBeInTheDocument();
    expect(link?.textContent).toBe('Open me');
    expect(link).toHaveAttribute('href', '');
  });

  it('sanitizes syntax-highlighted code block HTML before injecting it', () => {
    const { container } = render(
      <MarkdownView markdown={'```html\n<img src=x onerror="alert(1)">\n```'} />,
    );

    expect(container.querySelector('.markdown-code-block')).toBeInTheDocument();
    expect(container.querySelector('.markdown-code-block img')).not.toBeInTheDocument();
    expect(container.querySelector('.markdown-code-block code')?.textContent).toBe('<img src=x onerror="alert(1)">');
  });
});
