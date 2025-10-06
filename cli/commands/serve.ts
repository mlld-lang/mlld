import * as path from 'path';
import * as fs from 'fs/promises';
import { glob } from 'glob';
import { interpret, type InterpretResult } from '@interpreter/index';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { PathContextBuilder } from '@core/services/PathContextService';
import type { ExecutableVariable } from '@core/types/variable';
import type { Environment } from '@interpreter/env/Environment';
import { MCPServer } from '../mcp/MCPServer';

export interface ServeCommandOptions {
  modulePath: string;
}

interface LoadedModule {
  path: string;
  environment: Environment;
  exports: Map<string, ExecutableVariable>;
}

class ServeCommand {
  async execute(args: string[], _flags: Record<string, unknown>): Promise<void> {
    const modulePath = args[0];

    if (!modulePath) {
      console.error('Usage: mlld serve <module-path>');
      process.exit(1);
    }

    const modulePaths = await resolveModulePaths(modulePath);

    if (modulePaths.length === 0) {
      console.error(`No modules found for: ${modulePath}`);
      process.exit(1);
    }

    console.error(`Loading ${modulePaths.length} module(s)...`);

    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();
    const loadedModules: LoadedModule[] = [];

    for (const moduleFile of modulePaths) {
      console.error(`  Loading: ${moduleFile}`);
      const loaded = await loadModule(moduleFile, fileSystem, pathService);
      loadedModules.push(loaded);

      const exportedNames = Array.from(loaded.exports.keys());
      if (exportedNames.length > 0) {
        console.error(`    Exported: ${exportedNames.join(', ')}`);
      } else {
        console.error('    Exported: (none)');
      }
    }

    const { environment, exportedFunctions } = mergeModules(loadedModules);

    console.error(`Loaded ${exportedFunctions.size} exported function(s)`);
    console.error('Starting MCP server...');

    const server = new MCPServer({
      environment,
      exportedFunctions,
    });

    await server.start();
  }
}

export function createServeCommand(): ServeCommand {
  return new ServeCommand();
}

export async function resolveModulePaths(modulePath: string): Promise<string[]> {
  const resolved = path.resolve(modulePath);

  try {
    const stat = await fs.stat(resolved);
    if (stat.isFile()) {
      return [resolved];
    }

    if (stat.isDirectory()) {
      const files = await glob('**/*.{mld,mld.md}', {
        cwd: resolved,
        absolute: true,
      });
      return Array.from(new Set(files)).sort();
    }
  } catch {
    // Fall back to glob handling
  }

  const files = await glob(modulePath, { absolute: true });
  return Array.from(new Set(files)).sort();
}

async function loadModule(
  modulePath: string,
  fileSystem: NodeFileSystem,
  pathService: PathService
): Promise<LoadedModule> {
  const content = await fs.readFile(modulePath, 'utf8');
  const pathContext = await PathContextBuilder.fromFile(modulePath, fileSystem, {
    invocationDirectory: process.cwd(),
  });

  const result = (await interpret(content, {
    fileSystem,
    pathService,
    pathContext,
    filePath: modulePath,
    format: 'markdown',
    returnEnvironment: true,
    normalizeBlankLines: true,
  })) as InterpretResult;

  const environment = result.environment;
  const exportedFunctions = extractExportedFunctions(environment, modulePath);

  return {
    path: modulePath,
    environment,
    exports: exportedFunctions,
  };
}

function extractExportedFunctions(
  environment: Environment,
  modulePath: string
): Map<string, ExecutableVariable> {
  const exported = new Map<string, ExecutableVariable>();
  const manifest = environment.getExportManifest();

  if (manifest && manifest.hasEntries()) {
    for (const name of manifest.getNames()) {
      const variable = environment.getVariable(name);
      if (variable && variable.type === 'executable') {
        exported.set(name, variable as ExecutableVariable);
      }
    }
  } else {
    console.error(`    No /export directive in ${modulePath}, exporting all executables`);
    for (const [name, variable] of environment.getAllVariables()) {
      if (variable.type === 'executable') {
        exported.set(name, variable as ExecutableVariable);
      }
    }
  }

  return exported;
}

function mergeModules(modules: LoadedModule[]): {
  environment: Environment;
  exportedFunctions: Map<string, ExecutableVariable>;
} {
  if (modules.length === 0) {
    throw new Error('No modules loaded');
  }

  const exportedFunctions = new Map<string, ExecutableVariable>();
  const exportOrigins = new Map<string, string>();
  const baseEnvironment = modules[0].environment;

  for (const module of modules) {
    const isBaseModule = module.environment === baseEnvironment;
    for (const [name, variable] of module.exports) {
      if (exportedFunctions.has(name)) {
        const firstPath = exportOrigins.get(name) || 'unknown';
        console.error(`Error: Duplicate function name '${name}'`);
        console.error(`  First module: ${firstPath}`);
        console.error(`  Conflicting module: ${module.path}`);
        process.exit(1);
      }

      exportedFunctions.set(name, variable);
      exportOrigins.set(name, module.path);
      if (!isBaseModule) {
        baseEnvironment.setVariable(name, variable);
      }
    }
  }

  return {
    environment: baseEnvironment,
    exportedFunctions,
  };
}
