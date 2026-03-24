import { normalizeCommandPatternEntry, parseFsPatternEntry } from './capability-patterns';
import {
  mergePolicyAuthorizations,
  normalizePolicyAuthorizations,
  type PolicyAuthorizations
} from './authorizations';
import type { DataLabel } from '@core/types/security';

export type PolicyLimits = {
  maxTokens?: number;
  timeout?: number;
};

export type PolicyEnvironmentAttenuation = 'intersection' | 'union';

export type PolicyEnvironmentProviderConfig = {
  allowed?: boolean;
  auth?: string | string[];
  taint?: DataLabel[];
  profiles?: Record<string, unknown>;
};

export type PolicyEnvironmentListConfig = {
  allow?: string[];
  deny?: string[];
  attenuation?: PolicyEnvironmentAttenuation;
};

export type PolicyEnvironmentNetworkConfig = {
  allow?: string[];
  deny?: string[];
};

export type PolicyEnvironmentConfig = {
  default?: string;
  providers?: Record<string, PolicyEnvironmentProviderConfig>;
  tools?: PolicyEnvironmentListConfig;
  mcps?: PolicyEnvironmentListConfig;
  net?: PolicyEnvironmentNetworkConfig;
};

export type PolicyTrustStance = 'trusted' | 'untrusted';
export type PolicyTrustConflict = 'warn' | 'error' | 'silent';

export type PolicyDefaults = {
  unlabeled?: PolicyTrustStance;
  rules?: string[];
  autosign?: unknown;
  autoverify?: unknown;
  trustconflict?: PolicyTrustConflict;
};

export type PolicyKeychainConfig = {
  provider?: string;
  allow?: string[];
  deny?: string[];
};

export type AuthConfig = {
  from: string;
  as: string;
};

const KEYCHAIN_SHORT_SERVICE = 'mlld-box-{projectname}';

export type LabelFlowRule = {
  deny?: string[];
  allow?: string[];
};

export type PolicyLabels = Record<string, LabelFlowRule>;

export type PolicyFilesystemRules = {
  read?: string[];
  write?: string[];
};

export type PolicySignerRule = string[];

export type PolicyFileIntegrityRule = {
  mutable?: boolean;
  authorizedIdentities?: string[];
};

export type PolicyNetworkRules = {
  domains?: string[];
};

export type PolicyCapabilityValue =
  | true
  | string[]
  | PolicyFilesystemRules
  | PolicyNetworkRules;

export type PolicyCapabilitiesConfig = {
  allow?: Record<string, PolicyCapabilityValue> | string[] | true;
  deny?: Record<string, PolicyCapabilityValue> | string[] | true;
  danger?: string[] | string;
};

export type PolicyOperations = Record<string, string[]>;

export type PolicyConfig = {
  verify_all_instructions?: boolean;
  locked?: boolean;
  defaults?: PolicyDefaults;
  default?: 'deny' | 'allow';
  authorizations?: PolicyAuthorizations;
  auth?: Record<string, AuthConfig>;
  keychain?: PolicyKeychainConfig;
  allow?: Record<string, PolicyCapabilityValue> | string[] | true;
  deny?: Record<string, PolicyCapabilityValue> | string[] | true;
  deny_cmd?: string[] | string;
  danger?: string[] | string;
  capabilities?: PolicyCapabilitiesConfig;
  labels?: PolicyLabels;
  operations?: PolicyOperations;
  signers?: Record<string, PolicySignerRule>;
  filesystem_integrity?: Record<string, PolicyFileIntegrityRule>;
  env?: PolicyEnvironmentConfig;
  limits?: PolicyLimits;
};

type AllowShape =
  | { type: 'wildcard' }
  | { type: 'map'; entries: Map<string, CapabilityEntry> };

type DenyShape =
  | { type: 'wildcard' }
  | { type: 'map'; entries: Map<string, CapabilityEntry> };

type PolicyFilesystemRuleSet = {
  read?: Set<string>;
  write?: Set<string>;
};

type PolicyNetworkRuleSet = {
  domains?: Set<string>;
};

type CapabilityEntry = Set<string> | PolicyFilesystemRuleSet | PolicyNetworkRuleSet;

export function mergePolicyConfigs(
  base: PolicyConfig | undefined,
  incoming: PolicyConfig | undefined
): PolicyConfig {
  if (!base) {
    return normalizePolicyConfig(incoming);
  }
  if (!incoming) {
    return normalizePolicyConfig(base);
  }

  const normalizedBase = normalizePolicyConfig(base);
  const normalizedIncoming = normalizePolicyConfig(incoming);

  const baseAllow = toAllowShape(normalizedBase.allow);
  const incomingAllow = toAllowShape(normalizedIncoming.allow);
  const mergedAllow = mergeAllowShapes(baseAllow, incomingAllow);

  const baseDeny = toDenyShape(normalizedBase.deny);
  const incomingDeny = toDenyShape(normalizedIncoming.deny);
  const mergedDeny = mergeDenyShapes(baseDeny, incomingDeny);

  const labels = mergePolicyLabels(normalizedBase.labels, normalizedIncoming.labels);
  const operations = mergePolicyOperations(normalizedBase.operations, normalizedIncoming.operations);
  const signers = mergePolicySigners(normalizedBase.signers, normalizedIncoming.signers);
  const filesystemIntegrity = mergePolicyFilesystemIntegrity(
    normalizedBase.filesystem_integrity,
    normalizedIncoming.filesystem_integrity
  );
  const auth = mergePolicyAuth(normalizedBase.auth, normalizedIncoming.auth);
  const keychain = mergePolicyKeychain(normalizedBase.keychain, normalizedIncoming.keychain);
  const defaultStance = mergePolicyDefault(normalizedBase.default, normalizedIncoming.default);
  const defaults = mergePolicyDefaults(normalizedBase.defaults, normalizedIncoming.defaults);
  const authorizations = mergePolicyAuthorizations(
    normalizedBase.authorizations,
    normalizedIncoming.authorizations
  );
  const envConfig = mergePolicyEnv(normalizedBase.env, normalizedIncoming.env);
  const limits = mergeLimits(normalizedBase.limits, normalizedIncoming.limits);
  const danger = mergePolicyDanger(normalizedBase.danger as string[] | undefined, normalizedIncoming.danger as string[] | undefined);
  const locked = normalizedBase.locked === true || normalizedIncoming.locked === true;

  return {
    ...(locked ? { locked: true } : {}),
    ...(defaults ? { defaults } : {}),
    ...(defaultStance ? { default: defaultStance } : {}),
    ...(authorizations ? { authorizations } : {}),
    ...(auth ? { auth } : {}),
    ...(keychain ? { keychain } : {}),
    allow: fromAllowShape(mergedAllow),
    deny: fromDenyShape(mergedDeny),
    ...(danger && danger.length > 0 ? { danger } : {}),
    ...(labels ? { labels } : {}),
    ...(operations ? { operations } : {}),
    ...(signers ? { signers } : {}),
    ...(filesystemIntegrity ? { filesystem_integrity: filesystemIntegrity } : {}),
    ...(envConfig ? { env: envConfig } : {}),
    ...(limits ? { limits } : {})
  };
}

