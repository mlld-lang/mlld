import type { GuardBlockNode, GuardRuleNode, GuardActionNode } from '@core/types/guard';
import type { PolicyConfig } from './union';
import type { PolicyConditionFn } from '../../interpreter/guards';
import { v4 as uuid } from 'uuid';
import { isBuiltinPolicyRuleName } from './builtin-rules';
import { getCommandTokens, matchesCommandPatterns, normalizeCommandPatternEntry } from './capability-patterns';

export interface PolicyGuardSpec {
  name: string;
  filterKind: 'operation' | 'data';
  filterValue: string;
  scope: 'perOperation' | 'perInput';
  block: GuardBlockNode;
  timing: 'before' | 'after' | 'always';
  privileged: true;
  policyCondition: PolicyConditionFn;
}

export type CommandAccessDecision = {
  allowed: boolean;
  commandName: string;
  reason?: string;
};

function makeGuardAction(decision: 'allow' | 'deny', message?: string): GuardActionNode {
  return {
    type: 'GuardAction',
    nodeId: uuid(),
    location: null as any,
    decision,
    message,
    rawMessage: message ? `"${message}"` : undefined
  };
}

function makeWildcardRule(action: GuardActionNode): GuardRuleNode {
  return {
    type: 'GuardRule',
    nodeId: uuid(),
    location: null as any,
    isWildcard: true,
    action
  };
}

function makeGuardBlock(): GuardBlockNode {
  return {
    type: 'GuardBlock',
    nodeId: uuid(),
    location: null as any,
    modifier: 'default',
    rules: [makeWildcardRule(makeGuardAction('allow'))]
  };
}

export function generatePolicyGuards(policy: PolicyConfig): PolicyGuardSpec[] {
  const guards: PolicyGuardSpec[] = [];
  const enabledRules = normalizeRuleList(policy.defaults?.rules).filter(isBuiltinPolicyRuleName);

  for (const rule of enabledRules) {
    if (rule === 'no-secret-exfil') {
      guards.push(makeDataRuleGuard({
        name: '__policy_rule_no_secret_exfil',
        label: 'secret',
        operationLabel: 'exfil',
        reason: "Label 'secret' cannot flow to 'exfil'"
      }));
    }
    if (rule === 'no-sensitive-exfil') {
      guards.push(makeSensitiveExfilGuard());
    }
    if (rule === 'no-untrusted-destructive') {
      guards.push(makeDataRuleGuard({
        name: '__policy_rule_no_untrusted_destructive',
        label: 'untrusted',
        operationLabel: 'destructive',
        reason: "Label 'untrusted' cannot flow to 'destructive'"
      }));
    }
    if (rule === 'no-untrusted-privileged') {
      guards.push(makeDataRuleGuard({
        name: '__policy_rule_no_untrusted_privileged',
        label: 'untrusted',
        operationLabel: 'privileged',
        reason: "Label 'untrusted' cannot flow to 'privileged'"
      }));
    }
  }

  const allow = policy.allow;
  const deny = policy.deny;
  const allowListActive = allow !== undefined && allow !== true;

  if (deny === true) {
    guards.push({
      name: '__policy_deny_all',
      filterKind: 'operation',
      filterValue: 'run',
      scope: 'perOperation',
      block: makeGuardBlock(),
      timing: 'before',
      privileged: true,
      policyCondition: () => ({
        decision: 'deny',
        reason: 'All operations denied by policy'
      })
    });
    return guards;
  }

  const denyMap = deny && deny !== true && typeof deny === 'object' && !Array.isArray(deny) ? deny : undefined;
  guards.push({
    name: '__policy_cmd_access',
    filterKind: 'operation',
    filterValue: 'op:cmd',
    scope: 'perOperation',
    block: makeGuardBlock(),
    timing: 'before',
    privileged: true,
    policyCondition: ({ operation }) => {
      const commandText = getOperationCommandText(operation);
      const decision = evaluateCommandAccess(policy, commandText);
      if (decision.allowed) {
        return { decision: 'allow' };
      }
      return {
        decision: 'deny',
        reason: decision.reason ?? `Command '${decision.commandName}' denied by policy`
      };
    }
  });

  if (denyMap && isDenied('sh', denyMap)) {
    guards.push({
      name: '__policy_deny_sh',
      filterKind: 'operation',
      filterValue: 'op:cmd',
      scope: 'perOperation',
      block: makeGuardBlock(),
      timing: 'before',
      privileged: true,
      policyCondition: ({ operation }) => {
        const commandText = getOperationCommandText(operation);
        const tokens = getCommandTokens(commandText);
        const firstWord = tokens[0] ?? '';
        if (firstWord === 'sh' || firstWord === 'bash') {
          return { decision: 'deny', reason: 'Shell access denied by policy' };
        }
        return { decision: 'allow' };
      }
    });
  }

  if (denyMap && isDenied('network', denyMap)) {
    guards.push({
      name: '__policy_deny_network',
      filterKind: 'operation',
      filterValue: 'op:cmd',
      scope: 'perOperation',
      block: makeGuardBlock(),
      timing: 'before',
      privileged: true,
      policyCondition: ({ operation }) => {
        const commandText = getOperationCommandText(operation);
        const tokens = getCommandTokens(commandText);
        const firstWord = tokens[0] ?? '';
        const networkCommands = ['curl', 'wget', 'nc', 'netcat', 'ssh', 'scp', 'rsync', 'ftp', 'telnet'];
        if (networkCommands.includes(firstWord)) {
          return { decision: 'deny', reason: 'Network access denied by policy' };
        }
        return { decision: 'allow' };
      }
    });
  }

  return guards;
}

