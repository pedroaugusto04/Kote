import pc from 'picocolors';
import * as clackPrompts from '@clack/prompts';
import { client, ApiClientError } from '../client.js';
import { loadConfig } from '../config.js';
import { IdeSessionScanner, type CliAiSession } from '../utils/ide-session-scanner.js';

export const clack = {
  select: clackPrompts.select,
  isCancel: clackPrompts.isCancel,
  spinner: clackPrompts.spinner,
};

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
    const roleHeader = turn.role === 'user' ? '👤 User' : '✨ Assistant';
    rawText += `### ${roleHeader}\n${turn.content}\n\n`;
  }
  return rawText;
}

export async function runSyncAi(options: { project?: string }): Promise<void> {
  const s = clack.spinner();
  s.start('Scanning local AI history logs...');

  const allSessions = await IdeSessionScanner.getAllSessions();

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
      attachments: session.attachments,
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
