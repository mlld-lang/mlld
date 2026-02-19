/**
 * Run CLI Command
 * Execute mlld scripts from a configured directory
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { existsSync } from 'fs';
import chalk from 'chalk';
import { MlldError, ErrorSeverity } from '@core/errors/index';
import { parseDuration, formatDuration } from '@core/config/utils';
import { ProjectConfig } from '@core/registry/ProjectConfig';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { execute, TimeoutError } from '@sdk/execute';
import { ExecuteError, type StructuredResult } from '@sdk/types';
import { cliLogger } from '@core/utils/logger';
import { findProjectRoot } from '@core/utils/findProjectRoot';
import { parseInjectOptions, type DynamicModuleMap } from '../utils/inject-parser';

const ENTRY_POINTS = ['index.mld', 'main.mld', 'index.mld.md', 'main.mld.md'];

export interface RunOptions {
  timeoutMs?: number;
  debug?: boolean;
  inject?: string[];
  checkpoint?: boolean;
  fresh?: boolean;
  resume?: string | true;
  fork?: string;
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

  private getGlobalScriptDirectory(): string {
    return path.join(os.homedir(), '.mlld', 'run');
  }

  private async collectScriptsFromDir(dir: string, scripts: Set<string>): Promise<void> {
    if (!existsSync(dir)) return;

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.mld')) {
          scripts.add(path.basename(entry.name, '.mld'));
        } else if (entry.isDirectory()) {
          // Check if directory has an entry point
          for (const entryPoint of ENTRY_POINTS) {
            if (existsSync(path.join(dir, entry.name, entryPoint))) {
              scripts.add(entry.name);
              break;
            }
          }
        }
      }
    } catch (error: any) {
      cliLogger.error('Failed to list scripts from directory', { dir, error: error?.message || error });
    }
  }

  async listScripts(): Promise<string[]> {
    const scripts = new Set<string>();

    // Local scripts
    const localDir = await this.getScriptDirectory();
    await this.collectScriptsFromDir(localDir, scripts);

    // Global scripts
    const globalDir = this.getGlobalScriptDirectory();
    await this.collectScriptsFromDir(globalDir, scripts);

    return Array.from(scripts).sort();
  }

  private findEntryPointInDir(dirPath: string): string | null {
    for (const entryPoint of ENTRY_POINTS) {
      const entryPath = path.join(dirPath, entryPoint);
      if (existsSync(entryPath)) {
        return entryPath;
      }
    }
    return null;
  }

  async findScript(scriptName: string): Promise<string | null> {
    const scriptDir = await this.getScriptDirectory();
    const globalDir = this.getGlobalScriptDirectory();

    // 1. Try local flat file (.mld)
    const localFlatPath = path.join(scriptDir, `${scriptName}.mld`);
    if (existsSync(localFlatPath)) {
      return localFlatPath;
    }

    // 2. Try local directory with entry point
    const localDirPath = path.join(scriptDir, scriptName);
    if (existsSync(localDirPath)) {
      const stat = await fs.stat(localDirPath);
      if (stat.isDirectory()) {
        const entryPath = this.findEntryPointInDir(localDirPath);
        if (entryPath) return entryPath;
      }
    }

    // 3. Try exact name with extension (in case they included it)
    const exactPath = path.join(scriptDir, scriptName);
    if (existsSync(exactPath) && scriptName.endsWith('.mld')) {
      return exactPath;
    }

    // 4. Try global flat file
    const globalFlatPath = path.join(globalDir, `${scriptName}.mld`);
    if (existsSync(globalFlatPath)) {
      return globalFlatPath;
    }

    // 5. Try global directory with entry point
    const globalDirPath = path.join(globalDir, scriptName);
    if (existsSync(globalDirPath)) {
      try {
        const stat = await fs.stat(globalDirPath);
        if (stat.isDirectory()) {
          const entryPath = this.findEntryPointInDir(globalDirPath);
          if (entryPath) return entryPath;
        }
      } catch {
        // Directory doesn't exist or can't be accessed
      }
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
        timeoutMs: options.timeoutMs, // undefined = no timeout
        dynamicModules,
        checkpoint: options.checkpoint,
        fresh: options.fresh,
        resume: options.resume,
        fork: options.fork,
        checkpointScriptName: scriptName
      }) as StructuredResult;

      // Check if streaming was enabled - if so, skip final output since it was already streamed
      const effectHandler = result.environment?.getEffectHandler?.();
      const isStreaming = effectHandler?.isStreamingEnabled?.() ?? false;

      // Output the result (skip if streaming already output everything)
      if (!isStreaming) {
        console.log(result.output);
      }

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
          `Script timed out after ${formatDuration(error.timeoutMs)}`,
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
  -h, --help              Show this help message
  --timeout <duration>    Script timeout (e.g., 5m, 1h, 30s, or ms) - default: unlimited
  --debug                 Show execution metrics (timing, cache hits, effects)
  --checkpoint            Enable checkpoint cache reuse for llm-labeled calls
  --fresh                 Rebuild checkpoint cache from scratch for this script
  --resume [target]       Resume with checkpoints (optionally from target)
  --fork <script>         Read checkpoints from another script as seed cache
  --<name> <value>        Any other flag becomes payload (see below)

Script Locations (checked in order):
  1. Local flat file:     llm/run/<name>.mld
  2. Local directory:     llm/run/<name>/index.mld
  3. Global flat file:    ~/.mlld/run/<name>.mld
  4. Global directory:    ~/.mlld/run/<name>/index.mld

  Configure local directory with: mlld setup

Directory Scripts:
  Scripts can be organized as directories with an entry point:
    llm/run/my-app/
    ├── index.mld      # Entry point (or main.mld)
    ├── lib/           # Supporting files
    └── prompts/       # Templates, etc.

  Run with: mlld run my-app

Examples:
  mlld run                           # List available scripts
  mlld run hello                     # Run llm/run/hello.mld
  mlld run my-app                    # Run llm/run/my-app/index.mld
  mlld run hello --debug             # Show execution metrics
  mlld run qa --topic variables      # Pass --topic as payload

Payload:
  Unknown flags are passed to the script as @payload:
    mlld run qa --topic foo --count 5
  In script:
    import { topic, count } from @payload
    show @topic    >> "foo"
    show @count    >> "5"

Creating Scripts:
  Single file:    Create llm/run/hello.mld
  Directory app:  mlld init app hello
        `);
        return;
      }

      // Parse timeout flag (supports durations like 5m, 1h, 30s)
      let timeoutMs: number | undefined;
      if (flags.timeout !== undefined) {
        try {
          timeoutMs = parseDuration(String(flags.timeout));
          if (timeoutMs <= 0) {
            console.error(chalk.red('Error: --timeout must be a positive duration'));
            process.exit(1);
          }
        } catch {
          console.error(chalk.red('Error: --timeout must be a valid duration (e.g., 5m, 1h, 30s, or milliseconds)'));
          process.exit(1);
        }
      }

      // Known flags that are NOT payload
      const knownFlags = new Set([
        'help',
        'h',
        'timeout',
        'debug',
        'd',
        'inject',
        'payload',
        'checkpoint',
        'fresh',
        'resume',
        'fork',
        '_'
      ]);

      // Collect inject/payload flags (explicit format: @key=value)
      const inject: string[] = [];
      if (flags.inject) {
        inject.push(...(Array.isArray(flags.inject) ? flags.inject : [flags.inject]));
      }
      if (flags.payload) {
        inject.push(...(Array.isArray(flags.payload) ? flags.payload : [flags.payload]));
      }
      const checkpointEnabled =
        Boolean(flags.checkpoint) ||
        Boolean(flags.fresh) ||
        flags.resume !== undefined ||
        flags.fork !== undefined;
      const fresh = Boolean(flags.fresh);
      const resume = flags.resume === undefined ? undefined : flags.resume === true ? true : String(flags.resume);
      let fork: string | undefined;
      if (flags.fork !== undefined) {
        if (flags.fork === true) {
          console.error(chalk.red('Error: --fork requires a script name'));
          process.exit(1);
        }
        fork = String(flags.fork);
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
        inject: inject.length > 0 ? inject : undefined,
        checkpoint: checkpointEnabled,
        fresh,
        resume,
        fork
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
