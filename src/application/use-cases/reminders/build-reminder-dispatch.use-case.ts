import { Injectable } from '@nestjs/common';

import { ReminderDispatchMode } from '../../../contracts/enums.js';
import { slugify } from '../../../domain/strings.js';
import { currentSaoPauloDateTime } from '../../../domain/time.js';
import { ContentQueryRepository, ReminderDispatchRepository } from '../../ports/repositories.js';

@Injectable()
export class BuildReminderDispatchUseCase {
  constructor(
    private readonly contentQueryRepository: ContentQueryRepository,
    private readonly reminderDispatchRepository: ReminderDispatchRepository,
  ) {}

  async execute(mode: ReminderDispatchMode, userId: string, workspaceSlug = 'default') {
    const workspace = slugify(workspaceSlug) || 'default';
    const reminders = (await this.contentQueryRepository.listReminders(userId)).filter(
      (reminder) => reminder.workspace === workspace && (reminder.status === 'open' || reminder.status === 'active'),
    );
    const now = currentSaoPauloDateTime();
    if (mode === ReminderDispatchMode.Daily) {
      const pending = [];
      for (const reminder of reminders) {
        if (!(await this.reminderDispatchRepository.hasSent(userId, workspace, ReminderDispatchMode.Daily, now.date, reminder.id))) pending.push(reminder);
      }
      if (!pending.length) return { ok: true, shouldSend: false, message: 'no_pending_daily_reminders' };
      const text = ['Lembretes ativos', `Data: ${now.date}`, '', ...pending.map((item) => `- [${item.project}] ${item.title} (${item.reminderDate}${item.reminderTime ? ` ${item.reminderTime}` : ''})`)].join('\n');
      await Promise.all(pending.map((item) => this.reminderDispatchRepository.markSent(userId, workspace, ReminderDispatchMode.Daily, now.date, item.id)));
      return { ok: true, shouldSend: true, text, remindersArg: pending.map((item) => item.id).join(',') };
    }
    const due = reminders.filter((item) => item.reminderDate === now.date && item.reminderTime === now.time);
    const pending = [];
    const dispatchKey = `${now.date}T${now.time}`;
    for (const reminder of due) {
      if (!(await this.reminderDispatchRepository.hasSent(userId, workspace, ReminderDispatchMode.Exact, dispatchKey, reminder.id))) pending.push(reminder);
    }
    if (!pending.length) return { ok: true, shouldSend: false, message: 'no_due_reminders' };
    const text = ['Lembrete do momento', `Agora: ${now.date} ${now.time}`, '', ...pending.map((item) => `- [${item.project}] ${item.title}`)].join('\n');
    return { ok: true, shouldSend: true, text, remindersArg: pending.map((item) => item.id).join(',') };
  }
}
