import type { FactSourceHandle } from '@core/types/handle';
import { isTolerantMatch } from '@interpreter/eval/expressions';

export type AuthorizationConstraintClause =
  | { eq: unknown; attestations?: readonly string[] }
  | { oneOf: unknown[]; oneOfAttestations?: readonly (readonly string[])[] };

export type AuthorizationEntry =
  | { kind: 'tool' }
  | { kind: 'unconstrained' }
  | {
      kind: 'constrained';
      args: Record<string, AuthorizationConstraintClause[]>;
    };

export type PolicyAuthorizations = {
  allow?: Record<string, AuthorizationEntry>;
  deny?: string[];
};

export interface AuthorizationToolContext {
  name: string;
  params: Set<string>;
  controlArgs: Set<string>;
  hasControlArgsMetadata: boolean;
  updateArgs: Set<string>;
  hasUpdateArgsMetadata: boolean;
  exactPayloadArgs?: Set<string>;
}

export interface PolicyAuthorizationIssue {
  code:
    | 'authorizations-invalid'
    | 'authorizations-unknown-field'
    | 'authorizations-unknown-tool'
    | 'authorizations-denied-tool'
    | 'authorizations-unknown-arg'
    | 'authorizations-unsupported-constraint'
    | 'authorizations-missing-control-arg'
    | 'authorizations-unconstrained-control-args'
    | 'authorizations-missing-tool-context'
    | 'authorizations-empty-entry'
    | 'authorizations-unconstrained-tool';
  message: string;
  severity: 'error' | 'warning';
  path?: string;
  tool?: string;
  arg?: string;
}

export interface PolicyAuthorizationValidationResult {
  normalized?: PolicyAuthorizations;
  errors: PolicyAuthorizationIssue[];
  warnings: PolicyAuthorizationIssue[];
}

export interface AuthorizationValidationOptions {
  requireKnownTools?: boolean;
  requireControlArgsMetadata?: boolean;
  deniedTools?: ReadonlySet<string> | readonly string[];
}

export type PolicyAuthorizationDecision =
  | {
      decision: 'allow';
      matched: true;
      matchedAttestations?: Readonly<Record<string, readonly string[]>>;
      matchedFactsources?: Readonly<Record<string, readonly FactSourceHandle[]>>;
    }
  | {
      decision: 'deny';
      matched: true;
      code: 'unlisted' | 'args_mismatch';
      reason: string;
    };

const authorizationConstraintEqFactsources = new WeakMap<
  Extract<AuthorizationConstraintClause, { eq: unknown }>,
  readonly FactSourceHandle[]
>();

const authorizationConstraintOneOfFactsources = new WeakMap<
  Extract<AuthorizationConstraintClause, { oneOf: unknown[] }>,
  readonly (readonly FactSourceHandle[])[]
>();

function cloneFactSourceHandle(handle: FactSourceHandle): FactSourceHandle {
  return {
    ...handle,
    ...(Array.isArray(handle.tiers) ? { tiers: Object.freeze([...handle.tiers]) } : {})
  };
}

function cloneFactSources(
  factsources: readonly FactSourceHandle[]
): readonly FactSourceHandle[] {
  return Object.freeze(factsources.map(cloneFactSourceHandle));
}

function cloneOneOfFactsources(
  factsources: readonly (readonly FactSourceHandle[])[]
): readonly (readonly FactSourceHandle[])[] {
  return Object.freeze(factsources.map(entry => cloneFactSources(entry)));
}

function copyConstraintClauseFactsources(
  source: AuthorizationConstraintClause,
  target: AuthorizationConstraintClause
): void {
  if ('eq' in source && 'eq' in target) {
    const factsources = authorizationConstraintEqFactsources.get(source);
    if (factsources) {
      authorizationConstraintEqFactsources.set(target, cloneFactSources(factsources));
    }
    return;
  }

  if ('oneOf' in source && 'oneOf' in target) {
    const factsources = authorizationConstraintOneOfFactsources.get(source);
    if (factsources) {
      authorizationConstraintOneOfFactsources.set(target, cloneOneOfFactsources(factsources));
    }
  }
}

