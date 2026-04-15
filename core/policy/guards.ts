import type { GuardBlockNode, GuardRuleNode, GuardActionNode } from '@core/types/guard';
import {
  resolvePolicyDefaultRuleOptions,
  type PolicyConfig,
  type PolicyOperations,
  normalizePolicyConfig
} from './union';
import { isUrlAllowedByConstruction } from '@core/security/url-provenance';
import type { PolicyArgDescriptor, PolicyConditionFn } from '../../interpreter/guards';
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
import { matchesLabelPattern } from './fact-labels';
import type { FactSourceHandle } from '@core/types/handle';
import {
  getPositiveCheckAcceptedPatterns,
  SEND_INTERNAL_PATTERNS,
  collectDeclarativeFactRequirementEntries,
  getOperationSourceArgs,
  getScopedTaintControlArgs,
  selectDestinationArgs,
  selectSourceArgs,
  selectTargetArgs
} from './fact-requirements';
import { normalizeNamedOperationRef } from './operation-labels';

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

type CapabilityAccessOptions = {
  enforceAllowList?: boolean;
};

export function shouldApplySurfaceScopedPolicyToOperation(operation: {
  metadata?: Record<string, unknown>;
}): boolean {
  return operation.metadata?.authorizationSurfaceOperation !== false;
}

export function shouldEnforceCommandAllowListForOperation(operation: {
  metadata?: Record<string, unknown>;
}): boolean {
  return (
    shouldApplySurfaceScopedPolicyToOperation(operation)
    && operation.metadata?.commandAccessSubstrate !== true
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
    ...collectDescriptorLabels(descriptor)
  ]);
}

function collectAuthorizedAttestations(
  authorizedArgAttestations: Readonly<Record<string, readonly string[]>> | undefined,
  argName: string
): string[] {
  const labels = authorizedArgAttestations?.[argName];
  return normalizeList(Array.isArray(labels) ? [...labels] : []);
}

function collectAuthorizedFactsources(
  authorizedArgFactsources: Readonly<Record<string, readonly FactSourceHandle[]>> | undefined,
  argName: string
): FactSourceHandle[] {
  const factsources = authorizedArgFactsources?.[argName];
  return Array.isArray(factsources) ? dedupeFactSources(factsources) : [];
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

function collectEffectiveArgAttestations(options: {
  argName: string;
  argDescriptors?: Readonly<Record<string, PolicyArgDescriptor>>;
  authorizedArgAttestations?: Readonly<Record<string, readonly string[]>>;
}): string[] {
  return normalizeList([
    ...collectDescriptorAttestations(options.argDescriptors?.[options.argName]),
    ...collectAuthorizedAttestations(options.authorizedArgAttestations, options.argName)
  ]);
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
      'Review active policies with @mx.policy.active'
    ]
  };
}

function projectedHandleSuggestion(message: string): string {
  return `${message} from an approved tool result or another approved source`;
}

