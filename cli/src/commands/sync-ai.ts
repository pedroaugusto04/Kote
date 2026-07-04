import pc from 'picocolors';
import * as clackPrompts from '@clack/prompts';
import { client, ApiClientError } from '../client.js';
import { loadConfig } from '../config.js';
import { collapseWhitespace } from '../utils/text.js';

export const clack = {
  select: clackPrompts.select,
  isCancel: clackPrompts.isCancel,
  spinner: clackPrompts.spinner,
};
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const USER_REQUEST_REGEX = /<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/;

interface CliAiTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface CliAiSession {
  providerId: string;
  providerName: string;
  sessionId: string;
  title: string;
  turns: CliAiTurn[];
  timestamp: number;
  projectSlug?: string;
}

function getAllFiles(dir: string): string[] {
  let results: string[] = [];
  try {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        results = results.concat(getAllFiles(filePath));
      } else {
        results.push(filePath);
      }
    }
  } catch {
    // Ignore errors
  }
  return results;
}

// -------------------------------------------------------------------------
// Provider Ingestion Functions
// -------------------------------------------------------------------------

function getClaudeCodeSessions(): CliAiSession[] {
  const config = loadConfig();
  const dir = config.aiProviders?.claudeCodeLogPath || path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(dir)) return [];

  const sessions: CliAiSession[] = [];
  try {
    const allFiles = getAllFiles(dir);
    for (const filePath of allFiles) {
      if (filePath.endsWith('.jsonl')) {
        const session = parseClaudeFile(filePath);
        if (session) sessions.push(session);
      }
    }
  } catch (err) {
    // Ignore
  }
  return sessions;
}

function parseClaudeFile(filePath: string): CliAiSession | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    const turns: CliAiTurn[] = [];

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
      } catch {}
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

    const parentDir = path.basename(path.dirname(filePath));

    return {
      providerId: 'claude-code',
      providerName: 'Claude Code',
      sessionId: path.basename(filePath, '.jsonl'),
      title,
      turns,
      timestamp: fs.statSync(filePath).mtimeMs,
      projectSlug: parentDir ? parentDir.toLowerCase().replace(/[^a-z0-9-]/g, '-') : undefined,
    };
  } catch {
    return null;
  }
}

function getCodexSessions(): CliAiSession[] {
  const config = loadConfig();
  const dir = config.aiProviders?.codexLogPath || path.join(os.homedir(), '.codex', 'sessions');
  if (!fs.existsSync(dir)) return [];

  const sessions: CliAiSession[] = [];
  try {
    const allFiles = getAllFiles(dir);
    for (const filePath of allFiles) {
      if (filePath.endsWith('.json') || filePath.endsWith('.jsonl')) {
        const session = parseCodexFile(filePath);
        if (session) sessions.push(session);
      }
    }
  } catch {}
  return sessions;
}

function parseCodexFile(filePath: string): CliAiSession | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    if (!content) return null;
    const turns: CliAiTurn[] = [];

    if (filePath.endsWith('.jsonl')) {
      const lines = content.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line);
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
                  turns.push({ role: role === 'user' ? 'user' : 'assistant', content: textContent });
                }
              }
            }
          } else {
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
        if (role === 'user' && text) {
          turns.push({ role: 'user', content: text });
        } else if (text) {
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
      providerId: 'codex-cli',
      providerName: 'Codex CLI',
      sessionId: path.basename(filePath),
      title,
      turns,
      timestamp: fs.statSync(filePath).mtimeMs,
    };
  } catch {
    return null;
  }
}

function getAntigravitySessions(): CliAiSession[] {
  const config = loadConfig();
  let dir = config.aiProviders?.antigravityLogPath;
  if (!dir) {
    const idePath = path.join(os.homedir(), '.gemini', 'antigravity-ide', 'brain');
    if (fs.existsSync(idePath)) {
      dir = idePath;
    } else {
      dir = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
    }
  }

  if (!fs.existsSync(dir)) return [];

  const sessions: CliAiSession[] = [];
  try {
    const folders = fs.readdirSync(dir);
    const logFiles = ['transcript.jsonl', 'transcript_full.jsonl', 'overview.txt'];
    for (const folder of folders) {
      const folderPath = path.join(dir, folder);
      const stat = fs.statSync(folderPath);
      if (stat.isDirectory()) {
        let logFilePath: string | null = null;
        for (const file of logFiles) {
          const p = path.join(folderPath, '.system_generated', 'logs', file);
          if (fs.existsSync(p)) {
            logFilePath = p;
            break;
          }
        }
        if (logFilePath) {
          const session = parseAntigravityFile(logFilePath, folder);
          if (session) sessions.push(session);
        }
      }
    }
  } catch {}
  return sessions;
}

