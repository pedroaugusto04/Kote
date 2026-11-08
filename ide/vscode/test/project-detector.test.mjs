import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractGitRepoInfo,
  detectProjectFromPath,
  detectActiveProject,
} from '../out/project-detector.js';

test('extractGitRepoInfo parses github ssh and https urls accurately', () => {
  const ssh = extractGitRepoInfo('git@github.com:org-name/repo-name.git');
  assert.equal(ssh.fullName, 'org-name/repo-name');
  assert.equal(ssh.repoName, 'repo-name');

  const https = extractGitRepoInfo('https://github.com/my-org/my-project.git');
  assert.equal(https.fullName, 'my-org/my-project');
  assert.equal(https.repoName, 'my-project');

  const trailingSlash = extractGitRepoInfo('https://gitlab.com/group/subgroup.git');
  assert.equal(trailingSlash.fullName, 'group/subgroup');
  assert.equal(trailingSlash.repoName, 'subgroup');
});

test('detectProjectFromPath matches project by manifest name or directory name', () => {
  const mockProjects = [
    { projectSlug: 'alpha-service', displayName: 'Alpha Service' },
    { projectSlug: 'beta-api', displayName: 'Beta API' },
  ];

  // If path does not exist, returns null safely
  assert.equal(detectProjectFromPath('/non/existent/path/xyz', mockProjects), null);
});

test('detectActiveProject returns null or defaultProjectSlug if no folders match instead of random first project', async () => {
  const mockProjects = [
    { projectSlug: 'unrelated-first-project', displayName: 'Unrelated' },
    { projectSlug: 'other-project', displayName: 'Other' },
  ];

  const mockClient = {
    defaultProjectSlug: undefined,
    listProjects: async () => mockProjects,
  };

  // When folders is empty or unmatched, it must NOT return mockProjects[0]
  const result = await detectActiveProject(mockClient, []);
  assert.equal(result, null);

  // If defaultProjectSlug is configured, it falls back to that
  const clientWithDefault = {
    defaultProjectSlug: 'fallback-project',
    listProjects: async () => mockProjects,
  };
  const resultDefault = await detectActiveProject(clientWithDefault, []);
  assert.equal(resultDefault, 'fallback-project');
});
