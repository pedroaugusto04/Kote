import { Injectable } from '@nestjs/common';
import { KnowledgeMapNodeTypeEnum, type KnowledgeMapLink, type KnowledgeMapNode, type ProjectKnowledgeMapResponse } from '../../models/project-knowledge-map.models.js';
import { NoteEmbeddingRepository } from '../../ports/notes/note-embedding.repository.js';

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function findMedoidNote(members: KnowledgeMapNode[], embeddingsByNoteId: Map<string, number[]>): KnowledgeMapNode {
  if (members.length <= 2) return members[0];
  let maxSumSim = -1;
  let medoid = members[0];
  for (const candidate of members) {
    const candidateVec = embeddingsByNoteId.get(candidate.noteId!);
    if (!candidateVec) continue;
    let sumSim = 0;
    for (const other of members) {
      const otherVec = embeddingsByNoteId.get(other.noteId!);
      if (otherVec) sumSim += cosineSimilarity(candidateVec, otherVec);
    }
    if (sumSim > maxSumSim) {
      maxSumSim = sumSim;
      medoid = candidate;
    }
  }
  return medoid;
}

@Injectable()
export class SemanticClusteringService {
  constructor(private readonly noteEmbeddingRepository: NoteEmbeddingRepository) {}

  async clusterKnowledgeMap(
    userId: string,
    baseMap: ProjectKnowledgeMapResponse,
    similarityThreshold = 0.80,
  ): Promise<ProjectKnowledgeMapResponse> {
    const noteNodes = baseMap.nodes.filter((node) => node.type === KnowledgeMapNodeTypeEnum.Note && node.noteId);
    if (noteNodes.length < 2) return baseMap;

    const noteIds = noteNodes.map((n) => n.noteId!).filter(Boolean);
    const embeddingsByNoteId = new Map<string, number[]>();

    // Chunk noteIds into safe batches of 50 to prevent huge SQL IN clauses or memory spikes
    const BATCH_SIZE = 50;
    for (let i = 0; i < noteIds.length; i += BATCH_SIZE) {
      const batchIds = noteIds.slice(i, i + BATCH_SIZE);
      try {
        const chunks = await this.noteEmbeddingRepository.getNotesEmbeddings(userId, batchIds);
        chunks.forEach((chunk) => {
          if (!embeddingsByNoteId.has(chunk.noteId) && chunk.embedding?.length > 0) {
            embeddingsByNoteId.set(chunk.noteId, chunk.embedding);
          }
        });
      } catch {
        // Skip missing embeddings gracefully
      }
    }

    const validNotes = noteNodes.filter((node) => embeddingsByNoteId.has(node.noteId!));
    if (validNotes.length < 2) return baseMap;

    // Cluster notes based on cosine similarity
    const visited = new Set<string>();
    const clusters: Array<{ centroidNote: KnowledgeMapNode; members: KnowledgeMapNode[] }> = [];

    for (let i = 0; i < validNotes.length; i++) {
      const current = validNotes[i];
      if (visited.has(current.id)) continue;

      const currentVec = embeddingsByNoteId.get(current.noteId!)!;
      const group: KnowledgeMapNode[] = [current];
      visited.add(current.id);

      for (let j = i + 1; j < validNotes.length; j++) {
        const candidate = validNotes[j];
        if (visited.has(candidate.id)) continue;

        const candidateVec = embeddingsByNoteId.get(candidate.noteId!)!;
        const sim = cosineSimilarity(currentVec, candidateVec);
        if (sim >= similarityThreshold) {
          group.push(candidate);
          visited.add(candidate.id);
        }
      }

      if (group.length >= 2) {
        // Find the medoid (most representative central note of the cluster)
        const medoid = findMedoidNote(group, embeddingsByNoteId);
        clusters.push({ centroidNote: medoid, members: group });
      }
    }

    if (clusters.length === 0) return baseMap;

    // Build condensed topic nodes and links
    const newNodes = [...baseMap.nodes];
    const newLinks = [...baseMap.links];
    const clusteredNoteIds = new Set<string>();

    clusters.forEach((cluster, index) => {
      const topicId = `topic:cluster_${index}_${cluster.centroidNote.noteId}`;
      const memberNoteIds = cluster.members.map((m) => m.id);
      memberNoteIds.forEach((id) => clusteredNoteIds.add(id));

      const topicNode: KnowledgeMapNode = {
        id: topicId,
        type: KnowledgeMapNodeTypeEnum.Topic,
        label: cluster.centroidNote.label,
        subtitle: `${cluster.members.length} notas semelhantes`,
        childNoteIds: memberNoteIds,
        childCount: cluster.members.length,
        projectSlug: baseMap.projectSlug,
        size: Math.min(22, 14 + cluster.members.length * 2),
      };

      newNodes.push(topicNode);

      // Link topic hub node directly to its cluster member notes with strong physical attraction
      cluster.members.forEach((member) => {
        const linkId = `contains:${topicId}->${member.id}`;
        if (!newLinks.some((l) => l.id === linkId)) {
          newLinks.push({
            id: linkId,
            source: topicId,
            target: member.id,
            type: 'contains',
            strength: 0.85,
          });
        }
      });

      // Link topic to project or folder/category
      const sampleMember = cluster.members[0];
      const memberLinks = baseMap.links.filter(
        (l) => l.source === sampleMember.id || l.target === sampleMember.id,
      );

      memberLinks.forEach((link) => {
        const otherId = link.source === sampleMember.id ? link.target : link.source;
        if (!memberNoteIds.includes(otherId) && !otherId.startsWith('topic:')) {
          const linkId = `contains:${topicId}->${otherId}`;
          if (!newLinks.some((l) => l.id === linkId)) {
            newLinks.push({
              id: linkId,
              source: topicId,
              target: otherId,
              type: link.type,
              strength: 0.5,
            });
          }
        }
      });
    });

    return {
      ...baseMap,
      nodes: newNodes,
      links: newLinks,
    };
  }
}