/**
 * Cleans Antigravity overview.txt content by stripping system metadata tags and
 * replacing truncation markers with a clean continuation indicator.
 *
 * overview.txt truncates individual records at ~1000 bytes. The full conversation
 * is stored in encrypted .pb files that we cannot read, so we must gracefully
 * handle the truncation by cleaning up the markers.
 */
function cleanAntigravityContent(raw: string): string {
  return raw
    // Strip system metadata XML blocks (opening and closing tags + content between)
    .replace(/<ADDITIONAL_METADATA>[\s\S]*?(<\/ADDITIONAL_METADATA>|$)/gi, '')
    .replace(/<USER_SETTINGS_CHANGE>[\s\S]*?(<\/USER_SETTINGS_CHANGE>|$)/gi, '')
    .replace(/<EPHEMERAL_MESSAGE>[\s\S]*?(<\/EPHEMERAL_MESSAGE>|$)/gi, '')
    // Replace Antigravity truncation marker with clean ellipsis
    .replace(/<truncated \d+ bytes?>/gi, '\n…')
    .trim();
}

function parseAntigravityRecord(record: any): CliAiTurn | null {
  if (record.source === 'USER_EXPLICIT' && record.type === 'USER_INPUT') {
    const rawContent = record.content || '';
    const match = rawContent.match(USER_REQUEST_REGEX);
    const text = match ? match[1] : rawContent.replace(/^<USER_REQUEST>\s*/i, '');
    const cleaned = cleanAntigravityContent(text);
    if (cleaned) {
      return { role: 'user', content: cleaned };
    }
  }

  if (record.source === 'MODEL' && record.type === 'PLANNER_RESPONSE') {
    const hasToolCalls = Array.isArray(record.tool_calls) && record.tool_calls.length > 0;
    if (!hasToolCalls) {
      const cleaned = cleanAntigravityContent(record.content || '');
      if (cleaned) {
        return { role: 'assistant', content: cleaned };
      }
    }
  }

  return null;
}

function parseAntigravityFile(filePath: string, sessionId: string): CliAiSession | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    const turns: CliAiTurn[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const record = JSON.parse(trimmed);
        const turn = parseAntigravityRecord(record);
        if (turn) {
          turns.push(turn);
        }
      } catch {}
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
      providerId: 'antigravity',
      providerName: 'Antigravity',
      sessionId,
      title,
      turns,
      timestamp: fs.statSync(filePath).mtimeMs,
    };
  } catch {
    return null;
  }
}

