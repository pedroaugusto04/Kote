import { AiProvider, ReviewFindingSeverity } from '../contracts/enums.js';
import { conversationAgentDecisionSchema, type ConversationAgentDecision } from '../contracts/agent-conversation.js';
import { stripMarkdownFences } from '../domain/strings.js';

export type ReviewAnalysis = {
  summary: string;
  impact: string;
  risks: string[];
  nextSteps: string[];
  reviewFindings: Array<{
    severity: ReviewFindingSeverity;
    file: string;
    summary: string;
    recommendation: string;
  }>;
};

export type KnowledgeAnswer = {
  answer: string;
  bullets: string[];
};

type ConversationAgentPromptFolder = {
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

type ChatConfig = {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
};

async function runChatCompletion(
  config: ChatConfig,
  systemPrompt: string,
  userContent: string,
): Promise<string> {
  if (config.provider === AiProvider.None || !config.apiKey || !config.model) return '';
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  });
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return stripMarkdownFences(data.choices?.[0]?.message?.content || '');
}

async function runStructuredChatCompletion<T>(
  config: ChatConfig,
  systemPrompt: string,
  userContent: string,
  parse: (input: unknown) => T,
): Promise<T | null> {
  const content = await runChatCompletion(config, systemPrompt, userContent);
  if (!content) return null;
  return parse(JSON.parse(content));
}

export async function generateReviewAnalysis(
  config: ChatConfig,
  promptPayload: unknown,
): Promise<ReviewAnalysis> {
  const fallback: ReviewAnalysis = {
    summary: 'Push recebido sem análise de IA configurada.',
    impact: 'Nenhum impacto adicional foi resumido.',
    risks: [],
    nextSteps: [],
    reviewFindings: [],
  };

  if (config.provider === AiProvider.None || !config.apiKey || !config.model) return fallback;

  const content = await runChatCompletion(
    config,
    [
      'You are a senior software engineer performing code review.',
      'Return strict JSON with keys summary, impact, risks, nextSteps, reviewFindings.',
      'reviewFindings must be an array of { severity, file, summary, recommendation }.',
      'Write the content in Brazilian Portuguese.',
    ].join(' '),
    JSON.stringify(promptPayload),
  );
  if (!content) return fallback;
  const parsed = JSON.parse(content) as Partial<ReviewAnalysis>;
  return {
    summary: String(parsed.summary || fallback.summary),
    impact: String(parsed.impact || fallback.impact),
    risks: Array.isArray(parsed.risks) ? parsed.risks.map((item) => String(item)) : [],
    nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps.map((item) => String(item)) : [],
    reviewFindings: Array.isArray(parsed.reviewFindings)
      ? parsed.reviewFindings
          .map((item) => item as Record<string, unknown>)
          .filter((item) => item.summary)
          .map((item) => ({
            severity: Object.values(ReviewFindingSeverity).includes(item.severity as ReviewFindingSeverity)
              ? (item.severity as ReviewFindingSeverity)
              : ReviewFindingSeverity.Medium,
            file: String(item.file || ''),
            summary: String(item.summary || ''),
            recommendation: String(item.recommendation || ''),
          }))
      : [],
  };
}

export async function decideConversationAgentTurn(
  config: ChatConfig,
  payload: ConversationAgentTurnPayload,
): Promise<ConversationAgentDecision | null> {
  const systemPrompt = [
    'You orchestrate a multi-turn note capture flow in Brazilian Portuguese.',
    'Your job is to move the conversation forward with autonomy, while keeping a final human confirmation before any persistence.',
    'You are specialized in saving notes, reminders, decisions, incidents, runbooks, and documentation in the right project and folder.',
    'Return strict JSON with keys replyText, resolvedDraft, selectedProjectSlug, selectedFolderId, suggestedFolderPath, placeInRoot, pendingApproval, approvalIntent, confidence, action.',
    'selectedProjectSlug must be one of the provided project slugs or "inbox". Never invent a new project.',
    'selectedFolderId must be one of the provided existing folder ids. Never invent a folder id.',
    'suggestedFolderPath must be an array of human-readable folder names. Use placeInRoot=true only when the user chooses the project root or no folder is useful.',
    'Use the currentState as conversation memory. Always repeat previously selected project, draft, and folder context in the JSON unless the new user message clearly changes them.',
    'Prefer making a reasonable assumption when the user intent is clear enough. Do not repeat the same meta-question if the new message already narrows the uncertainty from the previous turn.',
    'When the user gives a short answer that appears to resolve the previous question, treat it as a continuation of that context instead of restarting the flow.',
    'If the project can be inferred with high confidence from the current message plus the available projects and prior context, select it instead of asking again.',
    'If the user shows no strong preference about save location, prefer the project root or the most sensible existing folder instead of asking another location question.',
    'Use pendingApproval="final_confirmation" when the draft is ready and the note can be summarized for final confirmation before saving. Do not create a separate folder approval step.',
    'If you suggest a new folder structure, include it in suggestedFolderPath and proceed to final confirmation; the backend will create it only after the user approves saving.',
    'If currentState.pendingApproval is "final_confirmation", interpret the new user message as an answer to the pending approval or as a requested change to the draft/project/folder. Set approvalIntent to approve, reject, cancel, or unclear.',
    'For final_confirmation, approvalIntent="approve" means the backend may save; approvalIntent="reject" means discard.',
    'Never claim that a note was saved, registered, created, or persisted. Only the backend may send a success message after persistence.',
    'Use action="ask" only for genuine ambiguity or missing information that blocks a sensible assumption.',
    'Use action="confirm" for final confirmation. Use action="submit" only when currentState.pendingApproval is "final_confirmation" and approvalIntent is "approve". Use action="cancel" only when the user clearly wants to discard the flow.',
    'Classification rules: reminders require reminderDate when a date is implied; use reminderTime only when explicit. Documentation, runbooks, procedures, and how-to content should be kind="article" or "summary" and canonicalType="knowledge". Bugs and incidents should be kind="bug", canonicalType="incident", and usually importance="high". Decisions should use canonicalType="decision". General notes should use kind="note" and canonicalType="event".',
    'Do not mention internal JSON or implementation details.',
  ].join(' ');
  return runStructuredChatCompletion(
    config,
    systemPrompt,
    buildConversationAgentTurnPrompt(payload),
    (parsed) => conversationAgentDecisionSchema.parse(parsed),
  );
}

function buildConversationAgentTurnPrompt(payload: ConversationAgentTurnPayload): string {
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

export async function answerKnowledgeQuery(
  config: ChatConfig,
  payload: {
    query: string;
    matches: Array<{
      path: string;
      title: string;
      snippet: string;
    }>;
  },
): Promise<KnowledgeAnswer | null> {
  return runStructuredChatCompletion(
    config,
    [
      'You answer questions about a knowledge base in Brazilian Portuguese.',
      'Use only the provided notes and never invent facts.',
      'Return strict JSON with keys answer, bullets.',
      'bullets must be an array of concise supporting points.',
    ].join(' '),
    JSON.stringify(payload),
    (parsed) => {
      const typed = parsed as Partial<KnowledgeAnswer>;
      return {
        answer: String(typed.answer || '').trim(),
        bullets: Array.isArray(typed.bullets) ? typed.bullets.map((item) => String(item || '').trim()).filter(Boolean) : [],
      };
    },
  );
}
