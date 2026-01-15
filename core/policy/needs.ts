import { MlldInterpreterError } from '@core/errors';
import type { PackageRequirement, PackageRequirementMap } from '@core/registry/types';
import { parseVersionSpecifier } from '@core/registry/utils/ModuleNeeds';
import type { PolicyConfig } from '@core/policy/union';

const PACKAGE_ECOSYSTEM_ALIASES: Record<string, string> = {
  node: 'node',
  js: 'node',
  python: 'python',
  py: 'python',
  ruby: 'ruby',
  rb: 'ruby',
  go: 'go',
  rust: 'rust'
};

const BOOLEAN_CAPABILITY_ALIASES: Record<string, string> = {
  sh: 'sh',
  bash: 'sh',
  network: 'network',
  net: 'network',
  filesystem: 'filesystem',
  fs: 'filesystem',
  keychain: 'keychain'
};

export interface CommandNeedDetail {
  list?: string[];
  methods?: string[];
  subcommands?: string[];
  flags?: string[];
  wildcard?: boolean;
}

export type CommandNeeds =
  | { type: 'all' }
  | { type: 'list'; commands: string[] }
  | { type: 'map'; entries: Record<string, CommandNeedDetail> };

export interface NeedsDeclaration {
  packages: PackageRequirementMap;
  cmd?: CommandNeeds;
  sh?: boolean;
  network?: boolean;
  filesystem?: boolean;
  keychain?: boolean;
}

export interface WantsTier {
  tier: string;
  why?: string;
  needs: NeedsDeclaration;
}

export interface PolicyCapabilities {
  allowAll?: boolean;
  cmd?: CommandNeeds;
  sh?: boolean;
  network?: boolean;
  filesystem?: boolean;
  keychain?: boolean;
}

export const ALLOW_ALL_POLICY: PolicyCapabilities = Object.freeze({
  allowAll: true,
  cmd: { type: 'all' },
  sh: true,
  network: true,
  filesystem: true,
  keychain: true
});

export function normalizeNeedsDeclaration(raw: unknown, context: string = 'needs'): NeedsDeclaration {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new MlldInterpreterError(`/${context} expects an object`, {
      code: 'INVALID_NEEDS_DECLARATION'
    });
  }

  const rawObj = raw as Record<string, unknown>;
  const result: NeedsDeclaration = {
    packages: {}
  };

  const commandNeeds = normalizeCommandNeeds(rawObj.cmd);
  const bareCommands = normalizeBareCommands(rawObj.__commands);

  for (const [key, value] of Object.entries(rawObj)) {
    if (key === 'cmd' || key === '__commands') {
      continue;
    }

    const packageKey = PACKAGE_ECOSYSTEM_ALIASES[key];
    if (packageKey) {
      const normalized = normalizePackages(value, packageKey, context);
      const existing = result.packages[packageKey] || [];
      const merged = [...existing];
      for (const pkg of normalized) {
        if (!merged.find(p => p.name === pkg.name && p.specifier === pkg.specifier)) {
          merged.push(pkg);
        }
      }
      result.packages[packageKey] = merged;
      continue;
    }

    const booleanKey = BOOLEAN_CAPABILITY_ALIASES[key];
    if (booleanKey === 'sh') {
      result.sh = Boolean(value === undefined ? true : value) || result.sh === true;
      continue;
    }
    if (booleanKey === 'network') {
      result.network = Boolean(value === undefined ? true : value) || result.network === true;
      continue;
    }
    if (booleanKey === 'filesystem') {
      result.filesystem = Boolean(value === undefined ? true : value) || result.filesystem === true;
      continue;
    }
    if (booleanKey === 'keychain') {
      result.keychain = Boolean(value === undefined ? true : value) || result.keychain === true;
      continue;
    }

    throw new MlldInterpreterError(`/${context} contains unsupported key '${key}'`, {
      code: 'INVALID_NEEDS_KEY'
    });
  }

  if (commandNeeds) {
    result.cmd = commandNeeds;
  }

  if (bareCommands.length > 0) {
    result.cmd = mergeCommandNeeds(
      result.cmd,
      { type: 'list', commands: bareCommands }
    );
  }

  return result;
}

