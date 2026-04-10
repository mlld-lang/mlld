import type { Environment } from '@interpreter/env/Environment';
import type { NodeFunctionExecutable } from '@core/types/executable';
import { MlldInterpreterError } from '@core/errors';
import {
  createExecutableVariable,
  type VariableSource
} from '@core/types/variable';
import { coerceRecordOutput } from '@interpreter/eval/records/coerce-record';
import { normalizeResolvedRecordDefinition } from '@interpreter/eval/records/resolve-record-definition';
import { extractSecurityDescriptor } from '@interpreter/utils/structured-value';

const CAST_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'reference',
  hasInterpolation: false,
  isMultiLine: false
};

function looksLikeEnvironment(value: unknown): value is Environment {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as Environment).getScopedEnvironmentConfig === 'function' &&
      typeof (value as Environment).issueHandle === 'function' &&
      typeof (value as Environment).resolveHandle === 'function'
  );
}

function resolveCastRecordDefinition(
  recordArg: unknown,
  env: Environment
) {
  const direct = normalizeResolvedRecordDefinition(recordArg);
  if (direct) {
    return direct;
  }

  if (typeof recordArg === 'string') {
    const recordName = recordArg.trim().replace(/^@/, '');
    if (!recordName) {
      throw new MlldInterpreterError(
        'Builtin @cast expected a record reference as its second argument',
        'record',
        undefined as any,
        { code: 'INVALID_RECORD_REFERENCE' }
      );
    }

    const definition = env.getRecordDefinition(recordName);
    if (definition) {
      return definition;
    }

    throw new MlldInterpreterError(
      `Builtin @cast references unknown record '@${recordName}'`,
      'record',
      undefined as any,
      { code: 'RECORD_NOT_FOUND' }
    );
  }

  throw new MlldInterpreterError(
    'Builtin @cast expected a record reference as its second argument',
    'record',
    undefined as any,
    { code: 'INVALID_RECORD_REFERENCE' }
  );
}

export function createCastExecutable(env: Environment) {
  const definition: NodeFunctionExecutable = {
    type: 'nodeFunction',
    name: 'cast',
    fn: async (valueOrEnv?: unknown, recordOrEnv?: unknown, boundEnv?: Environment) => {
      const executionEnv = boundEnv
        ?? (looksLikeEnvironment(recordOrEnv) ? recordOrEnv : undefined)
        ?? (looksLikeEnvironment(valueOrEnv) ? valueOrEnv : undefined)
        ?? env;
      const value = boundEnv || !looksLikeEnvironment(valueOrEnv) ? valueOrEnv : undefined;
      const recordType = boundEnv || !looksLikeEnvironment(recordOrEnv) ? recordOrEnv : undefined;
      const resolvedRecord = resolveCastRecordDefinition(recordType, executionEnv);
      const inheritedDescriptor = extractSecurityDescriptor(value, {
        recursive: true,
        mergeArrayElements: true
      });

      return coerceRecordOutput({
        definition: resolvedRecord,
        value,
        env: executionEnv,
        inheritedDescriptor
      });
    },
    bindExecutionEnv: true,
    sourceDirective: 'exec',
    paramNames: ['value', 'recordType'],
    description: 'Coerce a value through a record definition'
  };

  return createExecutableVariable('cast', 'command', '', ['value', 'recordType'], undefined, CAST_SOURCE, {
    internal: {
      executableDef: definition,
      isReserved: true,
      isSystem: true
    }
  });
}
