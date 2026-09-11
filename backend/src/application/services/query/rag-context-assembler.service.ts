import { Injectable } from '@nestjs/common';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { AppLogger } from '../../../observability/logger.js';
import type { AnswerContextChunk } from '../../ports/query/answer-generation.gateway.js';
import type { NoteRecord } from '../../models/repository-records.models.js';
import type { NoteSynthesisRecord } from '../../models/note-synthesis.models.js';
import { EmbeddingRepresentation } from '../../ports/notes/note-embedding.repository.js';
import { isDependencyNote } from '../../../domain/utils/note-embedding.utils.js';
import { matchesIntent } from '../../utils/query/query.utils.js';
import { noteSummary } from '../../../infrastructure/mappers/content-query.mappers.js';
import { SpecialQueryIntent } from '../../../contracts/enums.js';
import { AI_SESSION_SYNTHESIS_RETRIEVAL } from '../../constants/ai-session-synthesis.constants.js';
import { RagRetrievalService, type RankedCandidate, type RagScope } from './rag-retrieval.service.js';

export type AskRelatedNote = {
  id: string;
  title: string;
  path: string;
  projectSlug: string;
  workspaceId: string;
};

export type AskContextResult = {
  contextChunks: AnswerContextChunk[];
  relatedNotes: AskRelatedNote[];
};

export type ContextAssemblyEntry = RankedCandidate & { text: string };

@Injectable()
export class RagContextAssemblerService {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly ragRetrievalService: RagRetrievalService,
    private readonly logger: AppLogger,
  ) {}

  async buildAskContextResult(
    userId: string,
    rankedChunks: RankedCandidate[],
    noteMap: Map<string, NoteRecord>,
    validSyntheses: Map<string, NoteSynthesisRecord>,
  ): Promise<AskContextResult> {
    const grouped = groupRankedCandidates(rankedChunks);

    const contextChunks: AnswerContextChunk[] = [];
    let contextChars = 0;
    const topNoteIds: string[] = [];
    const rawEmbeddingsByNoteId = await this.ragRetrievalService.loadRawEvidence(userId, validSyntheses, noteMap);
    for (const [noteId, entries] of grouped) {
      if (topNoteIds.length >= AI_SESSION_SYNTHESIS_RETRIEVAL.maxSessions) break;
      const note = noteMap.get(noteId);
      if (!note) continue;
      topNoteIds.push(noteId);
      const synthesis = validSyntheses.get(noteId);
      const synthesisEntry = synthesis
        ? entries.find((entry) => entry.chunk.representation === EmbeddingRepresentation.Synthesis)
        : undefined;
      const rawEntries = entries.filter((entry) => entry.chunk.representation !== EmbeddingRepresentation.Synthesis);
      const refs = new Set(synthesisEntry?.chunk.sourceRefs || []);
      const storedRawEntries = rawEmbeddingsByNoteId.get(noteId) || [];
      const evidenceEntries = selectEvidenceEntries(rawEntries, storedRawEntries, refs);
      const ordered = buildContextEntries(entries, synthesisEntry, evidenceEntries);

      for (const entry of ordered) {
        if (contextChars + entry.text.length > AI_SESSION_SYNTHESIS_RETRIEVAL.maxContextChars) continue;
        contextChunks.push({
          noteId: entry.chunk.noteId,
          title: note.title,
          path: note.path,
          projectSlug: note.projectSlug,
          workspaceId: note.workspaceId,
          chunkText: entry.text,
        });
        contextChars += entry.text.length;
      }
    }

    const relatedNotes = topNoteIds
      .map((noteId) => noteMap.get(noteId))
      .filter((note): note is NoteRecord => Boolean(note))
      .map((note) => ({
        id: note.id,
        title: note.title,
        path: note.path,
        projectSlug: note.projectSlug || '',
        workspaceId: note.workspaceId,
      }));

    this.logger.info('ask_knowledge.context_built', {
      contextChunksCount: contextChunks.length,
      relatedNotesCount: relatedNotes.length,
      contextChars,
      memoryChunksCount: contextChunks.filter((chunk) => chunk.chunkText.startsWith('[Session memory]')).length,
      evidenceChunksCount: contextChunks.filter((chunk) => chunk.chunkText.startsWith('[Original evidence]')).length,
    });

    return { contextChunks, relatedNotes };
  }

  async resolveSpecialIntentContext(
    userId: string,
    specialIntent: SpecialQueryIntent,
    options: RagScope,
    topChunksLimit: number = 10,
  ): Promise<AskContextResult> {
    const rawNotes = await this.contentRepository.listNotes(userId, {
      projectId: options.projectId,
      workspaceId: options.workspaceId,
    });
    const allNotes = rawNotes.filter((note) => !isDependencyNote(note));
    const noteMap = new Map(allNotes.map((note) => [note.id, note]));

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const matchingNotes = allNotes
      .map((note) => noteSummary(note))
      .filter((note) => {
        if (!matchesIntent(note, specialIntent)) {
          return false;
        }
        if (specialIntent === SpecialQueryIntent.Recent) {
          const noteDate = new Date(note.date || 0);
          return noteDate >= thirtyDaysAgo;
        }
        return true;
      })
      .sort((left, right) => {
        const leftTime = new Date(left.date || 0).getTime();
        const rightTime = new Date(right.date || 0).getTime();
        return rightTime - leftTime;
      });

    const selectedNotes = matchingNotes.slice(0, topChunksLimit);

    const contextChunks = selectedNotes.map((summary) => {
      const note = noteMap.get(summary.id)!;
      return {
        noteId: summary.id,
        title: summary.title,
        path: summary.path,
        projectSlug: summary.project,
        workspaceId: note.workspaceId,
        chunkText: note.markdown || note.summary || '',
      };
    });

    const relatedNotes = selectedNotes.map((summary) => {
      const note = noteMap.get(summary.id)!;
      return {
        id: summary.id,
        title: summary.title,
        path: summary.path,
        projectSlug: summary.project,
        workspaceId: note.workspaceId,
      };
    });

    return { contextChunks, relatedNotes };
  }
}

