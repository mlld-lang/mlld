import * as path from 'path';
import * as fs from 'fs/promises';
import { glob } from 'glob';
import { interpret } from '@interpreter/index';
import { analyzeModule, type ExecutableInfo } from '@sdk/analyze';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { PathContextBuilder } from '@core/services/PathContextService';
import type { ExecutableVariable, Variable } from '@core/types/variable';
import type { Environment } from '@interpreter/env/Environment';
import type { ToolCollection } from '@core/types/tools';
import { MCPServer } from '../mcp/MCPServer';
import { mlldNameToMCPName } from '../mcp/SchemaGenerator';
import { extractVariableValue } from '@interpreter/utils/variable-resolution';

interface ServeOptions {
  modulePath: string;
  defaultUsed: boolean;
  configPath?: string;
  envOverrides: Record<string, string>;
  toolsOverride?: string[];
  toolsCollection?: string;
}

interface ConfigResult {
  tools?: string[];
  env?: Record<string, string>;
}

export interface McpCommandOptions {
  modulePath: string;
}

interface LoadedModule {
  path: string;
  environment: Environment;
  exports: Map<string, ExecutableVariable>;
}

interface DiscoveredTool {
  name: string;
  modulePath: string;
  info: ExecutableInfo;
}

interface AnalyzedModule {
  path: string;
  tools: DiscoveredTool[];
  valid: boolean;
  errors: string[];
}

class McpCommand {
  async execute(args: string[], flags: Record<string, unknown>): Promise<void> {
    const serveOptions = await this.resolveServeOptions(args, flags);

    const modulePaths = await resolveModulePaths(serveOptions.modulePath);

    if (modulePaths.length === 0) {
      console.error(`No modules found for: ${serveOptions.modulePath}`);
      process.exit(1);
    }

    if (serveOptions.defaultUsed) {
      console.error('Using default MCP modules directory: llm/mcp/');
    }

    // Apply CLI env overrides immediately so config/modules see them
    const appliedCliEnv = applyEnvironmentOverrides(serveOptions.envOverrides, 'CLI --env');
    if (appliedCliEnv.length > 0) {
      console.error(`Applied environment overrides (${appliedCliEnv.join(', ')})`);
    }

    const fileSystem = new NodeFileSystem();
    const pathService = new PathService();

    let configResult: ConfigResult | undefined;
    if (serveOptions.configPath) {
      configResult = await this.loadConfigModule(serveOptions.configPath, fileSystem, pathService);

      if (configResult?.env) {
        const appliedConfigEnv = applyEnvironmentOverrides(configResult.env, `config ${serveOptions.configPath}`);
        if (appliedConfigEnv.length > 0) {
          console.error(`Applied config environment overrides (${appliedConfigEnv.join(', ')})`);
        }
      }
    }

    // Phase 1: Analyze modules for tool discovery (no code execution)
    console.error(`Analyzing ${modulePaths.length} module(s) for tools...`);

    const analyzedModules: AnalyzedModule[] = [];
    const allTools: DiscoveredTool[] = [];

    for (const moduleFile of modulePaths) {
      console.error(`  Analyzing: ${moduleFile}`);
      const analyzed = await discoverTools(moduleFile);
      analyzedModules.push(analyzed);

      if (!analyzed.valid) {
        console.error(`    Parse errors: ${analyzed.errors.join(', ')}`);
        continue;
      }

      if (analyzed.tools.length > 0) {
        console.error(`    Discovered: ${analyzed.tools.map(t => t.name).join(', ')}`);
        allTools.push(...analyzed.tools);
      } else {
        console.error('    Discovered: (none)');
      }
    }

    // Apply tool filtering
    let filteredTools = [...allTools];

    if (
      configResult?.tools &&
      configResult.tools.length > 0 &&
      !(serveOptions.toolsOverride && serveOptions.toolsOverride.length > 0)
    ) {
      filteredTools = filterDiscoveredTools(filteredTools, configResult.tools, `config ${serveOptions.configPath}`);
    }

    if (serveOptions.toolsOverride && serveOptions.toolsOverride.length > 0) {
      filteredTools = filterDiscoveredTools(filteredTools, serveOptions.toolsOverride, '--tools');
    }

    if (filteredTools.length === 0) {
      console.error('No tools available to serve after applying filters.');
      process.exit(1);
    }

    console.error(`Discovered ${filteredTools.length} tool(s)`);

    // Phase 2: Load modules that have tools we need (for execution)
    const modulesToLoad = [...new Set(filteredTools.map(t => t.modulePath))];
    console.error(`Loading ${modulesToLoad.length} module(s) for execution...`);

    const loadedModules: LoadedModule[] = [];
    for (const moduleFile of modulesToLoad) {
      const loaded = await loadModule(moduleFile, fileSystem, pathService);
      loadedModules.push(loaded);
    }

    const { environment, exportedFunctions } = mergeModules(loadedModules);

    // Filter exportedFunctions to only include discovered tools
    const toolNames = new Set(filteredTools.map(t => normalizeExportName(t.name)));
    for (const [name] of Array.from(exportedFunctions.entries())) {
      if (!toolNames.has(name)) {
        exportedFunctions.delete(name);
      }
    }

    console.error(`Loaded ${exportedFunctions.size} exported function(s)`);
    console.error('Starting MCP server...');

    let toolCollection: ToolCollection | undefined;
    if (serveOptions.toolsCollection) {
      const collectionName = normalizeVarName(serveOptions.toolsCollection);
      const toolsVar = environment.getVariable(collectionName) as Variable | undefined;
      if (!toolsVar || toolsVar.type !== 'object' || !toolsVar.internal?.toolCollection) {
        console.error(`Tool collection not found: @${collectionName}`);
        process.exit(1);
      }
      toolCollection = toolsVar.internal.toolCollection;
    }

    const server = new MCPServer({
      environment,
      exportedFunctions,
      toolCollection,
    });

    await server.start();
  }

