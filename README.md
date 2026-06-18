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
* **AI-Powered Conversations:** Integrated chat interface to ask questions about your knowledge base with project filters and conversation history.
* **CLI Tool:** Command-line interface for syncing local files and AI session histories directly from your terminal.
* **VS Code Extension:** Complete Knowledge Vault integration with sidebar chat, quick shortcuts, and direct code/file saving from your editor.
* **Contextual Search:** Find answers instantly across your entire organizational history.
* **Project Briefs:** AI-generated operational technical summaries from the latest project items.

---

## Feature Deep Dives

### GitHub Push Integration

Capture knowledge automatically as you code. When you push to GitHub, Knowledge Vault analyzes your commits and diffs with AI, creating accessible technical summaries that flow into your knowledge base and team communication channels.

* **Automatic Capture:** No manual documentation required—knowledge is captured as part of your existing workflow
* **AI Analysis:** Commits and diffs are analyzed to extract key decisions and technical context
* **Team Visibility:** Summaries are sent to your team channels (Telegram) and stored in your knowledge base
* **Searchable History:** Every push becomes part of your searchable organizational memory

### AI-Powered Conversations

<p align="center">
  <img src="docs/screenshots/ask-ai-overview.png" alt="Ask AI" width="80%">
  <br><em>Chat interface to ask questions about your knowledge base with project-specific filters.</em>
</p>

Get instant answers from your team's collective knowledge without searching manually. The AI understands your context and provides relevant responses based on your actual data.

<p align="center">
  <img src="docs/screenshots/ai-conversation-example.png" alt="AI Conversation" width="80%">
  <br><em>Example note created from syncing an AI session (Claude Code, Codex, Antigravity, OpenCode) to your knowledge base.</em>
</p>

Preserve AI-assisted development sessions as searchable knowledge. The sync-ai feature captures conversations from tools like Claude Code, Codex, Antigravity, OpenCode, and other AI assistants, storing them as structured notes in your vault.

### Project Management & Notes

<p align="center">
  <img src="docs/screenshots/project-notes-overview.png" alt="Project Notes" width="80%">
  <br><em>Organize notes within projects with clean, structured views.</em>
</p>

Keep related knowledge together and easily navigable. Each project becomes a living documentation hub that grows with your team.

<p align="center">
  <img src="docs/screenshots/note-details-example.png" alt="Note Details" width="80%">
  <br><em>Detailed note view with metadata, tags, and rich content.</em>
</p>

Full context for each piece of knowledge with proper attribution, making it easy to understand who contributed what and when.

<p align="center">
  <img src="docs/screenshots/project-brief-overview.png" alt="Project Brief" width="80%">
  <br><em>AI-generated summaries of project activity and key decisions.</em>
</p>

Quickly catch up on project status without reading every update. Perfect for getting new team members up to speed or refreshing your memory after time away.

### Knowledge Map

<p align="center">
  <img src="docs/screenshots/map-overview.png" alt="Knowledge Map" width="80%">
  <br><em>Visual graph showing connections between notes, projects, and topics.</em>
</p>

Discover relationships and patterns in your knowledge that aren't obvious in lists. The knowledge map helps you see the bigger picture and find unexpected connections.

### Integrations

<p align="center">
  <img src="docs/screenshots/integrations-setup.png" alt="Integrations Setup" width="80%">
  <br><em>Guided setup panel for connecting WhatsApp, Telegram, and GitHub.</em>
</p>

Capture knowledge where your team already works without changing habits. Connect your existing tools and let knowledge flow naturally into your vault.

* **WhatsApp:** Send audio or text messages to generate AI-structured notes. Receive automatic reminders integrated via WhatsApp.
* **Telegram:** Get pipeline failure alerts, review summaries, and interact directly with the bot.
* **GitHub Push:** Capture `git push` events, analyze commits/diffs with AI, and send accessible technical summaries to your Telegram channel and knowledge base.

---

## Developer Tools

### CLI Tool (`kb`)

