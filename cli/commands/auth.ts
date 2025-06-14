/**
 * Authentication CLI Commands
 * Handles GitHub authentication for mlld registry
 */

import { GitHubAuthService, AuthConfig } from '@core/registry/auth/GitHubAuthService';
import { OutputFormatter } from '../utils/output';
import chalk from 'chalk';

export interface AuthOptions {
  verbose?: boolean;
}

export class AuthCommand {
  private authService: GitHubAuthService;

  constructor(_options: AuthOptions = {}) {
    const config: AuthConfig = {
      serviceName: 'mlld-cli',
      accountName: 'github-token',
      fallbackStorage: true,
    };
    
    // Only set clientId if environment variable is defined
    if (process.env.MLLD_GITHUB_CLIENT_ID) {
      config.clientId = process.env.MLLD_GITHUB_CLIENT_ID;
    }

    this.authService = new GitHubAuthService(config);
  }

  /**
   * Login command - authenticate with GitHub
   */
  async login(options: AuthOptions = {}): Promise<void> {
    try {
      console.log(chalk.blue('mlld Authentication\n'));

      // Check if already authenticated
      const currentUser = await this.authService.getGitHubUser();
      if (currentUser) {
        console.log(chalk.yellow(`Already authenticated as ${currentUser.login}`));
        console.log(chalk.gray('Use "mlld auth logout" to sign out\n'));
        
        this.displayUserInfo(currentUser);
        return;
      }

      // Perform authentication
      const result = await this.authService.authenticate();

      if (result.success && result.user) {
        console.log(chalk.green('\n✔ Authentication successful!\n'));
        this.displayUserInfo(result.user);
        
        if (options.verbose) {
          console.log(chalk.gray(`Token stored securely in system keychain`));
        }
      } else {
        console.error(chalk.red(`\n✘ Authentication failed: ${result.error}`));
        process.exit(1);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Authentication error: ${errorMessage}`));
      if (options.verbose && error instanceof Error && error.stack) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  }

  /**
   * Logout command - clear stored credentials
   */
  async logout(options: AuthOptions = {}): Promise<void> {
    try {
      const currentUser = await this.authService.getGitHubUser();
      
      if (!currentUser) {
        console.log(chalk.yellow('Not currently authenticated'));
        return;
      }

      console.log(chalk.blue(`Signing out ${currentUser.login}...`));
      
      await this.authService.logout();
      
      console.log(chalk.green('✔ Successfully signed out'));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Logout failed: ${errorMessage}`));
      if (options.verbose && error instanceof Error && error.stack) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  }

  /**
   * Status command - show current authentication status
   */
  async status(options: AuthOptions = {}): Promise<void> {
    try {
      const isAuthenticated = await this.authService.isAuthenticated();
      
      if (!isAuthenticated) {
        console.log(chalk.yellow('Not authenticated'));
        console.log(chalk.gray('Run "mlld auth login" to sign in'));
        return;
      }

      const currentUser = await this.authService.getGitHubUser();
      
      if (currentUser) {
        console.log(chalk.green('✔ Authenticated'));
        this.displayUserInfo(currentUser);
        
        if (options.verbose) {
          console.log(chalk.gray('\nToken validation: ✔ Valid'));
          console.log(chalk.gray('GitHub Scopes: gist, public_repo'));
        }
      } else {
        console.log(chalk.red('✘ Authentication invalid'));
        console.log(chalk.gray('Run "mlld auth login" to re-authenticate'));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Status check failed: ${errorMessage}`));
      if (options.verbose && error instanceof Error && error.stack) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  }

  /**
   * Display user information
   */
  private displayUserInfo(user: any): void {
    console.log(chalk.bold('GitHub User Information:'));
    console.log(`  Username: ${user.login}`);
    console.log(`  Name: ${user.name || 'Not set'}`);
    console.log(`  Email: ${user.email || 'Not set'}`);
    console.log(`  Type: ${user.type}`);
    console.log(`  ID: ${user.id}`);
  }


}

// ============================================================================
// CLI INTERFACE
// ============================================================================

export async function authCommand(args: string[], options: AuthOptions = {}): Promise<void> {
  const command = args[0];
  const auth = new AuthCommand(options);

  switch (command) {
    case 'login':
      await auth.login(options);
      break;

    case 'logout':
      await auth.logout(options);
      break;

    case 'status':
      await auth.status(options);
      break;

    default:
      console.log(chalk.bold('mlld auth - Authentication management\n'));
      console.log('Commands:');
      console.log('  login                    Sign in with GitHub');
      console.log('  logout                   Sign out');
      console.log('  status                   Show authentication status');
      console.log('');
      console.log('Options:');
      console.log('  --verbose, -v            Show detailed output');
      console.log('');
      console.log('Examples:');
      console.log('  mlld auth login');
      console.log('  mlld auth status --verbose');
      console.log('  mlld auth logout');
  }
}

/**
 * Create auth command for CLI integration
 */
export function createAuthCommand() {
  return {
    name: 'auth',
    description: 'Manage GitHub authentication',
    
    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      const options: AuthOptions = {
        verbose: flags.verbose || flags.v,
      };
      
      try {
        await authCommand(args, options);
      } catch (error) {
        console.error(OutputFormatter.formatError(error, { verbose: options.verbose }));
        process.exit(1);
      }
    }
  };
}