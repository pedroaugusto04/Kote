import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { AiHistoryProvider, AiSession, AiTurn } from '../types';
import { collapseWhitespace } from '../../utils/text.js';
import { watchRecursive } from '../../utils/watcher.js';

export class AntigravityHistoryProvider implements AiHistoryProvider {
  readonly id = 'antigravity';
  readonly name = 'Antigravity';

  private getHistoryDir(): string {
    const configPath = vscode.workspace.getConfiguration('kb').get<string>('antigravityLogPath');
    return configPath || path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
  }

  async isEnabled(): Promise<boolean> {
    try {
      return fs.existsSync(this.getHistoryDir());
    } catch {
      return false;
    }
  }

  async getRecentSessions(limit?: number): Promise<AiSession[]> {
    const dir = this.getHistoryDir();
    if (!fs.existsSync(dir)) return [];

    const sessions: AiSession[] = [];
    try {
      const folders = fs.readdirSync(dir);
      const folderStats = folders.map(folder => {
        const folderPath = path.join(dir, folder);
        try {
          const stat = fs.statSync(folderPath);
          return { folder, folderPath, isDirectory: stat.isDirectory(), mtime: stat.mtimeMs };
        } catch {
          return { folder, folderPath, isDirectory: false, mtime: 0 };
        }
      }).filter(x => {
        if (!x.isDirectory) return false;
        const logFilePath = path.join(x.folderPath, '.system_generated', 'logs', 'overview.txt');
        return fs.existsSync(logFilePath);
      });

      // Sort folders by mtime descending
      folderStats.sort((a, b) => b.mtime - a.mtime);

      const count = limit !== undefined ? limit : 20;
      const recentFolders = folderStats.slice(0, count);

      for (const f of recentFolders) {
        const logFilePath = path.join(f.folderPath, '.system_generated', 'logs', 'overview.txt');
        const session = this.parseFile(logFilePath, f.folder);
        if (session) {
          sessions.push(session);
        }
      }
    } catch (err) {
      console.error('Failed to read recent Antigravity sessions:', err);
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
        
        // Extract conversation ID from the path: .../brain/<conversation-id>/.system_generated/logs/overview.txt
        const parts = fsPath.split(path.sep);
        const brainIdx = parts.lastIndexOf('brain');
        const sessionId = brainIdx !== -1 && parts[brainIdx + 1] ? parts[brainIdx + 1] : path.basename(path.dirname(path.dirname(path.dirname(fsPath))));
        
        const session = this.parseFile(fsPath, sessionId);
        if (session) {
          callback(session);
        }
      }, 500); // 500ms debounce

      timeouts.set(fsPath, timeout);
    };

    const watcher = watchRecursive(
      historyDir,
      (fileName) => fileName === 'overview.txt',
      (filePath) => handleFile(filePath)
    );

    return new vscode.Disposable(() => {
      for (const t of timeouts.values()) {
        clearTimeout(t);
      }
      watcher.dispose();
    });
  }

  private parseFile(filePath: string, sessionId: string): AiSession | null {
    try {
      if (!fs.existsSync(filePath)) return null;
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      
      const turns: AiTurn[] = [];
      const sessionDir = path.join(path.dirname(filePath), '..', '..');
      const MAX_CONTENT_SIZE = 400000; // Stay under 500k limit with room for metadata

      // Read markdown artifacts from the session directory (these are the complete AI outputs)
      const artifacts: string[] = [];
      let totalSize = 0;
      
      if (fs.existsSync(sessionDir)) {
        const mdFiles = fs.readdirSync(sessionDir)
          .filter(f => f.endsWith('.md') && !f.startsWith('.'))
          .filter(f => !f.includes('.resolved') && !f.includes('.metadata'))
          .sort();
        
        for (const mdFile of mdFiles) {
          const mdPath = path.join(sessionDir, mdFile);
          try {
            const mdContent = fs.readFileSync(mdPath, 'utf-8');
            if (totalSize + mdContent.length > MAX_CONTENT_SIZE) {
              artifacts.push('\n\n[Some artifacts omitted due to size limit]');
              break;
            }
            artifacts.push(`## ${mdFile}\n\n${mdContent}`);
            totalSize += mdContent.length;
          } catch {
            // ignore read errors
          }
        }
      }

      // Also check for artifacts subdirectory (some sessions store artifacts there)
      const artifactsDir = path.join(sessionDir, 'artifacts');
      if (fs.existsSync(artifactsDir)) {
        const mdFiles = fs.readdirSync(artifactsDir)
          .filter(f => f.endsWith('.md') && !f.startsWith('.'))
          .filter(f => !f.includes('.resolved') && !f.includes('.metadata'))
          .sort();
        
        for (const mdFile of mdFiles) {
          const mdPath = path.join(artifactsDir, mdFile);
          try {
            const mdContent = fs.readFileSync(mdPath, 'utf-8');
            if (totalSize + mdContent.length > MAX_CONTENT_SIZE) {
              artifacts.push('\n\n[Some artifacts omitted due to size limit]');
              break;
            }
            artifacts.push(`## artifacts/${mdFile}\n\n${mdContent}`);
            totalSize += mdContent.length;
          } catch {
            // ignore read errors
          }
        }
      }

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line);
          
          if (record.source === 'USER_EXPLICIT' && record.type === 'USER_INPUT') {
            const rawContent = record.content || '';
            const userRequestRegex = /<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/;
            const match = rawContent.match(userRequestRegex);
            const text = match ? match[1].trim() : rawContent.trim();
            if (text) {
              turns.push({ role: 'user', content: text });
            }
          } else if (record.source === 'MODEL' && record.type === 'PLANNER_RESPONSE') {
            const text = record.content || '';
            const hasToolCalls = Array.isArray(record.tool_calls) && record.tool_calls.length > 0;
            
            // If there are tool calls and we have artifacts, use the artifacts as the response
            if (hasToolCalls && artifacts.length > 0) {
              const fullContent = artifacts.join('\n\n---\n\n');
              turns.push({ role: 'assistant', content: fullContent.trim() });
              // Clear artifacts so we don't add them multiple times
              artifacts.length = 0;
            } else if (!hasToolCalls && text) {
              // Only include direct responses without tool calls
              turns.push({ role: 'assistant', content: text.trim() });
            }
            // Skip tool calls without artifacts or empty responses
          }
        } catch {
          // ignore malformed JSON lines
        }
      }

      if (turns.length === 0) return null;

      let title = 'Antigravity Session';
      const firstUserTurn = turns.find(t => t.role === 'user');
      if (firstUserTurn && firstUserTurn.content) {
        const cleanPrompt = collapseWhitespace(firstUserTurn.content);
        if (cleanPrompt) {
          title = `Antigravity: ${cleanPrompt.slice(0, 60)}${cleanPrompt.length > 60 ? '...' : ''}`;
        }
      }

      return {
        providerId: this.id,
        sessionId,
        title,
        turns,
        timestamp: fs.statSync(filePath).mtimeMs,
      };
    } catch (err) {
      console.error(`Failed to parse Antigravity file ${filePath}:`, err);
      return null;
    }
  }
}
