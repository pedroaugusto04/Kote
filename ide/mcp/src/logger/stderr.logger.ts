export class StderrLogger {
  static info(message: string, ...args: unknown[]): void {
    console.error(`[INFO] ${message}`, ...args);
  }

  static warn(message: string, ...args: unknown[]): void {
    console.error(`[WARN] ${message}`, ...args);
  }

  static error(message: string, ...args: unknown[]): void {
    console.error(`[ERROR] ${message}`, ...args);
  }

  static debug(message: string, ...args: unknown[]): void {
    if (process.env.NODE_ENV === 'development' || process.env.KOTE_MCP_DEBUG) {
      console.error(`[DEBUG] ${message}`, ...args);
    }
  }
}
