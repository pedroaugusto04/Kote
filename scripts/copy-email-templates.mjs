import fs from 'node:fs';

fs.cpSync('backend/src/infrastructure/email/templates', 'backend/dist/infrastructure/email/templates', { recursive: true });
