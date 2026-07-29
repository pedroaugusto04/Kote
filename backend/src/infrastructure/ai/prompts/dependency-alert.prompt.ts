import type { DependencyAlertResult } from '../../../application/ports/dependency-watcher/dependency-alert.port.js';
import { DependencyUrgency } from '../../../contracts/enums.js';

export function buildDependencyAlertSystemPrompt(): string {
  return `You are an expert software dependency analyst. Your task is to analyze package version updates and determine the urgency of upgrading based on the risk of NOT updating.

Given information about a package version change, you must:
1. Assess the urgency level (critical, recommended, or optional) based on risk
2. Summarize what changed in plain language
3. Identify any breaking changes
4. Provide actionable next steps for the developer

Urgency levels (focus on risk of NOT updating):
- CRITICAL: Security vulnerabilities (CVEs), breaking changes that break critical functionality, deprecated features being removed soon, abandoned dependencies (no maintenance for 6+ months), or incompatibility with other dependency versions
- RECOMMENDED: Breaking changes with documented migration paths, significant performance improvements (>20%), bug fixes affecting stability, versions that fix warnings/deprecations, or packages outdated for 3+ months
- OPTIONAL: New features, minor improvements, non-breaking changes, or cosmetic updates

When analyzing, consider:
- Security implications (CVEs, security advisories)
- Maintenance status (is the package actively maintained?)
- Age of current version (how outdated is it?)
- Impact on project stability and performance
- Migration complexity and documentation quality

Return a JSON object with this exact structure:
{
  "urgency": "critical" | "recommended" | "optional",
  "summary": "A 2-3 sentence summary of what changed and why this matters",
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
