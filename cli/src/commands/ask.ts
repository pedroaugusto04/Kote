import pc from 'picocolors';
import { spinner } from '@clack/prompts';
import { client, ApiClientError } from '../client.js';

export async function runAsk(question: string, options: { project?: string }): Promise<void> {
  const q = question.trim();
  if (!q) {
    console.error(pc.red('Please provide a question.'));
    process.exit(1);
  }

  const s = spinner();
  s.start('Searching knowledge base...');

  try {
    const result = await client.ask(q, options.project);
    s.stop(pc.green('Search complete!'));

    if (result && result.answer) {
      console.log('\n' + pc.bold(result.answer) + '\n');

      if (result.confidence !== undefined) {
        let confidenceStr = '';
        if (typeof result.confidence === 'number') {
          confidenceStr = `${Math.round(result.confidence * 100)}%`;
        } else {
          confidenceStr = String(result.confidence);
        }
        console.log(pc.gray(`Confidence: ${pc.cyan(confidenceStr)}`));
      }

      if (Array.isArray(result.sources) && result.sources.length > 0) {
        console.log(pc.gray('\nSources:'));
        for (const source of result.sources) {
          const title = source.title || source.fileName || source.path || 'Unnamed Source';
          console.log(pc.gray(` - ${pc.italic(title)}`));
        }
      }
      console.log();
    } else {
      console.log(pc.yellow('Could not retrieve an answer. No context available.'));
    }
  } catch (error: any) {
    s.stop(pc.red('Search failed'));
    if (error instanceof ApiClientError) {
      console.error(pc.red(`Error (${error.status}): ${(error.body as any)?.message || error.message}`));
    } else {
      console.error(pc.red(`Error: ${error.message || 'Failed to communicate with KB'}`));
    }
    process.exit(1);
  }
}
