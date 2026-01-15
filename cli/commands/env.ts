import chalk from 'chalk';

export interface EnvCommandOptions {
  _: string[]; // Subcommand and arguments
  cwd?: string;
}

export async function envCommand(options: EnvCommandOptions): Promise<void> {
  const subcommand = options._[0];
  const subArgs = options._.slice(1);

  switch (subcommand) {
    case 'list':
    case 'ls':
      return listEnvCommand(subArgs);

    case 'capture':
      return captureEnvCommand(subArgs);

    case 'spawn':
      return spawnEnvCommand(subArgs);

    case 'shell':
      return shellEnvCommand(subArgs);

    case 'export':
    case 'import':
      console.error(chalk.yellow(`'mlld env ${subcommand}' coming in v1.1`));
      process.exit(1);

    default:
      printEnvHelp();
      process.exit(subcommand ? 1 : 0);
  }
}

async function listEnvCommand(args: string[]): Promise<void> {
  console.error(chalk.yellow('mlld env list: not yet implemented'));
  console.error(chalk.gray('This will list available environment modules from:'));
  console.error(chalk.gray('  - .mlld/env/ (local)'));
  console.error(chalk.gray('  - ~/.mlld/env/ (global)'));
  process.exit(1);
}

async function captureEnvCommand(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error(chalk.red('Error: Environment name required'));
    console.error('Usage: mlld env capture <name>');
    process.exit(1);
  }

  console.error(chalk.yellow('mlld env capture: not yet implemented'));
  console.error(chalk.gray('This will:'));
  console.error(chalk.gray('  1. Extract OAuth token from ~/.claude/.credentials.json'));
  console.error(chalk.gray('  2. Store token in system keychain (service=mlld-env, account=<name>)'));
  console.error(chalk.gray('  3. Copy settings.json, CLAUDE.md, hooks.json (NOT credentials)'));
  console.error(chalk.gray('  4. Create module.yml and index.mld template'));
  process.exit(1);
}

async function spawnEnvCommand(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error(chalk.red('Error: Environment name required'));
    console.error('Usage: mlld env spawn <name> -- <command>');
    process.exit(1);
  }

  // Check for -- separator
  const separatorIndex = args.indexOf('--');
  if (separatorIndex === -1 || separatorIndex === args.length - 1) {
    console.error(chalk.red('Error: Command required after --'));
    console.error('Usage: mlld env spawn <name> -- <command>');
    process.exit(1);
  }

  console.error(chalk.yellow('mlld env spawn: not yet implemented'));
  console.error(chalk.gray('This will:'));
  console.error(chalk.gray('  1. Load environment module'));
  console.error(chalk.gray('  2. Match /wants against policy → set @mx.policy.tier'));
  console.error(chalk.gray('  3. Retrieve token from keychain'));
  console.error(chalk.gray('  4. Call @mcpConfig() → spawn MCP servers'));
  console.error(chalk.gray('  5. Inject env vars and run command'));
  process.exit(1);
}

async function shellEnvCommand(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error(chalk.red('Error: Environment name required'));
    console.error('Usage: mlld env shell <name>');
    process.exit(1);
  }

  console.error(chalk.yellow('mlld env shell: not yet implemented'));
  console.error(chalk.gray("This will call the environment's @shell() export"));
  process.exit(1);
}

function printEnvHelp(): void {
  console.log(`
${chalk.bold('mlld env')} - Manage AI agent environments

${chalk.bold('Usage:')} mlld env <command> [options]

${chalk.bold('Commands:')}
  list              List available environments
  capture <name>    Create environment from ~/.claude config
  spawn <name> -- <command>   Run command with environment
  shell <name>      Start interactive session

${chalk.bold('Examples:')}
  mlld env capture claude-dev
  mlld env list
  mlld env spawn claude-dev -- claude -p "Fix the bug"
  mlld env shell claude-dev

${chalk.gray('Environment modules package credentials, configuration,')}
${chalk.gray('MCP tools, and security policy for AI agents.')}
`.trim());
}
