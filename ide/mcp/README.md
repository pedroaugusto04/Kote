# Kote MCP Server

A Model Context Protocol (MCP) server for Kote, providing developer memory retrieval and persistence directly to AI assistants.

## About Kote

**Kote** is a developer memory layer that automatically captures and organizes AI sessions, Git history, and development context into searchable knowledge.

For more details, visit the [GitHub Repository](https://github.com/pedroaugusto04/Kote) or the [original link](https://knowledgebase.sbs/kote).

## Features

- **kote_search_notes**: Search developer notes, design decisions, and PR summaries using hybrid keyword and vector search. Optimized to return concise snippets to save context window tokens.
- **kote_get_note**: Fetch the full Markdown body of a specific note by ID.
- **kote_create_note**: Persistent saving of important development decisions or meeting notes straight into your Kote memory graph.

---

## Installation & Build

1. Install dependencies in the package folder:
   ```bash
   cd ide/mcp
   npm install
   ```

2. Compile the TypeScript files:
   ```bash
   npm run build
   ```
   *(Alternatively, you can compile from the workspace root folder using `npm run build:mcp`).*

---

## Configuration

The MCP server uses the Kote API connection and credentials. It will automatically detect authentication by looking for configuration files and environment fallbacks:

1. **CLI config (Recommended)**: It reads credentials from `~/.config/kote/config.json` (populated when logging in via `kote login`).
2. **Environment Variables**: You can override the endpoint and supply API tokens via:
   - `KB_API_URL`: Kote API base URL (defaults to `https://knowledgebase.sbs/kote/api`).
   - `KOTE_ACCESS_TOKEN`: The access token to authenticate requests.
   - `KOTE_SESSION_COOKIE`: Session cookies if needed.

---

## Client Integration

### 1. Cursor IDE
Open Cursor Settings -> **Features** -> **MCP**, and click **+ Add New MCP Server**:
- **Name**: `kote`
- **Type**: `stdio`
- **Command**: `node /absolute/path/to/knowledge-base/ide/mcp/dist/index.js`

### 2. Claude Desktop
Add the server configuration to your Claude Desktop config file (usually located at `~/.config/Claude/claude_desktop_config.json` on Linux/macOS):

```json
{
  "mcpServers": {
    "kote": {
      "command": "node",
      "args": [
        "/absolute/path/to/knowledge-base/ide/mcp/dist/index.js"
      ]
    }
  }
}
```

### 3. Antigravity & Codex

Add the server configuration block to your agent configuration settings (such as `mcp.json` or workspace configurations):

```json
{
  "mcpServers": {
    "kote": {
      "command": "node",
      "args": [
        "/absolute/path/to/knowledge-base/ide/mcp/dist/index.js"
      ]
    }
  }
}
```

Alternatively, if you run them globally, you can invoke the server using `npx`:

```json
{
  "mcpServers": {
    "kote": {
      "command": "npx",
      "args": [
        "-y",
        "@pedroaugusto04/kote-mcp"
      ]
    }
  }
}
```
