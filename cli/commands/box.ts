import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import { randomUUID } from 'crypto';
import type { ModuleManifest } from '@core/registry/types';
import { getKeychainProvider } from '@core/resolvers/builtin/KeychainResolver';
import { interpret } from '@interpreter/index';
import type { Environment } from '@interpreter/env/Environment';
import { evaluateExecInvocation } from '@interpreter/eval/exec-invocation';
import type { ExecInvocation, TextNode, VariableReferenceNode } from '@core/types';
import type { ExecutableVariable, Variable } from '@core/types/variable';
import { isExecutableVariable } from '@core/types/variable';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { PathContextBuilder } from '@core/services/PathContextService';
import { MCPOrchestrator, type McpConfig } from '../mcp/MCPOrchestrator';
import { asData, isStructuredValue, looksLikeJsonString } from '@interpreter/utils/structured-value';
import {
  getAgentDefinition,
  getDefaultAgentType,
  listAgentTypes,
  pullAgentRegistryModules,
  type AgentType
} from './box-agent-registry';

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

class BoxModuleTypeError extends Error {
  readonly entries: Array<{ path: string; type?: string | null }>;

  constructor(name: string, entries: Array<{ path: string; type?: string | null }>) {
    super(`Module '${name}' is not an environment module.`);
    this.name = 'BoxModuleTypeError';
    this.entries = entries;
  }
}

interface BoxModuleLocation {
  name: string;
  path: string;
  manifest: ModuleManifest;
  scope: 'local' | 'global';
}

interface LoadedBoxModule extends BoxModuleLocation {
  entryPath: string;
  source: string;
  environment: Environment;
  exports: Map<string, ExecutableVariable>;
}

function validateBoxName(name: string): string | null {
  if (!name) {
    return 'Environment name required';
  }
  if (name.includes('/') || name.includes('\\')) {
    return 'Environment name cannot contain path separators';
  }
  if (name.includes('..')) {
    return 'Environment name cannot contain ".."';
  }
  if (name.startsWith('.')) {
    return 'Environment name cannot start with "."';
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return 'Environment name can only contain letters, numbers, dashes, and underscores';
  }
  return null;
}

function assertValidBoxName(name: string): void {
  const error = validateBoxName(name);
  if (!error) {
    return;
  }
  console.error(chalk.red(`Error: ${error}`));
  process.exit(1);
}

async function loadManifest(manifestPath: string): Promise<ModuleManifest | null> {
  try {
    const manifestContent = await fs.readFile(manifestPath, 'utf-8');
    const manifest = yaml.load(manifestContent) as Partial<ModuleManifest> | null;
    if (!manifest || typeof manifest !== 'object') {
      return null;
    }
    return manifest as ModuleManifest;
  } catch {
    return null;
  }
}

async function findBoxModule(name: string): Promise<BoxModuleLocation | null> {
  const localPath = path.join(process.cwd(), '.llm/box', name);
  const globalPath = path.join(os.homedir(), '.llm/box', name);
  const candidates: Array<{ path: string; scope: 'local' | 'global' }> = [
    { path: localPath, scope: 'local' },
    { path: globalPath, scope: 'global' }
  ];
  const wrongType: Array<{ path: string; type?: string | null }> = [];

  for (const candidate of candidates) {
    const manifestPath = path.join(candidate.path, 'module.yml');
    if (!(await exists(manifestPath))) {
      continue;
    }
    const manifest = await loadManifest(manifestPath);
    if (manifest?.type === 'environment') {
      return {
        name,
        path: candidate.path,
        manifest,
        scope: candidate.scope
      };
    }
    wrongType.push({ path: candidate.path, type: manifest?.type });
  }

  if (wrongType.length > 0) {
    throw new BoxModuleTypeError(name, wrongType);
  }

  return null;
}

function getKeychainProviderOrExit() {
  try {
    return getKeychainProvider();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Keychain unavailable';
    console.error(chalk.red(message));
    process.exit(1);
  }
}

function normalizeExportName(name: string): string {
  return name.startsWith('@') ? name.slice(1) : name;
}

export function extractPromptFromArgs(args: string[]): string {
  if (args.length === 0) {
    return '';
  }
  if (args.length === 1) {
    return args[0];
  }
  // Look for -p or --prompt flag pattern (e.g., "claude -p prompt" or "claude --prompt prompt")
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '-p' || args[i] === '--prompt') && i + 1 < args.length) {
      return args[i + 1];
    }
  }
  // No prompt flag found - join all args as the prompt
  return args.join(' ');
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

