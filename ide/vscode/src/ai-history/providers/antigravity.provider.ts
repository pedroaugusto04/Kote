import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { AiHistoryProvider, AiSession, AiTurn } from '../types';
import { collapseWhitespace } from '../../utils/text.js';
import { watchRecursive } from '../../utils/watcher.js';

const ANTIGRAVITY_LOG_FILES = ['transcript_full.jsonl', 'transcript.jsonl'] as const;
const USER_REQUEST_REGEX = /<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/;

export class AntigravityHistoryProvider implements AiHistoryProvider {
  readonly id = 'antigravity';
  readonly name = 'Antigravity';

  private getHistoryDirs(): string[] {
    const configPath = vscode.workspace.getConfiguration('kb').get<string>('antigravityLogPath');
    if (configPath) return [configPath];

    return [
      path.join(os.homedir(), '.gemini', 'antigravity-cli', 'brain'),
      path.join(os.homedir(), '.gemini', 'antigravity-ide', 'brain'),
    ];
  }

  private getLogFilePath(folderPath: string): string | null {
    for (const file of ANTIGRAVITY_LOG_FILES) {
      const p = path.join(folderPath, '.system_generated', 'logs', file);
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  async isEnabled(): Promise<boolean> {
    try {
      return this.getHistoryDirs().some(dir => fs.existsSync(dir));
    } catch {
      return false;
    }
  }

  async getRecentSessions(limit?: number): Promise<AiSession[]> {
    const candidateDirs = this.getHistoryDirs().filter(d => fs.existsSync(d));
    if (candidateDirs.length === 0) return [];

    const sessions: AiSession[] = [];
    const seenSessionIds = new Set<string>();
    const allFolderStats: { folder: string; folderPath: string; isDirectory: boolean; mtime: number }[] = [];

    try {
      for (const dir of candidateDirs) {
        const folders = fs.readdirSync(dir);
        for (const folder of folders) {
          if (seenSessionIds.has(folder)) continue;
          const folderPath = path.join(dir, folder);
          try {
            const stat = fs.statSync(folderPath);
            if (stat.isDirectory() && this.getLogFilePath(folderPath) !== null) {
              allFolderStats.push({ folder, folderPath, isDirectory: true, mtime: stat.mtimeMs });
              seenSessionIds.add(folder);
            }
          } catch {
            // ignore
          }
        }
      }

      // Sort folders by mtime descending
      allFolderStats.sort((a, b) => b.mtime - a.mtime);

      const count = limit !== undefined ? limit : 20;
      const recentFolders = allFolderStats.slice(0, count);

      for (const f of recentFolders) {
        const logFilePath = this.getLogFilePath(f.folderPath);
        if (logFilePath) {
          const session = this.parseFile(logFilePath, f.folder);
          if (session) {
            sessions.push(session);
          }
        }
      }
    } catch (err) {
      console.error('Failed to read recent Antigravity sessions:', err);
    }
    return sessions;
  }

  watchSessions(callback: (session: AiSession) => void): vscode.Disposable {
    const candidateDirs = this.getHistoryDirs().filter(d => fs.existsSync(d));
    const timeouts = new Map<string, NodeJS.Timeout>();

    const handleFile = (fsPath: string) => {
      if (timeouts.has(fsPath)) {
        clearTimeout(timeouts.get(fsPath)!);
      }

      const timeout = setTimeout(() => {
        timeouts.delete(fsPath);
        
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

    const watchers = candidateDirs.map(historyDir =>
      watchRecursive(
        historyDir,
        (fileName) => fileName === 'transcript_full.jsonl' || fileName === 'transcript.jsonl',
        (filePath) => handleFile(filePath)
      )
    );

    return new vscode.Disposable(() => {
      for (const t of timeouts.values()) {
        clearTimeout(t);
      }
      for (const watcher of watchers) {
        watcher.dispose();
      }
    });
  }

  private cleanContent(raw: string): string {
    return raw
      .replace(/<ADDITIONAL_METADATA>[\s\S]*?(<\/ADDITIONAL_METADATA>|$)/gi, '')
      .replace(/<USER_SETTINGS_CHANGE>[\s\S]*?(<\/USER_SETTINGS_CHANGE>|$)/gi, '')
      .replace(/<EPHEMERAL_MESSAGE>[\s\S]*?(<\/EPHEMERAL_MESSAGE>|$)/gi, '')
      .replace(/<SYSTEM_MESSAGE>[\s\S]*?(<\/SYSTEM_MESSAGE>|$)/gi, '')
      .replace(/<thought>[\s\S]*?(<\/thought>|$)/gi, '')
      .replace(/<truncated \d+ bytes?>/gi, '\n…')
      .trim();
  }

  private parseRecord(record: any): AiTurn | null {
    if (record.source === 'USER_EXPLICIT' && record.type === 'USER_INPUT') {
      const rawContent = record.content || '';
      const match = rawContent.match(USER_REQUEST_REGEX);
      const text = match ? match[1] : rawContent.replace(/^<USER_REQUEST>\s*/i, '');
      const cleaned = this.cleanContent(text);
      if (cleaned) {
        return { role: 'user', content: cleaned };
      }
    }

    if (record.source === 'MODEL' && (record.type === 'PLANNER_RESPONSE' || record.type === 'MODEL_RESPONSE')) {
      const cleaned = this.cleanContent(record.content || '');
      if (cleaned) {
        return { role: 'assistant', content: cleaned };
      }
    }

    return null;
  }

  private parseFile(filePath: string, sessionId: string): AiSession | null {
    try {
      if (!fs.existsSync(filePath)) return null;
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      
      const turns: AiTurn[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const record = JSON.parse(trimmed);
          const turn = this.parseRecord(record);
          if (turn) {
            turns.push(turn);
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

      const folderPath = path.dirname(path.dirname(path.dirname(filePath)));
      const attachments: Array<{ fileName: string; mimeType: string; sizeBytes: number; dataBase64: string }> = [];
      try {
        if (fs.existsSync(folderPath)) {
          const files = fs.readdirSync(folderPath);
          for (const file of files) {
            if (file.endsWith('.md')) {
              const fullFilePath = path.join(folderPath, file);
              const fileStat = fs.statSync(fullFilePath);
              if (fileStat.isFile()) {
                const fileContent = fs.readFileSync(fullFilePath);
                attachments.push({
                  fileName: file,
                  mimeType: 'text/markdown',
                  sizeBytes: fileStat.size,
                  dataBase64: fileContent.toString('base64'),
                });
              }
            }
          }
        }
      } catch (err) {
        // ignore errors
      }

      return {
        providerId: this.id,
        sessionId,
        title,
        turns,
        timestamp: fs.statSync(filePath).mtimeMs,
        attachments,
      };
    } catch (err) {
      console.error(`Failed to parse Antigravity file ${filePath}:`, err);
      return null;
    }
  }
}
