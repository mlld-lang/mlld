import { isTolerantMatch } from '@interpreter/eval/expressions';

export type AuthorizationConstraintClause =
  | { eq: unknown }
  | { oneOf: unknown[] };

export type AuthorizationEntry =
  | { kind: 'unconstrained' }
  | {
      kind: 'constrained';
      args: Record<string, AuthorizationConstraintClause[]>;
    };

export type PolicyAuthorizations = {
  allow: Record<string, AuthorizationEntry>;
};

export interface AuthorizationToolContext {
  name: string;
  params: Set<string>;
  controlArgs: Set<string>;
  hasControlArgsMetadata: boolean;
}

export interface PolicyAuthorizationIssue {
  code:
    | 'authorizations-invalid'
    | 'authorizations-unknown-field'
    | 'authorizations-unknown-tool'
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
}

export type PolicyAuthorizationDecision =
  | { decision: 'allow'; matched: true }
  | {
      decision: 'deny';
      matched: true;
      code: 'unlisted' | 'args_mismatch';
      reason: string;
    };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cloneConstraintClause(clause: AuthorizationConstraintClause): AuthorizationConstraintClause {
  if ('eq' in clause) {
    return { eq: clause.eq };
  }
  return { oneOf: clause.oneOf.slice() };
}

function cloneAuthorizationEntry(entry: AuthorizationEntry): AuthorizationEntry {
  if (entry.kind === 'unconstrained') {
    return { kind: 'unconstrained' };
  }

  const args: Record<string, AuthorizationConstraintClause[]> = {};
  for (const [argName, clauses] of Object.entries(entry.args)) {
    args[argName] = clauses.map(cloneConstraintClause);
  }
  return { kind: 'constrained', args };
}

function cloneAuthorizations(authorizations?: PolicyAuthorizations): PolicyAuthorizations | undefined {
  if (!authorizations) {
    return undefined;
  }

  const allow: Record<string, AuthorizationEntry> = {};
  for (const [toolName, entry] of Object.entries(authorizations.allow)) {
    allow[toolName] = cloneAuthorizationEntry(entry);
  }
  return { allow };
}

function addIssue(
  collection: PolicyAuthorizationIssue[],
  issue: PolicyAuthorizationIssue
): void {
  collection.push(issue);
}

function isNormalizedConstraintClause(value: unknown): value is AuthorizationConstraintClause {
  if (!isPlainObject(value)) {
    return false;
  }

  const keys = Object.keys(value);
  if (keys.length !== 1) {
    return false;
  }

  if (keys[0] === 'eq') {
    return true;
  }

  return keys[0] === 'oneOf' && Array.isArray(value.oneOf);
}

