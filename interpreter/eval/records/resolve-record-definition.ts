import type { Environment } from '@interpreter/env/Environment';
import { MlldInterpreterError } from '@core/errors';
import {
  canUseRecordForOutput,
  isSerializedRecordDefinition,
  isSerializedRecordVariable,
  type RecordDefinition
} from '@core/types/record';
import { isRecordVariable, type Variable } from '@core/types/variable';

type EmbeddedRecordContainer = {
  name?: string;
  internal?: Record<string, unknown>;
};

export function readEmbeddedRecordDefinition(
  variable: EmbeddedRecordContainer | undefined,
  recordName: string
): RecordDefinition | undefined {
  const container = variable?.internal?.recordDefinitions;
  if (!container || typeof container !== 'object' || Array.isArray(container)) {
    return undefined;
  }
  const embedded = (container as Record<string, unknown>)[recordName];
  if (!embedded || typeof embedded !== 'object' || Array.isArray(embedded)) {
    return undefined;
  }
  return embedded as RecordDefinition;
}

export async function resolveConfiguredOutputRecordDefinition(options: {
  outputRecord: string | { kind?: string; ref?: unknown };
  variable: EmbeddedRecordContainer | undefined;
  commandName: string;
  runtimeEnv: Environment;
  execEnv: Environment;
  nodeSourceLocation: unknown;
}): Promise<RecordDefinition> {
  const { outputRecord, variable, commandName, runtimeEnv, execEnv, nodeSourceLocation } = options;

  if (typeof outputRecord === 'string') {
    const recordDefinition =
      runtimeEnv.getRecordDefinition(outputRecord) ??
      readEmbeddedRecordDefinition(variable, outputRecord);
    if (recordDefinition) {
      if (!canUseRecordForOutput(recordDefinition)) {
        throw new MlldInterpreterError(
          `Executable '@${variable?.name ?? commandName}' cannot use input-only record '@${outputRecord}' as output`,
          'exec',
          nodeSourceLocation as any,
          { code: 'INPUT_RECORD_COERCION_ATTEMPT' }
        );
      }
      return recordDefinition;
    }

    throw new MlldInterpreterError(
      `Executable '@${variable?.name ?? commandName}' references unknown record '@${outputRecord}'`,
      'exec',
      nodeSourceLocation as any,
      { code: 'RECORD_NOT_FOUND' }
    );
  }

  return resolveDynamicRecordDefinition({
    ref: outputRecord?.ref,
    execEnv,
    nodeSourceLocation,
    missingReferenceMessage: displayRef => `Dynamic output record reference '${displayRef}' is not defined`,
    invalidReferenceMessage: displayRef => `Dynamic output record reference '${displayRef}' did not resolve to a record`
  });
}

export async function resolveDynamicRecordDefinition(options: {
  ref: unknown;
  execEnv: Environment;
  nodeSourceLocation: unknown;
  missingReferenceMessage: (displayRef: string) => string;
  invalidReferenceMessage: (displayRef: string) => string;
}): Promise<RecordDefinition> {
  const { ref, execEnv, nodeSourceLocation, missingReferenceMessage, invalidReferenceMessage } = options;
  const displayRef = formatDynamicRecordReference(ref);

  try {
    const { evaluateDataValue } = await import('@interpreter/eval/data-value-evaluator');
    const resolved = await evaluateDataValue(ref as any, execEnv);
    const recordDefinition = normalizeResolvedRecordDefinition(resolved);
    if (recordDefinition) {
      if (!canUseRecordForOutput(recordDefinition)) {
        throw new MlldInterpreterError(
          invalidReferenceMessage(displayRef),
          'record',
          nodeSourceLocation as any,
          { code: 'INPUT_RECORD_COERCION_ATTEMPT' }
        );
      }
      return recordDefinition;
    }
  } catch (error) {
    if (error instanceof MlldInterpreterError) {
      throw error;
    }
    if (error instanceof Error && /Variable not found:/i.test(error.message)) {
      throw new MlldInterpreterError(
        missingReferenceMessage(displayRef),
        'record',
        nodeSourceLocation as any,
        { code: 'RECORD_NOT_FOUND' }
      );
    }
    throw error;
  }

  throw new MlldInterpreterError(
    invalidReferenceMessage(displayRef),
    'record',
    nodeSourceLocation as any,
    { code: 'INVALID_RECORD_REFERENCE' }
  );
}

export function normalizeResolvedRecordDefinition(value: unknown): RecordDefinition | undefined {
  if (!value) {
    return undefined;
  }

  if (isRecordVariable(value as Variable)) {
    return (value as Variable & { type: 'record'; value: RecordDefinition }).value;
  }

  if (isSerializedRecordVariable(value)) {
    return value.definition;
  }

  if (isSerializedRecordDefinition(value)) {
    return value.definition;
  }

  if (isVariableLikeRecordWrapper(value)) {
    return normalizeResolvedRecordDefinition((value as { value: unknown }).value);
  }

  if (looksLikeRecordDefinition(value)) {
    return value as RecordDefinition;
  }

  return undefined;
}

function isVariableLikeRecordWrapper(value: unknown): value is { type: string; value: unknown } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as { type?: unknown }).type === 'string' &&
    'value' in (value as Record<string, unknown>)
  );
}

function looksLikeRecordDefinition(value: unknown): value is RecordDefinition {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as RecordDefinition).name === 'string' &&
    Array.isArray((value as RecordDefinition).fields) &&
    typeof (value as RecordDefinition).rootMode === 'string' &&
    typeof (value as RecordDefinition).validate === 'string'
  );
}

export function formatDynamicRecordReference(ref: unknown): string {
  if (!ref || typeof ref !== 'object') {
    return '@<unknown>';
  }

  if ((ref as { type?: string }).type === 'VariableReference') {
    const variableRef = ref as { identifier?: string; fields?: any[] };
    if (!variableRef.identifier) {
      return '@<unknown>';
    }

    const suffix = (variableRef.fields ?? [])
      .map(field => {
        if (field?.type === 'field' && typeof field.value === 'string') {
          return `.${field.value}`;
        }
        if (field?.type === 'numericField' && typeof field.value === 'number') {
          return `.${field.value}`;
        }
        if (field?.type === 'arrayIndex' && typeof field.value === 'number') {
          return `[${field.value}]`;
        }
        if (field?.type === 'bracketAccess') {
          return `[${JSON.stringify(field.value)}]`;
        }
        if (field?.type === 'variableIndex') {
          return `[@${field.value}]`;
        }
        return '';
      })
      .join('');

    return `@${variableRef.identifier}${suffix}`;
  }

  if ((ref as { type?: string }).type === 'TernaryExpression') {
    return '(...)';
  }

  return '@<dynamic-record>';
}
