import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Custom .env loader to avoid external dependencies
function loadEnv() {
  const searchPaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '..', '.env'),
  ];

  for (const envPath of searchPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;

          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.substring(0, eqIdx).trim();
            let val = trimmed.substring(eqIdx + 1).trim();

            // Remove wrapping quotes if present
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.substring(1, val.length - 1);
            }

            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
        break; // Stop at first found .env file
      } catch {
        // Continue if reading fails
      }
    }
  }
}

// Load environment variables
loadEnv();

export interface CliConfig {
  apiUrl: string;
  workspaceSlug: string;
  defaultProjectSlug: string;
  cookies: {
    kb_access_token?: string;
    kb_refresh_token?: string;
  };
  aiProviders?: {
    antigravityLogPath?: string;
    claudeCodeLogPath?: string;
    codexLogPath?: string;
    opencodeDbPath?: string;
  };
}

const CONFIG_DIR = process.env.KB_CLI_CONFIG_DIR || path.join(os.homedir(), '.config', 'kote');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function loadConfig(): CliConfig {
  const defaults: CliConfig = {
    apiUrl: process.env.KB_API_URL || process.env.KB_API_PUBLIC_BASE_URL || 'https://knowledgebase.sbs/kote/api',
    workspaceSlug: process.env.KB_CLI_WORKSPACE || 'default',
    defaultProjectSlug: process.env.KB_CLI_PROJECT || 'inbox',
    cookies: {},
  };

  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return defaults;
    }
    const data = fs.readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(data);
    return {
      ...defaults,
      ...parsed,
      cookies: parsed.cookies || {},
    };
  } catch {
    return defaults;
  }
}

export function saveConfig(config: Partial<CliConfig>): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    const current = loadConfig();
    const updated = {
      ...current,
      ...config,
      cookies: {
        ...current.cookies,
        ...(config.cookies || {}),
      },
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf8');
    try {
      fs.chmodSync(CONFIG_FILE, 0o600);
    } catch {
      // Ignore failures to chmod on non-POSIX systems
    }
  } catch (error) {
    console.error('Error saving configuration:', error instanceof Error ? error.message : String(error));
  }
}

export function clearConfigAuth(): void {
  try {
    const current = loadConfig();
    const updated = {
      ...current,
      cookies: {},
    };
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf8');
    try {
      fs.chmodSync(CONFIG_FILE, 0o600);
    } catch { }
  } catch (error) {
    console.error('Error clearing config auth:', error instanceof Error ? error.message : String(error));
  }
}
