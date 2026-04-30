import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tscEntrypoint = path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc');
const distEntrypoint = path.join(rootDir, 'backend', 'dist', 'main.js');
const inspectEnabled = ['1', 'true', 'yes', 'on'].includes((process.env.KB_API_INSPECT ?? '').toLowerCase());
const inspectPort = process.env.KB_API_INSPECT_PORT ?? '9229';

rmSync(path.join(rootDir, 'backend', 'dist'), { recursive: true, force: true });

function run(command, args, options = {}) {
  return spawn(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
    ...options,
  });
}

async function waitForExit(child) {
  return await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

const initialBuild = run(process.execPath, [tscEntrypoint, '-p', 'backend/tsconfig.json']);
const initialResult = await waitForExit(initialBuild);

if (initialResult.code !== 0) {
  process.exit(initialResult.code ?? 1);
}

const compiler = run(process.execPath, [tscEntrypoint, '-p', 'backend/tsconfig.json', '--watch', '--preserveWatchOutput']);
const serverArgs = [
  ...(inspectEnabled ? [`--inspect=0.0.0.0:${inspectPort}`] : []),
  '--watch',
  distEntrypoint,
];
const server = run(process.execPath, serverArgs);

let shuttingDown = false;

function terminate(child, signal = 'SIGTERM') {
  if (!child.killed) {
    child.kill(signal);
  }
}

function shutdown(signal = 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;
  terminate(compiler, signal);
  terminate(server, signal);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shutdown(signal);
  });
}

compiler.once('exit', (code, signal) => {
  if (shuttingDown) {
    process.exit(code ?? 0);
  }
  terminate(server);
  process.exit(code ?? (signal ? 1 : 0));
});

server.once('exit', (code, signal) => {
  if (shuttingDown) {
    terminate(compiler);
    process.exit(code ?? 0);
  }
  terminate(compiler);
  process.exit(code ?? (signal ? 1 : 0));
});
