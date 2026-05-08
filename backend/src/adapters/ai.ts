import { AiProvider, CanonicalType, Importance, KnowledgeKind, ReviewFindingSeverity } from '../contracts/enums.js';
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

export type ConversationExtraction = {
  rawText?: string;
  projectSlug?: string;
  kind?: KnowledgeKind;
  canonicalType?: CanonicalType;
  importance?: Importance;
  tags?: string[];
  reminderDate?: string;
  reminderTime?: string;
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
    aliases: string[];
    defaultTags: string[];
  }>;
  candidateProjectSlug: string;
  candidateFolders: ConversationAgentPromptFolder[];
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

export async function extractConversationFields(
  config: ChatConfig,
  payload: {
    messageText: string;
    projectSlugs: string[];
  },
): Promise<ConversationExtraction | null> {
  return runStructuredChatCompletion(
    config,
    [
      'Extract structured fields from a WhatsApp knowledge-capture message written in Brazilian Portuguese.',
      `Use projectSlug only from this list when confident: ${payload.projectSlugs.join(', ') || 'inbox'}.`,
      'Return strict JSON with optional keys rawText, projectSlug, kind, canonicalType, importance, tags, reminderDate, reminderTime.',
      'Valid kind values: note, bug, summary, article, daily.',
      'Valid canonicalType values: event, knowledge, decision, incident.',
      'Dates must be YYYY-MM-DD and times HH:mm when explicit.',
      'Do not invent missing information.',
    ].join(' '),
    payload.messageText,
    (parsed) => (parsed && typeof parsed === 'object' ? (parsed as ConversationExtraction) : null),
  );
}

export async function decideConversationAgentTurn(
  config: ChatConfig,
  payload: ConversationAgentTurnPayload,
): Promise<ConversationAgentDecision | null> {
  const systemPrompt = [
    'You orchestrate a multi-turn note capture flow in Brazilian Portuguese.',
    'Your job is to move the conversation forward with autonomy, while keeping a final human confirmation before any persistence.',
    'Return strict JSON with keys replyText, resolvedDraft, selectedProjectSlug, selectedFolderId, suggestedFolderPath, pendingApproval, confidence, action.',
    'selectedProjectSlug must be one of the provided project slugs or "inbox". Never invent a new project.',
    'suggestedFolderPath must be an array of human-readable folder names.',
    'Use the currentState as conversation memory. Reuse previously selected project, draft, and folder context unless the new user message clearly changes them.',
    'Prefer making a reasonable assumption when the user intent is clear enough. Do not repeat the same meta-question if the new message already narrows the uncertainty from the previous turn.',
    'When the user gives a short answer that appears to resolve the previous question, treat it as a continuation of that context instead of restarting the flow.',
    'If the project can be inferred with high confidence from the current message plus the available projects and prior context, select it instead of asking again.',
    'If the user shows no strong preference about save location, prefer the project root or the most sensible existing folder instead of asking another location question.',
    'Use pendingApproval="folder_create" only when you are explicitly proposing a new folder structure that does not exist yet and that folder creation itself should be approved.',
    'Use pendingApproval="final_confirmation" when the draft is ready and the note can be summarized for final confirmation before saving.',
    'Use action="ask" only for genuine ambiguity or missing information that blocks a sensible assumption.',
    'Use action="confirm" for folder approval or final confirmation. Use action="submit" only when the user is clearly confirming the final summary. Use action="cancel" only when the user clearly wants to discard the flow.',
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
        const aliases = project.aliases.length ? ` aliases=${project.aliases.join(', ')}` : '';
        const defaultTags = project.defaultTags.length ? ` defaultTags=${project.defaultTags.join(', ')}` : '';
        return `- slug=${project.projectSlug}; displayName=${project.displayName};${aliases}${defaultTags}`;
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
    '- If you propose a new folder, ask for folder approval first; otherwise go straight to final confirmation when ready.',
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