export function setAuthorizationConstraintClauseEqFactsources(
  clause: Extract<AuthorizationConstraintClause, { eq: unknown }>,
  factsources: readonly FactSourceHandle[] | undefined
): void {
  if (!factsources || factsources.length === 0) {
    authorizationConstraintEqFactsources.delete(clause);
    return;
  }
  authorizationConstraintEqFactsources.set(clause, cloneFactSources(factsources));
}

export function setAuthorizationConstraintClauseOneOfFactsources(
  clause: Extract<AuthorizationConstraintClause, { oneOf: unknown[] }>,
  factsources: readonly (readonly FactSourceHandle[])[]
): void {
  if (!factsources.some(entry => entry.length > 0)) {
    authorizationConstraintOneOfFactsources.delete(clause);
    return;
  }
  authorizationConstraintOneOfFactsources.set(clause, cloneOneOfFactsources(factsources));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cloneConstraintClause(clause: AuthorizationConstraintClause): AuthorizationConstraintClause {
  if ('eq' in clause) {
    const cloned: AuthorizationConstraintClause = {
      eq: clause.eq,
      ...(Array.isArray(clause.attestations) ? { attestations: clause.attestations.slice() } : {})
    };
    copyConstraintClauseFactsources(clause, cloned);
    return cloned;
  }
  const cloned: AuthorizationConstraintClause = {
    oneOf: clause.oneOf.slice(),
    ...(Array.isArray(clause.oneOfAttestations)
      ? {
          oneOfAttestations: clause.oneOfAttestations.map(entry =>
            Array.isArray(entry) ? entry.slice() : []
          )
        }
      : {})
  };
  copyConstraintClauseFactsources(clause, cloned);
  return cloned;
}

function cloneAuthorizationEntry(entry: AuthorizationEntry): AuthorizationEntry {
  if (entry.kind === 'tool') {
    return { kind: 'tool' };
  }
  if (entry.kind === 'unconstrained') {
    return { kind: 'unconstrained' };
  }

  const args: Record<string, AuthorizationConstraintClause[]> = {};
  for (const [argName, clauses] of Object.entries(entry.args)) {
    args[argName] = clauses.map(cloneConstraintClause);
  }
  return { kind: 'constrained', args };
}

function stripEntryToDeclaredControlArgs(
  entry: AuthorizationEntry,
  tool?: AuthorizationToolContext
): AuthorizationEntry {
  const cloned = cloneAuthorizationEntry(entry);
  if (!tool?.hasControlArgsMetadata || cloned.kind !== 'constrained') {
    return cloned;
  }

  const args: Record<string, AuthorizationConstraintClause[]> = {};
  for (const [argName, clauses] of Object.entries(cloned.args)) {
    if (!tool.controlArgs.has(argName)) {
      continue;
    }
    args[argName] = clauses.map(cloneConstraintClause);
  }

  if (Object.keys(args).length === 0) {
    return tool.controlArgs.size === 0
      ? { kind: 'unconstrained' }
      : { kind: 'constrained', args: {} };
  }

  return { kind: 'constrained', args };
}

function cloneAuthorizations(authorizations?: PolicyAuthorizations): PolicyAuthorizations | undefined {
  if (!authorizations) {
    return undefined;
  }

  const allow =
    authorizations.allow !== undefined
      ? Object.fromEntries(
          Object.entries(authorizations.allow).map(([toolName, entry]) => [
            toolName,
            cloneAuthorizationEntry(entry)
          ])
        )
      : undefined;
  const deny =
    Array.isArray(authorizations.deny)
      ? authorizations.deny.slice()
      : undefined;

  if (!allow && !deny) {
    return undefined;
  }

  return {
    ...(allow ? { allow } : {}),
    ...(deny ? { deny } : {})
  };
}

function addIssue(
  collection: PolicyAuthorizationIssue[],
  issue: PolicyAuthorizationIssue
): void {
  collection.push(issue);
}

function getEffectiveControlArgs(tool: AuthorizationToolContext): Set<string> {
  if (tool.hasControlArgsMetadata) {
    return tool.controlArgs;
  }
  return tool.params;
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      return undefined;
    }
    const trimmed = entry.trim();
    if (trimmed.length > 0 && !normalized.includes(trimmed)) {
      normalized.push(trimmed);
    }
  }
  return normalized;
}

