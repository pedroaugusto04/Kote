import { z } from 'zod';

export const loginBodySchema = z
  .object({
    email: z.string().trim().email('Informe um email valido.'),
    password: z.string().min(1, 'Informe a senha.'),
  })
  .strict();

export const signupBodySchema = loginBodySchema.extend({
  name: z.string().trim().min(1, 'Informe seu nome.'),
});

export type LoginBody = z.infer<typeof loginBodySchema>;
export type SignupBody = z.infer<typeof signupBodySchema>;
