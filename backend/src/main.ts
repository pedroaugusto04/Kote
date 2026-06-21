import 'reflect-metadata';

import { startApp } from './bootstrap.js';

void startApp().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
