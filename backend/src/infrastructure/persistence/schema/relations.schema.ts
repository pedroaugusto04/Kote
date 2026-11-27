import { relations } from 'drizzle-orm';
import { users } from './auth.schema.js';
import {
  askHistory,
  attachments,
  categories,
  noteCategories,
  noteLinks,
  notes,
  projectFolders,
  projects,
  workspaces,
} from './content.schema.js';
import {
  conversationStates,
  externalIdentities,
  integrationConnectionSessions,
  integrationCredentials,
  pushSubscriptions,
  reminderDispatchState,
  webhookEvents,
  webhookSubscriptions,
} from './integrations.schema.js';
import { noteCommitLinks } from './git-commits.schema.js';
import {
  quotaAdjustments,
  quotaUsageEvents,
  userSubscriptions,
} from './billing.schema.js';

// Cross-domain Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  integrationCredentials: many(integrationCredentials),
  externalIdentities: many(externalIdentities),
  integrationConnectionSessions: many(integrationConnectionSessions),
  workspaces: many(workspaces),
  projects: many(projects),
  notes: many(notes),
  noteLinks: many(noteLinks),
  attachments: many(attachments),
  conversationStates: many(conversationStates),
  reminderDispatchState: many(reminderDispatchState),
  webhookEvents: many(webhookEvents),
  projectFolders: many(projectFolders),
  pushSubscriptions: many(pushSubscriptions),
  askHistory: many(askHistory),
  webhookSubscriptions: many(webhookSubscriptions),
  categories: many(categories),
  subscription: one(userSubscriptions, {
    fields: [users.id],
    references: [userSubscriptions.userId],
  }),
  quotaUsageEvents: many(quotaUsageEvents),
  quotaAdjustments: many(quotaAdjustments),
}));

export const notesRelations = relations(notes, ({ one, many }) => ({
  user: one(users, {
    fields: [notes.userId],
    references: [users.id],
  }),
  folder: one(projectFolders, {
    fields: [notes.folderId],
    references: [projectFolders.id],
  }),
  attachments: many(attachments),
  noteLinks: many(noteLinks),
  noteCategories: many(noteCategories),
  commitLinks: many(noteCommitLinks),
}));