  private async resolveServeOptions(args: string[], flags: Record<string, unknown>): Promise<ServeOptions> {
    const remainingPath = args[0];

    let modulePath = remainingPath;
    let defaultUsed = false;

    if (!modulePath) {
      const defaultRelative = path.join('llm', 'mcp');
      const defaultAbsolute = path.resolve(defaultRelative);
      if (await pathExists(defaultAbsolute)) {
        modulePath = defaultRelative;
        defaultUsed = true;
      } else {
        console.error('Usage: mlld mcp [module-path] [--config module.mld.md] [--env KEY=VAL] [--tools tool1,tool2] [--tools-collection @var]');
        console.error('No module path provided and llm/mcp/ not found');
        process.exit(1);
      }
    }

    const envValue = getStringFlag(flags, 'env');
    const envOverrides = envValue && (envValue.includes('=') || envValue.includes(','))
      ? parseEnvOverrides(envValue)
      : {};
    const toolsOverride = parseToolsList(getStringFlag(flags, 'tools'));
    const toolsCollection = getStringFlag(flags, 'tools-collection');
    const configPathRaw = getStringFlag(flags, 'config');
    const configPath = configPathRaw ? path.resolve(configPathRaw) : undefined;

    if (configPath && !(await fileExists(configPath))) {
      console.error(`Config module not found: ${configPath}`);
      process.exit(1);
    }

    return {
      modulePath,
      defaultUsed,
      configPath,
      envOverrides,
      toolsOverride,
      toolsCollection,
    };
  }

  private async loadConfigModule(
    configPath: string,
    fileSystem: NodeFileSystem,
    pathService: PathService
  ): Promise<ConfigResult | undefined> {
    console.error(`Loading config module: ${configPath}`);

    const content = await fs.readFile(configPath, 'utf8');
    const pathContext = await PathContextBuilder.fromFile(configPath, fileSystem, {
      invocationDirectory: process.cwd(),
    });

    let environment: Environment | null = null;

    await interpret(content, {
      fileSystem,
      pathService,
      pathContext,
      filePath: configPath,
      format: 'markdown',
      normalizeBlankLines: true,
      captureEnvironment: env => {
        environment = env;
      }
    });

    if (!environment) {
      throw new Error(`Failed to capture environment for config module: ${configPath}`);
    }
    const configVariable = environment.getVariable('config');

    if (!configVariable) {
      console.error(`Config module ${configPath} does not export @config; continuing without config.`);
      return undefined;
    }

    const configValue = await extractVariableValue(configVariable, environment);

    if (!configValue || typeof configValue !== 'object') {
      console.error(`Config module ${configPath} @config is not an object; ignoring.`);
      return undefined;
    }

    const configResult: ConfigResult = {};

    if (Array.isArray((configValue as any).tools)) {
      configResult.tools = ((configValue as any).tools as any[])
        .map((tool) => String(tool));
    }

    if ((configValue as any).env && typeof (configValue as any).env === 'object') {
      const envEntries = Object.entries((configValue as any).env as Record<string, unknown>);
      const envMap: Record<string, string> = {};
      for (const [key, value] of envEntries) {
        envMap[key] = String(value ?? '');
      }
      configResult.env = envMap;
    }

    return configResult;
  }
}

