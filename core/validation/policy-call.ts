import type { AuthorizationToolContext } from '@core/policy/authorizations';

export type StaticPolicyCallIssueReason =
  | 'invalid_authorization'
  | 'proofless_resolved_value'
  | 'known_not_in_task'
  | 'no_update_fields'
  | 'payload_not_in_task'
  | 'known_contains_handle';

export interface StaticPolicyCallIssue {
  reason: StaticPolicyCallIssueReason;
  message: string;
  tool?: string;
  arg?: string;
  element?: number;
}

export interface StaticPolicyCallAnalysisResult {
  rawAuthorizations?: unknown;
  issues: StaticPolicyCallIssue[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOwnProperty(value: unknown, key: string): boolean {
  return isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function pushIssue(issues: StaticPolicyCallIssue[], issue: StaticPolicyCallIssue): void {
  issues.push(issue);
}

function hasBucketedAuthorizationIntent(raw: unknown): boolean {
  if (!isPlainObject(raw)) {
    return false;
  }

  return (
    hasOwnProperty(raw, 'resolved')
    || hasOwnProperty(raw, 'known')
    || Array.isArray(raw.allow)
  );
}

function cloneRawAuthorizationEntry(entry: unknown): unknown {
  if (entry === true || !isPlainObject(entry)) {
    return entry;
  }

  if (isPlainObject(entry.args)) {
    return {
      ...entry,
      args: { ...entry.args }
    };
  }

  if (hasOwnProperty(entry, 'args') || hasOwnProperty(entry, 'kind')) {
    return { ...entry };
  }

  return {
    args: { ...entry }
  };
}

function cloneRawAllowEntries(value: unknown): unknown {
  if (!isPlainObject(value)) {
    return value;
  }

  const next: Record<string, unknown> = {};
  for (const [toolName, rawEntry] of Object.entries(value)) {
    if (rawEntry === true || !isPlainObject(rawEntry)) {
      next[toolName] = rawEntry;
      continue;
    }

    const entryKeys = Object.keys(rawEntry);
    const looksLikeNestedEntry =
      entryKeys.includes('args') || entryKeys.includes('kind');
    if (!looksLikeNestedEntry) {
      next[toolName] = {
        args: { ...rawEntry }
      };
      continue;
    }

    if (!isPlainObject(rawEntry.args)) {
      next[toolName] = { ...rawEntry };
      continue;
    }

    next[toolName] = {
      ...rawEntry,
      args: { ...rawEntry.args }
    };
  }
  return next;
}

function getOrCreateRawAuthorizationArgs(
  allow: Record<string, unknown>,
  toolName: string
): Record<string, unknown> {
  const existing = allow[toolName];
  if (!isPlainObject(existing)) {
    allow[toolName] = { args: {} };
    return (allow[toolName] as { args: Record<string, unknown> }).args;
  }

  if (!isPlainObject(existing.args)) {
    existing.args = {};
  }

  return existing.args as Record<string, unknown>;
}

function mergeRawAuthorizationEntry(
  existing: unknown,
  incoming: unknown
): unknown {
  if (existing === undefined) {
    return cloneRawAuthorizationEntry(incoming);
  }
  if (incoming === true) {
    return existing;
  }
  if (existing === true) {
    return cloneRawAuthorizationEntry(incoming);
  }
  if (!isPlainObject(existing) || !isPlainObject(incoming)) {
    return cloneRawAuthorizationEntry(incoming);
  }

  const existingArgs = isPlainObject(existing.args) ? existing.args as Record<string, unknown> : {};
  const incomingArgs = isPlainObject(incoming.args) ? incoming.args as Record<string, unknown> : {};
  return {
    ...existing,
    ...incoming,
    args: {
      ...existingArgs,
      ...incomingArgs
    }
  };
}

function extractKnownBucketValue(
  raw: unknown
): { value?: unknown; hasValue: boolean } {
  if (!isPlainObject(raw)) {
    return { value: raw, hasValue: true };
  }

  if (hasOwnProperty(raw, 'value') || hasOwnProperty(raw, 'source')) {
    return {
      value: raw.value,
      hasValue: hasOwnProperty(raw, 'value')
    };
  }

  return { value: raw, hasValue: true };
}

function getKnownTaskValidationArgs(
  tool: AuthorizationToolContext | undefined
): Set<string> | undefined {
  if (!tool) {
    return undefined;
  }
  return tool.hasControlArgsMetadata ? tool.controlArgs : tool.params;
}

function buildKnownNotInTaskMessage(literal: string): string {
  return `Known literal '${literal}' not found in task text`;
}

function buildPayloadNotInTaskMessage(argName: string, literal: string): string {
  return `Payload literal '${literal}' for '${argName}' not found in task text`;
}

const HANDLE_TOKEN_RE = /^h_[a-z0-9]+$/;

function extractHandleTokenCandidate(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const handle = value.trim();
    return HANDLE_TOKEN_RE.test(handle) ? handle : undefined;
  }

  if (isPlainObject(value) && typeof value.handle === 'string') {
    const handle = value.handle.trim();
    return HANDLE_TOKEN_RE.test(handle) ? handle : undefined;
  }

  return undefined;
}

function validateLiteralValueAgainstTask(options: {
  toolName: string;
  argName: string;
  value: unknown;
  normalizedTaskText: string;
  issues: StaticPolicyCallIssue[];
  reason: 'known_not_in_task' | 'payload_not_in_task';
  buildMessage: (literal: string) => string;
  rejectHandleWrappers: boolean;
}): boolean {
  const visit = (candidate: unknown): boolean => {
    if (candidate === null || candidate === undefined) {
      return true;
    }

    if (Array.isArray(candidate)) {
      let valid = true;
      for (const entry of candidate) {
        valid = visit(entry) && valid;
      }
      return valid;
    }

    if (isPlainObject(candidate)) {
      let valid = true;
      if (hasOwnProperty(candidate, 'eq')) {
        return visit((candidate as Record<string, unknown>).eq) && valid;
      }
      if (hasOwnProperty(candidate, 'oneOf')) {
        return visit((candidate as Record<string, unknown>).oneOf) && valid;
      }

      if (
        hasOwnProperty(candidate, 'handle')
        && options.rejectHandleWrappers
        && extractHandleTokenCandidate((candidate as Record<string, unknown>).handle) !== undefined
      ) {
        pushIssue(options.issues, {
          reason: 'known_contains_handle',
          message: 'Handle wrappers belong in resolved, not known',
          tool: options.toolName,
          arg: options.argName
        });
        valid = false;
      }

      if (hasOwnProperty(candidate, 'value') || hasOwnProperty(candidate, 'source')) {
        if (hasOwnProperty(candidate, 'value')) {
          valid = visit((candidate as Record<string, unknown>).value) && valid;
        }
        return valid;
      }

      for (const nested of Object.values(candidate)) {
        valid = visit(nested) && valid;
      }
      return valid;
    }

    if (typeof candidate !== 'string' && typeof candidate !== 'number') {
      return true;
    }

    const literal = String(candidate).trim();
    if (literal.length === 0) {
      return true;
    }
    if (options.normalizedTaskText.includes(literal.toLowerCase())) {
      return true;
    }

    pushIssue(options.issues, {
      reason: options.reason,
      message: options.buildMessage(literal),
      tool: options.toolName,
      arg: options.argName
    });
    return false;
  };

  return visit(options.value);
}

function validateKnownValueAgainstTask(options: {
  toolName: string;
  argName: string;
  value: unknown;
  normalizedTaskText: string;
  issues: StaticPolicyCallIssue[];
}): boolean {
  return validateLiteralValueAgainstTask({
    ...options,
    reason: 'known_not_in_task',
    buildMessage: buildKnownNotInTaskMessage,
    rejectHandleWrappers: true
  });
}

function validateExactPayloadValueAgainstTask(options: {
  toolName: string;
  argName: string;
  value: unknown;
  normalizedTaskText: string;
  issues: StaticPolicyCallIssue[];
}): boolean {
  return validateLiteralValueAgainstTask({
    ...options,
    reason: 'payload_not_in_task',
    buildMessage: literal => buildPayloadNotInTaskMessage(options.argName, literal),
    rejectHandleWrappers: false
  });
}

function extractRawAuthorizationArgs(entry: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(entry)) {
    return undefined;
  }

  if (isPlainObject(entry.args)) {
    return entry.args as Record<string, unknown>;
  }

  if (!hasOwnProperty(entry, 'args') && !hasOwnProperty(entry, 'kind')) {
    return entry as Record<string, unknown>;
  }

  return undefined;
}

function hasNonNullAuthorizationValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (Array.isArray(value)) {
    return true;
  }

