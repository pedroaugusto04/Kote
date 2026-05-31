import readline from 'node:readline';
import pc from 'picocolors';
import { runAsk } from './ask.js';
import { runNote } from './note.js';
import { runListProjects, runListWorkspaces } from './list.js';
import { runLogout } from './logout.js';
import { runConfigGet, runConfigSet, runConfigList } from './config.js';
import { loadConfig } from '../config.js';

const COMMANDS = [
  '/save ',
  '/ask ',
  '/sync ',
  '/logout',
  '/exit',
  'projects',
  'workspaces',
  'config list',
  'config get ',
  'config set ',
  'help'
];

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

function readlineAutocompletePrompt(promptText: string, commands: string[]): Promise<string> {
  return new Promise((resolve) => {
    let input = '';
    let cursor = 0;
    let selectedIndex = 0;

    function getMatches(currentInput: string): string[] {
      const trimmed = currentInput.trim();
      if (!trimmed) return [];
      return commands.filter((c) => c.startsWith(trimmed));
    }

    function cleanupOverlay(matches: string[]) {
      if (matches.length > 0) {
        readline.cursorTo(process.stdout, 0);
        readline.clearLine(process.stdout, 0);
        // Move cursor down to clear each suggestion line
        for (let i = 0; i < matches.length; i++) {
          process.stdout.write('\n');
          readline.clearLine(process.stdout, 0);
        }
        // Return cursor to prompt line
        readline.moveCursor(process.stdout, 0, -matches.length);
        readline.clearScreenDown(process.stdout);
      }
    }

    function render() {
      const matches = getMatches(input);

      // Clean prompt line
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);

      // Write prompt and user input
      process.stdout.write(promptText + input);

      // Clear any remaining lines below
      readline.clearScreenDown(process.stdout);

      if (matches.length > 0) {
        process.stdout.write('\n');
        matches.forEach((match, index) => {
          if (index === selectedIndex) {
            // Glow blue selection bar
            process.stdout.write(`  ${pc.bgBlue(pc.white(pc.bold(` ❯ ${match.padEnd(16)} `)))}\n`);
          } else {
            process.stdout.write(`    ${pc.cyan(match)}\n`);
          }
        });

        // Return cursor back to prompt line
        readline.moveCursor(process.stdout, 0, -(matches.length + 1));
      }

      // Restore cursor position inside input buffer
      readline.cursorTo(process.stdout, stripAnsi(promptText).length + cursor);
    }

    function onKeypress(str: string, key: any) {
      const matches = getMatches(input);

      if (key && key.ctrl && key.name === 'c') {
        cleanupOverlay(matches);
        process.stdin.removeListener('keypress', onKeypress);
        process.stdin.setRawMode(false);
        console.log();
        process.exit(0);
      }

      if (key && (key.name === 'return' || key.name === 'enter')) {
        if (matches.length > 0) {
          const selectedMatch = matches[selectedIndex];
          
          if (selectedMatch === '/save ' || selectedMatch === '/ask ') {
            // Autofill command and let user continue typing note/question
            cleanupOverlay(matches);
            input = selectedMatch;
            cursor = input.length;
            selectedIndex = 0;
            render();
            return;
          }

          // Self-executing commands
          cleanupOverlay(matches);
          process.stdin.removeListener('keypress', onKeypress);
          process.stdin.setRawMode(false);
          console.log();
          resolve(selectedMatch);
          return;
        }

        // Normal text submission
        cleanupOverlay(matches);
        process.stdin.removeListener('keypress', onKeypress);
        process.stdin.setRawMode(false);
        console.log();
        resolve(input);
        return;
      }

      if (key && key.name === 'up') {
        if (matches.length > 0) {
          selectedIndex = (selectedIndex - 1 + matches.length) % matches.length;
        }
        render();
        return;
      }

      if (key && key.name === 'down') {
        if (matches.length > 0) {
          selectedIndex = (selectedIndex + 1) % matches.length;
        }
        render();
        return;
      }

      if (key && key.name === 'tab') {
        if (matches.length > 0) {
          const selectedMatch = matches[selectedIndex];
          input = selectedMatch;
          cursor = input.length;
          selectedIndex = 0;
        }
        render();
        return;
      }

      if (key && (key.name === 'backspace' || key.name === 'delete' || str === '\u007f' || str === '\b')) {
        if (cursor > 0) {
          // Clear current overlay matches before modifying input
          cleanupOverlay(matches);
          input = input.slice(0, cursor - 1) + input.slice(cursor);
          cursor--;
          selectedIndex = 0;
        }
        render();
        return;
      }

      if (key && key.name === 'left') {
        if (cursor > 0) cursor--;
        render();
        return;
      }

      if (key && key.name === 'right') {
        if (cursor < input.length) cursor++;
        render();
        return;
      }

      // Handle normal printable characters
      if (str && str.length === 1 && (!key || (!key.meta && !key.ctrl && key.name !== 'escape'))) {
        cleanupOverlay(matches);
        input = input.slice(0, cursor) + str + input.slice(cursor);
        cursor += str.length;
        selectedIndex = 0;
        render();
      }
    }

    process.stdin.resume();
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.on('keypress', onKeypress);
    render();
  });
}

