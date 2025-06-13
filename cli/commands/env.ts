import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import { LockFile } from '@core/registry/LockFile';
import { logger } from '@core/utils/logger';

export interface EnvCommandOptions {
  _: string[]; // Subcommand and arguments
  cwd?: string;
}

export async function envCommand(options: EnvCommandOptions): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const lockFilePath = path.join(cwd, 'mlld.lock.json');
  
  // Get subcommand
  const subcommand = options._[0] || 'list';
  const args = options._.slice(1);
  
  // Load or create lock file
  const lockFile = new LockFile(lockFilePath);
  
  switch (subcommand) {
    case 'list':
      await listEnvVars(lockFile, lockFilePath);
      break;
      
    case 'allow':
      if (args.length === 0) {
        console.error(chalk.red('Error: Variable name required'));
        console.error('Usage: mlld env allow <variable_name> [variable_name...]');
        process.exit(1);
      }
      await allowEnvVars(lockFile, args, lockFilePath);
      break;
      
    case 'remove':
      if (args.length === 0) {
        console.error(chalk.red('Error: Variable name required'));
        console.error('Usage: mlld env remove <variable_name> [variable_name...]');
        process.exit(1);
      }
      await removeEnvVars(lockFile, args, lockFilePath);
      break;
      
    case 'clear':
      await clearEnvVars(lockFile, lockFilePath);
      break;
      
    default:
      console.error(chalk.red(`Unknown subcommand: ${subcommand}`));
      console.error('Available subcommands: list, allow, remove, clear');
      process.exit(1);
  }
}

async function listEnvVars(lockFile: LockFile, lockFilePath: string): Promise<void> {
  const allowedVars = lockFile.getAllowedEnvVars();
  
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

async function allowEnvVars(lockFile: LockFile, varNames: string[], lockFilePath: string): Promise<void> {
  const added: string[] = [];
  const alreadyAllowed: string[] = [];
  
  for (const varName of varNames) {
    const currentVars = lockFile.getAllowedEnvVars();
    if (currentVars.includes(varName)) {
      alreadyAllowed.push(varName);
    } else {
      await lockFile.addAllowedEnvVar(varName);
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
  const totalAllowed = lockFile.getAllowedEnvVars().length;
  console.log(chalk.gray(`\nTotal allowed variables: ${totalAllowed}`));
  
  // Create lock file if it didn't exist
  if (!fs.existsSync(lockFilePath)) {
    console.log(chalk.gray(`\nCreated: ${path.relative(process.cwd(), lockFilePath)}`));
  }
}

async function removeEnvVars(lockFile: LockFile, varNames: string[], lockFilePath: string): Promise<void> {
  const removed: string[] = [];
  const notFound: string[] = [];
  
  for (const varName of varNames) {
    const currentVars = lockFile.getAllowedEnvVars();
    if (currentVars.includes(varName)) {
      await lockFile.removeAllowedEnvVar(varName);
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
  const totalAllowed = lockFile.getAllowedEnvVars().length;
  console.log(chalk.gray(`\nTotal allowed variables: ${totalAllowed}`));
}

async function clearEnvVars(lockFile: LockFile, lockFilePath: string): Promise<void> {
  const currentVars = lockFile.getAllowedEnvVars();
  
  if (currentVars.length === 0) {
    console.log(chalk.yellow('No environment variables to clear'));
    return;
  }
  
  await lockFile.clearAllowedEnvVars();
  
  console.log(chalk.green(`✓ Cleared all ${currentVars.length} allowed environment variable${currentVars.length === 1 ? '' : 's'}`));
  console.log(chalk.gray('\nNo environment variables will be available in @INPUT'));
}