The official CLI lets you interact with Knowledge Vault directly from your terminal and sync local files.

<p align="center">
  <img src="docs/screenshots/cli-commands.png" alt="CLI Commands" width="80%">
  <br><em>Command-line interface for syncing files and interacting with Knowledge Vault.</em>
</p>

Automate knowledge capture from your development workflow. Perfect for CI/CD pipelines and local development scripts.

<p align="center">
  <img src="docs/screenshots/cli-sync-ai-command.png" alt="CLI Sync AI" width="80%">
  <br><em>Example of syncing AI session history (Claude Code, Codex, Antigravity, OpenCode) to central vault.</em>
</p>

Preserve AI-assisted development sessions as searchable knowledge. Never lose valuable insights from your AI interactions.

**Installation:**
```bash
npm install -g @pedroaugusto04/kb-cli
kb init
```

**Key Commands:**
```bash
# Sync AI session history (primary feature)
kb sync-ai

# Optional: Sync directory or file
kb sync --dir ./docs --project my-project
kb sync --file ./README.md --project my-project

# Optional: Useful flags
--watch or -w: Real-time monitoring and sync
--dry-run: Simulate sync without server changes
```

For complete CLI documentation, see [cli/README.md](cli/README.md).

### VS Code Extension

<p align="center">
  <img src="docs/screenshots/vscode-extension.png" alt="VS Code Extension" width="80%">
  <br><em>Integrated sidebar with AI chat and quick-save commands for code selections.</em>
</p>

Save code snippets and get AI help without leaving your editor. The extension brings Knowledge Vault directly into your development environment.

**Key Features:**
* **Dedicated Sidebar:** Interactive AI chat and manual note saving
* **Save Code Selection:** Right-click any code selection and choose "KB: Save Selection as Note"
* **Save Active File:** Run "KB: Save Active File as Note" from the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
* **Local AI History Import:** Sync and monitor AI CLI session histories (Claude Code, Codex CLI) in real-time

**Installation:** Search for "Knowledge Vault" in the VS Code Extension Marketplace.

For complete extension documentation, see [ide/vscode/README.md](ide/vscode/README.md).

---

## Getting Started with Docker

### 1. Configure Environment Variables
Create a `.env` file in the project root with the necessary credentials based on `.env.example`.

### 2. Start Services
Launch all required containers (PostgreSQL, RabbitMQ, API, and Frontend):
```bash
docker compose up
```

### 3. Run Database Migrations
With containers running, execute migrations:
```bash
docker compose exec api npm run migrate
```

The application will be available at:
* **Frontend:** [http://localhost:4311](http://localhost:4311)
* **API:** [http://localhost:4310](http://localhost:4310)

---

## Testing

### Unit and Integration Tests
The project includes tests for API, CLI, and frontend:

```bash
# Run all tests (fast, no real browser)
npm test

# Run API tests only
npm run test:api

# Run CLI tests only
npm run test:cli

# Run frontend tests only
npm run test:frontend

# Run integration tests only (fast, no real browser)
npm run test:integration
```

### E2E Tests (End-to-End)
E2E tests use Playwright and cover critical application flows. These are slower as they use a real browser:

```bash
# Install Playwright browsers (first time only)
npx playwright install

# Run E2E tests in headless mode (Chromium only)
npm run test:e2e

# Run E2E tests with visual interface
npm run test:e2e:ui

# Run E2E tests in debug mode
npm run test:e2e:debug

# Run E2E tests with visible browser
npm run test:e2e:headed
```

**Test Strategy:**
- **Integration Tests (Vitest):** Fast, no real browser, covers most functionality
- **E2E Tests (Playwright):** Slower, uses real browser (Chromium), for critical flows and cross-browser validation

**Covered Functionality:**
- Operational Dashboard: navigation and main elements
- Contextual Search: search functionality and filters
- Ask AI: AI chat interface
- Projects and Notes: project and vault management
- Integrations: integration configuration (WhatsApp, Telegram, GitHub)

