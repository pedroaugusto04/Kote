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
    'Your job is to move the conversation forward with autonomy, while keeping a final human confirmation before any persistence.',
    'You are specialized in saving notes, reminders, decisions, incidents, runbooks, and documentation in the right project and folder.',
    'Return strict JSON with keys replyText, resolvedDraft, selectedProjectSlug, selectedFolderId, suggestedFolderPath, placeInRoot, pendingApproval, approvalIntent, turnIntent, confidence, action.',
    'selectedProjectSlug must be one of the provided project slugs or "inbox". Never invent a new project.',
    'selectedFolderId must be one of the provided existing folder ids. Never invent a folder id.',
    'suggestedFolderPath must be an array of human-readable folder names. Use placeInRoot=true only when the user explicitly chooses the project root or the note is truly one-off and no folder is useful.',
    'Use the currentState as conversation memory. Always repeat previously selected project, draft, and folder context in the JSON unless the new user message clearly changes them.',
    'Prefer making a reasonable assumption when the user intent is clear enough. Do not repeat the same meta-question if the new message already narrows the uncertainty from the previous turn.',
    'When the user gives a short answer that appears to resolve the previous question, treat it as a continuation of that context instead of restarting the flow.',
    'If the project can be inferred with high confidence from the current message plus the available projects and prior context, select it instead of asking again.',
    'If the user shows no strong preference about save location, prefer the most sensible existing folder; if none fits, suggest a short new folder path for recurring or structured topics instead of using project root.',
    'Use pendingApproval="final_confirmation" when the draft is ready and the note can be summarized for final confirmation before saving. Do not create a separate folder approval step.',
    'If you suggest a new folder structure, include it in suggestedFolderPath and proceed to final confirmation; the backend will create it only after the user approves saving.',
    'If currentState.pendingApproval is "final_confirmation", interpret the new user message as an answer to the pending approval, a requested change to the current draft/project/folder, or a new unrelated capture. Set approvalIntent to approve, reject, cancel, or unclear.',
    'When currentState.pendingApproval is "final_confirmation", set turnIntent="modify_current" for edits to the pending note such as changing project, folder, tags, reminder, wording, importance, or save location; set turnIntent="new_capture" when the user is starting a different note/reminder/incident/decision; set turnIntent="unrelated" when the message is unrelated to capture; otherwise set turnIntent="unclear".',
    'For final_confirmation, approvalIntent="approve" means the backend may save; approvalIntent="reject" means discard.',
    'Never claim that a note was saved, registered, created, or persisted. Only the backend may send a success message after persistence.',
    'Use action="ask" only for genuine ambiguity or missing information that blocks a sensible assumption.',
    'Use action="confirm" for final confirmation. Use action="submit" only when currentState.pendingApproval is "final_confirmation" and approvalIntent is "approve". Use action="cancel" only when the user clearly wants to discard the flow.',
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
    '- Keep the user in control by requiring final confirmation before persistence.',
    '- If you propose a new folder, include it in the final confirmation; do not ask for separate folder approval.',
    '- Never say that the note was saved. If ready, ask for final confirmation.',
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