export function normalizePolicyConfig(config?: PolicyConfig): PolicyConfig {
  if (!config) {
    return {};
  }
  if (config.verify_all_instructions === true) {
    const { verify_all_instructions: _, ...rest } = config;
    config = {
      ...rest,
      defaults: {
        ...rest.defaults,
        autosign: rest.defaults?.autosign ?? ['instructions'],
        autoverify: rest.defaults?.autoverify ?? true
      }
    };
  }
  const allowSources: Array<PolicyConfig['allow']> = [];
  const denySources: Array<PolicyConfig['deny']> = [];
  if (config.allow !== undefined) {
    allowSources.push(config.allow);
  }
  if (config.capabilities?.allow !== undefined) {
    allowSources.push(config.capabilities.allow);
  }
  if (config.deny !== undefined) {
    denySources.push(config.deny);
  }
  const denyCmd = normalizeDenyCommandList(config.deny_cmd);
  if (denyCmd !== undefined) {
    denySources.push(denyCmd);
  }
  if (config.capabilities?.deny !== undefined) {
    denySources.push(config.capabilities.deny);
  }
  const allow = allowSources.length > 0
    ? fromAllowShape(allowSources.map(toAllowShape).reduce(mergeAllowShapes))
    : undefined;
  const deny = denySources.length > 0
    ? fromDenyShape(denySources.map(toDenyShape).reduce(mergeDenyShapes))
    : undefined;
  const labels = normalizePolicyLabels(config.labels);
  const operations = normalizePolicyOperations(config.operations);
  const signers = normalizePolicySigners(config.signers);
  const filesystemIntegrity = normalizePolicyFilesystemIntegrity(config.filesystem_integrity);
  const authorizations = normalizePolicyAuthorizations(config.authorizations);
  const auth = normalizePolicyAuth(config.auth);
  const keychain = normalizePolicyKeychain(config.keychain);
  const defaultStance = normalizePolicyDefault(config.default);
  const defaults = normalizePolicyDefaults(config.defaults);
  const envConfig = normalizePolicyEnv(config.env);
  const limits = config.limits ? normalizeLimits(config.limits) : undefined;
  const danger = normalizePolicyDanger(config.capabilities?.danger ?? config.danger);
  return {
    ...(config.locked === true ? { locked: true } : {}),
    ...(defaults ? { defaults } : {}),
    ...(defaultStance ? { default: defaultStance } : {}),
    ...(authorizations ? { authorizations } : {}),
    ...(auth ? { auth } : {}),
    ...(keychain ? { keychain } : {}),
    allow,
    deny,
    ...(danger ? { danger } : {}),
    ...(labels ? { labels } : {}),
    ...(operations ? { operations } : {}),
    ...(signers ? { signers } : {}),
    ...(filesystemIntegrity ? { filesystem_integrity: filesystemIntegrity } : {}),
    ...(envConfig ? { env: envConfig } : {}),
    ...(limits ? { limits } : {})
  };
}

function normalizePolicyEnv(
  config?: PolicyEnvironmentConfig
): PolicyEnvironmentConfig | undefined {
  if (!config || !isPlainObject(config)) {
    return undefined;
  }
  const defaultProvider =
    typeof config.default === 'string' && config.default.trim().length > 0
      ? config.default.trim()
      : undefined;
  const providers = normalizePolicyEnvironmentProviders(config.providers);
  const tools = normalizePolicyEnvironmentListConfig(config.tools);
  const mcps = normalizePolicyEnvironmentListConfig(config.mcps);
  const net = normalizePolicyEnvironmentNetworkConfig(config.net);
  if (!defaultProvider && !providers && !tools && !mcps && !net) {
    return undefined;
  }
  return {
    ...(defaultProvider ? { default: defaultProvider } : {}),
    ...(providers ? { providers } : {}),
    ...(tools ? { tools } : {}),
    ...(mcps ? { mcps } : {}),
    ...(net ? { net } : {})
  };
}

function normalizePolicyEnvironmentProviders(
  value: unknown
): Record<string, PolicyEnvironmentProviderConfig> | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }
  const entries = Object.entries(value);
  const providers: Record<string, PolicyEnvironmentProviderConfig> = {};
  for (const [rawRef, rawConfig] of entries) {
    const providerRef = rawRef.trim();
    if (!providerRef || !isPlainObject(rawConfig)) {
      continue;
    }
    const normalized = normalizePolicyEnvironmentProviderConfig(rawConfig);
    if (normalized) {
      providers[providerRef] = normalized;
    }
  }
  return Object.keys(providers).length > 0 ? providers : undefined;
}

function normalizePolicyEnvironmentProviderConfig(
  value: unknown
): PolicyEnvironmentProviderConfig | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }
  const allowed = typeof value.allowed === 'boolean' ? value.allowed : undefined;
  const auth = normalizeStringOrList(value.auth);
  const taint = normalizeStringList(value.taint) as DataLabel[] | undefined;
  const profiles = isPlainObject(value.profiles)
    ? { ...(value.profiles as Record<string, unknown>) }
    : undefined;

  if (allowed === undefined && auth === undefined && taint === undefined && !profiles) {
    return undefined;
  }

  return {
    ...(allowed !== undefined ? { allowed } : {}),
    ...(auth !== undefined ? { auth } : {}),
    ...(taint !== undefined ? { taint } : {}),
    ...(profiles ? { profiles } : {})
  };
}

function normalizePolicyEnvironmentListConfig(
  value: unknown
): PolicyEnvironmentListConfig | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }
  const allow = normalizeStringList(value.allow);
  const deny = normalizeStringList(value.deny);
  const attenuation = normalizePolicyEnvironmentAttenuation(value.attenuation);
  if (allow === undefined && deny === undefined && attenuation === undefined) {
    return undefined;
  }
  return {
    ...(allow !== undefined ? { allow } : {}),
    ...(deny !== undefined ? { deny } : {}),
    ...(attenuation !== undefined ? { attenuation } : {})
  };
}

