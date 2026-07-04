import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { CONFIG_CONSTANTS, ENV_VARS } from '../constants/mcp.constants.js';
import type { CliConfig } from '../types/mcp.types.js';

export function loadCliConfig(): CliConfig {
  const defaults: CliConfig = {
    apiUrl: process.env[ENV_VARS.ApiUrl] || process.env[ENV_VARS.ApiPublicBaseUrl] || CONFIG_CONSTANTS.DefaultApiUrl,
    workspaceSlug: process.env[ENV_VARS.WorkspaceSlug] || CONFIG_CONSTANTS.FallbackWorkspaceSlug,
    defaultProjectSlug: process.env[ENV_VARS.DefaultProject] || CONFIG_CONSTANTS.FallbackProjectSlug,
    cookies: {},
  };

  // Find config file path
  const configDir = process.env[ENV_VARS.ConfigDir] || path.join(
    os.homedir(),
    CONFIG_CONSTANTS.DefaultConfigDirName,
    CONFIG_CONSTANTS.DefaultConfigAppName
  );
  const configFile = path.join(configDir, CONFIG_CONSTANTS.ConfigFileName);

  let fileConfig: Partial<CliConfig> = {};

  try {
    if (fs.existsSync(configFile)) {
      const rawData = fs.readFileSync(configFile, 'utf8');
      const parsed = JSON.parse(rawData);
      if (parsed && typeof parsed === 'object') {
        fileConfig = parsed;
      }
    }
  } catch {
    // Ignore config file read errors, fallback to defaults/env
  }

  // Merge, env variables take precedence over file config
  const merged: CliConfig = {
    apiUrl: process.env[ENV_VARS.ApiUrl] || process.env[ENV_VARS.ApiPublicBaseUrl] || fileConfig.apiUrl || defaults.apiUrl,
    workspaceSlug: process.env[ENV_VARS.WorkspaceSlug] || fileConfig.workspaceSlug || defaults.workspaceSlug,
    defaultProjectSlug: process.env[ENV_VARS.DefaultProject] || fileConfig.defaultProjectSlug || defaults.defaultProjectSlug,
    cookies: {
      ...(fileConfig.cookies || {}),
    },
  };

  // Check env token fallbacks
  const envToken = process.env[ENV_VARS.AccessToken];
  if (envToken) {
    merged.cookies.kb_access_token = envToken;
  }

  const envCookie = process.env[ENV_VARS.SessionCookie];
  if (envCookie) {
    merged.cookies.kb_refresh_token = envCookie;
  }

  return merged;
}
