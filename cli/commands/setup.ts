/**
 * Setup CLI Command
 * Interactive configuration wizard for mlld projects
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline/promises';
import chalk from 'chalk';
import { MlldError, ErrorSeverity } from '@core/errors/index';
import { GitHubAuthService } from '@core/registry/auth/GitHubAuthService';
import { LockFile } from '@core/registry/LockFile';
import { GitHubResolver } from '@core/resolvers/GitHubResolver';
import { LocalResolver } from '@core/resolvers/LocalResolver';
import { existsSync } from 'fs';

export interface SetupOptions {
  interactive?: boolean;
  github?: boolean;
  local?: boolean;
  basic?: boolean;
  force?: boolean;
  check?: boolean;
  addResolver?: boolean;
}

export class SetupCommand {
  private authService: GitHubAuthService;

  constructor() {
    this.authService = new GitHubAuthService();
  }

  async setup(options: SetupOptions = {}): Promise<void> {
    if (options.check) {
      await this.checkConfiguration();
      return;
    }

    if (options.addResolver) {
      await this.addResolver();
      return;
    }

    console.log(chalk.blue('mlld Setup - Project Configuration Wizard\n'));

    const lockFilePath = path.join(process.cwd(), 'mlld.lock.json');
    const lockFile = new LockFile(lockFilePath);

    // Check for existing configuration
    const hasExistingConfig = existsSync(lockFilePath);
    if (hasExistingConfig && !options.force) {
      const shouldUpdate = await this.promptYesNo(
        'mlld.lock.json already exists. Update resolver configuration?',
        true
      );
      if (!shouldUpdate) {
        console.log(chalk.gray('Setup cancelled.'));
        return;
      }
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      let setupType: string;

      if (options.github) {
        setupType = 'github';
      } else if (options.local) {
        setupType = 'local';
      } else if (options.basic) {
        setupType = 'basic';
      } else {
        // Interactive selection
        console.log('What do you need?');
        console.log('  1. Private GitHub modules');
        console.log('  2. Path aliases for local modules');
        console.log('  3. BOTH GitHub and path aliases');
        console.log('  4. Just a basic mlld.lock.json');
        console.log('');

        const choice = await rl.question('Choose an option [1-4]: ');
        switch (choice) {
          case '1':
            setupType = 'github';
            break;
          case '2':
            setupType = 'local';
            break;
          case '3':
            setupType = 'both';
            break;
          case '4':
          default:
            setupType = 'basic';
            break;
        }
      }

      // Initialize resolver registries array
      let resolverRegistries: Array<{
        prefix: string;
        resolver: string;
        type: 'input' | 'output' | 'io';
        priority: number;
        config: any;
      }> = [];

      // Get existing registries if updating
      if (hasExistingConfig) {
        resolverRegistries = [...lockFile.getResolverPrefixes()];
      }

      // Configure GitHub resolver
      if (setupType === 'github' || setupType === 'both') {
        const githubConfig = await this.setupGitHubResolver(rl);
        if (githubConfig) {
          // Remove existing GitHub resolvers and add new one
          resolverRegistries = resolverRegistries.filter(r => r.resolver !== 'GITHUB');
          resolverRegistries.push(githubConfig);
        }
      }

      // Configure local resolver
      if (setupType === 'local' || setupType === 'both') {
        const localConfig = await this.setupLocalResolver(rl);
        if (localConfig) {
          // Remove existing local resolvers and add new one
          resolverRegistries = resolverRegistries.filter(r => r.resolver !== 'LOCAL');
          resolverRegistries.push(localConfig);
        }
      }

      // Ask about script directory for all setup types
      const scriptDir = await this.setupScriptDirectory(rl, lockFile);

      // Save configuration
      await this.saveConfiguration(lockFile, resolverRegistries, hasExistingConfig, scriptDir);

      console.log(chalk.green('\n✔ Setup complete!'));
      
      if (setupType !== 'basic') {
        console.log(chalk.gray('\nYou can now import modules like:'));
        
        if (setupType === 'github' || setupType === 'both') {
          const githubResolver = resolverRegistries.find(r => r.resolver === 'GITHUB');
          if (githubResolver) {
            console.log(chalk.gray(`  /import { auth } from ${githubResolver.prefix}auth/login`));
          }
        }
        
        if (setupType === 'local' || setupType === 'both') {
          const localResolver = resolverRegistries.find(r => r.resolver === 'LOCAL');
          if (localResolver) {
            console.log(chalk.gray(`  /import { helper } from ${localResolver.prefix}helper`));
          }
        }
      }

    } finally {
      rl.close();
    }
  }

  private async setupGitHubResolver(rl: readline.Interface): Promise<any | null> {
    console.log(chalk.blue('\nPrivate GitHub Modules'));
    console.log('');

    // Auto-detect repository from git remote if available
    let defaultOwner = '';
    let defaultRepo = '';
    try {
      const { execSync } = await import('child_process');
      const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
      const githubMatch = remoteUrl.match(/github\.com[:/]([^/]+)\/([^.]+)/);
      if (githubMatch) {
        [, defaultOwner, defaultRepo] = githubMatch;
      }
    } catch {
      // Not in git repo or no remote
    }

    // Get repository information
    const ownerPrompt = defaultOwner ? 
      `GitHub account [${defaultOwner}]: ` : 
      'GitHub account: ';
    const owner = (await rl.question(ownerPrompt)) || defaultOwner;
    
    if (!owner) {
      console.log(chalk.yellow('GitHub organization/username is required. Skipping GitHub setup.'));
      return null;
    }

    const repoPrompt = defaultRepo ? 
      `Repository name [${defaultRepo}]: ` : 
      'Repository name: ';
    const repo = (await rl.question(repoPrompt)) || defaultRepo;
    
    if (!repo) {
      console.log(chalk.yellow('Repository name is required. Skipping GitHub setup.'));
      return null;
    }

    const repository = `${owner}/${repo}`;

    // Get branch
    const branch = (await rl.question('Branch [main]: ')) || 'main';

    // Get base path
    const basePath = (await rl.question('Base path [llm/modules]: ')) || 'llm/modules';

    // Get prefix - be smart about suggesting @private/ for individuals
    let defaultPrefix: string;
    
    // Check if the owner is an organization
    let isOrganization = false;
    try {
      const octokit = await this.authService.getOctokit();
      const { data: ownerData } = await octokit.users.getByUsername({ username: owner });
      isOrganization = ownerData.type === 'Organization';
    } catch (error) {
      // If we can't determine, assume it's not an org
      // This could happen if the owner doesn't exist yet or is private
    }
    
    if (isOrganization) {
      defaultPrefix = `@${owner}/`;
      console.log(chalk.gray(`Detected organization account: ${owner}`));
    } else {
      defaultPrefix = '@private/';
      console.log(chalk.gray(`Using @private/ prefix for personal modules (recommended)`));
    }
    
    let prefix = (await rl.question(`Prefix [${defaultPrefix}]: `)) || defaultPrefix;
    
    // Normalize prefix format
    prefix = this.normalizePrefix(prefix);

    // Check authentication and repository access
    console.log(chalk.blue('\nVerifying GitHub access...'));
    
    const isAuthenticated = await this.authService.isAuthenticated();
    if (!isAuthenticated) {
      console.log(chalk.yellow('Not authenticated with GitHub.'));
      const shouldAuth = await this.promptYesNo('Would you like to authenticate now?', true);
      if (shouldAuth) {
        const authResult = await this.authService.authenticate();
        if (!authResult.success) {
          console.log(chalk.red('✘ Authentication failed. Skipping GitHub setup.'));
          return null;
        }
      } else {
        console.log(chalk.yellow('GitHub setup requires authentication. Skipping.'));
        return null;
      }
    }

    const user = await this.authService.getGitHubUser();
    if (user) {
      console.log(chalk.green(`✔ Authenticated as @${user.login}`));
    }

    // Verify repository access
    console.log(chalk.blue('Verifying repository access...'));
    const githubResolver = new GitHubResolver();
    const hasAccess = await githubResolver.checkAccess('', 'read', {
      repository,
      branch,
      basePath
    });

    if (hasAccess) {
      console.log(chalk.green(`✔ Repository access confirmed: ${repository}`));
    } else {
      console.log(chalk.yellow(`Could not verify access to ${repository}`));
      console.log(chalk.gray('This may be normal for private repositories or if the repository doesn\'t exist yet.'));
      const shouldContinue = await this.promptYesNo('Continue with setup?', true);
      if (!shouldContinue) {
        return null;
      }
    }

    return {
      prefix,
      resolver: 'GITHUB',
      type: 'input' as const,
      priority: 10,
      config: {
        repository,
        branch,
        basePath
      }
    };
  }

  private async setupLocalResolver(rl: readline.Interface): Promise<any | null> {
    console.log('');
    console.log('---');
    console.log('');
    console.log(chalk.blue('Path Alias Configuration'));
    console.log('');

    // Get local path - default to llm/modules
    const defaultPath = './llm/modules';
    const localPath = (await rl.question(`Local path [${defaultPath}]: `)) || defaultPath;

    // Get prefix
    const defaultPrefix = '@local/';
    let prefix = (await rl.question(`Prefix [${defaultPrefix}]: `)) || defaultPrefix;
    
    // Normalize prefix format
    prefix = this.normalizePrefix(prefix);

    // Check if path exists and offer to create it
    const absolutePath = path.resolve(localPath);
    const pathExists = existsSync(absolutePath);
    
    if (!pathExists) {
      console.log(chalk.yellow(`Directory ${localPath} does not exist.`));
      const shouldCreate = await this.promptYesNo('Would you like to create it?', true);
      if (shouldCreate) {
        try {
          await fs.mkdir(absolutePath, { recursive: true });
          console.log(chalk.green(`✔ Created directory: ${localPath}`));
          
          // Create a sample module with proper .mlld.md format
          const samplePath = path.join(absolutePath, 'example.mlld.md');
          const sampleContent = `---
name: example
author: local
about: Example module from path alias
version: 1.0.0
needs: []
license: CC0
---

# @local/example

A sample module to demonstrate loading from a path alias.

## tldr

\`\`\`mlld-run
/import { greeting, info } from @local/example

/show [[{{greeting}}]]
/show [[{{info}}]]
\`\`\`

## export

\`\`\`mlld-run
/var @greeting = "Hello from path alias!"
/var @info = "This module was loaded from a path alias"

>> All variables are automatically exported
\`\`\`

## interface

### \`greeting\`

A friendly greeting message.

### \`info\`

Information about this module.
`;
          await fs.writeFile(samplePath, sampleContent);
          console.log(chalk.gray(`Created sample module: ${path.join(localPath, 'example.mlld.md')}`));
        } catch (error) {
          console.log(chalk.red(`✘ Failed to create directory: ${error instanceof Error ? error.message : 'Unknown error'}`));
          return null;
        }
      } else {
        console.log(chalk.yellow('Local setup requires the directory to exist. Skipping.'));
        return null;
      }
    } else {
      console.log(chalk.green(`✔ Directory exists: ${localPath}`));
    }

    return {
      prefix,
      resolver: 'LOCAL',
      type: 'input' as const,
      priority: 20,
      config: {
        basePath: localPath
      }
    };
  }

  private async setupScriptDirectory(rl: readline.Interface, lockFile: LockFile): Promise<string> {
    console.log('');
    console.log('---');
    console.log('');
    console.log(chalk.blue('Script Directory Configuration'));
    console.log('');
    
    // Get current script directory from lock file
    const currentScriptDir = lockFile.getScriptDir() || 'llm/run';
    
    // Get script directory path
    const defaultDir = 'llm/run';
    const scriptDir = (await rl.question(`Script directory [${currentScriptDir}]: `)) || currentScriptDir;
    
    // Check if directory exists and offer to create it
    const absolutePath = path.resolve(scriptDir);
    const pathExists = existsSync(absolutePath);
    
    if (!pathExists) {
      console.log(chalk.yellow(`Directory ${scriptDir} does not exist.`));
      const shouldCreate = await this.promptYesNo('Would you like to create it?', true);
      if (shouldCreate) {
        try {
          await fs.mkdir(absolutePath, { recursive: true });
          console.log(chalk.green(`✔ Created directory: ${scriptDir}`));
          
          // Create a sample script
          const samplePath = path.join(absolutePath, 'hello.mld');
          const sampleContent = `# Hello Script

A simple mlld script example.

/var @greeting = "Hello from mlld script!"
/var @timestamp = [[Script run at: {{TIME}}]]

/show @greeting
/show @timestamp
`;
          await fs.writeFile(samplePath, sampleContent);
          console.log(chalk.gray(`Created sample script: ${path.join(scriptDir, 'hello.mld')}`));
        } catch (error) {
          console.log(chalk.red(`✘ Failed to create directory: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      }
    } else {
      console.log(chalk.green(`✔ Directory exists: ${scriptDir}`));
    }
    
    return scriptDir;
  }

  private async saveConfiguration(
    lockFile: LockFile, 
    resolverRegistries: any[], 
    hasExistingConfig: boolean,
    scriptDir?: string
  ): Promise<void> {
    // Update resolver registries
    await lockFile.setResolverPrefixes(resolverRegistries);
    
    // Save script directory configuration
    if (scriptDir) {
      await lockFile.setScriptDir(scriptDir);
    }

    // If this is a new file, add some basic security configuration
    if (!hasExistingConfig) {
      // Set basic security domains for GitHub operations
      const currentTrustedDomains = lockFile.getTrustedDomains();
      const defaultDomains = [
        'raw.githubusercontent.com',
        'gist.githubusercontent.com',
        'api.github.com'
      ];
      
      // Add default domains if not already present
      const needsUpdate = defaultDomains.some(domain => !currentTrustedDomains.includes(domain));
      if (needsUpdate) {
        const mergedDomains = [...new Set([...currentTrustedDomains, ...defaultDomains])];
        await lockFile.setTrustedDomains(mergedDomains);
      }
    }

    console.log(chalk.green(`\n✔ Configuration saved to mlld.lock.json`));
  }

  private async checkConfiguration(): Promise<void> {
    console.log(chalk.blue('mlld Configuration Check\n'));

    const lockFilePath = path.join(process.cwd(), 'mlld.lock.json');
    
    if (!existsSync(lockFilePath)) {
      console.log(chalk.yellow('✘ No mlld.lock.json found'));
      console.log(chalk.gray('Run "mlld setup" to create configuration'));
      return;
    }

    const lockFile = new LockFile(lockFilePath);
    const resolverRegistries = lockFile.getResolverPrefixes();

    if (resolverRegistries.length === 0) {
      console.log(chalk.yellow('No resolvers configured'));
      console.log(chalk.gray('Run "mlld setup" to add module sources'));
      return;
    }

    console.log(chalk.green('✔ Configuration found'));
    console.log(`\nConfigured resolvers:`);

    for (const registry of resolverRegistries) {
      console.log(`\n  ${chalk.bold(registry.prefix)} (${registry.resolver})`);
      
      if (registry.resolver === 'GITHUB') {
        console.log(`    Repository: ${registry.config.repository}`);
        console.log(`    Branch: ${registry.config.branch || 'main'}`);
        console.log(`    Base Path: ${registry.config.basePath || 'modules'}`);
        
        // Check GitHub authentication
        const isAuthenticated = await this.authService.isAuthenticated();
        if (isAuthenticated) {
          const user = await this.authService.getGitHubUser();
          console.log(chalk.green(`    Authentication: ✔ @${user?.login}`));
        } else {
          console.log(chalk.yellow(`    Authentication: ✘ Not authenticated`));
        }
      } else if (registry.resolver === 'LOCAL') {
        const localPath = registry.config.basePath;
        const pathExists = existsSync(path.resolve(localPath));
        console.log(`    Path: ${localPath}`);
        console.log(`    Exists: ${pathExists ? chalk.green('✔') : chalk.red('✘')}`);
      }
    }

    console.log('');
  }

  private async addResolver(): Promise<void> {
    console.log(chalk.blue('Add New Resolver\n'));

    const lockFilePath = path.join(process.cwd(), 'mlld.lock.json');
    const lockFile = new LockFile(lockFilePath);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      console.log('What type of resolver would you like to add?');
      console.log('  1. GitHub repository');
      console.log('  2. Local directory');
      console.log('');

      const choice = await rl.question('Choose an option [1-2]: ');
      
      let newResolver: any = null;
      
      if (choice === '1') {
        newResolver = await this.setupGitHubResolver(rl);
      } else if (choice === '2') {
        newResolver = await this.setupLocalResolver(rl);
      } else {
        console.log(chalk.yellow('Invalid choice. Cancelled.'));
        return;
      }

      if (newResolver) {
        const existingRegistries = lockFile.getResolverPrefixes();
        
        // Check for duplicate prefixes
        const existingPrefix = existingRegistries.find(r => r.prefix === newResolver.prefix);
        if (existingPrefix) {
          const shouldReplace = await this.promptYesNo(
            `Prefix "${newResolver.prefix}" already exists. Replace it?`,
            false
          );
          if (!shouldReplace) {
            console.log(chalk.gray('Cancelled.'));
            return;
          }
          // Remove existing resolver with same prefix
          const updatedRegistries = existingRegistries.filter(r => r.prefix !== newResolver.prefix);
          updatedRegistries.push(newResolver);
          await lockFile.setResolverPrefixes(updatedRegistries);
        } else {
          // Add new resolver
          existingRegistries.push(newResolver);
          await lockFile.setResolverPrefixes(existingRegistries);
        }

        console.log(chalk.green(`\n✔ Resolver added: ${newResolver.prefix}`));
      }
    } finally {
      rl.close();
    }
  }

  private async promptYesNo(question: string, defaultValue: boolean): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      const defaultText = defaultValue ? 'Y/n' : 'y/N';
      const answer = await rl.question(`${question} (${defaultText}): `);
      
      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        return true;
      } else if (answer.toLowerCase() === 'n' || answer.toLowerCase() === 'no') {
        return false;
      } else {
        return defaultValue;
      }
    } finally {
      rl.close();
    }
  }

  private normalizePrefix(prefix: string): string {
    // Remove any leading/trailing whitespace
    prefix = prefix.trim();
    
    // Ensure it starts with @
    if (!prefix.startsWith('@')) {
      prefix = '@' + prefix;
    }
    
    // Ensure it ends with /
    if (!prefix.endsWith('/')) {
      prefix = prefix + '/';
    }
    
    return prefix;
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

export async function setupCommand(args: string[], options: SetupOptions = {}): Promise<void> {
  const command = new SetupCommand();
  await command.setup(options);
}

/**
 * Create setup command for CLI integration
 */
