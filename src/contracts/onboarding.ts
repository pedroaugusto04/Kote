import { z } from 'zod';

import { slugify } from '../domain/strings.js';
import { OnboardingOperation } from './enums.js';

const onboardingProjectSchema = z
  .object({
    projectSlug: z.string().min(1),
    displayName: z.string().min(1),
    repoFullName: z.string().default(''),
    aliases: z.array(z.string()).default([]),
    defaultTags: z.array(z.string()).default([]),
  })
  .transform((item) => ({
    ...item,
    projectSlug: slugify(item.projectSlug) || 'inbox',
    aliases: item.aliases.map((value) => slugify(value)).filter(Boolean),
    defaultTags: item.defaultTags.map((value) => slugify(value)).filter(Boolean),
  }));

export const onboardingInputSchema = z
  .object({
    operation: z.nativeEnum(OnboardingOperation).default(OnboardingOperation.Status),
    workspaceSlug: z.string().min(1),
    displayName: z.string().default(''),
    whatsappGroupJid: z.string().default(''),
    telegramChatId: z.string().default(''),
    githubRepos: z.array(z.string()).default([]),
    projects: z.array(onboardingProjectSchema).default([]),
  })
  .transform((input) => ({
    ...input,
    workspaceSlug: slugify(input.workspaceSlug) || 'default',
  }));

export type OnboardingInput = z.infer<typeof onboardingInputSchema>;
