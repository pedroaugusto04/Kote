export type AutoActionGlobal = {
  enabled: boolean;
  action: 'none' | 'resolved' | 'archived';
  afterHours: number | null;
  updatedAt: string;
};

export abstract class SettingsRepository {
  abstract getAutoActionGlobal(userId: string): Promise<AutoActionGlobal | null>;
  abstract setAutoActionGlobal(userId: string, input: { enabled: boolean; action: 'none' | 'resolved' | 'archived'; afterHours?: number | null }): Promise<AutoActionGlobal>;
}
