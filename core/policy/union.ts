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

export type PolicyConfig = {
  defaults?: PolicyDefaults;
  default?: 'deny' | 'allow';
  auth?: Record<string, AuthConfig>;
  allow?: Record<string, string[] | true> | true;
  deny?: Record<string, string[] | true> | true;
  labels?: PolicyLabels;
  env?: PolicyEnvironmentConfig;
  limits?: PolicyLimits;
};

type AllowShape =
  | { type: 'wildcard' }
  | { type: 'map'; entries: Map<string, Set<string>> };

type DenyShape =
  | { type: 'wildcard' }
  | { type: 'map'; entries: Map<string, Set<string>> };

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
  const allow = config.allow !== undefined ? fromAllowShape(toAllowShape(config.allow)) : undefined;
  const deny = config.deny !== undefined ? fromDenyShape(toDenyShape(config.deny)) : undefined;
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

  const entries = new Map<string, Set<string>>();
  if (Array.isArray(value)) {
    entries.set('default', new Set(value.map(String)));
    return { type: 'map', entries };
  }

  if (value && typeof value === 'object') {
    for (const [key, raw] of Object.entries(value)) {
      if (raw === true || raw === '*' || raw === 'all') {
        entries.set(key, new Set(['*']));
        continue;
      }
      const vals = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      entries.set(key, new Set(vals));
    }
    return { type: 'map', entries };
  }

  return { type: 'map', entries };
}

function fromAllowShape(shape: AllowShape): PolicyConfig['allow'] {
  if (shape.type === 'wildcard') {
    return true;
  }
  const result: Record<string, string[]> = {};
  for (const [key, values] of shape.entries.entries()) {
    if (values.has('*')) {
      result[key] = ['*'];
    } else {
      result[key] = Array.from(values);
    }
  }
  return result;
}

function mergeAllowShapes(a: AllowShape, b: AllowShape): AllowShape {
  if (a.type === 'wildcard') return b;
  if (b.type === 'wildcard') return a;

  const entries = new Map<string, Set<string>>();
  for (const [key, aSet] of a.entries.entries()) {
    const bSet = b.entries.get(key);
    if (!bSet) {
      continue;
    }
    if (aSet.has('*')) {
      entries.set(key, new Set(bSet));
    } else if (bSet.has('*')) {
      entries.set(key, new Set(aSet));
    } else {
      const intersection = new Set<string>();
      for (const val of aSet) {
        if (bSet.has(val)) {
          intersection.add(val);
        }
      }
      entries.set(key, intersection);
    }
  }

  return { type: 'map', entries };
}

function toDenyShape(value: PolicyConfig['deny']): DenyShape {
  if (value === true || value === '*' || value === 'all') {
    return { type: 'wildcard' };
  }

  const entries = new Map<string, Set<string>>();
  if (Array.isArray(value)) {
    entries.set('default', new Set(value.map(String)));
    return { type: 'map', entries };
  }

  if (value && typeof value === 'object') {
    for (const [key, raw] of Object.entries(value)) {
      if (raw === true || raw === '*' || raw === 'all') {
        entries.set(key, new Set(['*']));
        continue;
      }
      const vals = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      entries.set(key, new Set(vals));
    }
    return { type: 'map', entries };
  }

  return { type: 'map', entries };
}

function fromDenyShape(shape: DenyShape): PolicyConfig['deny'] {
  if (shape.type === 'wildcard') {
    return true;
  }
  const result: Record<string, string[]> = {};
  for (const [key, values] of shape.entries.entries()) {
    if (values.has('*')) {
      result[key] = ['*'];
    } else {
      result[key] = Array.from(values);
    }
  }
  return result;
}

function mergeDenyShapes(a: DenyShape, b: DenyShape): DenyShape {
  if (a.type === 'wildcard' || b.type === 'wildcard') {
    return { type: 'wildcard' };
  }

  const entries = new Map<string, Set<string>>();
  for (const [key, set] of a.entries.entries()) {
    entries.set(key, new Set(set));
  }

  for (const [key, set] of b.entries.entries()) {
    const existing = entries.get(key);
    if (!existing) {
      entries.set(key, new Set(set));
      continue;
    }
    if (existing.has('*') || set.has('*')) {
      entries.set(key, new Set(['*']));
      continue;
    }
    for (const val of set) {
      existing.add(val);
    }
  }

  return { type: 'map', entries };
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