function getOperationControlArgs(operation: {
  metadata?: Record<string, unknown>;
}): string[] {
  const controlArgs = operation.metadata?.authorizationControlArgs;
  if (!Array.isArray(controlArgs)) {
    return [];
  }
  return controlArgs.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function shouldCorrelateControlArgs(operation: {
  metadata?: Record<string, unknown>;
}): boolean {
  return operation.metadata?.correlateControlArgs === true;
}

function getFactSourceInstanceKey(source: FactSourceHandle): string {
  if (source.instanceKey !== undefined) {
    return `${source.sourceRef}:instance:${source.instanceKey}`;
  }
  if (source.coercionId && source.position !== undefined) {
    return `${source.sourceRef}:coercion:${source.coercionId}:${source.position}`;
  }
  return `unknown:${JSON.stringify(source)}`;
}

function dedupeFactSources(factsources: readonly FactSourceHandle[]): FactSourceHandle[] {
  const unique = new Map<string, FactSourceHandle>();
  for (const handle of factsources) {
    if (!handle || handle.kind !== 'record-field') {
      continue;
    }
    unique.set(getFactSourceInstanceKey(handle), handle);
  }
  return Array.from(unique.values());
}

function describeFactSourceRecord(source: FactSourceHandle): string {
  if (source.instanceKey !== undefined) {
    return `${source.sourceRef}[instance=${source.instanceKey}]`;
  }
  if (source.coercionId && source.position !== undefined) {
    return `${source.sourceRef}[coercion=${source.coercionId.slice(0, 8)},position=${source.position}]`;
  }
  return `${source.sourceRef}[instance=unknown]`;
}

function formatCorrelateControlArgsReason(options: {
  operationName?: string;
  detail: string;
}): string {
  const target =
    typeof options.operationName === 'string' && options.operationName.trim().length > 0
      ? ` on @${options.operationName.trim()}`
      : '';
  return `Rule 'correlate-control-args': control args${target} must come from the same source record; ${options.detail}`;
}

function sameFactSourceInstance(left: FactSourceHandle, right: FactSourceHandle): boolean {
  if (left.sourceRef !== right.sourceRef) {
    return false;
  }
  if (left.instanceKey !== undefined && right.instanceKey !== undefined) {
    return left.instanceKey === right.instanceKey;
  }
  if (
    left.coercionId &&
    right.coercionId &&
    left.position !== undefined &&
    right.position !== undefined
  ) {
    return left.coercionId === right.coercionId && left.position === right.position;
  }
  return false;
}

function resolveControlArgFactSource(options: {
  argName: string;
  descriptor?: PolicyArgDescriptor;
  operationName?: string;
}):
  | { ok: true; source: FactSourceHandle }
  | { ok: false; failure: AuthorizationInheritedPolicyCheckFailure } {
  const factsources = dedupeFactSources(options.descriptor?.factsources ?? []);
  if (factsources.length === 0) {
    return {
      ok: false,
      failure: {
        reason: formatCorrelateControlArgsReason({
          operationName: options.operationName,
          detail: `arg '${options.argName}' does not carry source-record provenance`
        }),
        rule: 'correlate-control-args'
      }
    };
  }
  if (factsources.length > 1) {
    return {
      ok: false,
      failure: {
        reason: formatCorrelateControlArgsReason({
          operationName: options.operationName,
          detail: `arg '${options.argName}' carries multiple source records: ${factsources.map(describeFactSourceRecord).join(', ')}`
        }),
        rule: 'correlate-control-args'
      }
    };
  }
  return { ok: true, source: factsources[0]! };
}

export function evaluateControlArgCorrelation(options: {
  operation: {
    name?: string;
    metadata?: Record<string, unknown>;
  };
  args?: Readonly<Record<string, unknown>>;
  argDescriptors?: Readonly<Record<string, PolicyArgDescriptor>>;
}): AuthorizationInheritedPolicyCheckFailure | undefined {
  if (!shouldCorrelateControlArgs(options.operation)) {
    return undefined;
  }

  const controlArgs = getOperationControlArgs(options.operation);
  if (controlArgs.length <= 1) {
    return undefined;
  }

  const providedControlArgs = controlArgs.filter(argName =>
    Object.prototype.hasOwnProperty.call(options.args ?? {}, argName) ||
    Object.prototype.hasOwnProperty.call(options.argDescriptors ?? {}, argName)
  );
  if (providedControlArgs.length <= 1) {
    return undefined;
  }

  const resolvedSources: Array<{ argName: string; source: FactSourceHandle }> = [];
  for (const argName of providedControlArgs) {
    const resolved = resolveControlArgFactSource({
      argName,
      descriptor: options.argDescriptors?.[argName],
      operationName: options.operation.name
    });
    if (!resolved.ok) {
      return resolved.failure;
    }
    resolvedSources.push({ argName, source: resolved.source });
  }

  const baseline = resolvedSources[0]!;
  for (let index = 1; index < resolvedSources.length; index += 1) {
    const candidate = resolvedSources[index]!;
    if (sameFactSourceInstance(baseline.source, candidate.source)) {
      continue;
    }
    return {
      reason: formatCorrelateControlArgsReason({
        operationName: options.operation.name,
        detail: [
          `${baseline.argName} -> ${describeFactSourceRecord(baseline.source)}`,
          `${candidate.argName} -> ${describeFactSourceRecord(candidate.source)}`
        ].join(', ')
      }),
      rule: 'correlate-control-args'
    };
  }

  return undefined;
}

export function evaluateAuthorizationInheritedPolicyChecks(options: {
  policy: PolicyConfig;
  operation: {
    name?: string;
    metadata?: Record<string, unknown>;
    opLabels?: readonly string[];
    labels?: readonly string[];
  };
  args?: Readonly<Record<string, unknown>>;
  argDescriptors?: Readonly<Record<string, PolicyArgDescriptor>>;
  authorizedArgAttestations?: Readonly<Record<string, readonly string[]>>;
  authorizedArgFactsources?: Readonly<Record<string, readonly FactSourceHandle[]>>;
}): AuthorizationInheritedPolicyCheckFailure | undefined {
  const enabledRules = resolvePolicyDefaultRuleOptions(options.policy.defaults?.rules).filter(entry =>
    isBuiltinPolicyRuleName(entry.rule)
  );
  const enabledRuleNames = new Set(enabledRules.map(entry => entry.rule));
  const normalizedOperationRef =
    typeof (options.operation as { named?: unknown }).named === 'string'
      ? normalizeNamedOperationRef((options.operation as { named?: string }).named)
      : undefined;
  const declarativeEntries = collectDeclarativeFactRequirementEntries(options.policy).filter(
    entry => entry.opRef === normalizedOperationRef
  );
  const shouldCheckControlArgCorrelation = shouldCorrelateControlArgs(options.operation);
  if (enabledRules.length === 0 && declarativeEntries.length === 0 && !shouldCheckControlArgCorrelation) {
    return undefined;
  }

  const expandedOperationLabels = getExpandedPolicyOperationLabels(
    options.operation,
    options.policy.operations
  );

  if (
    enabledRuleNames.has('no-send-to-unknown') &&
    hasMatchingLabel(expandedOperationLabels, 'exfil:send')
  ) {
    const destinationArgs = selectDestinationArgs(options.operation, options.args);
    if (destinationArgs.length === 0) {
      return buildInheritedPositiveCheckFailure({
        reason: "Rule 'no-send-to-unknown': exfil:send destination must carry 'known'",
        rule: 'policy.defaults.rules.no-send-to-unknown',
        missingLabelSuggestion: projectedHandleSuggestion(
          "Use a projected handle for the destination"
        )
      });
    }

    for (const argName of destinationArgs) {
      const effectiveAttestations = normalizeList([
        ...collectDescriptorAttestations(options.argDescriptors?.[argName]),
        ...collectAuthorizedAttestations(options.authorizedArgAttestations, argName)
      ]);
      if (!hasAnyMatchingLabel(
        effectiveAttestations,
        getPositiveCheckAcceptedPatterns({
          rule: 'no-send-to-unknown',
          operation: options.operation,
          argName
        })
      )) {
        return buildInheritedPositiveCheckFailure({
          reason: "Rule 'no-send-to-unknown': exfil:send destination must carry 'known'",
          rule: 'policy.defaults.rules.no-send-to-unknown',
          missingLabelSuggestion: projectedHandleSuggestion(
            "Use a projected handle for the destination"
          )
        });
      }
    }
  }

  if (
    enabledRuleNames.has('no-send-to-external') &&
    hasMatchingLabel(expandedOperationLabels, 'exfil:send')
  ) {
    const destinationArgs = selectDestinationArgs(options.operation, options.args);
    if (destinationArgs.length === 0) {
      return buildInheritedPositiveCheckFailure({
        reason: "Rule 'no-send-to-external': exfil:send destination must carry 'known:internal'",
        rule: 'policy.defaults.rules.no-send-to-external',
        missingLabelSuggestion: projectedHandleSuggestion(
          "Use a projected handle for an approved internal destination"
        )
      });
    }

    for (const argName of destinationArgs) {
      const effectiveAttestations = normalizeList([
        ...collectDescriptorAttestations(options.argDescriptors?.[argName]),
        ...collectAuthorizedAttestations(options.authorizedArgAttestations, argName)
      ]);
      if (!hasAnyMatchingLabel(effectiveAttestations, SEND_INTERNAL_PATTERNS)) {
        return buildInheritedPositiveCheckFailure({
          reason: "Rule 'no-send-to-external': exfil:send destination must carry 'known:internal'",
          rule: 'policy.defaults.rules.no-send-to-external',
          missingLabelSuggestion: projectedHandleSuggestion(
            "Use a projected handle for an approved internal destination"
          )
        });
      }
    }
  }

  if (
    enabledRuleNames.has('no-destroy-unknown') &&
    hasMatchingLabel(expandedOperationLabels, 'destructive:targeted')
  ) {
    const targetArgs = selectTargetArgs(options.operation, options.args);
    if (targetArgs.length === 0) {
      return buildInheritedPositiveCheckFailure({
        reason: "Rule 'no-destroy-unknown': destructive:targeted target must carry 'known'",
        rule: 'policy.defaults.rules.no-destroy-unknown',
        missingLabelSuggestion: projectedHandleSuggestion(
          "Use a projected handle for the target"
        )
      });
    }

    for (const argName of targetArgs) {
      const effectiveAttestations = normalizeList([
        ...collectDescriptorAttestations(options.argDescriptors?.[argName]),
        ...collectAuthorizedAttestations(options.authorizedArgAttestations, argName)
      ]);
      if (!hasAnyMatchingLabel(
        effectiveAttestations,
        getPositiveCheckAcceptedPatterns({
          rule: 'no-destroy-unknown',
          operation: options.operation,
          argName
        })
      )) {
        return buildInheritedPositiveCheckFailure({
          reason: "Rule 'no-destroy-unknown': destructive:targeted target must carry 'known'",
          rule: 'policy.defaults.rules.no-destroy-unknown',
          missingLabelSuggestion: projectedHandleSuggestion(
            "Use a projected handle for the target"
          )
        });
      }
    }
  }

  const sourceArgInfo = getOperationSourceArgs(options.operation);
  if (
    enabledRuleNames.has('no-unknown-extraction-sources') &&
    sourceArgInfo.declared &&
    sourceArgInfo.args.length > 0
  ) {
    const sourceArgs = selectSourceArgs(options.operation, options.args);
    if (sourceArgs.length === 0) {
      return buildInheritedPositiveCheckFailure({
        reason: "Rule 'no-unknown-extraction-sources': extraction source must carry 'known'",
        rule: 'policy.defaults.rules.no-unknown-extraction-sources',
        missingLabelSuggestion: projectedHandleSuggestion(
          "Use a projected handle for the source"
        )
      });
    }

    for (const argName of sourceArgs) {
      const effectiveAttestations = normalizeList([
        ...collectDescriptorAttestations(options.argDescriptors?.[argName]),
        ...collectAuthorizedAttestations(options.authorizedArgAttestations, argName)
      ]);
      if (!hasAnyMatchingLabel(
        effectiveAttestations,
        getPositiveCheckAcceptedPatterns({
          rule: 'no-unknown-extraction-sources',
          operation: options.operation,
          argName
        })
      )) {
        return buildInheritedPositiveCheckFailure({
          reason: "Rule 'no-unknown-extraction-sources': extraction source must carry 'known'",
          rule: 'policy.defaults.rules.no-unknown-extraction-sources',
          missingLabelSuggestion: projectedHandleSuggestion(
            "Use a projected handle for the source"
          )
        });
      }
    }
  }

  if (
    enabledRuleNames.has('no-untrusted-privileged') &&
    hasMatchingLabel(expandedOperationLabels, 'privileged')
  ) {
    const scopedArgs = getScopedTaintControlArgs({
      operation: options.operation,
      ruleTaintFacts:
        enabledRules.find(entry => entry.rule === 'no-untrusted-privileged')?.taintFacts === true
    });
    const descriptorsToCheck = scopedArgs
      ? scopedArgs
          .map(argName => options.argDescriptors?.[argName])
          .filter((descriptor): descriptor is PolicyArgDescriptor => Boolean(descriptor))
      : Object.values(options.argDescriptors ?? {});

    for (const descriptor of descriptorsToCheck) {
      if (hasMatchingLabel(collectDescriptorLabels(descriptor), 'untrusted')) {
        return {
          reason: "Rule 'no-untrusted-privileged': label 'untrusted' cannot flow to 'privileged'",
          rule: 'policy.defaults.rules.no-untrusted-privileged',
          suggestions: [
            'Review active policies with @mx.policy.active'
          ]
        };
      }
    }
  }

  for (const entry of declarativeEntries) {
    if (!options.args || !Object.prototype.hasOwnProperty.call(options.args, entry.arg)) {
      return buildInheritedPositiveCheckFailure({
        reason: `Rule '${`policy.facts.requirements.${entry.opRef}.${entry.arg}`}': arg '${entry.arg}' must carry required fact provenance`,
        rule: `policy.facts.requirements.${entry.opRef}.${entry.arg}`,
        missingLabelSuggestion: projectedHandleSuggestion(
          `Use a projected handle for '${entry.arg}'`
        )
      });
    }

    const effectiveAttestations = collectEffectiveArgAttestations({
      argName: entry.arg,
      argDescriptors: options.argDescriptors,
      authorizedArgAttestations: options.authorizedArgAttestations
    });
    for (const clause of entry.clauses) {
      if (!hasAnyMatchingLabel(effectiveAttestations, clause)) {
        return buildInheritedPositiveCheckFailure({
          reason: `Rule '${`policy.facts.requirements.${entry.opRef}.${entry.arg}`}': arg '${entry.arg}' must carry required fact provenance`,
          rule: `policy.facts.requirements.${entry.opRef}.${entry.arg}`,
          missingLabelSuggestion: projectedHandleSuggestion(
            `Use a projected handle for '${entry.arg}'`
          )
        });
      }
    }
  }

  if (shouldCheckControlArgCorrelation) {
    const effectiveArgDescriptors: Record<string, PolicyArgDescriptor> = {
      ...(options.argDescriptors ?? {})
    };
    for (const [argName, factsources] of Object.entries(options.authorizedArgFactsources ?? {})) {
      const authorizedFactsources = collectAuthorizedFactsources(options.authorizedArgFactsources, argName);
      if (authorizedFactsources.length === 0) {
        continue;
      }
      const existingDescriptor = effectiveArgDescriptors[argName];
      effectiveArgDescriptors[argName] = {
        ...(existingDescriptor ?? {}),
        factsources: dedupeFactSources([
          ...(existingDescriptor?.factsources ?? []),
          ...authorizedFactsources
        ])
      };
    }
    return evaluateControlArgCorrelation({
      operation: options.operation,
      args: options.args,
      argDescriptors: effectiveArgDescriptors
    });
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
  const enabledRules = resolvePolicyDefaultRuleOptions(policy.defaults?.rules).filter(entry =>
    isBuiltinPolicyRuleName(entry.rule)
  );
  const policyLocked = policy.locked === true;

  for (const rule of enabledRules) {
    if (rule.rule === 'no-secret-exfil') {
      guards.push(makeDataRuleGuard({
        name: '__policy_rule_no_secret_exfil',
        ruleName: 'no-secret-exfil',
        label: 'secret',
        operationLabel: 'exfil',
        reason: "Rule 'no-secret-exfil': label 'secret' cannot flow to 'exfil'",
        operations: policy.operations,
        policyDisplayName,
        locked: policyLocked
      }));
    }
    if (rule.rule === 'no-sensitive-exfil') {
      guards.push(makeSensitiveExfilGuard(policy.operations, policyDisplayName, policyLocked));
    }
    if (rule.rule === 'no-novel-urls') {
      guards.push(makeNoNovelUrlsGuard(policy, policyDisplayName, policyLocked));
    }
    if (rule.rule === 'no-send-to-unknown') {
      guards.push(makeNamedArgAttestationGuard({
        name: '__policy_rule_no_send_to_unknown',
        ruleName: 'no-send-to-unknown',
        operationLabel: 'exfil:send',
        requiredLabel: 'known',
        reason: "Rule 'no-send-to-unknown': exfil:send destination must carry 'known'",
        missingLabelSuggestion: projectedHandleSuggestion(
          "Use a projected handle for the destination"
        ),
        operations: policy.operations,
        policyDisplayName,
        locked: policyLocked
      }));
    }
    if (rule.rule === 'no-send-to-external') {
      guards.push(makeNamedArgAttestationGuard({
        name: '__policy_rule_no_send_to_external',
        ruleName: 'no-send-to-external',
        operationLabel: 'exfil:send',
        requiredLabel: 'known:internal',
        reason: "Rule 'no-send-to-external': exfil:send destination must carry 'known:internal'",
        missingLabelSuggestion: projectedHandleSuggestion(
          "Use a projected handle for an approved internal destination"
        ),
        operations: policy.operations,
        policyDisplayName,
        locked: policyLocked
      }));
    }
    if (rule.rule === 'no-destroy-unknown') {
      guards.push(makeNamedArgAttestationGuard({
        name: '__policy_rule_no_destroy_unknown',
        ruleName: 'no-destroy-unknown',
        operationLabel: 'destructive:targeted',
        requiredLabel: 'known',
        reason: "Rule 'no-destroy-unknown': destructive:targeted target must carry 'known'",
        missingLabelSuggestion: projectedHandleSuggestion(
          "Use a projected handle for the target"
        ),
        fallbackToFirstProvided: true,
        operations: policy.operations,
        policyDisplayName,
        locked: policyLocked
      }));
    }
    if (rule.rule === 'no-unknown-extraction-sources') {
      guards.push(makeSourceArgAttestationGuard({
        name: '__policy_rule_no_unknown_extraction_sources',
        reason: "Rule 'no-unknown-extraction-sources': extraction source must carry 'known'",
        missingLabelSuggestion: projectedHandleSuggestion(
          "Use a projected handle for the source"
        ),
        policyDisplayName,
        locked: policyLocked
      }));
    }
    if (rule.rule === 'no-untrusted-destructive') {
      guards.push(makeDataRuleGuard({
        name: '__policy_rule_no_untrusted_destructive',
        ruleName: 'no-untrusted-destructive',
        label: 'untrusted',
        operationLabel: 'destructive',
        reason: "Rule 'no-untrusted-destructive': label 'untrusted' cannot flow to 'destructive'",
        operations: policy.operations,
        policyDisplayName,
        locked: policyLocked,
        taintFacts: rule.taintFacts === true
      }));
    }
    if (rule.rule === 'no-untrusted-privileged') {
      guards.push(makeDataRuleGuard({
        name: '__policy_rule_no_untrusted_privileged',
        ruleName: 'no-untrusted-privileged',
        label: 'untrusted',
        operationLabel: 'privileged',
        reason: "Rule 'no-untrusted-privileged': label 'untrusted' cannot flow to 'privileged'",
        operations: policy.operations,
        policyDisplayName,
        locked: policyLocked,
        taintFacts: rule.taintFacts === true
      }));
    }
    if (rule.rule === 'no-influenced-advice') {
      guards.push(makeDataRuleGuard({
        name: '__policy_rule_no_influenced_advice',
        ruleName: 'no-influenced-advice',
        label: 'influenced',
        operationLabel: 'advice',
        reason: "Rule 'no-influenced-advice': label 'influenced' cannot flow to 'advice' — use structured extraction to debias evaluative output",
        operations: policy.operations,
        policyDisplayName,
        locked: policyLocked
      }));
    }
  }

  for (const entry of collectDeclarativeFactRequirementEntries(policy)) {
    guards.push(makeDeclarativeFactRequirementGuard({
      opRef: entry.opRef,
      argName: entry.arg,
      clauses: entry.clauses,
      policyDisplayName,
      locked: policyLocked
    }));
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
          'Review active policies with @mx.policy.active'
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
      const decision = evaluateCommandAccess(policy, commandText, {
        enforceAllowList: shouldEnforceCommandAllowListForOperation(operation)
      });
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
            'Review active policies with @mx.policy.active'
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
              'Review active policies with @mx.policy.active'
            ]
          };
        }
        return { decision: 'allow' };
      }
    });
  }

  return guards;
}

