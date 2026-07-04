import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { CONFIG_CONSTANTS, ENV_VARS } from '../constants/mcp.constants.js';
import { StderrLogger } from '../logger/stderr.logger.js';
import type { CliConfig } from '../types/mcp.types.js';

interface ExchangeResult {
  ok: boolean;
  accessToken: string;
  refreshToken: string;
}

/**
 * Returns true if the JWT string is present and not yet expired.
 */
function isTokenStillValid(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as { exp?: number };
    return typeof payload.exp === 'number' && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

/**
 * Removes persisted cookies from the shared CLI config file.
 * Called by ApiClient after a failed token refresh so the next startup
 * forces a fresh connection-token exchange.
 */
export function clearPersistedCookies(config: CliConfig): void {
  config.cookies.kb_access_token = '';
  config.cookies.kb_refresh_token = '';

  try {
    const configDir = process.env[ENV_VARS.ConfigDir] || path.join(
      os.homedir(),
      CONFIG_CONSTANTS.DefaultConfigDirName,
      CONFIG_CONSTANTS.DefaultConfigAppName,
    );
    const configFile = path.join(configDir, CONFIG_CONSTANTS.ConfigFileName);
    let existing: Record<string, unknown> = {};
    try {
      existing = JSON.parse(fs.readFileSync(configFile, 'utf8')) as Record<string, unknown>;
    } catch { /* ignore */ }
    const updated = { ...existing, cookies: {} };
    fs.writeFileSync(configFile, JSON.stringify(updated, null, 2), 'utf8');
    StderrLogger.debug('Cleared persisted session cookies from config file.');
  } catch (err) {
    StderrLogger.error('Could not clear persisted cookies from config file:', err);
  }
}

/**
 * If KOTE_CONNECTION_TOKEN is set and no *valid* session already exists,
 * exchanges the connection token for an access+refresh pair and persists
 * it to the shared CLI config file (~/.config/kote/config.json).
 *
 * This mirrors what `kote init` does in the CLI, so the MCP server can be
 * authenticated with just a single env var instead of raw cookie values.
 *
 * The connection token is only needed at startup — after the exchange the
 * MCP server runs on the stored access/refresh pair with auto-refresh.
 */
export async function maybeExchangeConnectionToken(config: CliConfig): Promise<void> {
  const connectionToken = process.env[ENV_VARS.ConnectionToken];
  if (!connectionToken) return;

  // Skip exchange only when the access_token is still valid. If it's expired
  // (but refresh_token may still be present), fall through so the exchange
  // produces a fresh pair — the stale access_token would cause immediate 401s.
  if (isTokenStillValid(config.cookies.kb_access_token)) {
    StderrLogger.debug('KOTE_CONNECTION_TOKEN set but valid session already exists — skipping exchange.');
    return;
  }

  StderrLogger.info('KOTE_CONNECTION_TOKEN detected — exchanging for session tokens...');

  const apiBase = config.apiUrl.replace(/\/$/, '');

  let result: ExchangeResult;
  try {
    const response = await fetch(`${apiBase}/auth/exchange-connection-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionToken }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Exchange failed with status ${response.status}: ${body}`);
    }

    result = (await response.json()) as ExchangeResult;
  } catch (err) {
    StderrLogger.error('Failed to exchange KOTE_CONNECTION_TOKEN:', err);
    throw err;
  }

  if (!result.accessToken || !result.refreshToken) {
    throw new Error('Exchange response missing accessToken or refreshToken');
  }

  // Populate config in-memory for the current process
  config.cookies.kb_access_token = result.accessToken;
  config.cookies.kb_refresh_token = result.refreshToken;

  // Persist to the shared CLI config file so the exchange survives restarts
  try {
    const configDir = process.env[ENV_VARS.ConfigDir] || path.join(
      os.homedir(),
      CONFIG_CONSTANTS.DefaultConfigDirName,
      CONFIG_CONSTANTS.DefaultConfigAppName,
    );
    const configFile = path.join(configDir, CONFIG_CONSTANTS.ConfigFileName);

    let existing: Record<string, unknown> = {};
    try {
      existing = JSON.parse(fs.readFileSync(configFile, 'utf8')) as Record<string, unknown>;
    } catch { /* config file may not exist yet */ }

    const updated = {
      ...existing,
      cookies: {
        ...(existing.cookies as object ?? {}),
        kb_access_token: result.accessToken,
        kb_refresh_token: result.refreshToken,
      },
    };

    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configFile, JSON.stringify(updated, null, 2), 'utf8');
    StderrLogger.info('Session tokens exchanged and persisted successfully.');
  } catch (err) {
    // Non-fatal — tokens are already in memory, auto-refresh will handle the rest
    StderrLogger.error('Could not persist session tokens to config file:', err);
  }
}
