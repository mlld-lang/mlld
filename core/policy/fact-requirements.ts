import { matchesLabelPattern } from './fact-labels';
import { normalizeNamedOperationRef } from './operation-labels';
import { normalizePolicyConfig, type PolicyConfig } from './union';

const SEND_DESTINATION_ARG_SELECTORS = ['recipient', 'recipients', 'cc', 'bcc'] as const;
const TARGET_ARG_SELECTORS = ['id'] as const;

export const SEND_KNOWN_FACT_PATTERNS = ['fact:*.email'] as const;
export const SEND_INTERNAL_FACT_PATTERNS = ['fact:internal:*.email'] as const;
export const TARGET_KNOWN_FACT_PATTERNS = ['fact:*.id'] as const;

export const SEND_KNOWN_PATTERNS = ['known', ...SEND_KNOWN_FACT_PATTERNS] as const;
export const SEND_INTERNAL_PATTERNS = ['known:internal', ...SEND_INTERNAL_FACT_PATTERNS] as const;
export const TARGET_KNOWN_PATTERNS = ['known', ...TARGET_KNOWN_FACT_PATTERNS] as const;

export interface OperationMetadataLike {
  metadata?: Record<string, unknown>;
  opLabels?: readonly string[];
  labels?: readonly string[];
}

export interface FactRequirement {
  arg: string;
  patterns: string[];
  source: 'builtin' | 'policy' | 'declarative';
  rule?: string;
}

export interface FactRequirementResolution {
  status: 'resolved' | 'no_requirement' | 'unknown_operation';
  opRef?: string;
  requirements: FactRequirement[];
}

export interface OperationFactRequirementResolution {
  status: 'resolved' | 'no_requirement' | 'unknown_operation';
  opRef?: string;
  requirementsByArg: Record<string, FactRequirement[]>;
}

type PositiveFactPolicyRule =
  | 'no-send-to-unknown'
  | 'no-send-to-external'
  | 'no-destroy-unknown';

type BuiltInOperationFactSpec = {
  opRef: string;
  argKind: 'controlArgs' | 'target';
  args: readonly string[];
  basePatterns: readonly string[];
  policyPatterns?: Partial<Record<PositiveFactPolicyRule, readonly string[]>>;
};

const BUILTIN_OPERATION_FACT_SPECS: readonly BuiltInOperationFactSpec[] = [
  {
    opRef: 'op:named:email.send',
    argKind: 'controlArgs',
    args: SEND_DESTINATION_ARG_SELECTORS,
    basePatterns: SEND_KNOWN_FACT_PATTERNS,
    policyPatterns: {
      'no-send-to-external': SEND_INTERNAL_FACT_PATTERNS
    }
  },
  {
    opRef: 'op:named:crm.delete',
    argKind: 'target',
    args: TARGET_ARG_SELECTORS,
    basePatterns: TARGET_KNOWN_FACT_PATTERNS
  }
] as const;

const POSITIVE_FACT_POLICY_RULES = new Set<PositiveFactPolicyRule>([
  'no-send-to-unknown',
  'no-send-to-external',
  'no-destroy-unknown'
]);

function isEmptyAuthorizationValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
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

