import type {
  Environment,
  FieldAccessNode,
  SourceLocation
} from '@core/types';
import { FieldAccessError } from '@core/errors';
import type { SecurityDescriptor } from '@core/types/security';
import { accessFields } from '@interpreter/utils/field-access';
import { inheritExpressionProvenance } from '@core/types/provenance/ExpressionProvenance';
import { updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';
import type { ForParallelOptions } from './parallel-options';
import {
  ensureVariable,
  enhanceFieldAccessError,
  formatFieldNodeForError,
  isFieldAccessResultLike,
  withIterationMxKey
} from './binding-utils';
import type { ForSourceKind } from '../for-utils';

export type ForContextSnapshot = {
  index: number;
  total: number;
  key: string | number | null;
  parallel: boolean;
};

export type IterationSetupParams = {
  rootEnv: Environment;
  entry: [any, any];
  index: number;
  total: number;
  effective: ForParallelOptions | undefined;
  sourceKind?: ForSourceKind;
  varName: string;
  keyVarName?: string;
  varFields?: FieldAccessNode[];
  fieldPathString: string | null;
  sourceLocation?: SourceLocation;
  sourceDescriptor?: SecurityDescriptor;
};

export type IterationSetupResult = {
  iterationRoot: Environment;
  childEnv: Environment;
  key: unknown;
  value: unknown;
};

export async function setupIterationContext(
  params: IterationSetupParams
): Promise<IterationSetupResult> {
  const [key, value] = params.entry;
  const iterationRoot = params.rootEnv.createChildEnvironment();
  if (params.effective?.parallel) {
    (iterationRoot as any).__parallelIsolationRoot = iterationRoot;
  }
  let childEnv = iterationRoot;
  if (params.effective) {
    (childEnv as any).__forOptions = params.effective;
  }

  let derivedValue: unknown;
  if (params.varFields && params.varFields.length > 0) {
    try {
      const accessed = await accessFields(value, params.varFields, {
        env: childEnv,
        preserveContext: true,
        returnUndefinedForMissing: true,
        sourceLocation: params.sourceLocation
      });
      const accessedValue = isFieldAccessResultLike(accessed) ? accessed.value : accessed;
      if (typeof accessedValue === 'undefined') {
        const missingField = formatFieldNodeForError(params.varFields[params.varFields.length - 1]);
        const accessPath = isFieldAccessResultLike(accessed) && Array.isArray(accessed.accessPath)
          ? accessed.accessPath
          : [];
        throw new FieldAccessError(`Field "${missingField}" not found in object`, {
          baseValue: value,
          fieldAccessChain: [],
          failedAtIndex: Math.max(0, params.varFields.length - 1),
          failedKey: missingField,
          accessPath
        }, {
          sourceLocation: params.sourceLocation,
          env: childEnv
        });
      }
      derivedValue = accessedValue;
      inheritExpressionProvenance(derivedValue, value);
    } catch (error) {
      throw enhanceFieldAccessError(error, {
        fieldPath: params.fieldPathString,
        varName: params.varName,
        index: params.index,
        key: key ?? null,
        sourceLocation: params.sourceLocation
      }) as Error;
    }
  }

  const iterationVar = ensureVariable(params.varName, value, params.rootEnv);
  const hasIterationDescriptor =
    Array.isArray(iterationVar.mx?.labels) && iterationVar.mx.labels.length > 0 ||
    Array.isArray(iterationVar.mx?.taint) && iterationVar.mx.taint.length > 0 ||
    Array.isArray(iterationVar.mx?.sources) && iterationVar.mx.sources.length > 0;
  if (!hasIterationDescriptor && params.sourceDescriptor) {
    if (!iterationVar.mx) {
      iterationVar.mx = {};
    }
    updateVarMxFromDescriptor(iterationVar.mx as Record<string, unknown>, params.sourceDescriptor);
    if ('mxCache' in (iterationVar.mx as Record<string, unknown>)) {
      delete (iterationVar.mx as Record<string, unknown>).mxCache;
    }
  }
  childEnv.setVariable(
    params.varName,
    withIterationMxKey(iterationVar, {
      key,
      index: params.index,
      sourceKind: params.sourceKind
    })
  );
  if (typeof derivedValue !== 'undefined' && params.fieldPathString) {
    const derivedVar = ensureVariable(`${params.varName}.${params.fieldPathString}`, derivedValue, params.rootEnv);
    childEnv.setVariable(`${params.varName}.${params.fieldPathString}`, derivedVar);
  }
  if (key !== null && typeof key === 'string') {
    if (params.keyVarName) {
      const keyVar = ensureVariable(params.keyVarName, key, params.rootEnv);
      childEnv.setVariable(params.keyVarName, keyVar);
    } else {
      const keyVar = ensureVariable(`${params.varName}_key`, key, params.rootEnv);
      childEnv.setVariable(`${params.varName}_key`, keyVar);
    }
  }

  const forCtx: ForContextSnapshot = {
    index: params.index,
    total: params.total,
    key: key ?? null,
    parallel: !!params.effective?.parallel
  };
  childEnv.pushExecutionContext('for', forCtx);

  return {
    iterationRoot,
    childEnv,
    key,
    value
  };
}

export function popForIterationContext(env: Environment): void {
  env.popExecutionContext('for');
}

export function pushExpressionIterationContext(env: Environment): void {
  env.pushExecutionContext('exe', { allowReturn: true, scope: 'for-expression' });
}

export function popExpressionIterationContexts(env: Environment): void {
  env.popExecutionContext('exe');
  env.popExecutionContext('for');
}
