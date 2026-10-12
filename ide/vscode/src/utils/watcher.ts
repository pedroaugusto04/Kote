import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface WatchRecursiveOptions {
  /**
   * Optional predicate to filter which subdirectories should be watched.
   * Useful on Linux (inotify) to avoid watching deep irrelevant trees.
   */
  shouldWatchDir?: (dirPath: string, dirName: string) => boolean;
}

const SUPPORTS_NATIVE_RECURSIVE_WATCH =
  process.platform === 'win32' || process.platform === 'darwin';

function isAllowedByDirFilter(
  baseDir: string,
  relativePath: string,
  shouldWatchDir?: (dirPath: string, dirName: string) => boolean,
): boolean {
  if (!shouldWatchDir) return true;
  const parts = relativePath.split(/[\\/]+/).filter(Boolean);
  // The last segment is the file name; check all parent directory segments.
  let currentPath = baseDir;
  for (let i = 0; i < parts.length - 1; i++) {
    const segment = parts[i];
    currentPath = path.join(currentPath, segment);
    if (!shouldWatchDir(currentPath, segment)) {
      return false;
    }
  }
  return true;
}

/**
 * Recursively watches a directory for file changes/creations.
 * Optimized for Linux (inotify with Dirent d_type traversal, zero redundant stat syscalls
 * on file change events, and race-free new subdirectory scanning) as well as
 * Windows/macOS (single native OS recursive watcher handle).
 */
export function watchRecursive(
  baseDir: string,
  filter: (fileName: string) => boolean,
  onChange: (filePath: string) => void,
  options?: WatchRecursiveOptions,
): vscode.Disposable {
  const shouldWatchDir = options?.shouldWatchDir;

  if (SUPPORTS_NATIVE_RECURSIVE_WATCH && fs.existsSync(baseDir)) {
    try {
      const nativeWatcher = fs.watch(baseDir, { recursive: true }, (_eventType, filename) => {
        if (!filename) return;
        const normalizedRel = String(filename);
        const baseName = path.basename(normalizedRel);
        if (!filter(baseName)) return;
        if (!isAllowedByDirFilter(baseDir, normalizedRel, shouldWatchDir)) return;
        onChange(path.join(baseDir, normalizedRel));
      });

      nativeWatcher.on('error', (err) => {
        console.error(`Watcher error on ${baseDir}:`, err);
      });

      return new vscode.Disposable(() => {
        try {
          nativeWatcher.close();
        } catch {
          // ignore close errors
        }
      });
    } catch {
      // Fall back to manual per-directory watcher below if native recursive watch fails
    }
  }

  const watchers = new Map<string, fs.FSWatcher>();

  const unwatchSubtree = (rootPath: string) => {
    const prefix = rootPath.endsWith(path.sep) ? rootPath : `${rootPath}${path.sep}`;
    for (const [watchedPath, existingWatcher] of watchers.entries()) {
      if (watchedPath === rootPath || watchedPath.startsWith(prefix)) {
        try {
          existingWatcher.close();
        } catch {
          // ignore close errors
        }
        watchers.delete(watchedPath);
      }
    }
  };

  const watchDir = (dirPath: string, isInitialScan: boolean) => {
    if (watchers.has(dirPath)) return;
    try {
      const watcher = fs.watch(dirPath, { recursive: false }, (eventType, filename) => {
        if (!filename) return;
        const name = String(filename);
        const fullPath = path.join(dirPath, name);

        // Fast path on Linux: if the filename itself matches the target file filter,
        // emit immediately without performing existsSync + statSync on every write.
        if (filter(name)) {
          onChange(fullPath);
          return;
        }

        // Only inspect filesystem metadata on 'rename' events (directory creation/deletion)
        if (eventType !== 'rename') return;

        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            if (!shouldWatchDir || shouldWatchDir(fullPath, name)) {
              // Newly created directory at runtime: watch it and notify for any
              // matching files already written inside before inotify attached.
              watchDir(fullPath, false);
            }
          }
        } catch {
          // Directory or file was removed; clean up any stale watcher for that path
          if (watchers.has(fullPath)) {
            unwatchSubtree(fullPath);
          }
        }
      });

      watcher.on('error', (err) => {
        console.error(`Watcher error on ${dirPath}:`, err);
        unwatchSubtree(dirPath);
      });

      watchers.set(dirPath, watcher);

      // Traverse subdirectories using Dirent (withFileTypes: true) so Linux uses
      // getdents64 d_type directly without issuing stat() syscalls per entry.
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          if (!shouldWatchDir || shouldWatchDir(fullPath, entry.name)) {
            watchDir(fullPath, isInitialScan);
          }
        } else if (!isInitialScan && entry.isFile() && filter(entry.name)) {
          // Catch files created in the brief window between mkdir and watcher attachment on Linux
          onChange(fullPath);
        }
      }
    } catch (err) {
      console.error(`Failed to watch directory: ${dirPath}`, err);
    }
  };

  try {
    if (fs.existsSync(baseDir)) {
      watchDir(baseDir, true);
    }
  } catch (err) {
    console.error(`Failed to initialize watcher on ${baseDir}`, err);
  }

  return new vscode.Disposable(() => {
    for (const watcher of watchers.values()) {
      try {
        watcher.close();
      } catch {
        // ignore close errors
      }
    }
    watchers.clear();
  });
}

/**
 * Watches a single file for changes (including atomic rename replacements on Linux).
 */
export function watchFile(
  filePath: string,
  onChange: () => void
): vscode.Disposable {
  try {
    const watcher = fs.watch(filePath, (eventType) => {
      if (eventType === 'change' || eventType === 'rename') {
        onChange();
      }
    });
    watcher.on('error', (err) => {
      console.error(`Watcher error on file ${filePath}:`, err);
    });
    return new vscode.Disposable(() => {
      try {
        watcher.close();
      } catch {
        // Watcher already closed or aborted
      }
    });
  } catch (err) {
    console.error(`Failed to watch file: ${filePath}`, err);
    return new vscode.Disposable(() => {});
  }
}
