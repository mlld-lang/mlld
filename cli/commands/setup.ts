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

    console.log(chalk.blue('🚀 mlld Setup - Project Configuration Wizard\n'));

    const lockFilePath = path.join(process.cwd(), 'mlld.lock.json');
    const lockFile = new LockFile(lockFilePath);

    // Check for existing configuration
    const hasExistingConfig = existsSync(lockFilePath);
    if (hasExistingConfig && !options.force) {
      const shouldUpdate = await this.promptYesNo(
        'mlld.lock.json already exists. Update existing configuration?',
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
        console.log('What would you like to set up?');
        console.log('  1. Private GitHub modules');
        console.log('  2. Local module directories');
        console.log('  3. Both GitHub and local modules');
        console.log('  4. Just create basic mlld.lock.json');
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
        resolverRegistries = [...lockFile.getResolverRegistries()];
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

      // Save configuration
      await this.saveConfiguration(lockFile, resolverRegistries, hasExistingConfig);

      console.log(chalk.green('\n✅ Setup complete!'));
      
      if (setupType !== 'basic') {
        console.log(chalk.gray('\nYou can now import modules like:'));
        
        if (setupType === 'github' || setupType === 'both') {
          const githubResolver = resolverRegistries.find(r => r.resolver === 'GITHUB');
          if (githubResolver) {
            console.log(chalk.gray(`  @import { auth } from ${githubResolver.prefix}auth/login`));
          }
        }
        
        if (setupType === 'local' || setupType === 'both') {
          const localResolver = resolverRegistries.find(r => r.resolver === 'LOCAL');
          if (localResolver) {
            console.log(chalk.gray(`  @import { helper } from ${localResolver.prefix}helper`));
          }
        }
      }

    } finally {
      rl.close();
    }
  }

  private async setupGitHubResolver(rl: readline.Interface): Promise<any | null> {
    console.log(chalk.blue('\n📁 GitHub Module Configuration'));
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
        console.log(chalk.gray(`Auto-detected repository: ${defaultOwner}/${defaultRepo}`));
      }
    } catch {
      // Not in git repo or no remote
    }

    // Get repository information
    const ownerPrompt = defaultOwner ? 
      `GitHub organization or username [${defaultOwner}]: ` : 
      'GitHub organization or username: ';
    const owner = (await rl.question(ownerPrompt)) || defaultOwner;
    
    if (!owner) {
      console.log(chalk.yellow('GitHub organization/username is required. Skipping GitHub setup.'));
      return null;
    }

    const repoPrompt = defaultRepo ? 
      `Repository name [${defaultRepo}]: ` : 
      'Repository name for your private modules: ';
    const repo = (await rl.question(repoPrompt)) || defaultRepo;
    
    if (!repo) {
      console.log(chalk.yellow('Repository name is required. Skipping GitHub setup.'));
      return null;
    }

    const repository = `${owner}/${repo}`;

    // Get branch
    const branch = (await rl.question('Branch to use [main]: ')) || 'main';

    // Get base path
    const basePath = (await rl.question('Base path within repository [modules]: ')) || 'modules';

    // Get prefix
    const defaultPrefix = `@${owner}/`;
    const prefix = (await rl.question(`Module prefix [${defaultPrefix}]: `)) || defaultPrefix;

    // Check authentication and repository access
    console.log(chalk.blue('\n🔐 Verifying GitHub access...'));
    
    const isAuthenticated = await this.authService.isAuthenticated();
    if (!isAuthenticated) {
      console.log(chalk.yellow('⚠️  Not authenticated with GitHub.'));
      const shouldAuth = await this.promptYesNo('Would you like to authenticate now?', true);
      if (shouldAuth) {
        const authResult = await this.authService.authenticate();
        if (!authResult.success) {
          console.log(chalk.red('❌ Authentication failed. Skipping GitHub setup.'));
          return null;
        }
      } else {
        console.log(chalk.yellow('⚠️  GitHub setup requires authentication. Skipping.'));
        return null;
      }
    }

    const user = await this.authService.getGitHubUser();
    if (user) {
      console.log(chalk.green(`✅ Authenticated as @${user.login}`));
    }

    // Verify repository access
    console.log(chalk.blue('🔍 Verifying repository access...'));
    const githubResolver = new GitHubResolver();
    const hasAccess = await githubResolver.checkAccess('', 'read', {
      repository,
      branch,
      basePath
    });

    if (hasAccess) {
      console.log(chalk.green(`✅ Repository access confirmed: ${repository}`));
    } else {
      console.log(chalk.yellow(`⚠️  Could not verify access to ${repository}`));
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
    console.log(chalk.blue('\n📁 Local Module Configuration'));
    console.log('');

    // Get local path
    const defaultPath = './src/mlld-modules';
    const localPath = (await rl.question(`Path to your local modules [${defaultPath}]: `)) || defaultPath;

    // Get prefix
    const defaultPrefix = '@local/';
    const prefix = (await rl.question(`Module prefix [${defaultPrefix}]: `)) || defaultPrefix;

    // Check if path exists and offer to create it
    const absolutePath = path.resolve(localPath);
    const pathExists = existsSync(absolutePath);
    
    if (!pathExists) {
      console.log(chalk.yellow(`⚠️  Directory ${localPath} does not exist.`));
      const shouldCreate = await this.promptYesNo('Would you like to create it?', true);
      if (shouldCreate) {
        try {
          await fs.mkdir(absolutePath, { recursive: true });
          console.log(chalk.green(`✅ Created directory: ${localPath}`));
          
          // Create a sample module
          const samplePath = path.join(absolutePath, 'example.mld');
          const sampleContent = `@text greeting = "Hello from local modules!"
@text info = "This is an example local module"`;
          await fs.writeFile(samplePath, sampleContent);
          console.log(chalk.gray(`📝 Created sample module: ${path.join(localPath, 'example.mld')}`));
        } catch (error) {
          console.log(chalk.red(`❌ Failed to create directory: ${error instanceof Error ? error.message : 'Unknown error'}`));
          return null;
        }
      } else {
        console.log(chalk.yellow('⚠️  Local setup requires the directory to exist. Skipping.'));
        return null;
      }
    } else {
      console.log(chalk.green(`✅ Directory exists: ${localPath}`));
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

  private async saveConfiguration(
    lockFile: LockFile, 
    resolverRegistries: any[], 
    hasExistingConfig: boolean
  ): Promise<void> {
    // Update resolver registries
    await lockFile.setResolverRegistries(resolverRegistries);

    // If this is a new file, add some basic configuration
    if (!hasExistingConfig) {
      // Add basic security configuration
      const currentConfig = lockFile.getConfig();
      const newConfig = {
        ...currentConfig,
        security: {
          allowedDomains: [
            'raw.githubusercontent.com',
            'gist.githubusercontent.com',
            'api.github.com'
          ],
          ...currentConfig.security
        }
      };
      
      // Update the lock file data manually since there's no setConfig method
      (lockFile as any).data.config = newConfig;
      (lockFile as any).isDirty = true;
      await lockFile.save();
    }

    console.log(chalk.green(`\n✅ Configuration saved to mlld.lock.json`));
  }

  private async checkConfiguration(): Promise<void> {
    console.log(chalk.blue('🔍 mlld Configuration Check\n'));

    const lockFilePath = path.join(process.cwd(), 'mlld.lock.json');
    
    if (!existsSync(lockFilePath)) {
      console.log(chalk.yellow('❌ No mlld.lock.json found'));
      console.log(chalk.gray('Run "mlld setup" to create configuration'));
      return;
    }

    const lockFile = new LockFile(lockFilePath);
    const resolverRegistries = lockFile.getResolverRegistries();

    if (resolverRegistries.length === 0) {
      console.log(chalk.yellow('⚠️  No resolvers configured'));
      console.log(chalk.gray('Run "mlld setup" to add module sources'));
      return;
    }

    console.log(chalk.green('✅ Configuration found'));
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
          console.log(chalk.green(`    Authentication: ✅ @${user?.login}`));
        } else {
          console.log(chalk.yellow(`    Authentication: ❌ Not authenticated`));
        }
      } else if (registry.resolver === 'LOCAL') {
        const localPath = registry.config.basePath;
        const pathExists = existsSync(path.resolve(localPath));
        console.log(`    Path: ${localPath}`);
        console.log(`    Exists: ${pathExists ? chalk.green('✅') : chalk.red('❌')}`);
      }
    }

    console.log('');
  }

  private async addResolver(): Promise<void> {
    console.log(chalk.blue('➕ Add New Resolver\n'));

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
        const existingRegistries = lockFile.getResolverRegistries();
        
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
          await lockFile.setResolverRegistries(updatedRegistries);
        } else {
          // Add new resolver
          existingRegistries.push(newResolver);
          await lockFile.setResolverRegistries(existingRegistries);
        }

        console.log(chalk.green(`\n✅ Resolver added: ${newResolver.prefix}`));
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
authentication, and project configuration.

Options:
  --github              Set up GitHub private modules only
  --local               Set up local module directory only
  --basic               Create basic mlld.lock.json only
  --force               Overwrite existing configuration
  --check               Check current configuration status
  --add-resolver        Add a new resolver to existing configuration
  -h, --help            Show this help message

Examples:
  mlld setup                    # Interactive setup wizard
  mlld setup --github           # Set up GitHub modules only
  mlld setup --local            # Set up local modules only
  mlld setup --check            # Check current configuration
  mlld setup --add-resolver     # Add a new module source

The setup wizard will:
1. Check for existing mlld.lock.json
2. Configure GitHub authentication (if needed)
3. Set up module resolvers (GitHub, local, or both)
4. Verify repository access and permissions
5. Create sample configurations and files

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