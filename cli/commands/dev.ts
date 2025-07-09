import chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { ResolverManager } from '@core/resolvers/ResolverManager';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { findProjectRoot } from '@core/utils/findProjectRoot';
import { LockFile } from '@core/registry/LockFile';

export async function devCommand(args: string[], flags: Record<string, any>) {
  const subcommand = args[0] || 'status';
  
  switch (subcommand) {
    case 'status':
      await showDevStatus();
      break;
    case 'list':
      await listLocalModules();
      break;
    default:
      console.log(chalk.red(`Unknown dev subcommand: ${subcommand}`));
      console.log(`\nAvailable subcommands:`);
      console.log(`  status - Show dev mode status and detected modules`);
      console.log(`  list   - List all local modules with their publish names`);
  }
}

async function showDevStatus() {
  const fileSystem = new NodeFileSystem();
  const projectRoot = await findProjectRoot(process.cwd(), fileSystem);
  
  // Check environment variable
  const envDevMode = process.env.MLLD_DEV === 'true';
  
  // Check lock file mode
  let lockFileMode: string | undefined;
  try {
    const lockFilePath = path.join(projectRoot, 'mlld.lock.json');
    if (existsSync(lockFilePath)) {
      const lockFileContent = await fs.readFile(lockFilePath, 'utf8');
      const lockData = JSON.parse(lockFileContent);
      lockFileMode = lockData.config?.mode;
    }
  } catch (error) {
    // Ignore errors
  }
  
  // Determine effective mode
  const isDevMode = envDevMode || lockFileMode === 'development';
  const currentMode = lockFileMode || 'user';
  
  console.log(`Current mode: ${chalk.bold(currentMode)} ${currentMode === 'development' ? chalk.green('(dev mode enabled)') : ''}`);
  console.log(`Environment override: ${envDevMode ? chalk.green('MLLD_DEV=true') : chalk.gray('none')}`);
  
  // Always scan to show what would be available
  const pathService = new PathService();
  const manager = new ResolverManager();
  manager.setDevMode(true); // Temporarily enable to scan
  
  const localModulePath = path.join(projectRoot, 'llm', 'modules');
  
  try {
    await manager.initializeDevMode(localModulePath);
    const prefixes = manager.getDevPrefixes();
    
    if (prefixes.length > 0) {
      console.log('\nLocal modules detected:');
      for (const [author, modules] of prefixes) {
        for (const module of modules) {
          const modulePath = path.join('llm', 'modules', `${module}.mlld.md`);
          console.log(chalk.cyan(`  @${author}/${module}`) + ' → ' + chalk.gray(modulePath));
        }
      }
    } else {
      console.log(chalk.gray('\nNo local modules found in llm/modules'));
    }
  } catch (error) {
    console.log(chalk.gray('\nCould not scan for local modules'));
  }
  
  console.log('\nEnable dev mode:');
  console.log('  ' + chalk.gray('mlld mode dev              # Set in lock file'));
  console.log('  ' + chalk.gray('mlld run script.mld --dev  # One-time override'));
  console.log('  ' + chalk.gray('export MLLD_DEV=true       # Session override'));
}

async function listLocalModules() {
  const fileSystem = new NodeFileSystem();
  const pathService = new PathService();
  const projectRoot = await findProjectRoot(process.cwd(), fileSystem);
  
  const manager = new ResolverManager();
  manager.setDevMode(true); // Temporarily enable to scan
  
  const localModulePath = path.join(projectRoot, 'llm', 'modules');
  
  try {
    await manager.initializeDevMode(localModulePath);
    const prefixes = manager.getDevPrefixes();
    
    if (prefixes.length > 0) {
      console.log('Local modules:');
      let totalModules = 0;
      
      for (const [author, modules] of prefixes) {
        console.log(`\n${chalk.bold(author)}:`);
        for (const module of modules) {
          console.log(`  ${chalk.cyan(module)} → @${author}/${module}`);
          totalModules++;
        }
      }
      
      console.log(chalk.gray(`\nTotal: ${totalModules} modules from ${prefixes.length} authors`));
    } else {
      console.log(chalk.gray('No local modules found in llm/modules'));
    }
  } catch (error) {
    console.log(chalk.red('Error scanning local modules:'), error);
  }
}

export function createDevCommand() {
  return {
    name: 'dev',
    description: 'Manage dev mode for local module development',
    
    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      if (flags.help || flags.h) {
        console.log(`
Usage: mlld dev [subcommand]

Manage dev mode for local module development.

Subcommands:
  status    Show current dev mode status and detected modules (default)
  list      List all local modules with their publish names

Examples:
  mlld dev                  # Show status
  mlld dev status           # Show status
  mlld dev list             # List all local modules

Dev mode allows you to use published module names (e.g., @author/module) 
while developing locally. Enable it with:
  - mlld run script.mld --dev
  - export MLLD_DEV=true
        `);
        return;
      }
      
      await devCommand(args, flags);
    }
  };
}