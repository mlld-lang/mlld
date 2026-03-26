import { matchesLabelPattern } from './fact-labels';

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

export function deriveBuiltInFactPatternsForQuery(query: {
  arg?: string;
}): string[] | null {
  const arg = typeof query.arg === 'string' ? query.arg.trim().toLowerCase() : '';
  if (!arg) {
    return null;
  }

  if (['recipient', 'recipients', 'cc', 'bcc'].includes(arg)) {
    return [...SEND_KNOWN_FACT_PATTERNS];
  }

  if (arg === 'id') {
    return [...TARGET_KNOWN_FACT_PATTERNS];
  }

  return [];
}

export function deriveBuiltInFactPatternsForOperationArg(options: {
  arg?: string;
  operationLabels?: readonly string[];
  controlArgs?: readonly string[];
  hasControlArgsMetadata?: boolean;
}): string[] | null {
  const arg = typeof options.arg === 'string' ? options.arg.trim().toLowerCase() : '';
  if (!arg) {
    return null;
  }

  const operationLabels = options.operationLabels ?? [];
  const controlArgs = (options.controlArgs ?? []).map(value => value.trim().toLowerCase());
  const hasSend = operationLabels.some(label => matchesLabelPattern('exfil:send', label));
  if (hasSend) {
    if (options.hasControlArgsMetadata === true) {
      return controlArgs.includes(arg) ? [...SEND_KNOWN_FACT_PATTERNS] : [];
    }
    return [];
  }

  const hasTargetedDestroy = operationLabels.some(label =>
    matchesLabelPattern('destructive:targeted', label)
  );
  if (hasTargetedDestroy) {
    if (options.hasControlArgsMetadata === true && controlArgs.length > 0) {
      return controlArgs.includes(arg) ? [...TARGET_KNOWN_FACT_PATTERNS] : [];
    }
    return arg === 'id' ? [...TARGET_KNOWN_FACT_PATTERNS] : [];
  }

  return deriveBuiltInFactPatternsForQuery({ arg });
}
