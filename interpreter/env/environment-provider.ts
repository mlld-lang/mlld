import type { DirectiveNode, ExecInvocation, SourceLocation } from '@core/types';
import type { EnvironmentConfig, EnvironmentCommand, EnvironmentResult } from '@core/types/environment';
import type { SecurityDescriptor } from '@core/types/security';
import type { PolicyConfig } from '@core/policy/union';
import type { Environment } from './Environment';
import type { CommandExecutionContext } from './ErrorUtils';
import {
  ImportSecurityValidator,
  ModuleContentProcessor,
  ObjectReferenceResolver,
  VariableImporter
} from '@interpreter/eval/import';
import {
  createObjectVariable,
  createArrayVariable,
  createPrimitiveVariable,
  createSimpleTextVariable,
  createStructuredValueVariable,
  isExecutableVariable,
  type Variable,
  type VariableSource
} from '@core/types/variable';
import { evaluateExecInvocation } from '@interpreter/eval/exec-invocation';
import { MlldCommandExecutionError, MlldInterpreterError } from '@core/errors';
import { deriveCommandTaint } from '@core/security/taint';
import { makeSecurityDescriptor } from '@core/types/security';
import { isStructuredValue } from '@interpreter/utils/structured-value';
import { resolveAuthSecrets } from '@interpreter/utils/auth-injection';

type EnvironmentProviderHandle = {
  ref: string;
  env: Environment;
  execute: unknown;
  checkpoint?: unknown;
  release?: unknown;
};

const providerCache = new WeakMap<Environment, Map<string, EnvironmentProviderHandle>>();

const PROVIDER_ARG_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'object',
  hasInterpolation: false,
  isMultiLine: false
};

const PROVIDER_ARG_INTERNAL = {
  internal: {
    isSystem: true,
    isParameter: true
  }
};

export function extractEnvironmentConfig(
  metadata?: Record<string, unknown>
): EnvironmentConfig | undefined {
  if (!metadata || metadata.envConfig === undefined || metadata.envConfig === null) {
    return undefined;
  }
  const raw = metadata.envConfig;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new MlldInterpreterError('Guard env config must be an object', {
      code: 'ENV_CONFIG_INVALID'
    });
  }
  return raw as EnvironmentConfig;
}

export function applyEnvironmentDefaults(
  config: EnvironmentConfig | undefined,
  policy: PolicyConfig | undefined
): EnvironmentConfig | undefined {
  const defaultProvider = policy?.env?.default;
  if (!config) {
    return defaultProvider ? { provider: defaultProvider } : undefined;
  }
  if (!config.provider && defaultProvider) {
    return { ...config, provider: defaultProvider };
  }
  return config;
}

export function buildEnvironmentOutputDescriptor(
  command: string,
  config: EnvironmentConfig | undefined
): SecurityDescriptor {
  const commandTaint = deriveCommandTaint({ command });
  const taintLabels = new Set<string>();
  const providerRef = config?.provider;
  if (providerRef) {
    taintLabels.add(deriveProviderLabel(providerRef));
  } else {
    taintLabels.add('src:exec');
  }
  if (Array.isArray(config?.taint)) {
    for (const label of config!.taint) {
      taintLabels.add(label);
    }
  }
  return makeSecurityDescriptor({
    taint: Array.from(taintLabels),
    sources: commandTaint.sources
  });
}

export async function resolveEnvironmentAuthSecrets(
  env: Environment,
  config: EnvironmentConfig | undefined
): Promise<Record<string, string>> {
  if (!config || config.auth === undefined || config.auth === null) {
    return {};
  }
  return resolveAuthSecrets(env, config.auth);
}

