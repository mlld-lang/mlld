import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';

interface CodeExecutionNode {
  type: 'code';
  language: string;
  code: string;
  hasRunKeyword?: boolean;
}

/**
 * Evaluate code execution nodes (from /var RHS)
 * Delegates to environment's executeCode method which uses proper executors
 */
export async function evaluateCodeExecution(
  node: CodeExecutionNode,
  env: Environment
): Promise<EvalResult> {
  const { language, code } = node;
  
  // Delegate to environment's executeCode method which uses the proper executor
  // This ensures we use VM for Node.js, AsyncFunction for JS, etc.
  const result = await env.executeCode(code, language);
  
  return { value: result, env };
}