export function createMcpCommand(): McpCommand {
  return new McpCommand();
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

/**
 * Discover tools in a module using static analysis (no code execution).
 * Returns exported executable functions with their metadata.
 */
async function discoverTools(modulePath: string): Promise<AnalyzedModule> {
  const analysis = await analyzeModule(modulePath);

  if (!analysis.valid) {
    return {
      path: modulePath,
      tools: [],
      valid: false,
      errors: analysis.errors.map(e => e.message)
    };
  }

  // Get exported executables only
  const exportSet = new Set(analysis.exports.map(e => normalizeExportName(e)));
  const tools: DiscoveredTool[] = [];

  for (const exec of analysis.executables) {
    const normalizedName = normalizeExportName(exec.name);

    // If there are exports, only include exported executables
    // If no exports, include all executables (legacy behavior)
    if (exportSet.size > 0 && !exportSet.has(normalizedName)) {
      continue;
    }

    tools.push({
      name: exec.name,
      modulePath,
      info: exec
    });
  }

  // If no exports were declared, warn and include all executables
  if (exportSet.size === 0 && analysis.executables.length > 0) {
    console.error(`    Warning: No /export directive in ${modulePath}, discovering all executables`);
  }

  return {
    path: modulePath,
    tools,
    valid: true,
    errors: []
  };
}

/**
 * Filter discovered tools by allowed names.
 */
function filterDiscoveredTools(
  tools: DiscoveredTool[],
  allowedNames: string[],
  sourceLabel: string
): DiscoveredTool[] {
  if (!allowedNames || allowedNames.length === 0) {
    return [];
  }

  const entries = allowedNames.map((name) => ({
    raw: name,
    lower: name.toLowerCase(),
    lowerUnderscore: name.toLowerCase().replace(/-/g, '_'),
    matched: false,
  }));

  const filtered: DiscoveredTool[] = [];

  for (const tool of tools) {
    const normalizedName = normalizeExportName(tool.name);
    const snake = mlldNameToMCPName(normalizedName);
    const candidates = [
      normalizedName.toLowerCase(),
      snake.toLowerCase(),
      snake.toLowerCase().replace(/_/g, '-'),
    ];

    const entry = entries.find((item) =>
      candidates.includes(item.lower) || candidates.includes(item.lowerUnderscore)
    );

    if (entry) {
      entry.matched = true;
      filtered.push(tool);
    }
  }

  const unmatched = entries.filter((entry) => !entry.matched);
  if (unmatched.length > 0) {
    console.error(`Ignoring unknown tool(s) from ${sourceLabel}: ${unmatched.map((entry) => entry.raw).join(', ')}`);
  }

  return filtered;
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

  let environment: Environment | null = null;

  await interpret(content, {
    fileSystem,
    pathService,
    pathContext,
    filePath: modulePath,
    format: 'markdown',
    normalizeBlankLines: true,
    captureEnvironment: env => {
      environment = env;
    }
  });

  if (!environment) {
    throw new Error(`Failed to capture environment for module: ${modulePath}`);
  }

  const exportedFunctions = extractExportedFunctions(environment, modulePath, content);

  return {
    path: modulePath,
    environment,
    exports: exportedFunctions,
  };
}

function extractExportedFunctions(
  environment: Environment,
  modulePath: string,
  source: string
): Map<string, ExecutableVariable> {
  const exported = new Map<string, ExecutableVariable>();
  const manifest = environment.getExportManifest();
  const moduleEnvSnapshot = environment.captureModuleEnvironment();

  if (manifest && manifest.hasEntries()) {
    for (const rawName of manifest.getNames()) {
      const normalizedName = normalizeExportName(rawName);
      const variable = environment.getVariable(normalizedName);
      if (variable && variable.type === 'executable' && !isBuiltinExecutable(variable as ExecutableVariable)) {
        attachModuleEnvironment(variable as ExecutableVariable, moduleEnvSnapshot);
        exported.set(normalizedName, variable as ExecutableVariable);
      }
    }
    if (exported.size > 0) {
      return exported;
    }
  }

  const parsedNames = parseExportedNamesFromSource(source);
  if (parsedNames.length > 0) {
    for (const rawName of parsedNames) {
      const normalizedName = normalizeExportName(rawName);
      const variable = environment.getVariable(normalizedName);
      if (variable && variable.type === 'executable' && !isBuiltinExecutable(variable as ExecutableVariable)) {
        attachModuleEnvironment(variable as ExecutableVariable, moduleEnvSnapshot);
        exported.set(normalizedName, variable as ExecutableVariable);
      }
    }

    if (exported.size > 0) {
      return exported;
    }

    console.error(`    Warning: /export directive found in ${modulePath} but no matching executables located`);
  }

  console.error(`    No /export directive in ${modulePath}, exporting all executables`);
  for (const [name, variable] of environment.getAllVariables()) {
    if (variable.type === 'executable' && !isBuiltinExecutable(variable as ExecutableVariable)) {
      attachModuleEnvironment(variable as ExecutableVariable, moduleEnvSnapshot);
      exported.set(name, variable as ExecutableVariable);
    }
  }

  return exported;
}

function normalizeExportName(name: string): string {
  return name.startsWith('@') ? name.slice(1) : name;
}

function isBuiltinExecutable(variable: ExecutableVariable): boolean {
  const internal = variable.internal;
  if (!internal) return false;
  return Boolean(internal.isSystem || internal.isBuiltinTransformer);
}

function parseExportedNamesFromSource(source: string): string[] {
  const exportRegex = /\/export\s*\{([^}]*)\}/g;
  const names = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = exportRegex.exec(source)) !== null) {
    const body = match[1];
    const parts = body.split(',');
    for (const part of parts) {
      let token = part.trim();
      if (!token) {
        continue;
      }

      const aliasIndex = token.toLowerCase().indexOf(' as ');
      if (aliasIndex !== -1) {
        token = token.slice(0, aliasIndex).trim();
      }

      token = normalizeExportName(token);
      if (token) {
        names.add(token);
      }
    }
  }

  return Array.from(names);
}