function buildExecInvocation(
  name: string,
  args: string[]
): ExecInvocation {
  const location = {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 }
  };

  const identifierNode: VariableReferenceNode = {
    type: 'VariableReference',
    nodeId: randomUUID(),
    location,
    identifier: name,
    valueType: 'varIdentifier'
  } as VariableReferenceNode;

  const argNodes: TextNode[] = args.map(arg => ({
    type: 'Text',
    nodeId: randomUUID(),
    location,
    content: arg
  })) as TextNode[];

  const commandRef = {
    type: 'CommandReference',
    nodeId: randomUUID(),
    location,
    identifier: [identifierNode],
    name,
    args: argNodes
  };

  return {
    type: 'ExecInvocation',
    nodeId: randomUUID(),
    location,
    commandRef
  } as ExecInvocation;
}

async function loadEnvironmentModule(location: BoxModuleLocation): Promise<LoadedBoxModule> {
  const entryName = location.manifest.entry || 'index.mld';
  const entryPath = path.join(location.path, entryName);

  if (!(await exists(entryPath))) {
    throw new Error(`Environment entry not found: ${entryPath}`);
  }

  const fileSystem = new NodeFileSystem();
  const pathService = new PathService();
  const source = await fs.readFile(entryPath, 'utf8');
  const pathContext = await PathContextBuilder.fromFile(entryPath, fileSystem, {
    invocationDirectory: process.cwd()
  });

  let environment: Environment | null = null;

  await interpret(source, {
    fileSystem,
    pathService,
    pathContext,
    filePath: entryPath,
    format: 'markdown',
    normalizeBlankLines: true,
    approveAllImports: true,
    captureEnvironment: env => {
      environment = env;
    }
  });

  if (!environment) {
    throw new Error(`Failed to capture environment for module: ${entryPath}`);
  }

  const exports = new Map<string, ExecutableVariable>();
  const manifest = environment.getExportManifest();
  const moduleEnvSnapshot = environment.captureModuleEnvironment();

  if (manifest && manifest.hasEntries()) {
    for (const rawName of manifest.getNames()) {
      const normalizedName = normalizeExportName(rawName);
      const variable = environment.getVariable(normalizedName);
      if (variable && isExecutableVariable(variable) && !isBuiltinExecutable(variable)) {
        attachModuleEnvironment(variable, moduleEnvSnapshot);
        exports.set(normalizedName, variable);
      }
    }
  }

  if (exports.size === 0) {
    const parsedNames = parseExportedNamesFromSource(source);
    for (const rawName of parsedNames) {
      const normalizedName = normalizeExportName(rawName);
      const variable = environment.getVariable(normalizedName);
      if (variable && isExecutableVariable(variable) && !isBuiltinExecutable(variable)) {
        attachModuleEnvironment(variable, moduleEnvSnapshot);
        exports.set(normalizedName, variable);
      }
    }
  }

  return {
    ...location,
    entryPath,
    source,
    environment,
    exports
  };
}

async function executeBoxExport(
  module: LoadedBoxModule,
  name: string,
  args: string[]
) {
  const execVar = module.exports.get(name);
  if (!execVar) {
    return null;
  }
  const invocation = buildExecInvocation(name, args);
  return evaluateExecInvocation(invocation, module.environment);
}

function parseMcpConfigResult(result: unknown): McpConfig | null {
  if (!result || typeof result !== 'object') {
    return null;
  }
  const value = (result as { value?: unknown }).value;
  if (value === undefined || value === null) {
    return null;
  }

  let raw: unknown = value;
  if (isStructuredValue(raw)) {
    raw = asData(raw);
  }
  if (typeof raw === 'string') {
    if (!looksLikeJsonString(raw)) {
      throw new Error('mcpConfig output is not valid JSON');
    }
    raw = JSON.parse(raw);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('mcpConfig output must be an object');
  }
  if ('servers' in (raw as Record<string, unknown>)) {
    const servers = (raw as Record<string, unknown>).servers;
    if (servers !== undefined && !Array.isArray(servers)) {
      throw new Error('mcpConfig.servers must be an array');
    }
  }
  return raw as McpConfig;
}

