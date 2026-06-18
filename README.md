# Knowledge Vault

**Knowledge Vault** centralizes your team's operational knowledge and decisions in one place, preventing knowledge fragmentation and accelerating the integration of new team members into your workflow.

![Home Overview](docs/screenshots/home-overview.png)

---

## Why Knowledge Vault?

* **Zero Context Loss:** Complete history of decisions, routines, and operational exceptions.
* **Faster Onboarding:** New team members find the entire project history in seconds.
* **Invisible Capture:** Knowledge is recorded where work already happens (WhatsApp, Telegram, GitHub).

---

## Core Features

* **GitHub Push Integration:** Capture `git push` events, analyze commits/diffs with AI, and automatically send technical summaries to your knowledge base and team channels.
  
* **WhatsApp Integration:** Send audio or text messages to generate AI-structured notes, use `/ask` to search for information and inserted files, and receive automatic reminders directly in WhatsApp.
  
* **Telegram Integration:** Get pipeline failure alerts, review summaries, and interact directly with the bot for quick knowledge capture.
  
* **AI-Powered Conversations:** Integrated chat interface to ask questions about your knowledge base with project filters and conversation history.
  
* **CLI Tool:** Command-line interface for syncing local files and AI session histories directly from your terminal.
  
* **VS Code Extension:** Complete Knowledge Vault integration with sidebar chat, quick shortcuts, and direct code/file saving from your editor.
  
* **Contextual Search:** Find answers instantly across your entire organizational history.
  
* **Project Briefs:** AI-generated operational technical summaries from the latest project items.

---

## Feature Deep Dives

### GitHub Push Integration

Automatically capture knowledge when you push to GitHub. AI analyzes commits and diffs, storing summaries in your knowledge base with WhatsApp alerts for relevant problems only.

### AI-Powered Conversations

<p align="center">
  <img src="docs/screenshots/ask-ai-overview.png" alt="Ask AI" width="80%">
  <br><em>Chat interface to ask questions about your knowledge base with project-specific filters.</em>
</p>

Get instant answers from your team's collective knowledge without searching manually. The AI 
understands your context and provides relevant responses based on your actual data.

### Project Management & Notes

<p align="center">
  <img src="docs/screenshots/project-notes-overview.png" alt="Project Notes" width="80%">
  <br><em>Organize notes within projects with clean, structured views.</em>
</p>

Organize related knowledge in projects. Each project becomes a living documentation hub.

<p align="center">
  <img src="docs/screenshots/note-details-example.png" alt="Note Details" width="80%">
  <br><em>Detailed note view with metadata, tags, and rich content.</em>
</p>

<p align="center">
  <img src="docs/screenshots/project-brief-overview.png" alt="Project Brief" width="80%">
  <br><em>AI-generated summaries of project activity and key decisions.</em>
</p>

Quickly catch up on project status with AI-generated briefs.

### Knowledge Map

<p align="center">
  <img src="docs/screenshots/map-overview.png" alt="Knowledge Map" width="80%">
  <br><em>Visual graph showing connections between notes, projects, and topics.</em>
</p>

Discover relationships and patterns in your knowledge through visual connections.

### Integrations

<p align="center">
  <img src="docs/screenshots/integrations-setup.png" alt="Integrations Setup" width="80%">
  <br><em>Guided setup panel for connecting WhatsApp, Telegram, and GitHub.</em>
</p>

Connect your existing tools to capture knowledge where your team already works.

* **WhatsApp:** Send audio/text to generate AI notes, use `/ask` to search, receive reminders
* **Telegram:** Receive application notifications
* **GitHub Push:** Auto-capture commits with AI analysis, WhatsApp alerts

---

## Developer Tools

### CLI Tool (`kb`)

<p align="center">
  <img src="docs/screenshots/cli-commands.png" alt="CLI Commands" width="80%">
  <br><em>Command-line interface for syncing files and interacting with Knowledge Vault.</em>
</p>

Sync AI sessions (Claude Code, Codex, Antigravity, OpenCode) and files from your terminal.

<p align="center">
  <img src="docs/screenshots/cli-sync-ai-command.png" alt="CLI Sync AI" width="80%">
  <br><em>Example of syncing AI session history to central vault.</em>
</p>

<p align="center">
  <img src="docs/screenshots/ai-conversation-example.png" alt="AI Conversation" width="80%">
  <br><em>Example note created from syncing an AI session to your knowledge base.</em>
</p>

**Installation:**
```bash
npm install -g @pedroaugusto04/kb-cli
kb init
```

**Key Commands:**
```bash
kb sync-ai              # Sync AI sessions (primary)
kb sync --dir ./docs    # Sync directory
kb sync --file ./README.md  # Sync file
```

For complete CLI documentation, see [cli/README.md](cli/README.md).

### VS Code Extension

<p align="center">
  <img src="docs/screenshots/vscode-extension.png" alt="VS Code Extension" width="80%">
  <br><em>Integrated sidebar with AI chat and quick-save commands for code selections.</em>
</p>

Save code snippets or entire files directly from your editor. Right-click selections to save, use keyboard shortcuts for quick AI questions, and view AI session history for import.

**Installation:** Search for "Knowledge Vault" in the VS Code Extension Marketplace.

For complete extension documentation, see [ide/vscode/README.md](ide/vscode/README.md).

## License

See [LICENSE](LICENSE) for terms of use.

