import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
import { ProjectConfig } from '@core/registry/ProjectConfig';
import { getKeychainProvider } from '@core/resolvers/builtin/KeychainResolver';
import { isValidProjectName } from '@core/utils/project-name';
import { getCommandContext } from '../utils/command-context';
import { OutputFormatter } from '../utils/output';

const SERVICE_PREFIX = 'mlld-env-';

export interface KeychainOptions {
  verbose?: boolean;
}

function getKeychainProviderOrExit() {
  try {
    return getKeychainProvider();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Keychain unavailable';
    console.error(chalk.red(message));
    process.exit(1);
  }
}

function getProjectServiceName(projectRoot: string): string {
  const projectConfig = new ProjectConfig(projectRoot);
  const projectName = projectConfig.getProjectName();
  if (!projectName || !isValidProjectName(projectName)) {
    console.error(chalk.red('Keychain access requires projectname in mlld-config.json. Run mlld init or add projectname: "value" to mlld-config.json.'));
    process.exit(1);
  }
  return `${SERVICE_PREFIX}${projectName}`;
}

async function promptSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    console.error(chalk.red('Error: --value is required when stdin is not a TTY'));
    process.exit(1);
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    });

    const rlAny = rl as readline.Interface & { stdoutMuted?: boolean; _writeToOutput?: (text: string) => void };
    rlAny.stdoutMuted = false;
    rlAny._writeToOutput = function (text: string) {
      if (this.stdoutMuted) {
        if (text.includes('\n')) {
          this.output.write(text);
        }
        return;
      }
      this.output.write(text);
    };

    rl.question(prompt, (answer) => {
      rlAny.stdoutMuted = false;
      rl.close();
      resolve(answer);
    });

    rlAny.stdoutMuted = true;
  });
}

function parseEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    if (line.startsWith('export ')) {
      line = line.slice(7).trim();
    }

    line = line.split('#')[0].trim();
    if (!line) {
      continue;
    }

    const equalIndex = line.indexOf('=');
    if (equalIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalIndex).trim();
    let value = line.slice(equalIndex + 1).trim();
    if (!key) {
      continue;
    }

    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function printKeychainHelp(): void {
  console.log(chalk.bold('mlld keychain - Manage project keychain entries\n'));
  console.log('Commands:');
  console.log('  add <name> [--value <value>]  Add or update a keychain entry');
  console.log('  rm <name>                     Remove a keychain entry');
  console.log('  list                          List entry names');
  console.log('  get <name>                    Print entry value');
  console.log('  import <file.env>             Import entries from .env file');
  console.log('');
  console.log('Examples:');
  console.log('  mlld keychain add ANTHROPIC_API_KEY');
  console.log('  mlld keychain add ANTHROPIC_API_KEY --value sk-...');
  console.log('  mlld keychain list');
  console.log('  mlld keychain get ANTHROPIC_API_KEY');
  console.log('  mlld keychain import .env');
}

async function addEntry(service: string, name: string, value: string): Promise<void> {
  const provider = getKeychainProviderOrExit();
  await provider.set(service, name, value);
  console.log(chalk.green(`Stored ${name} in keychain`));
}

async function removeEntry(service: string, name: string): Promise<void> {
  const provider = getKeychainProviderOrExit();
  await provider.delete(service, name);
  console.log(chalk.green(`Removed ${name} from keychain`));
}

async function listEntries(service: string): Promise<void> {
  const provider = getKeychainProviderOrExit();
  const names = await provider.list(service);

  if (names.length === 0) {
    console.log(chalk.yellow('No keychain entries found'));
    return;
  }

  for (const name of names) {
    console.log(name);
  }
}

async function getEntry(service: string, name: string): Promise<void> {
  const provider = getKeychainProviderOrExit();
  const value = await provider.get(service, name);
  if (value === null) {
    console.error(chalk.red(`Keychain entry not found: ${name}`));
    process.exit(1);
  }
  console.log(value);
}

async function importEntries(service: string, filePath: string): Promise<void> {
  const content = await fs.readFile(filePath, 'utf8');
  const entries = parseEnvContent(content);
  const names = Object.keys(entries);

  if (names.length === 0) {
    console.log(chalk.yellow('No entries found in file'));
    return;
  }

  const provider = getKeychainProviderOrExit();
  for (const name of names) {
    await provider.set(service, name, entries[name]);
  }

  console.log(chalk.green(`Imported ${names.length} entr${names.length === 1 ? 'y' : 'ies'} into keychain`));
}

async function resolveImportPath(inputPath: string, currentDir: string, projectRoot: string): Promise<string> {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  const fromCwd = path.resolve(currentDir, inputPath);
  try {
    await fs.access(fromCwd);
    return fromCwd;
  } catch {
    // Fall through to project root
  }
  const fromRoot = path.resolve(projectRoot, inputPath);
  try {
    await fs.access(fromRoot);
    return fromRoot;
  } catch {
    return fromCwd;
  }
}

export async function keychainCommand(args: string[], _options: KeychainOptions = {}, flags: Record<string, any> = {}): Promise<void> {
  if (flags.help || flags.h) {
    printKeychainHelp();
    return;
  }

  const subcommand = args[0];
  if (!subcommand) {
    printKeychainHelp();
    return;
  }

  const context = await getCommandContext();
  const service = getProjectServiceName(context.projectRoot);

  switch (subcommand) {
    case 'add': {
      const name = args[1];
      if (!name) {
        console.error(chalk.red('Error: Entry name required'));
        console.error('Usage: mlld keychain add <name> [--value <value>]');
        process.exit(1);
      }
      const rawValue = typeof flags.value === 'string' ? flags.value : undefined;
      const value = rawValue ?? await promptSecret('Value: ');
      if (!value) {
        console.error(chalk.red('Error: Value is required'));
        process.exit(1);
      }
      await addEntry(service, name, value);
      return;
    }

    case 'rm':
    case 'remove': {
      const name = args[1];
      if (!name) {
        console.error(chalk.red('Error: Entry name required'));
        console.error('Usage: mlld keychain rm <name>');
        process.exit(1);
      }
      await removeEntry(service, name);
      return;
    }

    case 'list': {
      await listEntries(service);
      return;
    }

    case 'get': {
      const name = args[1];
      if (!name) {
        console.error(chalk.red('Error: Entry name required'));
        console.error('Usage: mlld keychain get <name>');
        process.exit(1);
      }
      await getEntry(service, name);
      return;
    }

    case 'import': {
      const inputPath = args[1];
      if (!inputPath) {
        console.error(chalk.red('Error: .env file path required'));
        console.error('Usage: mlld keychain import <file.env>');
        process.exit(1);
      }
      const resolvedPath = await resolveImportPath(inputPath, context.currentDir, context.projectRoot);
      await importEntries(service, resolvedPath);
      return;
    }

    default:
      console.error(chalk.red(`Unknown subcommand: ${subcommand}`));
      printKeychainHelp();
      process.exit(1);
  }
}

export function createKeychainCommand() {
  return {
    name: 'keychain',
    description: 'Manage project keychain entries',

    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      try {
        await keychainCommand(args, {}, flags);
      } catch (error) {
        console.error(OutputFormatter.formatError(error, { verbose: flags.verbose || flags.v }));
        process.exit(1);
      }
    }
  };
}
