export function chunkRankKey(noteId: string, chunkIndex: number): string {
  return `${noteId}_${chunkIndex}`;
}

export type HybridChunkCandidate<TChunk extends { noteId: string; chunkIndex: number }, TNote> = {
  chunk: TChunk;
  note: TNote;
  vectorScore: number;
  keywordScore: number;
};

export type RankedHybridChunk<TChunk, TNote> = {
  chunk: TChunk;
  note: TNote;
  hybridScore: number;
};

export function rankHybridContextChunks<TChunk extends { noteId: string; chunkIndex: number }, TNote>(
  candidates: HybridChunkCandidate<TChunk, TNote>[],
  options: {
    vectorWeight: number;
    keywordWeight: number;
    rrfK: number;
    topLimit: number;
  },
): RankedHybridChunk<TChunk, TNote>[] {
  const { vectorWeight, keywordWeight, rrfK, topLimit } = options;

  const vectorRankMap = buildRankMap(
    candidates.filter((candidate) => candidate.vectorScore > 0),
    (candidate) => chunkRankKey(candidate.chunk.noteId, candidate.chunk.chunkIndex),
    (left, right) => {
      if (right.vectorScore !== left.vectorScore) return right.vectorScore - left.vectorScore;
      return chunkRankKey(left.chunk.noteId, left.chunk.chunkIndex)
        .localeCompare(chunkRankKey(right.chunk.noteId, right.chunk.chunkIndex));
    },
  );

  const keywordRankMap = buildRankMap(
    candidates.filter((candidate) => candidate.keywordScore > 0),
    (candidate) => chunkRankKey(candidate.chunk.noteId, candidate.chunk.chunkIndex),
    (left, right) => {
      if (right.keywordScore !== left.keywordScore) return right.keywordScore - left.keywordScore;
      return chunkRankKey(left.chunk.noteId, left.chunk.chunkIndex)
        .localeCompare(chunkRankKey(right.chunk.noteId, right.chunk.chunkIndex));
    },
  );

  return candidates
    .map((candidate) => {
      const key = chunkRankKey(candidate.chunk.noteId, candidate.chunk.chunkIndex);
      const vectorRank = vectorRankMap.get(key);
      const keywordRank = keywordRankMap.get(key);
      const hybridScore =
        (vectorRank ? vectorWeight / (rrfK + vectorRank) : 0)
        + (keywordRank ? keywordWeight / (rrfK + keywordRank) : 0);

      return { chunk: candidate.chunk, note: candidate.note, hybridScore };
    })
    .filter((item) => item.hybridScore > 0)
    .sort((left, right) => right.hybridScore - left.hybridScore)
    .slice(0, topLimit);
}

function buildRankMap<T>(
  items: T[],
  keyOf: (item: T) => string,
  compare: (left: T, right: T) => number,
): Map<string, number> {
  const ranked = [...items].sort(compare);
  const rankMap = new Map<string, number>();
  ranked.forEach((item, index) => {
    rankMap.set(keyOf(item), index + 1);
  });
  return rankMap;
}
