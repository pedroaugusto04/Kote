import pc from 'picocolors';
import { client, ApiClientError } from '../client.js';

export async function runListProjects(): Promise<void> {
  try {
    const result = await client.listProjects();
    const projects = Array.isArray(result) ? result : result?.projects;

    if (!projects || projects.length === 0) {
      console.log(pc.yellow('No active projects found.'));
      return;
    }

    console.log(pc.cyan('\nActive Projects:'));
    for (const project of projects) {
      const slug = project.projectSlug || 'inbox';
      const name = project.displayName || project.name || slug;
      console.log(` - ${pc.bold(slug)}: ${pc.gray(name)}`);
    }
    console.log();
  } catch (error: any) {
    if (error instanceof ApiClientError) {
      console.error(pc.red(`Error (${error.status}): ${(error.body as any)?.message || error.message}`));
    } else {
      console.error(pc.red(`Error: ${error.message || 'Failed to list projects'}`));
    }
    process.exit(1);
  }
}

export async function runListWorkspaces(): Promise<void> {
  try {
    const result = await client.listWorkspaces();
    const workspaces = Array.isArray(result) ? result : result?.workspaces;

    if (!workspaces || workspaces.length === 0) {
      console.log(pc.yellow('No workspaces found.'));
      return;
    }

    console.log(pc.cyan('\nAvailable Workspaces:'));
    for (const ws of workspaces) {
      const slug = ws.workspaceSlug;
      const name = ws.displayName || slug;
      console.log(` - ${pc.bold(slug)}: ${pc.gray(name)}`);
    }
    console.log();
  } catch (error: any) {
    if (error instanceof ApiClientError) {
      console.error(pc.red(`Error (${error.status}): ${(error.body as any)?.message || error.message}`));
    } else {
      console.error(pc.red(`Error: ${error.message || 'Failed to list workspaces'}`));
    }
    process.exit(1);
  }
}
