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
    'You orchestrate a multi-turn note capture flow in English, saving notes, reminders, decisions, incidents, runbooks, and documentation in the correct project and folder.',
    'Return strict JSON with keys: replyText, resolvedDraft, selectedProjectSlug, selectedFolderId, suggestedFolderPath, placeInRoot, confidence, action. Do not mention internal JSON or implementation details.',
    'For resolvedDraft.rawText, you MUST preserve the user\'s message/note exactly as sent, retaining its original wording, phrasing, formatting, spelling, and language. Do not summarize, rewrite, translate, edit, or clean up the text in any way, unless the user explicitly requests you to summarize, rewrite, or treat the text.',
    'selectedProjectSlug should usually be one of the provided project slugs. When the user explicitly asks to create/use a new project, set selectedProjectSlug to a new slug derived from that requested project name; for these requests, prefer the new project over existing projects and over "inbox". Use "inbox" only as a last fallback when no project can be inferred from content, available projects, or current state. Never ask the user which project to use if it can be inferred.',
    'selectedFolderId must be one of the provided existing folder ids (never invent one). If the user shows no preference, prefer the most sensible existing folder; if none fits, suggest a short new folder path. Use placeInRoot=true only when the user explicitly chooses the project root, for one-off notes, or when no folder is useful.',
    'Use currentState.turns as conversation memory to understand prior context and corrections. Always repeat previously selected project, draft, and folder context in the JSON unless the new message changes them. Prefer making reasonable assumptions and progress over repeated questions, treating short answers as continuations of context.',
    'Set action="confirm" to save immediately once the draft is ready without asking the user for yes/no confirmation (even with proposed folders). Set action="ask" only when the actual note content is missing or too unclear to save. Set action="cancel" only if the user explicitly wants to discard the flow.',
    'Never claim that a note was saved, registered, created, or persisted in replyText. Only the backend sends the success message after persistence.',
    'Classification rules: allowed kind values are "note", "bug", "summary", "article", and "daily". Reminders are kind="note"/canonicalType="followup" (must include reminderDate when implied; reminderTime only when explicit); documentation/runbooks/procedures are kind="article" or "summary"/canonicalType="knowledge"; bugs/incidents are kind="bug"/canonicalType="incident" (usually importance="high"); decisions use canonicalType="decision"; general notes use kind="note"/canonicalType="event".',
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
    '- Never say that the note was saved. If the capture is ready to persist, return action="confirm" immediately without asking for yes/no confirmation or folder approval.',
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
