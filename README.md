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

For configuration details, see [ide/vscode/README.md](./ide/vscode/README.md).
</details>

<details>
<summary><strong>Dependency Watcher</strong></summary>

Automatically monitor package dependencies across multiple ecosystems (npm, pip, composer, maven, cargo) and get notified about security updates and breaking changes.

* **Multi-Ecosystem Support**: Detects dependencies from package.json, requirements.txt, composer.json, pom.xml, and Cargo.toml
* **AI-Powered Analysis**: Analyzes changelogs to classify update urgency (critical, recommended, optional)
* **Email Alerts**: Sends email notifications for critical and recommended updates
* **Knowledge Base Integration**: Creates notes for each dependency update with full analysis
* **Daily Monitoring**: Automated cron job checks for new versions daily

For details, see [docs/DEPENDENCY_WATCHER.md](./docs/DEPENDENCY_WATCHER.md).
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
For installation steps and command options, see [cli/README.md](./cli/README.md).

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
For details, see [ide/browser-extension/README.md](./ide/browser-extension/README.md).

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
2. **Install the VS Code Extension:** Install **Kote** from the VS Code Marketplace, sign in, and connect your workspace.
3. **Sync Your First AI Session:** Let Kote capture a session automatically or save one from the extension.
4. **Understand Instantly:** Open a file in VS Code and click the CodeLens indicator to view an AI-powered summary of its context and related decisions.
5. **Connect GitHub:** Link your repository hosting through the Integrations dashboard to enable commit and pull request analysis.
6. **Code Normally:** Kote runs in the background and continuously captures AI sessions, Git activity, and development context.

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
   * **Web Application:** [http://localhost:4311](http://localhost:4311)
   * **API Server:** [http://localhost:4310](http://localhost:4310)

### Using the VS Code extension locally

The Marketplace extension defaults to the hosted Kote API. To run the extension
against this checkout:

```bash
cd ide/vscode
npm ci
npm run build
```

Open `ide/vscode` in VS Code, press `F5`, and use the Extension Development Host.
Before logging in, create or edit `~/.config/kb/config.json` with the local API:

```json
{
  "apiUrl": "http://localhost:4310/api",
  "workspaceSlug": "default",
  "defaultProjectSlug": "inbox",
  "cookies": {}
}
```

Then open the Kote activity-bar icon in the Extension Development Host and log
in with the account created by the local instance. The extension stores its
session in `~/.config/kb/config.json`. When using a packaged VSIX, run
`npm run package` inside `ide/vscode` after installing `@vscode/vsce`, then use
“Extensions: Install from VSIX...”.

### Using the CLI locally

Build and run the CLI from the repository without using the published package:

```bash
npm ci
npm run build:cli
node cli/dist/index.js config set apiUrl http://localhost:4310/api
node cli/dist/index.js init
```

The CLI stores its credentials in `~/.config/kote/config.json`. After `init`,
use `node cli/dist/index.js projects`, `node cli/dist/index.js sync --dir ./docs --project inbox`, or `node cli/dist/index.js sync-ai --project inbox`. To expose
the built command as `kote`, run `npm install -g ./cli` after `npm run build:cli`.
The CLI and VS Code extension use different configuration paths, so configuring
one does not automatically configure the other.

### GitHub integration

The GitHub integration uses a GitHub App to read repositories and receive push
and pull request webhooks. This is what enables repository synchronization,
commit analysis, PR context, and review comments.

For a self-hosted instance, configure these backend values:

```env
# Required only when GitHub must call this instance from the internet.
KB_PUBLIC_BASE_URL=https://kote.example.com
KB_API_PUBLIC_BASE_URL=https://kote.example.com/api
# For a public deployment, use the web application's origin.
KB_ALLOWED_ORIGINS=https://kote.example.com
KB_GITHUB_APP_ID=123456
KB_GITHUB_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
KB_GITHUB_APP_WEBHOOK_SECRET=generate-a-dedicated-webhook-secret
KB_GITHUB_APP_INSTALL_URL=https://github.com/apps/YOUR-APP-SLUG/installations/new
```

In the GitHub App settings, use the public callback URL
`https://kote.example.com/api/integrations/github-app/callback`, configure the
webhook URL exposed by the integration page, and enable the repository
permissions/events required by the App: repository metadata and contents read
access, pull requests read access, and push/pull-request webhook events. A plain
`localhost` URL cannot receive GitHub callbacks; for local testing use an HTTPS
tunnel such as Cloudflare Tunnel or ngrok and put its public URL in the
variables above.

### Deploying to a VPS

The repository also includes a production Compose file in
`docker-compose.prod.yml` and deployment helpers under `scripts/deploy/`. You
can use them to run Kote on a VPS with Docker Compose, a domain, and an HTTPS
reverse proxy. The recommended path is the deployment workflow in
`.github/workflows/deploy.yml`: configure its environment values/secrets, prepare
the VPS with Docker, Git, `rsync`, and SSH access, and configure the VPS's Nginx
or other reverse proxy for the frontend and API. The workflow then builds the
images, synchronizes the production environment, starts the services, and runs
the database migrations.

The VPS should persist Postgres data and backend environment files.

</details>

> [!TIP]
> For local self-hosting, the VS Code extension uses `apiUrl` in
> `~/.config/kb/config.json`, and the CLI uses `apiUrl` in
> `~/.config/kote/config.json`. Use `http://localhost:4310/api` as the value.

---

## License

See [LICENSE](LICENSE) for terms of use.
