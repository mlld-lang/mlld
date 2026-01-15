import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import type { ModuleManifest } from '@core/registry/types';

interface EnvInfo {
  name: string;
  about?: string;
  version?: string;
  path: string;
}

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
  const isJson = args.includes('--json');

  const localPath = path.join(process.cwd(), '.mlld/env');
  const globalPath = path.join(os.homedir(), '.mlld/env');

  const localEnvs = await scanEnvDir(localPath);
  const globalEnvs = await scanEnvDir(globalPath);

  if (isJson) {
    console.log(JSON.stringify({
      local: localEnvs.map(e => ({ name: e.name, about: e.about, version: e.version, path: e.path })),
      global: globalEnvs.map(e => ({ name: e.name, about: e.about, version: e.version, path: e.path }))
    }, null, 2));
    return;
  }

  console.log(chalk.bold('Available environments:\n'));

  if (localEnvs.length > 0) {
    console.log(chalk.cyan(`Local (${localPath}):`));
    for (const env of localEnvs) {
      const about = env.about ? chalk.gray(` - ${env.about}`) : '';
      console.log(`  ${env.name.padEnd(20)} ${env.version || ''}${about}`);
    }
    console.log();
  }

  if (globalEnvs.length > 0) {
    console.log(chalk.cyan(`Global (${globalPath}):`));
    for (const env of globalEnvs) {
      const about = env.about ? chalk.gray(` - ${env.about}`) : '';
      console.log(`  ${env.name.padEnd(20)} ${env.version || ''}${about}`);
    }
    console.log();
  }

  const total = localEnvs.length + globalEnvs.length;
  if (total === 0) {
    console.log(chalk.gray('No environment modules found.'));
    console.log(chalk.gray('Use `mlld env capture <name>` to create one from ~/.claude config.'));
  } else {
    console.log(chalk.gray(`(${total} environment${total !== 1 ? 's' : ''} total)`));
  }
}

async function scanEnvDir(dirPath: string): Promise<EnvInfo[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const envs: EnvInfo[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const envPath = path.join(dirPath, entry.name);
      const manifestPath = path.join(envPath, 'module.yml');

      try {
        const manifestContent = await fs.readFile(manifestPath, 'utf-8');
        const manifest = yaml.load(manifestContent) as Partial<ModuleManifest>;

        if (manifest && manifest.type === 'environment') {
          envs.push({
            name: manifest.name || entry.name,
            about: manifest.about,
            version: manifest.version,
            path: envPath
          });
        }
      } catch {
        // Skip invalid modules
      }
    }

    return envs.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
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
