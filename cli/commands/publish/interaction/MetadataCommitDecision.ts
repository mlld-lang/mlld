/**
 * Decision point for committing metadata changes
 */

import * as readline from 'readline/promises';
import chalk from 'chalk';
import { DecisionPoint } from '../types/PublishingStrategy';
import { PublishContext } from '../types/PublishingTypes';
import { MlldError, ErrorSeverity } from '@core/errors';

interface MetadataCommitChoice {
  action: 'continue' | 'cancel';
}

export class MetadataCommitDecision implements DecisionPoint<MetadataCommitChoice> {
  name = 'metadata-commit';

  shouldPrompt(context: PublishContext): boolean {
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

      console.log(chalk.gray('\n   Changes will be committed and pushed automatically.'));
      console.log('\nOptions:');
      console.log('  [1] Continue (default)');
      console.log('  [2] Cancel publishing');

      const choice = await rl.question('\nChoice [1]: ');

      if (choice === '2') {
        return { action: 'cancel' };
      }
      return { action: 'continue' };
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

    // Apply the metadata changes in memory
    if (context.validationResult?.updatedMetadata) {
      context.module.metadata = {
        ...context.module.metadata,
        ...context.validationResult.updatedMetadata
      };
    }

    if (context.validationResult?.updatedContent) {
      context.module.content = context.validationResult.updatedContent;
    }

    return context;
  }

  validate(choice: MetadataCommitChoice): boolean {
    return ['continue', 'cancel'].includes(choice.action);
  }
}
