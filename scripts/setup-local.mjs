import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const envPath = '.env';
const examplePath = '.env.example';

if (existsSync(envPath)) {
  console.log('.env already exists; leaving it unchanged.');
  console.log('Review it and run: docker compose up -d');
  process.exit(0);
}

if (!existsSync(examplePath)) {
  console.error(`Missing ${examplePath}.`);
  process.exit(1);
}

const secrets = {
  KB_JWT_ACCESS_SECRET: randomBytes(32).toString('base64'),
  KB_JWT_REFRESH_SECRET: randomBytes(32).toString('base64'),
  KB_INTERNAL_SERVICE_TOKEN: randomBytes(32).toString('base64'),
  KB_CREDENTIALS_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
};

let envContent = readFileSync(examplePath, 'utf8');
for (const [name, value] of Object.entries(secrets)) {
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  if (!pattern.test(envContent)) {
    console.error(`${name} is missing from ${examplePath}.`);
    process.exit(1);
  }
  envContent = envContent.replace(pattern, `${name}=${value}`);
}

writeFileSync(envPath, envContent, { mode: 0o600 });
console.log('Created .env with fresh local secrets.');
console.log('Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before creating notes.');
console.log('Then run: npm run check:local');
