import type { SourceLocation } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import type { PolicyConfig } from './union';
import type { CommandAccessDecision, CapabilityAccessDecision } from './guards';
import type { DenialContext } from '@core/errors/denial';
import { MlldDenialError } from '@core/errors/denial';
import {
  getCommandTokens,
  matchesCommandPattern,
  normalizeCommandPatternEntry,
  parseCommandPatternTokens
} from './capability-patterns';

/**
 * Get the display name for the active policy from the environment.
 * Falls back to 'policy' if no active policies are found.
 */
function getPolicyDisplayName(env: Environment): string {
  const policyContext = env.getPolicyContext() as Record<string, unknown> | undefined;
  if (policyContext) {
    const activePolicies = policyContext.activePolicies;
    if (Array.isArray(activePolicies) && activePolicies.length > 0) {
      return activePolicies.join(', ');
    }
  }
  return 'policy';
}

/**
 * Normalize a list of command pattern entries.
 */
function normalizeCommandPatternList(value: unknown): { all: boolean; patterns: string[] } {
  if (value === true || value === '*' || value === 'all') {
    return { all: true, patterns: [] };
  }
  if (value === undefined || value === null) {
    return { all: false, patterns: [] };
  }
  const entries = Array.isArray(value) ? value : [value];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of entries) {
    const raw = String(entry).trim();
    if (!raw) continue;
    const commandPattern = normalizeCommandPatternEntry(raw);
    const result = commandPattern ?? raw;
    if (!seen.has(result)) {
      seen.add(result);
      normalized.push(result);
    }
  }
  const all = normalized.includes('*');
  const patterns = normalized.filter(entry => entry !== '*');
  return { all, patterns };
}

/**
 * Extract command patterns from a policy allow/deny value.
 */
function extractCommandPatterns(
  value: PolicyConfig['allow'] | PolicyConfig['deny'] | undefined
): { all: boolean; patterns: string[] } | undefined {
  if (!value || value === true) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const seen = new Set<string>();
    const patterns: string[] = [];
    for (const entry of value) {
      const raw = String(entry).trim();
      if (!raw) continue;
      const result = normalizeCommandPatternEntry(raw) ?? '';
      if (result && !seen.has(result)) {
        seen.add(result);
        patterns.push(result);
      }
    }
    if (patterns.length === 0) {
      return undefined;
    }
    const all = patterns.includes('*');
    return { all, patterns: patterns.filter(entry => entry !== '*') };
  }
  if (typeof value === 'object') {
    const raw = (value as Record<string, unknown>).cmd;
    if (raw === undefined) {
      return undefined;
    }
    return normalizeCommandPatternList(raw);
  }
  return undefined;
}

/**
 * Infer which policy rule caused a command denial.
 * Mirrors the logic in guards.ts inferCapabilityRule.
 */
function normalizeDenyPattern(pattern: string): string {
  const trimmed = pattern.trim();
  if (!trimmed) {
    return trimmed;
  }
  const tokens = parseCommandPatternTokens(trimmed);
  if (tokens.length >= 2 && !tokens.includes('*')) {
    return `${trimmed}:*`;
  }
  return trimmed;
}

function matchesDenyCommandPatterns(commandTokens: string[], patterns: string[]): boolean {
  if (patterns.length === 0) {
    return false;
  }
  return patterns.some(pattern => matchesCommandPattern(commandTokens, normalizeDenyPattern(pattern)));
}

function inferCommandDenialRule(policy: PolicyConfig, commandText: string): string {
  const deny = policy.deny;
  const denyMap = deny && deny !== true && typeof deny === 'object' && !Array.isArray(deny) ? deny : undefined;
  const denyPatterns = extractCommandPatterns(deny) ?? (denyMap?.cmd !== undefined ? normalizeCommandPatternList(denyMap.cmd) : undefined);
  if (denyPatterns) {
    const tokens = getCommandTokens(commandText);
    if (denyPatterns.all || matchesDenyCommandPatterns(tokens, denyPatterns.patterns)) {
      return 'deny.cmd';
    }
  }
  const allow = policy.allow;
  if (allow !== undefined && allow !== true) {
    return 'allow.cmd';
  }
  return 'capabilities';
}