export async function executeProviderCommand(options: {
  env: Environment;
  providerRef: string;
  config: EnvironmentConfig;
  command: string;
  workingDirectory?: string;
  stdin?: string;
  vars?: Record<string, string>;
  secrets?: Record<string, string>;
  executionContext?: CommandExecutionContext;
  sourceLocation?: SourceLocation | null;
  directiveType?: string;
}): Promise<EnvironmentResult> {
  const provider = await getEnvironmentProvider(options.env, options.providerRef);
  const { providerRef, config, command, workingDirectory, stdin } = options;
  const { vars = {}, secrets = {} } = options;

  const envCommand: EnvironmentCommand = {
    argv: buildCommandArgv(command),
    cwd: workingDirectory,
    vars,
    secrets,
    ...(stdin !== undefined ? { stdin } : {})
  };

  const { providerOptions, executionEnv } = prepareProviderInvocation(provider, config);

  const invocation: ExecInvocation = {
    type: 'ExecInvocation',
    commandRef: {
      identifier: [{ type: 'VariableReference', identifier: 'execute' }],
      args: [
        { type: 'VariableReference', identifier: '__env_opts' },
        { type: 'VariableReference', identifier: '__env_command' }
      ]
    }
  };

  const start = Date.now();
  let handle: unknown;
  try {
    const result = await provider.env.withGuardSuppression(async () => {
      executionEnv.setVariable(
        '__env_opts',
        createObjectVariable('__env_opts', providerOptions, false, PROVIDER_ARG_SOURCE, PROVIDER_ARG_INTERNAL)
      );
      executionEnv.setVariable(
        '__env_command',
        createObjectVariable('__env_command', envCommand as any, false, PROVIDER_ARG_SOURCE, PROVIDER_ARG_INTERNAL)
      );
      return evaluateExecInvocation(invocation, executionEnv);
    });
    const normalized = normalizeEnvironmentResult(result.value);
    handle = normalized.handle;
    if ((normalized.exitCode ?? 0) !== 0) {
      throw buildProviderExecutionError({
        command,
        result: normalized,
        duration: Date.now() - start,
        sourceLocation: options.sourceLocation ?? null,
        directiveType: options.directiveType,
        workingDirectory,
        env: options.env,
        providerRef
      });
    }
    return normalized;
  } finally {
    if (provider.release) {
      await callProviderRelease(provider, handle);
    }
  }
}

function buildProviderExecutionError(options: {
  command: string;
  result: EnvironmentResult;
  duration: number;
  sourceLocation?: SourceLocation | null;
  directiveType?: string;
  workingDirectory?: string;
  env: Environment;
  providerRef: string;
}): MlldCommandExecutionError {
  const message = `Command execution failed in provider ${options.providerRef}`;
  return new MlldCommandExecutionError(
    message,
    options.sourceLocation ?? undefined,
    {
      command: options.command,
      exitCode: options.result.exitCode ?? 1,
      duration: options.duration,
      stdout: options.result.stdout ?? '',
      stderr: options.result.stderr ?? '',
      workingDirectory: options.workingDirectory ?? options.env.getExecutionDirectory(),
      directiveType: options.directiveType
    },
    options.env
  );
}

function prepareProviderInvocation(
  provider: EnvironmentProviderHandle,
  config: EnvironmentConfig
): { providerOptions: Record<string, unknown>; executionEnv: Environment } {
  const { provider: _provider, auth: _auth, taint: _taint, ...rest } = config;
  const providerOptions = { ...rest };
  const executionEnv = provider.env.createChild();
  return { providerOptions, executionEnv };
}

async function callProviderRelease(
  provider: EnvironmentProviderHandle,
  handle: unknown
): Promise<void> {
  if (!provider.release) {
    return;
  }
  const releaseInvocation: ExecInvocation = {
    type: 'ExecInvocation',
    commandRef: {
      identifier: [{ type: 'VariableReference', identifier: 'release' }],
      args: [{ type: 'VariableReference', identifier: '__env_handle' }]
    }
  };
  const releaseEnv = provider.env.createChild();
  releaseEnv.setVariable(
    '__env_handle',
    createProviderArgumentVariable('__env_handle', handle ?? null)
  );
  await provider.env.withGuardSuppression(async () => {
    await evaluateExecInvocation(releaseInvocation, releaseEnv);
  });
}

function normalizeEnvironmentResult(value: unknown): EnvironmentResult {
  let candidate = value;
  if (isStructuredValue(candidate)) {
    candidate = candidate.data;
  }
  if (candidate === undefined || candidate === null) {
    return { stdout: '', stderr: '', exitCode: 0 };
  }
  if (typeof candidate === 'string') {
    return { stdout: candidate, stderr: '', exitCode: 0 };
  }
  if (typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new MlldInterpreterError('Environment provider @execute must return an object', {
      code: 'ENV_PROVIDER_RESULT_INVALID'
    });
  }

  const stdoutValue = (candidate as any).stdout;
  const stderrValue = (candidate as any).stderr;
  const exitCodeValue = (candidate as any).exitCode;
  const handle = (candidate as any).handle;

  return {
    stdout: stdoutValue !== undefined ? String(stdoutValue) : '',
    stderr: stderrValue !== undefined ? String(stderrValue) : '',
    exitCode: typeof exitCodeValue === 'number' ? exitCodeValue : 0,
    handle
  };
}

function buildCommandArgv(command: string): string[] {
  return ['sh', '-lc', command];
}

