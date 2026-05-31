#!/usr/bin/env node
import { Command } from 'commander';
import pc from 'picocolors';
import { runInit } from './commands/init.js';
import { runConfigGet, runConfigSet, runConfigList } from './commands/config.js';
import { runAsk } from './commands/ask.js';
import { runNote } from './commands/note.js';
import { runListProjects, runListWorkspaces } from './commands/list.js';
import { runRepl } from './commands/repl.js';
import { runLogout } from './commands/logout.js';
import { runSync } from './commands/sync.js';
import { loadConfig } from './config.js';

const program = new Command();

program
  .name('kb')
  .description('Knowledge Base (kb) CLI tool')
  .version('1.0.0');

// init command
program
  .command('init')
  .description('Setup and authenticate the CLI with your Knowledge Base server')
  .action(async () => {
    await runInit();
  });

// logout command
program
  .command('logout')
  .description('Log out of your Knowledge Base account and clear local session')
  .action(async () => {
    await runLogout();
  });

// config command
const configCmd = program
  .command('config')
  .description('View or modify CLI configuration');

configCmd
  .command('get <key>')
  .description('Get a config value (apiUrl, workspaceSlug, defaultProjectSlug)')
  .action((key) => {
    runConfigGet(key);
  });

configCmd
  .command('set <key> <value>')
  .description('Set a config value')
  .action((key, value) => {
    runConfigSet(key, value);
  });

configCmd
  .command('list')
  .description('List current config values')
  .action(() => {
    runConfigList();
  });

// ask command
program
  .command('ask <question>')
  .description('Query your knowledge base with a question')
  .option('-p, --project <slug>', 'Specify project context')
  .action(async (question, options) => {
    await runAsk(question, options);
  });

// projects command
program
  .command('projects')
  .description('List all projects in the active workspace')
  .action(async () => {
    await runListProjects();
  });

// workspaces command
program
  .command('workspaces')
  .description('List all workspaces available')
  .action(async () => {
    await runListWorkspaces();
  });

// sync command
program
  .command('sync')
  .description('Sync local markdown files or directories with the knowledge base')
  .requiredOption('-d, --dir <path>', 'Path to local directory or single markdown file')
  .option('-p, --project <slug>', 'Default project slug')
  .option('--dry-run', 'Analyze changes without uploading')
  .option('-w, --watch', 'Watch directory or file for real-time changes')
  .action(async (options) => {
    await runSync(options);
  });


// catch-all text action for note creation
program
  .argument('[note-text...]', 'Create a new note with the specified text')
  .option('-f, --file <path>', 'Attach a file to the note')
  .option('-p, --project <slug>', 'Specify project context')
  .action(async (noteTextParts, options) => {
    const noteText = Array.isArray(noteTextParts) ? noteTextParts.join(' ') : '';
    
    // Check if stdin has piped data
    const isPiped = !process.stdin.isTTY;

    if (isPiped) {
      let pipedData = '';
      process.stdin.setEncoding('utf8');
      
      // Read piped data
      for await (const chunk of process.stdin) {
        pipedData += chunk;
      }

      pipedData = pipedData.trim();

      if (pipedData) {
        const combinedText = noteText 
          ? `${noteText}\n\n${pipedData}`
          : pipedData;
        await runNote(combinedText, options);
        return;
      }
    }

    if (noteText) {
      await runNote(noteText, options);
    } else {
      // No text and not piped: open REPL
      await runRepl();
    }
  });

async function checkAuth() {
  const config = loadConfig();
  if (!config.cookies?.kb_access_token) {
    console.log(pc.yellow('No active session found. You must log in first to use the CLI.'));
    await runInit();
    const newConfig = loadConfig();
    if (!newConfig.cookies?.kb_access_token) {
      console.error(pc.red('Authentication required. Exiting.'));
      process.exit(1);
    }
  }
}

// Handle argument parsing
async function main() {
  const firstArg = process.argv[2];
  
  // Skip auth check for init, logout, config, help, or version requests
  if (
    firstArg !== 'init' && 
    firstArg !== 'logout' && 
    firstArg !== 'config' && 
    firstArg !== '--help' && 
    firstArg !== '-h' && 
    firstArg !== 'help' && 
    firstArg !== '--version' && 
    firstArg !== '-V'
  ) {
    await checkAuth();
  }

  // If run with no arguments at all, default to REPL (unless stdin is piped)
  if (process.argv.length <= 2 && process.stdin.isTTY) {
    await runRepl();
    return;
  }
  
  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(pc.red(`Fatal Error: ${err.message}`));
  process.exit(1);
});
