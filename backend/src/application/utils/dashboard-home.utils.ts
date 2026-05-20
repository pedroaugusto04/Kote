import { CanonicalType, HomePriorityType, HomeTargetKind, KnowledgeStatus } from '../../contracts/enums.js';
import { formatDateInTimeZone, normalizeTimeZone } from '../../domain/time.js';
import type { Project } from '../../domain/projects.js';
import type { DashboardHomeSummary, HomePriority } from '../models/dashboard-home.models.js';
import type { ReminderView } from '../models/reminder.models.js';
import type { ReviewView } from '../models/review.models.js';
import type { VaultNoteSummary } from '../models/vault-note.models.js';

const HOME_WINDOW_DAYS = 7;
const OPEN_REMINDER_STATUSES = new Set<string>([KnowledgeStatus.Pending, KnowledgeStatus.Overdue]);
const ACTIVE_NOTE_STATUS = KnowledgeStatus.Active;
const INTERESTING_TYPES = [CanonicalType.Incident, CanonicalType.Decision, CanonicalType.Followup, CanonicalType.Event];

function normalizeDateInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(trimmed)) return trimmed.replace(' ', 'T');
  return trimmed;
}

function parseTimestamp(value: string): number {
  const normalized = normalizeDateInput(value);
  if (!normalized) return 0;
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function dateKey(value: string, timeZone: string) {
  const direct = value.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct && !value.includes('T')) return direct;
  const timestamp = parseTimestamp(value);
  return timestamp ? formatDateInTimeZone(new Date(timestamp), timeZone) : '';
}

function formatDayLabel(key: string) {
  const [, month, day] = key.match(/\d{4}-(\d{2})-(\d{2})/) || [];
  return month && day ? `${day}/${month}` : key;
}

function isHigh(severity: string) {
  return ['high', 'critical'].includes(severity.toLowerCase());
}

function isOpenReminder(status: string) {
  return OPEN_REMINDER_STATUSES.has(status.toLowerCase());
}

function isActiveNoteStatus(status: string | null | undefined) {
  return String(status || '').trim().toLowerCase() === ACTIVE_NOTE_STATUS;
}

function projectLabel(projects: Project[], slug: string) {
  return projects.find((project) => project.projectSlug === slug)?.displayName || slug || 'No project';
}

function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return formatDateInTimeZone(date, 'UTC');
}

function recentWindow(now: Date, windowDays: number, timeZone: string) {
  const end = formatDateInTimeZone(now, timeZone);
  const start = shiftDateKey(end, -(windowDays - 1));
  return { start, end };
}

function isWithinWindow(value: string, start: string, end: string, timeZone: string) {
  const key = dateKey(value, timeZone);
  return Boolean(key && key >= start && key <= end);
}

function noteTarget(note: VaultNoteSummary) {
  return { kind: HomeTargetKind.Note, id: note.id, path: note.path };
}

function findNoteByPath(notes: VaultNoteSummary[], path: string) {
  if (!path) return undefined;
  return notes.find((note) => note.path === path || note.path.endsWith(path));
}

function sortPriorities(left: HomePriority & { rank?: number; timestamp?: number }, right: HomePriority & { rank?: number; timestamp?: number }) {
  return (left.rank || 0) - (right.rank || 0) || (left.timestamp || 0) - (right.timestamp || 0) || left.title.localeCompare(right.title);
}

function homeEventCategory(note: VaultNoteSummary) {
  const source = String(note.source || '').toLowerCase();
  if (note.type === CanonicalType.Decision) return 'decision';
  if (source.includes('github')) return 'github-push';
  if (source.includes('whatsapp')) return 'whatsapp';
  return 'manual';
}

