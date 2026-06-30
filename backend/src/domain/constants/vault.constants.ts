export const VAULT_FOLDERS = {
  HOME: '00 Home',
  PROJECTS: '10 Projects',
  INBOX: '20 Inbox',
  KNOWLEDGE: '30 Knowledge',
  INCIDENTS: '40 Incidents',
  FOLLOWUPS: '50 Followups',
  ASSETS: '90 Assets',
} as const;

export type VaultFolder = (typeof VAULT_FOLDERS)[keyof typeof VAULT_FOLDERS];
