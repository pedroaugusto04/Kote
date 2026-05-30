import { rmSync, existsSync } from 'node:fs';

const targets = ['dist', 'backend/dist', 'cli/dist'];
for (const target of targets) {
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
    console.log(`Cleaned ${target}`);
  }
}
