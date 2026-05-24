import { spawnSync } from 'node:child_process';

const shouldRun = process.env.KB_RUN_INTEGRATION_TESTS !== 'false';

if (!shouldRun) {
  console.log('Skipping API integration tests (KB_RUN_INTEGRATION_TESTS is false)');
  process.exit(0);
}

console.log('Running API integration tests...');

const commands = [
  ['npm', ['run', 'clean']],
  ['npm', ['run', 'build:api']],
  ['node', ['--test', '--test-concurrency=1', 'backend/test/**/*.test.mjs']]
];

for (const [cmd, args] of commands) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
