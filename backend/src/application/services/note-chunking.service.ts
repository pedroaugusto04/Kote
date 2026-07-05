import { Injectable } from '@nestjs/common';

export type NoteChunk = {
  chunkIndex: number;
  chunkText: string;
};

export type NoteChunkAttachment = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
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
    path?: string;
    attachments?: NoteChunkAttachment[];
  }): NoteChunk[] {
    const { title, body, projectSlug, path = '', attachments = [] } = params;

    if (!body || body.trim().length < MIN_CHUNK_CHARS) {
      // Single chunk for very short notes
      const text = this.buildPrefix(title, projectSlug, path, attachments) + (body || '').trim();
      if (text.trim().length < MIN_CHUNK_CHARS) return [];
      return [{ chunkIndex: 0, chunkText: text }];
    }

    const prefix = this.buildPrefix(title, projectSlug, path, attachments);
    
    // Split alternating code blocks and plain text
    const segments: string[] = [];
    const parts = body.split(/(\`\`\`[\s\S]*?\`\`\`)/g);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;
      if (i % 2 === 1) {
        // Code block segment - keep intact as one segment
        segments.push(part);
      } else {
        // Normal text segment - split by paragraphs
        const paras = part.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
        segments.push(...paras);
      }
    }

    const rawChunks = this.mergeParagraphs(segments, prefix);

    return rawChunks.map((text, i) => ({
      chunkIndex: i,
      chunkText: text,
    }));
  }

  // ---------------------------------------------------------------------------

  private buildPrefix(title: string, projectSlug: string, path: string, attachments: NoteChunkAttachment[] = []): string {
    const parts: string[] = [];
    if (title) parts.push(`Title: ${title}`);
    if (projectSlug) parts.push(`Project: ${projectSlug}`);
    if (path) {
      const shortPath = formatShortPath(path);
      if (shortPath) parts.push(`Path: ${shortPath}`);
    }
    const attachmentSummary = formatAttachmentSummary(attachments);
    if (attachmentSummary) parts.push(`Attachments: ${attachmentSummary}`);
    return parts.length ? parts.join(' | ') + '\n\n' : '';
  }

  /**
   * Merge paragraphs/code-blocks into chunks of approximately `TARGET_CHUNK_TOKENS`.
   * When a single item exceeds the target, split it by sentences (for text)
   * or by lines (for code blocks) with overlap.
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

      // If the paragraph/code-block alone exceeds target, split it
      if (estimateTokens(prefix + para) > TARGET_CHUNK_TOKENS) {
        if (para.startsWith('```')) {
          const codeChunks = this.splitCodeBlockByLines(para, prefix);
          chunks.push(...codeChunks);
        } else {
          const sentenceChunks = this.splitBySentences(para, prefix);
          chunks.push(...sentenceChunks);
        }
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
   * Split a long code block into line-level chunks with line-level overlap,
   * wrapped back in triple-backticks to preserve syntax structure.
   */
  private splitCodeBlockByLines(text: string, prefix: string): string[] {
    const match = text.match(/^```(\w*)/);
    const lang = match ? match[1] : '';
    const content = text.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
    const lines = content.split('\n');

    if (lines.length <= 1) {
      return [prefix + text];
    }

    const chunks: string[] = [];
    let lineBuffer: string[] = [];

    for (const line of lines) {
      const candidateLines = [...lineBuffer, line];
      const candidateBlock = `\`\`\`${lang}\n${candidateLines.join('\n')}\n\`\`\``;

      if (estimateTokens(prefix + candidateBlock) <= TARGET_CHUNK_TOKENS) {
        lineBuffer.push(line);
        continue;
      }

      if (lineBuffer.length > 0) {
        chunks.push(prefix + `\`\`\`${lang}\n${lineBuffer.join('\n')}\n\`\`\``);
        // Overlap: keep the last 3 lines for context if possible
        lineBuffer = lineBuffer.slice(-3);
      }

      lineBuffer.push(line);
    }

    if (lineBuffer.length > 0) {
      chunks.push(prefix + `\`\`\`${lang}\n${lineBuffer.join('\n')}\n\`\`\``);
    }

    return chunks;
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

function formatAttachmentSummary(attachments: NoteChunkAttachment[]): string {
  const fileNames = attachments
    .map((attachment) => String(attachment.fileName || '').trim())
    .filter(Boolean);

  if (fileNames.length === 0) return '';
  if (fileNames.length <= 3) {
    return fileNames.join(', ');
  }
  return `${fileNames.slice(0, 3).join(', ')}... and ${fileNames.length - 3} more`;
}

function formatShortPath(path: string): string {
  if (!path) return '';
  const segments = path.replace(/^\//, '').split('/');
  if (segments.length > 2) {
    return segments.slice(-2).join('/');
  }
  return path;
}
