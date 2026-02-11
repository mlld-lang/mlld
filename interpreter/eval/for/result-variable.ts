import type {
  ArrayVariable,
  ForExpression,
  Variable
} from '@core/types';
import { setExpressionProvenance } from '@core/types/provenance/ExpressionProvenance';
import { mergeDescriptors, type SecurityDescriptor } from '@core/types/security';
import { updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';
import {
  createArrayVariable,
  createObjectVariable,
  createPrimitiveVariable,
  createSimpleTextVariable
} from '@core/types/variable';
import { extractSecurityDescriptor } from '@interpreter/utils/structured-value';
import type { ForIterationError } from './types';

type ForExpressionResultVariableParams = {
  expr: ForExpression;
  finalResults: unknown;
  errors: ForIterationError[];
  sourceDescriptor?: SecurityDescriptor;
  hadBatchPipeline: boolean;
};

function buildForExpressionMetadata(params: ForExpressionResultVariableParams): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    sourceExpression: params.expr.expression,
    iterationVariable: params.expr.variable.identifier
  };
  if (params.hadBatchPipeline) {
    metadata.hadBatchPipeline = true;
  }
  if (params.errors.length > 0) {
    metadata.forErrors = params.errors;
  }
  return metadata;
}

function resolveForExpressionResultDescriptor(
  finalResults: unknown,
  sourceDescriptor?: SecurityDescriptor
): SecurityDescriptor | undefined {
  const resultDescriptors = (Array.isArray(finalResults) ? finalResults : [finalResults])
    .map(result => extractSecurityDescriptor(result))
    .filter(Boolean) as SecurityDescriptor[];
  if (sourceDescriptor) {
    resultDescriptors.push(sourceDescriptor);
  }
  if (resultDescriptors.length === 0) {
    return undefined;
  }
  if (resultDescriptors.length === 1) {
    return resultDescriptors[0];
  }
  return mergeDescriptors(...resultDescriptors);
}

function applyForResultDescriptor<T extends Variable>(
  variable: T,
  descriptor?: SecurityDescriptor
): T {
  if (descriptor && variable.mx) {
    updateVarMxFromDescriptor(variable.mx, descriptor);
  }
  return variable;
}

export function createForExpressionResultVariable(
  params: ForExpressionResultVariableParams
): ArrayVariable {
  const variableSource = {
    directive: 'for',
    syntax: 'expression',
    hasInterpolation: false,
    isMultiLine: false
  };
  const metadata = buildForExpressionMetadata(params);
  const forResultDescriptor = resolveForExpressionResultDescriptor(
    params.finalResults,
    params.sourceDescriptor
  );

  if (forResultDescriptor && Array.isArray(params.finalResults)) {
    setExpressionProvenance(params.finalResults, forResultDescriptor);
  }

  if (Array.isArray(params.finalResults)) {
    return applyForResultDescriptor(
      createArrayVariable(
        'for-result',
        params.finalResults,
        false,
        variableSource,
        {
          metadata,
          internal: {
            arrayType: 'for-expression-result'
          }
        }
      ),
      forResultDescriptor
    );
  }

  if (params.finalResults === undefined) {
    return applyForResultDescriptor(
      createPrimitiveVariable(
        'for-result',
        null,
        variableSource,
        { mx: metadata }
      ),
      forResultDescriptor
    ) as unknown as ArrayVariable;
  }

  if (
    params.finalResults === null ||
    typeof params.finalResults === 'number' ||
    typeof params.finalResults === 'boolean'
  ) {
    return applyForResultDescriptor(
      createPrimitiveVariable(
        'for-result',
        params.finalResults as number | boolean | null,
        variableSource,
        { mx: metadata }
      ),
      forResultDescriptor
    ) as unknown as ArrayVariable;
  }

  if (typeof params.finalResults === 'string') {
    return applyForResultDescriptor(
      createSimpleTextVariable(
        'for-result',
        params.finalResults,
        variableSource,
        { mx: metadata }
      ),
      forResultDescriptor
    ) as unknown as ArrayVariable;
  }

  if (typeof params.finalResults === 'object') {
    return applyForResultDescriptor(
      createObjectVariable(
        'for-result',
        params.finalResults as Record<string, unknown>,
        false,
        variableSource,
        { mx: metadata }
      ),
      forResultDescriptor
    ) as unknown as ArrayVariable;
  }

  return applyForResultDescriptor(
    createSimpleTextVariable(
      'for-result',
      String(params.finalResults),
      variableSource,
      { mx: metadata }
    ),
    forResultDescriptor
  ) as unknown as ArrayVariable;
}
