import { intro, outro, text, password, select, spinner, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import { saveConfig } from '../config.js';
import { ApiClient } from '../client.js';

export async function runInit(): Promise<void> {
  intro(pc.cyan('Knowledge Base (kb) CLI Setup'));

  const apiUrl = 'https://pedro-duarte.ddns.net/knowledge-base/api';

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
      const googleStartUrl = `${apiUrl}/auth/google/start?returnTo=/knowledge-base/auth`;
      console.log('\n' + pc.cyan('Google OAuth Instructions:'));
      console.log(`1. Open the following URL in your browser to log in:`);
      console.log(`   ${pc.underline(pc.bold(pc.blue(googleStartUrl)))}`);
      console.log(`2. Once logged in, open the Developer Tools (F12) in your browser.`);
      console.log(`3. Under the Application tab (Storage -> Cookies), find the cookie named "${pc.bold('kb_access_token')}".`);
      console.log(`4. Copy its value and paste it below:\n`);

      const token = await password({
        message: 'Paste the kb_access_token cookie value:',
        validate: (value) => {
          if (!value || !value.trim()) return 'Access token value is required';
          return;
        },
      });

      if (isCancel(token)) {
        outro(pc.red('Setup cancelled.'));
        return;
      }

      s.start('Validating Google access token...');
      saveConfig({
        apiUrl,
        cookies: {
          kb_access_token: token.trim(),
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
    outro(pc.red(`Error: ${errorMsg}. Please check your credentials and URL, and run 'kb init' again.`));
  }
}
