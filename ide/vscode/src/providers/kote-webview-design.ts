export const KOTE_WEBVIEW_FOUNDATION_STYLES = `
  :root {
    --bg: var(--vscode-editor-background);
    --fg: var(--vscode-foreground);
    --border: var(--vscode-widget-border, var(--vscode-panel-border, rgba(148, 163, 184, 0.14)));
    --card-bg: var(--vscode-editorWidget-background, rgba(15, 23, 29, 0.65));
    --card-hover: var(--vscode-list-hoverBackground, rgba(83, 199, 222, 0.08));
    --accent: #53c7de;
    --accent-soft: rgba(83, 199, 222, 0.12);
    --desc: var(--vscode-descriptionForeground, #8da0ae);
    --radius: 8px;
  }

  * { box-sizing: border-box; }

  body {
    font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--fg);
    background-color: var(--bg);
    padding: 20px;
    margin: 0;
    line-height: 1.6;
  }

  .header {
    margin-bottom: 16px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--border);
  }

  .title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .main-title {
    font-size: 1.25em;
    font-weight: 600;
    margin: 0;
    color: var(--fg);
  }

  .file-path,
  .generated-meta {
    color: var(--desc);
    font-size: 0.88em;
    margin-top: 4px;
  }

  .file-path {
    font-family: var(--vscode-editor-font-family, monospace);
  }

  .btn,
  .show-more-btn {
    background: var(--card-bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.85em;
    font-weight: 600;
    padding: 6px 10px;
  }

  .btn:hover,
  .show-more-btn:hover {
    background: var(--card-hover);
    border-color: var(--accent);
  }

  .tabs-header {
    display: flex;
    gap: 8px;
    border-bottom: 1px solid var(--border);
    margin: 20px 0 16px;
  }

  .tab-btn {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--desc);
    padding: 8px 16px;
    cursor: pointer;
    font-size: 0.9em;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s ease;
  }

  .tab-btn:hover {
    color: var(--fg);
    background: rgba(148, 163, 184, 0.05);
    border-radius: 4px 4px 0 0;
  }

  .tab-btn.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
    font-weight: 600;
  }

  .tab-count {
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 0.78em;
    padding: 2px 7px;
    border-radius: 10px;
    font-weight: 600;
  }

  .tab-content { display: none; }
  .tab-content.active { display: block; }

  .card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px 16px;
  }

  .card.clickable {
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .card.clickable:hover {
    background: var(--card-hover);
    border-color: var(--accent);
    transform: translateY(-1px);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.75em;
    padding: 2px 8px;
    border-radius: 12px;
    font-weight: 500;
    background: rgba(148, 163, 184, 0.1);
    color: var(--fg);
  }

  .badge-claude { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
  .badge-antigravity { background: rgba(83, 199, 222, 0.15); color: #53c7de; }
  .badge-codex { background: rgba(125, 211, 165, 0.15); color: #7dd3a5; }
  .badge-opencode { background: rgba(192, 132, 252, 0.15); color: #c084fc; }
  .badge-whatsapp { background: rgba(74, 222, 128, 0.15); color: #4ade80; }
  .badge-telegram { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }
  .badge-git { background: rgba(137, 87, 229, 0.15); color: #a78bfa; }
  .badge-note { background: rgba(148, 163, 184, 0.1); color: var(--fg); }

  .empty-state {
    background: var(--card-bg);
    border: 1px dashed var(--border);
    border-radius: var(--radius);
    padding: 24px;
    text-align: center;
    color: var(--desc);
  }
`;