function isNormalizedConstraintClause(value: unknown): value is AuthorizationConstraintClause {
  if (!isPlainObject(value)) {
    return false;
  }

  const keys = Object.keys(value);
  const unsupportedKeys = keys.filter(
    key => key !== 'eq' && key !== 'oneOf' && key !== 'attestations' && key !== 'oneOfAttestations'
  );
  if (unsupportedKeys.length > 0) {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'eq')) {
    return (
      !Object.prototype.hasOwnProperty.call(value, 'oneOf')
      && (!Object.prototype.hasOwnProperty.call(value, 'oneOfAttestations'))
      && (
        value.attestations === undefined
        || (Array.isArray(value.attestations) && value.attestations.every(entry => typeof entry === 'string'))
      )
    );
  }
  return (
    Object.prototype.hasOwnProperty.call(value, 'oneOf')
    && Array.isArray(value.oneOf)
    && (
      value.oneOfAttestations === undefined
      || (
        Array.isArray(value.oneOfAttestations)
        && value.oneOfAttestations.every(
          entry => Array.isArray(entry) && entry.every(label => typeof label === 'string')
        )
      )
    )
    && !Object.prototype.hasOwnProperty.call(value, 'attestations')
  );
}

function isNormalizedAuthorizationEntry(value: unknown): value is AuthorizationEntry {
  if (!isPlainObject(value) || typeof value.kind !== 'string') {
    return false;
  }

  if (value.kind === 'tool') {
    return Object.keys(value).length === 1;
  }

  if (value.kind === 'unconstrained') {
    return Object.keys(value).length === 1;
  }

  if (value.kind !== 'constrained' || !isPlainObject(value.args)) {
    return false;
  }

  return Object.values(value.args).every(
    clauses =>
      Array.isArray(clauses) && clauses.every(clause => isNormalizedConstraintClause(clause))
  );
}

function normalizeConstraint(
  toolName: string,
  argName: string,
  raw: unknown,
  errors: PolicyAuthorizationIssue[]
): AuthorizationConstraintClause | undefined {
  if (isPlainObject(raw) && ('eq' in raw || 'oneOf' in raw)) {
    const keys = Object.keys(raw);
    const internalKeys = keys.filter(key => key === 'attestations' || key === 'oneOfAttestations');
    const supportedKeys = new Set(['eq', 'oneOf', ...internalKeys]);
    const unsupportedAugmentedKeys = keys.filter(key => !supportedKeys.has(key));
    if (unsupportedAugmentedKeys.length > 0) {
      addIssue(errors, {
        code: 'authorizations-unsupported-constraint',
        severity: 'error',
        tool: toolName,
        arg: argName,
        path: `authorizations.allow.${toolName}.args.${argName}`,
        message: `Unsupported constraint fields for '${toolName}.${argName}': ${unsupportedAugmentedKeys.join(', ')}`
      });
      return undefined;
    }

    const hasEq = Object.prototype.hasOwnProperty.call(raw, 'eq');
    const hasOneOf = Object.prototype.hasOwnProperty.call(raw, 'oneOf');
    if ((hasEq && hasOneOf) || (!hasEq && !hasOneOf)) {
      addIssue(errors, {
        code: 'authorizations-unsupported-constraint',
        severity: 'error',
        tool: toolName,
        arg: argName,
        path: `authorizations.allow.${toolName}.args.${argName}`,
        message: `Constraint for '${toolName}.${argName}' must use exactly one of 'eq' or 'oneOf'`
      });
      return undefined;
    }

    if (hasEq) {
      return {
        eq: raw.eq,
        ...(Array.isArray(raw.attestations)
          ? {
              attestations: raw.attestations.filter(
                (entry): entry is string => typeof entry === 'string' && entry.length > 0
              )
            }
          : {})
      };
    }

    if (!Array.isArray(raw.oneOf)) {
      addIssue(errors, {
        code: 'authorizations-unsupported-constraint',
        severity: 'error',
        tool: toolName,
        arg: argName,
        path: `authorizations.allow.${toolName}.args.${argName}.oneOf`,
        message: `Constraint '${toolName}.${argName}.oneOf' must be an array`
      });
      return undefined;
    }

    return {
      oneOf: raw.oneOf.slice(),
      ...(Array.isArray(raw.oneOfAttestations)
        ? {
            oneOfAttestations: raw.oneOfAttestations.map(entry =>
              Array.isArray(entry)
                ? entry.filter((label): label is string => typeof label === 'string' && label.length > 0)
                : []
            )
          }
        : {})
    };
  }

  return { eq: raw };
}

