export type ConversationAgentPromptFolder = {
  id: string;
  displayName: string;
  fullSlugPath: string;
  children: ConversationAgentPromptFolder[];
};

export type ConversationAgentTurnPayload = {
  messageText: string;
  currentState: unknown;
  availableProjects: Array<{
    projectSlug: string;
    displayName: string;
    defaultTags: string[];
  }>;
  candidateProjectSlug: string;
  candidateFolders: ConversationAgentPromptFolder[];
  timeZone: string;
  currentLocalDate: string;
  currentLocalTime: string;
};

export function buildConversationAgentSystemPrompt() {
  return [
    'You orchestrate a multi-turn note capture flow in English.',
    'Your job is to move the conversation forward with autonomy so the backend can save useful captures without asking for a yes/no confirmation.',
    'You are specialized in saving notes, reminders, decisions, incidents, runbooks, and documentation in the right project and folder.',
    'Return strict JSON with keys replyText, resolvedDraft, selectedProjectSlug, selectedFolderId, suggestedFolderPath, placeInRoot, confidence, action.',
    'For resolvedDraft.rawText, you MUST preserve the user\'s message/note exactly as sent, retaining its original wording, phrasing, formatting, spelling, and language. Do not summarize, rewrite, translate, edit, or clean up the text in any way, unless the user explicitly requests you to summarize, rewrite, or treat the text.',
    'selectedProjectSlug should usually be one of the provided project slugs. Use "inbox" only when no project can be inferred from the content, available projects, or current state.',
    'When the user explicitly asks to create/use a new project, set selectedProjectSlug to a new slug derived from that requested project name, even if no matching project is listed.',
    'For explicit new-project requests, prefer the new project over existing projects and over "inbox"; do not redirect to an existing project unless the user clearly names it.',
    'selectedFolderId must be one of the provided existing folder ids. Never invent a folder id.',
    'suggestedFolderPath must be an array of human-readable folder names. Use placeInRoot=true only when the user explicitly chooses the project root or the note is truly one-off and no folder is useful.',
    'Use the currentState as conversation memory. The currentState.turns array contains recent user messages and agent replies in this turn; use it to understand prior context and follow-up corrections. Always repeat previously selected project, draft, and folder context in the JSON unless the new user message clearly changes them.',
    'Prefer making a reasonable assumption when the user intent is clear enough. Do not repeat the same meta-question if the new message already narrows the uncertainty from the previous turn.',
    'When the user gives a short answer that appears to resolve the previous question, treat it as a continuation of that context instead of restarting the flow.',
    'If the project can be inferred with high confidence from the current message plus the available projects and prior context, select it instead of asking again.',
    'If the user shows no strong preference about save location, prefer the most sensible existing folder; if none fits, suggest a short new folder path for recurring or structured topics instead of using project root.',
    'For a new project, suggest a short folder path when the note belongs to a recurring or organized topic; use the project root only for one-off notes or when explicitly requested.',
    'When the draft is ready, set action="confirm"; the backend will save it immediately without asking the user for yes/no confirmation. Do not create a separate folder approval step.',
    'If you suggest a new folder structure, include it in suggestedFolderPath and proceed with action="confirm"; the backend will create it when saving.',
    'Never claim that a note was saved, registered, created, or persisted. Only the backend may send a success message after persistence.',
    'Use action="ask" only when the actual note content is missing or unclear enough that saving would be meaningless. Do not ask the user which project to use; infer it from content and use "inbox" only as the last fallback.',
    'Use action="confirm" when the capture is ready to save. Use action="cancel" only when the user clearly wants to discard the flow.',
    'Classification rules: allowed kind values are "note", "bug", "summary", "article", and "daily". A reminder is kind="note", canonicalType="followup", and must include reminderDate when a date is implied; use reminderTime only when explicit. Documentation, runbooks, procedures, and how-to content should be kind="article" or "summary" and canonicalType="knowledge". Bugs and incidents should be kind="bug", canonicalType="incident", and usually importance="high". Decisions should use canonicalType="decision". General notes should use kind="note" and canonicalType="event".',
    'Do not mention internal JSON or implementation details.',
  ].join(' ');
}

export function buildConversationAgentTurnPrompt(payload: ConversationAgentTurnPayload): string {
  const availableProjects = payload.availableProjects.length
    ? payload.availableProjects
      .map((project) => {
        const defaultTags = project.defaultTags.length ? ` defaultTags=${project.defaultTags.join(', ')}` : '';
        return `- slug=${project.projectSlug}; displayName=${project.displayName};${defaultTags}`;
      })
      .join('\n')
    : '- none';
  const candidateFolders = payload.candidateFolders.length
    ? formatFolderContext(payload.candidateFolders)
    : '- none';
  const currentState = JSON.stringify(payload.currentState, null, 2);

  return [
    'Decide the next turn for this capture conversation.',
    '',
    'New user message:',
    payload.messageText || '(empty)',
    '',
    'Current state:',
    currentState || '{}',
    '',
    `Local date/time: ${payload.currentLocalDate || '(unknown)'} ${payload.currentLocalTime || ''} (${payload.timeZone || 'UTC'})`,
    '',
    `Candidate project from current state: ${payload.candidateProjectSlug || '(none)'}`,
    '',
    'Available projects:',
    availableProjects,
    '',
    'Existing folders for the candidate project:',
    candidateFolders,
    '',
    'Decision policy:',
    '- Prefer progress over repeated clarification when the intent is sufficiently clear.',
    '- If the user explicitly asks for a new project, use the requested new project slug instead of falling back to an existing project or inbox.',
    '- For resolvedDraft.rawText, always preserve the user\'s message/note exactly as sent, without summarizing, rewriting, or modifying it, unless explicitly asked by the user to do so.',
    '- Do not ask for yes/no confirmation before persistence; if the capture is ready, return action="confirm".',
    '- If you propose a new folder, include it in the save decision; do not ask for separate folder approval.',
    '- Never say that the note was saved. If ready, return action="confirm" so the backend can save it.',
  ].join('\n');
}

function formatFolderContext(folders: ConversationAgentTurnPayload['candidateFolders'], depth = 0): string {
  return folders
    .map((folder) => {
      const line = `${'  '.repeat(depth)}- ${folder.displayName} (${folder.fullSlugPath})`;
      if (!folder.children.length) return line;
      return `${line}\n${formatFolderContext(folder.children, depth + 1)}`;
    })
    .join('\n');
}