export function normalizeWantsDeclaration(raw: unknown): WantsTier[] {
  if (raw === undefined || raw === null) {
    return [];
  }

  if (!Array.isArray(raw)) {
    throw new MlldInterpreterError('/wants expects an array of tier objects', {
      code: 'INVALID_WANTS_DECLARATION'
    });
  }

  return raw.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new MlldInterpreterError(`/wants tier at index ${index} is not an object`, {
        code: 'INVALID_WANTS_TIER'
      });
    }

    const tierObj = entry as Record<string, unknown>;
    const tierValue = tierObj.tier;
    if (typeof tierValue !== 'string' || tierValue.trim().length === 0) {
      throw new MlldInterpreterError(`/wants tier at index ${index} is missing required 'tier'`, {
        code: 'INVALID_WANTS_TIER'
      });
    }

    const { tier, why, ...rest } = tierObj as Record<string, unknown>;

    const needs = normalizeNeedsDeclaration(rest, 'wants');
    const allowedKeys = new Set([
      'tier',
      'why',
      'cmd',
      '__commands',
      ...Object.keys(PACKAGE_ECOSYSTEM_ALIASES),
      ...Object.keys(BOOLEAN_CAPABILITY_ALIASES)
    ]);
    for (const key of Object.keys(tierObj)) {
      if (!allowedKeys.has(key)) {
        throw new MlldInterpreterError(`/wants tier '${tierValue}' contains unsupported key '${key}'`, {
          code: 'INVALID_WANTS_KEY'
        });
      }
    }

    return {
      tier: tierValue,
      why: typeof why === 'string' ? why : undefined,
      needs
    };
  });
}

export function policySatisfiesNeeds(needs: NeedsDeclaration, policy: PolicyCapabilities): boolean {
  if (policy.allowAll) {
    return true;
  }

  if (needs.sh && policy.sh !== true) {
    return false;
  }
  if (needs.network && policy.network !== true) {
    return false;
  }
  if (needs.filesystem && policy.filesystem !== true) {
    return false;
  }
  if (needs.keychain && policy.keychain !== true) {
    return false;
  }

  if (needs.cmd) {
    if (!policy.cmd) {
      // No explicit policy, treat as allow all commands when not locked down
      return true;
    }
    if (!commandsAllowed(needs.cmd, policy.cmd)) {
      return false;
    }
  }

  return true;
}

function isDenied(
  capability: string,
  deny: Record<string, string[] | true> | true
): boolean {
  if (deny === true) return true;
  const denyValue = deny[capability];
  if (denyValue === true) return true;
  if (Array.isArray(denyValue) && denyValue.includes('*')) return true;
  return false;
}

export function policyConfigPermitsTier(
  tierNeeds: NeedsDeclaration,
  policyConfig: PolicyConfig | undefined
): boolean {
  if (!policyConfig) return true;

  if (policyConfig.deny) {
    if (policyConfig.deny === true) return false;

    if (tierNeeds.sh && isDenied('sh', policyConfig.deny)) return false;
    if (tierNeeds.network && isDenied('network', policyConfig.deny)) return false;
    if (tierNeeds.filesystem && isDenied('filesystem', policyConfig.deny)) return false;
    if (tierNeeds.keychain && isDenied('keychain', policyConfig.deny)) return false;

    if (tierNeeds.cmd) {
      if (isDenied('cmd', policyConfig.deny)) {
        return false;
      }
    }
  }

  return true;
}

export function selectWantsTier(
  wants: WantsTier[],
  policy: PolicyCapabilities,
  policyConfig?: PolicyConfig
): { tier: string; granted: NeedsDeclaration } | null {
  for (const tier of wants) {
    if (!policySatisfiesNeeds(tier.needs, policy)) continue;
    if (!policyConfigPermitsTier(tier.needs, policyConfig)) continue;
    return { tier: tier.tier, granted: tier.needs };
  }
  return null;
}

