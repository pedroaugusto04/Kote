import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { AiHistoryProvider, AiSession, AiTurn } from '../types';

export class ClaudeCodeHistoryProvider implements AiHistoryProvider {
  readonly id = 'claude-code';
  readonly name = 'Claude Code';

  private getHistoryDir(): string {
    return path.join(os.homedir(), '.claude', 'projects');
  }

  async isEnabled(): Promise<boolean> {
    try {
      return fs.existsSync(this.getHistoryDir());
    } catch {
      return false;
    }
  }

  async getRecentSessions(): Promise<AiSession[]> {
    const dir = this.getHistoryDir();
    if (!fs.existsSync(dir)) return [];

    const sessions: AiSession[] = [];
    try {
      const projects = fs.readdirSync(dir);
      for (const project of projects) {
        const projectPath = path.join(dir, project);
        if (!fs.statSync(projectPath).isDirectory()) continue;

        const files = fs.readdirSync(projectPath);
        for (const file of files) {
          if (file.endsWith('.jsonl')) {
            const filePath = path.join(projectPath, file);
            const session = this.parseFile(filePath);
            if (session) sessions.push(session);
          }
        }
      }
    } catch (err) {
      console.error('Failed to read recent Claude Code sessions:', err);
    }
    return sessions;
  }

  watchSessions(callback: (session: AiSession) => void): vscode.Disposable {
    const historyDir = this.getHistoryDir();
    
    // Watch recursively for all jsonl files in projects subdirectories
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(historyDir, '**/*.jsonl')
    );

    const handleFile = (uri: vscode.Uri) => {
      const session = this.parseFile(uri.fsPath);
      if (session) {
        callback(session);
      }
    };

    watcher.onDidChange(handleFile);
    watcher.onDidCreate(handleFile);

    return watcher;
  }

  private parseFile(filePath: string): AiSession | null {
    try {
      if (!fs.existsSync(filePath)) return null;
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      
      const turns: AiTurn[] = [];
      let lastPrompt = '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line);
          const role = record.role || (record.type === 'prompt' ? 'user' : record.type === 'response' ? 'assistant' : null);
          const text = record.content || record.text || '';

          if (role === 'user') {
            turns.push({ role: 'user', content: text });
            lastPrompt = text;
          } else if (role === 'assistant') {
            turns.push({ role: 'assistant', content: text });
          }
        } catch {
          // ignore malformed JSON lines
        }
      }

      if (turns.length === 0) return null;

      const title = lastPrompt ? `Claude Code: ${lastPrompt.slice(0, 50)}...` : 'Claude Code Session';

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