/**
 * Build suggestions for a command denial.
 * Mirrors the logic in guards.ts buildCommandDenialSuggestions.
 */
function buildCommandSuggestions(commandName: string, rule: string): string[] {
  const suggestions: string[] = [];
  if (rule === 'deny.cmd') {
    suggestions.push(`Remove 'cmd:${commandName}:*' from deny list`);
  } else {
    suggestions.push(`Add 'cmd:${commandName}:*' to capabilities.allow`);
  }
  suggestions.push('Review active policies with @mx.policy.activePolicies');
  return suggestions;
}

/**
 * Infer the capability rule for a non-command capability denial (sh, node, js, etc.).
 */
function inferCapabilityDenialRule(policy: PolicyConfig, capability: string): string {
  const deny = policy.deny;
  const denyMap = deny && deny !== true && typeof deny === 'object' && !Array.isArray(deny) ? deny : undefined;
  if (denyMap && denyMap[capability] !== undefined) {
    return `deny.${capability}`;
  }
  if (deny === true) {
    return 'deny';
  }
  const allow = policy.allow;
  if (allow !== undefined && allow !== true) {
    return `allow.${capability}`;
  }
  return 'capabilities';
}

/**
 * Build suggestions for a capability denial.
 */
function buildCapabilityDenialSuggestions(capability: string, rule: string): string[] {
  const suggestions: string[] = [];
  if (rule.startsWith('deny')) {
    suggestions.push(`Remove '${capability}' from deny list`);
  } else {
    suggestions.push(`Add '${capability}: true' to allow list`);
  }
  suggestions.push('Review active policies with @mx.policy.activePolicies');
  return suggestions;
}

/**
 * Throw a structured MlldDenialError for a command access denial.
 *
 * Use this instead of MlldSecurityError when evaluateCommandAccess returns { allowed: false }.
 */
export function throwCommandDenial(
  decision: CommandAccessDecision,
  policySummary: PolicyConfig,
  options: {
    operationType: string;
    sourceLocation?: SourceLocation | null;
    env: Environment;
  }
): never {
  const reason = decision.reason ?? `Command '${decision.commandName}' denied by policy`;
  const rule = inferCommandDenialRule(policySummary, decision.commandName);
  const suggestions = buildCommandSuggestions(decision.commandName, rule);
  const policyName = getPolicyDisplayName(options.env);

  const context: DenialContext = {
    code: 'POLICY_CAPABILITY_DENIED',
    operation: {
      type: options.operationType,
      description: decision.commandName
    },
    blocker: {
      type: 'policy',
      name: policyName,
      rule
    },
    reason,
    suggestions
  };

  throw new MlldDenialError(context, {
    sourceLocation: options.sourceLocation ?? undefined,
    env: options.env
  });
}

/**
 * Throw a structured MlldDenialError for a capability access denial.
 *
 * Use this instead of MlldSecurityError when evaluateCapabilityAccess returns { allowed: false }.
 */
export function throwCapabilityDenial(
  decision: CapabilityAccessDecision,
  capability: string,
  policySummary: PolicyConfig,
  options: {
    operationType: string;
    sourceLocation?: SourceLocation | null;
    env: Environment;
  }
): never {
  const reason = decision.reason ?? `Capability '${capability}' denied by policy`;
  const rule = inferCapabilityDenialRule(policySummary, capability);
  const suggestions = buildCapabilityDenialSuggestions(capability, rule);
  const policyName = getPolicyDisplayName(options.env);

  const context: DenialContext = {
    code: 'POLICY_CAPABILITY_DENIED',
    operation: {
      type: options.operationType,
      description: capability
    },
    blocker: {
      type: 'policy',
      name: policyName,
      rule
    },
    reason,
    suggestions
  };

  throw new MlldDenialError(context, {
    sourceLocation: options.sourceLocation ?? undefined,
    env: options.env
  });
}