export function selectNamedArgsWithFallback(
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

export function getOperationControlArgs(operation: OperationMetadataLike): {
  declared: boolean;
  args: string[];
} {
  const metadata = operation.metadata;
  if (!metadata) {
    return { declared: false, args: [] };
  }

  for (const candidate of [metadata.authorizationControlArgs, metadata.controlArgs]) {
    if (!Array.isArray(candidate)) {
      continue;
    }
    return {
      declared: true,
      args: candidate.filter(
        (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
      )
    };
  }

  return { declared: false, args: [] };
}

export function selectDestinationArgs(
  operation: OperationMetadataLike,
  args: Readonly<Record<string, unknown>> | undefined
): string[] {
  if (!args) {
    return [];
  }

  const controlArgInfo = getOperationControlArgs(operation);
  if (!controlArgInfo.declared) {
    const rawOpLabels = [
      ...(operation.opLabels ?? []),
      ...(operation.labels ?? [])
    ];
    if (rawOpLabels.some(label => matchesLabelPattern('tool:w', label))) {
      return [];
    }
    return selectNamedArgsWithFallback(args, SEND_DESTINATION_ARG_SELECTORS, {
      ignoreEmpty: true,
      fallbackToFirstProvided: true
    });
  }

  return controlArgInfo.args.filter(
    controlArg =>
      Object.prototype.hasOwnProperty.call(args, controlArg) &&
      !isEmptyAuthorizationValue(args[controlArg])
  );
}

export function selectTargetArgs(
  args: Readonly<Record<string, unknown>> | undefined
): string[] {
  return selectNamedArgsWithFallback(args, TARGET_ARG_SELECTORS, {
    fallbackToFirstProvided: true
  });
}

function normalizeArgName(argName?: string): string | null {
  const normalized = typeof argName === 'string' ? argName.trim().toLowerCase() : '';
  return normalized.length > 0 ? normalized : null;
}

function normalizeControlArgs(controlArgs?: readonly string[]): string[] {
  return (controlArgs ?? [])
    .map(value => value.trim().toLowerCase())
    .filter(value => value.length > 0);
}

function getEnabledPositiveFactRules(
  policy?: Pick<PolicyConfig, 'defaults'>
): Set<PositiveFactPolicyRule> {
  const enabled = new Set<PositiveFactPolicyRule>();
  for (const rule of policy?.defaults?.rules ?? []) {
    if (POSITIVE_FACT_POLICY_RULES.has(rule as PositiveFactPolicyRule)) {
      enabled.add(rule as PositiveFactPolicyRule);
    }
  }
  return enabled;
}

export interface DeclarativeFactRequirementEntry {
  opRef: string;
  arg: string;
  clauses: readonly string[][];
}

export function collectDeclarativeFactRequirementEntries(
  policy?: Pick<PolicyConfig, 'facts'>
): DeclarativeFactRequirementEntry[] {
  const normalizedPolicy = normalizePolicyConfig(policy as PolicyConfig | undefined);
  const output: DeclarativeFactRequirementEntry[] = [];
  for (const [opRef, args] of Object.entries(normalizedPolicy.facts?.requirements ?? {})) {
    for (const [arg, clauses] of Object.entries(args)) {
      if (!Array.isArray(clauses) || clauses.length === 0) {
        continue;
      }
      output.push({
        opRef,
        arg,
        clauses
      });
    }
  }
  return output;
}

function collectDeclarativeFactRequirements(options: {
  opRef?: string;
  argName: string;
  policy?: Pick<PolicyConfig, 'facts'>;
}): FactRequirement[] {
  if (!options.opRef) {
    return [];
  }

  const normalizedPolicy = normalizePolicyConfig(options.policy as PolicyConfig | undefined);
  const clauses = normalizedPolicy.facts?.requirements?.[options.opRef]?.[options.argName];
  if (!Array.isArray(clauses) || clauses.length === 0) {
    return [];
  }

  return clauses.map(patterns => ({
    arg: options.argName,
    patterns: [...patterns],
    source: 'declarative',
    rule: `policy.facts.requirements.${options.opRef}.${options.argName}`
  }));
}

function appendRequirements(
  output: FactRequirement[],
  options: {
    argName: string;
    basePatterns: readonly string[];
    enabledRules: ReadonlySet<PositiveFactPolicyRule>;
    policyPatterns?: Partial<Record<PositiveFactPolicyRule, readonly string[]>>;
  }
): void {
  output.push({
    arg: options.argName,
    patterns: [...options.basePatterns],
    source: 'builtin'
  });

  for (const [rule, patterns] of Object.entries(options.policyPatterns ?? {}) as Array<
    [PositiveFactPolicyRule, readonly string[] | undefined]
  >) {
    if (!patterns || !options.enabledRules.has(rule)) {
      continue;
    }
    output.push({
      arg: options.argName,
      patterns: [...patterns],
      source: 'policy',
      rule: `policy.defaults.rules.${rule}`
    });
  }
}

function resolveBuiltInFactRequirementsFromSpec(options: {
  argName: string;
  opRef: string;
  spec: BuiltInOperationFactSpec;
  enabledRules: ReadonlySet<PositiveFactPolicyRule>;
}): FactRequirementResolution {
  const requirements: FactRequirement[] = [];

  if (options.spec.args.includes(options.argName)) {
    appendRequirements(requirements, {
      argName: options.argName,
      basePatterns: options.spec.basePatterns,
      enabledRules: options.enabledRules,
      policyPatterns: options.spec.policyPatterns
    });
  }

  return {
    status: requirements.length > 0 ? 'resolved' : 'no_requirement',
    opRef: options.opRef,
    requirements
  };
}

function resolveBuiltInFactRequirementsFromOperationLabels(options: {
  argName: string;
  opRef?: string;
  operationLabels?: readonly string[];
  controlArgs?: readonly string[];
  hasControlArgsMetadata?: boolean;
  enabledRules: ReadonlySet<PositiveFactPolicyRule>;
}): FactRequirementResolution | null {
  const operationLabels = options.operationLabels ?? [];
  const normalizedControlArgs = normalizeControlArgs(options.controlArgs);
  const hasSend = operationLabels.some(label => matchesLabelPattern('exfil:send', label));
  if (hasSend) {
    if (options.hasControlArgsMetadata !== true) {
      return {
        status: 'no_requirement',
        opRef: options.opRef,
        requirements: []
      };
    }
    const requirements: FactRequirement[] = [];
    if (normalizedControlArgs.includes(options.argName)) {
      appendRequirements(requirements, {
        argName: options.argName,
        basePatterns: SEND_KNOWN_FACT_PATTERNS,
        enabledRules: options.enabledRules,
        policyPatterns: {
          'no-send-to-external': SEND_INTERNAL_FACT_PATTERNS
        }
      });
    }
    return {
      status: requirements.length > 0 ? 'resolved' : 'no_requirement',
      opRef: options.opRef,
      requirements
    };
  }

  const hasTargetedDestroy = operationLabels.some(label =>
    matchesLabelPattern('destructive:targeted', label)
  );
  if (hasTargetedDestroy) {
    if (options.hasControlArgsMetadata !== true) {
      return {
        status: 'no_requirement',
        opRef: options.opRef,
        requirements: []
      };
    }
    const requirements: FactRequirement[] = [];
    if (normalizedControlArgs.includes(options.argName)) {
      appendRequirements(requirements, {
        argName: options.argName,
        basePatterns: TARGET_KNOWN_FACT_PATTERNS,
        enabledRules: options.enabledRules
      });
    }
    return {
      status: requirements.length > 0 ? 'resolved' : 'no_requirement',
      opRef: options.opRef,
      requirements
    };
  }

  if (operationLabels.length > 0) {
    return {
      status: 'no_requirement',
      opRef: options.opRef,
      requirements: []
    };
  }

  return null;
}

export function resolveFactRequirementsForOperationArg(options: {
  opRef?: string;
  argName?: string;
  operationLabels?: readonly string[];
  controlArgs?: readonly string[];
  hasControlArgsMetadata?: boolean;
  policy?: Pick<PolicyConfig, 'defaults' | 'facts'>;
}): FactRequirementResolution {
  const argName = normalizeArgName(options.argName);
  const normalizedOpRef = typeof options.opRef === 'string'
    ? normalizeNamedOperationRef(options.opRef)
    : undefined;

  if (!argName) {
    return {
      status: 'no_requirement',
      opRef: normalizedOpRef,
      requirements: []
    };
  }

  const normalizedPolicy = normalizePolicyConfig(options.policy as PolicyConfig | undefined);
  const enabledRules = getEnabledPositiveFactRules(normalizedPolicy);

  const liveMetadataResolution = resolveBuiltInFactRequirementsFromOperationLabels({
        argName,
        opRef: normalizedOpRef,
        operationLabels: options.operationLabels,
        controlArgs: options.controlArgs,
        hasControlArgsMetadata: options.hasControlArgsMetadata,
    enabledRules
  });
  if (liveMetadataResolution) {
    const declarativeRequirements = collectDeclarativeFactRequirements({
      opRef: normalizedOpRef,
      argName,
      policy: normalizedPolicy
    });
    if (declarativeRequirements.length === 0) {
      return liveMetadataResolution;
    }
    return {
      status: 'resolved',
      opRef: normalizedOpRef,
      requirements: [...liveMetadataResolution.requirements, ...declarativeRequirements]
    };
  }

  if (!normalizedOpRef) {
    return {
      status: 'unknown_operation',
      requirements: []
    };
  }

  const builtInSpec = BUILTIN_OPERATION_FACT_SPECS.find(spec => spec.opRef === normalizedOpRef);
  const builtInResolution = builtInSpec
    ? resolveBuiltInFactRequirementsFromSpec({
        argName,
        opRef: normalizedOpRef,
        spec: builtInSpec,
        enabledRules
      })
    : {
        status: 'unknown_operation' as const,
        opRef: normalizedOpRef,
        requirements: []
      };

  const declarativeRequirements = collectDeclarativeFactRequirements({
    opRef: normalizedOpRef,
    argName,
    policy: normalizedPolicy
  });
  if (declarativeRequirements.length === 0) {
    return builtInResolution;
  }

  return {
    status: 'resolved',
    opRef: normalizedOpRef,
    requirements: [...builtInResolution.requirements, ...declarativeRequirements]
  };
}

export function resolveFactRequirementsForOperation(options: {
  opRef?: string;
  operationLabels?: readonly string[];
  controlArgs?: readonly string[];
  hasControlArgsMetadata?: boolean;
  policy?: Pick<PolicyConfig, 'defaults' | 'facts'>;
}): OperationFactRequirementResolution {
  const normalizedOpRef = typeof options.opRef === 'string'
    ? normalizeNamedOperationRef(options.opRef)
    : undefined;
  const normalizedPolicy = normalizePolicyConfig(options.policy as PolicyConfig | undefined);
  const candidateArgs = new Set<string>();

  for (const controlArg of normalizeControlArgs(options.controlArgs)) {
    candidateArgs.add(controlArg);
  }

  if (normalizedOpRef) {
    const builtInSpec = BUILTIN_OPERATION_FACT_SPECS.find(spec => spec.opRef === normalizedOpRef);
    for (const arg of builtInSpec?.args ?? []) {
      candidateArgs.add(arg);
    }

    for (const entry of collectDeclarativeFactRequirementEntries(normalizedPolicy)) {
      if (entry.opRef === normalizedOpRef) {
        candidateArgs.add(entry.arg);
      }
    }
  }

  const requirementsByArg: Record<string, FactRequirement[]> = {};
  let sawUnknownOperation = false;

  for (const argName of candidateArgs) {
    const resolution = resolveFactRequirementsForOperationArg({
      opRef: normalizedOpRef,
      argName,
      operationLabels: options.operationLabels,
      controlArgs: options.controlArgs,
      hasControlArgsMetadata: options.hasControlArgsMetadata,
      policy: normalizedPolicy
    });

    if (resolution.status === 'resolved' && resolution.requirements.length > 0) {
      requirementsByArg[argName] = resolution.requirements;
      continue;
    }

    if (resolution.status === 'unknown_operation') {
      sawUnknownOperation = true;
    }
  }

  if (Object.keys(requirementsByArg).length > 0) {
    return {
      status: 'resolved',
      opRef: normalizedOpRef,
      requirementsByArg
    };
  }

  if (sawUnknownOperation) {
    return {
      status: 'unknown_operation',
      opRef: normalizedOpRef,
      requirementsByArg: {}
    };
  }

  return {
    status: 'no_requirement',
    opRef: normalizedOpRef,
    requirementsByArg: {}
  };
}
