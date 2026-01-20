export type PolicyLimits = {
  maxTokens?: number;
  timeout?: number;
};

export type PolicyEnvironmentConfig = {
  default?: string;
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

export type AuthConfig = {
  from: string;
  as: string;
};

export type LabelFlowRule = {
  deny?: string[];
  allow?: string[];
};

export type PolicyLabels = Record<string, LabelFlowRule>;

export type PolicyFilesystemRules = {
  read?: string[];
  write?: string[];
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
};

export type PolicyConfig = {
  defaults?: PolicyDefaults;
  default?: 'deny' | 'allow';
  auth?: Record<string, AuthConfig>;
  allow?: Record<string, PolicyCapabilityValue> | string[] | true;
  deny?: Record<string, PolicyCapabilityValue> | string[] | true;
  capabilities?: PolicyCapabilitiesConfig;
  labels?: PolicyLabels;
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
  const auth = mergePolicyAuth(normalizedBase.auth, normalizedIncoming.auth);
  const defaultStance = mergePolicyDefault(normalizedBase.default, normalizedIncoming.default);
  const defaults = mergePolicyDefaults(normalizedBase.defaults, normalizedIncoming.defaults);
  const envConfig = mergePolicyEnv(normalizedBase.env, normalizedIncoming.env);
  const limits = mergeLimits(normalizedBase.limits, normalizedIncoming.limits);

  return {
    ...(defaults ? { defaults } : {}),
    ...(defaultStance ? { default: defaultStance } : {}),
    ...(auth ? { auth } : {}),
    allow: fromAllowShape(mergedAllow),
    deny: fromDenyShape(mergedDeny),
    ...(labels ? { labels } : {}),
    ...(envConfig ? { env: envConfig } : {}),
    ...(limits ? { limits } : {})
  };
}

export function normalizePolicyConfig(config?: PolicyConfig): PolicyConfig {
  if (!config) {
    return {};
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
  const auth = normalizePolicyAuth(config.auth);
  const defaultStance = normalizePolicyDefault(config.default);
  const defaults = normalizePolicyDefaults(config.defaults);
  const envConfig = normalizePolicyEnv(config.env);
  const limits = config.limits ? normalizeLimits(config.limits) : undefined;
  return {
    ...(defaults ? { defaults } : {}),
    ...(defaultStance ? { default: defaultStance } : {}),
    ...(auth ? { auth } : {}),
    allow,
    deny,
    ...(labels ? { labels } : {}),
    ...(envConfig ? { env: envConfig } : {}),
    ...(limits ? { limits } : {})
  };
}

function normalizePolicyEnv(
  config?: PolicyEnvironmentConfig
): PolicyEnvironmentConfig | undefined {
  if (!config) {
    return undefined;
  }
  const defaultProvider =
    typeof config.default === 'string' && config.default.trim().length > 0
      ? config.default.trim()
      : undefined;
  if (!defaultProvider) {
    return undefined;
  }
  return { default: defaultProvider };
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

function normalizeFilesystemRules(value: unknown): PolicyFilesystemRules | undefined {
  if (value === true || value === '*' || value === 'all') {
    return { read: ['*'], write: ['*'] };
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
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeFilesystemRuleList(value: unknown): string[] | undefined {
  if (value === true || value === '*' || value === 'all') {
    return ['*'];
  }
  return normalizeStringList(value);
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
  if (!defaultProvider) {
    return undefined;
  }
  return { default: defaultProvider };
}

function toAllowShape(value: PolicyConfig['allow']): AllowShape {
  if (value === true || value === '*' || value === 'all') {
    return { type: 'wildcard' };
  }

  const entries = new Map<string, CapabilityEntry>();
  if (Array.isArray(value)) {
    for (const entry of value) {
      const key = String(entry).trim();
      if (!key) {
        continue;
      }
      entries.set(key, new Set(['*']));
    }
    return { type: 'map', entries };
  }

  if (value && typeof value === 'object') {
    for (const [key, raw] of Object.entries(value)) {
      if (key === 'filesystem') {
        const rules = normalizeFilesystemRules(raw);
        if (rules) {
          entries.set(key, toFilesystemRuleSet(rules));
        }
        continue;
      }
      if (key === 'network') {
        const rules = normalizeNetworkRules(raw);
        if (rules) {
          entries.set(key, toNetworkRuleSet(rules));
        }
        continue;
      }
      if (raw === true || raw === '*' || raw === 'all') {
        entries.set(key, new Set(['*']));
        continue;
      }
      const vals = normalizeStringList(raw);
      if (vals !== undefined) {
        entries.set(key, new Set(vals));
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
    for (const entry of value) {
      const key = String(entry).trim();
      if (!key) {
        continue;
      }
      entries.set(key, new Set(['*']));
    }
    return { type: 'map', entries };
  }

  if (value && typeof value === 'object') {
    for (const [key, raw] of Object.entries(value)) {
      if (key === 'filesystem') {
        const rules = normalizeFilesystemRules(raw);
        if (rules) {
          entries.set(key, toFilesystemRuleSet(rules));
        }
        continue;
      }
      if (key === 'network') {
        const rules = normalizeNetworkRules(raw);
        if (rules) {
          entries.set(key, toNetworkRuleSet(rules));
        }
        continue;
      }
      if (raw === true || raw === '*' || raw === 'all') {
        entries.set(key, new Set(['*']));
        continue;
      }
      const vals = normalizeStringList(raw);
      if (vals !== undefined) {
        entries.set(key, new Set(vals));
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
  for (const [name, entry] of Object.entries(auth)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    const from = (entry as AuthConfig).from;
    const as = (entry as AuthConfig).as;
    if (typeof from !== 'string' || typeof as !== 'string') {
      continue;
    }
    const trimmedFrom = from.trim();
    const trimmedAs = as.trim();
    if (!trimmedFrom || !trimmedAs) {
      continue;
    }
    result[name] = { from: trimmedFrom, as: trimmedAs };
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

function mergePolicyDefault(
  base?: PolicyConfig['default'],
  incoming?: PolicyConfig['default']
): PolicyConfig['default'] | undefined {
  if (incoming === undefined) {
    return base;
  }
  return incoming;
}
