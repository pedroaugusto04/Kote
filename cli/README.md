<p align="center">
  <img src="../ide/vscode/resources/kb-icon.svg" alt="kb-cli Logo" width="120" height="120">
</p>

# kb-cli

CLI client for the Knowledge Base AI system - interact with your Knowledge Vault directly from the terminal.

## About

`kb-cli` is the official command-line interface for Knowledge Vault. It allows you to sync local files and directories, capture AI session histories, and interact with your knowledge base without leaving your terminal.

Perfect for automating knowledge capture in CI/CD pipelines, local development scripts, or any workflow where the terminal is your primary interface.

## Installation

```bash
npm install -g @pedroaugusto04/kb-cli
```

## Quick Start

### Get Help

```bash
kb
help
# or use
kb --help
```

### Initialize Configuration

```bash
kb init
```

This will prompt you for your Knowledge Vault instance URL and credentials, creating a configuration file in your home directory.

### Sync AI Session History (Primary Feature)

```bash
# Interactive session selection
kb sync-ai
```

This will scan for AI sessions and prompt you to select which ones to import.

### Sync Files to Knowledge Vault (Optional)

```bash
# Sync an entire directory
kb sync --dir ./docs --project my-project

# Sync a single file
kb sync --file ./README.md --project my-project

# Sync with real-time monitoring
kb sync --dir ./src --project my-project --watch
```

## Key Commands

### `kb init`

Initialize CLI configuration. Prompts for:
- Knowledge Vault API URL
- API credentials (email/password or token)
- Default project (optional)

### `kb sync`

Sync local files or directories to your Knowledge Vault.

**Options:**
- `--dir <path>`: Sync a directory
- `--file <path>`: Sync a single file
- `--project <name>`: Target project name
- `--watch, -w`: Monitor for changes and sync in real-time
- `--dry-run`: Simulate sync without making changes

**Examples:**
```bash
# Sync documentation folder
kb sync --dir ./docs --project documentation

# Sync specific configuration file
kb sync --file ./package.json --project infrastructure

# Watch and sync changes automatically
kb sync --dir ./src --project backend --watch

# Test what would be synced
kb sync --dir ./docs --project docs --dry-run
```

### `kb sync-ai`

Sync AI-assisted development session histories to preserve valuable insights.

**Options:**
- `--session-path <path>`: Path to AI session directory
- `--project <name>`: Target project name
- `--watch, -w`: Monitor for new sessions

**Supported AI Tools:**
- Claude Code (`~/.claude/sessions`)
- Codex CLI (`~/.codex/sessions`)
- Custom session directories

**Examples:**
```bash
# Sync Claude Code sessions
kb sync-ai --session-path ~/.claude/sessions --project ai-experiments

# Monitor for new sessions automatically
kb sync-ai --session-path ~/.claude/sessions --project ai-work --watch
```

## Screenshots

<p align="center">
  <img src="../docs/screenshots/cli-commands.png" alt="CLI Commands" width="100%">
  <br><em>Command-line interface for syncing files and interacting with Knowledge Vault.</em>
</p>

<p align="center">
  <img src="../docs/screenshots/cli-sync-ai-command.png" alt="CLI Sync AI" width="100%">
  <br><em>Example of syncing AI session history to central vault.</em>
</p>

## Use Cases

### CI/CD Integration
Automatically capture build artifacts, deployment notes, and configuration changes:

```bash
# In your CI pipeline
kb sync --dir ./build-artifacts --project deployments
kb sync --file ./CHANGELOG.md --project releases
```

### Documentation Workflow
Keep documentation in sync with your knowledge base:

```bash
# Watch docs folder for changes
kb sync --dir ./docs --project documentation --watch
```

### AI Session Archiving
Preserve valuable AI-assisted development sessions:

```bash
# Archive Claude Code sessions as searchable knowledge
kb sync-ai --session-path ~/.claude/sessions --project development-history
```


## Links

- [Main Project Documentation](../README.md)
- [VS Code Extension](../ide/vscode/README.md)
- [Knowledge Vault Repository](https://github.com/pedroaugusto04/knowledge-base)

## License

See [LICENSE](../LICENSE) for terms of use.