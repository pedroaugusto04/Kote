/**
 * Kote Extension Uninstall Script
 * Executed by VS Code lifecycle hook on extension uninstall.
 * Cleans up integration hooks and external modifications made by Kote.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function removeClaudeCodeHook(): void {
  try {
    const claudeDir = path.join(os.homedir(), '.claude');
    const settingsPath = path.join(claudeDir, 'settings.json');
    if (!fs.existsSync(settingsPath)) return;

    const content = fs.readFileSync(settingsPath, 'utf8');
    const settings = JSON.parse(content);
    if (settings && settings.hooks && typeof settings.hooks.session_start === 'string') {
      if (settings.hooks.session_start.includes('session-start.js')) {
        delete settings.hooks.session_start;
        if (Object.keys(settings.hooks).length === 0) {
          delete settings.hooks;
        }
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
      }
    }
  } catch {}
}

function removeAntigravityHook(): void {
  try {
    const agHook = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'hooks', 'session-start.js');
    if (fs.existsSync(agHook)) {
      fs.unlinkSync(agHook);
    }
  } catch {}
}

function removeOpenCodeHook(): void {
  try {
    const opencodePlugin = path.join(os.homedir(), '.config', 'opencode', 'plugins', 'kote-session-handoff.js');
    if (fs.existsSync(opencodePlugin)) {
      fs.unlinkSync(opencodePlugin);
    }
  } catch {}
}

function removeKoteHookBridge(): void {
  try {
    const koteHooksDir = path.join(os.homedir(), '.config', 'kote', 'hooks');
    const sessionStart = path.join(koteHooksDir, 'session-start.js');
    if (fs.existsSync(sessionStart)) {
      fs.unlinkSync(sessionStart);
    }
    const activeSessionStart = path.join(os.homedir(), '.config', 'kote', 'active-session-start.json');
    if (fs.existsSync(activeSessionStart)) {
      fs.unlinkSync(activeSessionStart);
    }
  } catch {}
}

export function cleanupAll(): void {
  removeClaudeCodeHook();
  removeAntigravityHook();
  removeOpenCodeHook();
  removeKoteHookBridge();
}

cleanupAll();
