import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { AiHistoryProvider, AiSession, AiTurn } from '../types';
import { watchFile } from '../../utils/watcher.js';

export class OpenCodeHistoryProvider implements AiHistoryProvider {
  readonly id = 'open-code';
  readonly name = 'OpenCode';

  private getDbPath(): string {
    const configPath = vscode.workspace.getConfiguration('kb').get<string>('opencodeDbPath');
    if (configPath) return configPath;

    const standardPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
    if (fs.existsSync(standardPath)) {
      return standardPath;
    }
    const prodPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode-prod.db');
    if (fs.existsSync(prodPath)) {
      return prodPath;
    }
    return standardPath;
  }

  async isEnabled(): Promise<boolean> {
    try {
      const dbPath = this.getDbPath();
      if (!fs.existsSync(dbPath)) return false;
      
      // Test if we can load node:sqlite dynamically
      const sqlite = await import('node:sqlite');
      return !!sqlite.DatabaseSync;
    } catch {
      return false;
    }
  }

  async getRecentSessions(limit?: number): Promise<AiSession[]> {
    const dbPath = this.getDbPath();
    if (!fs.existsSync(dbPath)) return [];

    try {
      const sqlite = await import('node:sqlite');
      const db = new sqlite.DatabaseSync(dbPath, { readOnly: true });

      const limitCount = limit !== undefined ? Math.floor(limit) : 20;
      const query = `
        SELECT 
          s.id as sessionId,
          s.title,
          s.time_updated as timestamp,
          s.slug as projectSlug,
          m.id as messageId,
          m.data as messageData,
          p.data as partData
        FROM (
          SELECT * FROM session ORDER BY time_updated DESC LIMIT ${limitCount}
        ) s
        JOIN message m ON m.session_id = s.id
        LEFT JOIN part p ON p.message_id = m.id
        ORDER BY s.time_updated DESC, m.time_created ASC, p.time_created ASC
      `;

      interface OpenCodeRow {
        sessionId: string;
        title?: string;
        timestamp: string | number;
        projectSlug?: string;
        messageId?: string;
        messageData?: string;
        partData?: string;
      }

      const rows = db.prepare(query).all() as unknown as OpenCodeRow[];
      db.close();

      const sessionsMap = new Map<string, {
        session: AiSession;
        messagesMap: Map<string, { role: 'user' | 'assistant'; textParts: string[] }>;
      }>();

      for (const row of rows) {
        const { sessionId, title, timestamp, projectSlug, messageId, messageData, partData } = row;
        
        let entry = sessionsMap.get(sessionId);
        if (!entry) {
          entry = {
            session: {
              providerId: this.id,
              sessionId,
              title: title || 'OpenCode Session',
              turns: [],
              timestamp: Number(timestamp),
              projectSlug: projectSlug || undefined,
            },
            messagesMap: new Map(),
          };
          sessionsMap.set(sessionId, entry);
        }

        if (messageId && messageData) {
          let msgRole: 'user' | 'assistant' | null = null;
          try {
            const mData = JSON.parse(messageData);
            if (mData.role === 'user') msgRole = 'user';
            else if (mData.role === 'assistant') msgRole = 'assistant';
          } catch {}

          if (msgRole) {
            let msgEntry = entry.messagesMap.get(messageId);
            if (!msgEntry) {
              msgEntry = { role: msgRole, textParts: [] };
              entry.messagesMap.set(messageId, msgEntry);
            }

            if (partData) {
              try {
                const pData = JSON.parse(partData);
                if (pData.type === 'text' && pData.text) {
                  msgEntry.textParts.push(pData.text);
                }
              } catch {}
            }
          }
        }
      }

      const sessions: AiSession[] = [];
      for (const entry of sessionsMap.values()) {
        const turns: AiTurn[] = [];
        for (const msgEntry of entry.messagesMap.values()) {
          const content = msgEntry.textParts.join('\n\n').trim();
          if (content) {
            turns.push({ role: msgEntry.role, content });
          }
        }
        if (turns.length > 0) {
          entry.session.turns = turns;
          sessions.push(entry.session);
        }
      }

      return sessions;
    } catch (err) {
      console.error('Failed to read OpenCode sessions:', err);
      return [];
    }
  }

  watchSessions(callback: (session: AiSession) => void): vscode.Disposable {
    const dbPath = this.getDbPath();
    const timeouts = new Map<string, NodeJS.Timeout>();

    const handleFile = async () => {
      if (timeouts.has(dbPath)) {
        clearTimeout(timeouts.get(dbPath)!);
      }

      const timeout = setTimeout(async () => {
        timeouts.delete(dbPath);
        const sessions = await this.getRecentSessions();
        if (sessions && sessions.length > 0) {
          callback(sessions[0]);
        }
      }, 1000); // 1s debounce to wait for write transaction to complete

      timeouts.set(dbPath, timeout);
    };

    const watcher = watchFile(dbPath, handleFile);

    return new vscode.Disposable(() => {
      for (const t of timeouts.values()) {
        clearTimeout(t);
      }
      watcher.dispose();
    });
  }
}
