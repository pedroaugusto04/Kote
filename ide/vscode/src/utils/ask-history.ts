import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AskHistoryEntry {
  id: string;
  question: string;
  answer: string;
  projectSlug: string;
  timestamp: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const HISTORY_PATH = path.join(os.homedir(), '.config', 'kb', 'ask-history.json');
const MAX_ENTRIES = 100;

function ensureDir(): void {
  const dir = path.dirname(HISTORY_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadAskHistory(): AskHistoryEntry[] {
  try {
    if (!fs.existsSync(HISTORY_PATH)) return [];
    const raw = fs.readFileSync(HISTORY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addAskEntry(
  entry: Omit<AskHistoryEntry, 'id' | 'timestamp'>,
): AskHistoryEntry {
  const full: AskHistoryEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };

  try {
    ensureDir();
    const history = loadAskHistory();
    history.unshift(full);
    if (history.length > MAX_ENTRIES) history.splice(MAX_ENTRIES);
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf8');
  } catch {
    // Never block the ask flow due to history write errors
  }

  return full;
}

export function clearAskHistory(): void {
  try {
    ensureDir();
    fs.writeFileSync(HISTORY_PATH, '[]', 'utf8');
  } catch {}
}
