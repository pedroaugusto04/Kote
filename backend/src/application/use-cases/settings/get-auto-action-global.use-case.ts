import { Injectable } from '@nestjs/common';
import { SettingsRepository } from '../../ports/settings.repository.js';

@Injectable()
export class GetAutoActionGlobalUseCase {
  constructor(private readonly settingsRepository: SettingsRepository) {}

  async execute(userId: string) {
    return this.settingsRepository.getAutoActionGlobal(userId);
  }
}