export function mergeNeedsDeclarations(
  base: NeedsDeclaration | undefined,
  incoming: NeedsDeclaration
): NeedsDeclaration {
  if (!base) {
    return incoming;
  }

  const mergedPackages: PackageRequirementMap = { ...(base.packages || {}) };
  for (const [ecosystem, pkgs] of Object.entries(incoming.packages || {})) {
    const existing = mergedPackages[ecosystem] || [];
    const combined = [...existing];
    for (const pkg of pkgs) {
      if (!combined.find(p => p.name === pkg.name && p.specifier === pkg.specifier)) {
        combined.push(pkg);
      }
    }
    mergedPackages[ecosystem] = combined;
  }

  return {
    packages: mergedPackages,
    sh: base.sh || incoming.sh,
    network: base.network || incoming.network,
    filesystem: base.filesystem || incoming.filesystem,
    keychain: base.keychain || incoming.keychain,
    cmd: mergeCommandNeeds(base.cmd, incoming.cmd)
  };
}

function normalizeCommandNeeds(raw: unknown): CommandNeeds | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  // Wildcard support
  if (raw === '*' || (typeof raw === 'object' && (raw as any).type === 'wildcard')) {
    return { type: 'all' };
  }

  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (obj.type === 'list') {
      const commands = normalizeStringArray((obj as any).items, 'cmd list');
      return { type: 'list', commands };
    }
    if (obj.type === 'map') {
      const entries = normalizeCommandMap(obj.entries);
      return { type: 'map', entries };
    }
    if (Array.isArray(obj.items)) {
      const commands = normalizeStringArray(obj.items, 'cmd list');
      return { type: 'list', commands };
    }
    if (obj.entries && typeof obj.entries === 'object') {
      const entries = normalizeCommandMap(obj.entries as Record<string, unknown>);
      return { type: 'map', entries };
    }
  }

  if (Array.isArray(raw)) {
    const commands = normalizeStringArray(raw, 'cmd list');
    return { type: 'list', commands };
  }

  if (typeof raw === 'string') {
    return { type: 'list', commands: [raw] };
  }

  throw new MlldInterpreterError('Invalid /needs cmd declaration', {
    code: 'INVALID_NEEDS_CMD'
  });
}

function normalizeBareCommands(raw: unknown): string[] {
  if (!raw) {
    return [];
  }
  if (Array.isArray(raw)) {
    return normalizeStringArray(raw, 'command list');
  }
  return normalizeStringArray([raw], 'command list');
}

function normalizeStringArray(raw: unknown, label: string): string[] {
  if (!Array.isArray(raw)) {
    throw new MlldInterpreterError(`Expected array for ${label}`, {
      code: 'INVALID_NEEDS_VALUE'
    });
  }
  const values = raw
    .map(item => {
      if (typeof item === 'string') {
        return item;
      }
      if (item && typeof item === 'object' && 'toString' in item) {
        return String(item as any);
      }
      throw new MlldInterpreterError(`Expected string entries for ${label}`, {
        code: 'INVALID_NEEDS_VALUE'
      });
    })
    .map(str => str.trim())
    .filter(str => str.length > 0);
  return Array.from(new Set(values));
}

function normalizeCommandMap(raw: unknown): Record<string, CommandNeedDetail> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new MlldInterpreterError('Invalid command map in /needs', {
      code: 'INVALID_NEEDS_CMD'
    });
  }

  const result: Record<string, CommandNeedDetail> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    result[name] = normalizeCommandDetail(value);
  }
  return result;
}