function isNormalizedAuthorizationEntry(value: unknown): value is AuthorizationEntry {
  if (!isPlainObject(value) || typeof value.kind !== 'string') {
    return false;
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
    const unsupportedKeys = keys.filter(key => key !== 'eq' && key !== 'oneOf');
    if (unsupportedKeys.length > 0) {
      addIssue(errors, {
        code: 'authorizations-unsupported-constraint',
        severity: 'error',
        tool: toolName,
        arg: argName,
        path: `authorizations.allow.${toolName}.args.${argName}`,
        message: `Unsupported constraint fields for '${toolName}.${argName}': ${unsupportedKeys.join(', ')}`
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
      return { eq: raw.eq };
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

    return { oneOf: raw.oneOf.slice() };
  }

  return { eq: raw };
}

function normalizeEntry(
  toolName: string,
  raw: unknown,
  errors: PolicyAuthorizationIssue[],
  warnings: PolicyAuthorizationIssue[]
): AuthorizationEntry | undefined {
  if (isNormalizedAuthorizationEntry(raw)) {
    return cloneAuthorizationEntry(raw);
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

  const argKeys = Object.keys(rawArgs);
  if (argKeys.length === 0) {
    addIssue(warnings, {
      code: 'authorizations-empty-entry',
      severity: 'warning',
      tool: toolName,
      path: `authorizations.allow.${toolName}.args`,
      message: `Authorization entry '{ args: {} }' for '${toolName}' normalizes to true`
    });
    return { kind: 'unconstrained' };
  }

  const args: Record<string, AuthorizationConstraintClause[]> = {};
  for (const [argName, rawConstraint] of Object.entries(rawArgs)) {
    const clause = normalizeConstraint(toolName, argName, rawConstraint, errors);
    if (!clause) {
      continue;
    }
    args[argName] = [clause];
  }

  return { kind: 'constrained', args };
}

export function normalizePolicyAuthorizations(
  raw: unknown,
  issues?: {
    errors?: PolicyAuthorizationIssue[];
    warnings?: PolicyAuthorizationIssue[];
  }
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
  const unsupportedKeys = keys.filter(key => key !== 'allow');
  if (unsupportedKeys.length > 0) {
    addIssue(errors, {
      code: 'authorizations-unknown-field',
      severity: 'error',
      path: 'authorizations',
      message: `Unsupported policy.authorizations fields: ${unsupportedKeys.join(', ')}`
    });
  }

  const rawAllow = raw.allow;
  if (!isPlainObject(rawAllow)) {
    addIssue(errors, {
      code: 'authorizations-invalid',
      severity: 'error',
      path: 'authorizations.allow',
      message: 'policy.authorizations.allow must be an object'
    });
    return undefined;
  }

  const allow: Record<string, AuthorizationEntry> = {};
  for (const [toolName, rawEntry] of Object.entries(rawAllow)) {
    const normalizedEntry = normalizeEntry(toolName, rawEntry, errors, warnings);
    if (normalizedEntry) {
      allow[toolName] = normalizedEntry;
    }
  }

  return { allow };
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

  const allow: Record<string, AuthorizationEntry> = {};
  const sharedTools = Object.keys(base.allow).filter(toolName => Object.prototype.hasOwnProperty.call(incoming.allow, toolName));

  for (const toolName of sharedTools) {
    const left = base.allow[toolName];
    const right = incoming.allow[toolName];

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

  return { allow };
}

export function hasToolWriteAuthorizationPolicy(authorizations?: PolicyAuthorizations): boolean {
  return Boolean(authorizations && Object.keys(authorizations.allow).length > 0);
}

export function validatePolicyAuthorizations(
  raw: unknown,
  toolContext?: ReadonlyMap<string, AuthorizationToolContext>,
  options: AuthorizationValidationOptions = {}
): PolicyAuthorizationValidationResult {
  const errors: PolicyAuthorizationIssue[] = [];
  const warnings: PolicyAuthorizationIssue[] = [];
  const normalized = normalizePolicyAuthorizations(raw, { errors, warnings });

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

  if ((requireKnownTools || requireControlArgsMetadata) && (!toolContext || toolContext.size === 0)) {
    addIssue(errors, {
      code: 'authorizations-missing-tool-context',
      severity: 'error',
      path: 'authorizations',
      message: 'policy.authorizations requires trusted tool context for validation'
    });
    return;
  }

  for (const [toolName, entry] of Object.entries(normalized.allow)) {
    const tool = toolContext?.get(toolName);
    if (!tool) {
      if (requireKnownTools || toolContext?.size) {
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

    if (requireControlArgsMetadata && !tool.hasControlArgsMetadata) {
      addIssue(errors, {
        code: 'authorizations-missing-tool-context',
        severity: 'error',
        tool: toolName,
        path: `authorizations.allow.${toolName}`,
        message: `Tool '${toolName}' is missing trusted controlArgs metadata for policy.authorizations`
      });
      continue;
    }

    if (!tool.hasControlArgsMetadata) {
      continue;
    }

    if (entry.kind === 'unconstrained') {
      if (tool.controlArgs.size > 0) {
        addIssue(errors, {
          code: 'authorizations-unconstrained-control-args',
          severity: 'error',
          tool: toolName,
          path: `authorizations.allow.${toolName}`,
          message: `Tool '${toolName}' cannot use true in policy.authorizations because it has control args: ${Array.from(tool.controlArgs).join(', ')}`
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

    for (const controlArg of tool.controlArgs) {
      if (!Object.prototype.hasOwnProperty.call(entry.args, controlArg)) {
        addIssue(errors, {
          code: 'authorizations-missing-control-arg',
          severity: 'error',
          tool: toolName,
          arg: controlArg,
          path: `authorizations.allow.${toolName}.args`,
          message: `Tool '${toolName}' must constrain control arg '${controlArg}' in policy.authorizations`
        });
      }
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

function clauseMatches(actual: unknown, clause: AuthorizationConstraintClause): boolean {
  if ('eq' in clause) {
    return isTolerantMatch(actual, clause.eq);
  }
  return clause.oneOf.some(candidate => isTolerantMatch(actual, candidate));
}

export function evaluatePolicyAuthorizationDecision(params: {
  authorizations: PolicyAuthorizations;
  operationName: string;
  args: Readonly<Record<string, unknown>>;
  controlArgs: readonly string[];
}): PolicyAuthorizationDecision {
  const { authorizations, operationName, args, controlArgs } = params;
  const entry = authorizations.allow[operationName];
  if (!entry) {
    return {
      decision: 'deny',
      matched: true,
      code: 'unlisted',
      reason: 'operation not authorized by policy.authorizations'
    };
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

  for (const [argName, clauses] of Object.entries(entry.args)) {
    const actualValue = args[argName];
    if (!clauses.every(clause => clauseMatches(actualValue, clause))) {
      return {
        decision: 'deny',
        matched: true,
        code: 'args_mismatch',
        reason: 'operation arguments did not match policy.authorizations'
      };
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

  return { decision: 'allow', matched: true };
}