function normalizePolicyEnvironmentNetworkConfig(
  value: unknown
): PolicyEnvironmentNetworkConfig | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }
  const allow = normalizeStringList(value.allow);
  const deny = normalizeStringList(value.deny);
  if (allow === undefined && deny === undefined) {
    return undefined;
  }
  return {
    ...(allow !== undefined ? { allow } : {}),
    ...(deny !== undefined ? { deny } : {})
  };
}

function normalizePolicyEnvironmentAttenuation(
  value: unknown
): PolicyEnvironmentAttenuation | undefined {
  if (value === 'intersection' || value === 'union') {
    return value;
  }
  return undefined;
}

function normalizeStringOrList(value: unknown): string | string[] | undefined {
  const list = normalizeStringList(value);
  if (list === undefined) {
    return undefined;
  }
  if (list.length <= 1) {
    return list[0];
  }
  return list;
}

function normalizePolicyDefaults(
  defaults?: PolicyConfig['defaults']
): PolicyConfig['defaults'] | undefined {
  if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) {
    return undefined;
  }
  const unlabeled = normalizePolicyUnlabeled(defaults.unlabeled);
  const rules = normalizeStringList(defaults.rules);
  const autosign = normalizeAutosign(defaults.autosign);
  const autoverify = normalizeAutoverify(defaults.autoverify);
  const trustconflict = normalizeTrustConflict(defaults.trustconflict);
  const result: PolicyDefaults = {};
  if (unlabeled) {
    result.unlabeled = unlabeled;
  }
  if (rules) {
    result.rules = rules;
  }
  if (autosign !== undefined) {
    result.autosign = autosign;
  }
  if (autoverify !== undefined) {
    result.autoverify = autoverify;
  }
  if (trustconflict) {
    result.trustconflict = trustconflict;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizePolicyDanger(value: unknown): string[] | undefined {
  const list = normalizeStringList(value);
  if (!list || list.length === 0) {
    return undefined;
  }
  return list;
}

function normalizePolicyUnlabeled(
  value: PolicyDefaults['unlabeled']
): PolicyDefaults['unlabeled'] | undefined {
  if (value === 'trusted' || value === 'untrusted') {
    return value;
  }
  return undefined;
}

function normalizeTrustConflict(
  value: PolicyDefaults['trustconflict']
): PolicyDefaults['trustconflict'] | undefined {
  if (value === 'warn' || value === 'error' || value === 'silent') {
    return value;
  }
  return undefined;
}

function normalizeAutosign(value: PolicyDefaults['autosign']): PolicyDefaults['autosign'] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return normalizeStringList(value) ?? [];
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (value && typeof value === 'object') {
    return value;
  }
  return undefined;
}

function normalizeAutoverify(value: PolicyDefaults['autoverify']): PolicyDefaults['autoverify'] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (value && typeof value === 'object') {
    return value;
  }
  return undefined;
}

