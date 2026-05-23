import { Injectable } from '@nestjs/common';

export type NoteChunk = {
  chunkIndex: number;
  chunkText: string;
};

/**
 * Approximate token count: ~1 token per 4 characters (conservative estimate).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Target chunk size in estimated tokens.
 */
const TARGET_CHUNK_TOKENS = 500;

/**
 * Overlap in estimated tokens between consecutive chunks.
 */
const OVERLAP_TOKENS = 50;

/**
 * Minimum chunk size in characters — skip tiny chunks.
 */
const MIN_CHUNK_CHARS = 30;

@Injectable()
export class NoteChunkingService {
  /**
   * Split a note into chunks suitable for embedding.
   *
   * The note body is split by paragraphs first. When individual paragraphs
   * are short enough they are merged into a single chunk up to
   * `TARGET_CHUNK_TOKENS`. Long paragraphs are further split by sentence
   * boundaries with overlap so semantic continuity is preserved.
   *
   * Each chunk is prefixed with the note title and project slug for
   * contextual grounding in embedding space.
   */
  chunkNote(params: {
    title: string;
    body: string;
    projectSlug: string;
  }): NoteChunk[] {
    const { title, body, projectSlug } = params;

    if (!body || body.trim().length < MIN_CHUNK_CHARS) {
      // Single chunk for very short notes
      const text = this.buildPrefix(title, projectSlug) + (body || '').trim();
      if (text.trim().length < MIN_CHUNK_CHARS) return [];
      return [{ chunkIndex: 0, chunkText: text }];
    }

    const prefix = this.buildPrefix(title, projectSlug);
    const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

    const rawChunks = this.mergeParagraphs(paragraphs, prefix);

    return rawChunks.map((text, i) => ({
      chunkIndex: i,
      chunkText: text,
    }));
  }

  // ---------------------------------------------------------------------------

  private buildPrefix(title: string, projectSlug: string): string {
    const parts: string[] = [];
    if (title) parts.push(`Title: ${title}`);
    if (projectSlug) parts.push(`Project: ${projectSlug}`);
    return parts.length ? parts.join(' | ') + '\n\n' : '';
  }

  /**
   * Merge paragraphs into chunks of approximately `TARGET_CHUNK_TOKENS`.
   * When a single paragraph exceeds the target, split it by sentences with
   * overlap.
   */
  private mergeParagraphs(paragraphs: string[], prefix: string): string[] {
    const chunks: string[] = [];
    let buffer = '';

    for (const para of paragraphs) {
      const candidate = buffer ? `${buffer}\n\n${para}` : para;

      if (estimateTokens(prefix + candidate) <= TARGET_CHUNK_TOKENS) {
        buffer = candidate;
        continue;
      }

      // Flush current buffer if non-empty
      if (buffer) {
        chunks.push(prefix + buffer);
        buffer = '';
      }

      // If the paragraph alone exceeds target, split by sentences
      if (estimateTokens(prefix + para) > TARGET_CHUNK_TOKENS) {
        const sentenceChunks = this.splitBySentences(para, prefix);
        chunks.push(...sentenceChunks);
      } else {
        buffer = para;
      }
    }

    // Flush remaining buffer
    if (buffer) {
      chunks.push(prefix + buffer);
    }

    return chunks.filter((c) => c.trim().length >= MIN_CHUNK_CHARS);
  }

  /**
   * Split a long paragraph into sentence-level chunks with overlap.
   */
  private splitBySentences(text: string, prefix: string): string[] {
    // Split on sentence-ending punctuation followed by whitespace
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (sentences.length <= 1) {
      // Can't split further — return as-is
      return [prefix + text];
    }

    const chunks: string[] = [];
    let buffer = '';
    let overlapBuffer = '';

    for (const sentence of sentences) {
      const candidate = buffer ? `${buffer} ${sentence}` : sentence;

      if (estimateTokens(prefix + candidate) <= TARGET_CHUNK_TOKENS) {
        buffer = candidate;
        continue;
      }

      // Flush current buffer
      if (buffer) {
        chunks.push(prefix + buffer);

        // Keep last sentences that fit in overlap as start of next chunk
        overlapBuffer = this.extractOverlap(buffer);
        buffer = overlapBuffer ? `${overlapBuffer} ${sentence}` : sentence;
      } else {
        // Single sentence exceeds target — include as-is
        buffer = sentence;
      }
    }

    if (buffer) {
      chunks.push(prefix + buffer);
    }

    return chunks;
  }

  /**
   * Extract the last portion of text that fits within OVERLAP_TOKENS
   * to use as overlap for the next chunk.
   */
  private extractOverlap(text: string): string {
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const result: string[] = [];
    let tokens = 0;

    for (let i = sentences.length - 1; i >= 0; i--) {
      const sentTokens = estimateTokens(sentences[i]);
      if (tokens + sentTokens > OVERLAP_TOKENS) break;
      tokens += sentTokens;
      result.unshift(sentences[i]);
    }

    return result.join(' ');
  }
}
