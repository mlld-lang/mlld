/**
 * Run CLI Command
 * Execute mlld scripts from a configured directory
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import chalk from 'chalk';
import { MlldError, ErrorSeverity } from '@core/errors/index';
import { LockFile } from '@core/registry/LockFile';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { interpret } from '@interpreter/index';
import { cliLogger } from '@core/utils/logger';
import { findProjectRoot } from '@core/utils/findProjectRoot';

export interface RunOptions {
  // Future options like --watch, --env, etc
}

export class RunCommand {
  private scriptDir: string = 'llm/run';
  private fileSystem: NodeFileSystem;
  
  constructor() {
    this.fileSystem = new NodeFileSystem();
  }

  private async getScriptDirectory(): Promise<string> {
    // Find the project root first
    const projectRoot = await findProjectRoot(process.cwd(), this.fileSystem);
    
    // Check if mlld.lock.json exists and has script directory configured
    const lockFilePath = path.join(projectRoot, 'mlld.lock.json');
    
    if (existsSync(lockFilePath)) {
      const lockFile = new LockFile(lockFilePath);
      // Check if scriptDir is configured in the lock file
      const lockData = (lockFile as any).data;
      if (lockData && lockData.config?.scriptDir) {
        this.scriptDir = lockData.config.scriptDir;
      }
    }
    
    // Return the script directory relative to project root
    return path.join(projectRoot, this.scriptDir);
  }

  async listScripts(): Promise<string[]> {
    const scriptDir = await this.getScriptDirectory();
    
    if (!existsSync(scriptDir)) {
      return [];
    }
    
    try {
      const files = await fs.readdir(scriptDir);
      // Filter for .mld files and remove extension
      return files
        .filter(file => file.endsWith('.mld'))
        .map(file => path.basename(file, '.mld'));
    } catch (error: any) {
      cliLogger.error('Failed to list scripts', { error: error?.message || error });
      return [];
    }
  }

  async findScript(scriptName: string): Promise<string | null> {
    const scriptDir = await this.getScriptDirectory();
    
    // Try with .mld extension
    const scriptPath = path.join(scriptDir, `${scriptName}.mld`);
    if (existsSync(scriptPath)) {
      return scriptPath;
    }
    
    // Try exact name (in case they included extension)
    const exactPath = path.join(scriptDir, scriptName);
    if (existsSync(exactPath) && exactPath.endsWith('.mld')) {
      return exactPath;
    }
    
    return null;
  }

  async run(scriptName: string, options: RunOptions = {}): Promise<void> {
    const scriptPath = await this.findScript(scriptName);
    
    if (!scriptPath) {
      const availableScripts = await this.listScripts();
      
      if (availableScripts.length === 0) {
        const scriptDir = await this.getScriptDirectory();
        throw new MlldError(
          `No scripts found. Create scripts in the ${scriptDir} directory.`,
          {
            code: 'SCRIPT_NOT_FOUND',
            severity: ErrorSeverity.Fatal
          }
        );
      }
      
      throw new MlldError(
        `Script "${scriptName}" not found.\n\nAvailable scripts:\n  ${availableScripts.join('\n  ')}`,
        {
          code: 'SCRIPT_NOT_FOUND',
          severity: ErrorSeverity.Fatal
        }
      );
    }
    
    console.log(chalk.gray(`Running ${path.relative(process.cwd(), scriptPath)}...\n`));
    
    try {
      // Read the script file
      const content = await fs.readFile(scriptPath, 'utf8');
      
      // Create services for the interpreter
      const fileSystem = new NodeFileSystem();
      const pathService = new PathService();
      
      // Run the script
      const result = await interpret(content, {
        basePath: path.dirname(scriptPath),
        filePath: scriptPath,
        format: 'markdown',
        fileSystem,
        pathService,
        returnEnvironment: false,
        enableTrace: true,
        useMarkdownFormatter: false // Scripts should output raw results
      });
      
      // Output the result
      console.log(result);
      
    } catch (error) {
      if (error instanceof MlldError) {
        throw error;
      }
      throw new MlldError(
        `Failed to run script: ${error instanceof Error ? error.message : String(error)}`,
        {
          code: 'SCRIPT_EXECUTION_ERROR',
          severity: ErrorSeverity.Fatal,
          cause: error
        }
      );
    }
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

export async function runCommand(args: string[], options: RunOptions = {}): Promise<void> {
  const command = new RunCommand();
  
  if (args.length === 0) {
    // List available scripts
    const scripts = await command.listScripts();
    
    if (scripts.length === 0) {
      const scriptDir = await command.getScriptDirectory();
      console.log(chalk.yellow(`No scripts found in ${scriptDir}/`));
      console.log(chalk.gray('\nCreate a script file (e.g., hello.mld) to get started.'));
      return;
    }
    
    console.log(chalk.blue('Available scripts:\n'));
    for (const script of scripts) {
      console.log(`  ${script}`);
    }
    console.log(chalk.gray('\nRun a script with: mlld run <script-name>'));
    return;
  }
  
  const scriptName = args[0];
  await command.run(scriptName, options);
}

/**
 * Create run command for CLI integration
 */
export function createRunCommand() {
  return {
    name: 'run',
    description: 'Run mlld scripts from the configured script directory',
    
    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      // Check for help flag first
      if (flags.help || flags.h) {
        console.log(`
Usage: mlld run <script-name> [options]

Run mlld scripts from the configured script directory.

Arguments:
  script-name    Name of the script to run (without .mld extension)

Options:
  -h, --help     Show this help message

Script Directory:
  Scripts are loaded from the directory configured in mlld.lock.json.
  Default: llm/run/
  
  Configure with: mlld setup --script-dir <path>

Examples:
  mlld run                    # List available scripts
  mlld run hello              # Run llm/run/hello.mld
  mlld run data-processor     # Run llm/run/data-processor.mld

Creating Scripts:
  1. Create a .mld file in your script directory
  2. Write mlld code to perform tasks
  3. Run with: mlld run <script-name>

Example script (llm/run/hello.mld):
  /var @greeting = "Hello from mlld script!"
  /show @greeting
        `);
        return;
      }
      
      const options: RunOptions = {
        // Future: parse additional flags here
      };
      
      try {
        await runCommand(args, options);
      } catch (error) {
        if (error instanceof MlldError) {
          console.error(chalk.red(`Error: ${error.message}`));
        } else {
          console.error(chalk.red(`Unexpected error: ${error}`));
        }
        process.exit(1);
      }
    }
  };
}