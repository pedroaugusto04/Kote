import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pc from 'picocolors';
import { spinner, outro } from '@clack/prompts';
import { client, ApiClientError } from '../client.js';
import { loadConfig } from '../config.js';

export interface SyncOptions {
  dir: string;
  project?: string;
  dryRun?: boolean;
  watch?: boolean;
}

interface LedgerEntry {
  noteId: string;
  sha256: string;
  lastModified: string;
}

interface SyncLedger {
  lastSyncedAt: string;
  files: Record<string, LedgerEntry>;
}

export async function runSync(options: SyncOptions): Promise<void> {
  const targetPath = path.resolve(options.dir);
  if (!fs.existsSync(targetPath)) {
    console.error(pc.red(`Error: Path not found at ${options.dir}`));
    process.exit(1);
  }

  const isFile = fs.statSync(targetPath).isFile();
  const targetDir = isFile ? path.dirname(targetPath) : targetPath;
  const ledgerPath = path.join(targetDir, '.kb-sync.json');
  const filesList = isFile ? [targetPath] : undefined;

  const config = loadConfig();
  const defaultProject = options.project || config.defaultProjectSlug || 'inbox';

  if (options.dryRun) {
    console.log(pc.yellow('Running in DRY-RUN mode. No changes will be written or sent to the server.'));
  }

  if (options.watch) {
    console.log(pc.cyan(`Starting sync in WATCH mode for: ${targetPath}`));
    await syncDirectory(targetDir, defaultProject, ledgerPath, options.dryRun || false, filesList);
    
    // Watch logic
    let debounceTimer: NodeJS.Timeout | null = null;
    fs.watch(targetPath, { recursive: !isFile }, (eventType, filename) => {
      if (!isFile) {
        if (!filename || filename.endsWith('.kb-sync.json') || !filename.endsWith('.md')) return;
      }
      
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        console.log(pc.blue(`\nChange detected in ${filename || path.basename(targetPath)}. Syncing...`));
        try {
          await syncDirectory(targetDir, defaultProject, ledgerPath, options.dryRun || false, filesList);
        } catch (err: any) {
          console.error(pc.red(`Watch sync failed: ${err.message}`));
        }
      }, 500);
    });
    
    // Keep process alive in watch mode
    await new Promise(() => {});
    return;
  }

  const s = spinner();
  s.start('Synchronizing files...');

  try {
    const stats = await syncDirectory(targetDir, defaultProject, ledgerPath, options.dryRun || false, filesList);
    s.stop(pc.green('Sync complete!'));
    
    console.log('\n' + pc.bold('Sync Summary:'));
    console.log(` - Created: ${pc.green(stats.created)}`);
    console.log(` - Updated: ${pc.cyan(stats.updated)}`);
    console.log(` - Skipped: ${pc.gray(stats.skipped)}`);
    console.log(` - Failed:  ${pc.red(stats.failed)}\n`);
    
    outro(pc.green('Files synced successfully.'));
  } catch (error: any) {
    s.stop(pc.red('Sync failed'));
    console.error(pc.red(`Error: ${error.message || 'Failed to sync folder.'}`));
    process.exit(1);
  }
}

