export type SynthesisItemKind = 'goal' | 'outcome' | 'decision' | 'change' | 'failed_attempt' | 'open_item' | 'fact';
export type SynthesisItemStatus = 'current' | 'historical' | 'rejected' | 'superseded' | 'unknown';

export type NoteSynthesisItem = {
  kind: SynthesisItemKind;
  text: string;
  status: SynthesisItemStatus;
  turnRefs: number[];
  files?: string[];
  entities?: string[];
};

export type NoteSynthesisRecord = {
  id: string;
  userId: string;
  noteId: string;
  status: NoteSynthesisStatus;
  mode: 'ai' | 'deterministic';
  overview: string;
  memory: NoteSynthesisItem[];
  sourceHash: string;
  provider: string;
  model: string;
  errorCode: string | null;
  availableAt?: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
import type { NoteSynthesisStatus } from '../constants/ai-session-synthesis.constants.js';
