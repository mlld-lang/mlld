/**
 * Refactored PublishCommand - Main orchestrator for module publishing
 */

import { GitHubAuthService } from '@core/registry/auth/GitHubAuthService';
import { MlldError, ErrorSeverity } from '@core/errors';
import { PublishOptions, PublishContext, ModuleData, GitInfo, PublishResult } from './types/PublishingTypes';
import { PublishingStrategy } from './types/PublishingStrategy';
import { ModuleReader } from './utils/ModuleReader';
import { ModuleValidator } from './validation/ModuleValidator';
import { InteractivePrompter } from './interaction/InteractivePrompter';
import { GistPublishingStrategy } from './strategies/GistPublishingStrategy';
import { RepoPublishingStrategy } from './strategies/RepoPublishingStrategy';
import { PrivateRepoStrategy } from './strategies/PrivateRepoStrategy';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import chalk from 'chalk';

export class PublishCommand {
  private authService: GitHubAuthService;
  private moduleReader: ModuleReader;
  private validator: ModuleValidator;
  private prompter: InteractivePrompter;
  private strategies: PublishingStrategy[];

  constructor() {
    this.authService = new GitHubAuthService();
    this.moduleReader = new ModuleReader(this.authService);
    this.validator = new ModuleValidator();
    this.prompter = new InteractivePrompter();
    
    // Register publishing strategies
    this.strategies = [
      new RepoPublishingStrategy(),
      new GistPublishingStrategy(),
      new PrivateRepoStrategy()
    ];
  }

  /**
   * Main publish entry point
   */
  async publish(modulePath: string, options: PublishOptions = {}): Promise<void> {
    try {
      // 1. Resolve publish target from @author/module syntax
      const target = await this.resolvePublishTarget(modulePath);
      if (target) {
        modulePath = target.filePath;
        // Apply target-specific options
      }

      // 2. Read and parse the module
      const moduleData = await this.readModule(modulePath);
      
      // 3. Detect git information
      const gitInfo = await this.detectGitInfo(modulePath);
      
      // 4. Get user authentication
      const octokit = await this.authService.getOctokit();
      const user = await this.authService.getGitHubUser();
      
      // 5. Build publishing context
      const context = await this.buildContext(moduleData, gitInfo, options, user, octokit);
      
      // 6. Validate the module
      const validationResult = await this.validator.validate(moduleData, {
        user,
        octokit,
        dryRun: options.dryRun
      });
      
      if (!validationResult.valid) {
        console.log(chalk.red('\n✘ Module validation failed:'));
        validationResult.errors.forEach(error => {
          console.log(chalk.red(`   ${error}`));
        });
        throw new MlldError('Module validation failed', {
          code: 'VALIDATION_FAILED',
          severity: ErrorSeverity.Fatal
        });
      }
      
      // Update context with validation results
      context.validationResult = validationResult;
      
      // 7. Handle interactive decisions
      const finalContext = await this.prompter.collectDecisions(context);
      
      // 8. Apply metadata changes if needed
      if (finalContext.shouldCommitMetadata) {
        await this.commitMetadataChanges(finalContext);
      }
      
      // 9. Select and execute publishing strategy
      const strategy = this.selectStrategy(finalContext);
      const result = await strategy.execute(finalContext);
      
      // 10. Submit to registry if we have a registry entry
      if (result.registryEntry && !options.dryRun) {
        await this.submitToRegistry(result.registryEntry, user, octokit);
      }
      
      console.log(chalk.green(`\n✔ ${result.message}`));
      
    } catch (error) {
      if (error instanceof MlldError) {
        throw error;
      }
      throw new MlldError(`Publishing failed: ${error.message}`, {
        code: 'PUBLISH_FAILED',
        severity: ErrorSeverity.Fatal
      });
    }
  }

  private async resolvePublishTarget(moduleRef: string): Promise<any | null> {
    // Check if it's @author/module format
    const match = moduleRef.match(/^@([a-z0-9-]+)\/([a-z0-9-]+)$/);
    if (!match) {
      return null;
    }

    const [, author, moduleName] = match;
    
    // TODO: Implement registry resolution logic
    // This would look up the module in resolver configuration
    // For now, return null to indicate no special handling needed
    return null;
  }

  private async readModule(modulePath: string): Promise<ModuleData> {
    const { content, metadata, filename, filePath } = await this.moduleReader.readModule(modulePath);
    
    return {
      metadata,
      content,
      filePath,
      gitInfo: { isGitRepo: false } // Will be populated by detectGitInfo
    };
  }

