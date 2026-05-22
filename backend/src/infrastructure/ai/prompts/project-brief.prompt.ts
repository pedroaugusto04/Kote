import { z } from 'zod';

import type { ProjectBrief, ProjectBriefContextItem } from '../../../application/models/project-brief.models.js';

const briefSourceSchema = z.object({
  noteId: z.string().trim(),
  title: z.string().trim().default(''),
  path: z.string().trim().default(''),
  date: z.string().trim().default(''),
});

const projectBriefSchema = z.object({
  summary: z.string().trim().default(''),
  status: z.string().trim().default(''),
  recentChanges: z.array(z.string()).default([]),
  decisions: z.array(z.string()).default([]),
  openItems: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  nextSteps: z.array(z.string()).default([]),
  sources: z.array(briefSourceSchema).default([]),
});

export function buildProjectBriefSystemPrompt() {
  return [
    'You generate operational technical project briefs in English.',
    'Return strict JSON only. Do not wrap the answer in markdown.',
    'Use only the provided context items. Do not invent facts.',
    'Focus on technical operations: current status, recent changes, decisions, open items, risks, and next steps.',
    'Every source must reference a noteId that exists in the context.',
    'Use this JSON shape: {"summary":"","status":"","recentChanges":[],"decisions":[],"openItems":[],"risks":[],"nextSteps":[],"sources":[{"noteId":"","title":"","path":"","date":""}]}',
  ].join('\n');
}

export function buildProjectBriefPrompt(payload: {
  projectSlug: string;
  generatedAt: string;
  contextWindow: number;
  items: ProjectBriefContextItem[];
}) {
  return JSON.stringify({
    instruction: 'Generate a concise technical project brief in English.',
    projectSlug: payload.projectSlug,
    generatedAt: payload.generatedAt,
    contextWindow: payload.contextWindow,
    items: payload.items,
  });
}

export function parseProjectBrief(input: unknown, context: { projectSlug: string; generatedAt: string; items: ProjectBriefContextItem[] }): ProjectBrief {
  const parsed = projectBriefSchema.parse(input);
  const sourceById = new Map(context.items.map((item) => [item.noteId, item]));
  const sources = parsed.sources
    .filter((source) => sourceById.has(source.noteId))
    .map((source) => {
      const original = sourceById.get(source.noteId);
      return {
        noteId: source.noteId,
        title: source.title || original?.title || '',
        path: source.path || original?.path || '',
        date: source.date || original?.date || '',
      };
    });

  return {
    projectSlug: context.projectSlug,
    generatedAt: context.generatedAt,
    summary: parsed.summary,
    status: parsed.status,
    recentChanges: parsed.recentChanges.map(String),
    decisions: parsed.decisions.map(String),
    openItems: parsed.openItems.map(String),
    risks: parsed.risks.map(String),
    nextSteps: parsed.nextSteps.map(String),
    sources,
  };
}
