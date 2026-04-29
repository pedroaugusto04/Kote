import { z } from 'zod';

export type AuthMode = 'login' | 'signup';

export type AuthFormValues = {
  name: string;
  email: string;
  password: string;
};

const authFormBaseSchema = z.object({
  name: z.string().trim(),
  email: z.string().trim().email('Informe um email valido.'),
  password: z.string().min(8, 'Use pelo menos 8 caracteres.'),
});

export function createAuthFormSchema(mode: AuthMode) {
  return authFormBaseSchema.superRefine((values, ctx) => {
    if (mode === 'signup' && values.name.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['name'],
        message: 'Informe seu nome.',
      });
    }
  });
}