function normalizeCommandDetail(raw: unknown): CommandNeedDetail {
  if (raw === '*' || (raw && typeof raw === 'object' && (raw as any).type === 'wildcard')) {
    return { wildcard: true };
  }

  if (Array.isArray(raw)) {
    return { list: normalizeStringArray(raw, 'command detail') };
  }

  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (obj.type === 'list') {
      return { list: normalizeStringArray((obj as any).items ?? [], 'command detail') };
    }
    if (obj.type === 'detail' && obj.props && typeof obj.props === 'object') {
      return normalizeCommandDetail((obj as any).props);
    }
    const detail: CommandNeedDetail = {};
    if (obj.methods !== undefined) {
      detail.methods = normalizeStringArray(obj.methods, 'command methods');
    }
    if (obj.subcommands !== undefined) {
      detail.subcommands = normalizeStringArray(obj.subcommands, 'command subcommands');
    }
    if (obj.flags !== undefined) {
      detail.flags = normalizeStringArray(obj.flags, 'command flags');
    }
    if (Object.keys(detail).length === 0) {
      return { list: [] };
    }
    return detail;
  }

  if (typeof raw === 'string') {
    return { list: [raw] };
  }

  throw new MlldInterpreterError('Invalid command detail in /needs', {
    code: 'INVALID_NEEDS_CMD'
  });
}

function normalizePackages(raw: unknown, ecosystem: string, context: string): PackageRequirement[] {
  if (!Array.isArray(raw)) {
    throw new MlldInterpreterError(`/${context} ${ecosystem} expects an array of packages`, {
      code: 'INVALID_NEEDS_PACKAGES'
    });
  }

  const packages: PackageRequirement[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') {
      throw new MlldInterpreterError(`/${context} ${ecosystem} entries must be strings`, {
        code: 'INVALID_NEEDS_PACKAGES'
      });
    }
    const parsed = parseVersionSpecifier(entry);
    if (!parsed.name) {
      throw new MlldInterpreterError(`/${context} ${ecosystem} entry '${entry}' is invalid`, {
        code: 'INVALID_NEEDS_PACKAGES'
      });
    }
    if (!packages.find(pkg => pkg.name === parsed.name && pkg.specifier === parsed.specifier)) {
      packages.push(parsed);
    }
  }
  return packages;
}

function commandsAllowed(needs: CommandNeeds, policy: CommandNeeds): boolean {
  if (policy.type === 'all' || needs.type === 'list' && policy.type === 'all') {
    return true;
  }

  if (needs.type === 'all' && policy.type !== 'all') {
    return false;
  }

  if (needs.type === 'list') {
    if (policy.type === 'list') {
      return needs.commands.every(cmd => policy.commands.includes(cmd));
    }
    if (policy.type === 'map') {
      return needs.commands.every(cmd => Boolean(policy.entries[cmd]));
    }
  }

  if (needs.type === 'map') {
    if (policy.type === 'all') {
      return true;
    }
    if (policy.type === 'list') {
      return Object.keys(needs.entries).every(cmd => policy.commands.includes(cmd));
    }
    if (policy.type === 'map') {
      return Object.keys(needs.entries).every(cmd => Boolean(policy.entries[cmd]));
    }
  }

  return true;
}

function mergeCommandNeeds(base?: CommandNeeds, incoming?: CommandNeeds): CommandNeeds | undefined {
  if (!base) return incoming;
  if (!incoming) return base;

  if (base.type === 'all' || incoming.type === 'all') {
    return { type: 'all' };
  }

  if (base.type === 'list' && incoming.type === 'list') {
    const combined = Array.from(new Set([...base.commands, ...incoming.commands]));
    return { type: 'list', commands: combined };
  }

  if (base.type === 'map' && incoming.type === 'map') {
    return { type: 'map', entries: { ...base.entries, ...incoming.entries } };
  }

  if (base.type === 'map' && incoming.type === 'list') {
    const entries = { ...base.entries };
    for (const cmd of incoming.commands) {
      entries[cmd] = entries[cmd] || { list: [] };
    }
    return { type: 'map', entries };
  }

  if (base.type === 'list' && incoming.type === 'map') {
    const entries = { ...incoming.entries };
    for (const cmd of base.commands) {
      entries[cmd] = entries[cmd] || { list: [] };
    }
    return { type: 'map', entries };
  }

  return incoming;
}