function parseReplOptions(argsString: string): { text: string; options: { project?: string; file?: string } } {
  const options: { project?: string; file?: string } = {};
  let text = argsString;

  // Match -p/--project option
  const projectRegex = /(?:-p|--project)(?:\s+|=)(?:'([^']+)'|"([^"]+)"|([^\s]+))/i;
  let match;
  while ((match = projectRegex.exec(text))) {
    options.project = match[1] || match[2] || match[3];
    text = text.replace(match[0], '').trim();
  }

  // Match -f/--file option
  const fileRegex = /(?:-f|--file)(?:\s+|=)(?:'([^']+)'|"([^"]+)"|([^\s]+))/i;
  while ((match = fileRegex.exec(text))) {
    options.file = match[1] || match[2] || match[3];
    text = text.replace(match[0], '').trim();
  }

  // Clean up multiple spaces
  text = text.replace(/\s+/g, ' ').trim();

  return { text, options };
}

export async function runRepl(): Promise<void> {
  const config = loadConfig();
  console.log(pc.cyan('================================================'));
  console.log(pc.cyan(`  Knowledge Base Interactive Session            `));
  console.log(pc.cyan(`  Active Workspace: ${pc.bold(config.workspaceSlug)}`));
  console.log(pc.cyan(`  Type ${pc.bold('/exit')} to quit, ${pc.bold('help')} for command list.`));
  console.log(pc.cyan(`  [TAB] or [UP/DOWN] to select autocomplete commands.`));
  console.log(pc.cyan('================================================\n'));

  while (true) {
    const promptLabel = pc.magenta('kb> ');
    const line = await readlineAutocompletePrompt(promptLabel, COMMANDS);
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    if (trimmed === '/exit' || trimmed === 'exit' || trimmed === 'quit') {
      console.log(pc.gray('Goodbye!'));
      process.exit(0);
    }

    if (trimmed === 'help') {
      console.log(pc.cyan('\nInteractive Command List & Options:'));
      console.log(`  ${pc.bold('/ask <question>')}         - Query the knowledge base`);
      console.log(`    ${pc.gray('Options:')}`);
      console.log(`      ${pc.yellow('-p, --project <slug>')}  Specify project context for the query`);
      console.log(`    ${pc.gray('Example:')} /ask -p platform How to deploy?\n`);

      console.log(`  ${pc.bold('/save <note>')}             - Send a note to the agent`);
      console.log(`    ${pc.gray('Options:')}`);
      console.log(`      ${pc.yellow('-p, --project <slug>')}  Specify project context`);
      console.log(`      ${pc.yellow('-f, --file <path>')}     Attach a file to the note`);
      console.log(`    ${pc.gray('Example:')} /save -p inbox -f ./todo.txt review this file\n`);

      console.log(`  ${pc.bold('<any text>')}                - Sends text directly to the agent (shortcut for /save)`);
      console.log(`    ${pc.gray('Options:')} Supports same -p and -f options as /save`);
      console.log(`    ${pc.gray('Example:')} My note text -p platform\n`);

      console.log(`  ${pc.bold('/sync <path>')}             - Sync a local directory or single markdown file`);
      console.log(`    ${pc.gray('Options:')}`);
      console.log(`      ${pc.yellow('-p, --project <slug>')}  Specify default project context`);
      console.log(`      ${pc.yellow('--dry-run')}             Analyze changes without uploading`);
      console.log(`      ${pc.yellow('-w, --watch')}             Watch directory/file for real-time changes`);
      console.log(`    ${pc.gray('Example:')} /sync ./README.md -p platform --dry-run\n`);

      console.log(`  ${pc.bold('projects')}                  - List all projects in active workspace`);
      console.log(`  ${pc.bold('workspaces')}                - List available workspaces`);
      console.log(`  ${pc.bold('config list')}              - List all CLI config values`);
      console.log(`  ${pc.bold('config get <key>')}          - Get a CLI config value`);
      console.log(`  ${pc.bold('config set <key> <val>')}    - Set a CLI config value`);
      console.log(`  ${pc.bold('/logout')}                   - Log out of session`);
      console.log(`  ${pc.bold('/exit')}                     - Exit session\n`);
      continue;
    }

    if (trimmed === 'projects') {
      await runListProjects();
      continue;
    }

    if (trimmed === 'workspaces') {
      await runListWorkspaces();
      continue;
    }

    if (trimmed === 'config' || trimmed === 'config list') {
      runConfigList();
      continue;
    }

    if (trimmed.startsWith('config get ')) {
      const key = trimmed.substring(11).trim();
      runConfigGet(key, true);
      continue;
    }

    if (trimmed.startsWith('config set ')) {
      const parts = trimmed.substring(11).trim().split(/\s+/);
      const key = parts[0] || '';
      const value = parts.slice(1).join(' ');
      if (!key || !value) {
        console.log(pc.yellow('Usage: config set <key> <value>'));
      } else {
        runConfigSet(key, value, true);
      }
      continue;
    }

    if (trimmed === '/logout') {
      await runLogout();
      console.log(pc.yellow('Exiting REPL session.'));
      process.exit(0);
    }

    // Process Slash Commands
    if (trimmed.startsWith('/ask ')) {
      const rawQuestion = trimmed.substring(5).trim();
      const { text: question, options } = parseReplOptions(rawQuestion);
      await runAsk(question, options);
      continue;
    }

    if (trimmed === '/save' || trimmed.startsWith('/save ')) {
      const rawNote = trimmed.startsWith('/save ') ? trimmed.substring(6).trim() : '';
      if (!rawNote) {
        console.log(pc.yellow('Please provide note text (e.g. /save My new note)'));
        continue;
      }
      const { text: note, options } = parseReplOptions(rawNote);
      await runNote(note, options);
      continue;
    }

    if (trimmed.startsWith('/sync ')) {
      const rawSync = trimmed.substring(6).trim();
      const dryRun = rawSync.includes('--dry-run');
      const watch = rawSync.includes('--watch') || rawSync.includes(' -w');
      let cleaned = rawSync.replace('--dry-run', '').replace('--watch', '').replace(' -w', '').trim();
      const { text: dirPath, options } = parseReplOptions(cleaned);

      if (!dirPath) {
        console.log(pc.yellow('Usage: /sync <path> [options]'));
        continue;
      }

      const { runSync } = await import('./sync.js');
      try {
        await runSync({
          dir: dirPath,
          project: options.project,
          dryRun,
          watch,
        });
      } catch (err: any) {
        console.error(pc.red(`Sync failed: ${err.message}`));
      }
      continue;
    }

    if (trimmed.startsWith('/')) {
      console.log(pc.red(`Unknown command: ${trimmed}. Type 'help' for available commands.`));
      continue;
    }

    // Default note creation shortcut
    const { text: noteText, options } = parseReplOptions(trimmed);
    await runNote(noteText, options);
  }
}
