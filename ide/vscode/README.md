# Knowledge Vault for VS Code

Integrate your Knowledge Vault directly into VS Code — search, ask AI, save notes without leaving your editor.

![Version](https://img.shields.io/visual-studio-marketplace/v/knowledge-base-vscode?color=blue&logo=visual-studio-code)
![Installs](https://img.shields.io/visual-studio-marketplace/i/knowledge-base-vscode?color=green&logo=visual-studio-code)
![Rating](https://img.shields.io/visual-studio-marketplace/stars/knowledge-base-vscode?color=yellow&logo=visual-studio-code)

## Features

- **Dedicated Sidebar**: Interactive AI chat and manual note saving
- **Quick AI Questions**: Ask questions without leaving your editor (Ctrl+Shift+K)
- **Save Code Selection**: Right-click any code selection to save as a note
- **Save Active File**: Save entire files directly to your knowledge base
- **AI Session History**: View and search recent AI-assisted development sessions
- **Real-time Sync**: Monitor and sync local AI CLI sessions automatically

## Screenshots

<p align="center">
  <img src="../../docs/screenshots/vscode-extension.png" alt="VS Code Extension" width="80%">
  <br><em>Integrated sidebar with AI chat and quick-save commands for code selections.</em>
</p>

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Knowledge Vault"
4. Click Install

### Manual Installation

1. Download the latest `.vsix` file from the [Releases](https://github.com/pedroaugusto04/knowledge-base/releases) page
2. Open VS Code
3. Run "Extensions: Install from VSIX..." from the Command Palette (Ctrl+Shift+P)
4. Select the downloaded file

## Getting Started

### 1. Configure Your Knowledge Vault

After installation, you'll need to connect to your Knowledge Vault instance:

1. Open the Knowledge Vault sidebar (click the icon in the activity bar)
2. Enter your Knowledge Vault URL
3. Provide your API credentials
4. Select your default workspace/project

### 2. Basic Usage

#### Ask AI Questions

**Keyboard Shortcut**: `Ctrl+Shift+K` (Windows/Linux) or `Cmd+Shift+K` (Mac)

1. Select text in your editor (optional)
2. Press `Ctrl+Shift+K`
3. Type your question
4. Get instant answers from your knowledge base

#### Save Code Selection

1. Select code in your editor
2. Right-click and choose "KB: Save Selection as Note"
3. Choose project and add optional tags
4. Save instantly

#### Save Active File

1. Open the Command Palette (Ctrl+Shift+P)
2. Run "KB: Save Active File as Note"
3. Choose project and add optional tags
4. Save entire file as a note

#### View AI Sessions

1. Open Knowledge Vault sidebar
2. Click the history icon (clock) in the sidebar title
3. Browse recent AI-assisted development sessions
4. Click any session to view details

## Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| `KB: Open Chat` | - | Open the AI chat in the sidebar |
| `KB: Ask (Quick Input)` | `Ctrl+Shift+K` | Quick AI question from selected text |
| `KB: Save Selection as Note` | - | Save selected code as a note |
| `KB: Save Active File as Note` | - | Save current file as a note |
| `KB: Refresh Sidebar` | - | Refresh the sidebar content |
| `KB: View Recent AI Sessions` | - | Open AI session history viewer |

## Context Menu

The extension adds context menu items when you have text selected:

- **KB: Save Selection as Note**: Save selected text as a note
- **KB: Open Chat**: Open the AI chat sidebar

## Configuration

### Settings

Configure the extension in VS Code Settings (`Ctrl+,`):

| Setting | Description | Default |
|---------|-------------|---------|
| `knowledgeVault.apiUrl` | Your Knowledge Vault API URL | - |
| `knowledgeVault.apiKey` | Your API authentication key | - |
| `knowledgeVault.defaultProject` | Default project for saving notes | - |
| `knowledgeVault.autoSyncAiSessions` | Auto-sync local AI CLI sessions | `true` |
| `knowledgeVault.aiSessionPaths` | Paths to monitor for AI sessions | `["~/.claude/sessions", "~/.codex/sessions"]` |

### Environment Variables

You can also use environment variables:

- `KB_API_URL`: Knowledge Vault API URL
- `KB_API_KEY`: API authentication key
- `KB_DEFAULT_PROJECT`: Default project name

## Requirements

- VS Code 1.80.0 or higher
- Knowledge Vault instance (self-hosted or cloud)
- API credentials for your Knowledge Vault

## Supported AI Tools

The extension can automatically sync sessions from:

- **Claude Code**: AI-assisted development sessions
- **Codex CLI**: AI coding assistant sessions
- **Custom paths**: Any directory with session files

## Use Cases

### During Development

- Ask questions about your codebase without leaving your editor
- Save important code snippets with context
- Get AI help based on your team's collective knowledge

### Code Review

- Save reviewed code sections with notes
- Ask AI about similar patterns in your codebase
- Build a knowledge base of code decisions

### Documentation

- Save code examples directly from your editor
- Ask AI to explain complex code based on your docs
- Keep documentation in sync with actual implementation

### AI Session Archiving

- Automatically preserve AI-assisted development sessions
- Search and reference previous AI conversations
- Build a searchable history of AI interactions

## Troubleshooting

### Connection Issues

If you can't connect to your Knowledge Vault:

1. Check that your API URL is correct
2. Verify your API credentials
3. Ensure your Knowledge Vault instance is running
4. Check network connectivity and firewall settings

### Save Failures

If saving notes fails:

1. Verify you have write permissions for the project
2. Check that your API key has sufficient permissions
3. Ensure the file content is within size limits
4. Check the VS Code output panel for error details

### AI Session Sync Issues

If AI sessions aren't syncing:

1. Check that the session paths are correct
2. Verify file permissions for session directories
3. Enable debug logging in settings
4. Check the output panel for sync errors

## FAQ

**Q: Do I need a Knowledge Vault instance?**  
A: Yes, this extension requires a running Knowledge Vault instance. You can self-host or use a cloud instance.

**Q: Can I use multiple Knowledge Vault instances?**  
A: Currently, the extension connects to one instance at a time. You can switch instances in settings.

**Q: Is my code sent to external services?**  
A: Code is only sent to your configured Knowledge Vault instance. No external services are involved unless your Knowledge Vault uses external AI providers.

**Q: Can I work offline?**  
A: The extension requires an active connection to your Knowledge Vault instance. Some features may be limited offline.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## Links

- [Main Project Documentation](../../README.md)
- [CLI Documentation](../../cli/README.md)
- [Knowledge Vault Repository](https://github.com/pedroaugusto04/knowledge-base)
- [Report Issues](https://github.com/pedroaugusto04/knowledge-base/issues)