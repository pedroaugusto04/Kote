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

1. **Import Dependencies**: Connect your GitHub repositories and select projects to scan. Kote automatically detects the package ecosystem from manifest files (package.json, requirements.txt, composer.json, pom.xml, Cargo.toml).

2. **Automatic Monitoring**: A daily cron job checks for new versions of your tracked dependencies.

3. **AI Analysis**: When an update is found, AI analyzes the changelog to determine urgency:
   - **Critical**: Security vulnerabilities, breaking changes
   - **Recommended**: Important features, deprecations
   - **Optional**: Minor updates, bug fixes

4. **Alerts & Notes**: 
   - Email alerts for critical and recommended updates
   - Automatic note creation in your knowledge base with full analysis
   - Timeline category for filtering dependency updates

## Setup

### 1. Enable Dependency Watcher

Set the following environment variables:

```env
# Cron schedule (e.g., daily at 9 AM)
DEPENDENCY_WATCHER_CRON="0 9 * * *"

# Check interval in hours
DEPENDENCY_WATCHER_CHECK_INTERVAL_HOURS=24

# Email for alerts
DEV_EMAIL=your-email@example.com

# AI provider for analysis (optional, uses default if not set)
DEPENDENCY_WATCHER_AI_PROVIDER=openai
DEPENDENCY_WATCHER_AI_BASE_URL=https://api.openai.com/v1
DEPENDENCY_WATCHER_AI_MODEL=gpt-4
DEPENDENCY_WATCHER_AI_API_KEY=your-api-key
```

### 2. Import Dependencies

1. Go to **Integrations** → **GitHub App**
2. Click **Connect** to link your GitHub account
3. Click **Import Dependencies** button
4. Select the projects you want to monitor
5. Click **Import Dependencies**

Kote will scan the selected projects' repositories and import all dependencies found in their manifest files.

### 3. Enable Dependency Watcher per Workspace

1. Go to **Integrations**
2. Find the **Dependency Watcher** integration card
3. Click **Enable** to activate dependency monitoring for your workspace
4. The worker will now check dependencies daily based on the cron schedule

**Note:** Dependency Watcher is enabled per workspace. Each workspace can independently enable or disable the feature.

## Features

### Multi-Ecosystem Detection

Kote automatically detects the package ecosystem based on the manifest file:

| Ecosystem | Manifest Files |
|-----------|---------------|
| npm | package.json |
| pip | requirements.txt, pyproject.toml |
| composer | composer.json |
| maven | pom.xml |
| cargo | Cargo.toml |

### Version Filtering

Uses semantic versioning (semver) to:
- Filter out pre-release versions
- Sort versions correctly
- Compare current vs latest versions

### Repository URL Extraction

Automatically extracts repository URLs from package metadata to provide direct links to source code and changelogs.

### AI-Powered Analysis

When an update is detected, AI analyzes:
- Changelog content
- Breaking changes
- Security implications
- Recommended next steps

### Email Alerts

Critical and recommended updates trigger email alerts with:
- Package name and version change
- Urgency level
- Summary of changes
- Breaking changes list
- Next steps
- Repository link

### Knowledge Base Integration

Each dependency update creates a note in your knowledge base with:
- Title: `[Dependency Update] package: current → latest`
- Full analysis content
- Breaking changes and next steps
- Repository link
- Tags: `dependency-update`, package name, urgency level

### Timeline Filtering

Dependency updates appear in your timeline under the **Dependency** category, allowing you to:
- Filter notes by source
- Focus on manual notes vs system notifications
- Search dependency-specific context

## Architecture

```
┌─────────────────┐
│  GitHub Repos   │
│  (manifests)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Import Use     │
│  Case           │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Database       │
│  (kb_dependency │
│   _watch)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Cron Worker    │
│  (daily check)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Registry       │
│  Strategies     │
│  (npm, pip,     │
│   composer,     │
│   maven, cargo) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  AI Analysis    │
│  (urgency)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Email + Notes  │
└─────────────────┘
```

## Registry Strategies

Each ecosystem has a dedicated strategy that:
- Fetches latest version from official registry
- Extracts repository URL and changelog
- Handles API rate limits and timeouts
- Validates response data

### Supported Registries

- **npm**: https://registry.npmjs.org
- **pip**: https://pypi.org
- **composer**: https://packagist.org
- **maven**: https://search.maven.org
- **cargo**: https://crates.io

## Troubleshooting

### Dependencies Not Being Imported

- Verify GitHub integration is connected
- Check that projects have repositories linked
- Ensure manifest files exist in repository roots
- Check backend logs for import errors

### No Email Alerts

- Verify `DEV_EMAIL` is set
- Check email provider configuration (Resend/SMTP)
- Ensure `DEPENDENCY_WATCHER_ENABLED=true`
- Verify cron schedule is correct

### Worker Not Running

- Check `DEPENDENCY_WATCHER_ENABLED=true`
- Verify module is registered in app
- Check backend logs for worker startup errors

### AI Analysis Failing

- Verify AI API key is configured
- Check `DEPENDENCY_WATCHER_AI_*` variables
- Fallback: Updates will be marked as "Optional" without AI

## API Endpoints

### Import Dependencies

```http
POST /api/integrations/dependency-watch/import
Content-Type: application/json

{
  "workspaceSlug": "my-workspace",
  "projectIds": ["project-1", "project-2"]  // optional
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

## Future Enhancements

- [ ] UI for viewing imported dependencies
- [ ] Manual trigger for dependency checks
- [ ] Dependency health dashboard
- [ ] Bulk update actions
- [ ] Custom alert preferences per user
- [ ] Support for additional ecosystems (gradle, go, nuget, rubygems)
