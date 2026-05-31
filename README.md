---
id: 9b82a11e-884a-4533-8deb-c703b058d9b2
---
# Knowledge Vault

Knowledge Vault centralizes your team's operational knowledge in one place, preventing the loss of critical context and decisions.

![Knowledge Vault Overview](docs/screenshots/home-overview.png)

## Overview
Transform scattered information into a searchable knowledge base by automatically capturing daily learnings, decisions, and pending tasks.

## Key Features
- **Project Organization:** Notes, routines, and decisions centralized by context.
- **Contextual Search:** Instantly find answers across the team's entire history.
- **Ask AI History:** Web Ask AI answers are saved per user with project filtering and pagination.
- **Operational Dashboard:** A quick summary of recent activities, priorities, and reminders.
- **Project Briefs:** Manual AI-generated technical briefs per project, with saved history and fallback to the last successful brief.
- **Reminder Kanban:** Operational board for overdue, upcoming, resolved, and archived pending work.
- **Continuous Capture:** Direct integration with the tools your team already uses.

## Integrations
We simplify knowledge capture where the work already happens:

- **WhatsApp:** Send texts or audio directly to the Vault. The system automatically identifies the project and generates structured notes without manual effort.
- **WhatsApp Reminders:** Backend reminder dispatch uses the workspace `whatsappChatJid` through Evolution API as the default delivery channel. It can store either a group JID or a private chat JID.
- **GitHub Push:** Captures `git push` events, analyzes commits and diffs, and transforms technical updates into accessible context for everyone, not just developers.
- **Project Brief AI:** Generates an English operational technical brief from the latest 30 project items.

## Why Knowledge Vault?
- **Zero context loss:** Perfect for shift handovers or new projects.
- **Accelerated onboarding:** New members can find the complete history in seconds.
- **Single source of truth:** A reliable record of decisions and operational exceptions.

## Quick Start (2 Minutes)
1. Create your **Workspace**.
2. Register your **Projects**.
3. Connect your channels (**WhatsApp/GitHub**).
4. Start capturing and searching!

## Command Line Interface (CLI) & Local File Sync
The CLI (`kb`) allows you to interact with your Knowledge Vault from your terminal and sync local folders of Markdown files.

### 1. Installation
Install the CLI globally from npm:
```bash
npm install -g @pedroaugusto04/kb-cli
```

### 2. Initialization
Authenticate with your Knowledge Vault server:
```bash
kb init
```

### 3. Local File Sync (`kb sync`)
Synchronize a folder of Markdown files or a **single Markdown file** directly with your knowledge base:

```bash
# Sync an entire directory
kb sync --dir ./docs --project my-project

# Sync a single markdown file (e.g., the README)
kb sync --dir ./README.md --project my-project
```

#### How it works:
* **Directory or Single File Support**: The `--dir` (or `-d`) flag accepts either a path to a directory (which is scanned recursively) or a path directly to a single Markdown file.
* **Idempotency & Speed**: A local `.kb-sync.json` ledger file is created inside the target directory (or the parent directory of the file if syncing a single file) to store SHA-256 hashes of the files. Unchanged files are skipped on subsequent runs.
* **ID Binding**: When a note is first created on the server, the generated note ID is automatically injected into the file's YAML frontmatter (`id: <note-id>`) so it is mapped for future updates.
* **YAML Frontmatter Metadata**: You can define custom tags, project slugs, types, and status in the frontmatter of your markdown files:
  ```markdown
  ---
  title: Running Migrations
  project: infra
  tags: db, postgres, migrations
  status: active
  ---
  Content of the note here...
  ```
* **Real-time Sync (Watch Mode)**: Use the `--watch` or `-w` flag to monitor the directory or file for real-time changes and sync them instantly:
  ```bash
  kb sync --dir ./docs -w
  # Or for a single file
  kb sync --dir ./README.md -w
  ```
* **Dry Run Mode**: Use the `--dry-run` flag to simulate the sync process, seeing what would be created or updated without actually writing or sending any changes:
  ```bash
  kb sync --dir ./docs --dry-run
  ```

---

### Extras

![Operational Dashboard](docs/screenshots/dashboard-overview.png)
*Operational dashboard with recent activity, priorities, and active projects.*

![Guided Integrations Setup](docs/screenshots/integrations-setup.png)
*Integration setup and configuration panel.*

![Projects Overview](docs/screenshots/projects-overview.png)
*Project and notes organization view inside the workspace.*