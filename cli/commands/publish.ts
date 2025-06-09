/**
 * Module Publishing CLI Command v2
 * Combines git-native publishing with gist fallback
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import * as readline from 'readline/promises';
import { GitHubAuthService } from '@core/registry/auth/GitHubAuthService';
import { OutputFormatter } from '../utils/output';
import chalk from 'chalk';
import { Octokit } from '@octokit/rest';
import { MlldError, ErrorSeverity } from '@core/errors';
import * as yaml from 'js-yaml';
import { version as currentMlldVersion } from '@core/version';

export interface PublishOptions {
  verbose?: boolean;
  dryRun?: boolean;
  force?: boolean;
  message?: string;
  useGist?: boolean; // Force gist creation even if in git repo
  useRepo?: boolean; // Force repository publishing (skip interactive prompt)
  org?: string; // Publish on behalf of an organization
}

export interface ModuleMetadata {
  name: string;
  description: string;
  author: string;
  version?: string;
  keywords?: string[];
  license?: string;
  repository?: string;
  mlldVersion?: string;
}

export interface GitInfo {
  isGitRepo: boolean;
  owner?: string;
  repo?: string;
  sha?: string;
  branch?: string;
  relPath?: string;
  isClean?: boolean;
  remoteUrl?: string;
}

export class PublishCommand {
  private authService: GitHubAuthService;

  constructor() {
    this.authService = new GitHubAuthService();
  }

  /**
   * Publish a module from the current directory or specified path
   */
  async publish(modulePath: string = '.', options: PublishOptions = {}): Promise<void> {
    try {
      console.log(chalk.blue('🚀 Publishing mlld module...\n'));

      // Check for conflicting options
      if (options.useGist && options.useRepo) {
        throw new MlldError('Cannot use both --use-gist and --use-repo options', {
          code: 'CONFLICTING_OPTIONS',
          severity: ErrorSeverity.Fatal
        });
      }

      // Get authenticated Octokit instance
      const octokit = await this.authService.getOctokit();
      const user = await this.authService.getGitHubUser();
      
      if (!user) {
        throw new MlldError('Failed to get GitHub user information', {
          code: 'GITHUB_AUTH_ERROR',
          severity: ErrorSeverity.Fatal
        });
      }

      // Read and validate module
      const resolvedPath = path.resolve(modulePath);
      const { content, metadata, filename, filePath } = await this.readModule(resolvedPath);
      
      // Determine the publishing author (user or org)
      let publishingAuthor = user.login;
      
      // Check if publishing on behalf of an organization
      if (options.org) {
        publishingAuthor = options.org;
        
        // Verify user has permission to publish for this org
        const hasOrgPermission = await this.checkOrgPermission(octokit, options.org, user.login);
        if (!hasOrgPermission) {
          throw new MlldError(
            `You don't have permission to publish on behalf of organization '${options.org}'.\n` +
            `Please ensure you're a member of the organization.`,
            {
              code: 'ORG_PERMISSION_ERROR',
              severity: ErrorSeverity.Fatal
            }
          );
        }
        
        console.log(chalk.green(`✅ Verified permission to publish as @${options.org}`));
      } else if (metadata.author && metadata.author !== user.login) {
        // Check if the author field is an org the user belongs to
        const isOrg = await this.checkOrgPermission(octokit, metadata.author, user.login);
        if (isOrg) {
          publishingAuthor = metadata.author;
          console.log(chalk.green(`✅ Publishing as organization @${metadata.author}`));
        } else {
          throw new MlldError(
            `Frontmatter author '${metadata.author}' doesn't match your GitHub user '${user.login}'.\n` +
            `If '${metadata.author}' is an organization, you need to be a member to publish.\n` +
            `Otherwise, update the author field or authenticate as '${metadata.author}'.`,
            {
              code: 'AUTHOR_MISMATCH_ERROR',
              severity: ErrorSeverity.Fatal
            }
          );
        }
      }
      
      // Update metadata author to match publishing author
      metadata.author = publishingAuthor;

      // Validate imports reference only public modules
      console.log(chalk.gray('Validating module imports...'));
      const importValidation = await this.validateImports(content, octokit);
      if (!importValidation.valid) {
        throw new MlldError(
          'Module imports validation failed:\n' +
          importValidation.errors.map(e => `  • ${e}`).join('\n') +
          '\n\nOnly published modules from the registry can be imported.',
          {
            code: 'IMPORT_VALIDATION_ERROR',
            severity: ErrorSeverity.Fatal
          }
        );
      }

      // Detect git information
      const gitInfo = await this.detectGitInfo(filePath);
      
      // Check for clean working tree if in git repo
      if (gitInfo.isGitRepo && !gitInfo.isClean && !options.force) {
        throw new MlldError(
          `Uncommitted changes in ${filename}\n` +
          'Please commit your changes before publishing or use --force to override.',
          {
            code: 'UNCOMMITTED_CHANGES',
            severity: ErrorSeverity.Fatal
          }
        );
      }

      console.log(chalk.bold('Module Information:'));
      console.log(`  Name: @${publishingAuthor}/${metadata.name}`);
      console.log(`  Description: ${metadata.description}`);
      console.log(`  Version: ${metadata.version || '1.0.0'}`);
      
      if (metadata.keywords && metadata.keywords.length > 0) {
        console.log(`  Keywords: ${metadata.keywords.join(', ')}`);
      }
      
      // Calculate content hash
      const contentHash = crypto.createHash('sha256').update(content).digest('hex');
      console.log(`  Content Hash: ${chalk.gray(contentHash.substring(0, 16) + '...')}`);
      
      // Determine publishing method
      let sourceUrl: string;
      let registryEntry: any;
      
      if (gitInfo.isGitRepo && !options.useGist && gitInfo.remoteUrl?.includes('github.com')) {
        // Check if repository is public
        console.log(`  Repository: ${chalk.cyan(`github.com/${gitInfo.owner}/${gitInfo.repo}`)}`);
        console.log(`  Commit: ${chalk.gray(gitInfo.sha?.substring(0, 8))}`);
        
        const isPublicRepo = await this.checkIfRepoIsPublic(octokit, gitInfo.owner!, gitInfo.repo!);
        
        if (!isPublicRepo) {
          console.log(chalk.yellow('\n⚠️  Repository is private. Switching to gist creation...'));
          console.log(chalk.gray('Modules must be publicly accessible. Use --use-gist to force gist creation.'));
          // Fall through to gist creation
        } else {
          // Git-native publishing for public repos
          console.log(chalk.green(`\n✅ Repository is public`));
          
          // Interactive confirmation
          if (!options.dryRun && !options.force && !options.useRepo) {
            const rl = readline.createInterface({
              input: process.stdin,
              output: process.stdout,
            });
            
            console.log(chalk.blue(`\n📦 Publishing @${publishingAuthor}/${metadata.name} from ${gitInfo.owner}/${gitInfo.repo}`));
            console.log(chalk.gray(`   Source: ${gitInfo.relPath} @ ${gitInfo.sha?.substring(0, 8)}`));
            console.log(chalk.gray(`   This will create a pull request to the mlld registry\n`));
            
            console.log('Options:');
            console.log('  [Enter] Confirm and publish from repository');
            console.log('  [g]     Publish as gist instead');
            console.log('  [c]     Cancel');
            
            const choice = await rl.question('\nYour choice: ');
            rl.close();
            
            if (choice.toLowerCase() === 'c') {
              throw new MlldError('Publication cancelled by user', {
                code: 'USER_CANCELLED',
                severity: ErrorSeverity.Info
              });
            } else if (choice.toLowerCase() === 'g') {
              console.log(chalk.yellow('\n📝 Switching to gist creation...'));
              // Fall through to gist creation
            } else {
              // Continue with git repo publishing
              sourceUrl = `https://raw.githubusercontent.com/${gitInfo.owner}/${gitInfo.repo}/${gitInfo.sha}/${gitInfo.relPath}`;
              
              registryEntry = {
                name: metadata.name,
                description: metadata.description,
                author: {
                  name: user.name || user.login,
                  github: user.login,
                },
                source: {
                  type: 'github' as const,
                  url: sourceUrl,
                  contentHash: contentHash,
                  repository: {
                    type: 'git',
                    url: `https://github.com/${gitInfo.owner}/${gitInfo.repo}`,
                    commit: gitInfo.sha,
                    path: gitInfo.relPath,
                  },
                },
                publishedAt: new Date().toISOString(),
                mlldVersion: metadata.mlldVersion || currentMlldVersion,
                keywords: metadata.keywords || [],
                version: metadata.version || '1.0.0',
                license: metadata.license,
              };
              
              console.log(chalk.green(`\n✅ Using git repository for source`));
            }
          } else {
            // Skip confirmation with --use-gist or --force
            sourceUrl = `https://raw.githubusercontent.com/${gitInfo.owner}/${gitInfo.repo}/${gitInfo.sha}/${gitInfo.relPath}`;
            
            registryEntry = {
              name: metadata.name,
              description: metadata.description,
              author: {
                name: user.name || user.login,
                github: user.login,
              },
              source: {
                type: 'github' as const,
                url: sourceUrl,
                contentHash: contentHash,
                repository: {
                  type: 'git',
                  url: `https://github.com/${gitInfo.owner}/${gitInfo.repo}`,
                  commit: gitInfo.sha,
                  path: gitInfo.relPath,
                },
              },
              publishedAt: new Date().toISOString(),
              mlldVersion: metadata.mlldVersion || '>=0.5.0',
              keywords: metadata.keywords || [],
              version: metadata.version || '1.0.0',
              license: metadata.license,
            };
            
            console.log(chalk.green(`\n✅ Using git repository for source`));
          }
        }
      }
      
      if (!registryEntry) {
        // Gist-based publishing (fallback)
        
        // Check if we're trying to publish as an organization
        if (publishingAuthor !== user.login) {
          throw new MlldError(
            `Cannot create gists on behalf of organization '${publishingAuthor}'.\n` +
            `GitHub organizations cannot create gists. Please use one of these alternatives:\n` +
            `  1. Publish from a public git repository\n` +
            `  2. Remove the --org flag or org author to publish under your personal account\n` +
            `  3. Create the module in a public repository owned by ${publishingAuthor}`,
            {
              code: 'ORG_GIST_ERROR',
              severity: ErrorSeverity.Fatal
            }
          );
        }
        
        console.log(chalk.yellow('\n📝 Preparing to create GitHub gist...'));
        
        // Interactive confirmation for gist creation
        if (!options.dryRun && !options.force) {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          
          const sourceInfo = gitInfo.isGitRepo ? 
            `${path.basename(filePath)} (not in git repo)` : 
            path.basename(filePath);
          
          console.log(chalk.blue(`\n📤 Publishing @${publishingAuthor}/${metadata.name} as a GitHub gist`));
          console.log(chalk.gray(`   Source: ${sourceInfo}`));
          console.log(chalk.gray(`   This will create a new gist and pull request to the mlld registry\n`));
          
          console.log('Options:');
          console.log('  [Enter] Confirm and create gist');
          console.log('  [c]     Cancel');
          
          const choice = await rl.question('\nYour choice: ');
          rl.close();
          
          if (choice.toLowerCase() === 'c') {
            throw new MlldError('Publication cancelled by user', {
              code: 'USER_CANCELLED',
              severity: ErrorSeverity.Info
            });
          }
        }
        
        if (options.dryRun) {
          console.log(chalk.cyan('\n✅ Dry run completed - no changes made'));
          return;
        }
        
        const gist = await octokit.gists.create({
          description: `${metadata.name} - ${metadata.description}`,
          public: true,
          files: {
            [filename]: {
              content: content,
            },
          },
        });
        
        console.log(chalk.green(`✅ Gist created: ${gist.data.html_url}`));
        sourceUrl = gist.data.files[filename]!.raw_url!;
        
        registryEntry = {
          name: metadata.name,
          description: metadata.description,
          author: {
            name: user.name || user.login,
            github: user.login,
          },
          source: {
            type: 'gist' as const,
            url: sourceUrl,
            gistId: gist.data.id,
            contentHash: contentHash,
          },
          publishedAt: new Date().toISOString(),
          mlldVersion: metadata.mlldVersion || '>=0.5.0',
          keywords: metadata.keywords || [],
          version: metadata.version || '1.0.0',
          license: metadata.license,
        };
      }
      
      if (options.dryRun) {
        console.log(chalk.cyan('\n✅ Dry run completed - no changes made'));
        console.log('\nWould create PR with:');
        console.log(JSON.stringify(registryEntry, null, 2));
        return;
      }

      // Create pull request to registry
      console.log(chalk.blue('\n🔀 Creating pull request to registry...'));
      const prUrl = await this.createRegistryPR(octokit, user, registryEntry, options);
      
      console.log(chalk.green('\n✅ Module published successfully!\n'));
      console.log(chalk.bold('Next steps:'));
      console.log(`  1. Your pull request: ${chalk.cyan(prUrl)}`);
      console.log(`  2. Once merged, install with: ${chalk.cyan(`mlld install @${publishingAuthor}/${metadata.name}`)}`);
      console.log(`  3. Module source: ${chalk.cyan(sourceUrl)}`);
      
    } catch (error) {
      if (options.verbose) {
        console.error(error);
      }
      throw new MlldError(`Publication failed: ${error.message}`, {
        code: 'PUBLISH_FAILED',
        severity: ErrorSeverity.Fatal
      });
    }
  }

  /**
   * Check if a GitHub repository is public
   */
  private async checkIfRepoIsPublic(octokit: Octokit, owner: string, repo: string): Promise<boolean> {
    try {
      const { data } = await octokit.repos.get({ owner, repo });
      return !data.private;
    } catch (error: any) {
      // If we get a 404, it might be private or doesn't exist
      if (error.status === 404) {
        return false;
      }
      // For other errors, assume private to be safe
      return false;
    }
  }

  /**
   * Check if user has permission to publish on behalf of an organization
   */
  private async checkOrgPermission(octokit: Octokit, org: string, username: string): Promise<boolean> {
    try {
      // Check if user is a member of the organization
      const { data: membership } = await octokit.orgs.getMembershipForUser({
        org,
        username
      });
      
      // User must be at least a member (admin is even better)
      return membership.state === 'active' && (membership.role === 'admin' || membership.role === 'member');
    } catch (error: any) {
      // 404 means not a member, other errors mean we can't verify
      return false;
    }
  }

  /**
   * Detect git repository information
   */
  private async detectGitInfo(filePath: string): Promise<GitInfo> {
    try {
      // Check if in git repo
      execSync('git rev-parse --git-dir', { cwd: path.dirname(filePath), stdio: 'ignore' });
      
      // Get repository root
      const gitRoot = execSync('git rev-parse --show-toplevel', { 
        cwd: path.dirname(filePath),
        encoding: 'utf8' 
      }).trim();
      
      // Get current commit SHA
      const sha = execSync('git rev-parse HEAD', { 
        cwd: gitRoot,
        encoding: 'utf8' 
      }).trim();
      
      // Get current branch
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { 
        cwd: gitRoot,
        encoding: 'utf8' 
      }).trim();
      
      // Get remote URL
      const remoteUrl = execSync('git remote get-url origin', { 
        cwd: gitRoot,
        encoding: 'utf8' 
      }).trim();
      
      // Parse GitHub owner/repo from remote URL
      let owner = '';
      let repo = '';
      const githubMatch = remoteUrl.match(/github\.com[:/]([^/]+)\/([^.]+)/);
      if (githubMatch) {
        owner = githubMatch[1];
        repo = githubMatch[2];
      }
      
      // Get relative path from git root
      const relPath = path.relative(gitRoot, filePath).replace(/\\/g, '/');
      
      // Check if working tree is clean
      let isClean = true;
      try {
        execSync('git diff-index --quiet HEAD --', { cwd: gitRoot });
      } catch {
        isClean = false;
      }
      
      return {
        isGitRepo: true,
        owner,
        repo,
        sha,
        branch,
        relPath,
        isClean,
        remoteUrl,
      };
      
    } catch {
      // Not a git repo or git not available
      return { isGitRepo: false };
    }
  }

  /**
   * Read module file and parse metadata
   */
  private async readModule(modulePath: string): Promise<{ 
    content: string; 
    metadata: ModuleMetadata; 
    filename: string; 
    filePath: string;
  }> {
    // Check if path is a directory or file
    const stat = await fs.stat(modulePath);
    let filePath: string;
    let filename: string;
    
    if (stat.isDirectory()) {
      // Look for .mld files in directory
      const files = await fs.readdir(modulePath);
      const mldFiles = files.filter(f => f.endsWith('.mld'));
      
      if (mldFiles.length === 0) {
        throw new MlldError('No .mld files found in the specified directory', {
          code: 'NO_MLD_FILES',
          severity: ErrorSeverity.Fatal
        });
      }
      
      // Prefer main.mld or index.mld
      if (mldFiles.includes('main.mld')) {
        filename = 'main.mld';
      } else if (mldFiles.includes('index.mld')) {
        filename = 'index.mld';
      } else {
        filename = mldFiles[0];
      }
      
      filePath = path.join(modulePath, filename);
    } else {
      // Direct file path
      filePath = modulePath;
      filename = path.basename(filePath);
      
      if (!filename.endsWith('.mld')) {
        throw new MlldError('Module file must have .mld extension', {
          code: 'INVALID_FILE_EXTENSION',
          severity: ErrorSeverity.Fatal
        });
      }
    }
    
    // Read file content
    let content = await fs.readFile(filePath, 'utf8');
    
    // Parse metadata from content
    let metadata = this.parseMetadata(content, filename);
    
    // Interactive frontmatter setup if missing
    if (!this.hasFrontmatter(content)) {
      const user = await this.authService.getGitHubUser();
      metadata = await this.interactiveFrontmatterSetup(metadata, user!.login);
      content = this.addFrontmatter(content, metadata);
      
      // Write back to file
      console.log(chalk.blue('\nAdding frontmatter to your file...'));
      await fs.writeFile(filePath, content, 'utf8');
      console.log(chalk.green('✅ Frontmatter added to ' + filename));
    }
    
    // Ensure author is set
    if (!metadata.author) {
      const user = await this.authService.getGitHubUser();
      metadata.author = user!.login;
    }
    
    // Add mlld-version if missing
    if (!metadata.mlldVersion) {
      metadata.mlldVersion = currentMlldVersion;
      console.log(chalk.blue(`\n📌 Adding mlld-version: ${currentMlldVersion}`));
      
      // Update the frontmatter in the file
      content = this.updateFrontmatter(content, metadata);
      await fs.writeFile(filePath, content, 'utf8');
      console.log(chalk.green('✅ Updated frontmatter with mlld-version'));
    }
    
    return { content, metadata, filename, filePath };
  }

  /**
   * Check if content has frontmatter
   */
  private hasFrontmatter(content: string): boolean {
    return content.startsWith('---\n');
  }

  /**
   * Validate module imports to ensure they reference public modules
   */
  private async validateImports(content: string, _octokit: Octokit): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    // Find all @import directives that reference modules (start with @)
    const importRegex = /@import\s+\{[^}]+\}\s+from\s+(@[a-z0-9-]+\/[a-z0-9-]+)(?:@[a-f0-9]+)?/g;
    const matches = content.matchAll(importRegex);
    
    for (const match of matches) {
      const moduleRef = match[1]; // e.g. @author/module
      const [, author, moduleName] = moduleRef.match(/^@([a-z0-9-]+)\/([a-z0-9-]+)$/) || [];
      
      if (!author || !moduleName) {
        errors.push(`Invalid module reference format: ${moduleRef}`);
        continue;
      }
      
      try {
        // Check if the module exists in the registry
        const registryUrl = `https://raw.githubusercontent.com/mlld-lang/registry/main/modules.json`;
        const response = await fetch(registryUrl);
        
        if (!response.ok) {
          errors.push(`Could not access registry to validate module ${moduleRef}`);
          continue;
        }
        
        const registry = await response.json() as Record<string, any>;
        const fullModuleName = `@${author}/${moduleName}`;
        
        if (!(fullModuleName in registry)) {
          errors.push(`Module ${moduleRef} not found in public registry. Only published modules can be imported.`);
        }
      } catch (error) {
        errors.push(`Failed to validate module ${moduleRef}: ${error.message}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Parse module metadata from content
   */
  private parseMetadata(content: string, filename: string): ModuleMetadata {
    const metadata: ModuleMetadata = {
      name: '',
      description: '',
      author: '',
    };
    
    // Module name comes from frontmatter 'name' field, NOT from filename
    // The filename is only used as a fallback if no frontmatter name exists
    const baseName = path.basename(filename, '.mld');
    
    // Parse frontmatter if exists
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      try {
        const parsed = yaml.load(frontmatterMatch[1]) as any;
        
        // Frontmatter 'name' field takes precedence
        metadata.name = parsed.name || parsed.module || '';
        metadata.description = parsed.description || metadata.description;
        metadata.author = parsed.author || metadata.author;
        metadata.version = parsed.version;
        metadata.keywords = parsed.keywords;
        metadata.license = parsed.license;
        metadata.repository = parsed.repository;
        metadata.mlldVersion = parsed.mlldVersion || parsed['mlld-version'] || parsed.mlld_version;
      } catch (e) {
        // Invalid YAML, continue with defaults
      }
    }
    
    // Only use filename as fallback if no frontmatter name
    if (!metadata.name && baseName !== 'main' && baseName !== 'index') {
      metadata.name = baseName;
    }
    
    // Extract description from first heading if not in frontmatter
    if (!metadata.description) {
      const headingMatch = content.match(/^#\s+(.+)$/m);
      if (headingMatch) {
        metadata.description = headingMatch[1].trim();
      }
    }
    
    return metadata;
  }

  /**
   * Interactive frontmatter setup
   */
  private async interactiveFrontmatterSetup(
    metadata: ModuleMetadata,
    githubUser: string
  ): Promise<ModuleMetadata> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(chalk.yellow('\nNo frontmatter found. Let\'s add it!\n'));

    try {
      // Module name
      if (!metadata.name) {
        metadata.name = await rl.question('Module name (lowercase, hyphens allowed): ');
        if (!metadata.name.match(/^[a-z0-9-]+$/)) {
          throw new MlldError('Invalid module name. Must be lowercase alphanumeric with hyphens.', {
            code: 'INVALID_MODULE_NAME',
            severity: ErrorSeverity.Fatal
          });
        }
      }

      // Description
      if (!metadata.description) {
        metadata.description = await rl.question('Description: ');
      }

      // Author (confirm GitHub user)
      const authorPrompt = `Author [${githubUser}]: `;
      const authorInput = await rl.question(authorPrompt);
      metadata.author = authorInput || githubUser;

      // Optional fields
      const addOptional = await rl.question('\nAdd optional fields? (y/n): ');
      if (addOptional.toLowerCase() === 'y') {
        metadata.version = await rl.question('Version [1.0.0]: ') || '1.0.0';
        metadata.license = await rl.question('License [MIT]: ') || 'MIT';
        
        const keywordsInput = await rl.question('Keywords (comma-separated): ');
        if (keywordsInput) {
          metadata.keywords = keywordsInput.split(',').map(k => k.trim());
        }
      }

      console.log(chalk.blue('\nI\'ll add this frontmatter to your file:\n'));
      console.log(chalk.gray(this.formatFrontmatter(metadata)));
      
      const confirm = await rl.question('\nAdd to file? (y/n): ');
      if (confirm.toLowerCase() !== 'y') {
        throw new MlldError('Frontmatter setup cancelled', {
          code: 'USER_CANCELLED',
          severity: ErrorSeverity.Info
        });
      }

      return metadata;
    } finally {
      rl.close();
    }
  }

  /**
   * Format frontmatter for display
   */
  private formatFrontmatter(metadata: ModuleMetadata): string {
    const lines = [
      '---',
      `name: ${metadata.name}`,
      `description: ${metadata.description}`,
      `author: ${metadata.author}`,
    ];

    if (metadata.version) lines.push(`version: ${metadata.version}`);
    if (metadata.mlldVersion) lines.push(`mlld-version: ${metadata.mlldVersion}`);
    if (metadata.license) lines.push(`license: ${metadata.license}`);
    if (metadata.keywords) lines.push(`keywords: [${metadata.keywords.join(', ')}]`);
    
    lines.push('---');
    return lines.join('\n');
  }

  /**
   * Add frontmatter to content
   */
  private addFrontmatter(content: string, metadata: ModuleMetadata): string {
    return this.formatFrontmatter(metadata) + '\n\n' + content;
  }
  
  /**
   * Update existing frontmatter in content
   */
  private updateFrontmatter(content: string, metadata: ModuleMetadata): string {
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    
    if (!frontmatterMatch) {
      // No frontmatter, add it
      return this.addFrontmatter(content, metadata);
    }
    
    // Replace existing frontmatter
    const afterFrontmatter = content.substring(frontmatterMatch[0].length);
    return this.formatFrontmatter(metadata) + afterFrontmatter;
  }

  /**
   * Create pull request to registry repository
   */
  private async createRegistryPR(
    octokit: Octokit,
    user: any,
    entry: any,
    options: PublishOptions
  ): Promise<string> {
    const registryOwner = 'mlld-lang';
    const registryRepo = 'registry';
    
    // Check if fork exists
    let fork;
    try {
      const { data } = await octokit.repos.get({
        owner: user.login,
        repo: registryRepo,
      });
      fork = data;
    } catch (error) {
      // Fork doesn't exist, create it
      console.log(chalk.gray('Creating fork of registry repository...'));
      const { data } = await octokit.repos.createFork({
        owner: registryOwner,
        repo: registryRepo,
      });
      fork = data;
      
      // Wait a moment for fork to be ready
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Get current modules.json from fork
    let currentModules: any = {};
    let modulesFile: any;
    
    try {
      const { data } = await octokit.repos.getContent({
        owner: user.login,
        repo: registryRepo,
        path: 'modules.json',
      });
      
      if ('content' in data) {
        modulesFile = data;
        currentModules = JSON.parse(Buffer.from(data.content, 'base64').toString());
      }
    } catch (error) {
      // modules.json doesn't exist, that's okay
      console.log(chalk.gray('Creating new modules.json...'));
    }
    
    // Add or update module entry
    const moduleId = `@${user.login}/${entry.name}`;
    const isUpdate = moduleId in currentModules;
    
    currentModules[moduleId] = entry;
    
    // Create branch for PR
    const branchName = `add-${entry.name}-${Date.now()}`;
    
    // Get default branch ref
    const { data: ref } = await octokit.git.getRef({
      owner: user.login,
      repo: registryRepo,
      ref: 'heads/main',
    });
    
    // Create new branch
    await octokit.git.createRef({
      owner: user.login,
      repo: registryRepo,
      ref: `refs/heads/${branchName}`,
      sha: ref.object.sha,
    });
    
    // Update modules.json
    const updatedContent = JSON.stringify(currentModules, null, 2) + '\n';
    
    await octokit.repos.createOrUpdateFileContents({
      owner: user.login,
      repo: registryRepo,
      path: 'modules.json',
      message: options.message || `${isUpdate ? 'Update' : 'Add'} ${moduleId}`,
      content: Buffer.from(updatedContent).toString('base64'),
      sha: modulesFile?.sha,
      branch: branchName,
    });
    
    // Create pull request
    const { data: pr } = await octokit.pulls.create({
      owner: registryOwner,
      repo: registryRepo,
      title: `${isUpdate ? 'Update' : 'Add'} ${moduleId}`,
      head: `${user.login}:${branchName}`,
      base: 'main',
      body: `${isUpdate ? 'Updating' : 'Adding new'} module: **${moduleId}**

## Module Information
- **Description**: ${entry.description}
- **Version**: ${entry.version}
- **Source Type**: ${entry.source.type}
- **Source URL**: ${entry.source.url}
- **Content Hash**: \`${entry.source.contentHash}\`
${entry.source.repository ? `- **Repository**: ${entry.source.repository.url}` : ''}
${entry.source.repository ? `- **Commit**: \`${entry.source.repository.commit}\`` : ''}
${entry.source.repository ? `- **Path**: \`${entry.source.repository.path}\`` : ''}
- **Keywords**: ${entry.keywords.length > 0 ? entry.keywords.join(', ') : 'none'}
- **License**: ${entry.license || 'Not specified'}

## Validation
This PR will be automatically validated by the registry workflow to ensure:
- ✅ Module name matches author
- ✅ Source URL is accessible
- ✅ Content hash matches
- ✅ Valid mlld syntax
${entry.source.repository ? '- ✅ Git commit exists and is immutable' : ''}

${options.message ? `\n## Notes\n${options.message}` : ''}`,
    });
    
    return pr.html_url;
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

export async function publishCommand(args: string[], options: PublishOptions = {}): Promise<void> {
  const modulePath = args[0] || '.';
  const publisher = new PublishCommand();
  await publisher.publish(modulePath, options);
}

/**
 * Create publish command for CLI integration
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