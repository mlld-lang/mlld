export type PolicyLimits = {
  maxTokens?: number;
  timeout?: number;
};

export type PolicyConfig = {
  allow?: Record<string, string[] | true> | true;
  deny?: Record<string, string[] | true> | true;
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

  const baseAllow = toAllowShape(base.allow);
  const incomingAllow = toAllowShape(incoming.allow);
  const mergedAllow = mergeAllowShapes(baseAllow, incomingAllow);

  const baseDeny = toDenyShape(base.deny);
  const incomingDeny = toDenyShape(incoming.deny);
  const mergedDeny = mergeDenyShapes(baseDeny, incomingDeny);

  const limits = mergeLimits(base.limits, incoming.limits);

  return {
    allow: fromAllowShape(mergedAllow),
    deny: fromDenyShape(mergedDeny),
    ...(limits ? { limits } : {})
  };
}

export function normalizePolicyConfig(config?: PolicyConfig): PolicyConfig {
  if (!config) {
    return {};
  }
  const allow = config.allow !== undefined ? fromAllowShape(toAllowShape(config.allow)) : undefined;
  const deny = config.deny !== undefined ? fromDenyShape(toDenyShape(config.deny)) : undefined;
  const limits = config.limits ? normalizeLimits(config.limits) : undefined;
  return { allow, deny, ...(limits ? { limits } : {}) };
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
