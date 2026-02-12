import type { FileReferenceNode } from '@core/types';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import { wrapEvalValue } from './shared-utils';

interface LoadContentNodeLike {
  type: 'load-content';
  source: unknown;
}

export async function evaluateLoadContentNode(
  node: LoadContentNodeLike,
  env: Environment
): Promise<EvalResult> {
  const { evaluateDataValue } = await import('@interpreter/eval/data-value-evaluator');
  const result = await evaluateDataValue(node as any, env);
  return wrapEvalValue(result, env);
}

export async function evaluateFileReferenceNode(
  fileRefNode: FileReferenceNode,
  env: Environment
): Promise<EvalResult> {
  const { processContentLoader } = await import('@interpreter/eval/content-loader');
  const { accessField } = await import('@interpreter/utils/field-access');
  const { wrapLoadContentValue } = await import('@interpreter/utils/load-content-structured');
  const { isStructuredValue } = await import('@interpreter/utils/structured-value');

  const loadContentNode = {
    type: 'load-content' as const,
    source: fileRefNode.source
  };

  const rawLoadResult = await processContentLoader(loadContentNode, env);
  const loadResult = isStructuredValue(rawLoadResult)
    ? rawLoadResult
    : wrapLoadContentValue(rawLoadResult);

  if (fileRefNode.fields && fileRefNode.fields.length > 0) {
    let result: any = loadResult;
    for (const field of fileRefNode.fields) {
      result = await accessField(result, field, { env });
    }
    return wrapEvalValue(result, env);
  }

  return wrapEvalValue(loadResult, env);
}
