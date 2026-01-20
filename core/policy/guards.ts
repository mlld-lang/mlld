import type { GuardBlockNode, GuardRuleNode, GuardActionNode } from '@core/types/guard';
import type { PolicyConfig } from './union';
import type { PolicyConditionFn } from '../../interpreter/guards';
import { v4 as uuid } from 'uuid';
import { isBuiltinPolicyRuleName } from './builtin-rules';
import * as shellQuote from 'shell-quote';

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
  if (!deny && !allowListActive) {
    return guards;
  }

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
  if (allowListActive || (denyMap && denyMap['cmd'])) {
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
  }

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
  const list = Array.isArray(value)
    ? normalizeList(value.map(entry => String(entry)))
    : normalizeList([String(value)]);
  const all = list.includes('*');
  const patterns = list.filter(entry => entry !== '*');
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

function normalizeShellToken(token: unknown): string | null {
  if (typeof token === 'string') {
    return token;
  }
  if (!token || typeof token !== 'object') {
    return null;
  }
  const entry = token as { op?: string; pattern?: string };
  if (entry.op === 'glob' && typeof entry.pattern === 'string') {
    return entry.pattern;
  }
  return null;
}

function tokenizeCommand(commandString: string): string[] {
  if (!commandString) {
    return [];
  }
  const parsed = shellQuote.parse(commandString);
  return parsed
    .map(normalizeShellToken)
    .filter((token): token is string => typeof token === 'string' && token.length > 0);
}

function isEnvAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

function normalizeCommandToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) {
    return '';
  }
  const parts = trimmed.split('/');
  const base = parts[parts.length - 1] || trimmed;
  return base.toLowerCase();
}

function getCommandTokens(commandString: string): string[] {
  const raw = tokenizeCommand(commandString);
  let index = 0;
  while (index < raw.length && isEnvAssignment(raw[index])) {
    index += 1;
  }
  return raw.slice(index).map(normalizeCommandToken).filter(Boolean);
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

function parseCommandPattern(pattern: string): { tokens: string[]; allowExtra: boolean } {
  const tokens = getCommandTokens(pattern);
  if (tokens.length === 0) {
    return { tokens, allowExtra: false };
  }
  let allowExtra = false;
  const last = tokens[tokens.length - 1]!;
  if (last === '*') {
    tokens.pop();
    allowExtra = true;
  } else if (last.endsWith(':*')) {
    tokens[tokens.length - 1] = last.slice(0, -2);
    allowExtra = true;
  }
  if (!allowExtra && tokens.length === 1) {
    allowExtra = true;
  }
  return { tokens, allowExtra };
}

function matchesCommandPattern(commandTokens: string[], pattern: string): boolean {
  const { tokens: patternTokens, allowExtra } = parseCommandPattern(pattern);
  if (patternTokens.length === 0) {
    return false;
  }
  if (commandTokens.length < patternTokens.length) {
    return false;
  }
  for (let i = 0; i < patternTokens.length; i++) {
    if (commandTokens[i] !== patternTokens[i]) {
      return false;
    }
  }
  if (!allowExtra && commandTokens.length !== patternTokens.length) {
    return false;
  }
  return true;
}

function matchesCommandPatterns(commandTokens: string[], patterns: string[]): boolean {
  if (patterns.length === 0) {
    return false;
  }
  return patterns.some(pattern => matchesCommandPattern(commandTokens, pattern));
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
  const denyValue = denyMap?.cmd;
  if (denyValue !== undefined) {
    const denyPatterns = normalizeCommandPatternList(denyValue);
    if (denyPatterns.all || matchesCommandPatterns(commandTokens, denyPatterns.patterns)) {
      return {
        allowed: false,
        commandName,
        reason: `Command '${commandName}' denied by policy`
      };
    }
  }
  if (allowListActive) {
    const allowValue = allowMap?.cmd;
    if (allowValue === undefined) {
      return {
        allowed: false,
        commandName,
        reason: `Command '${commandName}' denied by policy`
      };
    }
    const allowPatterns = normalizeCommandPatternList(allowValue);
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