function normalizeEntry(
  toolName: string,
  raw: unknown,
  errors: PolicyAuthorizationIssue[],
  warnings: PolicyAuthorizationIssue[],
  tool?: AuthorizationToolContext
): AuthorizationEntry | undefined {
  if (isNormalizedAuthorizationEntry(raw)) {
    return stripEntryToDeclaredControlArgs(raw, tool);
  }

  if (raw === true) {
    return { kind: 'unconstrained' };
  }

  if (!isPlainObject(raw)) {
    addIssue(errors, {
      code: 'authorizations-invalid',
      severity: 'error',
      tool: toolName,
      path: `authorizations.allow.${toolName}`,
      message: `Authorization entry for '${toolName}' must be true or an object`
    });
    return undefined;
  }

  const entryKeys = Object.keys(raw);
  if (entryKeys.length === 0) {
    addIssue(warnings, {
      code: 'authorizations-empty-entry',
      severity: 'warning',
      tool: toolName,
      path: `authorizations.allow.${toolName}`,
      message: `Authorization entry '{}' for '${toolName}' normalizes to true`
    });
    return { kind: 'unconstrained' };
  }

  const unsupportedKeys = entryKeys.filter(key => key !== 'args');
  if (unsupportedKeys.length > 0) {
    addIssue(errors, {
      code: 'authorizations-unknown-field',
      severity: 'error',
      tool: toolName,
      path: `authorizations.allow.${toolName}`,
      message: `Unsupported authorization entry fields for '${toolName}': ${unsupportedKeys.join(', ')}`
    });
    return undefined;
  }

  const rawArgs = raw.args;
  if (rawArgs === undefined) {
    addIssue(warnings, {
      code: 'authorizations-empty-entry',
      severity: 'warning',
      tool: toolName,
      path: `authorizations.allow.${toolName}`,
      message: `Authorization entry for '${toolName}' without args normalizes to true`
    });
    return { kind: 'unconstrained' };
  }

  if (!isPlainObject(rawArgs)) {
    addIssue(errors, {
      code: 'authorizations-invalid',
      severity: 'error',
      tool: toolName,
      path: `authorizations.allow.${toolName}.args`,
      message: `Authorization args for '${toolName}' must be an object`
    });
    return undefined;
  }

  const rawArgEntries = Object.entries(rawArgs);
  if (rawArgEntries.length === 0) {
    if (tool?.hasControlArgsMetadata) {
      return tool.controlArgs.size === 0
        ? { kind: 'unconstrained' }
        : { kind: 'constrained', args: {} };
    }

    addIssue(warnings, {
      code: 'authorizations-empty-entry',
      severity: 'warning',
      tool: toolName,
      path: `authorizations.allow.${toolName}.args`,
      message: `Authorization entry '{ args: {} }' for '${toolName}' normalizes to true`
    });
    return { kind: 'unconstrained' };
  }

  const argEntries =
    tool?.hasControlArgsMetadata
      ? rawArgEntries.filter(([argName]) => tool.controlArgs.has(argName))
      : rawArgEntries;
  if (argEntries.length === 0) {
    return tool?.hasControlArgsMetadata && tool.controlArgs.size > 0
      ? { kind: 'constrained', args: {} }
      : { kind: 'unconstrained' };
  }

  const args: Record<string, AuthorizationConstraintClause[]> = {};
  for (const [argName, rawConstraint] of argEntries) {
    const clause = normalizeConstraint(toolName, argName, rawConstraint, errors);
    if (!clause) {
      continue;
    }
    args[argName] = [clause];
  }

  return stripEntryToDeclaredControlArgs({ kind: 'constrained', args }, tool);
}

