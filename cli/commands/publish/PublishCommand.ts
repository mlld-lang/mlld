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
import inquirer from 'inquirer';
import { parseSemVer } from '@core/utils/version-checker';

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
          const prefix = error.field ? `[${error.field}] ` : '';
          console.log(chalk.red(`   ${prefix}${error.message}`));
        });
        throw new MlldError('Module validation failed', {
          code: 'VALIDATION_FAILED',
          severity: ErrorSeverity.Fatal
        });
      }

      if (validationResult.warnings?.length) {
        console.log(chalk.yellow('\n⚠ Module validation warnings:'));
        validationResult.warnings.forEach(warning => {
          const prefix = warning.field ? `[${warning.field}] ` : '';
          console.log(chalk.yellow(`   ${prefix}${warning.message}`));
        });
      }
      
      // Update context with validation results
      context.validationResult = validationResult;
      
      // 7. Check for existing open PR first
      const existingPR = await this.findExistingPR(moduleData, user, octokit);
      if (existingPR && existingPR.state === 'open') {
        const handled = await this.handleExistingPR(existingPR, moduleData, options, user, octokit);
        if (handled) return; // Exit if PR was handled
      }
      
      // 8. Check if module exists in registry
      const registryModule = await this.checkRegistry(
        moduleData.metadata.name,
        user.login,
        octokit
      );
      
      if (registryModule && !options.pr) {
        // Module exists - try direct publish
        const published = await this.tryDirectPublish(moduleData, options, user, octokit);
        if (published) return; // Exit if direct publish succeeded
        // Otherwise fall through to PR creation
      }
      
      // 9. Handle interactive decisions
      const finalContext = await this.prompter.collectDecisions(context);
      
      // 10. Apply metadata changes if needed
      if (finalContext.shouldCommitMetadata) {
        await this.commitMetadataChanges(finalContext);
      }
      
      // 11. Select and execute publishing strategy
      const strategy = this.selectStrategy(finalContext);
      const result = await strategy.execute(finalContext);
      
      // 12. Submit to registry if we have a registry entry
      if (result.registryEntry && !options.dryRun) {
        await this.submitToRegistry(result.registryEntry, user, octokit, registryModule);
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
    const { content, metadata, filePath, ast } = await this.moduleReader.readModule(modulePath);
    
    return {
      metadata,
      content,
      filePath,
      ast,
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

  private async findExistingPR(module: ModuleData, user: any, octokit: any): Promise<any> {
    try {
      const { data: prs } = await octokit.pulls.list({
        owner: 'mlld-lang',
        repo: 'registry',
        state: 'open',
        head: `${user.login}:add-${module.metadata.author}-${module.metadata.name}-`,
        per_page: 10
      });
      
      // Find PRs for this module
      const modulePRs = prs.filter(pr => {
        const titleMatch = pr.title.match(/@([^/]+)\/([^\s]+)/);
        if (!titleMatch) return false;
        return titleMatch[1] === module.metadata.author && 
               titleMatch[2] === module.metadata.name;
      });
      
      // Return most recent
      return modulePRs[0];
    } catch (error) {
      // Error checking PRs, continue with normal flow
      return null;
    }
  }

  private async handleExistingPR(
    pr: any,
    module: ModuleData,
    options: PublishOptions,
    user: any,
    octokit: any
  ): Promise<boolean> {
    console.log(chalk.yellow(`\n🔍 Found open PR #${pr.number} for @${module.metadata.author}/${module.metadata.name}\n`));
    
    // Show last review status if any
    try {
      const { data: reviews } = await octokit.pulls.listReviews({
        owner: 'mlld-lang',
        repo: 'registry',
        pull_number: pr.number
      });
      
      const lastReview = reviews[reviews.length - 1];
      if (lastReview?.state === 'CHANGES_REQUESTED') {
        console.log('Last review requested changes:');
        console.log(chalk.dim(this.truncate(lastReview.body, 200)));
        console.log();
      }
    } catch {
      // Ignore review fetch errors
    }
    
    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: 'Update the existing PR', value: 'update' },
        { name: 'Close PR and create a new one', value: 'new' },
        { name: 'View PR in browser', value: 'view' },
        { name: 'Cancel', value: 'cancel' }
      ]
    }]);
    
    switch (action) {
      case 'update':
        await this.updatePR(pr, module, options, user, octokit);
        return true;
      case 'new':
        console.log('Closing existing PR...');
        await octokit.pulls.update({
          owner: 'mlld-lang',
          repo: 'registry',
          pull_number: pr.number,
          state: 'closed'
        });
        return false; // Continue with normal flow
      case 'view':
        console.log(`\nPR: ${pr.html_url}\n`);
        // Open in browser if possible
        try {
          const open = await import('open');
          await open.default(pr.html_url);
        } catch {
          // Ignore if can't open browser
        }
        return true;
      case 'cancel':
        console.log('Cancelled.');
        return true;
    }
    
    return false;
  }

  private async updatePR(
    pr: any,
    module: ModuleData,
    options: PublishOptions,
    user: any,
    octokit: any
  ): Promise<void> {
    const branch = pr.head.ref;
    
    // Calculate file path
    const filePath = `modules/${module.metadata.author}/${module.metadata.name}.json`;
    
    // Get current file SHA if it exists
    let sha;
    try {
      const { data: file } = await octokit.repos.getContent({
        owner: user.login,
        repo: 'registry',
        path: filePath,
        ref: branch
      });
      if ('sha' in file) sha = file.sha;
    } catch {
      // File doesn't exist yet in branch
    }
    
    // Prepare registry entry
    const registryEntry = await this.prepareRegistryEntry(module);
    
    // Update file in PR branch
    await octokit.repos.createOrUpdateFileContents({
      owner: user.login,
      repo: 'registry',
      path: filePath,
      message: `Update ${module.metadata.name} based on feedback`,
      content: Buffer.from(JSON.stringify(registryEntry, null, 2) + '\n').toString('base64'),
      branch: branch,
      sha
    });
    
    // Add comment to PR
    await octokit.issues.createComment({
      owner: 'mlld-lang',
      repo: 'registry',
      issue_number: pr.number,
      body: '📝 Module updated based on feedback. Please re-review.'
    });
    
    console.log(chalk.green(`\n✓ Updated PR #${pr.number}\n`));
    console.log(`View your PR: ${pr.html_url}`);
  }

  private async checkRegistry(
    moduleName: string,
    author: string,
    octokit: any
  ): Promise<any> {
    try {
      const response = await fetch('https://raw.githubusercontent.com/mlld-lang/registry/main/modules.json');
      if (response.ok) {
        const registry = await response.json();
        return registry.modules[`@${author}/${moduleName}`];
      }
    } catch {
      // Registry fetch failed, assume module doesn't exist
    }
    return null;
  }

  private truncate(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text || '';
    return text.substring(0, maxLength) + '...';
  }

  private async tryDirectPublish(
    moduleData: ModuleData,
    options: PublishOptions,
    user: any,
    octokit: any
  ): Promise<boolean> {
    try {
      // Check if API is available
      const apiUrl = process.env.MLLD_REGISTRY_API_URL || 'https://registry-api.mlld.org';
      
      // Get stored token
      const token = await this.authService.getStoredToken();
      if (!token) {
        console.log(chalk.yellow('\n⚠️  Direct publishing requires authentication'));
        console.log(chalk.yellow('Please run: mlld auth login'));
        console.log(chalk.yellow('\nFalling back to PR submission...\n'));
        return false;
      }
      
      // Check API health
      try {
        const healthResponse = await fetch(`${apiUrl}/api/auth`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!healthResponse.ok) {
          console.log(chalk.yellow('\n⚠️  Registry API authentication failed'));
          console.log(chalk.yellow('Please run: mlld auth login'));
          console.log(chalk.yellow('\nFalling back to PR submission...\n'));
          return false;
        }
      } catch (error) {
        // API not available
        console.log(chalk.yellow('\n⚠️  Registry API is currently unavailable'));
        console.log(chalk.yellow('Falling back to PR submission...\n'));
        return false;
      }
      
      console.log(chalk.blue('\nChecking existing versions...'));
      
      // Get existing versions
      const versionsResponse = await fetch(
        `${apiUrl}/api/resolve?module=@${moduleData.metadata.author}/${moduleData.metadata.name}&version=latest`
      );
      
      let existingVersions: string[] = [];
      if (versionsResponse.ok) {
        const data = await versionsResponse.json();
        // TODO: API should return availableVersions
        existingVersions = [data.version]; // For now, just current version
      }
      
      // Check version conflict
      let finalVersion = moduleData.metadata.version || '1.0.0';
      if (existingVersions.includes(finalVersion)) {
        // Interactive version bump
        finalVersion = await this.promptVersionBump(finalVersion, existingVersions);
        if (!finalVersion) {
          console.log(chalk.yellow('\nVersion conflict - falling back to PR submission...\n'));
          return false;
        }
        
        // Update version in module data
        moduleData.metadata.version = finalVersion;
        
        // Update file if needed
        if (!options.dryRun) {
          await this.updateVersionInFile(moduleData.filePath, finalVersion);
        }
      }
      
      // Execute publishing strategy to get source info
      const strategy = this.selectStrategy({ module: moduleData, options, user, octokit } as any);
      const result = await strategy.execute({ module: moduleData, options, user, octokit } as any);
      
      if (!result.registryEntry) {
        console.log(chalk.yellow('\nCould not prepare module for publishing'));
        return false;
      }
      
      console.log(chalk.blue('\nPublishing directly to registry...'));
      
      // Prepare publish request
      const publishRequest = {
        module: `@${moduleData.metadata.author}/${moduleData.metadata.name}`,
        version: finalVersion,
        source: result.registryEntry.source,
        metadata: {
          about: moduleData.metadata.about,
          needs: moduleData.metadata.needs || [],
          license: moduleData.metadata.license || 'CC0',
          mlldVersion: moduleData.metadata.mlldVersion,
          dependencies: moduleData.metadata.dependencies || {},
          keywords: moduleData.metadata.keywords || [],
          repo: result.registryEntry.repo,
          bugs: result.registryEntry.bugs,
          homepage: result.registryEntry.homepage
        }
      };
      
      if (options.dryRun) {
        console.log(chalk.blue('\n[DRY RUN] Would publish:'));
        console.log(JSON.stringify(publishRequest, null, 2));
        return true;
      }
      
      // Call API
      const response = await fetch(`${apiUrl}/api/publish`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(publishRequest)
      });
      
      if (!response.ok) {
        const error = await response.json();
        
        // Handle specific error cases
        if (response.status === 401) {
          console.log(chalk.red('\nAuthentication failed. Please run: mlld auth login'));
          return false;
        }
        
        if (response.status === 403) {
          console.log(chalk.red(`\nYou don't have permission to publish @${moduleData.metadata.author}/${moduleData.metadata.name}`));
          console.log(chalk.yellow('Only module owners and maintainers can publish updates.'));
          console.log(chalk.yellow('\nFalling back to PR submission...\n'));
          return false;
        }
        
        if (error.error === 'use_pr_flow') {
          // First publish must go through PR
          console.log(chalk.yellow('\nFirst module publish must go through PR review process'));
          console.log(chalk.yellow('Continuing with PR submission...\n'));
          return false;
        }
        
        console.log(chalk.red('\nPublish failed:'), error.message || error.error);
        if (error.details?.instructions) {
          console.log(chalk.yellow(error.details.instructions));
        }
        console.log(chalk.yellow('\nFalling back to PR submission...\n'));
        return false;
      }
      
      const apiResult = await response.json();
      
      console.log(chalk.green('\n✅ Module published successfully!'));
      console.log(`\nModule: ${apiResult.module}`);
      console.log(`Version: ${apiResult.version}`);
      console.log(`\nUsers can import with:`);
      console.log(chalk.cyan(`  @import { ... } from ${apiResult.module}`));
      console.log(chalk.cyan(`  @import { ... } from ${apiResult.module}@${apiResult.version}\n`));
      
      return true;
      
    } catch (error) {
      console.log(chalk.yellow(`\n⚠️  Direct publishing failed: ${error.message}`));
      console.log(chalk.yellow('Falling back to PR submission...\n'));
      return false;
    }
  }

  private async promptVersionBump(
    currentVersion: string,
    existingVersions: string[]
  ): Promise<string | null> {
    const current = parseSemVer(currentVersion);
    
    const choices = [
      {
        name: `Patch (${current.major}.${current.minor}.${current.patch + 1})`,
        value: `${current.major}.${current.minor}.${current.patch + 1}`
      },
      {
        name: `Minor (${current.major}.${current.minor + 1}.0)`,
        value: `${current.major}.${current.minor + 1}.0`
      },
      {
        name: `Major (${current.major + 1}.0.0)`,
        value: `${current.major + 1}.0.0`
      },
      {
        name: 'Custom version',
        value: 'custom'
      },
      {
        name: 'Cancel (use PR instead)',
        value: null
      }
    ];
    
    const { version } = await inquirer.prompt([{
      type: 'list',
      name: 'version',
      message: `Version ${currentVersion} already exists. Choose new version:`,
      choices
    }]);
    
    if (version === 'custom') {
      const { customVersion } = await inquirer.prompt([{
        type: 'input',
        name: 'customVersion',
        message: 'Enter custom version:',
        validate: (v) => {
          try {
            parseSemVer(v);
            return !existingVersions.includes(v) || 'Version already exists';
          } catch {
            return 'Invalid version format';
          }
        }
      }]);
      return customVersion;
    }
    
    return version;
  }

  private async updateVersionInFile(filePath: string, newVersion: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      
      // Update version in frontmatter
      const versionRegex = /^(---[\s\S]*?version:\s*)(["']?)[\d.\w-]+(\2)([\s\S]*?---)/m;
      let updatedContent = content;
      
      if (versionRegex.test(content)) {
        updatedContent = content.replace(
          versionRegex,
          `$1$2${newVersion}$3$4`
        );
      } else {
        // Add version to frontmatter if it doesn't exist
        const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---/;
        updatedContent = content.replace(
          frontmatterRegex,
          (match, frontmatter) => {
            return `---\n${frontmatter}\nversion: "${newVersion}"\n---`;
          }
        );
      }
      
      if (updatedContent !== content) {
        await fs.writeFile(filePath, updatedContent, 'utf8');
        console.log(chalk.green(`✓ Updated version to ${newVersion} in ${path.basename(filePath)}`));
      }
    } catch (error) {
      console.log(chalk.yellow(`Warning: Could not update version in file: ${error.message}`));
    }
  }

  private async prepareRegistryEntry(module: ModuleData): Promise<any> {
    // This would be filled in by the publishing strategy
    // For now, return a basic structure
    return {
      name: module.metadata.name,
      author: module.metadata.author,
      version: module.metadata.version || '1.0.0',
      about: module.metadata.about,
      needs: module.metadata.needs || [],
      license: module.metadata.license || 'CC0',
      mlldVersion: module.metadata.mlldVersion,
      source: {
        // Will be filled by publishing strategy
        type: 'github',
        url: '',
        contentHash: ''
      },
      dependencies: module.metadata.dependencies || {}
    };
  }

  private async submitToRegistry(registryEntry: any, user: any, octokit: any, existingModule?: any): Promise<void> {
    const REGISTRY_OWNER = 'mlld-lang';
    const REGISTRY_REPO = 'registry';
    const BASE_BRANCH = 'main';
    
    try {
      // 1. Check if user has a fork
      let fork;
      try {
        fork = await octokit.repos.get({
          owner: user.login,
          repo: REGISTRY_REPO
        });
      } catch (error) {
        // Fork doesn't exist, create it
        console.log(chalk.blue('Creating fork of registry...'));
        const forkResult = await octokit.repos.createFork({
          owner: REGISTRY_OWNER,
          repo: REGISTRY_REPO
        });
        fork = forkResult.data;
        
        // Wait for fork to be ready
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      // 2. Sync fork with upstream
      try {
        await octokit.repos.mergeUpstream({
          owner: user.login,
          repo: REGISTRY_REPO,
          branch: BASE_BRANCH
        });
      } catch (error) {
        // Sync might fail if fork is already up to date
      }
      
      // 3. Determine if this is a first-time author
      const isFirstTimeAuthor = !existingModule;
      
      // 4. Create file path based on new versioned structure
      const modulePath = `modules/${registryEntry.author}/${registryEntry.name}`;
      const metadataPath = `${modulePath}/metadata.json`;
      const versionPath = `${modulePath}/${registryEntry.version}.json`;
      const tagsPath = `${modulePath}/tags.json`;
      
      // 5. Check if this is an update (old structure)
      let isLegacyUpdate = false;
      if (existingModule && !existingModule.availableVersions) {
        // Module exists in old format
        isLegacyUpdate = true;
      }
      
      // 6. Prepare content for versioned structure
      const timestamp = new Date().toISOString();
      
      // Metadata (only for new modules)
      const metadata = {
        name: registryEntry.name,
        author: registryEntry.author,
        about: registryEntry.about,
        owners: [registryEntry.author],
        maintainers: [],
        created: timestamp,
        createdBy: user.id,
        firstPublishPR: null // Will be set after PR is created
      };
      
      // Version data
      const versionData = {
        version: registryEntry.version,
        needs: registryEntry.needs || [],
        license: registryEntry.license || 'CC0',
        mlldVersion: registryEntry.mlldVersion || '>=1.0.0',
        source: registryEntry.source,
        dependencies: registryEntry.dependencies || {},
        keywords: registryEntry.keywords || [],
        repo: registryEntry.repo,
        bugs: registryEntry.bugs,
        homepage: registryEntry.homepage,
        publishedAt: timestamp,
        publishedBy: user.id
      };
      
      // Tags (only for new modules)
      const tags = {
        latest: registryEntry.version,
        stable: registryEntry.version
      };
      
      // 7. Create branch name
      const action = existingModule ? 'update' : 'add';
      const timestampMs = Date.now();
      const branchName = `${action}-${registryEntry.author}-${registryEntry.name}-${timestampMs}`;
      
      // 7. Create branch
      const mainRef = await octokit.git.getRef({
        owner: user.login,
        repo: REGISTRY_REPO,
        ref: `heads/${BASE_BRANCH}`
      });
      
      await octokit.git.createRef({
        owner: user.login,
        repo: REGISTRY_REPO,
        ref: `refs/heads/${branchName}`,
        sha: mainRef.data.object.sha
      });
      
      // 8. Create files based on structure
      if (isLegacyUpdate) {
        // For legacy modules, just update the single file
        const filePath = `modules/${registryEntry.author}/${registryEntry.name}.json`;
        const fileContent = JSON.stringify({
          ...registryEntry,
          publishedAt: timestamp,
          publishedBy: user.id
        }, null, 2) + '\n';
        
        await octokit.repos.createOrUpdateFileContents({
          owner: user.login,
          repo: REGISTRY_REPO,
          path: filePath,
          message: `Update @${registryEntry.author}/${registryEntry.name} to v${registryEntry.version}`,
          content: Buffer.from(fileContent).toString('base64'),
          branch: branchName
        });
      } else {
        // For new structure, create multiple files
        const files = [];
        
        if (!existingModule) {
          // New module: create all files
          files.push({
            path: metadataPath,
            content: JSON.stringify(metadata, null, 2) + '\n'
          });
          files.push({
            path: tagsPath,
            content: JSON.stringify(tags, null, 2) + '\n'
          });
        }
        
        // Always create version file
        files.push({
          path: versionPath,
          content: JSON.stringify(versionData, null, 2) + '\n'
        });
        
        // Create all files
        for (const file of files) {
          await octokit.repos.createOrUpdateFileContents({
            owner: user.login,
            repo: REGISTRY_REPO,
            path: file.path,
            message: existingModule
              ? `Add version ${registryEntry.version} for @${registryEntry.author}/${registryEntry.name}`
              : `Add @${registryEntry.author}/${registryEntry.name}`,
            content: Buffer.from(file.content).toString('base64'),
            branch: branchName
          });
        }
      }
      
      // 9. Create pull request with welcome message for first-timers
      let prBody = `## Module Submission

**Module**: \`@${registryEntry.author}/${registryEntry.name}\`
**Version**: ${registryEntry.version}
**Author**: @${registryEntry.author}
**Description**: ${registryEntry.about}

### Source
- **Type**: ${registryEntry.source.type}
- **URL**: ${registryEntry.source.url}
- **Hash**: \`${registryEntry.source.contentHash}\`

`;

      if (isFirstTimeAuthor) {
        prBody += `### Welcome to mlld! 🎉

Congrats on your first module submission, @${registryEntry.author}! We're excited to have you in the community.

If you'd like to share:
- What inspired you to build this module?
- How are you using or thinking of using mlld?
- Any feedback on the publishing experience?

Feel free to join our [Discord](https://discord.gg/mlld) to connect with other mlld developers!

`;
      }

      prBody += `### Module Files
`;
      
      if (!existingModule) {
        prBody += `\`\`\`json
// metadata.json
${JSON.stringify(metadata, null, 2)}

// ${registryEntry.version}.json
${JSON.stringify(versionData, null, 2)}

// tags.json
${JSON.stringify(tags, null, 2)}
\`\`\`
`;
      } else {
        prBody += `\`\`\`json
// ${registryEntry.version}.json
${JSON.stringify(versionData, null, 2)}
\`\`\`
`;
      }
      
      prBody += `
### Automated Checks
- [ ] Valid module structure
- [ ] Required fields present
- [ ] Source URL accessible
- [ ] Content hash verified
- [ ] License is CC0

---
*This PR was created by \`mlld publish\`*`;

      const pr = await octokit.pulls.create({
        owner: REGISTRY_OWNER,
        repo: REGISTRY_REPO,
        title: existingModule 
          ? `Update @${registryEntry.author}/${registryEntry.name} to v${registryEntry.version}`
          : `Add @${registryEntry.author}/${registryEntry.name}`,
        body: prBody,
        head: `${user.login}:${branchName}`,
        base: BASE_BRANCH
      });
      
      console.log(chalk.green(`\n✅ Pull request created: ${pr.data.html_url}`));
      
      if (isFirstTimeAuthor) {
        console.log(chalk.blue('\n🎉 Welcome to the mlld community!'));
        console.log(chalk.blue('Your module will be reviewed shortly.'));
        console.log(chalk.blue('Once approved, you\'ll be able to publish updates directly.'));
      } else {
        console.log(chalk.blue('\nYour module update will be reviewed and added to the registry once approved.'));
      }
      
    } catch (error) {
      if (error.response?.data?.message) {
        console.error(chalk.red('GitHub API Error:'), error.response.data.message);
      } else {
        console.error(chalk.red('Failed to submit to registry:'), error.message);
      }
      throw error;
    }
  }
}