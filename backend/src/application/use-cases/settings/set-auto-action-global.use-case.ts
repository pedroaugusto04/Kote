import { Injectable } from '@nestjs/common';
import { SettingsRepository } from '../../ports/settings.repository.js';

@Injectable()
export class SetAutoActionGlobalUseCase {
  constructor(private readonly settingsRepository: SettingsRepository) {}

  async execute(userId: string, input: { enabled: boolean; action: 'none' | 'resolved' | 'archived'; afterHours?: number | null }) {
    return this.settingsRepository.setAutoActionGlobal(userId, input);
  }
}
