import type { SourceLocation } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import { MlldError, ErrorSeverity, type BaseErrorDetails } from './MlldError';

export type DenialCode =
  | 'POLICY_CAPABILITY_DENIED'
  | 'POLICY_LABEL_FLOW_DENIED'
  | 'GUARD_DENIED'
  | 'PRIVILEGED_GUARD_DENIED'
  | 'DEPENDENCY_UNMET'
  | 'PROFILE_UNMET';

export interface DenialContext {
  code: DenialCode;
  operation: {
    type: string;
    description: string;
  };
  blocker: {
    type: 'policy' | 'guard' | 'dependency' | 'profile';
    name: string;
    source?: string;
    rule?: string;
  };
  labels?: {
    input: string[];
    operation: string[];
  };
  reason: string;
  suggestions?: string[];
}

export interface DenialErrorOptions {
  message?: string;
  severity?: ErrorSeverity;
  details?: BaseErrorDetails;
  sourceLocation?: SourceLocation;
  env?: Environment;
}

export function formatDenialMessage(ctx: DenialContext): string {
  const lines: string[] = [];
  const operationType = formatOperationType(ctx.operation.type);
  const description =
    ctx.operation.description && ctx.operation.description !== ctx.operation.type
      ? ` "${ctx.operation.description}"`
      : '';
  const blockerLabel = formatBlockerType(ctx.blocker.type);

  lines.push('Operation denied');
  lines.push('');
  lines.push(`  Operation: ${operationType}${description}`);
  lines.push(`  Blocked by: ${blockerLabel} ${ctx.blocker.name}`);

  if (ctx.blocker.source) {
    lines.push(`  Source: ${ctx.blocker.source}`);
  }
  if (ctx.blocker.rule) {
    lines.push(`  Rule: ${ctx.blocker.rule}`);
  }

  if (ctx.labels) {
    lines.push('');
    lines.push(`  Input labels: ${formatLabelList(ctx.labels.input)}`);
    lines.push(`  Operation labels: ${formatLabelList(ctx.labels.operation)}`);
  }

  lines.push('');
  lines.push(`  Reason: ${ctx.reason}`);

  if (ctx.suggestions && ctx.suggestions.length > 0) {
    lines.push('');
    lines.push('  Suggestions:');
    for (const suggestion of ctx.suggestions) {
      lines.push(`  - ${suggestion}`);
    }
  }

  return lines.join('\n');
}

function formatLabelList(values: string[]): string {
  if (!values || values.length === 0) {
    return '[]';
  }
  return `[${values.join(', ')}]`;
}

function formatOperationType(type: string): string {
  if (!type) {
    return '/operation';
  }
  return type.startsWith('/') ? type : `/${type}`;
}

function formatBlockerType(type: DenialContext['blocker']['type']): string {
  if (type === 'policy') {
    return 'Policy';
  }
  if (type === 'guard') {
    return 'Guard';
  }
  if (type === 'dependency') {
    return 'Dependency';
  }
  if (type === 'profile') {
    return 'Profile';
  }
  return 'Blocker';
}

export class MlldDenialError extends MlldError {
  public readonly context: DenialContext;

  constructor(context: DenialContext, options?: DenialErrorOptions) {
    const message = options?.message ?? formatDenialMessage(context);
    const details: BaseErrorDetails = {
      ...(options?.details ?? {}),
      denial: context
    };

    super(message, {
      code: context.code,
      severity: options?.severity ?? ErrorSeverity.Fatal,
      details,
      sourceLocation: options?.sourceLocation,
      env: options?.env
    });

    this.context = context;
  }
}
