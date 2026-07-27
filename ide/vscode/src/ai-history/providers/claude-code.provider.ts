import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { AiHistoryProvider, AiSession, AiTurn } from '../types';
import { collapseWhitespace } from '../../utils/text.js';
import { watchRecursive } from '../../utils/watcher.js';

export class ClaudeCodeHistoryProvider implements AiHistoryProvider {
  readonly id = 'claude-code';
  readonly name = 'Claude Code';

  private getHistoryDir(): string {
    const configPath = vscode.workspace.getConfiguration('kb').get<string>('claudeCodeLogPath');
    return configPath || path.join(os.homedir(), '.claude');
  }

  async isEnabled(): Promise<boolean> {
    try {
      return fs.existsSync(this.getHistoryDir());
    } catch {
      return false;
    }
  }

  private getAllFiles(dir: string): string[] {
    let results: string[] = [];
    try {
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
          results = results.concat(this.getAllFiles(filePath));
        } else {
          results.push(filePath);
        }
      }
    } catch (err) {
      // Ignore errors reading directories
    }
    return results;
  }

  async getRecentSessions(limit?: number): Promise<AiSession[]> {
    const dir = this.getHistoryDir();
    if (!fs.existsSync(dir)) return [];

    const sessions: AiSession[] = [];
    try {
      const allFiles = this.getAllFiles(dir).filter(filePath => filePath.endsWith('.jsonl'));
      
      // Sort files by mtimeMs descending
      const fileStats = allFiles.map(filePath => {
        try {
          return { filePath, mtime: fs.statSync(filePath).mtimeMs };
        } catch {
          return { filePath, mtime: 0 };
        }
      });
      fileStats.sort((a, b) => b.mtime - a.mtime);

      const count = limit !== undefined ? limit : 20;
      const recentFiles = fileStats.slice(0, count).map(x => x.filePath);

      for (const filePath of recentFiles) {
        const session = this.parseFile(filePath);
        if (session) sessions.push(session);
      }
    } catch (err) {
      console.error('Failed to read recent Claude Code sessions:', err);
    }
    return sessions;
  }

  watchSessions(callback: (session: AiSession) => void): vscode.Disposable {
    const historyDir = this.getHistoryDir();
    const timeouts = new Map<string, NodeJS.Timeout>();

    const handleFile = (fsPath: string) => {
      if (timeouts.has(fsPath)) {
        clearTimeout(timeouts.get(fsPath)!);
      }

      const timeout = setTimeout(() => {
        timeouts.delete(fsPath);
        const session = this.parseFile(fsPath);
        if (session) {
          callback(session);
        }
      }, 500); // 500ms debounce

      timeouts.set(fsPath, timeout);
    };

    const watcher = watchRecursive(
      historyDir,
      (fileName) => fileName.endsWith('.jsonl'),
      (filePath) => handleFile(filePath)
    );

    return new vscode.Disposable(() => {
      for (const t of timeouts.values()) {
        clearTimeout(t);
      }
      watcher.dispose();
    });
  }

  private parseFile(filePath: string): AiSession | null {
    try {
      if (!fs.existsSync(filePath)) return null;
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      
      const turns: AiTurn[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line);
          const role = record.role || (record.type === 'prompt' ? 'user' : record.type === 'response' ? 'assistant' : null);
          if (role !== 'user' && role !== 'assistant') continue;

          // content can be a plain string or an array of content blocks (Anthropic Messages API)
          let text = '';
          const rawContent = record.content || record.text;
          if (typeof rawContent === 'string') {
            text = rawContent;
          } else if (Array.isArray(rawContent)) {
            // Extract text from content blocks, skip tool_use/tool_result
            const textParts: string[] = [];
            for (const block of rawContent) {
              if (block.type === 'text' && block.text) {
                textParts.push(block.text);
              }
            }
            text = textParts.join('\n\n');
          }

          text = text.trim();
          if (text) {
            turns.push({ role, content: text });
          }
        } catch {
          // ignore malformed JSON lines
        }
      }

      if (turns.length === 0) return null;

      let title = 'Claude Session';
      const firstUserTurn = turns.find(t => t.role === 'user');
      if (firstUserTurn && firstUserTurn.content) {
        const cleanPrompt = collapseWhitespace(firstUserTurn.content);
        if (cleanPrompt) {
          title = `Claude: ${cleanPrompt.slice(0, 60)}${cleanPrompt.length > 60 ? '...' : ''}`;
        }
      }

      // Detect project slug from parent directory name
      const parentDir = path.basename(path.dirname(filePath));

      return {
        providerId: this.id,
        sessionId: path.basename(filePath, '.jsonl'),
        title,
        turns,
        timestamp: fs.statSync(filePath).mtimeMs,
        projectSlug: parentDir ? parentDir.toLowerCase().replace(/[^a-z0-9-]/g, '-') : undefined,
      };
    } catch (err) {
      console.error(`Failed to parse Claude Code file ${filePath}:`, err);
      return null;
    }
  }
}
