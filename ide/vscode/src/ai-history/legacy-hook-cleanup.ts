import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Remove Kote hook artifacts installed by older extension versions. */
export function cleanupLegacyHarnessHooks(): void {
  const home = os.homedir();

  const claudeSettingsPath = path.join(home, '.claude', 'settings.json');
  try {
    if (fs.existsSync(claudeSettingsPath)) {
      const settings = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf8'));
      const command = settings?.hooks?.session_start;
      if (typeof command === 'string' && command.includes(path.join('.config', 'kote', 'hooks'))) {
        delete settings.hooks.session_start;
        if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
        fs.writeFileSync(claudeSettingsPath, JSON.stringify(settings, null, 2), 'utf8');
      }
    }
  } catch { /* Preserve settings if they cannot be safely parsed. */ }

  const antigravityHookPaths = [
    path.join(home, '.gemini', 'antigravity-cli', 'hooks', 'kote-session-start.js'),
    path.join(home, '.gemini', 'antigravity-cli', 'hooks', 'session-start.js'),
  ];
  for (const hookPath of antigravityHookPaths) {
    try {
      if (fs.existsSync(hookPath) && fs.readFileSync(hookPath, 'utf8').includes('Kote Session Start Hook Bridge')) {
        fs.unlinkSync(hookPath);
      }
    } catch { /* Best-effort cleanup. */ }
  }

  const opencodePluginPath = path.join(home, '.config', 'opencode', 'plugins', 'kote-session-handoff.js');
  try {
    if (fs.existsSync(opencodePluginPath)) fs.unlinkSync(opencodePluginPath);
  } catch { /* Best-effort cleanup. */ }

  const koteHooksDir = path.join(home, '.config', 'kote', 'hooks');
  try {
    const legacyBridge = path.join(koteHooksDir, 'session-start.js');
    if (fs.existsSync(legacyBridge) && fs.readFileSync(legacyBridge, 'utf8').includes('Kote Session Start Hook Bridge')) {
      fs.unlinkSync(legacyBridge);
    }
    const namespacedBridge = path.join(koteHooksDir, 'kote-session-start.js');
    if (fs.existsSync(namespacedBridge)) fs.unlinkSync(namespacedBridge);
  } catch { /* Best-effort cleanup. */ }
}