  if (isPlainObject(value)) {
    if (hasOwnProperty(value, 'eq')) {
      return hasNonNullAuthorizationValue((value as Record<string, unknown>).eq);
    }
    if (hasOwnProperty(value, 'oneOf')) {
      const candidates = (value as Record<string, unknown>).oneOf;
      return Array.isArray(candidates)
        ? candidates.some(candidate => hasNonNullAuthorizationValue(candidate))
        : candidates !== null && candidates !== undefined;
    }
    if (hasOwnProperty(value, 'value') || hasOwnProperty(value, 'source')) {
      return hasOwnProperty(value, 'value')
        ? hasNonNullAuthorizationValue((value as Record<string, unknown>).value)
        : false;
    }
    return true;
  }

  return true;
}

function buildNoUpdateFieldsMessage(toolName: string, updateArgs: readonly string[]): string {
  const fieldList = updateArgs.join(', ');
  return fieldList.length > 0
    ? `Tool '${toolName}' update authorization must specify at least one update field: ${fieldList}`
    : `Tool '${toolName}' update authorization must specify at least one update field`;
}

function normalizeStaticResolvedValue(options: {
  toolName: string;
  argName: string;
  value: unknown;
  issues: StaticPolicyCallIssue[];
}): unknown | undefined {
  if (options.value === null) {
    return null;
  }

  if (Array.isArray(options.value)) {
    if (options.value.length === 0) {
      return [];
    }

    const retained: unknown[] = [];
    for (let index = 0; index < options.value.length; index += 1) {
      const entry = options.value[index];
      if (extractHandleTokenCandidate(entry) !== undefined) {
        retained.push(entry);
        continue;
      }

      pushIssue(options.issues, {
        reason: 'proofless_resolved_value',
        message: `Tool '${options.toolName}' resolved authorization for '${options.argName}[${index}]' must use a handle-backed value`,
        tool: options.toolName,
        arg: options.argName,
        element: index
      });
    }

    return retained.length > 0 ? retained : undefined;
  }

  if (extractHandleTokenCandidate(options.value) !== undefined) {
    return options.value;
  }

  pushIssue(options.issues, {
    reason: 'proofless_resolved_value',
    message: `Tool '${options.toolName}' resolved authorization for '${options.argName}' must use a handle-backed value`,
    tool: options.toolName,
    arg: options.argName
  });
  return undefined;
}

