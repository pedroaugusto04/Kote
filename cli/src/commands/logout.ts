import pc from 'picocolors';
import { clearConfigAuth } from '../config.js';
import { ApiClient } from '../client.js';

export async function runLogout(): Promise<void> {
  const client = new ApiClient();
  try {
    await client.logout();
  } catch (error) {
    // Even if remote server call fails, we ensure the local config session is cleared
    clearConfigAuth();
  }
  console.log(pc.green('Logged out successfully. Local session cleared.'));
}
