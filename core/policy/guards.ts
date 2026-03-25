import type { GuardBlockNode, GuardRuleNode, GuardActionNode } from '@core/types/guard';
import { normalizePolicyConfig, type PolicyConfig, type PolicyOperations } from './union';
import type { PolicyArgDescriptor, PolicyConditionFn } from '../../interpreter/guards';
import { isAttestationLabel } from '@core/types/security';
import { v4 as uuid } from 'uuid';
import { isBuiltinPolicyRuleName } from './builtin-rules';
import {
  getCommandTokens,
  matchesCommandPattern,
  normalizeCommandPatternEntry,
  parseCommandPatternTokens
} from './capability-patterns';
import { isDangerAllowedForCommand, isDangerousCommand, normalizeDangerEntries } from './danger';
import { expandOperationLabels } from './label-flow';

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

export interface AuthorizationInheritedPolicyCheckFailure {
  reason: string;
  rule: string;
  suggestions?: string[];
}

const SEND_DESTINATION_ARG_SELECTORS = ['recipient', 'recipients', 'cc', 'bcc'] as const;
const TARGET_ARG_SELECTORS = ['id'] as const;

export type CommandAccessDecision = {
  allowed: boolean;
  commandName: string;
  reason?: string;
};

export type ShellCommandDenyMatch = {
  commandText: string;
  commandName: string;
  reason: string;
};

export type CapabilityAccessDecision = {
  allowed: boolean;
  reason?: string;
};

function isEmptyAuthorizationValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function collectDescriptorLabels(descriptor?: PolicyArgDescriptor): string[] {
  return normalizeList([
    ...(descriptor?.labels ?? []),
    ...(descriptor?.taint ?? [])
  ]);
}

function collectDescriptorAttestations(descriptor?: PolicyArgDescriptor): string[] {
  return normalizeList([
    ...(descriptor?.attestations ?? []),
    ...collectDescriptorLabels(descriptor).filter(isAttestationLabel)
  ]);
}

function collectAuthorizedAttestations(
  authorizedArgAttestations: Readonly<Record<string, readonly string[]>> | undefined,
  argName: string
): string[] {
  const labels = authorizedArgAttestations?.[argName];
  return normalizeList(Array.isArray(labels) ? [...labels] : []);
}

function getExpandedPolicyOperationLabels(
  operation: {
    opLabels?: readonly string[];
    labels?: readonly string[];
  },
  operations?: PolicyOperations
): string[] {
  return expandOperationLabels([
    ...(operation.opLabels ?? []),
    ...(operation.labels ?? [])
  ], operations);
}

function selectNamedArgs(
  args: Readonly<Record<string, unknown>> | undefined,
  selectors: readonly string[],
  options?: { ignoreEmpty?: boolean }
): string[] {
  if (!args) {
    return [];
  }

  const selected: string[] = [];
  for (const selector of selectors) {
    if (!Object.prototype.hasOwnProperty.call(args, selector)) {
      continue;
    }
    if (options?.ignoreEmpty === true && isEmptyAuthorizationValue(args[selector])) {
      continue;
    }
    selected.push(selector);
  }
  return selected;
}

function selectNamedArgsWithFallback(
  args: Readonly<Record<string, unknown>> | undefined,
  selectors: readonly string[],
  options?: { ignoreEmpty?: boolean; fallbackToFirstProvided?: boolean }
): string[] {
  const selected = selectNamedArgs(args, selectors, options);
  if (selected.length > 0 || !args || options?.fallbackToFirstProvided !== true) {
    return selected;
  }

  for (const [argName, value] of Object.entries(args)) {
    if (options?.ignoreEmpty === true && isEmptyAuthorizationValue(value)) {
      continue;
    }
    return [argName];
  }

  return [];
}

function buildInheritedPositiveCheckFailure(options: {
  reason: string;
  rule: string;
  missingLabelSuggestion: string;
}): AuthorizationInheritedPolicyCheckFailure {
  return {
    reason: options.reason,
    rule: options.rule,
    suggestions: [
      options.missingLabelSuggestion,
      'Review active policies with @mx.policy.activePolicies'
    ]
  };
}

