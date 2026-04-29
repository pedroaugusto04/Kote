import type { Project } from '../shared/api/models/project';

export function projectName(projects: Project[], slug: string) {
  return projects.find((project) => project.projectSlug === slug)?.displayName || slug;
}

export function noteTypeLabel(type: string) {
  return (
    {
      note: 'Nota',
      event: 'Evento',
      knowledge: 'Conhecimento',
      decision: 'Decisão',
      incident: 'Incidente',
      bug: 'Bug',
      review: 'Review',
      reminder: 'Lembrete',
      article: 'Artigo',
      asset: 'Asset',
      followup: 'Follow-up',
    }[type] || humanizeToken(type)
  );
}

export function noteStatusLabel(status: string) {
  return (
    {
      open: 'Aberta',
      active: 'Ativa',
      resolved: 'Resolvida',
      archived: 'Arquivada',
      closed: 'Fechada',
      pending: 'Pendente',
      done: 'Concluída',
    }[status] || humanizeToken(status)
  );
}

export function typeIcon(type: string) {
  return (
    {
      note: 'N',
      event: 'E',
      knowledge: 'K',
      decision: 'D',
      incident: 'B',
      bug: 'B',
      review: 'R',
      reminder: 'T',
      article: 'A',
      asset: 'S',
    }[type] || 'F'
  );
}

function humanizeToken(value: string) {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
