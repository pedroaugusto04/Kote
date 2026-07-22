import { existsSync, readFileSync } from 'node:fs';

const envPath = '.env';
const requiredKeys = [
  'KB_DATABASE_URL',
  'KB_JWT_ACCESS_SECRET',
  'KB_JWT_REFRESH_SECRET',
  'KB_INTERNAL_SERVICE_TOKEN',
  'KB_CREDENTIALS_ENCRYPTION_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'KB_SUPABASE_STORAGE_BUCKET',
];

function readEnvFile() {
  if (!existsSync(envPath)) {
    throw new Error('Missing .env. Run npm run setup:local first.');
  }

  const values = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    values[key] = rawValue.replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

function isPlaceholder(key, value) {
  const placeholders = [
    'change-me-',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    'your-project.supabase.co',
    'your-supabase-service-role-key',
  ];
  return !value || placeholders.some((placeholder) => value.includes(placeholder))
    || (key === 'KB_SUPABASE_STORAGE_BUCKET' && value !== 'notes');
}

async function checkSupabase(values) {
  let url;
  try {
    url = new URL(values.SUPABASE_URL);
  } catch {
    throw new Error('SUPABASE_URL is not a valid URL.');
  }

  const bucketName = values.KB_SUPABASE_STORAGE_BUCKET;
  const response = await fetch(`${url.origin}/storage/v1/bucket/${encodeURIComponent(bucketName)}`, {
    headers: {
      apikey: values.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${values.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status === 404) {
    throw new Error(`Supabase bucket "${bucketName}" was not found. Create it as a private bucket in the Supabase dashboard.`);
  }
  if (!response.ok) {
    throw new Error(`Supabase bucket check failed with HTTP ${response.status}. Verify the URL and service-role key.`);
  }
}

try {
  const values = readEnvFile();
  const missing = requiredKeys.filter((key) => isPlaceholder(key, values[key] || ''));
  if (missing.length > 0) {
    throw new Error(`Configure these values in .env before continuing: ${missing.join(', ')}`);
  }

  await checkSupabase(values);
  console.log('Local configuration is ready.');
  console.log('Next: docker compose up -d --wait && docker compose exec api npm run migrate');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
