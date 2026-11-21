import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDependencyNoteContent,
  buildDependencyIssueTitle,
  buildDependencyIssueBody,
} from '../../../../dist/application/services/dependency-watcher/dependency-issue-presenter.js';

describe('Backend: Dependency Issue Presenter', () => {
  const mockRecord = {
    id: 'rec-1',
    userId: 'user-1',
    workspaceId: 'ws-1',
    workspaceSlug: 'my-workspace',
    repositoryId: 'repo-1',
    packageName: 'lodash',
    currentVersion: '4.17.20',
    latestVersion: '4.17.21',
    ecosystem: 'npm',
  };

  const mockVersionInfo = {
    version: '4.17.21',
    repositoryUrl: 'https://github.com/lodash/lodash',
  };

  const mockAnalysis = {
    urgency: 'critical',
    summary: 'Fix prototype pollution vulnerability',
    breakingChanges: ['None in patch'],
    nextSteps: ['Run tests'],
  };

  it('builds note content with summary, version info, breaking changes and links', () => {
    const content = buildDependencyNoteContent(mockRecord, mockVersionInfo, mockAnalysis);
    assert.ok(content.includes('## Summary'));
    assert.ok(content.includes('Fix prototype pollution vulnerability'));
    assert.ok(content.includes('- **Package**: lodash'));
    assert.ok(content.includes('- **Current Version**: 4.17.20'));
    assert.ok(content.includes('- **Latest Version**: 4.17.21'));
    assert.ok(content.includes('## Breaking Changes'));
    assert.ok(content.includes('- None in patch'));
    assert.ok(content.includes('## Next Steps'));
    assert.ok(content.includes('- Run tests'));
    assert.ok(content.includes('- Repository: https://github.com/lodash/lodash'));
  });

  it('builds formatted issue title with uppercase urgency', () => {
    const title = buildDependencyIssueTitle({
      urgency: 'critical',
      packageName: 'lodash',
      currentVersion: '4.17.20',
      targetVersion: '4.17.21',
    });
    assert.equal(title, '[CRITICAL Dependency Update] lodash: 4.17.20 → 4.17.21');
  });

  it('builds formatted issue body with autonomous repair instructions and tracking tag', () => {
    const body = buildDependencyIssueBody({
      record: mockRecord,
      versionInfo: mockVersionInfo,
      analysis: mockAnalysis,
    });
    assert.ok(body.includes('## Autonomous Repair Instructions (`heal-agent`)'));
    assert.ok(body.includes('Update `lodash` from `4.17.20` to `4.17.21` in the appropriate manifest and lockfile.'));
    assert.ok(body.includes('- Adapt any call sites affected by breaking changes listed above.'));
    assert.ok(body.includes('- Run the project build and test suite to verify compatibility before opening the Draft PR.'));
    assert.ok(body.includes('<!-- kote-dependency:lodash@4.17.21 -->'));
  });
});
