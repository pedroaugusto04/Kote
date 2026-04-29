import { CanonicalType, Importance, KnowledgeKind, KnowledgeStatus } from '../contracts/enums.js';
import type { IngestPayload } from '../contracts/ingest.js';

export function inferCanonicalType(kind: IngestPayload['classification']['kind'], decisionFlag = false): IngestPayload['classification']['canonicalType'] {
  if (decisionFlag) return CanonicalType.Decision;
  if (kind === KnowledgeKind.Bug) return CanonicalType.Incident;
  if (kind === KnowledgeKind.Summary || kind === KnowledgeKind.Article) return CanonicalType.Knowledge;
  return CanonicalType.Event;
}

export function defaultImportance(kind: IngestPayload['classification']['kind']): IngestPayload['classification']['importance'] {
  if (kind === KnowledgeKind.Bug) return Importance.High;
  if (kind === KnowledgeKind.Summary || kind === KnowledgeKind.Article || kind === KnowledgeKind.Daily) return Importance.Medium;
  return Importance.Low;
}

export function defaultStatus(canonicalType: IngestPayload['classification']['canonicalType']): IngestPayload['classification']['status'] {
  if (canonicalType === CanonicalType.Incident || canonicalType === CanonicalType.Followup || canonicalType === CanonicalType.Reminder) {
    return KnowledgeStatus.Open;
  }
  return KnowledgeStatus.Active;
}