export function evaluateAuthorizationInheritedPolicyChecks(options: {
  policy: PolicyConfig;
  operation: {
    opLabels?: readonly string[];
    labels?: readonly string[];
  };
  args?: Readonly<Record<string, unknown>>;
  argDescriptors?: Readonly<Record<string, PolicyArgDescriptor>>;
  authorizedArgAttestations?: Readonly<Record<string, readonly string[]>>;
}): AuthorizationInheritedPolicyCheckFailure | undefined {
  const enabledRules = normalizeRuleList(options.policy.defaults?.rules).filter(isBuiltinPolicyRuleName);
  if (enabledRules.length === 0) {
    return undefined;
  }

  const expandedOperationLabels = getExpandedPolicyOperationLabels(
    options.operation,
    options.policy.operations
  );

  if (
    enabledRules.includes('no-send-to-unknown') &&
    hasMatchingLabel(expandedOperationLabels, 'exfil:send')
  ) {
    const destinationArgs = selectNamedArgs(options.args, SEND_DESTINATION_ARG_SELECTORS, {
      ignoreEmpty: true
    });
    if (destinationArgs.length === 0) {
      return buildInheritedPositiveCheckFailure({
        reason: "Rule 'no-send-to-unknown': exfil:send destination must carry 'known'",
        rule: 'policy.defaults.rules.no-send-to-unknown',
        missingLabelSuggestion: "Mark the destination with 'known' or use an approved destination source"
      });
    }

    for (const argName of destinationArgs) {
      const effectiveAttestations = normalizeList([
        ...collectDescriptorAttestations(options.argDescriptors?.[argName]),
        ...collectAuthorizedAttestations(options.authorizedArgAttestations, argName)
      ]);
      if (!hasMatchingLabel(effectiveAttestations, 'known')) {
        return buildInheritedPositiveCheckFailure({
          reason: "Rule 'no-send-to-unknown': exfil:send destination must carry 'known'",
          rule: 'policy.defaults.rules.no-send-to-unknown',
          missingLabelSuggestion: "Mark the destination with 'known' or use an approved destination source"
        });
      }
    }
  }

  if (
    enabledRules.includes('no-send-to-external') &&
    hasMatchingLabel(expandedOperationLabels, 'exfil:send')
  ) {
    const destinationArgs = selectNamedArgs(options.args, SEND_DESTINATION_ARG_SELECTORS, {
      ignoreEmpty: true
    });
    if (destinationArgs.length === 0) {
      return buildInheritedPositiveCheckFailure({
        reason: "Rule 'no-send-to-external': exfil:send destination must carry 'known:internal'",
        rule: 'policy.defaults.rules.no-send-to-external',
        missingLabelSuggestion:
          "Mark the destination with 'known:internal' or use an approved internal destination source"
      });
    }

    for (const argName of destinationArgs) {
      const effectiveAttestations = normalizeList([
        ...collectDescriptorAttestations(options.argDescriptors?.[argName]),
        ...collectAuthorizedAttestations(options.authorizedArgAttestations, argName)
      ]);
      if (!hasMatchingLabel(effectiveAttestations, 'known:internal')) {
        return buildInheritedPositiveCheckFailure({
          reason: "Rule 'no-send-to-external': exfil:send destination must carry 'known:internal'",
          rule: 'policy.defaults.rules.no-send-to-external',
          missingLabelSuggestion:
            "Mark the destination with 'known:internal' or use an approved internal destination source"
        });
      }
    }
  }

  if (
    enabledRules.includes('no-destroy-unknown') &&
    hasMatchingLabel(expandedOperationLabels, 'destructive:targeted')
  ) {
    const targetArgs = selectNamedArgsWithFallback(options.args, TARGET_ARG_SELECTORS, {
      fallbackToFirstProvided: true
    });
    if (targetArgs.length === 0) {
      return buildInheritedPositiveCheckFailure({
        reason: "Rule 'no-destroy-unknown': destructive:targeted target must carry 'known'",
        rule: 'policy.defaults.rules.no-destroy-unknown',
        missingLabelSuggestion: "Mark the target with 'known' or use an approved target source"
      });
    }

    for (const argName of targetArgs) {
      const effectiveAttestations = normalizeList([
        ...collectDescriptorAttestations(options.argDescriptors?.[argName]),
        ...collectAuthorizedAttestations(options.authorizedArgAttestations, argName)
      ]);
      if (!hasMatchingLabel(effectiveAttestations, 'known')) {
        return buildInheritedPositiveCheckFailure({
          reason: "Rule 'no-destroy-unknown': destructive:targeted target must carry 'known'",
          rule: 'policy.defaults.rules.no-destroy-unknown',
          missingLabelSuggestion: "Mark the target with 'known' or use an approved target source"
        });
      }
    }
  }

  if (
    enabledRules.includes('no-untrusted-privileged') &&
    hasMatchingLabel(expandedOperationLabels, 'privileged')
  ) {
    for (const descriptor of Object.values(options.argDescriptors ?? {})) {
      if (hasMatchingLabel(collectDescriptorLabels(descriptor), 'untrusted')) {
        return {
          reason: "Rule 'no-untrusted-privileged': label 'untrusted' cannot flow to 'privileged'",
          rule: 'policy.defaults.rules.no-untrusted-privileged',
          suggestions: [
            'Review active policies with @mx.policy.activePolicies'
          ]
        };
      }
    }
  }

  return undefined;
}

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

