/**
 * Decision point for committing metadata changes
 */

import * as readline from 'readline/promises';
import chalk from 'chalk';
import { DecisionPoint } from '../types/PublishingStrategy';
import { PublishContext } from '../types/PublishingTypes';
import { MlldError, ErrorSeverity } from '@core/errors';

interface MetadataCommitChoice {
  action: 'apply' | 'apply-and-commit' | 'cancel';
}

export class MetadataCommitDecision implements DecisionPoint<MetadataCommitChoice> {
  name = 'metadata-commit';

  shouldPrompt(context: PublishContext): boolean {
    // Prompt if we have validation results with metadata updates
    // and we're in a git repository
    return !!(
      context.validationResult?.updatedMetadata &&
      context.module.gitInfo.isGitRepo &&
      !context.options.force
    );
  }

  async prompt(context: PublishContext): Promise<MetadataCommitChoice> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      console.log(chalk.yellow('\nMetadata updates available:'));
      
      if (context.validationResult?.updatedMetadata) {
        const updates = context.validationResult.updatedMetadata;
        Object.entries(updates).forEach(([key, value]) => {
          console.log(chalk.gray(`   ${key}: ${value}`));
        });
      }

      console.log('\nOptions:');
      console.log('  [1] Apply changes and continue (default)');
      console.log('  [2] Apply changes and auto-commit to git');
      console.log('  [3] Cancel publishing');

      const choice = await rl.question('\nChoice [1]: ');

      switch (choice) {
        case '2':
          return { action: 'apply-and-commit' };
        case '3':
          return { action: 'cancel' };
        case '1':
        case '':
        default:
          return { action: 'apply' };
      }
    } finally {
      rl.close();
    }
  }

  applyChoice(choice: MetadataCommitChoice, context: PublishContext): PublishContext {
    if (choice.action === 'cancel') {
      throw new MlldError('Publishing cancelled by user', {
        code: 'USER_CANCELLED',
        severity: ErrorSeverity.Info
      });
    }

    // Apply the metadata changes
    if (context.validationResult?.updatedMetadata) {
      context.module.metadata = {
        ...context.module.metadata,
        ...context.validationResult.updatedMetadata
      };
    }

    // Update content if available
    if (context.validationResult?.updatedContent) {
      context.module.content = context.validationResult.updatedContent;
    }

    // Mark for git commit if requested
    if (choice.action === 'apply-and-commit') {
      context.shouldCommitMetadata = true;
    }

    return context;
  }

  validate(choice: MetadataCommitChoice): boolean {
    return ['apply', 'apply-and-commit', 'cancel'].includes(choice.action);
  }
}