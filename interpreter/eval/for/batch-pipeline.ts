import type {
  Environment,
  ForExpression
} from '@core/types';
import { createArrayVariable } from '@core/types/variable';
import { logger } from '@core/utils/logger';
import { isVariable, extractVariableValue } from '@interpreter/utils/variable-resolution';
import {
  asData,
  isStructuredValue
} from '@interpreter/utils/structured-value';
import type { ForIterationError } from './types';
import { createForIterationError } from './error-reporting';

export type ForBatchPipelineResult = {
  finalResults: unknown;
  hadBatchPipeline: boolean;
};

export async function applyForExpressionBatchPipeline(params: {
  expr: ForExpression;
  env: Environment;
  results: unknown[];
  errors: ForIterationError[];
}): Promise<ForBatchPipelineResult> {
  const batchPipelineConfig = params.expr.meta?.batchPipeline;
  const batchStages = Array.isArray(batchPipelineConfig)
    ? batchPipelineConfig
    : batchPipelineConfig?.pipeline;

  if (!batchStages || batchStages.length === 0) {
    return {
      finalResults: params.results,
      hadBatchPipeline: false
    };
  }

  const { processPipeline } = await import('@interpreter/eval/pipeline/unified-processor');
  const batchInput = createArrayVariable(
    'for-batch-input',
    params.results,
    false,
    {
      directive: 'for',
      syntax: 'expression',
      hasInterpolation: false,
      isMultiLine: false
    },
    { isBatchInput: true }
  );

  try {
    const pipelineResult = await processPipeline({
      value: batchInput,
      env: params.env,
      pipeline: batchStages,
      identifier: `for-batch-${params.expr.variable.identifier}`,
      location: params.expr.location,
      isRetryable: false
    });

    let finalResults: unknown;
    if (isStructuredValue(pipelineResult)) {
      finalResults = asData(pipelineResult);
    } else if (isVariable(pipelineResult)) {
      finalResults = await extractVariableValue(pipelineResult, params.env);
    } else {
      finalResults = pipelineResult;
    }

    return {
      finalResults,
      hadBatchPipeline: true
    };
  } catch (error) {
    const marker = createForIterationError({
      index: -1,
      key: null,
      error,
      value: params.results
    });
    logger.warn(`Batch pipeline failed for for-expression: ${marker.message}`);
    params.errors.push(marker);
    return {
      finalResults: params.results,
      hadBatchPipeline: true
    };
  }
}