function makeDeclarativeFactRequirementGuard(options: {
  opRef: string;
  argName: string;
  clauses: readonly string[][];
  policyDisplayName?: string;
  locked?: boolean;
}): PolicyGuardSpec {
  const rulePath = `policy.facts.requirements.${options.opRef}.${options.argName}`;
  const reason = `Rule '${rulePath}': arg '${options.argName}' must carry required fact provenance`;

  return {
    name: `__policy_fact_requirement_${options.opRef.replace(/[^a-z0-9_:@.]+/gi, '_')}_${options.argName}`,
    filterKind: 'operation',
    filterValue: 'exe',
    scope: 'perOperation',
    block: makeGuardBlock(),
    timing: 'before',
    privileged: true,
    policyCondition: ({ operation, args, argDescriptors }) => {
      if (typeof operation.named !== 'string' || operation.named.length === 0) {
        return { decision: 'allow' };
      }

      const operationRef = normalizeNamedOperationRef(operation.named);
      if (operationRef !== options.opRef) {
        return { decision: 'allow' };
      }

      if (!args || !Object.prototype.hasOwnProperty.call(args, options.argName)) {
        return {
          decision: 'deny',
          reason,
          policyName: options.policyDisplayName,
          locked: options.locked === true,
          rule: rulePath,
          suggestions: [
            projectedHandleSuggestion(
              `Use a projected handle for '${options.argName}'`
            ),
            'Review active policies with @mx.policy.active'
          ]
        };
      }

      const attestations = collectDescriptorAttestations(argDescriptors?.[options.argName]);
      for (const clause of options.clauses) {
        if (!hasAnyMatchingLabel(attestations, clause)) {
          return {
            decision: 'deny',
            reason,
            policyName: options.policyDisplayName,
            locked: options.locked === true,
            rule: rulePath,
            suggestions: [
              projectedHandleSuggestion(
                `Use a projected handle for '${options.argName}'`
              ),
              'Review active policies with @mx.policy.active'
            ]
          };
        }
      }

      return { decision: 'allow' };
    }
  };
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
  suggestions.push('Review active policies with @mx.policy.active');
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

export function evaluateCommandAccess(
  policy: PolicyConfig,
  commandText: string,
  options?: CapabilityAccessOptions
): CommandAccessDecision {
  const commandTokens = getCommandTokens(commandText);
  const commandName = getCommandName(commandTokens, commandText);

  const allow = policy.allow;
  const deny = policy.deny;
  const enforceAllowList = options?.enforceAllowList !== false;
  const allowConfigured = allow !== undefined && allow !== true;
  const allowListActive = allowConfigured && enforceAllowList;
  const allowMap =
    allowConfigured && allow && typeof allow === 'object' && !Array.isArray(allow)
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
  const allowPatterns = allowConfigured
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

export function evaluateCapabilityAccess(
  policy: PolicyConfig,
  capability: string,
  options?: CapabilityAccessOptions
): CapabilityAccessDecision {
  const allow = policy.allow;
  const deny = policy.deny;
  const allowConfigured = allow !== undefined && allow !== true;
  const allowListActive = allowConfigured && options?.enforceAllowList !== false;

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
  shellCode: string,
  options?: CapabilityAccessOptions
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
    const decision = evaluateCommandAccess(denyOnlyPolicy, commandText, options);
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

function hasMatchingLabel(values: readonly string[] | undefined, label: string): boolean {
  if (!values || values.length === 0) {
    return false;
  }
  return values.some(value => matchesLabelPattern(label, value));
}

function hasAnyMatchingLabel(
  values: readonly string[] | undefined,
  labels: readonly string[]
): boolean {
  return labels.some(label => hasMatchingLabel(values, label));
}

function makeDataRuleGuard(options: {
  name: string;
  ruleName: string;
  label: string;
  operationLabel: string;
  reason: string;
  operations?: PolicyOperations;
  policyDisplayName?: string;
  locked?: boolean;
  taintFacts?: boolean;
}): PolicyGuardSpec {
  return {
    name: options.name,
    filterKind: 'data',
    filterValue: options.label,
    scope: 'perInput',
    block: makeGuardBlock(),
    timing: 'before',
    privileged: true,
    policyCondition: ({ operation, argName }) => {
      if (!shouldApplySurfaceScopedPolicyToOperation(operation)) {
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

      const scopedArgs = getScopedTaintControlArgs({
        operation,
        ruleTaintFacts: options.taintFacts === true
      });
      if (scopedArgs && (!argName || !scopedArgs.includes(argName))) {
        return { decision: 'allow' };
      }

      return {
        decision: 'deny',
        reason: options.reason,
        policyName: options.policyDisplayName,
        rule: `policy.defaults.rules.${options.ruleName}`,
        locked: options.locked === true
      };
    }
  };
}

function makeNamedArgAttestationGuard(options: {
  name: string;
  ruleName: 'no-send-to-unknown' | 'no-send-to-external' | 'no-destroy-unknown';
  operationLabel: string;
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
      if (!shouldApplySurfaceScopedPolicyToOperation(operation)) {
        return { decision: 'allow' };
      }

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

      const selectedArgs =
        options.operationLabel === 'exfil:send'
          ? selectDestinationArgs(operation, args)
          : selectTargetArgs(operation, args);
      if (selectedArgs.length === 0) {
        return {
          decision: 'deny',
          reason: options.reason,
          policyName: options.policyDisplayName,
          rule: `policy.defaults.rules.${options.ruleName}`,
          locked: options.locked === true,
          suggestions: [
            options.missingLabelSuggestion,
            'Review active policies with @mx.policy.active'
          ]
        };
      }

      for (const argName of selectedArgs) {
        const attestations = collectDescriptorAttestations(argDescriptors?.[argName]);
        if (!hasAnyMatchingLabel(attestations, getPositiveCheckAcceptedPatterns({
          rule: options.ruleName,
          operation,
          argName
        }))) {
          return {
            decision: 'deny',
            reason: options.reason,
            policyName: options.policyDisplayName,
            rule: `policy.defaults.rules.${options.ruleName}`,
            locked: options.locked === true,
            suggestions: [
              options.missingLabelSuggestion,
              'Review active policies with @mx.policy.active'
            ]
          };
        }
      }

      return { decision: 'allow' };
    }
  };
}

function makeSourceArgAttestationGuard(options: {
  name: string;
  reason: string;
  missingLabelSuggestion: string;
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
      if (!shouldApplySurfaceScopedPolicyToOperation(operation)) {
        return { decision: 'allow' };
      }

      if (typeof operation.name !== 'string' || operation.name.length === 0) {
        return { decision: 'allow' };
      }

      const sourceArgInfo = getOperationSourceArgs(operation);
      if (!sourceArgInfo.declared || sourceArgInfo.args.length === 0) {
        return { decision: 'allow' };
      }

      const selectedArgs = selectSourceArgs(operation, args);
      if (selectedArgs.length === 0) {
        return {
          decision: 'deny',
          reason: options.reason,
          policyName: options.policyDisplayName,
          rule: 'policy.defaults.rules.no-unknown-extraction-sources',
          locked: options.locked === true,
          suggestions: [
            options.missingLabelSuggestion,
            'Review active policies with @mx.policy.active'
          ]
        };
      }

      for (const argName of selectedArgs) {
        const attestations = collectDescriptorAttestations(argDescriptors?.[argName]);
        if (!hasAnyMatchingLabel(attestations, getPositiveCheckAcceptedPatterns({
          rule: 'no-unknown-extraction-sources',
          operation,
          argName
        }))) {
          return {
            decision: 'deny',
            reason: options.reason,
            policyName: options.policyDisplayName,
            rule: 'policy.defaults.rules.no-unknown-extraction-sources',
            locked: options.locked === true,
            suggestions: [
              options.missingLabelSuggestion,
              'Review active policies with @mx.policy.active'
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
      if (!shouldApplySurfaceScopedPolicyToOperation(operation)) {
        return { decision: 'allow' };
      }

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
        rule: 'policy.defaults.rules.no-sensitive-exfil',
        locked: locked === true
      };
    }
  };
}

function makeNoNovelUrlsGuard(
  policy: PolicyConfig,
  policyDisplayName?: string,
  locked?: boolean
): PolicyGuardSpec {
  return {
    name: '__policy_rule_no_novel_urls',
    filterKind: 'operation',
    filterValue: 'exe',
    scope: 'perOperation',
    block: makeGuardBlock(),
    timing: 'before',
    privileged: true,
    policyCondition: ({ argDescriptors, urlRegistry }) => {
      const knownUrls = new Set(normalizeList(urlRegistry));
      const allowConstruction = normalizeList(policy.urls?.allowConstruction);
      const influencedDescriptors = Object.values(argDescriptors ?? {}).filter(descriptor =>
        hasMatchingLabel(collectDescriptorLabels(descriptor), 'influenced')
      );

      if (influencedDescriptors.length === 0) {
        return { decision: 'allow' };
      }

      for (const descriptor of influencedDescriptors) {
        for (const url of normalizeList(descriptor?.urls)) {
          if (knownUrls.has(url) || isUrlAllowedByConstruction(url, allowConstruction)) {
            continue;
          }
          return {
            decision: 'deny',
            reason: "Rule 'no-novel-urls': influenced args cannot introduce URLs absent from the execution input registry",
            policyName: policyDisplayName,
            rule: 'policy.defaults.rules.no-novel-urls',
            locked: locked === true,
            suggestions: [
              'Pass through a URL that was read from external input, or add the domain to policy.urls.allowConstruction',
              'Review active policies with @mx.policy.active'
            ]
          };
        }
      }

      return { decision: 'allow' };
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