async function getOpenCodeSessions(): Promise<CliAiSession[]> {
  const config = loadConfig();
  let dbPath = config.aiProviders?.opencodeDbPath;
  if (!dbPath) {
    const standardPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
    if (fs.existsSync(standardPath)) {
      dbPath = standardPath;
    } else {
      const prodPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode-prod.db');
      if (fs.existsSync(prodPath)) {
        dbPath = prodPath;
      } else {
        dbPath = standardPath;
      }
    }
  }

  if (!fs.existsSync(dbPath)) return [];

  try {
    const sqliteModule = await import('node:sqlite');
    const DatabaseSync = sqliteModule.DatabaseSync;
    if (!DatabaseSync) return [];

    const db = new DatabaseSync(dbPath, { readOnly: true });
    const query = `
      SELECT 
        s.id as sessionId,
        s.title,
        s.time_updated as timestamp,
        s.slug as projectSlug,
        m.id as messageId,
        m.data as messageData,
        p.data as partData
      FROM session s
      JOIN message m ON m.session_id = s.id
      LEFT JOIN part p ON p.message_id = m.id
      ORDER BY s.time_updated DESC, m.time_created ASC, p.time_created ASC
    `;

    const rows = db.prepare(query).all() as any[];
    db.close();

    const sessionsMap = new Map<string, {
      session: CliAiSession;
      messagesMap: Map<string, { role: 'user' | 'assistant'; textParts: string[] }>;
    }>();

    for (const row of rows) {
      const { sessionId, title, timestamp, projectSlug, messageId, messageData, partData } = row;
      
      let entry = sessionsMap.get(sessionId);
      if (!entry) {
        entry = {
          session: {
            providerId: 'open-code',
            providerName: 'OpenCode',
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

    const sessions: CliAiSession[] = [];
    for (const entry of sessionsMap.values()) {
      const turns: CliAiTurn[] = [];
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
  } catch {
    return [];
  }
}

function getTitleWithDate(session: CliAiSession): string {
  const dateObj = new Date(session.timestamp);
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const formattedDate = `${year}-${month}-${day}`;
  return `${session.title} (${formattedDate})`;
}

function getMarkdownText(session: CliAiSession): string {
  const titleWithDate = getTitleWithDate(session);
  let rawText = `# ${titleWithDate}\n\n`;
  rawText += `Source: ${session.providerName}\n`;
  if (session.projectSlug) {
    rawText += `Project: ${session.projectSlug}\n`;
  }
  rawText += `\n---\n\n`;
  
  for (const turn of session.turns) {
    const roleHeader = turn.role === 'user' ? '👤 User' : '🤖 Assistant';
    rawText += `### ${roleHeader}\n${turn.content}\n\n`;
  }
  return rawText;
}

// -------------------------------------------------------------------------
// Main Command Handler
// -------------------------------------------------------------------------

export async function runSyncAi(options: { project?: string }): Promise<void> {
  const s = clack.spinner();
  s.start('Scanning local AI history logs...');

  const allSessions: CliAiSession[] = [];

  // Gather sessions from all providers
  try {
    const claudeSessions = getClaudeCodeSessions();
    allSessions.push(...claudeSessions);
  } catch {}

  try {
    const codexSessions = getCodexSessions();
    allSessions.push(...codexSessions);
  } catch {}

  try {
    const antigravitySessions = getAntigravitySessions();
    allSessions.push(...antigravitySessions);
  } catch {}

  try {
    const openCodeSessions = await getOpenCodeSessions();
    allSessions.push(...openCodeSessions);
  } catch {}

  // Sort: newest sessions first
  allSessions.sort((a, b) => b.timestamp - a.timestamp);

  s.stop(pc.green('Scan complete!'));

  if (allSessions.length === 0) {
    console.log(pc.yellow('\nNo local AI sessions found from Claude Code, Codex, Antigravity, or OpenCode.'));
    return;
  }

  let displayedCount = 20;
  let selectedSession: CliAiSession | null = null;

  while (true) {
    const selectOptions: any[] = allSessions.slice(0, displayedCount).map(session => {
      const dateStr = new Date(session.timestamp).toISOString().split('T')[0];
      return {
        value: session,
        label: `[${session.providerName}] ${session.title}`,
        hint: `${dateStr} (${session.turns.length} turns)`
      };
    });

    if (allSessions.length > displayedCount) {
      selectOptions.push({
        value: 'LOAD_MORE',
        label: pc.cyan('❯ Load More...'),
        hint: `Showing ${displayedCount} of ${allSessions.length} sessions`
      });
    }

    const selected = await clack.select({
      message: 'Select an AI session to import/sync to Kote:',
      options: selectOptions,
    });

    if (clack.isCancel(selected)) {
      console.log(pc.yellow('Cancelled.'));
      return;
    }

    if (selected === 'LOAD_MORE') {
      displayedCount += 20;
      continue;
    }

    selectedSession = selected as CliAiSession;
    break;
  }

  const session = selectedSession;
  const titleWithDate = getTitleWithDate(session);
  const rawText = getMarkdownText(session);
  s.start(`Saving "${titleWithDate}" as note to Kote...`);

  try {
    const config = loadConfig();
    const targetProject = options.project || session.projectSlug || config.defaultProjectSlug || 'inbox';
    await client.createNote({
      title: titleWithDate,
      rawText,
      projectSlug: targetProject,
      sourceChannel: 'ai-chat',
      source: session.providerId,
      sessionId: session.sessionId,
    });

    s.stop(pc.green('Import complete!'));
    console.log(pc.cyan(`\nNote saved to Kote successfully!`));
  } catch (error: any) {
    s.stop(pc.red('Save failed'));
    if (error instanceof ApiClientError) {
      console.error(pc.red(`Error (${error.status}): ${(error.body as any)?.message || error.message}`));
    } else {
      console.error(pc.red(`Error: ${error.message || 'Failed to save note'}`));
    }
    process.exit(1);
  }
}
