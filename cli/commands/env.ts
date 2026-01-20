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

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

class EnvModuleTypeError extends Error {
  readonly entries: Array<{ path: string; type?: string | null }>;

  constructor(name: string, entries: Array<{ path: string; type?: string | null }>) {
    super(`Module '${name}' is not an environment module.`);
    this.name = 'EnvModuleTypeError';
    this.entries = entries;
  }
}

interface EnvModuleLocation {
  name: string;
  path: string;
  manifest: ModuleManifest;
  scope: 'local' | 'global';
}

interface LoadedEnvModule extends EnvModuleLocation {
  entryPath: string;
  source: string;
  environment: Environment;
  exports: Map<string, ExecutableVariable>;
}

function validateEnvName(name: string): string | null {
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

function assertValidEnvName(name: string): void {
  const error = validateEnvName(name);
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

async function findEnvModule(name: string): Promise<EnvModuleLocation | null> {
  const localPath = path.join(process.cwd(), '.mlld/env', name);
  const globalPath = path.join(os.homedir(), '.mlld/env', name);
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
    throw new EnvModuleTypeError(name, wrongType);
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

async function loadEnvironmentModule(location: EnvModuleLocation): Promise<LoadedEnvModule> {
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

async function executeEnvExport(
  module: LoadedEnvModule,
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

interface EnvInfo {
  name: string;
  about?: string;
  version?: string;
  path: string;
}

export interface EnvCommandOptions {
  _: string[]; // Subcommand and arguments
  cwd?: string;
}

export async function envCommand(options: EnvCommandOptions): Promise<void> {
  const subcommand = options._[0];
  const subArgs = options._.slice(1);

  switch (subcommand) {
    case 'list':
    case 'ls':
      return listEnvCommand(subArgs);

    case 'capture':
      return captureEnvCommand(subArgs);

    case 'spawn':
      return spawnEnvCommand(subArgs);

    case 'shell':
      return shellEnvCommand(subArgs);

    case 'export':
    case 'import':
      console.error(chalk.yellow(`'mlld env ${subcommand}' coming in v1.1`));
      process.exit(1);

    default:
      printEnvHelp();
      process.exit(subcommand ? 1 : 0);
  }
}

async function listEnvCommand(args: string[]): Promise<void> {
  const isJson = args.includes('--json');

  const localPath = path.join(process.cwd(), '.mlld/env');
  const globalPath = path.join(os.homedir(), '.mlld/env');

  const localEnvs = await scanEnvDir(localPath);
  const globalEnvs = await scanEnvDir(globalPath);

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
    console.log(chalk.gray('Use `mlld env capture <name>` to create one from ~/.claude config.'));
  } else {
    console.log(chalk.gray(`(${total} environment${total !== 1 ? 's' : ''} total)`));
  }
}

async function scanEnvDir(dirPath: string): Promise<EnvInfo[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const envs: EnvInfo[] = [];

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

async function captureEnvCommand(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error(chalk.red('Error: Environment name required'));
    console.error('Usage: mlld env capture <name>');
    process.exit(1);
  }
  assertValidEnvName(name);

  const isGlobal = args.includes('--global');
  const claudeDir = path.join(os.homedir(), '.claude');
  const targetDir = isGlobal
    ? path.join(os.homedir(), '.mlld/env', name)
    : path.join(process.cwd(), '.mlld/env', name);

  // Check source exists
  if (!await exists(claudeDir)) {
    console.error(chalk.red('Error: Claude config not found at ~/.claude/'));
    console.error(chalk.gray('Make sure Claude Code is installed and configured.'));
    process.exit(1);
  }

  // Check if environment already exists
  if (await exists(path.join(targetDir, 'module.yml'))) {
    console.error(chalk.red(`Error: Environment '${name}' already exists at ${targetDir}`));
    console.error(chalk.gray('Delete the existing environment first or choose a different name.'));
    process.exit(1);
  }

  // Create directories
  await fs.mkdir(path.join(targetDir, '.claude'), { recursive: true });

  // Extract and store token
  const credsPath = path.join(claudeDir, '.credentials.json');
  let tokenStored = false;
  if (await exists(credsPath)) {
    try {
      const credsContent = await fs.readFile(credsPath, 'utf-8');
      const creds = JSON.parse(credsContent);
      const token = creds.oauth_token || creds.token;
      if (token) {
        const keychain = getKeychainProviderOrExit();
        await keychain.set('mlld-env', name, token);
        console.log(chalk.green('✓ Token stored in keychain'));
        tokenStored = true;
      }
    } catch (error) {
      console.error(chalk.yellow('Warning: Could not extract token from credentials'));
    }
  }

  if (!tokenStored) {
    console.log(chalk.yellow('⚠ No token found - you may need to add credentials manually'));
  }

  // Copy config files (NOT credentials)
  const filesToCopy = ['settings.json', 'CLAUDE.md', 'hooks.json'];
  for (const file of filesToCopy) {
    const src = path.join(claudeDir, file);
    if (await exists(src)) {
      await fs.copyFile(src, path.join(targetDir, '.claude', file));
      console.log(chalk.green(`✓ Copied ${file}`));
    }
  }

  // Generate module.yml
  const moduleYml = `name: ${name}
type: environment
about: "Environment captured from ~/.claude"
version: 1.0.0
entry: index.mld
`;
  await fs.writeFile(path.join(targetDir, 'module.yml'), moduleYml);
  console.log(chalk.green('✓ Created module.yml'));

  // Generate index.mld
  const indexMld = `/needs { cmd: [claude] }
/policy @env = {
  auth: {
    claude: { from: "keychain:mlld-env/${name}", as: "CLAUDE_CODE_OAUTH_TOKEN" }
  },
  capabilities: {
    danger: ["@keychain"]
  }
}

/exe @spawn(prompt) = run { \\
  CLAUDE_CONFIG_DIR=@fm.dir/.claude \\
  claude -p @prompt
} using auth:claude

/exe @shell() = run { \\
  CLAUDE_CONFIG_DIR=@fm.dir/.claude \\
  claude
} using auth:claude

/export { @spawn, @shell }
`;
  await fs.writeFile(path.join(targetDir, 'index.mld'), indexMld);
  console.log(chalk.green('✓ Created index.mld'));

  console.log();
  console.log(chalk.bold.green(`✓ Created environment: ${name}`));
  console.log(chalk.gray(`  Location: ${targetDir}`));
  console.log();
  console.log(chalk.gray('Usage:'));
  console.log(chalk.gray(`  mlld env spawn ${name} -- claude -p "Your prompt"`));
  console.log(chalk.gray(`  mlld env shell ${name}`));
}

async function spawnEnvCommand(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error(chalk.red('Error: Environment name required'));
    console.error('Usage: mlld env spawn <name> -- <command>');
    process.exit(1);
  }
  assertValidEnvName(name);

  // Check for -- separator
  const separatorIndex = args.indexOf('--');
  if (separatorIndex === -1 || separatorIndex === args.length - 1) {
    console.error(chalk.red('Error: Command required after --'));
    console.error('Usage: mlld env spawn <name> -- <command>');
    process.exit(1);
  }

  const command = args.slice(separatorIndex + 1);

  // Find environment
  let envLocation: EnvModuleLocation | null = null;
  try {
    envLocation = await findEnvModule(name);
  } catch (error) {
    if (error instanceof EnvModuleTypeError) {
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
    console.error(chalk.gray('Run `mlld env list` to see available environments.'));
    console.error(chalk.gray(`Or create one with: mlld env capture ${name}`));
    process.exit(1);
  }

  const loaded = await loadEnvironmentModule(envLocation);
  const orchestrator = new MCPOrchestrator();
  let restoreEnv = () => {};
  let exitCode = 0;

  try {
    const mcpResult = await executeEnvExport(loaded, 'mcpConfig', []);
    const mcpConfig = parseMcpConfigResult(mcpResult);
    if (mcpConfig) {
      const connection = await orchestrator.start(mcpConfig);
      if (connection?.env) {
        restoreEnv = applyProcessEnv(connection.env);
      }
    }

    const spawnResult = await executeEnvExport(loaded, 'spawn', command);
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

async function shellEnvCommand(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error(chalk.red('Error: Environment name required'));
    console.error('Usage: mlld env shell <name>');
    process.exit(1);
  }
  assertValidEnvName(name);

  // Find environment
  let envLocation: EnvModuleLocation | null = null;
  try {
    envLocation = await findEnvModule(name);
  } catch (error) {
    if (error instanceof EnvModuleTypeError) {
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
    console.error(chalk.gray('Run `mlld env list` to see available environments.'));
    console.error(chalk.gray(`Or create one with: mlld env capture ${name}`));
    process.exit(1);
  }

  const loaded = await loadEnvironmentModule(envLocation);
  const orchestrator = new MCPOrchestrator();
  let restoreEnv = () => {};
  let exitCode = 0;

  try {
    const mcpResult = await executeEnvExport(loaded, 'mcpConfig', []);
    const mcpConfig = parseMcpConfigResult(mcpResult);
    if (mcpConfig) {
      const connection = await orchestrator.start(mcpConfig);
      if (connection?.env) {
        restoreEnv = applyProcessEnv(connection.env);
      }
    }

    const shellResult = await executeEnvExport(loaded, 'shell', []);
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

function printEnvHelp(): void {
  console.log(`
${chalk.bold('mlld env')} - Manage AI agent environments

${chalk.bold('Usage:')} mlld env <command> [options]

${chalk.bold('Commands:')}
  list              List available environments
  capture <name>    Create environment from ~/.claude config
  spawn <name> -- <command>   Run command with environment
  shell <name>      Start interactive session

${chalk.bold('Examples:')}
  mlld env capture claude-dev
  mlld env list
  mlld env spawn claude-dev -- claude -p "Fix the bug"
  mlld env shell claude-dev

${chalk.gray('Environment modules package credentials, configuration,')}
${chalk.gray('MCP tools, and security policy for AI agents.')}
`.trim());
}