function mergePolicyDefaults(
  base?: PolicyConfig['defaults'],
  incoming?: PolicyConfig['defaults']
): PolicyConfig['defaults'] | undefined {
  const normalizedBase = normalizePolicyDefaults(base);
  const normalizedIncoming = normalizePolicyDefaults(incoming);
  if (!normalizedBase && !normalizedIncoming) {
    return undefined;
  }
  const unlabeled = mergePolicyUnlabeled(
    normalizedBase?.unlabeled,
    normalizedIncoming?.unlabeled
  );
  const rules = mergeStringLists(normalizedBase?.rules, normalizedIncoming?.rules);
  const autosign = mergeAutosign(normalizedBase?.autosign, normalizedIncoming?.autosign);
  const autoverify = normalizedIncoming?.autoverify ?? normalizedBase?.autoverify;
  const trustconflict = normalizedIncoming?.trustconflict ?? normalizedBase?.trustconflict;
  const result: PolicyDefaults = {};
  if (unlabeled) {
    result.unlabeled = unlabeled;
  }
  if (rules) {
    result.rules = rules;
  }
  if (autosign !== undefined) {
    result.autosign = autosign;
  }
  if (autoverify !== undefined) {
    result.autoverify = autoverify;
  }
  if (trustconflict) {
    result.trustconflict = trustconflict;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function mergePolicyDanger(base?: string[], incoming?: string[]): string[] | undefined {
  if (!base && !incoming) {
    return undefined;
  }
  if (!base || !incoming) {
    return [];
  }
  const incomingSet = new Set(incoming);
  return base.filter(entry => incomingSet.has(entry));
}

function mergePolicyUnlabeled(
  base?: PolicyDefaults['unlabeled'],
  incoming?: PolicyDefaults['unlabeled']
): PolicyDefaults['unlabeled'] | undefined {
  if (incoming === 'untrusted' || base === 'untrusted') {
    return 'untrusted';
  }
  if (incoming === 'trusted') {
    return 'trusted';
  }
  return base;
}

function mergeAutosign(
  base?: PolicyDefaults['autosign'],
  incoming?: PolicyDefaults['autosign']
): PolicyDefaults['autosign'] | undefined {
  if (incoming === undefined) {
    return base;
  }
  if (base === undefined) {
    return incoming;
  }
  if (Array.isArray(base) && Array.isArray(incoming)) {
    return mergeStringLists(base, incoming) ?? [];
  }
  if (isPlainObject(base) && isPlainObject(incoming)) {
    return { ...base, ...incoming };
  }
  return incoming;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const normalized = value
      .map(entry => String(entry).trim())
      .filter(entry => entry.length > 0);
    return normalized.length > 0 ? Array.from(new Set(normalized)) : [];
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const normalized = String(value).trim();
    return normalized ? [normalized] : [];
  }
  return undefined;
}

function normalizeDenyCommandList(value: unknown): string[] | undefined {
  const entries = normalizeStringList(value);
  if (entries === undefined) {
    return undefined;
  }
  const normalized = entries
    .map(entry => {
      const raw = entry.trim();
      if (!raw) {
        return '';
      }
      const prefixed = /^(?:op:cmd:|cmd:)/i.test(raw) ? raw : `cmd:${raw}`;
      const pattern = normalizeCommandPatternEntry(prefixed);
      return pattern ? `cmd:${pattern}` : '';
    })
    .filter(entry => entry.length > 0);
  return normalized.length > 0 ? Array.from(new Set(normalized)) : [];
}

function normalizeFilesystemRules(value: unknown): PolicyFilesystemRules | undefined {
  if (value === true || value === '*' || value === 'all') {
    return { read: ['**'], write: ['**'] };
  }
  if (Array.isArray(value) || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const list = normalizeStringList(value);
    if (list === undefined) {
      return undefined;
    }
    return { read: list, write: list };
  }
  if (!isPlainObject(value)) {
    return undefined;
  }
  const read = normalizeFilesystemRuleList((value as { read?: unknown }).read);
  const write = normalizeFilesystemRuleList((value as { write?: unknown }).write);
  const result: PolicyFilesystemRules = {};
  if (read !== undefined) {
    result.read = read;
  }
  if (write !== undefined) {
    result.write = write;
    result.read = mergeStringLists(result.read, write) ?? result.read;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeFilesystemRuleList(value: unknown): string[] | undefined {
  if (value === true || value === '*' || value === 'all') {
    return ['**'];
  }
  const list = normalizeStringList(value);
  if (!list) {
    return list;
  }
  const normalized = list
    .map(entry => {
      const parsed = parseFsPatternEntry(entry);
      if (parsed) {
        return parsed.pattern;
      }
      if (entry === '*' || entry === '**') {
        return '**';
      }
      return entry;
    })
    .filter(entry => entry.length > 0);
  return normalized.length > 0 ? normalized : [];
}

function normalizeNetworkRules(value: unknown): PolicyNetworkRules | undefined {
  if (value === true || value === '*' || value === 'all') {
    return { domains: ['*'] };
  }
  if (Array.isArray(value) || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const list = normalizeStringList(value);
    if (list === undefined) {
      return undefined;
    }
    return { domains: list };
  }
  if (!isPlainObject(value)) {
    return undefined;
  }
  const domains = normalizeNetworkRuleList((value as { domains?: unknown }).domains);
  const result: PolicyNetworkRules = {};
  if (domains !== undefined) {
    result.domains = domains;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeNetworkRuleList(value: unknown): string[] | undefined {
  if (value === true || value === '*' || value === 'all') {
    return ['*'];
  }
  return normalizeStringList(value);
}

function collectCapabilityEntriesFromList(entries: Map<string, CapabilityEntry>, rawEntries: unknown[]): void {
  for (const entry of rawEntries) {
    const normalized = String(entry).trim();
    if (!normalized) {
      continue;
    }
    const commandPattern = normalizeCommandPatternEntry(normalized);
    if (commandPattern) {
      addCommandPattern(entries, commandPattern);
      continue;
    }
    const fsPattern = parseFsPatternEntry(normalized);
    if (fsPattern) {
      addFilesystemPattern(entries, fsPattern.mode, fsPattern.pattern);
      continue;
    }
    entries.set(normalized, new Set(['*']));
  }
}

function addCommandPattern(entries: Map<string, CapabilityEntry>, pattern: string): void {
  const existing = entries.get('cmd');
  if (existing instanceof Set) {
    existing.add(pattern);
    return;
  }
  entries.set('cmd', new Set([pattern]));
}

function addFilesystemPattern(
  entries: Map<string, CapabilityEntry>,
  mode: 'read' | 'write',
  pattern: string
): void {
  const existing = entries.get('filesystem');
  const rules: PolicyFilesystemRuleSet = isFilesystemRuleSet(existing) ? existing : {};
  if (mode === 'write') {
    const write = rules.write ?? new Set<string>();
    write.add(pattern);
    rules.write = write;
    const read = rules.read ?? new Set<string>();
    read.add(pattern);
    rules.read = read;
  } else {
    const read = rules.read ?? new Set<string>();
    read.add(pattern);
    rules.read = read;
  }
  entries.set('filesystem', rules);
}

function toFilesystemRuleSet(rules: PolicyFilesystemRules): PolicyFilesystemRuleSet {
  return {
    ...(rules.read !== undefined ? { read: new Set(rules.read) } : {}),
    ...(rules.write !== undefined ? { write: new Set(rules.write) } : {})
  };
}

function fromFilesystemRuleSet(set: PolicyFilesystemRuleSet): PolicyFilesystemRules | undefined {
  const result: PolicyFilesystemRules = {};
  if (set.read !== undefined) {
    result.read = Array.from(set.read);
  }
  if (set.write !== undefined) {
    result.write = Array.from(set.write);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function toNetworkRuleSet(rules: PolicyNetworkRules): PolicyNetworkRuleSet {
  return {
    ...(rules.domains !== undefined ? { domains: new Set(rules.domains) } : {})
  };
}

function fromNetworkRuleSet(set: PolicyNetworkRuleSet): PolicyNetworkRules | undefined {
  const result: PolicyNetworkRules = {};
  if (set.domains !== undefined) {
    result.domains = Array.from(set.domains);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function isFilesystemRuleSet(value: CapabilityEntry): value is PolicyFilesystemRuleSet {
  if (!value || value instanceof Set) {
    return false;
  }
  return 'read' in value || 'write' in value;
}

function isNetworkRuleSet(value: CapabilityEntry): value is PolicyNetworkRuleSet {
  if (!value || value instanceof Set) {
    return false;
  }
  return 'domains' in value;
}

function mergeStringLists(base?: string[], incoming?: string[]): string[] | undefined {
  if (!base && !incoming) {
    return undefined;
  }
  return Array.from(new Set([...(base ?? []), ...(incoming ?? [])]));
}

function mergePolicyEnv(
  base?: PolicyEnvironmentConfig,
  incoming?: PolicyEnvironmentConfig
): PolicyEnvironmentConfig | undefined {
  const normalizedBase = normalizePolicyEnv(base);
  const normalizedIncoming = normalizePolicyEnv(incoming);
  if (!normalizedBase && !normalizedIncoming) {
    return undefined;
  }
  const defaultProvider = normalizedIncoming?.default ?? normalizedBase?.default;
  const providers = mergePolicyEnvironmentProviders(
    normalizedBase?.providers,
    normalizedIncoming?.providers
  );
  const tools = mergePolicyEnvironmentListRule(
    normalizedBase?.tools,
    normalizedIncoming?.tools,
    'intersection'
  );
  const mcps = mergePolicyEnvironmentListRule(
    normalizedBase?.mcps,
    normalizedIncoming?.mcps,
    'intersection'
  );
  const net = mergePolicyEnvironmentNetworkRule(normalizedBase?.net, normalizedIncoming?.net);
  if (!defaultProvider && !providers && !tools && !mcps && !net) {
    return undefined;
  }
  return {
    ...(defaultProvider ? { default: defaultProvider } : {}),
    ...(providers ? { providers } : {}),
    ...(tools ? { tools } : {}),
    ...(mcps ? { mcps } : {}),
    ...(net ? { net } : {})
  };
}

function mergePolicyEnvironmentProviders(
  base?: Record<string, PolicyEnvironmentProviderConfig>,
  incoming?: Record<string, PolicyEnvironmentProviderConfig>
): Record<string, PolicyEnvironmentProviderConfig> | undefined {
  if (!base && !incoming) {
    return undefined;
  }
  const merged: Record<string, PolicyEnvironmentProviderConfig> = {};
  const keys = new Set<string>([
    ...Object.keys(base ?? {}),
    ...Object.keys(incoming ?? {})
  ]);
  for (const key of keys) {
    const next = mergePolicyEnvironmentProviderRule(base?.[key], incoming?.[key]);
    if (next) {
      merged[key] = next;
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mergePolicyEnvironmentProviderRule(
  base?: PolicyEnvironmentProviderConfig,
  incoming?: PolicyEnvironmentProviderConfig
): PolicyEnvironmentProviderConfig | undefined {
  if (!base && !incoming) {
    return undefined;
  }
  const allowed = incoming?.allowed === false || base?.allowed === false
    ? false
    : incoming?.allowed ?? base?.allowed;
  const auth = mergePolicyEnvironmentAuth(base?.auth, incoming?.auth);
  const taint = mergePolicyEnvironmentTaint(base?.taint, incoming?.taint);
  const profiles = base?.profiles || incoming?.profiles
    ? {
        ...(base?.profiles ?? {}),
        ...(incoming?.profiles ?? {})
      }
    : undefined;
  if (allowed === undefined && auth === undefined && taint === undefined && !profiles) {
    return undefined;
  }
  return {
    ...(allowed !== undefined ? { allowed } : {}),
    ...(auth !== undefined ? { auth } : {}),
    ...(taint !== undefined ? { taint } : {}),
    ...(profiles ? { profiles } : {})
  };
}

function mergePolicyEnvironmentAuth(
  base?: string | string[],
  incoming?: string | string[]
): string | string[] | undefined {
  const baseList = normalizeStringList(base);
  const incomingList = normalizeStringList(incoming);
  const merged = mergeStringLists(baseList, incomingList);
  if (merged === undefined) {
    return undefined;
  }
  if (merged.length <= 1) {
    return merged[0];
  }
  return merged;
}

function mergePolicyEnvironmentTaint(
  base?: DataLabel[],
  incoming?: DataLabel[]
): DataLabel[] | undefined {
  const merged = mergeStringLists(base as string[] | undefined, incoming as string[] | undefined);
  if (merged === undefined) {
    return undefined;
  }
  return merged as DataLabel[];
}

function mergePolicyEnvironmentListRule(
  base?: PolicyEnvironmentListConfig,
  incoming?: PolicyEnvironmentListConfig,
  defaultAttenuation: PolicyEnvironmentAttenuation = 'intersection'
): PolicyEnvironmentListConfig | undefined {
  if (!base && !incoming) {
    return undefined;
  }
  const attenuation = incoming?.attenuation ?? base?.attenuation ?? defaultAttenuation;
  const allow =
    attenuation === 'union'
      ? mergeStringLists(base?.allow, incoming?.allow)
      : intersectStringLists(base?.allow, incoming?.allow);
  const deny = mergeStringLists(base?.deny, incoming?.deny);
  if (allow === undefined && deny === undefined && attenuation === undefined) {
    return undefined;
  }
  return {
    ...(allow !== undefined ? { allow } : {}),
    ...(deny !== undefined ? { deny } : {}),
    ...(attenuation !== undefined ? { attenuation } : {})
  };
}

function mergePolicyEnvironmentNetworkRule(
  base?: PolicyEnvironmentNetworkConfig,
  incoming?: PolicyEnvironmentNetworkConfig
): PolicyEnvironmentNetworkConfig | undefined {
  if (!base && !incoming) {
    return undefined;
  }
  const allow = intersectStringLists(base?.allow, incoming?.allow);
  const deny = mergeStringLists(base?.deny, incoming?.deny);
  if (allow === undefined && deny === undefined) {
    return undefined;
  }
  return {
    ...(allow !== undefined ? { allow } : {}),
    ...(deny !== undefined ? { deny } : {})
  };
}

function intersectStringLists(base?: string[], incoming?: string[]): string[] | undefined {
  if (!base && !incoming) {
    return undefined;
  }
  if (!base) {
    return incoming ? Array.from(new Set(incoming)) : undefined;
  }
  if (!incoming) {
    return base ? Array.from(new Set(base)) : undefined;
  }
  const incomingSet = new Set(incoming);
  const intersection = base.filter(entry => incomingSet.has(entry));
  return Array.from(new Set(intersection));
}

function toAllowShape(value: PolicyConfig['allow']): AllowShape {
  if (value === true || value === '*' || value === 'all') {
    return { type: 'wildcard' };
  }

  const entries = new Map<string, CapabilityEntry>();
  if (Array.isArray(value)) {
    collectCapabilityEntriesFromList(entries, value);
    return { type: 'map', entries };
  }

  if (value && typeof value === 'object') {
    for (const [key, raw] of Object.entries(value)) {
      const normalizedKey = key === 'fs' ? 'filesystem' : key;
      if (normalizedKey === 'filesystem') {
        const rules = normalizeFilesystemRules(raw);
        if (rules) {
          entries.set('filesystem', toFilesystemRuleSet(rules));
        }
        continue;
      }
      if (normalizedKey === 'network') {
        const rules = normalizeNetworkRules(raw);
        if (rules) {
          entries.set('network', toNetworkRuleSet(rules));
        }
        continue;
      }
      if (raw === true || raw === '*' || raw === 'all') {
        entries.set(normalizedKey, new Set(['*']));
        continue;
      }
      const vals = normalizeStringList(raw);
      if (vals !== undefined) {
        entries.set(normalizedKey, new Set(vals));
      }
    }
    return { type: 'map', entries };
  }

  return { type: 'map', entries };
}

function fromAllowShape(shape: AllowShape): PolicyConfig['allow'] {
  if (shape.type === 'wildcard') {
    return true;
  }
  const result: Record<string, PolicyCapabilityValue> = {};
  for (const [key, values] of shape.entries.entries()) {
    if (values instanceof Set) {
      if (values.has('*')) {
        result[key] = ['*'];
      } else {
        result[key] = Array.from(values);
      }
      continue;
    }
    if (isFilesystemRuleSet(values)) {
      const rules = fromFilesystemRuleSet(values);
      if (rules) {
        result[key] = rules;
      }
      continue;
    }
    if (isNetworkRuleSet(values)) {
      const rules = fromNetworkRuleSet(values);
      if (rules) {
        result[key] = rules;
      }
    }
  }
  return result;
}

function mergeAllowShapes(a: AllowShape, b: AllowShape): AllowShape {
  if (a.type === 'wildcard') return b;
  if (b.type === 'wildcard') return a;

  const entries = new Map<string, CapabilityEntry>();
  for (const [key, aEntry] of a.entries.entries()) {
    const bEntry = b.entries.get(key);
    if (!bEntry) {
      continue;
    }
    const merged = mergeAllowEntry(aEntry, bEntry);
    if (merged) {
      entries.set(key, merged);
    }
  }

  return { type: 'map', entries };
}

function toDenyShape(value: PolicyConfig['deny']): DenyShape {
  if (value === true || value === '*' || value === 'all') {
    return { type: 'wildcard' };
  }

  const entries = new Map<string, CapabilityEntry>();
  if (Array.isArray(value)) {
    collectCapabilityEntriesFromList(entries, value);
    return { type: 'map', entries };
  }

  if (value && typeof value === 'object') {
    for (const [key, raw] of Object.entries(value)) {
      const normalizedKey = key === 'fs' ? 'filesystem' : key;
      if (normalizedKey === 'filesystem') {
        const rules = normalizeFilesystemRules(raw);
        if (rules) {
          entries.set('filesystem', toFilesystemRuleSet(rules));
        }
        continue;
      }
      if (normalizedKey === 'network') {
        const rules = normalizeNetworkRules(raw);
        if (rules) {
          entries.set('network', toNetworkRuleSet(rules));
        }
        continue;
      }
      if (raw === true || raw === '*' || raw === 'all') {
        entries.set(normalizedKey, new Set(['*']));
        continue;
      }
      const vals = normalizeStringList(raw);
      if (vals !== undefined) {
        entries.set(normalizedKey, new Set(vals));
      }
    }
    return { type: 'map', entries };
  }

  return { type: 'map', entries };
}

function fromDenyShape(shape: DenyShape): PolicyConfig['deny'] {
  if (shape.type === 'wildcard') {
    return true;
  }
  const result: Record<string, PolicyCapabilityValue> = {};
  for (const [key, values] of shape.entries.entries()) {
    if (values instanceof Set) {
      if (values.has('*')) {
        result[key] = ['*'];
      } else {
        result[key] = Array.from(values);
      }
      continue;
    }
    if (isFilesystemRuleSet(values)) {
      const rules = fromFilesystemRuleSet(values);
      if (rules) {
        result[key] = rules;
      }
      continue;
    }
    if (isNetworkRuleSet(values)) {
      const rules = fromNetworkRuleSet(values);
      if (rules) {
        result[key] = rules;
      }
    }
  }
  return result;
}

function mergeDenyShapes(a: DenyShape, b: DenyShape): DenyShape {
  if (a.type === 'wildcard' || b.type === 'wildcard') {
    return { type: 'wildcard' };
  }

  const entries = new Map<string, CapabilityEntry>();
  for (const [key, entry] of a.entries.entries()) {
    entries.set(key, cloneEntry(entry));
  }

  for (const [key, entry] of b.entries.entries()) {
    const existing = entries.get(key);
    if (!existing) {
      entries.set(key, cloneEntry(entry));
      continue;
    }
    const merged = mergeDenyEntry(existing, entry);
    if (merged) {
      entries.set(key, merged);
    }
  }

  return { type: 'map', entries };
}

function mergeAllowEntry(aEntry: CapabilityEntry, bEntry: CapabilityEntry): CapabilityEntry | undefined {
  if (aEntry instanceof Set && bEntry instanceof Set) {
    if (aEntry.has('*')) return new Set(bEntry);
    if (bEntry.has('*')) return new Set(aEntry);
    const intersection = new Set<string>();
    for (const val of aEntry) {
      if (bEntry.has(val)) {
        intersection.add(val);
      }
    }
    return intersection;
  }
  if (isFilesystemRuleSet(aEntry) && isFilesystemRuleSet(bEntry)) {
    return mergeFilesystemAllow(aEntry, bEntry);
  }
  if (isNetworkRuleSet(aEntry) && isNetworkRuleSet(bEntry)) {
    return mergeNetworkAllow(aEntry, bEntry);
  }
  return undefined;
}

function mergeDenyEntry(aEntry: CapabilityEntry, bEntry: CapabilityEntry): CapabilityEntry | undefined {
  if (aEntry instanceof Set && bEntry instanceof Set) {
    if (aEntry.has('*') || bEntry.has('*')) {
      return new Set(['*']);
    }
    const merged = new Set<string>(aEntry);
    for (const val of bEntry) {
      merged.add(val);
    }
    return merged;
  }
  if (isFilesystemRuleSet(aEntry) && isFilesystemRuleSet(bEntry)) {
    return mergeFilesystemDeny(aEntry, bEntry);
  }
  if (isNetworkRuleSet(aEntry) && isNetworkRuleSet(bEntry)) {
    return mergeNetworkDeny(aEntry, bEntry);
  }
  return undefined;
}

function mergeFilesystemAllow(a: PolicyFilesystemRuleSet, b: PolicyFilesystemRuleSet): PolicyFilesystemRuleSet {
  return {
    ...(mergeAllowPatternSet(a.read, b.read) !== undefined
      ? { read: mergeAllowPatternSet(a.read, b.read) }
      : {}),
    ...(mergeAllowPatternSet(a.write, b.write) !== undefined
      ? { write: mergeAllowPatternSet(a.write, b.write) }
      : {})
  };
}

function mergeFilesystemDeny(a: PolicyFilesystemRuleSet, b: PolicyFilesystemRuleSet): PolicyFilesystemRuleSet {
  return {
    ...(mergeDenyPatternSet(a.read, b.read) !== undefined
      ? { read: mergeDenyPatternSet(a.read, b.read) }
      : {}),
    ...(mergeDenyPatternSet(a.write, b.write) !== undefined
      ? { write: mergeDenyPatternSet(a.write, b.write) }
      : {})
  };
}

function mergeNetworkAllow(a: PolicyNetworkRuleSet, b: PolicyNetworkRuleSet): PolicyNetworkRuleSet {
  return {
    ...(mergeAllowPatternSet(a.domains, b.domains) !== undefined
      ? { domains: mergeAllowPatternSet(a.domains, b.domains) }
      : {})
  };
}

function mergeNetworkDeny(a: PolicyNetworkRuleSet, b: PolicyNetworkRuleSet): PolicyNetworkRuleSet {
  return {
    ...(mergeDenyPatternSet(a.domains, b.domains) !== undefined
      ? { domains: mergeDenyPatternSet(a.domains, b.domains) }
      : {})
  };
}

function mergeAllowPatternSet(a?: Set<string>, b?: Set<string>): Set<string> | undefined {
  if (!a || !b) {
    return undefined;
  }
  if (a.has('*')) {
    return new Set(b);
  }
  if (b.has('*')) {
    return new Set(a);
  }
  const intersection = new Set<string>();
  for (const val of a) {
    if (b.has(val)) {
      intersection.add(val);
    }
  }
  return intersection;
}

function mergeDenyPatternSet(a?: Set<string>, b?: Set<string>): Set<string> | undefined {
  if (!a && !b) {
    return undefined;
  }
  if (!a) {
    return new Set(b);
  }
  if (!b) {
    return new Set(a);
  }
  if (a.has('*') || b.has('*')) {
    return new Set(['*']);
  }
  const merged = new Set<string>(a);
  for (const val of b) {
    merged.add(val);
  }
  return merged;
}

function cloneEntry(entry: CapabilityEntry): CapabilityEntry {
  if (entry instanceof Set) {
    return new Set(entry);
  }
  if (isFilesystemRuleSet(entry)) {
    return {
      ...(entry.read ? { read: new Set(entry.read) } : {}),
      ...(entry.write ? { write: new Set(entry.write) } : {})
    };
  }
  if (isNetworkRuleSet(entry)) {
    return {
      ...(entry.domains ? { domains: new Set(entry.domains) } : {})
    };
  }
  return entry;
}

function mergeLimits(a?: PolicyLimits, b?: PolicyLimits): PolicyLimits | undefined {
  if (!a && !b) {
    return undefined;
  }
  const limits: PolicyLimits = {};
  if (a?.maxTokens !== undefined || b?.maxTokens !== undefined) {
    limits.maxTokens = Math.min(
      a?.maxTokens ?? Number.POSITIVE_INFINITY,
      b?.maxTokens ?? Number.POSITIVE_INFINITY
    );
  }
  if (a?.timeout !== undefined || b?.timeout !== undefined) {
    limits.timeout = Math.min(
      a?.timeout ?? Number.POSITIVE_INFINITY,
      b?.timeout ?? Number.POSITIVE_INFINITY
    );
  }
  return limits;
}

function normalizeLimits(limits: PolicyLimits): PolicyLimits {
  const normalized: PolicyLimits = {};
  if (typeof limits.maxTokens === 'number') {
    normalized.maxTokens = limits.maxTokens;
  }
  if (typeof limits.timeout === 'number') {
    normalized.timeout = limits.timeout;
  }
  return normalized;
}

function normalizePolicyDefault(value: PolicyConfig['default']): PolicyConfig['default'] {
  if (value === 'allow' || value === 'deny') {
    return value;
  }
  return undefined;
}

function normalizePolicyAuth(
  auth?: PolicyConfig['auth']
): PolicyConfig['auth'] | undefined {
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) {
    return undefined;
  }

  const result: Record<string, AuthConfig> = {};
  for (const [rawName, entry] of Object.entries(auth)) {
    const name = rawName.trim();
    if (!name) {
      continue;
    }
    const normalized = normalizeAuthConfig(entry);
    if (!normalized) {
      continue;
    }
    result[name] = normalized;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

export function normalizeAuthConfig(entry: unknown): AuthConfig | undefined {
  if (typeof entry === 'string') {
    const envName = entry.trim();
    if (!envName) {
      return undefined;
    }
    return {
      from: `keychain:${KEYCHAIN_SHORT_SERVICE}/${envName}`,
      as: envName
    };
  }

  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return undefined;
  }

  const rawFrom = (entry as { from?: unknown }).from;
  const rawAs = (entry as { as?: unknown }).as;
  if (typeof rawFrom !== 'string' || typeof rawAs !== 'string') {
    return undefined;
  }

  const as = rawAs.trim();
  let from = rawFrom.trim();
  if (!from || !as) {
    return undefined;
  }

  if (from === 'keychain') {
    from = `keychain:${KEYCHAIN_SHORT_SERVICE}/${as}`;
  }

  return { from, as };
}

function normalizePolicyKeychain(
  config?: PolicyConfig['keychain']
): PolicyConfig['keychain'] | undefined {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return undefined;
  }

  const provider = typeof config.provider === 'string' ? config.provider.trim() : '';
  const allow = normalizeStringList(config.allow);
  const deny = normalizeStringList(config.deny);
  const result: PolicyKeychainConfig = {};

  if (provider) {
    result.provider = provider;
  }
  if (allow !== undefined) {
    result.allow = allow;
  }
  if (deny !== undefined) {
    result.deny = deny;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizePolicyLabels(
  labels?: PolicyConfig['labels']
): PolicyConfig['labels'] | undefined {
  if (!labels || typeof labels !== 'object' || Array.isArray(labels)) {
    return undefined;
  }

  const result: PolicyLabels = {};
  for (const [label, rule] of Object.entries(labels)) {
    const normalized = normalizeLabelRule(rule);
    if (normalized) {
      result[label] = normalized;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeLabelRule(raw: unknown): LabelFlowRule | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const allow = normalizeLabelList((raw as LabelFlowRule).allow);
  const deny = normalizeLabelList((raw as LabelFlowRule).deny);
  if (!allow && !deny) {
    return undefined;
  }
  const result: LabelFlowRule = {};
  if (allow) {
    result.allow = allow;
  }
  if (deny) {
    result.deny = deny;
  }
  return result;
}

function normalizeLabelList(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const normalized = value
      .map(entry => String(entry).trim())
      .filter(entry => entry.length > 0);
    return normalized.length > 0 ? Array.from(new Set(normalized)) : [];
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const normalized = String(value).trim();
    return normalized ? [normalized] : [];
  }
  return undefined;
}

function normalizePolicyOperations(
  operations?: PolicyConfig['operations']
): PolicyConfig['operations'] | undefined {
  if (!operations || typeof operations !== 'object' || Array.isArray(operations)) {
    return undefined;
  }

  const result: PolicyOperations = {};
  for (const [riskCategory, labels] of Object.entries(operations)) {
    const normalizedCategory = String(riskCategory).trim();
    const normalizedLabels = normalizeLabelList(labels);
    if (normalizedCategory && normalizedLabels && normalizedLabels.length > 0) {
      result[normalizedCategory] = normalizedLabels;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizePolicySigners(
  signers?: PolicyConfig['signers']
): PolicyConfig['signers'] | undefined {
  if (!signers || typeof signers !== 'object' || Array.isArray(signers)) {
    return undefined;
  }

  const result: Record<string, PolicySignerRule> = {};
  for (const [identityPattern, labels] of Object.entries(signers)) {
    const normalizedPattern = String(identityPattern).trim();
    const normalizedLabels = normalizeLabelList(labels);
    if (normalizedPattern && normalizedLabels && normalizedLabels.length > 0) {
      result[normalizedPattern] = normalizedLabels;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizePolicyFilesystemIntegrityRule(
  raw: unknown
): PolicyFileIntegrityRule | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }

  const mutable =
    typeof (raw as PolicyFileIntegrityRule).mutable === 'boolean'
      ? (raw as PolicyFileIntegrityRule).mutable
      : undefined;
  const authorizedIdentities = normalizeStringList(
    (raw as PolicyFileIntegrityRule).authorizedIdentities
  );

  const result: PolicyFileIntegrityRule = {};
  if (mutable !== undefined) {
    result.mutable = mutable;
  }
  if (authorizedIdentities !== undefined) {
    result.authorizedIdentities = authorizedIdentities;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizePolicyFilesystemIntegrity(
  rules?: PolicyConfig['filesystem_integrity']
): PolicyConfig['filesystem_integrity'] | undefined {
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) {
    return undefined;
  }

  const result: Record<string, PolicyFileIntegrityRule> = {};
  for (const [pathPattern, rawRule] of Object.entries(rules)) {
    const normalizedPattern = String(pathPattern).trim();
    const normalizedRule = normalizePolicyFilesystemIntegrityRule(rawRule);
    if (normalizedPattern && normalizedRule) {
      result[normalizedPattern] = normalizedRule;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function mergePolicyOperations(
  base?: PolicyConfig['operations'],
  incoming?: PolicyConfig['operations']
): PolicyConfig['operations'] | undefined {
  if (!base && !incoming) {
    return undefined;
  }

  const result: PolicyOperations = {};
  for (const [riskCategory, labels] of Object.entries(base ?? {})) {
    if (labels.length > 0) {
      result[riskCategory] = [...labels];
    }
  }
  for (const [riskCategory, labels] of Object.entries(incoming ?? {})) {
    if (labels.length === 0) {
      continue;
    }
    result[riskCategory] = mergeLabelListUnion(result[riskCategory], labels) ?? [];
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function mergePolicySigners(
  base?: PolicyConfig['signers'],
  incoming?: PolicyConfig['signers']
): PolicyConfig['signers'] | undefined {
  if (!base && !incoming) {
    return undefined;
  }

  const result: Record<string, PolicySignerRule> = {};
  for (const [identityPattern, labels] of Object.entries(base ?? {})) {
    if (labels.length > 0) {
      result[identityPattern] = [...labels];
    }
  }
  for (const [identityPattern, labels] of Object.entries(incoming ?? {})) {
    if (labels.length === 0) {
      continue;
    }
    result[identityPattern] = mergeLabelListUnion(result[identityPattern], labels) ?? [];
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function mergePolicyFilesystemIntegrity(
  base?: PolicyConfig['filesystem_integrity'],
  incoming?: PolicyConfig['filesystem_integrity']
): PolicyConfig['filesystem_integrity'] | undefined {
  if (!base && !incoming) {
    return undefined;
  }

  const result: Record<string, PolicyFileIntegrityRule> = {
    ...(base ?? {})
  };

  for (const [pathPattern, rule] of Object.entries(incoming ?? {})) {
    const current = result[pathPattern] ?? {};
    result[pathPattern] = {
      ...current,
      ...rule
    };
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function mergePolicyLabels(
  base?: PolicyConfig['labels'],
  incoming?: PolicyConfig['labels']
): PolicyConfig['labels'] | undefined {
  if (!base && !incoming) {
    return undefined;
  }

  const result: PolicyLabels = { ...(base ?? {}) };
  for (const [label, rule] of Object.entries(incoming ?? {})) {
    if (!result[label]) {
      result[label] = rule;
      continue;
    }

    const current = result[label] ?? {};
    result[label] = {
      deny: mergeLabelListUnion(current.deny, rule.deny),
      allow: mergeLabelListIntersection(current.allow, rule.allow)
    };
  }

  return result;
}

function mergeLabelListUnion(a?: string[], b?: string[]): string[] | undefined {
  if (!a && !b) {
    return undefined;
  }
  return Array.from(new Set([...(a ?? []), ...(b ?? [])]));
}

function mergeLabelListIntersection(a?: string[], b?: string[]): string[] | undefined {
  if (!a && !b) {
    return undefined;
  }
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  const set = new Set(a);
  return b.filter(item => set.has(item));
}

function mergePolicyAuth(
  base?: PolicyConfig['auth'],
  incoming?: PolicyConfig['auth']
): PolicyConfig['auth'] | undefined {
  if (!base && !incoming) {
    return undefined;
  }
  return { ...(base ?? {}), ...(incoming ?? {}) };
}

function mergePolicyKeychain(
  base?: PolicyConfig['keychain'],
  incoming?: PolicyConfig['keychain']
): PolicyConfig['keychain'] | undefined {
  if (!base && !incoming) {
    return undefined;
  }

  const normalizedBase = normalizePolicyKeychain(base);
  const normalizedIncoming = normalizePolicyKeychain(incoming);
  if (!normalizedBase && !normalizedIncoming) {
    return undefined;
  }

  const provider = normalizedIncoming?.provider ?? normalizedBase?.provider;
  const allow = mergeKeychainAllowList(normalizedBase?.allow, normalizedIncoming?.allow);
  const deny = mergeStringLists(normalizedBase?.deny, normalizedIncoming?.deny);
  const result: PolicyKeychainConfig = {};

  if (provider) {
    result.provider = provider;
  }
  if (allow !== undefined) {
    result.allow = allow;
  }
  if (deny !== undefined) {
    result.deny = deny;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function mergeKeychainAllowList(
  base?: string[],
  incoming?: string[]
): string[] | undefined {
  if (!base && !incoming) {
    return undefined;
  }
  if (!base) {
    return incoming;
  }
  if (!incoming) {
    return base;
  }
  if (base.includes('*') || base.includes('**')) {
    return incoming;
  }
  if (incoming.includes('*') || incoming.includes('**')) {
    return base;
  }
  const incomingSet = new Set(incoming);
  return base.filter(entry => incomingSet.has(entry));
}

function mergePolicyDefault(
  base?: PolicyConfig['default'],
  incoming?: PolicyConfig['default']
): PolicyConfig['default'] | undefined {
  if (incoming === undefined) {
    return base;
  }
  return incoming;
}
