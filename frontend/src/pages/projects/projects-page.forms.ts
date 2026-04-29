import { z } from 'zod';

const optionalSlugSchema = z.string().trim().max(80, 'Use no maximo 80 caracteres.').refine((value) => !value || /^[a-z0-9._-]+$/.test(value), 'Use apenas letras minusculas, numeros, ponto, hifen ou underline.');
const optionalRepoSchema = z.string().trim().max(180, 'Use no maximo 180 caracteres.').refine((value) => !value || /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value), 'Use o formato owner/repositorio.');

export const projectFormSchema = z.object({
  displayName: z.string().trim().min(1, 'Informe o nome do projeto.').max(120, 'Use no maximo 120 caracteres.'),
  projectSlug: optionalSlugSchema,
  repoFullName: optionalRepoSchema,
  aliases: z.string().max(500, 'Use no maximo 500 caracteres.'),
  defaultTags: z.string().max(500, 'Use no maximo 500 caracteres.'),
});

export type ProjectFormValues = z.infer<typeof projectFormSchema>;

export const noteFormSchema = z.object({
  title: z.string().trim().max(160, 'Use no maximo 160 caracteres.'),
  rawText: z.string().trim().min(1, 'Informe o texto da nota.').max(20000, 'Use no maximo 20000 caracteres.'),
  tags: z.string().max(500, 'Use no maximo 500 caracteres.'),
  reminderDate: z.string(),
  reminderTime: z.string(),
}).superRefine((values, ctx) => {
  if (values.reminderTime && !values.reminderDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reminderTime'],
      message: 'Informe a data do lembrete antes da hora.',
    });
  }
});

export type NoteFormValues = z.infer<typeof noteFormSchema>;
