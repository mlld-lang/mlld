/**
 * Gist publishing strategy
 */

import * as readline from 'readline/promises';
import * as crypto from 'crypto';
import chalk from 'chalk';
import { PublishingStrategy } from '../types/PublishingStrategy';
import { PublishContext, PublishResult, PublishingMethod } from '../types/PublishingTypes';
import { MlldError, ErrorSeverity } from '@core/errors';

export class GistPublishingStrategy implements PublishingStrategy {
  name = 'gist';

  canHandle(context: PublishContext): boolean {
    // Use gist if:
    // 1. Explicitly requested with --use-gist
    // 2. Not in a git repository
    // 3. In a private repository without write access
    // 4. User chose gist over repository publishing
    
    if (context.options.useGist) {
      return true;
    }
    
    if (!context.module.gitInfo.isGitRepo) {
      return true;
    }
    
    // Check if this is a private repo without write access
    if (context.module.gitInfo.isGitRepo && !context.module.gitInfo.hasWriteAccess) {
      return true;
    }
    
    return false;
  }

  async validate(context: PublishContext): Promise<void> {
    // Validate that organizations can't create gists
    if (context.module.metadata.author !== context.user.login) {
      throw new MlldError(
        `Cannot create gists on behalf of organization '${context.module.metadata.author}'.\n` +
        `GitHub organizations cannot create gists. Please use one of these alternatives:\n` +
        `  1. Publish from a public git repository\n` +
        `  2. Remove the --org flag or org author to publish under your personal account\n` +
        `  3. Create the module in a public repository owned by ${context.module.metadata.author}`,
        {
          code: 'ORG_GIST_ERROR',
          severity: ErrorSeverity.Fatal
        }
      );
    }
  }

  async execute(context: PublishContext): Promise<PublishResult> {
    await this.validate(context);
    
    // Get confirmation unless forced
    if (!context.options.dryRun && !context.options.force) {
      const shouldContinue = await this.getConfirmation(context);
      if (!shouldContinue) {
        throw new MlldError('Publication cancelled by user', {
          code: 'USER_CANCELLED',
          severity: ErrorSeverity.Info
        });
      }
    }

    // Create the gist
    const gistData = await this.createGist(context);
    
    // Auto-populate bugs URL for gist
    if (!context.module.metadata.bugs && !context.options.dryRun) {
      context.module.metadata.bugs = `${gistData.html_url}#comments`;
      console.log(chalk.blue(`Pinned: Adding bugs URL for gist: ${context.module.metadata.bugs}`));
    }

    // Create registry entry
    const registryEntry = this.createRegistryEntry(context, gistData);
    
    return {
      success: true,
      url: gistData.html_url,
      type: 'gist',
      message: `Gist created: ${gistData.html_url}`,
      registryEntry
    };
  }

  private async getConfirmation(context: PublishContext): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      const sourceInfo = context.module.gitInfo.isGitRepo ? 
        `${context.module.filePath} (not in git repo)` : 
        context.module.filePath;

      console.log(chalk.blue(`\n📤 Publishing @${context.module.metadata.author}/${context.module.metadata.name} as a GitHub gist`));
      console.log(chalk.gray(`   Source: ${sourceInfo}`));
      console.log(chalk.gray(`   This will create a new gist and pull request to the mlld registry\n`));

      console.log('Options:');
      console.log('  [Enter] Confirm and create gist');
      console.log('  [c]     Cancel');

      const choice = await rl.question('\nChoice: ');
      
      return choice.toLowerCase() !== 'c';
    } finally {
      rl.close();
    }
  }

  private async createGist(context: PublishContext): Promise<any> {
    if (context.options.dryRun) {
      console.log(chalk.yellow('Note: Would create GitHub gist'));
      return {
        id: 'DRY_RUN_ID',
        html_url: `https://gist.github.com/${context.user.login}/DRY_RUN_ID`,
        files: {
          [context.module.filePath]: {
            raw_url: `https://gist.githubusercontent.com/${context.user.login}/DRY_RUN_ID/raw/${context.module.filePath}`
          }
        }
      };
    }

    const filename = context.module.filePath.split('/').pop() || 'module.mld';
    
    const gist = await context.octokit.gists.create({
      description: `${context.module.metadata.name} - ${context.module.metadata.about}`,
      public: true,
      files: {
        [filename]: {
          content: context.module.content,
        },
      },
    });

    console.log(chalk.green(`✔ Gist created: ${gist.data.html_url}`));
    return gist.data;
  }

  private createRegistryEntry(context: PublishContext, gistData: any): any {
    const filename = context.module.filePath.split('/').pop() || 'module.mld';
    const contentHash = crypto.createHash('sha256').update(context.module.content).digest('hex');
    const sourceUrl = gistData.files[filename]?.raw_url || `https://gist.githubusercontent.com/${context.user.login}/${gistData.id}/raw/${filename}`;

    return {
      name: context.module.metadata.name,
      author: context.module.metadata.author,
      version: context.module.metadata.version || '1.0.0',
      about: context.module.metadata.about,
      needs: context.module.metadata.needs || [],
      repo: context.module.metadata.repo,
      keywords: context.module.metadata.keywords || [],
      bugs: context.module.metadata.bugs,
      homepage: context.module.metadata.homepage,
      license: context.module.metadata.license,
      mlldVersion: context.module.metadata.mlldVersion || '>=0.5.0',
      ownerGithubUserIds: [context.user.id],
      source: {
        type: 'gist' as const,
        url: sourceUrl,
        gistId: gistData.id,
        contentHash,
      },
      dependencies: this.buildDependenciesObject(context.module.metadata),
      publishedAt: new Date().toISOString(),
    };
  }

  private buildDependenciesObject(metadata: any): any {
    const dependencies: any = {};
    
    if (metadata.needsJs) {
      dependencies.js = metadata.needsJs;
    }
    if (metadata.needsNode) {
      dependencies.node = metadata.needsNode;
    }
    if (metadata.needsPy) {
      dependencies.py = metadata.needsPy;
    }
    if (metadata.needsSh) {
      dependencies.sh = metadata.needsSh;
    }
    
    return dependencies;
  }
}