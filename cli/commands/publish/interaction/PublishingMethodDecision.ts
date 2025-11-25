/**
 * Decision point for choosing publishing method
 */

import * as readline from 'readline/promises';
import chalk from 'chalk';
import { DecisionPoint } from '../types/PublishingStrategy';
import { PublishContext, PublishingMethod } from '../types/PublishingTypes';
import { MlldError, ErrorSeverity } from '@core/errors';

interface PublishingMethodChoice {
  method: PublishingMethod;
  usePrivatePath?: boolean;
}

export class PublishingMethodDecision implements DecisionPoint<PublishingMethodChoice> {
  name = 'publishing-method';

  shouldPrompt(context: PublishContext): boolean {
    // Prompt if:
    // 1. In a git repository
    // 2. Not forcing a specific method (--use-gist, --use-repo, --private)
    // 3. Repository has multiple publishing options available
    
    if (!context.module.gitInfo.isGitRepo) {
      return false; // No git repo, will use gist
    }
    
    if (context.options.useGist || context.options.useRepo || context.options.private) {
      return false; // Method already forced
    }
    
    if (context.options.force) {
      return false; // Force flag skips prompts
    }
    
    return true; // Let user choose method
  }

  async prompt(context: PublishContext): Promise<PublishingMethodChoice> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      const gitInfo = context.module.gitInfo;
      
      console.log(chalk.blue(`\n📤 Publishing @${context.module.ctx?.author}/${context.module.ctx?.name}`));
      console.log(chalk.gray(`   Repository: ${gitInfo.owner}/${gitInfo.repo}`));
      console.log(chalk.gray(`   File: ${gitInfo.relPath}`));
      
      // Check if repo is public or private
      const isPublic = await this.checkIfRepoIsPublic(context);
      
      console.log('\nPublishing options:');
      
      if (isPublic) {
        console.log('  [r] Publish from public repository (recommended)');
        console.log('      Uses git commit URL for reproducible references');
      } else {
        console.log('  [p] Publish to private repository');
        console.log('      Creates internal module for team use');
      }
      
      console.log('  [g] Create GitHub gist');
      console.log('      Creates a public gist and submits to registry');
      
      if (!isPublic && gitInfo.hasWriteAccess) {
        console.log('\nNote: Repository is private. You can publish internally or create a public gist.');
        const choice = await rl.question('\nChoice [p]: ');
        
        switch (choice.toLowerCase()) {
          case 'g':
            return { method: PublishingMethod.GIST };
          case 'p':
          case '':
          default:
            return { method: PublishingMethod.PRIVATE };
        }
      } else if (isPublic) {
        const choice = await rl.question('\nChoice [r]: ');
        
        switch (choice.toLowerCase()) {
          case 'g':
            return { method: PublishingMethod.GIST };
          case 'r':
          case '':
          default:
            return { method: PublishingMethod.REPOSITORY };
        }
      } else {
        // Private repo without write access
        console.log('\nNote: Repository is private and you do not have write access.');
        console.log('      Will create a GitHub gist instead.');
        return { method: PublishingMethod.GIST };
      }
    } finally {
      rl.close();
    }
  }

  applyChoice(choice: PublishingMethodChoice, context: PublishContext): PublishContext {
    // Update context options based on choice
    switch (choice.method) {
      case PublishingMethod.GIST:
        context.options.useGist = true;
        break;
      case PublishingMethod.REPOSITORY:
        context.options.useRepo = true;
        break;
      case PublishingMethod.PRIVATE:
        context.options.private = true;
        break;
    }
    
    return context;
  }

  validate(choice: PublishingMethodChoice): boolean {
    return Object.values(PublishingMethod).includes(choice.method);
  }

  private async checkIfRepoIsPublic(context: PublishContext): Promise<boolean> {
    const gitInfo = context.module.gitInfo;
    
    try {
      const { data: repo } = await context.octokit.repos.get({
        owner: gitInfo.owner!,
        repo: gitInfo.repo!,
      });
      
      return !repo.private;
    } catch (error: any) {
      if (error.status === 404) {
        // Repository not found - could be private
        return false;
      }
      // If we can't determine, assume private for safety
      return false;
    }
  }
}