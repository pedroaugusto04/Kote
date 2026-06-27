import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Recursively watches a directory for file changes/creations.
 * This is designed to work reliably on Linux, macOS, and Windows for folders
 * outside the active VS Code workspace.
 */
export function watchRecursive(
  baseDir: string,
  filter: (fileName: string) => boolean,
  onChange: (filePath: string) => void
): vscode.Disposable {
  const watchers = new Map<string, fs.FSWatcher>();

  const watchDir = (dirPath: string) => {
    if (watchers.has(dirPath)) return;
    try {
      const watcher = fs.watch(dirPath, { recursive: false }, (eventType, filename) => {
        if (!filename) return;
        const fullPath = path.join(dirPath, filename);

        try {
          if (fs.existsSync(fullPath)) {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              // A new directory was created, start watching it recursively
              watchDir(fullPath);
              return;
            }
          }
        } catch (err) {
          // ignore stat errors (e.g. permission or transient deletion)
        }

        // If it's a file matching our filter, fire the change callback
        if (filter(filename)) {
          onChange(fullPath);
        }
      });

      watcher.on('error', (err) => {
        console.error(`Watcher error on ${dirPath}:`, err);
      });

      watchers.set(dirPath, watcher);

      // Recursively find and watch existing subdirectories
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          const fullPath = path.join(dirPath, file);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              watchDir(fullPath);
            }
          } catch {
            // ignore stat errors
          }
        }
      }
    } catch (err) {
      console.error(`Failed to watch directory: ${dirPath}`, err);
    }
  };

  try {
    if (fs.existsSync(baseDir)) {
      watchDir(baseDir);
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
 * Watches a single file for changes.
 */
export function watchFile(
  filePath: string,
  onChange: () => void
): vscode.Disposable {
  try {
    const watcher = fs.watch(filePath, (eventType) => {
      if (eventType === 'change') {
        onChange();
      }
    });
    watcher.on('error', (err) => {
      console.error(`Watcher error on file ${filePath}:`, err);
    });
    return new vscode.Disposable(() => {
      try {
        watcher.close();
      } catch {}
    });
  } catch (err) {
    console.error(`Failed to watch file: ${filePath}`, err);
    return new vscode.Disposable(() => {});
  }
}