export function normalizePolicyAuthorizations(
  raw: unknown,
  issues?: {
    errors?: PolicyAuthorizationIssue[];
    warnings?: PolicyAuthorizationIssue[];
  },
  toolContext?: ReadonlyMap<string, AuthorizationToolContext>
): PolicyAuthorizations | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  const errors = issues?.errors ?? [];
  const warnings = issues?.warnings ?? [];

  if (!isPlainObject(raw)) {
    addIssue(errors, {
      code: 'authorizations-invalid',
      severity: 'error',
      path: 'authorizations',
      message: 'policy.authorizations must be an object'
    });
    return undefined;
  }

  const keys = Object.keys(raw);
  const unsupportedKeys = keys.filter(key => key !== 'allow' && key !== 'deny');
  if (unsupportedKeys.length > 0) {
    addIssue(errors, {
      code: 'authorizations-unknown-field',
      severity: 'error',
      path: 'authorizations',
      message: `Unsupported policy.authorizations fields: ${unsupportedKeys.join(', ')}`
    });
  }

  const hasAllow = Object.prototype.hasOwnProperty.call(raw, 'allow');
  const hasDeny = Object.prototype.hasOwnProperty.call(raw, 'deny');
  if (!hasAllow && !hasDeny) {
    return undefined;
  }

  let allow: Record<string, AuthorizationEntry> | undefined;
  if (hasAllow) {
    const rawAllow = raw.allow;
    if (!isPlainObject(rawAllow)) {
      addIssue(errors, {
        code: 'authorizations-invalid',
        severity: 'error',
        path: 'authorizations.allow',
        message: 'policy.authorizations.allow must be an object'
      });
    } else {
      allow = {};
      for (const [toolName, rawEntry] of Object.entries(rawAllow)) {
        const normalizedEntry = normalizeEntry(
          toolName,
          rawEntry,
          errors,
          warnings,
          toolContext?.get(toolName)
        );
        if (normalizedEntry) {
          allow[toolName] = normalizedEntry;
        }
      }
    }
  }

  let deny: string[] | undefined;
  if (hasDeny) {
    deny = normalizeStringList(raw.deny);
    if (!deny) {
      addIssue(errors, {
        code: 'authorizations-invalid',
        severity: 'error',
        path: 'authorizations.deny',
        message: 'policy.authorizations.deny must be an array of strings'
      });
    }
  }

  if (!allow && !deny) {
    return undefined;
  }

  return {
    ...(allow ? { allow } : {}),
    ...(deny ? { deny } : {})
  };
}

export function mergePolicyAuthorizations(
  base?: PolicyAuthorizations,
  incoming?: PolicyAuthorizations
): PolicyAuthorizations | undefined {
  if (!base) {
    return cloneAuthorizations(incoming);
  }
  if (!incoming) {
    return cloneAuthorizations(base);
  }

  let allow: Record<string, AuthorizationEntry> | undefined;
  if (base.allow && incoming.allow) {
    allow = {};
    const sharedTools = Object.keys(base.allow).filter(toolName =>
      Object.prototype.hasOwnProperty.call(incoming.allow!, toolName)
    );

    for (const toolName of sharedTools) {
      const left = base.allow[toolName];
      const right = incoming.allow[toolName];

      if (left.kind === 'tool' && right.kind === 'tool') {
        allow[toolName] = { kind: 'tool' };
        continue;
      }

      if (
        (left.kind === 'tool' && right.kind === 'unconstrained')
        || (left.kind === 'unconstrained' && right.kind === 'tool')
      ) {
        allow[toolName] = { kind: 'tool' };
        continue;
      }

      if (left.kind === 'unconstrained' && right.kind === 'unconstrained') {
        allow[toolName] = { kind: 'unconstrained' };
        continue;
      }

      const leftArgs = left.kind === 'constrained' ? left.args : {};
      const rightArgs = right.kind === 'constrained' ? right.args : {};
      const args: Record<string, AuthorizationConstraintClause[]> = {};
      const argNames = new Set<string>([...Object.keys(leftArgs), ...Object.keys(rightArgs)]);

      for (const argName of argNames) {
        args[argName] = [
          ...(leftArgs[argName] ?? []).map(cloneConstraintClause),
          ...(rightArgs[argName] ?? []).map(cloneConstraintClause)
        ];
      }

      allow[toolName] = { kind: 'constrained', args };
    }
  } else if (base.allow) {
    allow = cloneAuthorizations(base)?.allow;
  } else if (incoming.allow) {
    allow = cloneAuthorizations(incoming)?.allow;
  }

  const deny = Array.from(new Set([...(base.deny ?? []), ...(incoming.deny ?? [])]));
  if (!allow && deny.length === 0) {
    return undefined;
  }

  return {
    ...(allow ? { allow } : {}),
    ...(deny.length > 0 ? { deny } : {})
  };
}

