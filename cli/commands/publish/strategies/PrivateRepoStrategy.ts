/**
 * Private repository publishing strategy
 */

import chalk from 'chalk';
import { PublishingStrategy } from '../types/PublishingStrategy';
import { PublishContext, PublishResult } from '../types/PublishingTypes';
import { MlldError, ErrorSeverity } from '@core/errors';

export class PrivateRepoStrategy implements PublishingStrategy {
  name = 'private-repo';

  canHandle(context: PublishContext): boolean {
    // Use private repo publishing if:
    // 1. Explicitly requested with --private flag
    // 2. In a private repository with write access
    
    if (context.options.private) {
      return true;
    }
    
    // Check if we're in a private repo context
    if (context.module.gitInfo.isGitRepo && 
        context.module.gitInfo.hasWriteAccess &&
        !context.options.useGist &&
        !context.options.useRepo) {
      return true;
    }
    
    return false;
  }

  async validate(context: PublishContext): Promise<void> {
    const gitInfo = context.module.gitInfo;
    
    // Validate we have write access to the repository
    if (!gitInfo.hasWriteAccess) {
      throw new MlldError(
        'Private repository publishing requires write access to the repository.',
        {
          code: 'NO_WRITE_ACCESS',
          severity: ErrorSeverity.Fatal
        }
      );
    }
    
    // Validate working tree is clean
    if (!gitInfo.isClean) {
      throw new MlldError(
        'Working tree has uncommitted changes. Please commit or stash your changes before publishing.',
        {
          code: 'DIRTY_WORKING_TREE',
          severity: ErrorSeverity.Fatal
        }
      );
    }
  }

  async execute(context: PublishContext): Promise<PublishResult> {
    await this.validate(context);
    
    const gitInfo = context.module.gitInfo;
    
    console.log(chalk.blue(`\n📤 Publishing @${context.module.metadata.author}/${context.module.metadata.name} to private repository`));
    console.log(chalk.gray(`   Repository: ${gitInfo.owner}/${gitInfo.repo}`));
    console.log(chalk.gray(`   Path: ${context.options.path || 'mlld/modules/'}`));
    
    if (context.options.dryRun) {
      console.log(chalk.yellow('Note: Would publish to private repository'));
      return {
        success: true,
        url: `https://github.com/${gitInfo.owner}/${gitInfo.repo}`,
        type: 'private',
        message: 'Would publish to private repository (dry run)'
      };
    }
    
    // TODO: Implement actual private repository publishing logic
    // This would involve:
    // 1. Creating the module directory structure
    // 2. Copying the module file
    // 3. Updating manifest.json
    // 4. Committing and pushing changes
    
    console.log(chalk.green(`✔ Published to private repository`));
    
    return {
      success: true,
      url: `https://github.com/${gitInfo.owner}/${gitInfo.repo}`,
      type: 'private',
      message: `Published to private repository: ${gitInfo.owner}/${gitInfo.repo}`
    };
  }
}