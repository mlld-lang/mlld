import { parse } from '@core/ast/parser';
import { Environment } from './env/Environment';
import { evaluate } from './core/interpreter';
import { formatOutput } from './output/formatter';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IPathService } from '@services/fs/PathService/IPathService';

/**
 * Options for the interpreter
 */
export interface InterpretOptions {
  basePath?: string;
  strict?: boolean;
  format?: 'markdown' | 'xml';
  fileSystem: IFileSystemService;
  pathService: IPathService;
}

/**
 * Main entry point for the Meld interpreter.
 * This replaces the complex service orchestration with a simple function.
 */
export async function interpret(
  source: string,
  options: InterpretOptions
): Promise<string> {
  // Parse the source into AST
  const parseResult = await parse(source);
  const ast = parseResult.ast;
  
  // Create the root environment
  const env = new Environment(
    options.fileSystem,
    options.pathService,
    options.basePath || process.cwd()
  );
  
  // Evaluate the AST
  await evaluate(ast, env);
  
  // Get the final nodes from environment
  const nodes = env.getNodes();
  
  // Format the output
  return formatOutput(nodes, {
    format: options.format || 'markdown',
    variables: env.getAllVariables()
  });
}

// Re-export key types for convenience
export { Environment } from './env/Environment';
export type { EvalResult } from './core/interpreter';