import { HomePriorityType, HomeTargetKind } from '../enums';
import type { Dashboard, DashboardPayload } from '../models/dashboard';
import type { DashboardHomeSummary, HomePriority } from '../models/dashboard-home';
import type { NoteSummary } from '../models/note';
import type { Project } from '../models/project';
import type { Reminder } from '../models/reminder';
import type { Review } from '../models/review';

const HOME_WINDOW_DAYS = 7;
const OPEN_STATUSES = new Set(['open', 'active', 'pending', 'todo']);
const INTERESTING_TYPES = ['incident', 'decision', 'followup', 'reminder', 'event'];

function parseTimestamp(value: string) {
  const normalized = String(value || '').trim().replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T');
  if (!normalized) return 0;
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? 0 : timestamp;
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

function dayKey(value: string) {
  const direct = String(value || '').match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  const timestamp = parseTimestamp(value);
  return timestamp ? new Date(timestamp).toISOString().slice(0, 10) : '';
}

function dayLabel(key: string) {
  const [, month, day] = key.match(/\d{4}-(\d{2})-(\d{2})/) || [];
  return month && day ? `${day}/${month}` : key;
}

function projectLabel(projects: Project[], slug: string) {
  return projects.find((project) => project.projectSlug === slug)?.displayName || slug || 'Sem projeto';
}

function noteTarget(note: NoteSummary) {
  return { kind: HomeTargetKind.Note, id: note.id, path: note.path };
}

function findNoteByPath(notes: NoteSummary[], path: string) {
  if (!path) return undefined;
  return notes.find((note) => note.path === path || note.path.endsWith(path));
}

function buildHomeFallback(payload: DashboardPayload): DashboardHomeSummary {
  const now = new Date();
  const end = startOfDay(now.getTime()) + 86_399_999;
  const start = startOfDay(now.getTime() - (HOME_WINDOW_DAYS - 1) * 86_400_000);
  const notes = payload.notes || [];
  const reviews = payload.reviews || [];
  const reminders = payload.reminders || [];
  const projects = payload.projects || [];
  const recentNotes = notes.filter((note) => {
    const timestamp = parseTimestamp(note.date);
    return timestamp >= start && timestamp <= end;
  });
  const openReminders = reminders.filter((reminder) => isOpen(reminder.status));
  const overdueReminders = openReminders.filter((reminder) => {
    const timestamp = parseTimestamp(reminder.reminderAt || `${reminder.reminderDate}T${reminder.reminderTime || '00:00'}`);
    return timestamp && timestamp < startOfDay(now.getTime());
  });
  const openHighFindings = reviews.flatMap((review) => review.findings.filter((finding) => isOpen(finding.status) && isHigh(finding.severity)).map((finding) => ({ review, finding })));
  const reviewsWithOpenFindings = reviews.filter((review) => review.findings.some((finding) => isOpen(finding.status)));
  const dayKeys = Array.from({ length: HOME_WINDOW_DAYS }, (_, index) => new Date(start + index * 86_400_000).toISOString().slice(0, 10));
  const countByDay = new Map(dayKeys.map((key) => [key, 0]));
  const countByProject = new Map<string, number>();

  for (const note of recentNotes) {
    const key = dayKey(note.date);
    if (countByDay.has(key)) countByDay.set(key, (countByDay.get(key) || 0) + 1);
    countByProject.set(note.project, (countByProject.get(note.project) || 0) + 1);
  }

  const priorities: Array<HomePriority & { rank: number; timestamp: number }> = [
    ...openReminders.map((reminder: Reminder) => {
      const timestamp = parseTimestamp(reminder.reminderAt || `${reminder.reminderDate}T${reminder.reminderTime || '00:00'}`);
      const relatedNote = findNoteByPath(notes, reminder.sourceNotePath) || findNoteByPath(notes, reminder.relativePath);
      return {
        id: `reminder:${reminder.id}`,
        type: HomePriorityType.Reminder,
        title: reminder.title,
        project: reminder.project,
        date: reminder.reminderAt || reminder.reminderDate,
        description: timestamp && timestamp < startOfDay(now.getTime()) ? 'Lembrete vencido' : 'Lembrete aberto',
        status: reminder.status,
        target: relatedNote ? noteTarget(relatedNote) : { kind: HomeTargetKind.Note, path: reminder.sourceNotePath || reminder.relativePath },
        rank: timestamp && timestamp < startOfDay(now.getTime()) ? 0 : 1,
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
    ...recentNotes.filter((note) => ['incident', 'followup'].includes(note.type) && isOpen(note.status)).map((note) => ({
      id: `note:${note.id}`,
      type: note.type === HomePriorityType.Incident ? HomePriorityType.Incident : HomePriorityType.Followup,
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
    activityByDay: dayKeys.map((key) => ({ date: key, label: dayLabel(key), count: countByDay.get(key) || 0 })),
    activityByProject: Array.from(countByProject.entries())
      .map(([project, count]) => ({ project, label: projectLabel(projects, project), count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 5),
    priorities: priorities.sort((left, right) => left.rank - right.rank || left.timestamp - right.timestamp).slice(0, 5).map(({ rank: _rank, timestamp: _timestamp, ...priority }) => priority),
    recentInterestingEvents: recentNotes
      .filter((note) => INTERESTING_TYPES.includes(note.type) && isOpen(note.status))
      .sort((left, right) => INTERESTING_TYPES.indexOf(left.type) - INTERESTING_TYPES.indexOf(right.type) || (parseTimestamp(right.date) || 0) - (parseTimestamp(left.date) || 0))
      .slice(0, 5)
      .map((note) => ({ id: note.id, type: note.type, title: note.title, project: note.project, date: note.date, summary: note.summary, status: note.status, target: noteTarget(note) })),
  };
}

export function normalizeDashboard(payload: DashboardPayload): Dashboard {
  return {
    workspaces: payload.workspaces || [],
    projects: payload.projects || [],
    notes: payload.notes || [],
    reviews: payload.reviews || [],
    reminders: payload.reminders || [],
    home: payload.home || buildHomeFallback(payload),
  };
}
