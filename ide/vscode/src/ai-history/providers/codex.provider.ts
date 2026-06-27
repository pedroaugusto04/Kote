import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { AiHistoryProvider, AiSession, AiTurn } from '../types';
import { collapseWhitespace } from '../../utils/text.js';
import { watchRecursive } from '../../utils/watcher.js';

export class CodexHistoryProvider implements AiHistoryProvider {
  readonly id = 'codex-cli';
  readonly name = 'Codex CLI';

  private getHistoryDir(): string {
    const configPath = vscode.workspace.getConfiguration('kb').get<string>('codexLogPath');
    return configPath || path.join(os.homedir(), '.codex', 'sessions');
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
      const allFiles = this.getAllFiles(dir);
      
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
        if (filePath.endsWith('.json') || filePath.endsWith('.jsonl')) {
          const session = this.parseFile(filePath);
          if (session) sessions.push(session);
        }
      }
    } catch (err) {
      console.error('Failed to read recent Codex sessions:', err);
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
      (fileName) => fileName.endsWith('.json') || fileName.endsWith('.jsonl'),
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
      const content = fs.readFileSync(filePath, 'utf-8').trim();
      if (!content) return null;

      const turns: AiTurn[] = [];

      if (filePath.endsWith('.jsonl')) {
        const lines = content.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const record = JSON.parse(line);
            
            // Handle response_item message types (newer codex output)
            if (record.type === 'response_item' && record.payload) {
              const payload = record.payload;
              if (payload.type === 'message') {
                const role = payload.role;
                if (role === 'user' || role === 'assistant') {
                  const contentArray = payload.content || [];
                  let textContent = '';
                  for (const block of contentArray) {
                    if (block.text) {
                      const txt = block.text.trim();
                      // Filter out developer instructions / system files to keep notes clean
                      if (txt.startsWith('<environment_context>') || 
                          txt.startsWith('# AGENTS.md instructions') || 
                          txt.includes('<permissions instructions>') ||
                          txt.includes('<skills_instructions>') ||
                          txt.includes('<apps_instructions>')) {
                        continue;
                      }
                      if (txt) {
                        if (textContent) textContent += '\n\n';
                        textContent += txt;
                      }
                    }
                  }
                  
                  if (textContent) {
                    if (role === 'user') {
                      turns.push({ role: 'user', content: textContent });
                    } else {
                      turns.push({ role: 'assistant', content: textContent });
                    }
                  }
                }
              }
            } else {
              // Fallback for older flat log formats (or other record types)
              const role = record.role || (record.type === 'prompt' ? 'user' : record.type === 'response' ? 'assistant' : null);
              const text = record.content || record.text || '';
              if (role === 'user' && text) {
                turns.push({ role: 'user', content: text });
              } else if (role === 'assistant' && text) {
                turns.push({ role: 'assistant', content: text });
              }
            }
          } catch {}
        }
      } else {
        const data = JSON.parse(content);
        const messages = data.messages || data.turns || [];
        for (const msg of messages) {
          const role = msg.role || (msg.type === 'prompt' ? 'user' : 'assistant');
          const text = msg.content || msg.text || '';
          if (role === 'user') {
            turns.push({ role: 'user', content: text });
          } else {
            turns.push({ role: 'assistant', content: text });
          }
        }
      }

      if (turns.length === 0) return null;

      let title = 'Codex Session';
      const firstUserTurn = turns.find(t => t.role === 'user');
      if (firstUserTurn && firstUserTurn.content) {
        const cleanPrompt = collapseWhitespace(firstUserTurn.content);
        if (cleanPrompt) {
          title = `Codex: ${cleanPrompt.slice(0, 60)}${cleanPrompt.length > 60 ? '...' : ''}`;
        }
      }

      return {
        providerId: this.id,
        sessionId: path.basename(filePath),
        title,
        turns,
        timestamp: fs.statSync(filePath).mtimeMs,
      };
    } catch (err) {
      console.error(`Failed to parse Codex file ${filePath}:`, err);
      return null;
    }
  }
}
