import { Injectable } from '@nestjs/common';

import { ReminderDispatchMode } from '../../../contracts/enums.js';
import { isReminderDispatchEligibleStatus } from '../../../domain/note-status.js';
import { slugify } from '../../../domain/strings.js';
import { currentDateTimeInTimeZone } from '../../../domain/time.js';
import { ContentQueryRepository } from '../../ports/content.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/runtime-environment.port.js';
import { ReminderDispatchRepository } from '../../ports/workflow-state.repository.js';
import { formatReminderScheduledAtLabel, resolveReminderScheduledAt } from './reminder-schedule.js';

@Injectable()
export class BuildReminderDispatchUseCase {
  constructor(
    private readonly contentQueryRepository: ContentQueryRepository,
    private readonly reminderDispatchRepository: ReminderDispatchRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
  ) {}

  async execute(mode: ReminderDispatchMode, userId: string, workspaceSlug = 'default', nowDate = new Date()) {
    const workspace = slugify(workspaceSlug) || 'default';
    const reminderTimeZone = this.environmentProvider.read().reminderTimeZone;
    const reminders = (await this.contentQueryRepository.listReminders(userId)).filter(
      (reminder) => reminder.workspace === workspace && isReminderDispatchEligibleStatus(reminder.status),
    );
    const now = currentDateTimeInTimeZone(mode === ReminderDispatchMode.Daily ? reminderTimeZone : 'UTC', nowDate);
    const nowMinuteKey = `${now.date}T${now.time}`;
    if (mode === ReminderDispatchMode.Daily) {
      if (now.time !== '09:00') return { ok: true, shouldSend: false, message: 'outside_daily_dispatch_window' };
      const pending = [];
      for (const reminder of reminders) {
        if (!(await this.reminderDispatchRepository.hasSent(userId, workspace, ReminderDispatchMode.Daily, now.date, reminder.id))) pending.push(reminder);
      }
      if (!pending.length) return { ok: true, shouldSend: false, message: 'no_pending_daily_reminders' };
      const text = [
        'Active reminders',
        `Date: ${now.date}`,
        '',
        ...pending.flatMap((item, index) => [
          `- [${item.project}] ${item.title} (${formatReminderScheduledAtLabel(resolveReminderScheduledAt(item, reminderTimeZone))})`,
          `Text: ${item.noteText}`,
          ...(index === pending.length - 1 ? [] : ['']),
        ]),
      ].join('\n');
      await Promise.all(pending.map((item) => this.reminderDispatchRepository.markSent(userId, workspace, ReminderDispatchMode.Daily, now.date, item.id)));
      return {
        ok: true,
        shouldSend: true,
        text,
        remindersArg: pending.map((item) => item.id).join(','),
        ids: pending.map((item) => item.id),
        dispatchKey: now.date,
      };
    }
    const due = reminders.filter((item) => {
      const scheduledAt = resolveReminderScheduledAt(item, reminderTimeZone);
      if (!scheduledAt) return false;
      return scheduledAt.slice(0, 16) === nowMinuteKey;
    });
    const pending = [];
    const dispatchKey = nowMinuteKey;
    for (const reminder of due) {
      if (!(await this.reminderDispatchRepository.hasSent(userId, workspace, ReminderDispatchMode.Exact, dispatchKey, reminder.id))) pending.push(reminder);
    }
    if (!pending.length) return { ok: true, shouldSend: false, message: 'no_due_reminders' };
    const text = [
      'Reminder due now',
      `Now: ${now.date} ${now.time}:00`,
      '',
      ...pending.flatMap((item, index) => [
        `- [${item.project}] ${item.title}`,
        `Text: ${item.noteText}`,
        ...(index === pending.length - 1 ? [] : ['']),
      ]),
    ].join('\n');
    return {
      ok: true,
      shouldSend: true,
      text,
      remindersArg: pending.map((item) => item.id).join(','),
      ids: pending.map((item) => item.id),
      dispatchKey,
    };
  }
}