function applyProcessEnv(env: Record<string, string>): () => void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  return () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

interface BoxInfo {
  name: string;
  about?: string;
  version?: string;
  path: string;
}

export interface BoxCommandOptions {
  _: string[]; // Subcommand and arguments
  cwd?: string;
}

export async function boxCommand(options: BoxCommandOptions): Promise<void> {
  const subcommand = options._[0];
  const subArgs = options._.slice(1);

  switch (subcommand) {
    case 'list':
    case 'ls':
      return listBoxCommand(subArgs);

    case 'capture':
      return captureBoxCommand(subArgs);

    case 'spawn':
      return spawnBoxCommand(subArgs);

    case 'shell':
      return shellBoxCommand(subArgs);

    case 'export':
    case 'import':
      console.error(chalk.yellow(`'mlld box ${subcommand}' coming in v1.1`));
      process.exit(1);

    default:
      printBoxHelp();
      process.exit(subcommand ? 1 : 0);
  }
}

async function listBoxCommand(args: string[]): Promise<void> {
  const isJson = args.includes('--json');

  const localPath = path.join(process.cwd(), '.llm/box');
  const globalPath = path.join(os.homedir(), '.llm/box');

  const localEnvs = await scanBoxDir(localPath);
  const globalEnvs = await scanBoxDir(globalPath);

  if (isJson) {
    console.log(JSON.stringify({
      local: localEnvs.map(e => ({ name: e.name, about: e.about, version: e.version, path: e.path })),
      global: globalEnvs.map(e => ({ name: e.name, about: e.about, version: e.version, path: e.path }))
    }, null, 2));
    return;
  }

  console.log(chalk.bold('Available environments:\n'));

  if (localEnvs.length > 0) {
    console.log(chalk.cyan(`Local (${localPath}):`));
    for (const env of localEnvs) {
      const about = env.about ? chalk.gray(` - ${env.about}`) : '';
      console.log(`  ${env.name.padEnd(20)} ${env.version || ''}${about}`);
    }
    console.log();
  }

  if (globalEnvs.length > 0) {
    console.log(chalk.cyan(`Global (${globalPath}):`));
    for (const env of globalEnvs) {
      const about = env.about ? chalk.gray(` - ${env.about}`) : '';
      console.log(`  ${env.name.padEnd(20)} ${env.version || ''}${about}`);
    }
    console.log();
  }

  const total = localEnvs.length + globalEnvs.length;
  if (total === 0) {
    console.log(chalk.gray('No environment modules found.'));
    console.log(chalk.gray('Use `mlld box capture <name>` to create one from your agent config.'));
  } else {
    console.log(chalk.gray(`(${total} environment${total !== 1 ? 's' : ''} total)`));
  }
}

