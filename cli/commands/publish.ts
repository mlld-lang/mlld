/**
 * CLI integration for the modular publishing system
 */

import { PublishCommand } from './publish/PublishCommand';
import { PublishOptions } from './publish/types/PublishingTypes';
import { OutputFormatter } from '../utils/output';

/**
 * Standalone publish command function for CLI integration
 */
export async function publishCommand(args: string[], options: PublishOptions = {}): Promise<void> {
  const modulePath = args[0] || '.';
  const publisher = new PublishCommand();
  await publisher.publish(modulePath, options);
}

/**
 * Create the publish command for CLI integration
 */
export function createPublishCommand() {
  return {
    name: 'publish',
    description: 'Publish module to mlld registry',
    
    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      const options: PublishOptions = {
        verbose: flags.verbose || flags.v,
        dryRun: flags['dry-run'] || flags.n,
        force: flags.force || flags.f,
        message: flags.message || flags.m,
        useGist: flags['use-gist'] || flags.gist || flags.g,
        useRepo: flags['use-repo'] || flags.repo || flags.r,
        org: flags.org || flags.o,
        skipVersionCheck: flags['skip-version-check'],
        private: flags.private || flags.p,
        pr: flags.pr,
        path: flags.path,
        tag: flags.tag || flags.t,
      };
      
      try {
        await publishCommand(args, options);
      } catch (error) {
        console.error(OutputFormatter.formatError(error, { verbose: options.verbose }));
        process.exit(1);
      }
    }
  };
}

// Re-export types for backward compatibility with any direct imports
export type { PublishOptions } from './publish/types/PublishingTypes';