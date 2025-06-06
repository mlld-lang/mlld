/**
 * Module Publishing CLI Command
 * Publishes mlld modules to the registry via GitHub gists and pull requests
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { GitHubAuthService } from '@core/registry/auth/GitHubAuthService';
import { OutputFormatter } from '../utils/output';
import chalk from 'chalk';
import { Octokit } from '@octokit/rest';
import { MlldError } from '@core/errors';

export interface PublishOptions {
  verbose?: boolean;
  dryRun?: boolean;
  force?: boolean;
  message?: string;
}

export interface ModuleMetadata {
  name: string;
  description: string;
  version?: string;
  keywords?: string[];
  mlldVersion?: string;
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
      const { content, metadata, filename } = await this.readModule(resolvedPath);
      
      console.log(chalk.bold('Module Information:'));
      console.log(`  Name: @${user.login}/${metadata.name}`);
      console.log(`  Description: ${metadata.description}`);
      console.log(`  Version: ${metadata.version || '1.0.0'}`);
      
      if (metadata.keywords && metadata.keywords.length > 0) {
        console.log(`  Keywords: ${metadata.keywords.join(', ')}`);
      }
      
      // Calculate content hash
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      console.log(`  Hash: ${chalk.gray(hash.substring(0, 16) + '...')}`);
      
      if (options.dryRun) {
        console.log(chalk.cyan('\n✅ Dry run completed - no changes made'));
        return;
      }

      // Create gist
      console.log(chalk.blue('\n📝 Creating GitHub gist...'));
      
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
      
      // Get the raw URL for the specific file
      const rawUrl = gist.data.files[filename]!.raw_url!;
      
      // Prepare registry entry
      const registryEntry = {
        name: metadata.name,
        description: metadata.description,
        author: {
          name: user.name || user.login,
          github: user.login,
        },
        source: {
          type: 'gist' as const,
          url: rawUrl,
          gistId: gist.data.id,
          hash: hash,
        },
        publishedAt: new Date().toISOString(),
        mlldVersion: metadata.mlldVersion || '>=0.5.0',
        keywords: metadata.keywords || [],
        version: metadata.version || '1.0.0',
      };
      
      // Create pull request to registry
      console.log(chalk.blue('\n🔀 Creating pull request to registry...'));
      const prUrl = await this.createRegistryPR(octokit, user, registryEntry, options);
      
      console.log(chalk.green('\n✅ Module published successfully!\n'));
      console.log(chalk.bold('Next steps:'));
      console.log(`  1. Your pull request: ${chalk.cyan(prUrl)}`);
      console.log(`  2. Once merged, install with: ${chalk.cyan(`mlld install @${user.login}/${metadata.name}`)}`);
      console.log(`  3. Module source: ${chalk.cyan(gist.data.html_url)}`);
      
    } catch (error) {
      if (options.verbose) {
        console.error(error);
      }
      throw new MlldError(`Publication failed: ${error.message}`);
    }
  }

  /**
   * Read module file and parse metadata
   */
  private async readModule(modulePath: string): Promise<{ content: string; metadata: ModuleMetadata; filename: string }> {
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
    const content = await fs.readFile(filePath, 'utf8');
    
    // Parse metadata from content
    const metadata = this.parseMetadata(content, filename);
    
    // Add frontmatter if missing
    const contentWithFrontmatter = await this.ensureFrontmatter(content, metadata);
    
    return { content: contentWithFrontmatter, metadata, filename };
  }

  /**
   * Parse module metadata from content
   */
  private parseMetadata(content: string, filename: string): ModuleMetadata {
    const metadata: ModuleMetadata = {
      name: '',
      description: '',
    };
    
    // Extract name from filename if not in frontmatter
    const baseName = path.basename(filename, '.mld');
    metadata.name = baseName === 'main' || baseName === 'index' ? '' : baseName;
    
    // Parse frontmatter if exists
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      const lines = frontmatter.split('\n');
      
      for (const line of lines) {
        const match = line.match(/^(\w+):\s*(.+)$/);
        if (match) {
          const [, key, value] = match;
          const cleanValue = value.trim().replace(/^["']|["']$/g, '');
          
          switch (key.toLowerCase()) {
            case 'module':
            case 'name':
              metadata.name = cleanValue;
              break;
            case 'description':
              metadata.description = cleanValue;
              break;
            case 'version':
              metadata.version = cleanValue;
              break;
            case 'keywords':
              metadata.keywords = cleanValue.split(',').map(k => k.trim());
              break;
            case 'mlldversion':
            case 'mlld_version':
              metadata.mlldVersion = cleanValue;
              break;
          }
        }
      }
    }
    
    // Extract description from first heading if not in frontmatter
    if (!metadata.description) {
      const headingMatch = content.match(/^#\s+(.+)$/m);
      if (headingMatch) {
        metadata.description = headingMatch[1].trim();
      }
    }
    
    // Validate required fields
    if (!metadata.name) {
      throw new MlldError('Module name is required. Add "name: module-name" to frontmatter or use a descriptive filename');
    }
    
    if (!metadata.description) {
      throw new MlldError('Module description is required. Add "description: ..." to frontmatter or a # heading');
    }
    
    // Validate module name format
    if (!metadata.name.match(/^[a-z0-9-]+$/)) {
      throw new MlldError(`Invalid module name: ${metadata.name}. Must be lowercase alphanumeric with hyphens`);
    }
    
    return metadata;
  }

  /**
   * Ensure content has proper frontmatter
   */
  private async ensureFrontmatter(content: string, metadata: ModuleMetadata): Promise<string> {
    const user = await this.authService.getGitHubUser();
    
    // Check if frontmatter exists
    if (content.startsWith('---\n')) {
      // Update existing frontmatter
      return content.replace(/^---\n([\s\S]*?)\n---/, (match, fm) => {
        const lines = fm.split('\n');
        const updatedLines: string[] = [];
        const existingKeys = new Set<string>();
        
        // Keep existing lines
        for (const line of lines) {
          const keyMatch = line.match(/^(\w+):/);
          if (keyMatch) {
            existingKeys.add(keyMatch[1].toLowerCase());
          }
          updatedLines.push(line);
        }
        
        // Add missing required fields
        if (!existingKeys.has('author')) {
          updatedLines.push(`author: ${user?.login || 'unknown'}`);
        }
        if (!existingKeys.has('module') && !existingKeys.has('name')) {
          updatedLines.push(`module: @${user?.login || 'unknown'}/${metadata.name}`);
        }
        
        return `---\n${updatedLines.join('\n')}\n---`;
      });
    } else {
      // Add frontmatter
      const frontmatter = [
        '---',
        `module: @${user?.login || 'unknown'}/${metadata.name}`,
        `author: ${user?.login || 'unknown'}`,
        `description: ${metadata.description}`,
        metadata.version ? `version: ${metadata.version}` : 'version: 1.0.0',
        metadata.keywords ? `keywords: ${metadata.keywords.join(', ')}` : '',
        '---',
        '',
      ].filter(line => line !== '').join('\n');
      
      return frontmatter + content;
    }
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
- **Source**: ${entry.source.url}
- **Hash**: \`${entry.source.hash}\`
- **Keywords**: ${entry.keywords.length > 0 ? entry.keywords.join(', ') : 'none'}

## Validation
This PR will be automatically validated by the registry workflow to ensure:
- ✅ Module name matches author
- ✅ Source URL is accessible
- ✅ Content hash matches
- ✅ Valid mlld syntax

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