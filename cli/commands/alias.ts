/**
 * Alias CLI Command
 * Creates LOCAL resolvers for path aliases
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import { MlldError, ErrorSeverity } from '@core/errors/index';
import { ProjectConfig } from '@core/registry/ProjectConfig';
import { existsSync } from 'fs';

export interface AliasOptions {
  name: string;
  path: string;
  global?: boolean;
}

export class AliasCommand {
  async createAlias(options: AliasOptions): Promise<void> {
    if (!options.name || !options.path) {
      throw new MlldError('Both --name and --path are required', {
        code: 'MISSING_REQUIRED_OPTIONS',
        severity: ErrorSeverity.Fatal
      });
    }

    // Normalize alias name: remove @ prefix and / suffix if present
    let normalizedName = options.name.toLowerCase();
    if (normalizedName.startsWith('@')) {
      normalizedName = normalizedName.slice(1);
    }
    if (normalizedName.endsWith('/')) {
      normalizedName = normalizedName.slice(0, -1);
    }

    // Validate alias name format
    if (!normalizedName.match(/^[a-z0-9-]+$/)) {
      throw new MlldError('Alias name must be lowercase alphanumeric with hyphens', {
        code: 'INVALID_ALIAS_NAME',
        severity: ErrorSeverity.Fatal
      });
    }

    // Expand tilde in path
    const expandedPath = options.path.replace(/^~/, os.homedir());
    
    // Resolve to absolute path first to check existence
    const absolutePath = path.resolve(expandedPath);
    
    // Check if the path exists
    if (!existsSync(absolutePath)) {
      throw new MlldError(`Path does not exist: ${absolutePath}`, {
        code: 'PATH_NOT_FOUND',
        severity: ErrorSeverity.Fatal
      });
    }
    
    // Check if it's a directory
    const stats = await fs.stat(absolutePath);
    if (!stats.isDirectory()) {
      throw new MlldError(`Path must be a directory: ${absolutePath}`, {
        code: 'NOT_A_DIRECTORY',
        severity: ErrorSeverity.Fatal
      });
    }
    
    // Determine project root
    let projectRoot: string;
    let resolvedPath: string;

    if (options.global) {
      // Global alias - use absolute path
      projectRoot = path.join(os.homedir(), '.config', 'mlld');
      resolvedPath = absolutePath;

      // Ensure global config directory exists
      if (!existsSync(projectRoot)) {
        await fs.mkdir(projectRoot, { recursive: true });
      }
    } else {
      // Local alias - use relative path
      projectRoot = process.cwd();
      // Make sure we get a clean relative path without ./ prefix unless needed
      resolvedPath = path.relative(process.cwd(), absolutePath);
      // If the path is outside the current directory, use absolute path
      if (resolvedPath.startsWith('..')) {
        console.log(chalk.yellow(`Warning: Path is outside current directory. Using absolute path.`));
        resolvedPath = absolutePath;
      }
    }

    // Load or create project config
    const projectConfig = new ProjectConfig(projectRoot);
    
    // Create prefix configuration entry with normalized name
    const prefix = `@${normalizedName}/`;
    const newPrefixConfig = {
      prefix,
      resolver: 'LOCAL',
      config: {
        basePath: resolvedPath
      }
    };

    // Get existing prefixes
    const existingPrefixes = projectConfig.getResolverPrefixes();

    // Check for duplicate prefix
    const existingIndex = existingPrefixes.findIndex(r => r.prefix === prefix);
    if (existingIndex >= 0) {
      // Replace existing
      existingPrefixes[existingIndex] = newPrefixConfig;
      console.log(chalk.yellow(`Updated existing path alias: ${prefix}`));
    } else {
      // Add new
      existingPrefixes.push(newPrefixConfig);
    }

    // Save configuration
    await projectConfig.setResolverPrefixes(existingPrefixes);

    // Success message
    const scope = options.global ? 'global' : 'local';
    console.log(chalk.green(`✔ Created ${scope} path alias: ${prefix} → ${resolvedPath}`));
    console.log(chalk.gray(`\nYou can now import from this directory:`));
    console.log(chalk.gray(`  /import { something } from ${prefix}filename`));
    console.log(chalk.gray(`  /import { * } from ${prefix}module.mld`));
    
    if (!options.global) {
      console.log(chalk.gray(`\nThis alias is only available in this project.`));
      console.log(chalk.gray(`Config file: ${path.relative(process.cwd(), path.join(projectRoot, 'mlld-config.json'))}`))
    } else {
      console.log(chalk.gray(`\nThis alias is available globally to all mlld projects.`));
      console.log(chalk.gray(`Config file: ${path.join(projectRoot, 'mlld-config.json')}`));
    }
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

export async function aliasCommand(args: string[], options: AliasOptions): Promise<void> {
  const command = new AliasCommand();
  await command.createAlias(options);
}

/**
 * Create alias command for CLI integration
 */
export function createAliasCommand() {
  return {
    name: 'alias',
    description: 'Create a path alias for module imports',
    
    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      // Check for help flag first
      if (flags.help || flags.h) {
        console.log(`
Usage: mlld alias --name <alias> --path <path> [options]

Creates a path alias for easy module imports.

Options:
  -n, --name <alias>   Alias name (required)
  -p, --path <path>    Directory path (required)
  -g, --global         Create global alias (default: local to project)
  -h, --help           Show this help message

Examples:
  # Create path alias (project-specific)
  mlld alias --name shared --path ../shared-modules
  
  # Create global alias (available to all projects)
  mlld alias --name desktop --path ~/Desktop --global
  
  # Use tilde expansion
  mlld alias --name home --path ~/my-modules

After creating an alias, you can import from it:
  /import { utils } from @shared/utils
  /import { data } from @desktop/my-data

Local aliases:
  - Stored in project's mlld.lock.json
  - Path is relative to the project root
  - Only available within the project

Global aliases:
  - Stored in ~/.config/mlld/mlld.lock.json
  - Path is absolute
  - Available to all mlld projects
        `);
        return;
      }
      
      const options: AliasOptions = {
        name: flags.name || flags.n,
        path: flags.path || flags.p,
        global: flags.global || flags.g
      };
      
      try {
        await aliasCommand(args, options);
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