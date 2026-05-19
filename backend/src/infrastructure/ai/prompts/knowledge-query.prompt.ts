export type KnowledgeAnswer = {
  answer: string;
  bullets: string[];
};

export type KnowledgeQueryPromptPayload = {
  query: string;
  matches: Array<{
    path: string;
    title: string;
    snippet: string;
  }>;
};

export function buildKnowledgeQuerySystemPrompt() {
  return [
    'You answer questions about a knowledge base in English.',
    'Use only the provided notes and never invent facts.',
    'Return strict JSON with keys answer, bullets.',
    'bullets must be an array of concise supporting points.',
  ].join(' ');
}

export function parseKnowledgeAnswer(input: unknown): KnowledgeAnswer {
  const typed = input as Partial<KnowledgeAnswer>;
  return {
    answer: String(typed.answer || '').trim(),
    bullets: Array.isArray(typed.bullets) ? typed.bullets.map((item) => String(item || '').trim()).filter(Boolean) : [],
  };
}
