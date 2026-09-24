import { z } from 'zod';

export const sessionHandoffBodySchema = z.object({
  rawText: z.string().trim().max(1000000).optional(),
  noteId: z.string().trim().optional(),
  provider: z.string().trim().default('unknown'),
  projectSlug: z.string().trim().optional(),
  workspaceSlug: z.string().trim().optional(),
  autoDetectPrevious: z.boolean().default(true),
});

export type SessionHandoffBody = z.infer<typeof sessionHandoffBodySchema>;

export type { SessionHandoffResponse } from '../../../application/models/session-handoff.models.js';

