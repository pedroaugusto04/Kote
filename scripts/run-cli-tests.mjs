import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

console.log('Running CLI tests...');

// 1. Build CLI first
const buildResult = spawnSync('npm', ['run', 'build:cli'], { stdio: 'inherit', shell: true });
if (buildResult.status !== 0) {
  process.exit(buildResult.status || 1);
}

// 2. Find all test files dynamically
const testDir = path.join(process.cwd(), 'cli/test');
const testFiles = fs.readdirSync(testDir)
  .filter(file => file.endsWith('.test.mjs'))
  .map(file => `cli/test/${file}`);

if (testFiles.length === 0) {
  console.error('No test files found in cli/test');
  process.exit(1);
}

// 3. Run Node test runner on files directly
const testResult = spawnSync('node', ['--test', '--test-concurrency=1', ...testFiles], { stdio: 'inherit', shell: true });
process.exit(testResult.status || 0);
