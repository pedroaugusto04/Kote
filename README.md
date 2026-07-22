<p align="center">
  <img src="frontend/public/Kote-Brand.png" alt="Kote" width="600">
</p>

<p align="center">
  <a href="https://github.com/pedroaugusto04/knowledge-base/actions/workflows/deploy.yml"><img src="https://img.shields.io/github/actions/workflow/status/pedroaugusto04/knowledge-base/deploy.yml?branch=main&label=build&style=flat-square" alt="Build Status"></a>
  <img src="https://img.shields.io/badge/version-1.0.0-blue?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/license-Fair--Code-7C3AED?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/NestJS-E0234E?style=flat-square&logo=nestjs&logoColor=white" alt="NestJS">
  <img src="https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React">
</p>

<!-- Topics: developer-tools, context-engine, ai-integration, productivity, typescript, nestjs, react, git-integration, code-documentation, pwa -->

<h2 align="center">Git remembers what changed.<br>Kote remembers why.</h2>

<p align="center">

  Kote is a <strong>developer memory layer</strong> that automatically captures AI conversations, Git activity, and development decisions, then surfaces this context exactly when you need it.
  <br><br>
</p>

> [!NOTE]
> **Human-centric memory:** Kote is primarily a product for capturing and retrieving development context for **you**, the human developer. While it can be accessed by AI assistants (via MCP), the main goal is to help you retrieve, understand, and act on past decisions and context. It does not automatically feed memory into agent prompts, keeping context separate and avoiding token bloat.

<p align="center">
  <a href="https://pedro-duarte.ddns.net/kote"><img src="https://img.shields.io/badge/Open_Kote_Web_App-0277BD?style=for-the-badge&logoColor=white" alt="Open Kote Web App"></a>
</p>

---

<p align="center">
  <img src="docs/gifs/Kote-Demo.gif" alt="Kote Demo" width="100%">
  <br><em>Open a file. Instantly understand past decisions.</em>
</p>

---

## Why?

Every project slowly loses context.

Commits explain what changed. Documentation becomes outdated. ChatGPT conversations disappear. Developers leave.

Months later, nobody remembers why anything exists. 

Ever spent an hour trying to understand why a piece of code exists? **Kote prevents this by preserving context as you build.**

## How?

Kote runs in the background, indexing your interactions and development activity to surface relevant context exactly when and where you need it.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/diagram-dark-horizontal.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/diagram-light-horizontal.svg">
  <img alt="Kote Flow Diagram" src="docs/diagram-dark-horizontal.svg" width="100%">
</picture>

1. **Development & AI Sessions:** The VS Code extension automatically logs local AI conversations and saves highlighted code snippets to your context engine.
2. **Git Workflow:** The GitHub integration analyzes commit diffs on push, generating technical summaries and flagging potential operational issues.
3. **Quick Notes:** Send text or audio messages to Kote's messaging integrations to log quick notes or environment configurations.
4. **CodeLens Integration:** When opening files in VS Code, Kote displays accumulated knowledge and decisions directly in your editor. Click to view an AI-powered summary of why that code exists.
5. **Search & Retrieval:** Ask natural language questions in your IDE, CLI, WhatsApp, or the Web interface to instantly retrieve past decisions and context.

---

## Features & Integrations

Once Kote is capturing your context, you can interact with it everywhere you work.

<details>
<summary><strong>Web Application & Knowledge Map</strong></summary>

A visual dashboard to manage, search, and visualize your context engine. Features a node graph illustrating relations between projects and notes.

<p align="center">
  <img src="docs/screenshots/ask-ai-overview.png" alt="Web Chat Search Interface" width="100%">
  <br><em>Semantic chat interface for querying indexed data.</em>
</p>

<p align="center">
  <img src="docs/screenshots/note-details-example.png" alt="Note Detail View" width="100%">
  <br><em>Detailed view of a captured note with metadata and tags.</em>
</p>

<p align="center">
  <img src="docs/screenshots/map-overview.png" alt="Knowledge Node Graph Map" width="100%">
  <br><em>Visual node graph illustrating relations between projects and notes.</em>
</p>

</details>

<details>
<summary><strong>VS Code Extension</strong></summary>

Integrates directly with your editor to capture context during development.

<p align="center">
  <img src="docs/screenshots/vscode-extension.png" alt="VS Code Extension Sidebar" width="100%">
  <br><em>Integrated sidebar containing AI chat and quick-save options.</em>
</p>

* **CodeLens Integration**: See relevant notes and decisions right above your code. Click for an AI-powered timeline of key changes.
* **AI Chat Sidebar**: Query your context engine without leaving the editor.
* **Quick Save**: Save code selections as notes with a right-click.
* **AI Session Sync**: Automatically syncs local AI CLI sessions (Antigravity, Codex, Claude Code, etc.) in the background.

