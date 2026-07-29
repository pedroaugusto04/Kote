# Dependency Watcher

Automatically monitor package dependencies across multiple ecosystems and get notified about security updates and breaking changes.

## Overview

Dependency Watcher tracks your project dependencies and alerts you when new versions are available. It supports multiple package ecosystems and uses AI to analyze the impact of updates, helping you prioritize which dependencies to update.

## Supported Ecosystems

- **npm** (JavaScript/Node.js)
- **pip** (Python)
- **composer** (PHP)
- **maven** (Java)
- **cargo** (Rust)

## How It Works

1. **Connect GitHub**: Link your GitHub account and select repositories for your workspace projects.

2. **Monitored Repositories**: On the **Dependency Watcher** integration card, open **Monitored Repositories**. Only GitHub repos that are linked to workspace projects appear. Select repos to monitor and save — Kote runs an initial dependency scan automatically.

3. **Enable per Workspace**: Enable Dependency Watcher on the same card. Each workspace controls monitoring independently.

4. **Automatic Import**: A daily cron job (default: 7 AM) reimports dependencies from your GitHub repositories to sync the `currentVersion` with the actual versions in your code. This prevents false alerts for updates you've already applied. Controlled by `DEPENDENCY_WATCHER_IMPORT_CRON`.

5. **Automatic Check**: A separate daily cron job (default: 9 AM) checks for new versions of tracked dependencies (only for enabled workspaces and monitored repositories). This runs 2 hours after the import to ensure data is up-to-date. Controlled by `DEPENDENCY_WATCHER_CRON`.

6. **AI Analysis**: When an update is found, AI analyzes the changelog to determine urgency:
   - **Critical**: Security vulnerabilities, breaking changes
   - **Recommended**: Important features, deprecations
   - **Optional**: Minor updates, bug fixes

7. **Alerts & Notes**:
   - Email alerts for critical and recommended updates (sent to the **account owner's email**)
   - Automatic note creation in the knowledge base with full analysis
   - Timeline category for filtering dependency updates

## Setup

### 1. Server Environment Variables

```env
# Import cron schedule (e.g., daily at 7 AM - 2 hours before check)
DEPENDENCY_WATCHER_IMPORT_CRON="0 7 * * *"

# Check cron schedule (e.g., daily at 9 AM)
DEPENDENCY_WATCHER_CRON="0 9 * * *"

# Check interval in hours
DEPENDENCY_WATCHER_CHECK_INTERVAL_HOURS=24

# Only check stable releases (ignore pre-release/beta versions)
DEPENDENCY_WATCHER_STABLE_ONLY=true

# AI provider for analysis (optional, uses default chat AI if not set)
DEPENDENCY_WATCHER_AI_PROVIDER=openai
DEPENDENCY_WATCHER_AI_BASE_URL=https://api.openai.com/v1
DEPENDENCY_WATCHER_AI_MODEL=gpt-4
DEPENDENCY_WATCHER_AI_API_KEY=your-api-key
```

### 2. Connect GitHub App

1. Go to **Integrations** → **GitHub App**
2. Click **Connect** and authorize the app
3. Select the repositories you want to monitor

### 3. Select Monitored Repositories

1. Go to **Integrations** → **Dependency Watcher**
2. Click **Monitored Repositories**
3. Select project-linked repositories to monitor
4. Click **Save & Scan** (imports dependencies and starts monitoring)

### 4. Enable Dependency Watcher

1. On the **Dependency Watcher** card, click **Enable**
2. The worker checks dependencies daily based on the cron schedule