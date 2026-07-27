import type { AskConversationTurn } from '../../../contracts/ask-conversation.js';

export function buildQueryRewritingSystemPrompt() {
  return [
    'You are a search query optimizer.',
    'Given a conversation history and a follow-up question from the user, rewrite the follow-up question to be an independent, self-contained search query.',
    'Ensure the rewritten query is in the same language as the follow-up question, resolves all pronouns (e.g. "it", "he", "they", "the file", "them", "isso", "dele", "aquilo") to their full referenced entities from the history, and retains all relevant keywords.',
    'If the question is already self-contained or the history is empty, return the original question exactly.',
    'Return a JSON object with this shape: {"rewrittenQuery": "..."}'
  ].join('\n');
}

export function buildQueryRewritingPrompt(question: string, history: AskConversationTurn[]) {
  return JSON.stringify({
    history: history.map(h => ({ question: h.question, answer: h.answer })),
    followUpQuestion: question
  });
}
