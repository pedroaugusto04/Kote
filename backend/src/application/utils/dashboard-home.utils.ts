import { CanonicalType, HomePriorityType, HomeTargetKind, KnowledgeStatus } from '../../contracts/enums.js';
import type { Project } from '../../domain/projects.js';
import type { DashboardHomeSummary, HomePriority } from '../models/dashboard-home.models.js';
import type { ReminderView } from '../models/reminder.models.js';
import type { ReviewView } from '../models/review.models.js';
import type { VaultNoteSummary } from '../models/vault-note.models.js';

const HOME_WINDOW_DAYS = 7;
const OPEN_STATUSES = new Set([KnowledgeStatus.Open, KnowledgeStatus.Active, 'pending', 'todo']);
const INTERESTING_TYPES = [CanonicalType.Incident, CanonicalType.Decision, CanonicalType.Followup, CanonicalType.Reminder, CanonicalType.Event];

function normalizeDateInput(value: string) {
  const trimmed = String(value || '').trim();
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

function dateKey(value: string) {
  const direct = String(value || '').match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  const timestamp = parseTimestamp(value);
  return timestamp ? new Date(timestamp).toISOString().slice(0, 10) : '';
}

function formatDayLabel(key: string) {
  const [, month, day] = key.match(/\d{4}-(\d{2})-(\d{2})/) || [];
  return month && day ? `${day}/${month}` : key;
}

function startOfDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function isOpen(status: string) {
  return OPEN_STATUSES.has(String(status || '').toLowerCase());
}

function isHigh(severity: string) {
  return ['high', 'critical'].includes(String(severity || '').toLowerCase());
}

function projectLabel(projects: Project[], slug: string) {
  return projects.find((project) => project.projectSlug === slug)?.displayName || slug || 'Sem projeto';
}

function recentWindow(now: Date, windowDays: number) {
  const end = startOfDay(now.getTime()) + 86_399_999;
  const start = startOfDay(now.getTime() - (windowDays - 1) * 86_400_000);
  return { start, end };
}

function isWithinWindow(value: string, start: number, end: number) {
  const timestamp = parseTimestamp(value);
  return Boolean(timestamp && timestamp >= start && timestamp <= end);
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

export function buildDashboardHome(
  projects: Project[],
  notes: VaultNoteSummary[],
  reviews: ReviewView[],
  reminders: ReminderView[],
  now = new Date(),
): DashboardHomeSummary {
  const { start, end } = recentWindow(now, HOME_WINDOW_DAYS);
  const todayStart = startOfDay(now.getTime());
  const recentNotes = notes.filter((note) => isWithinWindow(note.date, start, end));
  const openReminders = reminders.filter((reminder) => isOpen(reminder.status));
  const overdueReminders = openReminders.filter((reminder) => {
    const timestamp = parseTimestamp(reminder.reminderAt || `${reminder.reminderDate}T${reminder.reminderTime || '00:00'}`);
    return Boolean(timestamp && timestamp < todayStart);
  });
  const openHighFindings = reviews.flatMap((review) => review.findings.filter((finding) => isOpen(finding.status) && isHigh(finding.severity)).map((finding) => ({ review, finding })));
  const reviewsWithOpenFindings = reviews.filter((review) => review.findings.some((finding) => isOpen(finding.status)));
  const recentIncidentsAndFollowups = recentNotes.filter((note) => ['incident', 'followup'].includes(note.type) && isOpen(note.status));

  const dayKeys = Array.from({ length: HOME_WINDOW_DAYS }, (_, index) => {
    const date = new Date(start + index * 86_400_000);
    return date.toISOString().slice(0, 10);
  });
  const countByDay = new Map(dayKeys.map((key) => [key, 0]));
  for (const note of recentNotes) {
    const key = dateKey(note.date);
    if (countByDay.has(key)) countByDay.set(key, (countByDay.get(key) || 0) + 1);
  }

  const countByProject = new Map<string, number>();
  for (const note of recentNotes) {
    countByProject.set(note.project, (countByProject.get(note.project) || 0) + 1);
  }

  const priorityCandidates: Array<HomePriority & { rank: number; timestamp: number }> = [
    ...openReminders.map((reminder) => {
      const timestamp = parseTimestamp(reminder.reminderAt || `${reminder.reminderDate}T${reminder.reminderTime || '00:00'}`);
      const relatedNote = findNoteByPath(notes, reminder.sourceNotePath) || findNoteByPath(notes, reminder.relativePath);
      const overdue = Boolean(timestamp && timestamp < todayStart);
      return {
        id: `reminder:${reminder.id}`,
        type: HomePriorityType.Reminder,
        title: reminder.title,
        project: reminder.project,
        date: reminder.reminderAt || reminder.reminderDate,
        description: overdue ? 'Lembrete vencido' : 'Lembrete aberto',
        status: reminder.status,
        target: relatedNote ? noteTarget(relatedNote) : { kind: HomeTargetKind.Note, path: reminder.sourceNotePath || reminder.relativePath },
        rank: overdue ? 0 : 1,
        timestamp: timestamp || Number.MAX_SAFE_INTEGER,
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
      status: finding.status,
      target: { kind: HomeTargetKind.Review, id: review.id, path: review.generatedNotePath },
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
    .filter((note) => INTERESTING_TYPES.includes(note.type as CanonicalType) && isOpen(note.status))
    .sort((left, right) => {
      const typePriority = INTERESTING_TYPES.indexOf(left.type as CanonicalType) - INTERESTING_TYPES.indexOf(right.type as CanonicalType);
      return typePriority || (parseTimestamp(right.date) || 0) - (parseTimestamp(left.date) || 0) || left.title.localeCompare(right.title);
    })
    .slice(0, 5)
    .map((note) => ({
      id: note.id,
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
      { id: 'recent-notes', label: 'Mudancas recentes', value: recentNotes.length, meta: `notas em ${HOME_WINDOW_DAYS} dias`, tone: 'active' },
      { id: 'active-projects', label: 'Projetos ativos', value: countByProject.size, meta: 'com movimento recente', tone: 'active' },
      { id: 'open-reminders', label: 'Lembretes abertos', value: openReminders.length, meta: `${overdueReminders.length} vencidos`, tone: overdueReminders.length ? 'high' : 'active' },
      {
        id: 'open-findings',
        label: 'Findings abertos',
        value: openHighFindings.length,
        meta: `${reviewsWithOpenFindings.length} reviews com pendencias`,
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
