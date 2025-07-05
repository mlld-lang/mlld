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
 * Reuses logic from the run directive for consistency
 */
export async function evaluateCodeExecution(
  node: CodeExecutionNode,
  env: Environment
): Promise<EvalResult> {
  const { language, code } = node;
  
  switch (language) {
    case 'js':
    case 'javascript':
    case 'node': {
      // Execute JavaScript code
      try {
        // For now, use a simple evaluation approach
        // In production, this should use vm module or other sandboxing
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor as new (...args: string[]) => Promise<unknown>;
        const fn = new AsyncFunction(code);
        const result = await fn() as string | undefined;
        return { value: result ?? '', env };
      } catch (error) {
        throw new Error(`JavaScript execution failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    case 'python': {
      // Execute Python code
      const pythonCommand = `python3 -c ${JSON.stringify(code)}`;
      const result = await env.executeCommand(pythonCommand);
      return { value: result, env };
    }
    
    case 'bash':
    case 'sh': {
      // Execute shell code
      const result = await env.executeCommand(code);
      return { value: result, env };
    }
    
    default:
      throw new Error(`Unsupported language: ${language}`);
  }
}