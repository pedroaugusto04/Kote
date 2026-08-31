import pc from 'picocolors';
import * as clackPrompts from '@clack/prompts';
import { client, ApiClientError } from '../client.js';
import { loadConfig } from '../config.js';
import { resolveProjectSlugFromDir } from '../utils/project-detector.js';
import { AI_CHAT_SOURCE_CHANNEL, AI_PROVIDER_NAME, AI_ROLE } from '../ai-history/constants.js';
import { AiHistoryManager } from '../ai-history/history-manager.js';
import type { AiSession } from '../ai-history/types.js';

export const clack = {
  select: clackPrompts.select,
  isCancel: clackPrompts.isCancel,
  spinner: clackPrompts.spinner,
};

const PAGE_SIZE = 20;
const LOAD_MORE = 'LOAD_MORE';

function getTitleWithDate(session: AiSession): string {
  const dateObj = new Date(session.timestamp);
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const formattedDate = `${year}-${month}-${day}`;
  return `${session.title} (${formattedDate})`;
}

function getMarkdownText(session: AiSession): string {
  const titleWithDate = getTitleWithDate(session);
  let rawText = `# ${titleWithDate}\n\n`;
  rawText += `Source: ${AI_PROVIDER_NAME[session.providerId]}\n`;
  if (session.projectSlug) {
    rawText += `Project: ${session.projectSlug}\n`;
  }
  rawText += `\n---\n\n`;
  
  for (const turn of session.turns) {
    const roleHeader = turn.role === AI_ROLE.USER ? '👤 User' : '✨ Assistant';
    rawText += `### ${roleHeader}\n${turn.content}\n\n`;
  }
  return rawText;
}

function selectionOptions(sessions: AiSession[], displayedCount: number) {
  const options: Array<{ value: AiSession | typeof LOAD_MORE; label: string; hint: string }> = sessions
    .slice(0, displayedCount)
    .map((session) => ({
      value: session,
      label: `[${AI_PROVIDER_NAME[session.providerId]}] ${session.title}`,
      hint: `${new Date(session.timestamp).toISOString().split('T')[0]} (${session.turns.length} turns)`,
    }));

  if (sessions.length <= displayedCount) return options;
  options.push({
    value: LOAD_MORE,
    label: pc.cyan('❯ Load More...'),
    hint: `Showing ${displayedCount} of ${sessions.length} sessions`,
  });
  return options;
}

async function selectSession(sessions: AiSession[]): Promise<AiSession | null> {
  let displayedCount = PAGE_SIZE;
  while (true) {
    const selected = await clack.select<AiSession | typeof LOAD_MORE>({
      message: 'Select an AI session to import/sync to Kote:',
      options: selectionOptions(sessions, displayedCount),
    });

    if (clack.isCancel(selected)) return null;
    if (selected !== LOAD_MORE) return selected;
    displayedCount += PAGE_SIZE;
  }
}

function apiErrorMessage(error: ApiClientError): string {
  if (!error.body || typeof error.body !== 'object') return error.message;
  const message = Reflect.get(error.body, 'message');
  return typeof message === 'string' ? message : error.message;
}

export async function runSyncAi(options: { project?: string }): Promise<void> {
  const s = clack.spinner();
  s.start('Scanning local AI history logs...');

  const allSessions = await new AiHistoryManager().getAllSessions();

  s.stop(pc.green('Scan complete!'));

  if (allSessions.length === 0) {
    console.log(pc.yellow('\nNo local AI sessions found from Claude Code, Codex, Antigravity, or OpenCode.'));
    return;
  }

  const session = await selectSession(allSessions);
  if (!session) {
    console.log(pc.yellow('Cancelled.'));
    return;
  }
  const titleWithDate = getTitleWithDate(session);
  const rawText = getMarkdownText(session);
  s.start(`Saving "${titleWithDate}" as note to Kote...`);

  try {
    const config = loadConfig();
    const localDetected = resolveProjectSlugFromDir(process.cwd());
    const targetProject = options.project || session.projectSlug || localDetected || config.defaultProjectSlug || 'inbox';
    await client.createNote({
      title: titleWithDate,
      rawText,
      projectSlug: targetProject,
      sourceChannel: AI_CHAT_SOURCE_CHANNEL,
      source: session.providerId,
      sessionId: session.sessionId,
      attachments: session.attachments,
    });

    s.stop(pc.green('Import complete!'));
    console.log(pc.cyan(`\nNote saved to Kote successfully!`));
  } catch (error: unknown) {
    s.stop(pc.red('Save failed'));
    if (error instanceof ApiClientError) {
      console.error(pc.red(`Error (${error.status}): ${apiErrorMessage(error)}`));
      process.exit(1);
    }
    const message = error instanceof Error ? error.message : 'Failed to save note';
    console.error(pc.red(`Error: ${message}`));
    process.exit(1);
  }
}
