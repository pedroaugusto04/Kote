import type { IngestPayload } from '../contracts/ingest.js';

export function buildTelegramCodeReviewMessage(payload: IngestPayload): string {
  const sections = payload.content.sections;
  const findings = sections.reviewFindings || [];
  const lines = [
    'Code review por IA salvo no Knowledge Base',
    `Projeto: ${payload.event.projectSlug}`,
    `Resumo: ${sections.summary || payload.content.rawText}`,
    sections.impact ? `Impacto: ${sections.impact}` : '',
    findings.length ? 'Findings:' : '',
    ...findings.slice(0, 5).map((finding) => `- [${finding.severity.toUpperCase()}] ${finding.summary}${finding.file ? ` (${finding.file})` : ''}`),
    sections.nextSteps?.length ? `Proximos passos: ${sections.nextSteps.join(' | ')}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}
