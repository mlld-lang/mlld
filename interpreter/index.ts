import { parse } from '@grammar/parser';
import { Environment } from './env/Environment';
import { evaluate } from './core/interpreter';
import { formatOutput } from './output/formatter';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import type { IPathService } from '@services/fs/IPathService';
import type { FuzzyMatchConfig } from '@core/resolvers/types';

import type { ResolvedURLConfig } from '@core/config/types';

interface CommandExecutionOptions {
  showProgress?: boolean;
  maxOutputLines?: number;
  errorBehavior?: 'halt' | 'continue';
  collectErrors?: boolean;
  showCommandContext?: boolean;
  timeout?: number;
}

/**
 * Options for the interpreter
 */
export interface InterpretOptions {
  basePath?: string;
  filePath?: string; // Current file being processed (for error reporting)
  strict?: boolean;
  format?: 'markdown' | 'xml';
  fileSystem: IFileSystemService;
  pathService: IPathService;
  urlConfig?: ResolvedURLConfig;
  outputOptions?: CommandExecutionOptions;
  stdinContent?: string; // Optional stdin content
  returnEnvironment?: boolean; // Return environment with result
  approveAllImports?: boolean; // Bypass interactive import approval
  normalizeBlankLines?: boolean; // Control blank line normalization (default: true)
  devMode?: boolean; // Enable development mode with local fallback
  enableTrace?: boolean; // Enable directive trace for debugging (default: true)
  useMarkdownFormatter?: boolean; // Use prettier for markdown formatting (default: true)
  localFileFuzzyMatch?: FuzzyMatchConfig | boolean; // Fuzzy matching for local file imports (default: true)
}

/**
 * Result from the interpreter when returnEnvironment is true
 */
export interface InterpretResult {
  output: string;
  environment: Environment;
}

/**
 * Main entry point for the Mlld interpreter.
 * This replaces the complex service orchestration with a simple function.
 */
export async function interpret(
  source: string,
  options: InterpretOptions
): Promise<string | InterpretResult> {
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
    
    // Add filePath to the position/location if we have one
    if (position && options.filePath) {
      if ('line' in position) {
        // It's a Position, convert to Location with filePath
        position.filePath = options.filePath;
      } else {
        // It's a Location, add filePath
        position.filePath = options.filePath;
      }
    }
    
    // Enhance error message for common mistakes
    let enhancedMessage = parseError.message;
    
    // Detect common syntax errors and provide helpful guidance
    if (parseError.message.includes('Expected "@add" or whitespace but "@" found') && 
        source.includes('@text') && source.includes('(') && source.includes('@run')) {
      enhancedMessage = `${parseError.message}\n\n` +
        `Hint: For parameterized commands that execute shell commands, use @exec instead of @text:\n` +
        `  ❌ @text name(param) = @run [(command)]\n` +
        `  ✅ @exec name(param) = @run [(command)]\n\n` +
        `For parameterized text templates, use @add with template syntax:\n` +
        `  ✅ @text name(param) = @add [[template with {{param}}]]`;
    }
    
    throw new MlldParseError(
      enhancedMessage,
      position,
      {
        severity: ErrorSeverity.Fatal,
        cause: parseError,
        filePath: options.filePath
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
  
  // Register built-in resolvers (async initialization)
  await env.registerBuiltinResolvers();
  
  // Set the current file path if provided (for error reporting)
  if (options.filePath) {
    env.setCurrentFilePath(options.filePath);
  }
  
  // Configure URL settings if provided
  if (options.urlConfig) {
    env.setURLConfig(options.urlConfig);
  }
  
  // Set output options if provided
  if (options.outputOptions) {
    env.setOutputOptions(options.outputOptions);
  }
  
  // Set stdin content if provided
  if (options.stdinContent !== undefined) {
    env.setStdinContent(options.stdinContent);
  }
  
  // Set import approval bypass if provided
  if (options.approveAllImports) {
    env.setApproveAllImports(options.approveAllImports);
  }
  
  // Set blank line normalization flag (default: true)
  if (options.normalizeBlankLines !== undefined) {
    env.setNormalizeBlankLines(options.normalizeBlankLines);
  }
  
  // Set dev mode if provided
  if (options.devMode) {
    env.setDevMode(options.devMode);
  }
  
  // Set trace enabled (default: true)
  if (options.enableTrace !== undefined) {
    env.setTraceEnabled(options.enableTrace);
  }
  
  // Set fuzzy matching for local files (default: true)
  if (options.localFileFuzzyMatch !== undefined) {
    env.setLocalFileFuzzyMatch(options.localFileFuzzyMatch);
  }
  
  // Evaluate the AST
  await evaluate(ast, env);
  
  // Display collected errors with rich formatting if enabled
  if (options.outputOptions?.collectErrors) {
    await env.displayCollectedErrors();
  }
  
  // Get the final nodes from environment
  const nodes = env.getNodes();
  
  // Format the output
  const output = await formatOutput(nodes, {
    format: options.format || 'markdown',
    variables: env.getAllVariables(),
    useMarkdownFormatter: options.useMarkdownFormatter,
    normalizeBlankLines: options.normalizeBlankLines
  });
  
  // Return environment if requested
  if (options.returnEnvironment) {
    return {
      output,
      environment: env
    };
  }
  
  return output;
}

// Re-export key types for convenience
export { Environment } from './env/Environment';
export type { EvalResult } from './core/interpreter';