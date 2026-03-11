import type { DirectiveNode, ExecInvocation, SourceLocation } from '@core/types';
import type {
  EnvironmentConfig,
  EnvironmentCreateOptions,
  EnvironmentCreateResult,
  EnvironmentCommand,
  EnvironmentResult
} from '@core/types/environment';
import type { SecurityDescriptor } from '@core/types/security';
import {
  mergePolicyConfigs,
  normalizePolicyConfig,
  type PolicyConfig
} from '@core/policy/union';
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
import {
  MlldCommandExecutionError,
  MlldInterpreterError,
  MlldSecurityError
} from '@core/errors';
import { deriveCommandTaint } from '@core/security/taint';
import { makeSecurityDescriptor } from '@core/types/security';
import { isStructuredValue } from '@interpreter/utils/structured-value';
import {
  resolveAuthSecrets,
  type AuthResolutionOptions
} from '@interpreter/utils/auth-injection';

type EnvironmentProviderHandle = {
  ref: string;
  env: Environment;
  create: unknown;
  execute: unknown;
  snapshot?: unknown;
  release: unknown;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeNameList(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const entries: string[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== 'string') {
        continue;
      }
      const trimmed = item.trim();
      if (trimmed) {
        entries.push(trimmed);
      }
    }
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      entries.push(trimmed);
    }
  } else {
    return undefined;
  }
  return entries.length > 0 ? Array.from(new Set(entries)) : [];
}

function normalizeToolList(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return normalizeNameList(value);
  }
  if (isPlainObject(value)) {
    const tools = Object.keys(value)
      .map(entry => entry.trim())
      .filter(entry => entry.length > 0);
    return tools.length > 0 ? Array.from(new Set(tools)) : [];
  }
  return normalizeNameList(value);
}

function toNormalizedLookup(list: readonly string[] | undefined): Set<string> {
  const set = new Set<string>();
  for (const entry of list ?? []) {
    const trimmed = entry.trim();
    if (trimmed) {
      set.add(trimmed.toLowerCase());
    }
  }
  return set;
}

function applyListPolicyAttenuation(
  requested: string[] | undefined,
  allow: string[] | undefined,
  deny: string[] | undefined
): string[] | undefined {
  const requestedList = requested ? Array.from(new Set(requested.map(v => v.trim()).filter(Boolean))) : undefined;
  const allowList = allow ? Array.from(new Set(allow.map(v => v.trim()).filter(Boolean))) : undefined;
  const denySet = new Set((deny ?? []).map(entry => entry.trim()).filter(Boolean));

  if (requestedList) {
    if (!allowList && denySet.size === 0) {
      return requestedList;
    }
    const allowSet = new Set(allowList ?? []);
    return requestedList.filter(item => !denySet.has(item) && (allowSet.size === 0 || allowSet.has(item)));
  }

  if (allowList) {
    return allowList.filter(item => !denySet.has(item));
  }

  return undefined;
}

function applyToolPolicyAttenuation(
  requested: string[] | undefined,
  allow: string[] | undefined,
  deny: string[] | undefined
): string[] | undefined {
  const requestedList = requested
    ? Array.from(new Set(requested.map(v => v.trim()).filter(Boolean)))
    : undefined;
  const allowList = allow
    ? Array.from(new Set(allow.map(v => v.trim()).filter(Boolean)))
    : undefined;
  const allowSet = toNormalizedLookup(allowList);
  const denySet = toNormalizedLookup(deny);

  if (requestedList) {
    return requestedList.filter(item => {
      const normalized = item.toLowerCase();
      if (denySet.has(normalized)) {
        return false;
      }
      if (allowSet.size === 0) {
        return true;
      }
      return allowSet.has(normalized);
    });
  }

  if (allowList) {
    return allowList.filter(item => !denySet.has(item.toLowerCase()));
  }

  return undefined;
}

function mergeStringOrListValues(
  left?: string | string[],
  right?: string | string[]
): string | string[] | undefined {
  const merged = Array.from(
    new Set([
      ...(normalizeNameList(left) ?? []),
      ...(normalizeNameList(right) ?? [])
    ])
  );
  if (merged.length === 0) {
    return undefined;
  }
  if (merged.length === 1) {
    return merged[0];
  }
  return merged;
}

function mergeTaintLists(
  left?: string[],
  right?: string[]
): string[] | undefined {
  const merged = Array.from(new Set([...(left ?? []), ...(right ?? [])]));
  return merged.length > 0 ? merged : undefined;
}

