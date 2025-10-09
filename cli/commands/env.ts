import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import { ProjectConfig } from '@core/registry/ProjectConfig';
import { logger } from '@core/utils/logger';
import { getCommandContext } from '../utils/command-context';

export interface EnvCommandOptions {
  _: string[]; // Subcommand and arguments
  cwd?: string;
}

export async function envCommand(options: EnvCommandOptions): Promise<void> {
  // Get command context to find project root
  const context = await getCommandContext({ startPath: options.cwd });

  // Get subcommand
  const subcommand = options._[0] || 'list';
  const args = options._.slice(1);

  // Load project configuration
  const projectConfig = new ProjectConfig(context.projectRoot);
  
  switch (subcommand) {
    case 'list':
      await listEnvVars(projectConfig, context.projectRoot);
      break;

    case 'allow':
      if (args.length === 0) {
        console.error(chalk.red('Error: Variable name required'));
        console.error('Usage: mlld env allow <variable_name> [variable_name...]');
        process.exit(1);
      }
      await allowEnvVars(projectConfig, args, context.projectRoot);
      break;

    case 'remove':
      if (args.length === 0) {
        console.error(chalk.red('Error: Variable name required'));
        console.error('Usage: mlld env remove <variable_name> [variable_name...]');
        process.exit(1);
      }
      await removeEnvVars(projectConfig, args, context.projectRoot);
      break;

    case 'clear':
      await clearEnvVars(projectConfig, context.projectRoot);
      break;
      
    default:
      console.error(chalk.red(`Unknown subcommand: ${subcommand}`));
      console.error('Available subcommands: list, allow, remove, clear');
      process.exit(1);
  }
}

async function listEnvVars(projectConfig: ProjectConfig, projectRoot: string): Promise<void> {
  const allowedVars = projectConfig.getAllowedEnvVars();
  
  if (allowedVars.length === 0) {
    console.log(chalk.yellow('No environment variables are allowed in @INPUT'));
    console.log(chalk.gray(`\nTo allow environment variables, use: mlld env allow <variable_name>`));
    return;
  }
  
  console.log(chalk.bold('Allowed environment variables in @INPUT:'));
  console.log();
  
  // Check which variables are currently set
  for (const varName of allowedVars.sort()) {
    const value = process.env[varName];
    if (value !== undefined) {
      console.log(`  ${chalk.green('✓')} ${chalk.cyan(varName)} ${chalk.gray('(currently set)')}`);
    } else {
      console.log(`  ${chalk.gray('○')} ${chalk.cyan(varName)} ${chalk.gray('(not set)')}`);
    }
  }
  
  console.log();
  console.log(chalk.gray(`Total: ${allowedVars.length} variable${allowedVars.length === 1 ? '' : 's'} allowed`));
}

async function allowEnvVars(projectConfig: ProjectConfig, varNames: string[], projectRoot: string): Promise<void> {
  const added: string[] = [];
  const alreadyAllowed: string[] = [];
  
  for (const varName of varNames) {
    const currentVars = projectConfig.getAllowedEnvVars();
    if (currentVars.includes(varName)) {
      alreadyAllowed.push(varName);
    } else {
      await projectConfig.addAllowedEnvVar(varName);
      added.push(varName);
    }
  }
  
  // Report results
  if (added.length > 0) {
    console.log(chalk.green(`✓ Added ${added.length} environment variable${added.length === 1 ? '' : 's'} to allowed list:`));
    for (const varName of added) {
      const isSet = process.env[varName] !== undefined;
      console.log(`  - ${chalk.cyan(varName)}${isSet ? chalk.gray(' (currently set)') : ''}`);
    }
  }
  
  if (alreadyAllowed.length > 0) {
    console.log(chalk.yellow(`\nAlready allowed:`));
    for (const varName of alreadyAllowed) {
      console.log(`  - ${chalk.cyan(varName)}`);
    }
  }
  
  // Show total count
  const totalAllowed = projectConfig.getAllowedEnvVars().length;
  console.log(chalk.gray(`\nTotal allowed variables: ${totalAllowed}`));

  // Create config file if it didn't exist
  const configPath = path.join(projectRoot, 'mlld-config.json');
  if (!fs.existsSync(configPath)) {
    console.log(chalk.gray(`\nCreated: ${path.relative(process.cwd(), configPath)}`));
  }
}

async function removeEnvVars(projectConfig: ProjectConfig, varNames: string[], projectRoot: string): Promise<void> {
  const removed: string[] = [];
  const notFound: string[] = [];
  
  for (const varName of varNames) {
    const currentVars = projectConfig.getAllowedEnvVars();
    if (currentVars.includes(varName)) {
      await projectConfig.removeAllowedEnvVar(varName);
      removed.push(varName);
    } else {
      notFound.push(varName);
    }
  }
  
  // Report results
  if (removed.length > 0) {
    console.log(chalk.green(`✓ Removed ${removed.length} environment variable${removed.length === 1 ? '' : 's'} from allowed list:`));
    for (const varName of removed) {
      console.log(`  - ${chalk.cyan(varName)}`);
    }
  }
  
  if (notFound.length > 0) {
    console.log(chalk.yellow(`\nNot in allowed list:`));
    for (const varName of notFound) {
      console.log(`  - ${chalk.cyan(varName)}`);
    }
  }
  
  // Show remaining count
  const totalAllowed = projectConfig.getAllowedEnvVars().length;
  console.log(chalk.gray(`\nTotal allowed variables: ${totalAllowed}`));
}

async function clearEnvVars(projectConfig: ProjectConfig, projectRoot: string): Promise<void> {
  const currentVars = projectConfig.getAllowedEnvVars();
  
  if (currentVars.length === 0) {
    console.log(chalk.yellow('No environment variables to clear'));
    return;
  }
  
  await projectConfig.clearAllowedEnvVars();
  
  console.log(chalk.green(`✓ Cleared all ${currentVars.length} allowed environment variable${currentVars.length === 1 ? '' : 's'}`));
  console.log(chalk.gray('\nNo environment variables will be available in @INPUT'));
}