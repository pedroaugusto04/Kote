import pc from 'picocolors';
import { client } from '../client.js';
import { handleCliError } from '../utils/error-handler.js';

export async function runListProjects(): Promise<void> {
  try {
    const projects = await client.listProjects();

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
  } catch (error) {
    handleCliError(error, 'Failed to list projects');
  }
}

export async function runListWorkspaces(): Promise<void> {
  try {
    const result = await client.listWorkspaces();
    const workspaces = result.workspaces;

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
  } catch (error) {
    handleCliError(error, 'Failed to list workspaces');
  }
}