async function syncDirectory(
  targetDir: string,
  defaultProject: string,
  ledgerPath: string,
  dryRun: boolean,
  filesList?: string[]
) {
  const ledger = loadLedger(ledgerPath);
  const files = filesList || getMarkdownFiles(targetDir);
  
  const stats = { created: 0, updated: 0, skipped: 0, failed: 0 };
  const updatedLedgerFiles: Record<string, LedgerEntry> = {};

  for (const filePath of files) {
    // Relative path to use as key in ledger
    const relativePath = path.relative(targetDir, filePath).replace(/\\/g, '/');
    if (relativePath === '.kb-sync.json') continue;

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const sha256 = calculateSha256(content);
      const mtime = fs.statSync(filePath).mtime.toISOString();
      const filename = path.basename(filePath, '.md');

      const parsed = parseMarkdown(content, filename);
      const targetProject = parsed.projectSlug || defaultProject;

      // Determine Note ID
      let noteId: string | undefined = parsed.id || ledger.files[relativePath]?.noteId;

      // Check if we need to sync
      const ledgerEntry = ledger.files[relativePath];
      if (ledgerEntry && ledgerEntry.sha256 === sha256 && noteId === ledgerEntry.noteId) {
        stats.skipped++;
        updatedLedgerFiles[relativePath] = ledgerEntry;
        continue;
      }

      if (dryRun) {
        if (noteId) {
          console.log(pc.cyan(`[Dry-run] Would UPDATE note ${noteId} (${relativePath})`));
          stats.updated++;
        } else {
          console.log(pc.green(`[Dry-run] Would CREATE note for ${relativePath}`));
          stats.created++;
        }
        continue;
      }

      // Sync payload
      const notePayload = {
        title: parsed.title,
        rawText: parsed.body,
        projectSlug: targetProject,
        tags: parsed.tags || [],
        status: parsed.status || 'active',
        canonicalType: parsed.canonicalType || 'note',
      };

      if (noteId) {
        // Update existing note
        try {
          await client.updateNote(noteId, notePayload);
          stats.updated++;
          console.log(pc.cyan(`Updated: ${relativePath}`));
        } catch (err: any) {
          if (err instanceof ApiClientError && err.status === 404) {
            // Note was deleted remotely, treat as new creation
            console.log(pc.yellow(`Note ${noteId} not found on server. Re-creating: ${relativePath}`));
            noteId = undefined;
          } else {
            throw err;
          }
        }
      }

      if (!noteId) {
        // Create new note
        const res = await client.createNote(notePayload);
        const createdId = res.noteId || res.id;
        if (!createdId) {
          throw new Error('Failed to retrieve note ID from server response');
        }
        noteId = createdId;
        stats.created++;
        console.log(pc.green(`Created: ${relativePath}`));
        
        // Inject ID back to frontmatter
        injectIdIntoFrontmatter(filePath, content, noteId as string);
      }

      // Record in ledger
      updatedLedgerFiles[relativePath] = {
        noteId: noteId as string,
        sha256: calculateSha256(fs.readFileSync(filePath, 'utf8')), // recalculate in case we injected id
        lastModified: mtime,
      };

    } catch (err: any) {
      stats.failed++;
      console.error(pc.red(`Failed to sync ${relativePath}: ${err.message}`));
    }
  }

  if (!dryRun) {
    saveLedger(ledgerPath, {
      lastSyncedAt: new Date().toISOString(),
      files: {
        ...ledger.files,
        ...updatedLedgerFiles,
      },
    });
  }

  return stats;
}

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.git',
  '.next',
]);

function getMarkdownFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file.startsWith('.')) continue; // skip hidden dirs/files
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      if (IGNORED_DIRS.has(file)) continue;
      results = results.concat(getMarkdownFiles(filePath));
    } else if (file.endsWith('.md')) {
      results.push(filePath);
    }
  }
  return results;
}

function calculateSha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function loadLedger(ledgerPath: string): SyncLedger {
  const defaults: SyncLedger = {
    lastSyncedAt: '',
    files: {},
  };
  try {
    if (!fs.existsSync(ledgerPath)) return defaults;
    const data = fs.readFileSync(ledgerPath, 'utf8');
    return JSON.parse(data) as SyncLedger;
  } catch {
    return defaults;
  }
}

function saveLedger(ledgerPath: string, ledger: SyncLedger): void {
  try {
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2), 'utf8');
  } catch (err: any) {
    console.error(pc.red(`Error saving sync ledger: ${err.message}`));
  }
}

interface ParsedMarkdown {
  id?: string;
  title?: string;
  projectSlug?: string;
  tags?: string[];
  canonicalType?: string;
  status?: string;
  body: string;
}

function parseMarkdown(content: string, fallbackTitle: string): ParsedMarkdown {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
  const match = content.match(frontmatterRegex);
  if (!match) {
    return { body: content.trim(), title: fallbackTitle };
  }
  const yaml = match[1];
  const body = content.replace(frontmatterRegex, '').trim();
  const metadata: Record<string, string> = {};
  for (const line of yaml.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.substring(0, colonIdx).trim();
      const val = line.substring(colonIdx + 1).trim();
      metadata[key] = val.replace(/^['"]|['"]$/g, '');
    }
  }
  return {
    id: metadata.id || undefined,
    title: metadata.title || fallbackTitle,
    projectSlug: metadata.project || undefined,
    tags: metadata.tags ? metadata.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
    canonicalType: metadata.canonicalType || undefined,
    status: metadata.status || undefined,
    body,
  };
}

function injectIdIntoFrontmatter(filePath: string, content: string, id: string): void {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
  const match = content.match(frontmatterRegex);
  if (match) {
    const yaml = match[1];
    if (yaml.includes('id:')) {
      const updatedYaml = yaml.replace(/id:\s*[^\r\n]*/, `id: ${id}`);
      const updatedContent = content.replace(frontmatterRegex, `---\n${updatedYaml}\n---`);
      fs.writeFileSync(filePath, updatedContent, 'utf8');
    } else {
      const updatedYaml = `id: ${id}\n${yaml}`;
      const updatedContent = content.replace(frontmatterRegex, `---\n${updatedYaml}\n---`);
      fs.writeFileSync(filePath, updatedContent, 'utf8');
    }
  } else {
    const updatedContent = `---\nid: ${id}\n---\n${content}`;
    fs.writeFileSync(filePath, updatedContent, 'utf8');
  }
}
