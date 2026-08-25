import pc from 'picocolors';
import { ApiClientError } from '../client.js';

export type SpinnerLike = {
  stop: (msg?: string) => void;
};

/**
 * Formats and prints CLI errors uniformly and exits the process with code 1.
 */
export function handleCliError(error: unknown, fallbackMessage = 'Command failed', spinnerInstance?: SpinnerLike): never {
  if (spinnerInstance) {
    spinnerInstance.stop(pc.red(fallbackMessage));
  }
  if (error instanceof ApiClientError) {
    const message = (error.body as { message?: string })?.message || error.message;
    console.error(pc.red(`Error (${error.status}): ${message}`));
  } else if (error instanceof Error) {
    console.error(pc.red(`Error: ${error.message}`));
  } else {
    console.error(pc.red(`Error: ${fallbackMessage}`));
  }
  process.exit(1);
}
