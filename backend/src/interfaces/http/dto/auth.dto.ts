import { z } from 'zod';

export const loginBodySchema = z
  .object({
    email: z.string().trim().email('Enter a valid email.'),
    password: z.string().min(1, 'Enter the password.'),
  })
  .strict();

export const signupBodySchema = loginBodySchema.extend({
  name: z.string().trim().min(1, 'Enter your name.'),
});

export const exchangeConnectionTokenBodySchema = z
  .object({
    connectionToken: z.string().trim().min(1, 'Connection token is required.'),
  })
  .strict();

export type LoginBody = z.infer<typeof loginBodySchema>;
export type SignupBody = z.infer<typeof signupBodySchema>;
export type ExchangeConnectionTokenBody = z.infer<typeof exchangeConnectionTokenBodySchema>;

