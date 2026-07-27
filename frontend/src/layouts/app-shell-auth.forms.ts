import { z } from 'zod';

export type AuthMode = 'login' | 'signup';

export type AuthFormValues = {
  name: string;
  email: string;
  password: string;
};

const authFormBaseSchema = z.object({ 
  name: z.string().trim(),
  email: z.string().trim().email('Enter a valid email.'),
  password: z.string().min(8, 'Use at least 8 characters.'),
});

export function createAuthFormSchema(mode: AuthMode) {
  return authFormBaseSchema.superRefine((values, ctx) => {
    if (mode === 'signup' && values.name.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['name'],
        message: 'Enter your name.',
      });
    }
  });
}
