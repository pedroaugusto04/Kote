import type { DependencyAlertResult } from '../../../application/ports/dependency-watcher/dependency-alert.port.js';
import { DependencyUrgency } from '../../../contracts/enums.js';

export function buildDependencyAlertSystemPrompt(): string {
  return `You are an expert software dependency analyst. Your task is to analyze package version updates and determine the urgency of upgrading.

Given information about a package version change, you must:
1. Assess the urgency level (critical, recommended, or optional)
2. Summarize what changed in plain language
3. Identify any breaking changes
4. Provide actionable next steps for the developer

Urgency levels:
- CRITICAL: Security vulnerabilities, major breaking changes that will cause failures, or deprecated features being removed
- RECOMMENDED: Important bug fixes, performance improvements, or minor breaking changes with clear migration paths
- OPTIONAL: New features, minor improvements, or non-breaking changes

Return a JSON object with this exact structure:
{
  "urgency": "critical" | "recommended" | "optional",
  "summary": "A 2-3 sentence summary of what changed",
  "breakingChanges": ["List of breaking changes if any"],
  "nextSteps": ["Actionable steps for the developer"]
}`;
}

export function parseDependencyAlert(parsed: unknown): DependencyAlertResult {
  const data = parsed as { urgency?: string; summary?: string; breakingChanges?: string[]; nextSteps?: string[] };
  
  const urgencyMap: Record<string, DependencyUrgency> = {
    critical: DependencyUrgency.Critical,
    recommended: DependencyUrgency.Recommended,
    optional: DependencyUrgency.Optional,
  };
  
  return {
    urgency: urgencyMap[data.urgency || ''] || DependencyUrgency.Optional,
    summary: data.summary || 'No summary available',
    breakingChanges: Array.isArray(data.breakingChanges) ? data.breakingChanges : [],
    nextSteps: Array.isArray(data.nextSteps) ? data.nextSteps : [],
  };
}

export const dependencyAlertFallback: DependencyAlertResult = {
  urgency: DependencyUrgency.Optional,
  summary: 'Unable to analyze changelog automatically',
  breakingChanges: [],
  nextSteps: ['Review the changelog manually', 'Check the package documentation'],
};