function extractPolicyFragmentFromConstraints(config?: EnvironmentConfig): PolicyConfig | undefined {
  if (!config || !isPlainObject(config._policyDerivedConstraints)) {
    return undefined;
  }
  const raw = (config._policyDerivedConstraints as Record<string, unknown>).policyFragment;
  if (!isPlainObject(raw)) {
    return undefined;
  }
  return normalizePolicyConfig(raw as PolicyConfig);
}

export function extractEnvironmentPolicyFragment(
  metadata?: Record<string, unknown>
): PolicyConfig | undefined {
  if (!metadata || metadata.policyFragment === undefined || metadata.policyFragment === null) {
    return undefined;
  }
  const raw = metadata.policyFragment;
  if (!isPlainObject(raw)) {
    throw new MlldInterpreterError('Guard policy fragment must be an object', {
      code: 'ENV_POLICY_FRAGMENT_INVALID'
    });
  }
  return normalizePolicyConfig(raw as PolicyConfig);
}

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

export function resolveEnvironmentConfig(
  env: Environment,
  metadata?: Record<string, unknown>
): EnvironmentConfig | undefined {
  const guardConfig = extractEnvironmentConfig(metadata);
  const guardPolicyFragment = extractEnvironmentPolicyFragment(metadata);
  const scopedConfig = env.getScopedEnvironmentConfig();
  let resolved: EnvironmentConfig | undefined;
  if (guardConfig && scopedConfig) {
    resolved = { ...scopedConfig, ...guardConfig };
  } else {
    resolved = guardConfig ?? scopedConfig;
  }
  if (!guardPolicyFragment) {
    return resolved;
  }
  const mergedConstraints = isPlainObject(resolved?._policyDerivedConstraints)
    ? { ...(resolved!._policyDerivedConstraints as Record<string, unknown>) }
    : {};
  return {
    ...(resolved ?? {}),
    _policyDerivedConstraints: {
      ...(mergedConstraints as EnvironmentConfig['_policyDerivedConstraints']),
      policyFragment: guardPolicyFragment
    }
  };
}

export function deriveEnvironmentConfigFromPolicy(
  policy: PolicyConfig | undefined,
  localConfig?: EnvironmentConfig
): EnvironmentConfig | undefined {
  const policyFragment = extractPolicyFragmentFromConstraints(localConfig);
  const effectivePolicy = mergePolicyConfigs(policy, policyFragment);
  const normalizedPolicy = normalizePolicyConfig(effectivePolicy);
  const policyEnv = normalizedPolicy.env;
  const derived: EnvironmentConfig = localConfig ? { ...localConfig } : {};

  if (!policyEnv) {
    return Object.keys(derived).length > 0 ? derived : undefined;
  }

  const providerRef =
    typeof derived.provider === 'string' && derived.provider.trim().length > 0
      ? derived.provider.trim()
      : undefined;
  if (!providerRef && policyEnv.default) {
    derived.provider = policyEnv.default;
  } else if (providerRef) {
    derived.provider = providerRef;
  }

  const selectedProvider =
    typeof derived.provider === 'string' && derived.provider.trim().length > 0
      ? derived.provider.trim()
      : undefined;
  const providerRules = selectedProvider ? policyEnv.providers?.[selectedProvider] : undefined;
  if (selectedProvider && providerRules?.allowed === false) {
    throw new MlldSecurityError(`Provider '${selectedProvider}' denied by policy`, {
      code: 'ENV_PROVIDER_DENIED'
    });
  }
  if (providerRules?.auth !== undefined) {
    const mergedAuth = mergeStringOrListValues(derived.auth, providerRules.auth);
    if (mergedAuth !== undefined) {
      derived.auth = mergedAuth;
    }
  }
  if (providerRules?.taint !== undefined) {
    const mergedTaint = mergeTaintLists(derived.taint as string[] | undefined, providerRules.taint);
    if (mergedTaint !== undefined) {
      derived.taint = mergedTaint as any;
    }
  }
  if (providerRules?.profiles && Object.keys(providerRules.profiles).length > 0) {
    const existingProfiles = isPlainObject(derived.profiles)
      ? (derived.profiles as Record<string, unknown>)
      : {};
    derived.profiles = {
      ...providerRules.profiles,
      ...existingProfiles
    };
  }

  if (policyEnv.tools) {
    const requestedTools = normalizeToolList(derived.tools);
    const attenuatedTools = applyToolPolicyAttenuation(
      requestedTools,
      normalizeNameList(policyEnv.tools.allow),
      normalizeNameList(policyEnv.tools.deny)
    );
    if (attenuatedTools !== undefined) {
      derived.tools = attenuatedTools;
    }
  }

  if (policyEnv.mcps) {
    const currentMcps = normalizeNameList((derived as any).mcps);
    const attenuatedMcps = applyListPolicyAttenuation(
      currentMcps,
      normalizeNameList(policyEnv.mcps.allow),
      normalizeNameList(policyEnv.mcps.deny)
    );
    if (attenuatedMcps !== undefined) {
      (derived as any).mcps = attenuatedMcps;
    }
  }

  if (policyEnv.net) {
    const existingNet = isPlainObject((derived as any).net)
      ? { ...((derived as any).net as Record<string, unknown>) }
      : {};
    const netAllow = applyListPolicyAttenuation(
      normalizeNameList(existingNet.allow),
      normalizeNameList(policyEnv.net.allow),
      normalizeNameList(policyEnv.net.deny)
    );
    if (netAllow !== undefined) {
      existingNet.allow = netAllow;
    }
    if (Object.keys(existingNet).length > 0) {
      (derived as any).net = existingNet;
    }
  }

  const existingConstraints = isPlainObject(derived._policyDerivedConstraints)
    ? (derived._policyDerivedConstraints as Record<string, unknown>)
    : {};
  derived._policyDerivedConstraints = {
    ...(existingConstraints as EnvironmentConfig['_policyDerivedConstraints']),
    policy: normalizedPolicy,
    ...(policyFragment ? { policyFragment } : {}),
    policyEnv
  };

  return Object.keys(derived).length > 0 ? derived : undefined;
}