async function scanBoxDir(dirPath: string): Promise<BoxInfo[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const envs: BoxInfo[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const envPath = path.join(dirPath, entry.name);
      const manifestPath = path.join(envPath, 'module.yml');

      try {
        const manifestContent = await fs.readFile(manifestPath, 'utf-8');
        const manifest = yaml.load(manifestContent) as Partial<ModuleManifest>;

        if (manifest && manifest.type === 'environment') {
          envs.push({
            name: manifest.name || entry.name,
            about: manifest.about,
            version: manifest.version,
            path: envPath
          });
        }
      } catch {
        // Skip invalid modules
      }
    }

    return envs.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

type AgentSourceScope = 'local' | 'global';

interface DiscoveredAgentSource {
  agentType: AgentType;
  sourceDir: string;
  sourceScope: AgentSourceScope;
}

function parseAgentFlag(args: string[]): AgentType | null {
  if (args.includes('--codex')) {
    return 'codex';
  }
  if (args.includes('--claude')) {
    return 'claude';
  }
  return null;
}

function getAgentSourceDir(agentType: AgentType, scope: AgentSourceScope): string {
  const definition = getAgentDefinition(agentType);
  const baseDir = scope === 'local' ? process.cwd() : os.homedir();
  return path.join(baseDir, definition.configDirName);
}

async function discoverAgentSource(
  explicitAgentType: AgentType | null,
  useLocal: boolean
): Promise<DiscoveredAgentSource> {
  const scopes: AgentSourceScope[] = useLocal ? ['local'] : ['global', 'local'];

  if (explicitAgentType) {
    for (const scope of scopes) {
      const sourceDir = getAgentSourceDir(explicitAgentType, scope);
      if (await exists(sourceDir)) {
        return { agentType: explicitAgentType, sourceDir, sourceScope: scope };
      }
    }
    const definition = getAgentDefinition(explicitAgentType);
    const expected = scopes.map(scope => getAgentSourceDir(explicitAgentType, scope)).join(' or ');
    throw new Error(`${definition.displayName} config not found at ${expected}`);
  }

  for (const scope of scopes) {
    const available: DiscoveredAgentSource[] = [];
    for (const candidate of listAgentTypes()) {
      const sourceDir = getAgentSourceDir(candidate, scope);
      if (await exists(sourceDir)) {
        available.push({ agentType: candidate, sourceDir, sourceScope: scope });
      }
    }

    if (available.length === 1) {
      return available[0];
    }
    if (available.length > 1) {
      return available.find(agent => agent.agentType === getDefaultAgentType()) || available[0];
    }
  }

  const expectedPaths = listAgentTypes()
    .map(type => `${getAgentDefinition(type).displayName}: ${getAgentSourceDir(type, useLocal ? 'local' : 'global')}`)
    .join('; ');
  throw new Error(`No supported agent configuration found. Expected one of: ${expectedPaths}`);
}

function readNestedStringValue(value: unknown, pathParts: string[]): string | null {
  let current: unknown = value;
  for (const part of pathParts) {
    if (!current || typeof current !== 'object' || !(part in (current as Record<string, unknown>))) {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' && current.trim().length > 0 ? current : null;
}

function extractTokenFromCredentials(rawValue: unknown, paths: string[]): string | null {
  for (const tokenPath of paths) {
    const token = readNestedStringValue(rawValue, tokenPath.split('.'));
    if (token) {
      return token;
    }
  }
  return null;
}

async function runAuthSetup(
  sourceDir: string,
  boxName: string,
  agentType: AgentType
): Promise<boolean> {
  const definition = getAgentDefinition(agentType);
  const credsPath = path.join(sourceDir, '.credentials.json');
  if (!(await exists(credsPath))) {
    return false;
  }

  try {
    const credsContent = await fs.readFile(credsPath, 'utf-8');
    const creds = JSON.parse(credsContent);
    const token = extractTokenFromCredentials(creds, definition.credentialTokenPaths);
    if (!token) {
      return false;
    }
    const keychain = getKeychainProviderOrExit();
    await keychain.set('mlld-box', boxName, token);
    return true;
  } catch {
    return false;
  }
}

async function pullAgentModules(targetDir: string, agentType: AgentType): Promise<string[]> {
  const modules = pullAgentRegistryModules(agentType);
  for (const pulledModule of modules) {
    const absolutePath = path.join(targetDir, pulledModule.relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, pulledModule.source, 'utf8');
  }
  return modules.map(module => module.ref);
}

async function captureBoxCommand(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error(chalk.red('Error: Environment name required'));
    console.error('Usage: mlld box capture <name> [--local] [--global] [--codex|--claude]');
    process.exit(1);
  }
  assertValidBoxName(name);

  const useLocal = args.includes('--local');
  const storeGlobal = args.includes('--global');
  const explicitAgentType = parseAgentFlag(args);

  let discovered: DiscoveredAgentSource;
  try {
    discovered = await discoverAgentSource(explicitAgentType, useLocal);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent configuration discovery failed';
    console.error(chalk.red(`Error: ${message}`));
    if (!explicitAgentType) {
      console.error(chalk.gray('Tip: pass --claude or --codex to select an agent explicitly.'));
    }
    process.exit(1);
    return;
  }

  const { agentType, sourceDir, sourceScope } = discovered;
  const agent = getAgentDefinition(agentType);

  const targetDir = storeGlobal
    ? path.join(os.homedir(), '.llm/box', name)
    : path.join(process.cwd(), '.llm/box', name);

  // Check if environment already exists
  if (await exists(path.join(targetDir, 'module.yml'))) {
    console.error(chalk.red(`Error: Environment '${name}' already exists at ${targetDir}`));
    console.error(chalk.gray('Delete the existing environment first or choose a different name.'));
    process.exit(1);
  }

  await fs.mkdir(path.join(targetDir, agent.configDirName), { recursive: true });

  const pulledModuleRefs = await pullAgentModules(targetDir, agentType);
  console.log(chalk.green(`✓ Pulled ${agent.registryModule} module templates`));

  const tokenStored = await runAuthSetup(sourceDir, name, agentType);
  if (!tokenStored) {
    console.log(chalk.yellow('⚠ No token found - you may need to add credentials manually'));
  } else {
    console.log(chalk.green(`✓ Auth configured for ${agent.displayName}`));
  }

  // Copy config files (NOT credentials)
  const filesToCopy = ['settings.json', 'CLAUDE.md', 'AGENTS.md', 'hooks.json'];
  for (const file of filesToCopy) {
    const src = path.join(sourceDir, file);
    if (await exists(src)) {
      await fs.copyFile(src, path.join(targetDir, agent.configDirName, file));
      console.log(chalk.green(`✓ Copied ${file}`));
    }
  }

  // Copy skills directory if it exists
  const skillsDir = path.join(sourceDir, 'skills');
  if (await exists(skillsDir)) {
    await copyDir(skillsDir, path.join(targetDir, agent.configDirName, 'skills'));
    console.log(chalk.green('✓ Copied skills/'));
  }

  // Generate module.yml
  const aboutSource = sourceScope === 'local'
    ? `${agent.configDirName} (local)`
    : `~/${agent.configDirName}`;
  const moduleYml = `name: ${name}
type: environment
about: "Box generated from ${agent.registryModule} using ${aboutSource}"
version: 1.0.0
entry: index.mld
`;
  await fs.writeFile(path.join(targetDir, 'module.yml'), moduleYml);
  console.log(chalk.green('✓ Created module.yml'));

  // Generate index.mld
  const indexMld = `>> Generated by mlld box capture
>> Pulled module: ${agent.registryModule}
/import { @setup, @configureAuth as @agentConfigureAuth, @spawn as @agentSpawn, @shell as @agentShell, @mcpConfig } from "./agents/${agentType}.mld"

/var @boxName = "${name}"
/var @configDir = "@fm.dir/${agent.configDirName}"
/var @registryModule = "${agent.registryModule}"
/var @tokenEnvVar = "${agent.tokenEnvVar}"

/exe @configureAuth() = @agentConfigureAuth(@boxName)
/exe @spawn(prompt) = @agentSpawn(@boxName, @prompt, @configDir)
/exe @shell() = @agentShell(@boxName, @configDir)

/export { @setup, @configureAuth, @spawn, @shell, @mcpConfig }
`;
  await fs.writeFile(path.join(targetDir, 'index.mld'), indexMld);
  console.log(chalk.green('✓ Created index.mld'));

  console.log();
  console.log(chalk.bold.green(`✓ Created environment: ${name}`));
  console.log(chalk.gray(`  Source: ${sourceDir}`));
  console.log(chalk.gray(`  Location: ${targetDir}`));
  console.log(chalk.gray(`  Agent: ${agent.displayName}`));
  console.log(chalk.gray(`  Registry modules: ${pulledModuleRefs.join(', ')}`));
  console.log();
  console.log(chalk.gray('Usage:'));
  console.log(chalk.gray(`  mlld box spawn ${name} -- "Your prompt"`));
  console.log(chalk.gray(`  mlld box shell ${name}`));
}

async function spawnBoxCommand(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error(chalk.red('Error: Environment name required'));
    console.error('Usage: mlld box spawn <name> -- <prompt>');
    process.exit(1);
  }
  assertValidBoxName(name);

  // Check for -- separator
  const separatorIndex = args.indexOf('--');
  if (separatorIndex === -1 || separatorIndex === args.length - 1) {
    console.error(chalk.red('Error: Prompt required after --'));
    console.error('Usage: mlld box spawn <name> -- <prompt>');
    process.exit(1);
  }

  const commandArgs = args.slice(separatorIndex + 1);

  // Extract prompt from command args
  // Handles: "prompt", prompt, or command -p "prompt" / command --prompt "prompt"
  const prompt = extractPromptFromArgs(commandArgs);

  // Find environment
  let envLocation: BoxModuleLocation | null = null;
  try {
    envLocation = await findBoxModule(name);
  } catch (error) {
    if (error instanceof BoxModuleTypeError) {
      console.error(chalk.red(`Error: Module '${name}' is not an environment module.`));
      for (const entry of error.entries) {
        console.error(chalk.gray(`- ${entry.path} (type: ${entry.type ?? 'unknown'})`));
      }
      process.exit(1);
    }
    throw error;
  }
  if (!envLocation) {
    console.error(chalk.red(`Error: Environment '${name}' not found`));
    console.error(chalk.gray('Run `mlld box list` to see available environments.'));
    console.error(chalk.gray(`Or create one with: mlld box capture ${name}`));
    process.exit(1);
  }

  const loaded = await loadEnvironmentModule(envLocation);
  const orchestrator = new MCPOrchestrator({ environment: loaded.environment });
  let restoreEnv = () => {};
  let exitCode = 0;

  try {
    const mcpResult = await executeBoxExport(loaded, 'mcpConfig', []);
    const mcpConfig = parseMcpConfigResult(mcpResult);
    if (mcpConfig) {
      const connection = await orchestrator.start(mcpConfig);
      if (connection?.env) {
        restoreEnv = applyProcessEnv(connection.env);
      }
    }

    const spawnResult = await executeBoxExport(loaded, 'spawn', [prompt]);
    if (!spawnResult) {
      console.error(chalk.red(`Error: Environment '${name}' does not export @spawn`));
      exitCode = 1;
      return;
    }
    exitCode = spawnResult.exitCode || 0;
  } finally {
    restoreEnv();
    await orchestrator.cleanup();
  }

  process.exit(exitCode);
}

async function shellBoxCommand(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error(chalk.red('Error: Environment name required'));
    console.error('Usage: mlld box shell <name>');
    process.exit(1);
  }
  assertValidBoxName(name);

  // Find environment
  let envLocation: BoxModuleLocation | null = null;
  try {
    envLocation = await findBoxModule(name);
  } catch (error) {
    if (error instanceof BoxModuleTypeError) {
      console.error(chalk.red(`Error: Module '${name}' is not an environment module.`));
      for (const entry of error.entries) {
        console.error(chalk.gray(`- ${entry.path} (type: ${entry.type ?? 'unknown'})`));
      }
      process.exit(1);
    }
    throw error;
  }
  if (!envLocation) {
    console.error(chalk.red(`Error: Environment '${name}' not found`));
    console.error(chalk.gray('Run `mlld box list` to see available environments.'));
    console.error(chalk.gray(`Or create one with: mlld box capture ${name}`));
    process.exit(1);
  }

  const loaded = await loadEnvironmentModule(envLocation);
  const orchestrator = new MCPOrchestrator({ environment: loaded.environment });
  let restoreEnv = () => {};
  let exitCode = 0;

  try {
    const mcpResult = await executeBoxExport(loaded, 'mcpConfig', []);
    const mcpConfig = parseMcpConfigResult(mcpResult);
    if (mcpConfig) {
      const connection = await orchestrator.start(mcpConfig);
      if (connection?.env) {
        restoreEnv = applyProcessEnv(connection.env);
      }
    }

    const shellResult = await executeBoxExport(loaded, 'shell', []);
    if (!shellResult) {
      console.error(chalk.red(`Error: Environment '${name}' does not export @shell`));
      exitCode = 1;
      return;
    }
    exitCode = shellResult.exitCode || 0;
  } finally {
    restoreEnv();
    await orchestrator.cleanup();
  }

  process.exit(exitCode);
}

function printBoxHelp(): void {
  console.log(`
${chalk.bold('mlld box')} - Manage AI agent environments

${chalk.bold('Usage:')} mlld box <command> [options]

${chalk.bold('Commands:')}
  list              List available environments
  capture <name>    Pull agent module + generate local box
  spawn <name> -- <prompt>    Run agent with prompt
  shell <name>      Start interactive session

${chalk.bold('Capture options:')}
  --local           Read agent config from current project first
  --claude          Force Claude capture
  --codex           Force Codex capture
  --global          Store environment in ~/.llm/box/ instead of .llm/box/

${chalk.bold('Examples:')}
  mlld box capture claude-dev
  mlld box capture project-env --local
  mlld box capture codex-env --codex
  mlld box list
  mlld box spawn claude-dev -- "Fix the bug in main.ts"
  mlld box shell claude-dev

${chalk.gray('Environment modules package credentials, configuration,')}
${chalk.gray('MCP tools, and security policy for AI agents.')}
`.trim());
}