  private async detectGitInfo(filePath: string): Promise<GitInfo> {
    try {
      // Check if we're in a git repository
      const gitRoot = execSync('git rev-parse --show-toplevel', { 
        cwd: path.dirname(filePath), 
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();
      
      const isGitRepo = true;
      
      // Get current SHA
      const sha = execSync('git rev-parse HEAD', { 
        cwd: gitRoot, 
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();
      
      // Get current branch
      const branch = execSync('git branch --show-current', { 
        cwd: gitRoot, 
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();
      
      // Get remote URL
      let remoteUrl = '';
      try {
        remoteUrl = execSync('git remote get-url origin', { 
          cwd: gitRoot, 
          encoding: 'utf8',
          stdio: 'pipe'
        }).trim();
      } catch {
        // No remote configured
      }
      
      // Parse GitHub owner/repo from remote URL
      let owner = '';
      let repo = '';
      if (remoteUrl.includes('github.com')) {
        const match = remoteUrl.match(/github\.com[/:]([\w-]+)\/([\w-]+)/);
        if (match) {
          owner = match[1];
          repo = match[2].replace(/\.git$/, '');
        }
      }
      
      // Get relative path from git root
      const relPath = path.relative(gitRoot, filePath);
      
      // Check if working tree is clean
      let isClean = true;
      try {
        execSync('git diff-index --quiet HEAD --', { cwd: gitRoot, stdio: 'pipe' });
      } catch {
        isClean = false;
      }
      
      // Check write access (simplified - would need more sophisticated check)
      let hasWriteAccess = false;
      try {
        execSync('git push --dry-run', { cwd: gitRoot, stdio: 'pipe' });
        hasWriteAccess = true;
      } catch {
        // No write access or other issue
      }
      
      return {
        isGitRepo,
        owner,
        repo,
        sha,
        branch,
        relPath,
        isClean,
        remoteUrl,
        gitRoot,
        hasWriteAccess
      };
      
    } catch (error) {
      // Not in a git repository
      return {
        isGitRepo: false
      };
    }
  }

  private async buildContext(
    moduleData: ModuleData,
    gitInfo: GitInfo,
    options: PublishOptions,
    user: any,
    octokit: any
  ): Promise<PublishContext> {
    // Update moduleData with gitInfo
    moduleData.gitInfo = gitInfo;
    
    return {
      module: moduleData,
      options,
      user,
      octokit,
      changes: [],
      checkpoints: [],
      rollback: async () => {
        // TODO: Implement rollback logic
      },
      checkpoint: (name: string) => {
        // TODO: Implement checkpoint logic
      },
      restoreCheckpoint: async (name: string) => {
        // TODO: Implement restore checkpoint logic
      },
      toErrorContext: () => {
        return {
          module: moduleData.metadata.name,
          author: moduleData.metadata.author,
          filePath: moduleData.filePath
        };
      }
    };
  }

  private selectStrategy(context: PublishContext): PublishingStrategy {
    for (const strategy of this.strategies) {
      if (strategy.canHandle(context)) {
        return strategy;
      }
    }
    
    // Default fallback to gist
    return this.strategies.find(s => s.name === 'gist') || this.strategies[0];
  }

  private async commitMetadataChanges(context: PublishContext): Promise<void> {
    if (!context.validationResult?.updatedContent) {
      return;
    }
    
    // Write updated content back to file
    await fs.writeFile(context.module.filePath, context.validationResult.updatedContent, 'utf8');
    
    // Commit the changes
    try {
      const gitRoot = context.module.gitInfo.gitRoot;
      if (gitRoot) {
        execSync(`git add "${context.module.filePath}"`, { cwd: gitRoot });
        execSync(`git commit -m "Auto-update module metadata for publishing"`, { cwd: gitRoot });
        console.log(chalk.green('✔ Committed metadata changes'));
      }
    } catch (error) {
      console.log(chalk.yellow('Warning: Could not auto-commit metadata changes'));
    }
  }

  private async submitToRegistry(registryEntry: any, user: any, octokit: any): Promise<void> {
    // TODO: Implement registry submission logic
    // This would involve:
    // 1. Fork the registry repository
    // 2. Update modules.json
    // 3. Create a pull request
    console.log(chalk.blue('Registry submission would happen here'));
    console.log(chalk.gray(`Registry entry: ${JSON.stringify(registryEntry, null, 2)}`));
  }
}