export function applyEnvironmentDefaults(
  config: EnvironmentConfig | undefined,
  policy: PolicyConfig | undefined
): EnvironmentConfig | undefined {
  return deriveEnvironmentConfigFromPolicy(policy, config);
}

export function buildEnvironmentOutputDescriptor(
  command: string,
  config: EnvironmentConfig | undefined
): SecurityDescriptor {
  const commandTaint = deriveCommandTaint({ command });
  const taintLabels = new Set<string>();
  taintLabels.add('src:cmd');
  const providerRef = config?.provider;
  if (providerRef) {
    taintLabels.add(deriveProviderLabel(providerRef));
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
  config: EnvironmentConfig | undefined,
  options?: AuthResolutionOptions
): Promise<Record<string, string>> {
  if (!config || config.auth === undefined || config.auth === null) {
    return {};
  }
  return resolveAuthSecrets(env, config.auth, options);
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
  release?: boolean;
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

  const start = Date.now();
  const providerOptions = prepareProviderOptions(config);
  let envName: string | null = null;
  try {
    const createResult = await callProviderCreate(provider, providerOptions);
    envName = createResult.envName;
    const normalized = await callProviderExecute(provider, envName, envCommand);
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
    if (envName && shouldReleaseEnvironment(config, options.release)) {
      await callProviderRelease(provider, envName);
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

function prepareProviderOptions(config: EnvironmentConfig): EnvironmentCreateOptions {
  const {
    provider: _provider,
    auth: _auth,
    taint: _taint,
    keep: _keep,
    tools: _tools,
    _policyDerivedConstraints: _policyDerivedConstraints,
    ...rest
  } = config as any;
  return { ...rest };
}

function shouldReleaseEnvironment(
  config: EnvironmentConfig,
  override?: boolean
): boolean {
  if (override === false) {
    return false;
  }
  if (override === true) {
    return true;
  }
  return !hasNamedEnvironment(config);
}

function hasNamedEnvironment(config: EnvironmentConfig): boolean {
  const name = (config as any).name;
  return typeof name === 'string' && name.trim().length > 0;
}

async function callProviderCreate(
  provider: EnvironmentProviderHandle,
  options: EnvironmentCreateOptions
): Promise<EnvironmentCreateResult> {
  const invocation: ExecInvocation = {
    type: 'ExecInvocation',
    commandRef: {
      identifier: [{ type: 'VariableReference', identifier: 'create' }],
      args: [{ type: 'VariableReference', identifier: '__env_opts' }]
    }
  };
  const createEnv = provider.env.createChild();
  createEnv.setVariable(
    '__env_opts',
    createObjectVariable('__env_opts', options, false, PROVIDER_ARG_SOURCE, PROVIDER_ARG_INTERNAL)
  );
  const result = await provider.env.withGuardSuppression(async () => {
    return evaluateExecInvocation(invocation, createEnv);
  });
  return normalizeEnvironmentCreateResult(result.value);
}

async function callProviderExecute(
  provider: EnvironmentProviderHandle,
  envName: string,
  envCommand: EnvironmentCommand
): Promise<EnvironmentResult> {
  const invocation: ExecInvocation = {
    type: 'ExecInvocation',
    commandRef: {
      identifier: [{ type: 'VariableReference', identifier: 'execute' }],
      args: [
        { type: 'VariableReference', identifier: '__env_name' },
        { type: 'VariableReference', identifier: '__env_command' }
      ]
    }
  };
  const executionEnv = provider.env.createChild();
  executionEnv.setVariable(
    '__env_name',
    createProviderArgumentVariable('__env_name', envName)
  );
  executionEnv.setVariable(
    '__env_command',
    createObjectVariable('__env_command', envCommand as any, false, PROVIDER_ARG_SOURCE, PROVIDER_ARG_INTERNAL)
  );
  const result = await provider.env.withGuardSuppression(async () => {
    return evaluateExecInvocation(invocation, executionEnv);
  });
  return normalizeEnvironmentResult(result.value);
}

async function callProviderRelease(
  provider: EnvironmentProviderHandle,
  envName: string
): Promise<void> {
  const releaseInvocation: ExecInvocation = {
    type: 'ExecInvocation',
    commandRef: {
      identifier: [{ type: 'VariableReference', identifier: 'release' }],
      args: [{ type: 'VariableReference', identifier: '__env_name' }]
    }
  };
  const releaseEnv = provider.env.createChild();
  releaseEnv.setVariable(
    '__env_name',
    createProviderArgumentVariable('__env_name', envName)
  );
  await provider.env.withGuardSuppression(async () => {
    await evaluateExecInvocation(releaseInvocation, releaseEnv);
  });
}

function normalizeEnvironmentCreateResult(value: unknown): EnvironmentCreateResult {
  let candidate = value;
  if (isStructuredValue(candidate)) {
    candidate = candidate.data;
  }
  if (candidate === undefined || candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new MlldInterpreterError('Environment provider @create must return an object', {
      code: 'ENV_PROVIDER_CREATE_RESULT_INVALID'
    });
  }
  const envNameValue = (candidate as any).envName;
  if (!envNameValue || typeof envNameValue !== 'string') {
    throw new MlldInterpreterError('Environment provider @create must return envName', {
      code: 'ENV_PROVIDER_CREATE_ENVNAME_INVALID'
    });
  }
  const createdValue = (candidate as any).created;
  return {
    envName: envNameValue,
    created: typeof createdValue === 'boolean' ? createdValue : true
  };
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

  return {
    stdout: stdoutValue !== undefined ? String(stdoutValue) : '',
    stderr: stderrValue !== undefined ? String(stderrValue) : '',
    exitCode: typeof exitCodeValue === 'number' ? exitCodeValue : 0
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
  if (!('create' in moduleObject)) {
    throw new MlldInterpreterError('Environment provider must export @create', {
      code: 'ENV_PROVIDER_CREATE_MISSING',
      details: { provider: ref }
    });
  }
  if (!('execute' in moduleObject)) {
    throw new MlldInterpreterError('Environment provider must export @execute', {
      code: 'ENV_PROVIDER_EXEC_MISSING',
      details: { provider: ref }
    });
  }
  if (!('release' in moduleObject)) {
    throw new MlldInterpreterError('Environment provider must export @release', {
      code: 'ENV_PROVIDER_RELEASE_MISSING',
      details: { provider: ref }
    });
  }

  const providerEnv = processingResult.childEnvironment;
  const createVar = providerEnv.getVariable('create');
  if (!createVar || !isExecutableVariable(createVar)) {
    throw new MlldInterpreterError('Environment provider export @create is not executable', {
      code: 'ENV_PROVIDER_CREATE_INVALID',
      details: { provider: ref }
    });
  }
  const executeVar = providerEnv.getVariable('execute');
  if (!executeVar || !isExecutableVariable(executeVar)) {
    throw new MlldInterpreterError('Environment provider export @execute is not executable', {
      code: 'ENV_PROVIDER_EXEC_INVALID',
      details: { provider: ref }
    });
  }

  const snapshotVar =
    'snapshot' in moduleObject ? providerEnv.getVariable('snapshot') : undefined;
  if (snapshotVar && !isExecutableVariable(snapshotVar)) {
    throw new MlldInterpreterError('Environment provider export @snapshot is not executable', {
      code: 'ENV_PROVIDER_SNAPSHOT_INVALID',
      details: { provider: ref }
    });
  }

  const releaseVar = providerEnv.getVariable('release');
  if (!releaseVar || !isExecutableVariable(releaseVar)) {
    throw new MlldInterpreterError('Environment provider export @release is not executable', {
      code: 'ENV_PROVIDER_RELEASE_INVALID',
      details: { provider: ref }
    });
  }

  return {
    ref,
    env: providerEnv,
    create: createVar,
    execute: executeVar,
    snapshot: snapshotVar,
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