function attachModuleEnvironment(
  variable: ExecutableVariable,
  moduleEnv: Map<string, Variable>
): void {
  if (!variable.internal) {
    variable.internal = {};
  }

  if (!variable.internal.capturedModuleEnv) {
    variable.internal.capturedModuleEnv = moduleEnv;
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function parseEnvOverrides(value?: string): Record<string, string> {
  if (!value) {
    return {};
  }

  const overrides: Record<string, string> = {};
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);

  for (const part of parts) {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) {
      console.error(`Ignoring invalid --env entry (expected KEY=VALUE): ${part}`);
      continue;
    }
    const key = part.slice(0, eqIndex).trim();
    const val = part.slice(eqIndex + 1).trim();
    if (!key) {
      console.error('Ignoring --env entry with empty key');
      continue;
    }
    overrides[key] = val;
  }

  return overrides;
}

function applyEnvironmentOverrides(overrides: Record<string, string>, source: string): string[] {
  const applied: string[] = [];
  for (const [key, value] of Object.entries(overrides)) {
    if (!key.startsWith('MLLD_')) {
      console.error(`Skipping ${source} environment variable '${key}' (must start with MLLD_)`);
      continue;
    }
    process.env[key] = value;
    applied.push(key);
  }
  return applied;
}

function parseToolsList(value?: string): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const tools = value
    .split(',')
    .map((tool) => tool.trim())
    .filter(Boolean);

  return tools.length > 0 ? tools : [];
}

function normalizeVarName(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}

function getStringFlag(flags: Record<string, unknown>, key: string): string | undefined {
  const value = flags?.[key];
  if (typeof value === 'string') {
    return value;
  }
  if (value === true) {
    console.error(`Flag --${key} requires a value`);
    process.exit(1);
  }
  return undefined;
}

function filterExportedFunctions(
  exportedFunctions: Map<string, ExecutableVariable>,
  allowedNames: string[],
  sourceLabel: string
): void {
  if (!allowedNames || allowedNames.length === 0) {
    exportedFunctions.clear();
    return;
  }

  const entries = allowedNames.map((name) => ({
    raw: name,
    lower: name.toLowerCase(),
    lowerUnderscore: name.toLowerCase().replace(/-/g, '_'),
    matched: false,
  }));

  for (const [name] of Array.from(exportedFunctions.entries())) {
    const snake = mlldNameToMCPName(name);
    const candidates = [
      name.toLowerCase(),
      snake.toLowerCase(),
      snake.toLowerCase().replace(/_/g, '-'),
    ];

    const entry = entries.find((item) =>
      candidates.includes(item.lower) || candidates.includes(item.lowerUnderscore)
    );

    if (entry) {
      entry.matched = true;
      continue;
    }

    exportedFunctions.delete(name);
  }

  const unmatched = entries.filter((entry) => !entry.matched);
  if (unmatched.length > 0) {
    console.error(`Ignoring unknown tool(s) from ${sourceLabel}: ${unmatched.map((entry) => entry.raw).join(', ')}`);
  }
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