export function createSetupCommand() {
  return {
    name: 'setup',
    description: 'Configure mlld project with interactive wizard',
    
    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      // Check for help flag first
      if (flags.help || flags.h) {
        console.log(`
Usage: mlld setup [options]

Interactive configuration wizard for mlld projects. Sets up module resolvers,
authentication, script directory, and project configuration.

Options:
  --github              Set up GitHub private modules only
  --local               Set up path alias only
  --basic               Create basic mlld.lock.json only
  --force               Overwrite existing configuration
  --check               Check current configuration status
  --add-resolver        Add a new resolver to existing configuration
  -h, --help            Show this help message

Examples:
  mlld setup                    # Interactive setup wizard
  mlld setup --github           # Set up GitHub modules only
  mlld setup --local            # Set up path alias only
  mlld setup --check            # Check current configuration
  mlld setup --add-resolver     # Add a new module source

The setup wizard will:
1. Check for existing mlld.lock.json
2. Configure GitHub authentication (if needed)
3. Set up module resolvers (GitHub, local, or both)
4. Configure script directory for 'mlld run' command
5. Verify repository access and permissions
6. Create sample configurations and files

For private GitHub modules, you'll need to authenticate first:
  mlld auth login
        `);
        return;
      }
      
      const options: SetupOptions = {
        interactive: !flags.github && !flags.local && !flags.basic,
        github: flags.github,
        local: flags.local,
        basic: flags.basic,
        force: flags.force || flags.f,
        check: flags.check,
        addResolver: flags['add-resolver']
      };
      
      try {
        await setupCommand(args, options);
      } catch (error) {
        if (error instanceof MlldError) {
          console.error(chalk.red(`Error: ${error.message}`));
        } else {
          console.error(chalk.red(`Unexpected error: ${error}`));
        }
        process.exit(1);
      }
    }
  };
}