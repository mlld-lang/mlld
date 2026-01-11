/**
 * Run CLI Command
 * Execute mlld scripts from a configured directory
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import chalk from 'chalk';
import { MlldError, ErrorSeverity } from '@core/errors/index';
import { ProjectConfig } from '@core/registry/ProjectConfig';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { execute, TimeoutError } from '@sdk/execute';
import { ExecuteError, type StructuredResult } from '@sdk/types';
import { cliLogger } from '@core/utils/logger';
import { findProjectRoot } from '@core/utils/findProjectRoot';
import { parseInjectOptions, type DynamicModuleMap } from '../utils/inject-parser';

export interface RunOptions {
  timeoutMs?: number;
  debug?: boolean;
  inject?: string[];
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

    // Check if config exists and has script directory configured
    const projectConfig = new ProjectConfig(projectRoot);
    const configuredScriptDir = projectConfig.getScriptDir();

    if (configuredScriptDir) {
      this.scriptDir = configuredScriptDir;
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
      // Parse inject options into dynamic modules
      let dynamicModules: DynamicModuleMap | undefined;
      if (options.inject && options.inject.length > 0) {
        dynamicModules = await parseInjectOptions(
          options.inject,
          this.fileSystem,
          path.dirname(scriptPath)
        );
      }

      // Use execute for AST caching and metrics
      const result = await execute(scriptPath, undefined, {
        fileSystem: this.fileSystem,
        pathService: new PathService(),
        timeoutMs: options.timeoutMs ?? 300000, // 5 minute default
        dynamicModules,
      }) as StructuredResult;

      // Output the result
      console.log(result.output);

      // Show metrics in debug mode
      if (options.debug && result.metrics) {
        console.error(chalk.gray('\nMetrics:'));
        console.error(chalk.gray(`  Total: ${result.metrics.totalMs.toFixed(1)}ms`));
        console.error(chalk.gray(`  Parse: ${result.metrics.parseMs.toFixed(1)}ms${result.metrics.cacheHit ? ' (cached)' : ''}`));
        console.error(chalk.gray(`  Evaluate: ${result.metrics.evaluateMs.toFixed(1)}ms`));
        console.error(chalk.gray(`  Effects: ${result.metrics.effectCount}`));
        console.error(chalk.gray(`  State writes: ${result.metrics.stateWriteCount}`));
      }

      // Clean up environment to prevent Node shadow env timers from keeping process alive
      if (result.environment && 'cleanup' in result.environment) {
        result.environment.cleanup();
      }

      // For run command, ensure clean exit after script completes
      await new Promise(resolve => setTimeout(resolve, 10));
      process.exit(0);

    } catch (error) {
      if (error instanceof TimeoutError) {
        throw new MlldError(
          `Script timed out after ${error.timeoutMs}ms`,
          {
            code: 'SCRIPT_TIMEOUT',
            severity: ErrorSeverity.Fatal,
            cause: error
          }
        );
      }

      if (error instanceof ExecuteError) {
        throw new MlldError(
          `Failed to run script: ${error.message}`,
          {
            code: error.code === 'PARSE_ERROR' ? 'SCRIPT_PARSE_ERROR' : 'SCRIPT_EXECUTION_ERROR',
            severity: ErrorSeverity.Fatal,
            cause: error
          }
        );
      }

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
  -h, --help         Show this help message
  --timeout <ms>     Script timeout in milliseconds (default: 300000 / 5 minutes)
  --debug            Show execution metrics (timing, cache hits, effects)
  --<name> <value>   Any other flag becomes payload (see below)

Script Directory:
  Scripts are loaded from the directory configured in mlld-config.json.
  Default: llm/run/

  Configure with: mlld setup

Examples:
  mlld run                           # List available scripts
  mlld run hello                     # Run llm/run/hello.mld
  mlld run hello --debug             # Show execution metrics
  mlld run qa --topic variables      # Pass --topic as payload
  mlld run build --env prod --fast   # Multiple payload values

Payload:
  Unknown flags are passed to the script as @payload:
    mlld run qa --topic foo --count 5
  In script:
    import { topic, count } from @payload
    show @topic    >> "foo"
    show @count    >> "5"

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

      // Parse timeout flag
      let timeoutMs: number | undefined;
      if (flags.timeout !== undefined) {
        timeoutMs = parseInt(String(flags.timeout), 10);
        if (isNaN(timeoutMs) || timeoutMs <= 0) {
          console.error(chalk.red('Error: --timeout must be a positive number'));
          process.exit(1);
        }
      }

      // Known flags that are NOT payload
      const knownFlags = new Set(['help', 'h', 'timeout', 'debug', 'd', 'inject', 'payload', '_']);

      // Collect inject/payload flags (explicit format: @key=value)
      const inject: string[] = [];
      if (flags.inject) {
        inject.push(...(Array.isArray(flags.inject) ? flags.inject : [flags.inject]));
      }
      if (flags.payload) {
        inject.push(...(Array.isArray(flags.payload) ? flags.payload : [flags.payload]));
      }

      // Build @payload object from unknown flags: --topic foo --count 5 => @payload={"topic":"foo","count":"5"}
      const payloadObj: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(flags)) {
        if (!knownFlags.has(key) && value !== undefined) {
          payloadObj[key] = value;
        }
      }
      const isDebug = Boolean(flags.debug || flags.d);
      // Always inject @payload (empty {} if no flags) so scripts can safely reference @payload.field
      const payloadStr = `@payload=${JSON.stringify(payloadObj)}`;
      if (isDebug && Object.keys(payloadObj).length > 0) {
        console.error(chalk.gray(`Payload: ${payloadStr}`));
      }
      inject.push(payloadStr);

      const options: RunOptions = {
        timeoutMs,
        debug: isDebug,
        inject: inject.length > 0 ? inject : undefined
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
