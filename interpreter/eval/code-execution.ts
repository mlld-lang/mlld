import type { ContentNodeArray, SourceLocation } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { resolveWorkingDirectory } from '../utils/working-directory';

interface CodeExecutionNode {
  type: 'code';
  language: string;
  code: string;
  hasRunKeyword?: boolean;
  workingDir?: ContentNodeArray;
  meta?: {
    hasWorkingDir?: boolean;
    workingDirMeta?: unknown;
  };
}

function collectParameterBindings(env: Environment): Record<string, unknown> | undefined {
  const params: Record<string, unknown> = {};
  const variables = env.getAllVariables();

  for (const [name, variable] of variables.entries()) {
    if (variable?.internal?.isParameter === true) {
      params[name] = variable.value;
    }
  }

  return Object.keys(params).length > 0 ? params : undefined;
}

/**
 * Evaluate code execution nodes (from /var RHS)
 * Delegates to environment's executeCode method which uses proper executors
 */
export async function evaluateCodeExecution(
  node: CodeExecutionNode,
  env: Environment,
  sourceLocation?: SourceLocation
): Promise<EvalResult> {
  const { language, code } = node;

  // Resolve working directory if provided
  const workingDirectory = await resolveWorkingDirectory(
    node.workingDir,
    env,
    { sourceLocation, directiveType: 'var' }
  );

  // Delegate to environment's executeCode method which uses the proper executor
  // This ensures we use VM for Node.js, AsyncFunction for JS, etc.
  const params = collectParameterBindings(env);
  const result = await env.executeCode(
    code,
    language,
    params,
    undefined, // metadata
    workingDirectory ? { workingDirectory } : undefined // options
  );
  
  // Apply automatic JSON parsing for shell commands that return JSON
  // (JavaScript/Node/Python executors handle their own return types)
  if (!language || language === 'sh' || language === 'bash' || language === 'shell') {
    const { processCommandOutput } = await import('@interpreter/utils/json-auto-parser');
    const processed = processCommandOutput(result);
    return { value: processed, env };
  }
  
  return { value: result, env };
}
