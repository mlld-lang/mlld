import chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { findProjectRoot } from '@core/utils/findProjectRoot';
import { MLLD_MODES } from '@core/constants/modes';

export async function modeCommand(args: string[], flags: Record<string, any>) {
  const mode = args[0];
  
  if (!mode || flags.help || flags.h) {
    showHelp();
    return;
  }
  
  await setMode(mode);
}

function showHelp() {
  console.log(`
Usage: mlld mode <mode>

Set the mlld execution mode.

Available modes:
  dev, development    Enable development mode (resolve local modules)
  prod, production    Enable production mode (only published modules)
  user                Default user mode
  clear, reset        Remove mode setting (same as user)

Examples:
  mlld mode dev       # Enable development mode
  mlld mode prod      # Enable production mode
  mlld mode user      # Return to default mode
  mlld mode clear     # Clear mode setting (default to user)
  mlld mode reset     # Reset to default (same as clear)

Current mode affects:
  - Module resolution (dev mode enables local module resolution)
  - Future: Security policies and permissions
  `);
}

async function setMode(mode: string) {
  const fileSystem = new NodeFileSystem();
  const projectRoot = await findProjectRoot(process.cwd(), fileSystem);
  const lockFilePath = path.join(projectRoot, 'mlld.lock.json');
  
  // Normalize mode aliases
  const normalizedMode = normalizeMode(mode);
  
  if (!normalizedMode) {
    console.log(chalk.red(`Error: Invalid mode '${mode}'`));
    console.log('Available modes: dev, development, prod, production, user, clear, reset');
    return;
  }
  
  try {
    // Load existing lock file or create new one
    let lockData: any = {
      version: '1.0.0',
      imports: {},
      modules: {},
      cache: {},
      config: {}
    };
    
    if (existsSync(lockFilePath)) {
      const content = await fs.readFile(lockFilePath, 'utf8');
      lockData = JSON.parse(content);
    }
    
    // Ensure config object exists
    if (!lockData.config) {
      lockData.config = {};
    }
    
    // Set or remove mode
    if (normalizedMode === MLLD_MODES.USER) {
      // Remove mode to use default user mode
      delete lockData.config.mode;
    } else {
      lockData.config.mode = normalizedMode;
    }
    
    // Save lock file
    await fs.mkdir(path.dirname(lockFilePath), { recursive: true });
    await fs.writeFile(lockFilePath, JSON.stringify(lockData, null, 2));
    
    // Show appropriate message based on original command
    if (mode.toLowerCase() === 'clear' || mode.toLowerCase() === 'reset') {
      console.log(chalk.green('✓ Mode cleared'));
    } else {
      console.log(chalk.green(`✓ Mode set to: ${normalizedMode}`));
    }
    
    if (normalizedMode === MLLD_MODES.DEVELOPMENT) {
      console.log(chalk.gray('\nDevelopment mode enabled:'));
      console.log(chalk.gray('- Local modules will be resolved from llm/modules/'));
      console.log(chalk.gray('- Use @author/module syntax to import local modules'));
    } else if (normalizedMode === MLLD_MODES.PRODUCTION) {
      console.log(chalk.gray('\nProduction mode enabled:'));
      console.log(chalk.gray('- Only published modules from registries will be resolved'));
    } else {
      console.log(chalk.gray('\nUser mode enabled (default):'));
      console.log(chalk.gray('- Standard module resolution behavior'));
    }
  } catch (error: any) {
    console.log(chalk.red(`Error setting mode: ${error.message}`));
  }
}

function normalizeMode(mode: string): string | null {
  switch (mode.toLowerCase()) {
    case 'dev':
    case 'development':
      return MLLD_MODES.DEVELOPMENT;
    case 'prod':
    case 'production':
      return MLLD_MODES.PRODUCTION;
    case 'user':
    case 'clear':
    case 'reset':
      return MLLD_MODES.USER;
    default:
      return null;
  }
}

export function createModeCommand() {
  return {
    name: 'mode',
    description: 'Set mlld execution mode',
    
    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      await modeCommand(args, flags);
    }
  };
}