export function hasToolWriteAuthorizationPolicy(authorizations?: PolicyAuthorizations): boolean {
  return authorizations?.allow !== undefined;
}

export function validatePolicyAuthorizations(
  raw: unknown,
  toolContext?: ReadonlyMap<string, AuthorizationToolContext>,
  options: AuthorizationValidationOptions = {}
): PolicyAuthorizationValidationResult {
  const errors: PolicyAuthorizationIssue[] = [];
  const warnings: PolicyAuthorizationIssue[] = [];
  const normalized = normalizePolicyAuthorizations(raw, { errors, warnings }, toolContext);

  if (!normalized) {
    return { normalized, errors, warnings };
  }

  validateNormalizedPolicyAuthorizationsInto(normalized, errors, warnings, toolContext, options);

  return { normalized, errors, warnings };
}

function validateNormalizedPolicyAuthorizationsInto(
  normalized: PolicyAuthorizations,
  errors: PolicyAuthorizationIssue[],
  warnings: PolicyAuthorizationIssue[],
  toolContext?: ReadonlyMap<string, AuthorizationToolContext>,
  options: AuthorizationValidationOptions = {}
): void {
  const requireKnownTools = options.requireKnownTools === true;
  const requireControlArgsMetadata = options.requireControlArgsMetadata === true;
  const deniedTools = new Set<string>([
    ...(normalized.deny ?? []),
    ...(
      options.deniedTools instanceof Set
        ? [...options.deniedTools]
        : Array.isArray(options.deniedTools)
          ? options.deniedTools
          : []
    )
  ]);

  if ((requireKnownTools || requireControlArgsMetadata) && (!toolContext || toolContext.size === 0)) {
    addIssue(errors, {
      code: 'authorizations-missing-tool-context',
      severity: 'error',
      path: 'authorizations',
      message: 'policy.authorizations requires trusted tool context for validation'
    });
    return;
  }

  for (const [toolName, entry] of Object.entries(normalized.allow ?? {})) {
    if (deniedTools.has(toolName)) {
      addIssue(errors, {
        code: 'authorizations-denied-tool',
        severity: 'error',
        tool: toolName,
        path: `authorizations.allow.${toolName}`,
        message: `Tool '${toolName}' is denied by policy.authorizations.deny`
      });
      continue;
    }

    const tool = toolContext?.get(toolName);
    if (!tool) {
      if (requireKnownTools) {
        addIssue(errors, {
          code: 'authorizations-unknown-tool',
          severity: 'error',
          tool: toolName,
          path: `authorizations.allow.${toolName}`,
          message: `Unknown tool '${toolName}' in policy.authorizations`
        });
      }
      continue;
    }

    if (entry.kind === 'constrained') {
      for (const argName of Object.keys(entry.args)) {
        if (!tool.params.has(argName)) {
          addIssue(errors, {
            code: 'authorizations-unknown-arg',
            severity: 'error',
            tool: toolName,
            arg: argName,
            path: `authorizations.allow.${toolName}.args.${argName}`,
            message: `Unknown arg '${argName}' for tool '${toolName}' in policy.authorizations`
          });
        }
      }
    }

    const effectiveControlArgs = getEffectiveControlArgs(tool);

    if (entry.kind === 'tool') {
      continue;
    }

    if (entry.kind === 'unconstrained') {
      if (effectiveControlArgs.size > 0) {
        addIssue(errors, {
          code: 'authorizations-unconstrained-control-args',
          severity: 'error',
          tool: toolName,
          path: `authorizations.allow.${toolName}`,
          message: `Tool '${toolName}' cannot use true in policy.authorizations because it has control args: ${Array.from(effectiveControlArgs).join(', ')}`
        });
      } else {
        addIssue(warnings, {
          code: 'authorizations-unconstrained-tool',
          severity: 'warning',
          tool: toolName,
          path: `authorizations.allow.${toolName}`,
          message: `Tool '${toolName}' is authorized unconstrained because it declares no control args`
        });
      }
      continue;
    }
  }
}

