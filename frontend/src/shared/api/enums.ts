export enum IntegrationSetupStatus {
  Connected = 'connected',
  Partial = 'partial',
  Missing = 'missing',
}

export enum StoredIntegrationStatus {
  Connected = 'connected',
  Missing = 'missing',
  Revoked = 'revoked',
}

export enum HomeTargetKind {
  Note = 'note',
  Review = 'review',
  Project = 'project',
}

export enum HomePriorityType {
  Reminder = 'reminder',
  Finding = 'finding',
  Incident = 'incident',
  Followup = 'followup',
}
