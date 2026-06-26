<p align="center">
  <img src="frontend/public/Kote-Brand.png" alt="Kote" width="600">
</p>

<p align="center">
  https://knowledgebase.sbs/kote
</p>

**Kote** centralizes your team's operational knowledge and decisions in one place, preventing knowledge fragmentation and accelerating the integration of new team members into your workflow.

![Home Overview](docs/screenshots/home-overview.png)

---

## Why Kote?

* **Zero Context Loss:** Complete history of decisions, routines, and operational exceptions.
* **Faster Onboarding:** New team members find the entire project history in seconds.
* **Invisible Capture:** Knowledge is recorded where work already happens (WhatsApp, Telegram, GitHub).

---

## How it works

Kote captures knowledge automatically where your team already works:

1. **Push code to GitHub** → AI reviews changes with improvement suggestions and problem detection → Technical summaries saved to your Kote with WhatsApp/Email alerts for issues

2. **Use AI tools in VS Code** → Extension captures conversations automatically → AI sessions saved to your Kote

3. **Save code from VS Code** → Select code or files → One-click save with full context → Search and reuse code snippets anytime

4. **Send messages or attachments to WhatsApp** → AI structures notes with embedded audio/files → Use `/ask` to search knowledge and retrieve files instantly, or search directly in the app

5. **View Project Briefs** → AI generates summaries from latest project activity → Get up to speed on any project in seconds

6. **Explore Knowledge Map** → Visual graph reveals connections between notes, projects, and topics → Discover related insights you might have missed

7. **Sync from terminal** → Run `kote sync-ai` or `kote sync --dir` → Capture AI sessions and files dynamically without leaving your workflow

---

## Feature Deep Dives

### GitHub Push Integration

Automatically capture knowledge when you push to GitHub. AI analyzes commits and diffs, storing summaries in your Kote with WhatsApp alerts for relevant problems only.

### AI-Powered Conversations

<p align="center">
  <img src="docs/screenshots/ask-ai-overview.png" alt="Ask AI" width="100%" style="max-height: 600px;">
  <br><em>Chat interface to ask questions about your Kote with project-specific filters.</em>
</p>

Get instant answers from your team's collective knowledge without searching manually. The AI 
understands your context and provides relevant responses based on your actual data.

### Project Management & Notes

<p align="center">
  <img src="docs/screenshots/project-notes-overview.png" alt="Project Notes" width="100%" style="max-height: 600px;">
  <br><em>Organize notes within projects with clean, structured views.</em>
</p>

<p align="center">
  <img src="docs/screenshots/note-details-example.png" alt="Note Details" width="100%" style="max-height: 600px;">
  <br><em>Detailed note view with metadata, tags, and rich content.</em>
</p>

<p align="center">
  <img src="docs/screenshots/project-brief-overview.png" alt="Project Brief" width="100%" style="max-height: 600px;">
  <br><em>AI-generated summaries of project activity and key decisions.</em>
</p>

### Knowledge Map

<p align="center">
  <img src="docs/screenshots/map-overview.png" alt="Knowledge Map" width="100%" style="max-height: 600px;">
  <br><em>Visual graph showing connections between notes, projects, and topics.</em>
</p>

### Integrations

<p align="center">
  <img src="docs/screenshots/integrations-setup.png" alt="Integrations Setup" width="100%" style="max-height: 600px;">
  <br><em>Guided setup panel for connecting WhatsApp, Telegram, and GitHub.</em>
</p>

Connect your existing tools to capture knowledge where your team already works.

* **WhatsApp:** Send audio/text to generate AI notes, use `/ask` to search, receive reminders
* **Telegram:** Receive application notifications
* **GitHub Push:** Auto-capture commits with AI analysis, WhatsApp alerts

---

## Developer Tools

### CLI Tool (`kote`)

<p align="center">
  <img src="docs/screenshots/cli-commands.png" alt="CLI Commands" width="100%" style="max-height: 600px;">
  <br><em>Command-line interface for syncing files and interacting with Kote.</em>
</p>

Sync AI sessions (Claude Code, Codex, Antigravity, OpenCode) and files from your terminal.

<p align="center">
  <img src="docs/screenshots/cli-sync-ai-command.png" alt="CLI Sync AI" width="100%" style="max-height: 600px;">
  <br><em>Example of syncing AI session history to central vault.</em>
</p>

<p align="center">
  <img src="docs/screenshots/ai-conversation-example.png" alt="AI Conversation" width="100%" style="max-height: 600px;">
  <br><em>Example note created from syncing an AI session to your Kote.</em>
</p>

**Installation:**
```bash
npm install -g @pedroaugusto04/kote-cli
kote init
```

**Key Commands:**
```bash
kote sync-ai              # Sync AI sessions (primary)
kote sync --dir ./docs    # Sync directory
kote sync --file ./README.md  # Sync file
```

For complete CLI documentation, see [cli/README.md](cli/README.md).

### VS Code Extension

<p align="center">
  <img src="docs/screenshots/vscode-extension.png" alt="VS Code Extension" width="100%" style="max-height: 600px;">
  <br><em>Integrated sidebar with AI chat and quick-save commands for code selections.</em>
</p>

The extension automatically captures your AI conversations and saves them to your Kote. You can also save code snippets or entire files directly from your editor. Right-click selections to save, use keyboard shortcuts for quick AI questions, and view AI session history.

**Installation:** Search for "Kote" in the VS Code Extension Marketplace.

For complete extension documentation, see [ide/vscode/README.md](ide/vscode/README.md).

### Browser Extension

<p align="center">
  <img src="frontend/public/browser-extension-window.png" alt="Browser Extension" width="70%" style="max-height: 350px;">
  <br><em>Browser extension for quick web clipping and saving content to your Kote.</em>
</p>

The browser extension allows you to quickly save web pages, selections, or entire articles to your Kote with one click. It automatically converts HTML to Markdown, adds frontmatter metadata, and lets you choose the target project and tags. Perfect for capturing research, documentation, or inspiration from the web.

**Installation:**

- **Chrome Web Store:** Install directly from the [Chrome Web Store](https://chrome.google.com/webstore/detail/kote-clipper)

For complete extension documentation, see [ide/browser-extension/README.md](ide/browser-extension/README.md).

## License

See [LICENSE](LICENSE) for terms of use.