export function validateNormalizedPolicyAuthorizations(
  authorizations: PolicyAuthorizations,
  toolContext?: ReadonlyMap<string, AuthorizationToolContext>,
  options: AuthorizationValidationOptions = {}
): PolicyAuthorizationValidationResult {
  const errors: PolicyAuthorizationIssue[] = [];
  const warnings: PolicyAuthorizationIssue[] = [];
  validateNormalizedPolicyAuthorizationsInto(authorizations, errors, warnings, toolContext, options);
  return {
    normalized: cloneAuthorizations(authorizations),
    errors,
    warnings
  };
}

function clauseMatches(
  actual: unknown,
  clause: AuthorizationConstraintClause
): {
  matched: boolean;
  attestations?: readonly string[];
  factsources?: readonly FactSourceHandle[];
} {
  if ('eq' in clause) {
    return {
      matched: isTolerantMatch(actual, clause.eq),
      attestations: clause.attestations,
      factsources: authorizationConstraintEqFactsources.get(clause)
    };
  }
  for (let index = 0; index < clause.oneOf.length; index += 1) {
    if (!isTolerantMatch(actual, clause.oneOf[index])) {
      continue;
    }
    return {
      matched: true,
      attestations: clause.oneOfAttestations?.[index],
      factsources: authorizationConstraintOneOfFactsources.get(clause)?.[index]
    };
  }
  return { matched: false };
}

export function evaluatePolicyAuthorizationDecision(params: {
  authorizations: PolicyAuthorizations;
  operationName: string;
  args: Readonly<Record<string, unknown>>;
  controlArgs: readonly string[];
}): PolicyAuthorizationDecision {
  const { authorizations, operationName, args, controlArgs } = params;
  if (authorizations.deny?.includes(operationName)) {
    return {
      decision: 'deny',
      matched: true,
      code: 'unlisted',
      reason: 'operation denied by policy.authorizations'
    };
  }

  const entry = authorizations.allow?.[operationName];
  if (!entry) {
    return {
      decision: 'deny',
      matched: true,
      code: 'unlisted',
      reason: 'operation not authorized by policy.authorizations'
    };
  }

  if (entry.kind === 'tool') {
    return { decision: 'allow', matched: true };
  }

  if (entry.kind === 'unconstrained') {
    if (controlArgs.length > 0) {
      return {
        decision: 'deny',
        matched: true,
        code: 'args_mismatch',
        reason: 'operation arguments did not match policy.authorizations'
      };
    }
    return { decision: 'allow', matched: true };
  }

  const matchedAttestations: Record<string, readonly string[]> = Object.create(null);
  const matchedFactsources: Record<string, readonly FactSourceHandle[]> = Object.create(null);

  for (const [argName, clauses] of Object.entries(entry.args)) {
    const actualValue = args[argName];
    const clauseMatchesForArg = clauses.map(clause => clauseMatches(actualValue, clause));
    if (!clauseMatchesForArg.every(result => result.matched)) {
      return {
        decision: 'deny',
        matched: true,
        code: 'args_mismatch',
        reason: 'operation arguments did not match policy.authorizations'
      };
    }
    const argAttestations = Array.from(
      new Set(
        clauseMatchesForArg.flatMap(result =>
          Array.isArray(result.attestations) ? [...result.attestations] : []
        )
      )
    );
    if (argAttestations.length > 0) {
      matchedAttestations[argName] = Object.freeze(argAttestations);
    }
    const argFactsources = clauseMatchesForArg.flatMap(result =>
      Array.isArray(result.factsources) ? [...result.factsources] : []
    );
    if (argFactsources.length > 0) {
      matchedFactsources[argName] = cloneFactSources(argFactsources);
    }
  }

  for (const controlArg of controlArgs) {
    if (Object.prototype.hasOwnProperty.call(entry.args, controlArg)) {
      continue;
    }
    if (!isTolerantMatch(args[controlArg], [])) {
      return {
        decision: 'deny',
        matched: true,
        code: 'args_mismatch',
        reason: 'operation arguments did not match policy.authorizations'
      };
    }
  }

  return {
    decision: 'allow',
    matched: true,
    ...(Object.keys(matchedAttestations).length > 0
      ? { matchedAttestations: Object.freeze({ ...matchedAttestations }) }
      : {}),
    ...(Object.keys(matchedFactsources).length > 0
      ? { matchedFactsources: Object.freeze({ ...matchedFactsources }) }
      : {})
  };
}