function normalizeBucketedAuthorizationIntent(options: {
  rawIntent: unknown;
  toolContext?: ReadonlyMap<string, AuthorizationToolContext>;
  taskText?: string;
  issues: StaticPolicyCallIssue[];
}): unknown {
  if (!isPlainObject(options.rawIntent)) {
    return options.rawIntent;
  }

  const container = options.rawIntent;
  const nextAllow: Record<string, unknown> = {};
  const normalizedTaskText =
    typeof options.taskText === 'string' && options.taskText.trim().length > 0
      ? options.taskText.trim().toLowerCase()
      : undefined;

  if (isPlainObject(container.allow)) {
    const explicitAllow = cloneRawAllowEntries(container.allow);
    if (isPlainObject(explicitAllow)) {
      for (const [toolName, entry] of Object.entries(explicitAllow)) {
        nextAllow[toolName] = cloneRawAuthorizationEntry(entry);
      }
    }
  }

  if (hasOwnProperty(container, 'resolved')) {
    if (!isPlainObject(container.resolved)) {
      pushIssue(options.issues, {
        reason: 'invalid_authorization',
        message: 'policy authorization intent bucket \'resolved\' must be an object'
      });
    } else {
      const resolvedAllow = cloneRawAllowEntries(container.resolved);
      if (isPlainObject(resolvedAllow)) {
        for (const [toolName, entry] of Object.entries(resolvedAllow)) {
          if (!isPlainObject(entry)) {
            nextAllow[toolName] = cloneRawAuthorizationEntry(entry);
            continue;
          }

          const tool = options.toolContext?.get(toolName);
          const rawArgs = extractRawAuthorizationArgs(entry);
          if (!rawArgs) {
            nextAllow[toolName] = cloneRawAuthorizationEntry(entry);
            continue;
          }

          const nextArgs: Record<string, unknown> = {};
          let sawResolvedControlArg = false;
          let retainedControlArg = false;

          for (const [argName, rawArgValue] of Object.entries(rawArgs)) {
            const shouldValidate =
              tool?.hasControlArgsMetadata === true && tool.controlArgs.has(argName);
            if (!shouldValidate) {
              nextArgs[argName] = rawArgValue;
              continue;
            }

            sawResolvedControlArg = true;
            const normalizedValue = normalizeStaticResolvedValue({
              toolName,
              argName,
              value: rawArgValue,
              issues: options.issues
            });
            if (normalizedValue === undefined) {
              continue;
            }

            nextArgs[argName] = normalizedValue;
            retainedControlArg = true;
          }

          if (sawResolvedControlArg && !retainedControlArg) {
            continue;
          }

          nextAllow[toolName] = mergeRawAuthorizationEntry(
            nextAllow[toolName],
            {
              ...entry,
              args: nextArgs
            }
          );
        }
      }
    }
  }

  if (Array.isArray(container.allow)) {
    for (const entry of container.allow) {
      if (typeof entry !== 'string' || entry.trim().length === 0) {
        pushIssue(options.issues, {
          reason: 'invalid_authorization',
          message: 'policy authorization intent bucket \'allow\' must be an array of tool names'
        });
        continue;
      }
      const toolName = entry.trim();
      if (!hasOwnProperty(nextAllow, toolName)) {
        nextAllow[toolName] = true;
      }
    }
  } else if (container.allow !== undefined && !isPlainObject(container.allow)) {
    pushIssue(options.issues, {
      reason: 'invalid_authorization',
      message: 'policy authorization intent bucket \'allow\' must be an object or array of tool names'
    });
  }

  if (hasOwnProperty(container, 'known')) {
    if (!isPlainObject(container.known)) {
      pushIssue(options.issues, {
        reason: 'invalid_authorization',
        message: 'policy authorization intent bucket \'known\' must be an object'
      });
    } else {
      for (const [toolName, rawToolEntry] of Object.entries(container.known)) {
        if (!isPlainObject(rawToolEntry)) {
          pushIssue(options.issues, {
            reason: 'invalid_authorization',
            message: `Known authorization entry for '${toolName}' must be an object`,
            tool: toolName
          });
          continue;
        }

        const knownTaskValidationArgs = getKnownTaskValidationArgs(
          options.toolContext?.get(toolName)
        );
        for (const [argName, rawArgEntry] of Object.entries(rawToolEntry)) {
          const { value, hasValue } = extractKnownBucketValue(rawArgEntry);
          if (!hasValue) {
            pushIssue(options.issues, {
              reason: 'invalid_authorization',
              message: `Known authorization entry for '${toolName}.${argName}' must include 'value'`,
              tool: toolName,
              arg: argName
            });
            continue;
          }

          if (
            normalizedTaskText
            && knownTaskValidationArgs?.has(argName)
            && !validateKnownValueAgainstTask({
              toolName,
              argName,
              value,
              normalizedTaskText,
              issues: options.issues
            })
          ) {
            continue;
          }

          const args = getOrCreateRawAuthorizationArgs(nextAllow, toolName);
          if (!hasOwnProperty(args, argName)) {
            args[argName] = value;
          }
        }
      }
    }
  }

  const next: Record<string, unknown> = {
    allow: nextAllow
  };
  if (hasOwnProperty(container, 'deny')) {
    next.deny = Array.isArray(container.deny) ? container.deny.slice() : container.deny;
  }

  return next;
}

