/**
 * Quick project initialization - creates mlld-config.json with sensible defaults
 * For full interactive configuration, use `mlld setup`
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import chalk from 'chalk';
import {
  createDefaultProjectConfig,
  DEFAULT_LOCAL_MODULES_PATH,
  DEFAULT_SCRIPT_DIR
} from '@core/registry/defaultConfig';

export interface InitOptions {
  force?: boolean;
  scriptDir?: string;
  localPath?: string;
}

export async function initCommand(options: InitOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const configPath = path.join(cwd, 'mlld-config.json');
  const lockPath = path.join(cwd, 'mlld-lock.json');

  // Check for existing config
  if (existsSync(configPath) && !options.force) {
    console.log(chalk.yellow('mlld-config.json already exists.'));
    console.log(chalk.gray('Use --force to overwrite, or run `mlld setup` to modify.'));
    return;
  }

  const config = createDefaultProjectConfig({
    projectRoot: cwd,
    scriptDir: options.scriptDir,
    localPath: options.localPath
  });

  // Write config file
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));

  // Create empty lock file if it doesn't exist
  if (!existsSync(lockPath)) {
    await fs.writeFile(lockPath, JSON.stringify({ version: 1, modules: {} }, null, 2));
  }

  // Create directories if they don't exist
  const scriptDir = path.join(cwd, config.scriptDir);
  const modulesDir = path.join(cwd, config.resolvers.prefixes[0].config.basePath);

  if (!existsSync(scriptDir)) {
    await fs.mkdir(scriptDir, { recursive: true });
  }
  if (!existsSync(modulesDir)) {
    await fs.mkdir(modulesDir, { recursive: true });
  }

  console.log(chalk.green('✔ Initialized mlld project'));
  console.log();
  console.log(chalk.gray('Created:'));
  console.log(chalk.gray(`  mlld-config.json`));
  console.log(chalk.gray(`  mlld-lock.json`));
  console.log(chalk.gray(`  ${config.scriptDir}/`));
  console.log(chalk.gray(`  ${config.resolvers.prefixes[0].config.basePath}/`));
  console.log();
  console.log(chalk.gray('Next steps:'));
  console.log(chalk.gray('  mlld setup           Configure GitHub modules, more resolvers'));
  console.log(chalk.gray('  mlld module mymod    Create a new module'));
  console.log(chalk.gray('  mlld run script      Run a script from ' + config.scriptDir));
}

export function createInitCommand() {
  return {
    name: 'init',
    description: 'Initialize mlld project with defaults',

    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      if (flags.help || flags.h) {
        console.log(`
${chalk.bold('Usage:')} mlld init [options]

Initialize a new mlld project with sensible defaults.
Creates mlld-config.json, mlld-lock.json, and default directories.

${chalk.bold('Options:')}
  --force              Overwrite existing configuration
  --script-dir <path>  Script directory (default: ${DEFAULT_SCRIPT_DIR})
  --local-path <path>  Local modules path (default: ${DEFAULT_LOCAL_MODULES_PATH})
  -h, --help           Show this help message

${chalk.bold('Examples:')}
  mlld init                        Quick setup with defaults
  mlld init --force                Reinitialize, overwrite existing
  mlld init --script-dir scripts   Use custom script directory

${chalk.bold('For more configuration options:')}
  mlld setup                       Interactive configuration wizard
  mlld setup --github              Configure GitHub private modules
  mlld setup --add-resolver        Add additional module sources
        `);
        return;
      }

      const options: InitOptions = {
        force: flags.force || flags.f,
        scriptDir: flags['script-dir'],
        localPath: flags['local-path']
      };

      await initCommand(options);
    }
  };
} 
