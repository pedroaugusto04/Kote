import { stripMarkdownFences } from '../../../domain/strings.js';
import { ConversationConfidence } from '../../../contracts/enums.js';

export type AskAgentFinalResponse = {
  answer: string;
  confidence: ConversationConfidence;
  requestedAttachments: boolean;
  requestedAttachmentPattern?: string;
  sources: Array<{ noteId: string; title: string; path: string }>;
};

export function buildAskAgentSystemPrompt(): string {
  return [
    'You are Kote AI, an intelligent personal knowledge base assistant.',
    "Your goal is to answer the user's question thoroughly and accurately using the user's notes, tasks, and knowledge base.",
    '',
    'Guidelines:',
    '1. Use the provided tools (search_knowledge, get_note_content, list_projects, list_recent_notes, list_reminders, list_note_attachments) to discover facts and context before formulating your answer.',
    '2. If a search query does not return results or is ambiguous, try alternative keywords or list available projects.',
    '3. If an excerpt from search_knowledge seems cut off or references important details, use get_note_content to read the complete note.',
    '4. When asked about pending tasks, deadlines, or reminders, use list_reminders.',
    '5. When asked about files, documents, or attachments, use list_note_attachments or search_knowledge.',
    '6. Base your answer strictly on the information found in the notes. If no notes contain relevant information, state that clearly.',
    '7. Conclude your final answer as a valid JSON object matching this schema:',
    '{',
    '  "answer": "Your detailed Markdown answer here.",',
    '  "confidence": "high" | "medium" | "low",',
    '  "requestedAttachments": false,',
    '  "requestedAttachmentPattern": "",',
    '  "sources": [{"noteId": "...", "title": "..."}]',
    '}',
    'In sources, cite the notes you used to answer the question (using their noteId and title from the tools).',
    'If the user is asking to download or receive a file (e.g. pdf, invoice, attachment), set requestedAttachments to true and requestedAttachmentPattern to the search term.',
  ].join('\n');
}

export function parseAskAgentFinalResponse(rawText: string): AskAgentFinalResponse {
  const cleaned = stripMarkdownFences(rawText.trim());
  try {
    const parsed = JSON.parse(cleaned);
    const answer = String(parsed.answer || cleaned).trim();
    let confidence = ConversationConfidence.Medium;
    if (parsed.confidence === 'high') confidence = ConversationConfidence.High;
    if (parsed.confidence === 'low') confidence = ConversationConfidence.Low;

    let sources: Array<{ noteId: string; title: string; path: string }> = [];
    if (Array.isArray(parsed.sources)) {
      sources = parsed.sources
        .filter((s: any) => s && typeof s.noteId === 'string' && s.noteId.trim())
        .map((s: any) => ({
          noteId: String(s.noteId).trim(),
          title: String(s.title || '').trim(),
          path: String(s.path || '').trim(),
        }));
    }

    return {
      answer: answer || rawText,
      confidence,
      requestedAttachments: Boolean(parsed.requestedAttachments),
      requestedAttachmentPattern: parsed.requestedAttachmentPattern
        ? String(parsed.requestedAttachmentPattern).trim()
        : undefined,
      sources,
    };
  } catch {
    return {
      answer: rawText.trim(),
      confidence: ConversationConfidence.Medium,
      requestedAttachments: false,
      sources: [],
    };
  }
}