function normalizeStaticAuthorizationIntent(options: {
  rawIntent: unknown;
  toolContext?: ReadonlyMap<string, AuthorizationToolContext>;
  taskText?: string;
  issues: StaticPolicyCallIssue[];
}): unknown {
  if (hasBucketedAuthorizationIntent(options.rawIntent)) {
    return normalizeBucketedAuthorizationIntent(options);
  }

  const raw = options.rawIntent;
  if (!isPlainObject(raw)) {
    return raw;
  }

  if (hasOwnProperty(raw, 'allow') || hasOwnProperty(raw, 'deny')) {
    const next: Record<string, unknown> = {};
    if (hasOwnProperty(raw, 'allow')) {
      next.allow = cloneRawAllowEntries(raw.allow);
    }
    if (hasOwnProperty(raw, 'deny')) {
      next.deny = Array.isArray(raw.deny) ? raw.deny.slice() : raw.deny;
    }
    return next;
  }

  return {
    allow: cloneRawAllowEntries(raw)
  };
}

export function validateStaticRawAuthorizationMetadata(options: {
  rawAuthorizations: unknown;
  toolContext?: ReadonlyMap<string, AuthorizationToolContext>;
  taskText?: string;
  issues: StaticPolicyCallIssue[];
}): void {
  const allow = isPlainObject(options.rawAuthorizations) && isPlainObject(options.rawAuthorizations.allow)
    ? options.rawAuthorizations.allow
    : undefined;
  if (!allow) {
    return;
  }

  const normalizedTaskText =
    typeof options.taskText === 'string' && options.taskText.trim().length > 0
      ? options.taskText.trim().toLowerCase()
      : undefined;

  for (const [toolName, entry] of Object.entries(allow)) {
    const tool = options.toolContext?.get(toolName);
    if (!tool) {
      continue;
    }

    const rawArgs = extractRawAuthorizationArgs(entry);
    if (tool.hasUpdateArgsMetadata) {
      const updateArgs = [...tool.updateArgs];
      const hasUpdateValue =
        rawArgs !== undefined
          && updateArgs.some(argName =>
            hasOwnProperty(rawArgs, argName) && hasNonNullAuthorizationValue(rawArgs[argName])
          );
      if (!hasUpdateValue) {
        pushIssue(options.issues, {
          reason: 'no_update_fields',
          message: buildNoUpdateFieldsMessage(toolName, updateArgs),
          tool: toolName
        });
      }
    }

    if (!normalizedTaskText || !rawArgs || !(tool.exactPayloadArgs && tool.exactPayloadArgs.size > 0)) {
      continue;
    }

    for (const argName of tool.exactPayloadArgs) {
      if (!hasOwnProperty(rawArgs, argName)) {
        continue;
      }

      validateExactPayloadValueAgainstTask({
        toolName,
        argName,
        value: rawArgs[argName],
        normalizedTaskText,
        issues: options.issues
      });
    }
  }
}

export function analyzeStaticPolicyAuthorizationIntent(options: {
  rawIntent: unknown;
  toolContext?: ReadonlyMap<string, AuthorizationToolContext>;
  taskText?: string;
}): StaticPolicyCallAnalysisResult {
  const issues: StaticPolicyCallIssue[] = [];
  const rawAuthorizations = normalizeStaticAuthorizationIntent({
    rawIntent: options.rawIntent,
    toolContext: options.toolContext,
    taskText: options.taskText,
    issues
  });

  if (rawAuthorizations !== undefined && rawAuthorizations !== null) {
    validateStaticRawAuthorizationMetadata({
      rawAuthorizations,
      toolContext: options.toolContext,
      taskText: options.taskText,
      issues
    });
  }

  return {
    rawAuthorizations,
    issues
  };
}
