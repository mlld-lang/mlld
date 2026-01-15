import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import { spawn } from 'child_process';
import type { ModuleManifest } from '@core/registry/types';
import { MacOSKeychainProvider } from '@core/resolvers/builtin/keychain-macos';

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findEnvModule(name: string): Promise<string | null> {
  const localPath = path.join(process.cwd(), '.mlld/env', name);
  const globalPath = path.join(os.homedir(), '.mlld/env', name);

  if (await exists(path.join(localPath, 'module.yml'))) return localPath;
  if (await exists(path.join(globalPath, 'module.yml'))) return globalPath;
  return null;
}

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

  const isGlobal = args.includes('--global');
  const claudeDir = path.join(os.homedir(), '.claude');
  const targetDir = isGlobal
    ? path.join(os.homedir(), '.mlld/env', name)
    : path.join(process.cwd(), '.mlld/env', name);

  // Check source exists
  if (!await exists(claudeDir)) {
    console.error(chalk.red('Error: Claude config not found at ~/.claude/'));
    console.error(chalk.gray('Make sure Claude Code is installed and configured.'));
    process.exit(1);
  }

  // Check if environment already exists
  if (await exists(path.join(targetDir, 'module.yml'))) {
    console.error(chalk.red(`Error: Environment '${name}' already exists at ${targetDir}`));
    console.error(chalk.gray('Delete the existing environment first or choose a different name.'));
    process.exit(1);
  }

  // Create directories
  await fs.mkdir(path.join(targetDir, '.claude'), { recursive: true });

  // Extract and store token
  const credsPath = path.join(claudeDir, '.credentials.json');
  let tokenStored = false;
  if (await exists(credsPath)) {
    try {
      const credsContent = await fs.readFile(credsPath, 'utf-8');
      const creds = JSON.parse(credsContent);
      const token = creds.oauth_token || creds.token;
      if (token) {
        const keychain = new MacOSKeychainProvider();
        await keychain.set('mlld-env', name, token);
        console.log(chalk.green('✓ Token stored in keychain'));
        tokenStored = true;
      }
    } catch (error) {
      console.error(chalk.yellow('Warning: Could not extract token from credentials'));
    }
  }

  if (!tokenStored) {
    console.log(chalk.yellow('⚠ No token found - you may need to add credentials manually'));
  }

  // Copy config files (NOT credentials)
  const filesToCopy = ['settings.json', 'CLAUDE.md', 'hooks.json'];
  for (const file of filesToCopy) {
    const src = path.join(claudeDir, file);
    if (await exists(src)) {
      await fs.copyFile(src, path.join(targetDir, '.claude', file));
      console.log(chalk.green(`✓ Copied ${file}`));
    }
  }

  // Generate module.yml
  const moduleYml = `name: ${name}
type: environment
about: "Environment captured from ~/.claude"
version: 1.0.0
entry: index.mld
`;
  await fs.writeFile(path.join(targetDir, 'module.yml'), moduleYml);
  console.log(chalk.green('✓ Created module.yml'));

  // Generate index.mld
  const indexMld = `/needs { keychain, cmd: [claude] }
/import { get } from @keychain

/var secret @token = @get("mlld-env", "${name}")

/exe @spawn(prompt) = \\
  CLAUDE_CODE_OAUTH_TOKEN=@token \\
  CLAUDE_CONFIG_DIR=@fm.dir/.claude \\
  claude -p @prompt

/exe @shell() = \\
  CLAUDE_CODE_OAUTH_TOKEN=@token \\
  CLAUDE_CONFIG_DIR=@fm.dir/.claude \\
  claude

/export { @spawn, @shell }
`;
  await fs.writeFile(path.join(targetDir, 'index.mld'), indexMld);
  console.log(chalk.green('✓ Created index.mld'));

  console.log();
  console.log(chalk.bold.green(`✓ Created environment: ${name}`));
  console.log(chalk.gray(`  Location: ${targetDir}`));
  console.log();
  console.log(chalk.gray('Usage:'));
  console.log(chalk.gray(`  mlld env spawn ${name} -- claude -p "Your prompt"`));
  console.log(chalk.gray(`  mlld env shell ${name}`));
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

  const command = args.slice(separatorIndex + 1);

  // Find environment
  const envDir = await findEnvModule(name);
  if (!envDir) {
    console.error(chalk.red(`Error: Environment '${name}' not found`));
    console.error(chalk.gray('Run `mlld env list` to see available environments.'));
    console.error(chalk.gray(`Or create one with: mlld env capture ${name}`));
    process.exit(1);
  }

  // Get token from keychain
  const keychain = new MacOSKeychainProvider();
  const token = await keychain.get('mlld-env', name);
  if (!token) {
    console.error(chalk.red(`Error: No credentials found for '${name}'`));
    console.error(chalk.gray(`Run: mlld env capture ${name}`));
    process.exit(1);
  }

  // Spawn with env vars
  const proc = spawn(command[0], command.slice(1), {
    env: {
      ...process.env,
      CLAUDE_CODE_OAUTH_TOKEN: token,
      CLAUDE_CONFIG_DIR: path.join(envDir, '.claude'),
    },
    stdio: 'inherit'
  });

  proc.on('error', (err) => {
    console.error(chalk.red(`Error spawning command: ${err.message}`));
    process.exit(1);
  });

  proc.on('exit', (code) => {
    process.exit(code || 0);
  });
}

async function shellEnvCommand(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error(chalk.red('Error: Environment name required'));
    console.error('Usage: mlld env shell <name>');
    process.exit(1);
  }

  // Find environment
  const envDir = await findEnvModule(name);
  if (!envDir) {
    console.error(chalk.red(`Error: Environment '${name}' not found`));
    console.error(chalk.gray('Run `mlld env list` to see available environments.'));
    console.error(chalk.gray(`Or create one with: mlld env capture ${name}`));
    process.exit(1);
  }

  // Get token from keychain
  const keychain = new MacOSKeychainProvider();
  const token = await keychain.get('mlld-env', name);
  if (!token) {
    console.error(chalk.red(`Error: No credentials found for '${name}'`));
    console.error(chalk.gray(`Run: mlld env capture ${name}`));
    process.exit(1);
  }

  // Spawn interactive claude session
  const proc = spawn('claude', [], {
    env: {
      ...process.env,
      CLAUDE_CODE_OAUTH_TOKEN: token,
      CLAUDE_CONFIG_DIR: path.join(envDir, '.claude'),
    },
    stdio: 'inherit'
  });

  proc.on('error', (err) => {
    console.error(chalk.red(`Error starting shell: ${err.message}`));
    process.exit(1);
  });

  proc.on('exit', (code) => {
    process.exit(code || 0);
  });
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
