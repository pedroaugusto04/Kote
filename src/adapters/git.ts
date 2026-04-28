import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

export async function runGit(cwd: string, args: string[], options: { allowFailure?: boolean; gitConfigs?: string[] } = {}) {
  try {
    const configArgs = [
      '-c',
      `safe.directory=${cwd}`,
      ...(options.gitConfigs || []).flatMap((entry) => ['-c', entry]),
    ];
    const result = await execFile('git', [...configArgs, '-C', cwd, ...args], { maxBuffer: 20 * 1024 * 1024 });
    return {
      ok: true,
      stdout: String(result.stdout || '').trim(),
      stderr: String(result.stderr || '').trim(),
    };
  } catch (error) {
    if (!options.allowFailure) throw error;
    return {
      ok: false,
      stdout: String((error as { stdout?: string }).stdout || '').trim(),
      stderr: String((error as { stderr?: string; message?: string }).stderr || (error as Error).message || '').trim(),
    };
  }
}

export function buildPushGitConfigs(remoteUrl: string, username: string, token: string): string[] {
  if (!remoteUrl || !/^https:\/\//i.test(remoteUrl) || !username || !token) return [];
  const auth = Buffer.from(`${username}:${token}`, 'utf8').toString('base64');
  return [`http.extraheader=AUTHORIZATION: Basic ${auth}`];
}