function normalizeList(values?: readonly string[]): string[] {
  if (!values) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const entry = String(value).trim();
    if (!entry || seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    result.push(entry);
  }
  return result;
}

function normalizeRuleList(value: unknown): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return normalizeList(value.map(entry => String(entry)));
  }
  return normalizeList([String(value)]);
}

function normalizeCommandPatternList(value: unknown): { all: boolean; patterns: string[] } {
  if (value === true || value === '*' || value === 'all') {
    return { all: true, patterns: [] };
  }
  if (value === undefined || value === null) {
    return { all: false, patterns: [] };
  }
  const entries = Array.isArray(value) ? value : [value];
  const normalized = normalizeList(entries.map(entry => {
    const raw = String(entry).trim();
    if (!raw) {
      return '';
    }
    const commandPattern = normalizeCommandPatternEntry(raw);
    return commandPattern ?? raw;
  }));
  const all = normalized.includes('*');
  const patterns = normalized.filter(entry => entry !== '*');
  return { all, patterns };
}

function getOperationCommandText(operation: {
  command?: string;
  metadata?: Record<string, unknown>;
}): string {
  const metadata = operation.metadata;
  if (metadata && typeof metadata.commandPreview === 'string') {
    return metadata.commandPreview;
  }
  if (metadata && typeof metadata.command === 'string') {
    return metadata.command;
  }
  return operation.command ?? '';
}

function getCommandName(commandTokens: string[], commandText: string): string {
  if (commandTokens.length > 0) {
    return commandTokens[0]!;
  }
  const trimmed = commandText.trim();
  if (!trimmed) {
    return 'command';
  }
  return trimmed.split(/\s+/)[0] ?? 'command';
}

