import pc from 'picocolors';
import { loadConfig, saveConfig } from '../config.js';

type ConfigKey = 'workspaceSlug' | 'defaultProjectSlug';

const VALID_KEYS: ConfigKey[] = ['workspaceSlug', 'defaultProjectSlug'];

export function runConfigGet(key: string, isRepl = false): void {
  const config = loadConfig();
  if (!VALID_KEYS.includes(key as ConfigKey)) {
    console.error(pc.red(`Invalid configuration key. Valid keys are: ${VALID_KEYS.join(', ')}`));
    if (isRepl) return;
    process.exit(1);
  }
  const val = config[key as ConfigKey];
  console.log(val);
}

export function runConfigSet(key: string, value: string, isRepl = false): void {
  if (!VALID_KEYS.includes(key as ConfigKey)) {
    console.error(pc.red(`Invalid configuration key. Valid keys are: ${VALID_KEYS.join(', ')}`));
    if (isRepl) return;
    process.exit(1);
  }

  let formattedValue = value.trim();

  saveConfig({ [key]: formattedValue });
  console.log(pc.green(`Updated configuration: ${key} = ${formattedValue}`));
}

export function runConfigList(): void {
  const config = loadConfig();
  console.log(pc.cyan('Current CLI Configuration:'));
  console.log(`${pc.bold('API URL:')} ${config.apiUrl}`);
  console.log(`${pc.bold('Workspace:')} ${config.workspaceSlug}`);
  console.log(`${pc.bold('Default Project:')} ${config.defaultProjectSlug}`);
  const hasAccessToken = !!config.cookies.kb_access_token;
  console.log(`${pc.bold('Authentication Status:')} ${hasAccessToken ? pc.green('Logged In') : pc.red('Not Logged In')}`);
}
