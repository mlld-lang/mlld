import chalk from 'chalk';
import { execFileSync } from 'child_process';

const MARKETPLACE_SOURCE = 'mlld-lang/mlld';
const PLUGIN_REF = 'mlld@mlld';

export function findClaude(): string | null {
  try {
    const result = execFileSync('which', ['claude'], { encoding: 'utf8' }).trim();
    return result || null;
  } catch {
    return null;
  }
}

function runClaude(args: string[], verbose?: boolean): { success: boolean; output: string } {
  const claudePath = findClaude();
  if (!claudePath) {
    console.error(chalk.red('Claude Code CLI not found.'));
    console.error(chalk.gray('Install it from: https://claude.ai/download'));
    process.exit(1);
  }

  try {
    const output = execFileSync(claudePath, args, {
      encoding: 'utf8',
      timeout: 30000,
      stdio: verbose ? 'inherit' : 'pipe',
    });
    return { success: true, output: output || '' };
  } catch (error: any) {
    const output = error.stdout?.toString() || error.stderr?.toString() || error.message;
    return { success: false, output };
  }
}

export async function pluginInstall(scope: string, verbose?: boolean): Promise<void> {
  console.log(chalk.blue('Adding mlld marketplace...'));
  const addResult = runClaude(['plugin', 'marketplace', 'add', MARKETPLACE_SOURCE], verbose);
  if (!addResult.success && !addResult.output.includes('already')) {
    console.error(chalk.red('Failed to add marketplace:'));
    console.error(chalk.gray(addResult.output));
    throw new Error('Failed to add marketplace');
  }

  console.log(chalk.blue(`Installing mlld plugin (scope: ${scope})...`));
  const installResult = runClaude(['plugin', 'install', PLUGIN_REF, '--scope', scope], verbose);
  if (!installResult.success && !installResult.output.includes('already installed')) {
    console.error(chalk.red('Failed to install plugin:'));
    console.error(chalk.gray(installResult.output));
    throw new Error('Failed to install plugin');
  }

  console.log(chalk.green('\nmlld plugin installed for Claude Code.'));
  console.log(chalk.gray('Restart Claude Code to activate.'));
}

export async function pluginUninstall(verbose?: boolean): Promise<void> {
  console.log(chalk.blue('Uninstalling mlld plugin...'));
  const result = runClaude(['plugin', 'uninstall', PLUGIN_REF], verbose);
  if (!result.success) {
    console.error(chalk.red('Failed to uninstall plugin:'));
    console.error(chalk.gray(result.output));
    throw new Error('Failed to uninstall plugin');
  }

  console.log(chalk.green('mlld plugin uninstalled.'));
}

export async function pluginStatus(verbose?: boolean): Promise<void> {
  const result = runClaude(['plugin', 'list'], verbose);
  if (!result.success) {
    console.error(chalk.red('Failed to check plugin status:'));
    console.error(chalk.gray(result.output));
    throw new Error('Failed to check plugin status');
  }

  if (result.output.includes('mlld')) {
    console.log(chalk.green('mlld plugin is installed'));
    if (verbose) {
      console.log(chalk.gray(result.output));
    }
  } else {
    console.log(chalk.yellow('mlld plugin is not installed'));
    console.log(chalk.gray('Run: mlld plugin install'));
  }
}

function showUsage(): void {
  console.log(`
${chalk.bold('Usage:')}
  mlld plugin install [--scope user|project]   Install Claude Code plugin
  mlld plugin uninstall                        Remove Claude Code plugin
  mlld plugin status                           Check installation state

${chalk.bold('Options:')}
  --scope <scope>   Installation scope: user or project (default: user)
  --verbose, -v     Show detailed output
  -h, --help        Show this help message

${chalk.bold('Examples:')}
  mlld plugin install                  Install for current user
  mlld plugin install --scope project  Install for current project only
  mlld plugin status                   Check if plugin is installed
  mlld plugin uninstall                Remove the plugin
`);
}

export function createPluginCommand() {
  return {
    name: 'plugin',
    description: 'Manage Claude Code plugin',

    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      if (flags.help || flags.h) {
        showUsage();
        return;
      }

      const subcommand = args[0];
      const verbose = flags.verbose || flags.v;
      const scope = flags.scope || 'user';

      switch (subcommand) {
        case 'install':
        case 'i':
          await pluginInstall(scope, verbose);
          break;
        case 'uninstall':
        case 'remove':
          await pluginUninstall(verbose);
          break;
        case 'status':
          await pluginStatus(verbose);
          break;
        default:
          if (subcommand) {
            console.error(chalk.red(`Unknown subcommand: ${subcommand}`));
          }
          showUsage();
          if (subcommand) process.exit(1);
          break;
      }
    }
  };
}