function extractCommandPatterns(
  value: PolicyConfig['allow'] | PolicyConfig['deny'] | undefined
): { all: boolean; patterns: string[] } | undefined {
  if (!value || value === true) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const patterns = normalizeList(value.map(entry => {
      const raw = String(entry).trim();
      if (!raw) {
        return '';
      }
      return normalizeCommandPatternEntry(raw) ?? '';
    })).filter(Boolean);
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

export function evaluateCommandAccess(policy: PolicyConfig, commandText: string): CommandAccessDecision {
  const commandTokens = getCommandTokens(commandText);
  const commandName = getCommandName(commandTokens, commandText);
  const allow = policy.allow;
  const deny = policy.deny;
  const allowListActive = allow !== undefined && allow !== true;
  const allowMap =
    allowListActive && allow && typeof allow === 'object' && !Array.isArray(allow)
      ? allow
      : undefined;
  if (deny === true) {
    return {
      allowed: false,
      commandName,
      reason: 'All operations denied by policy'
    };
  }

  const denyMap =
    deny && deny !== true && typeof deny === 'object' && !Array.isArray(deny)
      ? deny
      : undefined;
  const denyPatterns = extractCommandPatterns(deny) ?? (denyMap?.cmd !== undefined ? normalizeCommandPatternList(denyMap.cmd) : undefined);
  if (denyPatterns && (denyPatterns.all || matchesCommandPatterns(commandTokens, denyPatterns.patterns))) {
    return {
      allowed: false,
      commandName,
      reason: `Command '${commandName}' denied by policy`
    };
  }
  if (allowListActive) {
    const allowPatterns = extractCommandPatterns(allow) ?? (allowMap?.cmd !== undefined ? normalizeCommandPatternList(allowMap.cmd) : undefined);
    if (!allowPatterns) {
      return {
        allowed: false,
        commandName,
        reason: `Command '${commandName}' denied by policy`
      };
    }
    if (!allowPatterns.all && !matchesCommandPatterns(commandTokens, allowPatterns.patterns)) {
      return {
        allowed: false,
        commandName,
        reason: `Command '${commandName}' denied by policy`
      };
    }
  }
  return { allowed: true, commandName };
}

function matchesPrefix(rule: string, target: string): boolean {
  if (rule === '*') {
    return true;
  }
  return target === rule || target.startsWith(`${rule}:`);
}

function hasMatchingLabel(values: readonly string[] | undefined, label: string): boolean {
  if (!values || values.length === 0) {
    return false;
  }
  return values.some(value => matchesPrefix(label, value));
}

function makeDataRuleGuard(options: {
  name: string;
  label: string;
  operationLabel: string;
  reason: string;
}): PolicyGuardSpec {
  return {
    name: options.name,
    filterKind: 'data',
    filterValue: options.label,
    scope: 'perInput',
    block: makeGuardBlock(),
    timing: 'before',
    privileged: true,
    policyCondition: ({ operation }) => {
      const opLabels = [
        ...(operation.opLabels ?? []),
        ...(operation.labels ?? [])
      ];
      if (hasMatchingLabel(opLabels, options.operationLabel)) {
        return { decision: 'deny', reason: options.reason };
      }
      return { decision: 'allow' };
    }
  };
}

function makeSensitiveExfilGuard(): PolicyGuardSpec {
  return {
    name: '__policy_rule_no_sensitive_exfil',
    filterKind: 'data',
    filterValue: 'sensitive',
    scope: 'perInput',
    block: makeGuardBlock(),
    timing: 'before',
    privileged: true,
    policyCondition: ({ operation, input }) => {
      const opLabels = [
        ...(operation.opLabels ?? []),
        ...(operation.labels ?? [])
      ];
      if (!hasMatchingLabel(opLabels, 'exfil')) {
        return { decision: 'allow' };
      }
      const inputLabels = [
        ...(input?.labels ?? []),
        ...(input?.taint ?? [])
      ];
      if (!hasMatchingLabel(inputLabels, 'untrusted')) {
        return { decision: 'allow' };
      }
      return {
        decision: 'deny',
        reason: "Label 'sensitive' cannot flow to 'exfil' when untrusted"
      };
    }
  };
}

function isDenied(
  capability: string,
  deny: Record<string, unknown>
): boolean {
  const denyValue = deny[capability];
  if (denyValue === true) return true;
  if (Array.isArray(denyValue) && denyValue.includes('*')) return true;
  return false;
}
