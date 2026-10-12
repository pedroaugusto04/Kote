import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const shouldRun = process.env.KB_RUN_INTEGRATION_TESTS !== 'false';

if (!shouldRun) {
  console.log('Skipping API integration tests (KB_RUN_INTEGRATION_TESTS is false)');
  process.exit(0);
}

console.log('Running API integration tests...');

function findTestFiles(dir) {
  let results = [];
  const list = readdirSync(dir);
  for (const file of list) {
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(findTestFiles(fullPath));
    } else if (file.endsWith('.test.mjs')) {
      results.push(fullPath);
    }
  }
  return results;
}

const cliArgs = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));

function resolveTestFiles() {
  if (cliArgs.length > 0) {
    const files = [];
    for (const arg of cliArgs) {
      try {
        const stat = statSync(arg);
        if (stat.isDirectory()) {
          files.push(...findTestFiles(arg));
        } else {
          files.push(arg);
        }
      } catch {
        const nested = join('backend/test', arg);
        try {
          const nestedStat = statSync(nested);
          if (nestedStat.isDirectory()) {
            files.push(...findTestFiles(nested));
          } else {
            files.push(nested);
          }
        } catch {
          files.push(arg);
        }
      }
    }
    return files;
  }
  return findTestFiles('backend/test');
}

const testFiles = resolveTestFiles();

console.log(`Running ${testFiles.length} API test file(s)...`);

const commands = [
  ...(cliArgs.length === 0 ? [['npm', ['run', 'clean']]] : []),
  ['npm', ['run', 'build:api']],
  ['node', ['--test', '--test-concurrency=1', ...testFiles]]
];

for (const [cmd, args] of commands) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, KB_LOG_FILE_ENABLED: 'false' }
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
