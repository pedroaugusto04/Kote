import { z } from 'zod';

export const workspaceFormSchema = z.object({
  displayName: z.string().trim().min(1, 'Informe o nome do workspace.').max(120, 'Use no maximo 120 caracteres.'),
  workspaceSlug: z.string().trim().min(1, 'Informe o slug do workspace.').max(80, 'Use no maximo 80 caracteres.').regex(/^[a-z0-9._-]+$/, 'Use apenas letras minusculas, numeros, ponto, hifen ou underline.'),
});

export type WorkspaceFormValues = z.infer<typeof workspaceFormSchema>;
