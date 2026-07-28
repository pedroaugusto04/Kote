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

2. **Import Dependencies**: On the **Dependency Watcher** integration card, import dependencies from your linked GitHub repositories. Kote detects the package ecosystem from manifest files (`package.json`, `requirements.txt`, `composer.json`, `pom.xml`, `Cargo.toml`).

3. **Enable per Workspace**: Enable Dependency Watcher on the same card. Each workspace controls monitoring independently.

4. **Automatic Monitoring**: A daily cron job checks for new versions of tracked dependencies (only for enabled workspaces).

5. **AI Analysis**: When an update is found, AI analyzes the changelog to determine urgency:
   - **Critical**: Security vulnerabilities, breaking changes
   - **Recommended**: Important features, deprecations
   - **Optional**: Minor updates, bug fixes

6. **Alerts & Notes**:
   - Email alerts for critical and recommended updates (sent to the **account owner's email**)
   - Automatic note creation in the knowledge base with full analysis
   - Timeline category for filtering dependency updates

## Setup

### 1. Server Environment Variables

```env
# Cron schedule (e.g., daily at 9 AM)
DEPENDENCY_WATCHER_CRON="0 9 * * *"

# Check interval in hours
DEPENDENCY_WATCHER_CHECK_INTERVAL_HOURS=24

# AI provider for analysis (optional, uses default chat AI if not set)
DEPENDENCY_WATCHER_AI_PROVIDER=openai
DEPENDENCY_WATCHER_AI_BASE_URL=https://api.openai.com/v1
DEPENDENCY_WATCHER_AI_MODEL=gpt-4
DEPENDENCY_WATCHER_AI_API_KEY=your-api-key
```

**Note:** There is no global on/off flag. Enablement is controlled per workspace in the Integrations UI.

### 2. Connect GitHub App

1. Go to **Integrations** → **GitHub App**
2. Click **Connect** and authorize the app
3. Select the repositories you want to monitor

### 3. Import Dependencies

1. Go to **Integrations** → **Dependency Watcher**
2. Click **Import Dependencies**
3. Select the projects to scan
4. Click **Import Dependencies**

### 4. Enable Dependency Watcher

1. On the **Dependency Watcher** card, click **Enable**
2. The worker checks dependencies daily based on the cron schedule

## Features

### Multi-Ecosystem Detection

| Ecosystem | Manifest Files |
|-----------|---------------|
| npm | package.json |
| pip | requirements.txt, pyproject.toml |
| composer | composer.json |
| maven | pom.xml |
| cargo | Cargo.toml |

### Version Filtering

Uses semantic versioning (semver) to filter pre-releases, sort versions, and compare current vs latest.

### AI-Powered Analysis

When an update is detected, AI analyzes changelog content, breaking changes, security implications, and recommended next steps.

### Email Alerts

Critical and recommended updates trigger email alerts to the **user's registered email** with package details, urgency, summary, breaking changes, next steps, and repository link.

### Knowledge Base Integration

Each update creates a note scoped to the workspace with title `[Dependency Update] package: current → latest`, full analysis, tags, and repository link.

## Architecture

```
GitHub Repos (manifests)
        ↓
Import Use Case → kb_dependency_watch
        ↓
Cron Worker (DependencyWatcherModule)
        ↓
Registry Strategies (npm, pip, composer, maven, cargo)
        ↓
AI Analysis → Email + Notes (workspace-scoped)
```

## API Endpoints

All endpoints require authentication (`Authorization: Bearer <token>`).

### Import Dependencies

```http
POST /api/integrations/dependency-watch/import
Content-Type: application/json

{
  "workspaceSlug": "my-workspace",
  "projectIds": ["project-1", "project-2"]
}
```

Response:

```json
{
  "ok": true,
  "data": {
    "total": 15,
    "imported": 15,
    "skipped": 0,
    "repositories": 3
  }
}
```

### Enable Workspace Monitoring

```http
PATCH /api/integrations/dependency-watch/{workspaceSlug}/enable
```

Response:

```json
{
  "ok": true,
  "data": { "enabled": true }
}
```

### Disable Workspace Monitoring

```http
PATCH /api/integrations/dependency-watch/{workspaceSlug}/disable
```

Response:

```json
{
  "ok": true,
  "data": { "enabled": false }
}
```

## Troubleshooting

### Enable/Disable Returns 404

Ensure the backend is deployed with `DependencyWatcherController` registered at `/api/integrations/dependency-watch` and `DependencyWatcherModule` imported in `AppModule`.

### Dependencies Not Being Imported

- Verify GitHub integration is connected
- Check that projects have repositories linked
- Ensure manifest files exist in repository roots
- Check backend logs for `dependency_watcher_import_failed`

### Import Fails with `github_credential_not_found`

The GitHub App must be connected for the same workspace slug used in the import request.

### No Email Alerts

- Verify the user account has a valid email address
- Check email provider configuration (Resend/SMTP)
- Ensure Dependency Watcher is **enabled** for the workspace
- Only **critical** and **recommended** updates trigger email; optional updates create notes only

### Worker Not Running

- Verify `DependencyWatcherModule` is imported in `AppModule`
- Check `DEPENDENCY_WATCHER_CRON` format (5-field cron expression)
- Check backend logs for `dependency_watcher_worker_started`

### AI Analysis Failing

- Verify AI API key is configured (`DEPENDENCY_WATCHER_AI_*` or default chat AI vars)
- Fallback: updates are marked as **Optional** without AI analysis

## Future Enhancements

- [ ] UI for viewing imported dependencies
- [ ] Manual trigger for dependency checks
- [ ] Dependency health dashboard
- [ ] Bulk update actions
- [ ] Custom alert preferences per user
- [ ] Support for additional ecosystems (gradle, go, nuget, rubygems)
