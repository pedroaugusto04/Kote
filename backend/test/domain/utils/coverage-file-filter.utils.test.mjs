import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isEligibleFileForCoverage,
  normalizeCoveragePath,
} from '../../../dist/application/utils/github/coverage-file-filter.utils.js';

test('coverage file filter includes source and configuration files', () => {
  const eligibleFiles = [
    'src/App.tsx',
    'backend/src/main.go',
    'infra/terraform/main.tf',
    'package.json',
    'Dockerfile',
    '.github/workflows/ci.yml',
  ];

  for (const filePath of eligibleFiles) {
    assert.equal(isEligibleFileForCoverage(filePath), true, filePath);
  }
});

test('coverage file filter excludes documentation, media, generated and binary-like files', () => {
  const excludedFiles = [
    'README.md',
    'docs/architecture.pdf',
    'assets/logo.png',
    'dist/bundle.js',
    'node_modules/react/index.js',
    'coverage/lcov.info',
    'public/archive.zip',
    'data/export.bin',
    'unknown-language.custom',
  ];

  for (const filePath of excludedFiles) {
    assert.equal(isEligibleFileForCoverage(filePath), false, filePath);
  }
});

test('coverage paths normalize separators and prefixes for exact matching', () => {
  assert.equal(normalizeCoveragePath('./src\\App.tsx'), 'src/app.tsx');
  assert.equal(normalizeCoveragePath('/src/App.tsx'), 'src/app.tsx');
  assert.notEqual(normalizeCoveragePath('src/App.tsx'), normalizeCoveragePath('other/App.tsx'));
});