For configuration details, see [ide/vscode/README.md](ide/vscode/README.md).
</details>

<details>
<summary><strong>GitHub Integration</strong></summary>

* **Diff Analysis:** Summarizes changes on every push.
* **Alert System:** Notifies the team via WhatsApp or Telegram if potential configuration or environmental issues are detected in a diff.
* **PR Context AI:** Analyzes changed files and title/description of newly opened Pull Requests to automatically retrieve historical technical decisions and context, posting it as a PR comment.

</details>

<details>
<summary><strong>Kote CLI</strong></summary>

Synchronize terminal session histories and import local directories or files.

<p align="center">
  <img src="docs/screenshots/cli-sync-ai-command.png" alt="Sync AI CLI Command" width="100%">
  <br><em>Importing AI session history from the terminal.</em>
</p>
For installation steps and command options, see [cli/README.md](cli/README.md).

</details>

<details>
<summary><strong>Messaging (WhatsApp & Telegram)</strong></summary>

Log quick notes and query your context engine on the go.

<p align="center">
  <img src="docs/screenshots/integrations-setup.png" alt="Integrations Configuration Panel" width="100%">
  <br><em>Configuration dashboard for WhatsApp, Telegram, and GitHub integrations.</em>
</p>

* **Audio Notes:** Transcribes and structures voice recordings.
* **Image Capture:** Upload screenshots or whiteboard diagrams.
* **Interactive Querying:** Search using the `/ask` command.

</details>

<details>
<summary><strong>Browser Extension</strong></summary>

Save documentation, issues, and articles directly from the web browser.

<p align="center">
  <img src="frontend/public/browser-extension-window.png" alt="Browser Extension Popup" width="70%">
  <br><em>Browser extension popup for saving web content.</em>
</p>
See [ide/browser-extension/README.md](ide/browser-extension/README.md).

</details>

<details>
<summary><strong>Model Context Protocol (MCP) Server</strong></summary>

Provides developer memory retrieval and persistence directly to AI assistants (Cursor, Claude Desktop, Cline, Antigravity).

* **kote_search_notes**: Search developer notes and decisions.
* **kote_get_note**: Fetch the full Markdown body of a specific note by ID.
* **kote_create_note**: Persistently save important decisions straight into your Kote memory graph.

Run directly via `npx -y @pedroaugusto04/kote-mcp`. See [ide/mcp/README.md](ide/mcp/README.md).
</details>

---

## Getting Started

1. **Sign In:** Go to [pedro-duarte.ddns.net/kote](https://pedro-duarte.ddns.net/kote) and authenticate your account.
2. **Configure Integrations:** Connect your repository hosting (GitHub) via the Integrations dashboard.
3. **Install the VS Code Extension:** Install **Kote** from the VS Code Marketplace and sign in.
4. **Code Normally:** Kote runs in the background and continuously captures AI sessions, Git activity, and development context. 
5. **Understand Instantly:** Open files in VS Code. Click the CodeLens indicator to view an AI-powered summary of the file's context and related decisions.

> [!TIP]
> **CodeLens not working?** Make sure CodeLens is enabled in your VS Code settings (`"editor.codeLens": true`).

---

<details>
<summary><strong>Self-Hosting (Docker)</strong></summary>

If you prefer to run Kote on your own infrastructure, you can launch the entire stack using Docker Compose:

Prerequisites:

- Docker with Docker Compose;
- Node.js 20.12 or newer;
- a Supabase project with a private `notes` Storage bucket.

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/pedroaugusto04/knowledge-base.git
   cd knowledge-base
   ```

2. **Configure Environment Variables:**
   ```bash
   npm run setup:local
   ```
   Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`. In the Supabase dashboard, create a **private Storage bucket** named `notes` (Storage → New bucket). Kote stores note Markdown, attachments, and avatars in this bucket.

   Verify the local configuration and bucket:
   ```bash
   npm run check:local
   ```

3. **Start Services:**
   ```bash
   docker compose up -d --wait
   ```
   Run the database migrations once:
   ```bash
   docker compose exec api npm run migrate
   ```
   * **Web Application:** [http://localhost:4311](http://localhost:4311)
   * **API Server:** [http://localhost:4310](http://localhost:4310)

</details>

> [!TIP]
> Point your VS Code Extension (`knowledgeVault.apiUrl`) or CLI (`apiUrl` in `~/.kb-config.json`) to your self-hosted API URL (`http://localhost:4310`).

---

## License

See [LICENSE](LICENSE) for terms of use.
