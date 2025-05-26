import { parse } from '@grammar/parser';
import { Environment } from './env/Environment';
import { evaluate } from './core/interpreter';
import { formatOutput } from './output/formatter';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import type { IPathService } from '@services/fs/IPathService';

import type { ResolvedURLConfig } from '@core/config/types';

/**
 * Options for the interpreter
 */
export interface InterpretOptions {
  basePath?: string;
  strict?: boolean;
  format?: 'markdown' | 'xml';
  fileSystem: IFileSystemService;
  pathService: IPathService;
  urlConfig?: ResolvedURLConfig;
}

/**
 * Main entry point for the Mlld interpreter.
 * This replaces the complex service orchestration with a simple function.
 */
export async function interpret(
  source: string,
  options: InterpretOptions
): Promise<string> {
  // Parse the source into AST
  const parseResult = await parse(source);
  
  // Check if parsing was successful
  if (!parseResult.success || parseResult.error) {
    const parseError = parseResult.error || new Error('Unknown parse error');
    
    // Import MlldParseError for proper error handling
    const { MlldParseError, ErrorSeverity } = await import('@core/errors');
    
    // Create a proper MlldParseError with location information
    const location = (parseError as any).location;
    const position = location?.start || location || undefined;
    
    throw new MlldParseError(
      parseError.message,
      position,
      {
        severity: ErrorSeverity.Fatal,
        cause: parseError
      }
    );
  }
  
  const ast = parseResult.ast;
  
  // Create the root environment
  const env = new Environment(
    options.fileSystem,
    options.pathService,
    options.basePath || process.cwd()
  );
  
  // Configure URL settings if provided
  if (options.urlConfig) {
    env.setURLConfig(options.urlConfig);
  }
  
  // Evaluate the AST
  await evaluate(ast, env);
  
  // Get the final nodes from environment
  const nodes = env.getNodes();
  
  // Format the output
  return await formatOutput(nodes, {
    format: options.format || 'markdown',
    variables: env.getAllVariables()
  });
}

// Re-export key types for convenience
export { Environment } from './env/Environment';
export type { EvalResult } from './core/interpreter';