export function generatePolicyGuards(policy: PolicyConfig, policyDisplayName?: string): PolicyGuardSpec[] {
  const guards: PolicyGuardSpec[] = [];
  const enabledRules = normalizeRuleList(policy.defaults?.rules).filter(isBuiltinPolicyRuleName);
  const policyLocked = policy.locked === true;

  for (const rule of enabledRules) {
    if (rule === 'no-secret-exfil') {
      guards.push(makeDataRuleGuard({
        name: '__policy_rule_no_secret_exfil',
        label: 'secret',
        operationLabel: 'exfil',
        reason: "Rule 'no-secret-exfil': label 'secret' cannot flow to 'exfil'",
        operations: policy.operations,
        policyDisplayName,
        locked: policyLocked
      }));
    }
    if (rule === 'no-sensitive-exfil') {
      guards.push(makeSensitiveExfilGuard(policy.operations, policyDisplayName, policyLocked));
    }
    if (rule === 'no-send-to-unknown') {
      guards.push(makeNamedArgAttestationGuard({
        name: '__policy_rule_no_send_to_unknown',
        operationLabel: 'exfil:send',
        selectors: SEND_DESTINATION_ARG_SELECTORS,
        requiredLabel: 'known',
        reason: "Rule 'no-send-to-unknown': exfil:send destination must carry 'known'",
        missingLabelSuggestion: "Mark the destination with 'known' or use an approved destination source",
        operations: policy.operations,
        policyDisplayName,
        locked: policyLocked
      }));
    }
    if (rule === 'no-send-to-external') {
      guards.push(makeNamedArgAttestationGuard({
        name: '__policy_rule_no_send_to_external',
        operationLabel: 'exfil:send',
        selectors: SEND_DESTINATION_ARG_SELECTORS,
        requiredLabel: 'known:internal',
        reason: "Rule 'no-send-to-external': exfil:send destination must carry 'known:internal'",
        missingLabelSuggestion:
          "Mark the destination with 'known:internal' or use an approved internal destination source",
        operations: policy.operations,
        policyDisplayName,
        locked: policyLocked
      }));
    }
    if (rule === 'no-destroy-unknown') {
      guards.push(makeNamedArgAttestationGuard({
        name: '__policy_rule_no_destroy_unknown',
        operationLabel: 'destructive:targeted',
        selectors: TARGET_ARG_SELECTORS,
        requiredLabel: 'known',
        reason: "Rule 'no-destroy-unknown': destructive:targeted target must carry 'known'",
        missingLabelSuggestion: "Mark the target with 'known' or use an approved target source",
        fallbackToFirstProvided: true,
        operations: policy.operations,
        policyDisplayName,
        locked: policyLocked
      }));
    }
    if (rule === 'no-untrusted-destructive') {
      guards.push(makeDataRuleGuard({
        name: '__policy_rule_no_untrusted_destructive',
        label: 'untrusted',
        operationLabel: 'destructive',
        reason: "Rule 'no-untrusted-destructive': label 'untrusted' cannot flow to 'destructive'",
        operations: policy.operations,
        policyDisplayName,
        locked: policyLocked
      }));
    }
    if (rule === 'no-untrusted-privileged') {
      guards.push(makeDataRuleGuard({
        name: '__policy_rule_no_untrusted_privileged',
        label: 'untrusted',
        operationLabel: 'privileged',
        reason: "Rule 'no-untrusted-privileged': label 'untrusted' cannot flow to 'privileged'",
        operations: policy.operations,
        policyDisplayName,
        locked: policyLocked
      }));
    }
    if (rule === 'no-influenced-advice') {
      guards.push(makeDataRuleGuard({
        name: '__policy_rule_no_influenced_advice',
        label: 'influenced',
        operationLabel: 'advice',
        reason: "Rule 'no-influenced-advice': label 'influenced' cannot flow to 'advice' — use structured extraction to debias evaluative output",
        operations: policy.operations,
        policyDisplayName,
        locked: policyLocked
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
        reason: 'All operations denied by policy',
        policyName: policyDisplayName,
        rule: 'deny',
        locked: policyLocked,
        suggestions: [
          'Review active policies with @mx.policy.activePolicies'
        ]
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
      const reason = decision.reason ?? `Command '${decision.commandName}' denied by policy`;
      const rule = inferCapabilityRule(policy, commandText);
      const suggestions = buildCommandDenialSuggestions(decision.commandName, rule);
      return {
        decision: 'deny',
        reason,
        policyName: policyDisplayName,
        rule,
        locked: policyLocked,
        suggestions
      };
    }
  });

  if (denyMap && isDenied('sh', denyMap)) {
    guards.push({
      name: '__policy_deny_sh',
      filterKind: 'operation',
      filterValue: 'op:sh',
      scope: 'perOperation',
      block: makeGuardBlock(),
      timing: 'before',
      privileged: true,
      policyCondition: () => {
        return {
          decision: 'deny',
          reason: 'Shell access denied by policy',
          policyName: policyDisplayName,
          rule: 'deny.sh',
          locked: policyLocked,
          suggestions: [
            'Remove sh from deny list to allow shell access',
            'Review active policies with @mx.policy.activePolicies'
          ]
        };
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
        if (isNetworkCommand(tokens)) {
          return {
            decision: 'deny',
            reason: 'Network access denied by policy',
            policyName: policyDisplayName,
            rule: 'deny.network',
            locked: policyLocked,
            suggestions: [
              'Remove network from deny list to allow network commands',
              'Review active policies with @mx.policy.activePolicies'
            ]
          };
        }
        return { decision: 'allow' };
      }
    });
  }

  return guards;
}

function inferCapabilityRule(policy: PolicyConfig, commandText: string): string {
  const deny = policy.deny;
  const allow = policy.allow;
  const denyMap = deny && deny !== true && typeof deny === 'object' && !Array.isArray(deny) ? deny : undefined;
  const denyPatterns = extractCommandPatterns(deny) ?? (denyMap?.cmd !== undefined ? normalizeCommandPatternList(denyMap.cmd) : undefined);
  if (denyPatterns) {
    const tokens = getCommandTokens(commandText);
    const denyMatch =
      findBestCommandPatternMatch(tokens, denyPatterns.patterns, { denySemantics: true }) ??
      (denyPatterns.all ? { pattern: '*', specificity: 0 } : null);
    if (denyMatch) {
      const allowListActive = allow !== undefined && allow !== true;
      if (allowListActive) {
        const allowMap = allow && typeof allow === 'object' && !Array.isArray(allow) ? allow : undefined;
        const allowPatterns = extractCommandPatterns(allow) ?? (allowMap?.cmd !== undefined ? normalizeCommandPatternList(allowMap.cmd) : undefined);
        const allowMatch = allowPatterns
          ? findBestCommandPatternMatch(tokens, allowPatterns.patterns) ??
            (allowPatterns.all ? { pattern: '*', specificity: 0 } : null)
          : null;
        if (allowMatch && allowMatch.specificity > denyMatch.specificity) {
          return 'allow.cmd';
        }
      }
      return 'deny.cmd';
    }
  }
  if (allow !== undefined && allow !== true) {
    return 'allow.cmd';
  }
  return 'capabilities';
}

function buildCommandDenialSuggestions(commandName: string, rule: string): string[] {
  const suggestions: string[] = [];
  if (rule === 'deny.cmd') {
    suggestions.push(`Remove 'cmd:${commandName}:*' from deny list`);
  } else {
    suggestions.push(`Add 'cmd:${commandName}:*' to capabilities.allow`);
  }
  suggestions.push('Review active policies with @mx.policy.activePolicies');
  return suggestions;
}

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

type CommandPatternMatch = {
  pattern: string;
  specificity: number;
};

function commandPatternSpecificity(pattern: string): number {
  const tokens = parseCommandPatternTokens(pattern);
  if (tokens.length === 0) {
    return 0;
  }
  return tokens.filter(token => token !== '*').length;
}

function findBestCommandPatternMatch(
  commandTokens: string[],
  patterns: string[],
  options?: { denySemantics?: boolean }
): CommandPatternMatch | null {
  let best: CommandPatternMatch | null = null;
  for (const rawPattern of patterns) {
    const candidate = options?.denySemantics ? normalizeDenyPattern(rawPattern) : rawPattern;
    if (!matchesCommandPattern(commandTokens, candidate)) {
      continue;
    }
    const specificity = commandPatternSpecificity(candidate);
    if (!best || specificity > best.specificity) {
      best = { pattern: rawPattern, specificity };
    }
  }
  return best;
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

function formatCapabilityDeniedReason(capability: string): string {
  switch (capability) {
    case 'sh':
      return 'Shell access denied by policy';
    case 'network':
      return 'Network access denied by policy';
    case 'js':
      return 'JavaScript access denied by policy';
    case 'node':
      return 'Node access denied by policy';
    case 'py':
      return 'Python access denied by policy';
    case 'prose':
      return 'Prose access denied by policy';
    default:
      return `Capability '${capability}' denied by policy`;
  }
}

function isNetworkCommand(commandTokens: string[]): boolean {
  const firstWord = commandTokens[0] ?? '';
  const networkCommands = ['curl', 'wget', 'nc', 'netcat', 'ssh', 'scp', 'rsync', 'ftp', 'telnet'];
  return networkCommands.includes(firstWord);
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

  const dangerEntries = normalizeDangerEntries(policy.danger ?? policy.capabilities?.danger);
  if (isDangerousCommand(commandTokens) && !isDangerAllowedForCommand(dangerEntries, commandTokens)) {
    return {
      allowed: false,
      commandName,
      reason: 'Dangerous capability requires allow.danger'
    };
  }

  const denyMap =
    deny && deny !== true && typeof deny === 'object' && !Array.isArray(deny)
      ? deny
      : undefined;
  const denyPatterns = extractCommandPatterns(deny) ?? (denyMap?.cmd !== undefined ? normalizeCommandPatternList(denyMap.cmd) : undefined);
  const allowPatterns = allowListActive
    ? extractCommandPatterns(allow) ?? (allowMap?.cmd !== undefined ? normalizeCommandPatternList(allowMap.cmd) : undefined)
    : undefined;
  const denyMatch = denyPatterns
    ? findBestCommandPatternMatch(commandTokens, denyPatterns.patterns, { denySemantics: true }) ??
      (denyPatterns.all ? { pattern: '*', specificity: 0 } : null)
    : null;
  const allowMatch = allowPatterns
    ? findBestCommandPatternMatch(commandTokens, allowPatterns.patterns) ??
      (allowPatterns.all ? { pattern: '*', specificity: 0 } : null)
    : null;
  if (denyMatch && (!allowMatch || denyMatch.specificity >= allowMatch.specificity)) {
    return {
      allowed: false,
      commandName,
      reason: `Command '${commandName}' denied by policy`
    };
  }
  if (denyMap && isDenied('sh', denyMap)) {
    if (isShellInvocation(commandTokens)) {
      return {
        allowed: false,
        commandName,
        reason: 'Shell access denied by policy'
      };
    }
  }
  if (denyMap && isDenied('network', denyMap)) {
    if (isNetworkCommand(commandTokens)) {
      return {
        allowed: false,
        commandName,
        reason: 'Network access denied by policy'
      };
    }
  }
  if (allowListActive) {
    if (!allowPatterns || !allowMatch) {
      return {
        allowed: false,
        commandName,
        reason: `Command '${commandName}' denied by policy`
      };
    }
  }
  return { allowed: true, commandName };
}

export function evaluateCapabilityAccess(policy: PolicyConfig, capability: string): CapabilityAccessDecision {
  const allow = policy.allow;
  const deny = policy.deny;
  const allowListActive = allow !== undefined && allow !== true;

  if (deny === true) {
    return { allowed: false, reason: formatCapabilityDeniedReason(capability) };
  }

  const denyMap =
    deny && deny !== true && typeof deny === 'object' && !Array.isArray(deny)
      ? deny
      : undefined;
  if (denyMap && isDenied(capability, denyMap)) {
    return { allowed: false, reason: formatCapabilityDeniedReason(capability) };
  }

  if (allowListActive) {
    const allowMap =
      allow && typeof allow === 'object' && !Array.isArray(allow)
        ? allow
        : undefined;
    if (!allowMap) {
      return { allowed: false, reason: formatCapabilityDeniedReason(capability) };
    }
    const allowValue = (allowMap as Record<string, unknown>)[capability];
    if (!allowValue) {
      return { allowed: false, reason: formatCapabilityDeniedReason(capability) };
    }
    if (allowValue === true) {
      return { allowed: true };
    }
    if (Array.isArray(allowValue)) {
      return allowValue.length > 0
        ? { allowed: true }
        : { allowed: false, reason: formatCapabilityDeniedReason(capability) };
    }
    if (typeof allowValue === 'object') {
      return { allowed: true };
    }
    return { allowed: true };
  }

  return { allowed: true };
}

export function findDeniedShellCommand(
  policy: PolicyConfig,
  shellCode: string
): ShellCommandDenyMatch | null {
  if (typeof shellCode !== 'string' || shellCode.trim().length === 0) {
    return null;
  }
  const normalizedPolicy = normalizePolicyConfig(policy);
  if (normalizedPolicy.deny === undefined) {
    return null;
  }
  const denyOnlyPolicy: PolicyConfig = { deny: normalizedPolicy.deny };
  const candidates = extractShellCommandCandidates(shellCode);
  for (const commandText of candidates) {
    const decision = evaluateCommandAccess(denyOnlyPolicy, commandText);
    if (decision.allowed) {
      continue;
    }
    return {
      commandText,
      commandName: decision.commandName,
      reason: decision.reason ?? `Command '${decision.commandName}' denied by policy`
    };
  }
  return null;
}

const SHELL_CONTROL_KEYWORDS = new Set([
  'if',
  'then',
  'else',
  'elif',
  'fi',
  'for',
  'while',
  'until',
  'do',
  'done',
  'case',
  'esac',
  'select',
  'function',
  'in',
  'time',
  '{',
  '}',
  '(',
  ')'
]);

function extractShellCommandCandidates(shellCode: string): string[] {
  const candidates: string[] = [];
  const segments = shellCode
    .split(/\r?\n/)
    .flatMap(line => line.split(/(?:&&|\|\||[;|])/g))
    .map(segment => segment.trim())
    .filter(segment => segment.length > 0 && !segment.startsWith('#'));

  for (const segment of segments) {
    const tokens = getCommandTokens(segment);
    if (tokens.length === 0) {
      continue;
    }
    const firstToken = tokens[0]!;
    if (!SHELL_CONTROL_KEYWORDS.has(firstToken)) {
      candidates.push(segment);
      continue;
    }
    if (firstToken === 'if' || firstToken === 'while' || firstToken === 'until') {
      const stripped = segment.replace(/^(if|while|until)\s+/i, '').trim();
      if (!stripped) {
        continue;
      }
      const strippedTokens = getCommandTokens(stripped);
      if (strippedTokens.length === 0 || SHELL_CONTROL_KEYWORDS.has(strippedTokens[0]!)) {
        continue;
      }
      candidates.push(stripped);
    }
  }

  return candidates;
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
  operations?: PolicyOperations;
  policyDisplayName?: string;
  locked?: boolean;
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
      const rawOpLabels = [
        ...(operation.opLabels ?? []),
        ...(operation.labels ?? [])
      ];
      const opLabels = expandOperationLabels(rawOpLabels, options.operations);
      if (hasMatchingLabel(opLabels, options.operationLabel)) {
        return {
          decision: 'deny',
          reason: options.reason,
          policyName: options.policyDisplayName,
          locked: options.locked === true
        };
      }
      return { decision: 'allow' };
    }
  };
}

function makeNamedArgAttestationGuard(options: {
  name: string;
  operationLabel: string;
  selectors: readonly string[];
  requiredLabel: string;
  reason: string;
  missingLabelSuggestion: string;
  fallbackToFirstProvided?: boolean;
  operations?: PolicyOperations;
  policyDisplayName?: string;
  locked?: boolean;
}): PolicyGuardSpec {
  return {
    name: options.name,
    filterKind: 'operation',
    filterValue: 'exe',
    scope: 'perOperation',
    block: makeGuardBlock(),
    timing: 'before',
    privileged: true,
    policyCondition: ({ operation, args, argDescriptors }) => {
      if (typeof operation.name !== 'string' || operation.name.length === 0) {
        return { decision: 'allow' };
      }

      const rawOpLabels = [
        ...(operation.opLabels ?? []),
        ...(operation.labels ?? [])
      ];
      const opLabels = expandOperationLabels(rawOpLabels, options.operations);
      if (!hasMatchingLabel(opLabels, options.operationLabel)) {
        return { decision: 'allow' };
      }

      const selectedArgs = selectNamedArgsWithFallback(args, options.selectors, {
        ignoreEmpty: true,
        fallbackToFirstProvided: options.fallbackToFirstProvided === true
      });
      if (selectedArgs.length === 0) {
        return {
          decision: 'deny',
          reason: options.reason,
          policyName: options.policyDisplayName,
          locked: options.locked === true,
          suggestions: [
            options.missingLabelSuggestion,
            'Review active policies with @mx.policy.activePolicies'
          ]
        };
      }

      for (const argName of selectedArgs) {
        const attestations = collectDescriptorAttestations(argDescriptors?.[argName]);
        if (!hasMatchingLabel(attestations, options.requiredLabel)) {
          return {
            decision: 'deny',
            reason: options.reason,
            policyName: options.policyDisplayName,
            locked: options.locked === true,
            suggestions: [
              options.missingLabelSuggestion,
              'Review active policies with @mx.policy.activePolicies'
            ]
          };
        }
      }

      return { decision: 'allow' };
    }
  };
}

function makeSensitiveExfilGuard(
  operations?: PolicyOperations,
  policyDisplayName?: string,
  locked?: boolean
): PolicyGuardSpec {
  return {
    name: '__policy_rule_no_sensitive_exfil',
    filterKind: 'data',
    filterValue: 'sensitive',
    scope: 'perInput',
    block: makeGuardBlock(),
    timing: 'before',
    privileged: true,
    policyCondition: ({ operation, input }) => {
      const rawOpLabels = [
        ...(operation.opLabels ?? []),
        ...(operation.labels ?? [])
      ];
      const opLabels = expandOperationLabels(rawOpLabels, operations);
      if (!hasMatchingLabel(opLabels, 'exfil')) {
        return { decision: 'allow' };
      }
      return {
        decision: 'deny',
        reason: "Rule 'no-sensitive-exfil': label 'sensitive' cannot flow to 'exfil'",
        policyName: policyDisplayName,
        locked: locked === true
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
  // Handle normalized network structure: { domains: Set(['*']) }
  if (denyValue && typeof denyValue === 'object' && !Array.isArray(denyValue)) {
    const obj = denyValue as Record<string, unknown>;
    if ('domains' in obj) {
      const domains = obj.domains;
      if (domains instanceof Set && domains.has('*')) return true;
      if (Array.isArray(domains) && domains.includes('*')) return true;
    }
  }
  return false;
}

const SHELL_BINARIES = new Set(['sh', 'bash', 'zsh', 'dash', 'fish', 'csh', 'tcsh', 'ksh', 'ash']);
const COMMAND_WRAPPERS = new Set(['env', 'nice', 'nohup', 'timeout', 'strace', 'time']);

function basename(token: string): string {
  const slashIndex = token.lastIndexOf('/');
  return slashIndex >= 0 ? token.substring(slashIndex + 1) : token;
}

const WRAPPER_FLAGS_WITH_ARGS = new Set(['-u', '-S', '--split-string', '-t', '--timeout', '-s', '--signal', '-n', '-p']);

function isShellInvocation(commandTokens: string[]): boolean {
  if (commandTokens.length === 0) return false;
  const first = basename(commandTokens[0]!).toLowerCase();
  if (SHELL_BINARIES.has(first)) return true;
  if (COMMAND_WRAPPERS.has(first)) {
    let i = 1;
    while (i < commandTokens.length) {
      const token = commandTokens[i]!;
      if (token === '--') {
        i++;
        break;
      }
      if (token.startsWith('-')) {
        if (WRAPPER_FLAGS_WITH_ARGS.has(token)) {
          i += 2; // skip flag + its argument
        } else {
          i++;
        }
        continue;
      }
      if (token.includes('=')) {
        i++;
        continue;
      }
      break;
    }
    if (i < commandTokens.length) {
      const resolved = basename(commandTokens[i]!).toLowerCase();
      return SHELL_BINARIES.has(resolved);
    }
  }
  return false;
}