export function shouldUseConversationHistory(question: string): boolean {
  const normalized = normalizeQuestion(question);
  if (!normalized) return false;

  return contextualQuestionPatterns.some((pattern) => pattern.test(normalized));
}

function normalizeQuestion(question: string): string {
  return question
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const contextualQuestionPatterns = [
  /^(e|and|also|tambem|agora|then|so|mas|but)\b/,
  /\b(isso|isto|esse|essa|esses|essas|este|esta|estes|estas|aquele|aquela|aquilo)\b/,
  /\b(ele|ela|eles|elas|dele|dela|deles|delas|nele|nela|nisso|nessa|nesse)\b/,
  /\b(it|that|this|these|those|they|them|he|she|him|her|its|their)\b/,
  /\b(previous|above|last|earlier|anterior|ultimo|ultima)\b/,
  /\b(o arquivo|a nota|o documento|the file|the note|the document)\b/,
];

function groupRankedCandidates(candidates: RankedCandidate[]): Map<string, RankedCandidate[]> {
  const grouped = new Map<string, RankedCandidate[]>();
  for (const candidate of candidates) {
    const entries = grouped.get(candidate.note.id) || [];
    entries.push(candidate);
    grouped.set(candidate.note.id, entries);
  }
  return grouped;
}

function selectEvidenceEntries(
  rankedRawEntries: RankedCandidate[],
  storedRawEntries: RankedCandidate[],
  refs: ReadonlySet<number>,
): RankedCandidate[] {
  const matches = (entry: RankedCandidate) =>
    refs.size === 0 || (entry.chunk.sourceRefs || []).some((ref) => refs.has(ref));
  const rankedMatches = rankedRawEntries.filter(matches);
  if (rankedMatches.length > 0) return rankedMatches;
  const storedMatches = storedRawEntries.filter(matches);
  if (storedMatches.length > 0) return storedMatches;
  if (refs.size > 0) return [];
  return rankedRawEntries.length > 0 ? rankedRawEntries : storedRawEntries;
}

function buildContextEntries(
  entries: RankedCandidate[],
  synthesisEntry: RankedCandidate | undefined,
  evidenceEntries: RankedCandidate[],
): ContextAssemblyEntry[] {
  if (!synthesisEntry) {
    return entries
      .slice(0, AI_SESSION_SYNTHESIS_RETRIEVAL.maxEvidenceChunksPerSession)
      .map((entry) => ({ ...entry, text: entry.chunk.chunkText }));
  }

  return [
    { ...synthesisEntry, text: `[Session memory]\n${synthesisEntry.chunk.chunkText}` },
    ...evidenceEntries
      .slice(0, AI_SESSION_SYNTHESIS_RETRIEVAL.maxEvidenceChunksPerSession)
      .map((entry) => ({
        ...entry,
        text: `[Original evidence${entry.chunk.sourceRefs?.length ? ` — turns ${entry.chunk.sourceRefs.join(', ')}` : ''}]\n${entry.chunk.chunkText}`,
      })),
  ];
}
