export enum IntegrationSetupStatus {
  Connected = 'connected',
  Partial = 'partial',
  Missing = 'missing',
}

export enum StoredIntegrationStatus {
  Connected = 'connected',
  Missing = 'missing',
  Revoked = 'revoked',
  Pending = 'pending',
  Error = 'error',
  Disabled = 'disabled',
}

export enum HomeTargetKind {
  Note = 'note',
  Project = 'project',
}

export enum HomePriorityType {
  Reminder = 'reminder',
  Finding = 'finding',
  Incident = 'incident',
  Followup = 'followup',
}
