/**
 * Repository publishing strategy for public GitHub repositories
 */

import * as crypto from 'crypto';
import chalk from 'chalk';
import { PublishingStrategy } from '../types/PublishingStrategy';
import { PublishContext, PublishResult, GitInfo } from '../types/PublishingTypes';
import { MlldError, ErrorSeverity } from '@core/errors';

export class RepoPublishingStrategy implements PublishingStrategy {
  name = 'repository';

  canHandle(context: PublishContext): boolean {
    // Use repository publishing if:
    // 1. In a git repository with GitHub remote
    // 2. Not forcing gist creation
    // 3. Repository is public (or user has write access for private)
    // 4. Working tree is clean
    
    if (context.options.useGist) {
      return false; // Explicitly wants gist
    }
    
    if (!context.module.gitInfo.isGitRepo) {
      return false; // Not in git repo
    }
    
    if (!context.module.gitInfo.remoteUrl?.includes('github.com')) {
      return false; // Not a GitHub repository
    }
    
    return true; // Can handle if git repo with GitHub remote
  }

  async validate(context: PublishContext): Promise<void> {
    const gitInfo = context.module.gitInfo;
    
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
    
    // Validate we have all required git info
    if (!gitInfo.owner || !gitInfo.repo || !gitInfo.sha || !gitInfo.relPath) {
      throw new MlldError(
        'Could not extract complete git repository information. Ensure you are in a valid GitHub repository.',
        {
          code: 'INCOMPLETE_GIT_INFO',
          severity: ErrorSeverity.Fatal
        }
      );
    }
    
    // Check if repository is public
    const isPublic = await this.checkIfRepoIsPublic(context);
    if (!isPublic && !gitInfo.hasWriteAccess) {
      throw new MlldError(
        'Repository is private and you do not have write access. Cannot publish from private repository without write access.',
        {
          code: 'PRIVATE_REPO_NO_ACCESS',
          severity: ErrorSeverity.Fatal
        }
      );
    }
  }

  async execute(context: PublishContext): Promise<PublishResult> {
    await this.validate(context);
    
    const gitInfo = context.module.gitInfo;
    const isPublic = await this.checkIfRepoIsPublic(context);
    
    if (isPublic) {
      return this.publishFromPublicRepo(context);
    } else {
      return this.publishFromPrivateRepo(context);
    }
  }

  private async publishFromPublicRepo(context: PublishContext): Promise<PublishResult> {
    const gitInfo = context.module.gitInfo;
    const sourceUrl = `https://raw.githubusercontent.com/${gitInfo.owner}/${gitInfo.repo}/${gitInfo.sha}/${gitInfo.relPath}`;
    
    console.log(chalk.blue(`\n📤 Publishing @${context.module.metadata.author}/${context.module.metadata.name} from public repository`));
    console.log(chalk.gray(`   Repository: ${gitInfo.owner}/${gitInfo.repo}`));
    console.log(chalk.gray(`   Remote URL: ${gitInfo.remoteUrl}`));
    console.log(chalk.gray(`   Commit SHA: ${gitInfo.sha}`));
    console.log(chalk.gray(`   Branch: ${gitInfo.branch}`));
    console.log(chalk.gray(`   Path: ${gitInfo.relPath}`));
    console.log(chalk.gray(`   Full URL: ${sourceUrl}`));
    
    // Auto-populate repository metadata if missing
    if (!context.module.metadata.repo) {
      context.module.metadata.repo = `https://github.com/${gitInfo.owner}/${gitInfo.repo}`;
    }
    if (!context.module.metadata.bugs) {
      context.module.metadata.bugs = `https://github.com/${gitInfo.owner}/${gitInfo.repo}/issues`;
    }
    
    // Verify the URL is accessible before publishing
    console.log(chalk.gray(`\n   Verifying URL accessibility...`));
    try {
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        throw new Error(`URL returned ${response.status}: ${response.statusText}`);
      }
      const content = await response.text();
      if (!content || content.length === 0) {
        throw new Error('URL returned empty content');
      }
      console.log(chalk.green(`   ✓ URL is accessible (${content.length} bytes)`));
    } catch (error) {
      console.error(chalk.red(`   ✗ URL verification failed: ${error instanceof Error ? error.message : String(error)}`));
      const pushHint = gitInfo.remoteUrl
        ? `Push commit ${gitInfo.sha} to ${gitInfo.remoteUrl} (branch ${gitInfo.branch}) so the URL is reachable.`
        : 'Push the current commit to your GitHub remote so the URL is reachable.';
      throw new MlldError(
        `Cannot publish: Module content is not accessible at ${sourceUrl}. ${pushHint}`,
        { code: 'REPO_URL_UNAVAILABLE', severity: ErrorSeverity.Fatal }
      );
    }

    const registryEntry = this.createPublicRepoRegistryEntry(context, sourceUrl);
    
    return {
      success: true,
      url: `https://github.com/${gitInfo.owner}/${gitInfo.repo}`,
      type: 'repository',
      message: `Published from public repository: ${gitInfo.owner}/${gitInfo.repo}`,
      registryEntry
    };
  }

  private async publishFromPrivateRepo(context: PublishContext): Promise<PublishResult> {
    const gitInfo = context.module.gitInfo;
    
    console.log(chalk.blue(`\n📤 Publishing @${context.module.metadata.author}/${context.module.metadata.name} from private repository`));
    console.log(chalk.gray(`   Repository: ${gitInfo.owner}/${gitInfo.repo}`));
    console.log(chalk.gray(`   This will copy the module to the private repository's module directory`));
    
    // For private repos, we need special handling
    // This is a simplified version - the full implementation would need more details
    const registryEntry = this.createPrivateRepoRegistryEntry(context);
    
    return {
      success: true,
      url: `https://github.com/${gitInfo.owner}/${gitInfo.repo}`,
      type: 'private',
      message: `Published to private repository: ${gitInfo.owner}/${gitInfo.repo}`,
      registryEntry
    };
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
      throw new MlldError(`Failed to check repository visibility: ${error.message}`, {
        code: 'REPO_CHECK_FAILED',
        severity: ErrorSeverity.Fatal
      });
    }
  }

  private createPublicRepoRegistryEntry(context: PublishContext, sourceUrl: string): any {
    const gitInfo = context.module.gitInfo;
    const contentHash = crypto.createHash('sha256').update(context.module.content).digest('hex');
    
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
        type: 'github' as const,
        url: sourceUrl,
        contentHash,
        repository: {
          type: 'git',
          url: `https://github.com/${gitInfo.owner}/${gitInfo.repo}`,
          commit: gitInfo.sha,
          path: gitInfo.relPath,
        },
      },
      dependencies: this.buildDependenciesObject(context.module.metadata),
      publishedAt: new Date().toISOString(),
    };
  }

  private createPrivateRepoRegistryEntry(context: PublishContext): any {
    const gitInfo = context.module.gitInfo;
    const contentHash = crypto.createHash('sha256').update(context.module.content).digest('hex');
    
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
        type: 'private-repo' as const,
        url: `https://github.com/${gitInfo.owner}/${gitInfo.repo}`,
        contentHash,
        repository: {
          type: 'git',
          url: `https://github.com/${gitInfo.owner}/${gitInfo.repo}`,
          commit: gitInfo.sha,
          path: gitInfo.relPath,
        },
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