function createProviderArgumentVariable(
  name: string,
  value: unknown
): Variable {
  if (isStructuredValue(value)) {
    return createStructuredValueVariable(name, value, PROVIDER_ARG_SOURCE, PROVIDER_ARG_INTERNAL);
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return createPrimitiveVariable(name, value, PROVIDER_ARG_SOURCE, PROVIDER_ARG_INTERNAL);
  }
  if (typeof value === 'string') {
    return createSimpleTextVariable(name, value, PROVIDER_ARG_SOURCE, PROVIDER_ARG_INTERNAL);
  }
  if (Array.isArray(value)) {
    return createArrayVariable(name, value, false, PROVIDER_ARG_SOURCE, PROVIDER_ARG_INTERNAL);
  }
  if (typeof value === 'object') {
    return createObjectVariable(
      name,
      value as Record<string, any>,
      false,
      PROVIDER_ARG_SOURCE,
      PROVIDER_ARG_INTERNAL
    );
  }
  return createSimpleTextVariable(name, String(value ?? ''), PROVIDER_ARG_SOURCE, PROVIDER_ARG_INTERNAL);
}

function deriveProviderLabel(ref: string): string {
  if (ref.startsWith('@')) {
    const trimmed = ref.slice(1);
    const parts = trimmed.split('/');
    const moduleName = parts[1] ?? parts[0];
    return `src:env:${stripEnvPrefix(moduleName)}`;
  }
  const base = ref.split('/').pop() ?? ref;
  const withoutExt = base.replace(/\.[^/.]+$/, '');
  return `src:env:${stripEnvPrefix(withoutExt)}`;
}

function stripEnvPrefix(name: string): string {
  return name.startsWith('env-') ? name.slice(4) : name;
}

async function getEnvironmentProvider(
  env: Environment,
  ref: string
): Promise<EnvironmentProviderHandle> {
  const root = getRootEnvironment(env);
  let cache = providerCache.get(root);
  if (!cache) {
    cache = new Map();
    providerCache.set(root, cache);
  }
  const cached = cache.get(ref);
  if (cached) {
    return cached;
  }
  const loaded = await loadEnvironmentProvider(env, ref);
  cache.set(ref, loaded);
  return loaded;
}

async function loadEnvironmentProvider(
  env: Environment,
  ref: string
): Promise<EnvironmentProviderHandle> {
  const resolverContent = await env.resolveModule(ref, 'import');
  const processingRef =
    typeof resolverContent.metadata?.source === 'string' ? resolverContent.metadata.source : ref;

  const directive = createProviderImportDirective();
  const securityValidator = new ImportSecurityValidator(env);
  const variableImporter = new VariableImporter(new ObjectReferenceResolver());
  const contentProcessor = new ModuleContentProcessor(env, securityValidator, variableImporter);
  const processingResult = await contentProcessor.processResolverContent(
    resolverContent.content,
    processingRef,
    directive,
    resolverContent.contentType,
    resolverContent.mx?.labels
  );

  const moduleObject = processingResult.moduleObject || {};
  if (!('execute' in moduleObject)) {
    throw new MlldInterpreterError('Environment provider must export @execute', {
      code: 'ENV_PROVIDER_EXEC_MISSING',
      details: { provider: ref }
    });
  }

  const providerEnv = processingResult.childEnvironment;
  const executeVar = providerEnv.getVariable('execute');
  if (!executeVar || !isExecutableVariable(executeVar)) {
    throw new MlldInterpreterError('Environment provider export @execute is not executable', {
      code: 'ENV_PROVIDER_EXEC_INVALID',
      details: { provider: ref }
    });
  }

  const checkpointVar =
    'checkpoint' in moduleObject ? providerEnv.getVariable('checkpoint') : undefined;
  if (checkpointVar && !isExecutableVariable(checkpointVar)) {
    throw new MlldInterpreterError('Environment provider export @checkpoint is not executable', {
      code: 'ENV_PROVIDER_CHECKPOINT_INVALID',
      details: { provider: ref }
    });
  }

  const releaseVar = 'release' in moduleObject ? providerEnv.getVariable('release') : undefined;
  if (releaseVar && !isExecutableVariable(releaseVar)) {
    throw new MlldInterpreterError('Environment provider export @release is not executable', {
      code: 'ENV_PROVIDER_RELEASE_INVALID',
      details: { provider: ref }
    });
  }

  return {
    ref,
    env: providerEnv,
    execute: executeVar,
    checkpoint: checkpointVar,
    release: releaseVar
  };
}

function createProviderImportDirective(): DirectiveNode {
  return {
    type: 'Directive',
    nodeId: 'env-provider-import',
    kind: 'import',
    subtype: 'importSelected',
    values: {},
    raw: {},
    meta: {},
    location: null,
    source: 'directive'
  };
}

function getRootEnvironment(env: Environment): Environment {
  let current: Environment | undefined = env;
  while (current.getParent()) {
    current = current.getParent();
  }
  return current!;
}
