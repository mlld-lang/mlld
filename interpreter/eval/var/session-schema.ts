import { MlldInterpreterError } from '@core/errors';
import type { SourceLocation } from '@core/types';
import type { SessionDefinition } from '@core/types/session';
import type { Environment } from '@interpreter/env/Environment';
import { buildSessionDefinition } from '@core/validation/session-definition';

export function evaluateSessionSchemaObject(args: {
  env: Environment;
  identifier: string;
  sourceLocation?: SourceLocation;
  valueNode: {
    entries?: Array<{
      type?: string;
      key?: unknown;
      value?: unknown;
      location?: SourceLocation;
    }>;
  };
}): SessionDefinition {
  const { env, identifier, sourceLocation, valueNode } = args;
  const result = buildSessionDefinition({
    identifier,
    sourceLocation,
    valueNode,
    resolveRecord: name => env.getRecordDefinition(name)
  });

  if (!result.definition) {
    const firstIssue = result.issues[0];
    throw new MlldInterpreterError(
      firstIssue?.message ?? 'Invalid session schema.',
      'var',
      firstIssue?.location ?? sourceLocation,
      { code: firstIssue?.code ?? 'INVALID_SESSION_DECLARATION' }
    );
  }

  return result.definition;
}
