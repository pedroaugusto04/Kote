# Kote for VS Code

Integrate your Kote directly into VS Code — search, ask AI, save notes without leaving your editor.

## About Kote

**Kote** is a developer memory layer that automatically captures and organizes AI sessions, Git history, and development context into searchable knowledge.

For more details, visit the [GitHub Repository](https://github.com/pedroaugusto04/Kote) or the [original link](https://knowledgebase.sbs/kote).

[![Visual Studio Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue?logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=kote.kote-vscode)

## Features

- **CodeLens Integration**: Automatically displays relevant notes and decisions at the top of files that have associated knowledge in your Kote. Click the CodeLens indicator to view and open related notes directly in your editor.
- **Dedicated Sidebar**: Interactive AI chat and manual note saving
- **Quick AI Questions**: Ask questions without leaving your editor (Ctrl+Shift+K)
- **Save Code Selection**: Right-click any code selection to save as a note
- **Save Active File**: Save entire files directly to your Kote
- **AI Session History**: View and search recent AI-assisted development sessions
- **Real-time Sync**: Monitor and sync local AI CLI sessions automatically

## Screenshots

<p align="center">
  <img src="../../docs/screenshots/vscode-extension.png" alt="VS Code Extension" width="100%" style="max-height: 600px;">
  <br><em>Integrated sidebar with AI chat and quick-save commands for code selections.</em>
</p>

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Kote"
4. Click Install

### Manual Installation

1. Download the latest `.vsix` file from the [Releases](https://github.com/pedroaugusto04/kote/releases) page
2. Open VS Code
3. Run "Extensions: Install from VSIX..." from the Command Palette (Ctrl+Shift+P)
4. Select the downloaded file

## Getting Started

### 1. Configure Your Kote

After installation, you'll need to connect to your Kote instance:

1. Open the Kote sidebar (click the icon in the activity bar)
2. Enter your Kote URL
3. Provide your API credentials
4. Select your default workspace/project

### 2. Basic Usage

#### Ask AI Questions

**Keyboard Shortcut**: `Ctrl+Shift+K` (Windows/Linux) or `Cmd+Shift+K` (Mac)

1. Select text in your editor (optional)
2. Press `Ctrl+Shift+K`
3. Type your question
4. Get instant answers from your Kote

#### Save Code Selection

1. Select code in your editor
2. Right-click and choose "Kote: Save Selection as Note"
3. Choose project and add optional tags
4. Save instantly

#### Save Active File

1. Open the Command Palette (Ctrl+Shift+P)
2. Run "Kote: Save Active File as Note"
3. Choose project and add optional tags
4. Save entire file as a note

#### View AI Sessions

1. Open Kote sidebar
2. Click the history icon (clock) in the sidebar title
3. Browse recent AI-assisted development sessions
4. Click any session to view details

#### CodeLens - View Related Notes

When you open a file that has associated notes or decisions in your Kote, a CodeLens indicator appears at the top of the file:

1. Look for the CodeLens indicator (💡 Kote: X notes/decisions about this file) at the top of your editor
2. Click the CodeLens to see a quick pick list of related notes
3. Select a note to view it in a Markdown preview
4. The note preview includes metadata (source channel, project, creation date) and a link to open it in the Kote web application

> [!TIP]
> **CodeLens not working?** Make sure CodeLens is enabled in your VS Code settings (`"editor.codeLens": true`). It's enabled by default, but may have been disabled globally.

This feature helps you quickly access relevant context and decisions without leaving your editor.

## Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| `Kote: Open Chat` | - | Open the AI chat in the sidebar |
| `Kote: Ask (Quick Input)` | `Ctrl+Shift+K` | Quick AI question from selected text |
| `Kote: Save Selection as Note` | - | Save selected code as a note |
| `Kote: Save Active File as Note` | - | Save current file as a note |
| `Kote: Refresh Sidebar` | - | Refresh the sidebar content |
| `Kote: View Recent AI Sessions` | - | Open AI session history viewer |

## Context Menu

The extension adds context menu items when you have text selected:

- **Kote: Save Selection as Note**: Save selected text as a note
- **Kote: Open Chat**: Open the AI chat sidebar



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
- Build a Kote of code decisions

### Documentation

- Save code examples directly from your editor
- Ask AI to explain complex code based on your docs
- Keep documentation in sync with actual implementation

### AI Session Archiving

- Automatically preserve AI-assisted development sessions
- Search and reference previous AI conversations
- Build a searchable history of AI interactions

## Links

- [Main Project Documentation](../../blob/main/README.md)
- [CLI Documentation](../../blob/main/cli/README.md)
- [Kote Repository](https://github.com/pedroaugusto04/kote)

## License

See [LICENSE](../../blob/main/LICENSE) for terms of use.