export function buildDashboardHome(
  projects: Project[],
  notes: VaultNoteSummary[],
  reviews: ReviewView[],
  reminders: ReminderView[],
  now = new Date(),
  timeZone = 'UTC',
): DashboardHomeSummary {
  const zone = normalizeTimeZone(timeZone);
  const { start, end } = recentWindow(now, HOME_WINDOW_DAYS, zone);
  const recentNotes = notes.filter((note) => isWithinWindow(note.date, start, end, zone));
  const openReminders = reminders.filter((reminder) => isOpenReminder(reminder.status));
  const overdueReminders = openReminders.filter((reminder) => reminder.isOverdue);
  const activeReviews = reviews.filter((review) => isActiveNoteStatus(findNoteByPath(notes, review.generatedNotePath)?.status));
  const openHighFindings = activeReviews.flatMap((review) => review.findings.filter((finding) => isHigh(finding.severity)).map((finding) => ({ review, finding })));
  const reviewsWithOpenFindings = activeReviews.filter((review) => review.findings.length > 0);
  const recentIncidentsAndFollowups = recentNotes.filter((note) => ['incident', 'followup'].includes(note.type) && isActiveNoteStatus(note.status));

  const dayKeys = Array.from({ length: HOME_WINDOW_DAYS }, (_, index) => shiftDateKey(start, index));
  const countByDay = new Map(dayKeys.map((key) => [key, 0]));
  for (const note of recentNotes) {
    const key = dateKey(note.date, zone);
    if (countByDay.has(key)) countByDay.set(key, (countByDay.get(key) || 0) + 1);
  }

  const countByProject = new Map<string, number>();
  for (const note of recentNotes) {
    countByProject.set(note.project, (countByProject.get(note.project) || 0) + 1);
  }

  const priorityCandidates: Array<HomePriority & { rank: number; timestamp: number }> = [
    ...openReminders.map((reminder) => {
      const timestamp = parseTimestamp(reminder.reminderAt);
      const relatedNote = findNoteByPath(notes, reminder.relativePath);
      const overdue = reminder.isOverdue;
      return {
        id: `reminder:${reminder.id}`,
        type: HomePriorityType.Reminder,
        title: reminder.title,
        project: reminder.project,
        date: reminder.reminderAt || reminder.reminderDate,
        description: overdue ? 'Pending and overdue reminder' : reminder.status === KnowledgeStatus.Sent ? 'Reminder sent' : 'Pending reminder',
        status: reminder.status,
        isOverdue: overdue,
        reminderDate: reminder.reminderDate,
        reminderTime: reminder.reminderTime,
        target: relatedNote ? noteTarget(relatedNote) : { kind: HomeTargetKind.Note, path: reminder.relativePath },
        rank: overdue ? 0 : 1,
        timestamp: timestamp || Date.parse(`${reminder.reminderDate}T${reminder.reminderTime || '00:00'}Z`) || Number.MAX_SAFE_INTEGER,
      };
    }),
    ...openHighFindings.map(({ review, finding }, index) => ({
      id: `finding:${review.id}:${index}`,
      type: HomePriorityType.Finding,
      title: review.title,
      project: review.project,
      date: review.date,
      description: finding.file ? `${finding.summary} (${finding.file})` : finding.summary,
      severity: finding.severity,
      target: { kind: HomeTargetKind.Note, id: review.id, path: review.generatedNotePath },
      rank: 2,
      timestamp: parseTimestamp(review.date) || Number.MAX_SAFE_INTEGER,
    })),
    ...recentIncidentsAndFollowups.map((note) => ({
      id: `note:${note.id}`,
      type: note.type === CanonicalType.Incident ? HomePriorityType.Incident : HomePriorityType.Followup,
      title: note.title,
      project: note.project,
      date: note.date,
      description: note.summary,
      status: note.status,
      target: noteTarget(note),
      rank: note.type === 'incident' ? 3 : 4,
      timestamp: parseTimestamp(note.date) || Number.MAX_SAFE_INTEGER,
    })),
  ];

  const recentInterestingEvents = recentNotes
    .filter((note) => INTERESTING_TYPES.includes(note.type as CanonicalType) && isActiveNoteStatus(note.status))
    .sort((left, right) => {
      const typePriority = INTERESTING_TYPES.indexOf(left.type as CanonicalType) - INTERESTING_TYPES.indexOf(right.type as CanonicalType);
      return typePriority || (parseTimestamp(right.date) || 0) - (parseTimestamp(left.date) || 0) || left.title.localeCompare(right.title);
    })
    .slice(0, 5)
    .map((note) => ({
      id: note.id,
      category: homeEventCategory(note),
      type: note.type,
      title: note.title,
      project: note.project,
      date: note.date,
      summary: note.summary,
      status: note.status,
      target: noteTarget(note),
    }));

  return {
    windowDays: HOME_WINDOW_DAYS,
    metrics: [
      { id: 'recent-notes', label: 'Recent changes', value: recentNotes.length, meta: `notes in ${HOME_WINDOW_DAYS} days`, tone: 'active' },
      { id: 'active-projects', label: 'Active projects', value: countByProject.size, meta: 'with recent movement', tone: 'active' },
      { id: 'open-reminders', label: 'Open reminders', value: openReminders.length, meta: `${overdueReminders.length} overdue`, tone: overdueReminders.length ? 'high' : 'active' },
      {
        id: 'open-findings',
        label: 'Open findings',
        value: openHighFindings.length,
        meta: `${reviewsWithOpenFindings.length} reviews with pending findings`,
        tone: openHighFindings.length ? 'high' : 'active',
      },
    ],
    activityByDay: dayKeys.map((key) => ({ date: key, label: formatDayLabel(key), count: countByDay.get(key) || 0 })),
    activityByProject: Array.from(countByProject.entries())
      .map(([project, count]) => ({ project, label: projectLabel(projects, project), count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 5),
    priorities: priorityCandidates.sort(sortPriorities).slice(0, 5).map(({ rank: _rank, timestamp: _timestamp, ...priority }) => priority),
    recentInterestingEvents,
  };
}
