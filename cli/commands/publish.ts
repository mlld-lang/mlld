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
import { MlldError } from '@core/errors';
import * as yaml from 'js-yaml';

export interface PublishOptions {
  verbose?: boolean;
  dryRun?: boolean;
  force?: boolean;
  message?: string;
  useGist?: boolean; // Force gist creation even if in git repo
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

      // Get authenticated Octokit instance
      const octokit = await this.authService.getOctokit();
      const user = await this.authService.getGitHubUser();
      
      if (!user) {
        throw new MlldError('Failed to get GitHub user information');
      }

      // Read and validate module
      const resolvedPath = path.resolve(modulePath);
      const { content, metadata, filename, filePath } = await this.readModule(resolvedPath);
      
      // Validate author matches
      if (metadata.author && metadata.author !== user.login) {
        throw new MlldError(
          `Frontmatter author '${metadata.author}' doesn't match GitHub user '${user.login}'\n` +
          `Please update the author field or authenticate as '${metadata.author}'.`
        );
      }

      // Detect git information
      const gitInfo = await this.detectGitInfo(filePath);
      
      // Check for clean working tree if in git repo
      if (gitInfo.isGitRepo && !gitInfo.isClean && !options.force) {
        throw new MlldError(
          `Uncommitted changes in ${filename}\n` +
          'Please commit your changes before publishing or use --force to override.'
        );
      }

      console.log(chalk.bold('Module Information:'));
      console.log(`  Name: @${metadata.author}/${metadata.name}`);
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
        // Git-native publishing
        console.log(`  Repository: ${chalk.cyan(`github.com/${gitInfo.owner}/${gitInfo.repo}`)}`);
        console.log(`  Commit: ${chalk.gray(gitInfo.sha?.substring(0, 8))}`);
        
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
      } else {
        // Gist-based publishing (fallback)
        console.log(chalk.yellow('\n📝 Creating GitHub gist (no git repo detected or --use-gist specified)'));
        
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
      console.log(`  2. Once merged, install with: ${chalk.cyan(`mlld install @${user.login}/${metadata.name}`)}`);
      console.log(`  3. Module source: ${chalk.cyan(sourceUrl)}`);
      
    } catch (error) {
      if (options.verbose) {
        console.error(error);
      }
      throw new MlldError(`Publication failed: ${error.message}`);
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
        throw new MlldError('No .mld files found in the specified directory');
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
        throw new MlldError('Module file must have .mld extension');
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
    
    return { content, metadata, filename, filePath };
  }

  /**
   * Check if content has frontmatter
   */
  private hasFrontmatter(content: string): boolean {
    return content.startsWith('---\n');
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
    
    // Extract name from filename if not in frontmatter
    const baseName = path.basename(filename, '.mld');
    metadata.name = baseName === 'main' || baseName === 'index' ? '' : baseName;
    
    // Parse frontmatter if exists
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      try {
        const parsed = yaml.load(frontmatterMatch[1]) as any;
        
        metadata.name = parsed.name || parsed.module || metadata.name;
        metadata.description = parsed.description || metadata.description;
        metadata.author = parsed.author || metadata.author;
        metadata.version = parsed.version;
        metadata.keywords = parsed.keywords;
        metadata.license = parsed.license;
        metadata.repository = parsed.repository;
        metadata.mlldVersion = parsed.mlldVersion || parsed.mlld_version;
      } catch (e) {
        // Invalid YAML, continue with defaults
      }
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
          throw new MlldError('Invalid module name. Must be lowercase alphanumeric with hyphens.');
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
        throw new MlldError('Frontmatter setup cancelled');
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
        useGist: flags['use-gist'] || flags.gist,
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