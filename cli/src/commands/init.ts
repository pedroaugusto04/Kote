import { intro, outro, text, password, select, spinner, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import { saveConfig } from '../config.js';
import { ApiClient } from '../client.js';

export async function runInit(): Promise<void> {
  intro(pc.cyan('Kote CLI Setup'));

  const apiUrl = 'https://knowledgebase.sbs/kote/api';

  const authMethod = await select({
    message: 'Select authentication method:',
    options: [
      { value: 'google', label: '1 - Google OAuth (Browser Login)' },
      { value: 'email', label: '2 - Email & Password' },
    ],
  });

  if (isCancel(authMethod)) {
    outro(pc.red('Setup cancelled.'));
    return;
  }

  // Save temporary URL so ApiClient can use it for requests
  saveConfig({ apiUrl, cookies: {} });
  const client = new ApiClient();
  const s = spinner();

  try {
    if (authMethod === 'google') {
      const googleStartUrl = `${apiUrl}/auth/google/start?returnTo=/kote/auth`;
      console.log('\n' + pc.cyan('Google OAuth Instructions:'));
      console.log(`1. Open the following URL in your browser to log in:`);
      console.log(`   ${pc.underline(pc.bold(pc.blue(googleStartUrl)))}`);
      console.log(`2. Once logged in, go to your Profile page and click "Reveal Connection Token".`);
      console.log(`3. Copy the token and paste it below:\n`);

      const token = await password({
        message: 'Paste your Connection Token:',
        validate: (value) => {
          if (!value || !value.trim()) return 'Connection Token is required';
          return;
        },
      });

      if (isCancel(token)) {
        outro(pc.red('Setup cancelled.'));
        return;
      }

      s.start('Validating Google Connection Token...');
      const trimmed = token.trim();
      let accessToken = trimmed;
      let refreshToken: string | undefined = undefined;

      if (trimmed.startsWith('kbc_')) {
        try {
          const payload = Buffer.from(trimmed.slice(4), 'base64').toString('utf8');
          const parsed = JSON.parse(payload);
          if (parsed.accessToken && parsed.refreshToken) {
            accessToken = parsed.accessToken;
            refreshToken = parsed.refreshToken;
          } else {
            throw new Error('Not legacy format');
          }
        } catch {
          s.message('Exchanging connection token...');
          const result = await client.exchangeConnectionToken(trimmed);
          accessToken = result.accessToken;
          refreshToken = result.refreshToken;
        }
      }

      saveConfig({
        apiUrl,
        cookies: {
          kb_access_token: accessToken,
          kb_refresh_token: refreshToken,
        },
      });
    } else {
      // Email & Password login
      const email = await text({
        message: 'Enter your account email:',
        validate: (value) => {
          if (!value || !value.trim()) return 'Email is required';
          if (!value.includes('@')) return 'Enter a valid email address';
          return;
        },
      });

      if (isCancel(email)) {
        outro(pc.red('Setup cancelled.'));
        return;
      }

      const userPassword = await password({
        message: 'Enter your password:',
        validate: (value) => {
          if (!value) return 'Password is required';
          return;
        },
      });

      if (isCancel(userPassword)) {
        outro(pc.red('Setup cancelled.'));
        return;
      }

      s.start('Connecting and authenticating...');
      await client.login(email.trim(), userPassword);
    }

    s.message('Fetching workspaces...');
    const workspacesResult = await client.listWorkspaces();
    s.stop(pc.green('Authenticated successfully!'));

    let selectedWorkspace = 'default';
    if (workspacesResult && Array.isArray(workspacesResult.workspaces)) {
      const workspaces = workspacesResult.workspaces;
      if (workspaces.length > 1) {
        const workspaceSelection = await select({
          message: 'Select your default workspace:',
          options: workspaces.map((w: any) => ({
            value: w.workspaceSlug,
            label: w.displayName || w.workspaceSlug,
          })),
        });

        if (isCancel(workspaceSelection)) {
          outro(pc.red('Setup cancelled.'));
          return;
        }
        selectedWorkspace = String(workspaceSelection);
      } else if (workspaces.length === 1 && workspaces[0]) {
        selectedWorkspace = workspaces[0].workspaceSlug;
      }
    }

    saveConfig({
      apiUrl,
      workspaceSlug: selectedWorkspace,
      defaultProjectSlug: 'inbox',
    });

    outro(pc.green(`Setup complete! CLI initialized and ready in workspace "${selectedWorkspace}".`));
  } catch (error: any) {
    s.stop(pc.red('Authentication failed'));
    const errorMsg = error?.body?.message || error?.message || 'Unknown error';
    outro(pc.red(`Error: ${errorMsg}. Please check your credentials and URL, and run 'kote init' again.`));
  }
}
