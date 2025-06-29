import { parse } from '@grammar/parser';
import { Environment } from './env/Environment';
import { evaluate } from './core/interpreter';
import { formatOutput } from './output/formatter';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import type { IPathService } from '@services/fs/IPathService';
import type { FuzzyMatchConfig } from '@core/resolvers/types';
import { findProjectRoot } from '@core/utils/findProjectRoot';
import { initializePatterns, enhanceParseError } from '@core/errors/patterns/init';
import * as path from 'path';

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
  captureEnvironment?: (env: Environment) => void; // Callback to capture environment after execution
  captureErrors?: boolean; // Capture parse errors for pattern development
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
  // Initialize error patterns on first use
  await initializePatterns();
  
  // Parse the source into AST
  const parseResult = await parse(source);
  
  // Check if parsing was successful
  if (!parseResult.success || parseResult.error) {
    const parseError = parseResult.error || new Error('Unknown parse error');
    
    // Import MlldParseError for proper error handling
    const { MlldParseError, ErrorSeverity } = await import('@core/errors');
    
    // If capture errors is enabled, capture the error and exit
    if (options.captureErrors) {
      const { captureError } = await import('@core/errors/capture');
      const captureDir = await captureError(parseError, source, options.filePath || 'stdin');
      console.log(`Error captured to: ${captureDir}`);
      console.log('Edit the pattern.ts file and test with: mlld error-test ' + captureDir);
      process.exit(1);
    }
    
    // Check if Peggy's format method is available
    let peggyFormatted: string | undefined;
    if (typeof (parseError as any).format === 'function') {
      try {
        // Peggy expects the source to match location.source, but our parser doesn't set it
        // We need to manually set the source in the error's location for format() to work
        const peggyError = parseError as any;
        if (peggyError.location && !peggyError.location.source) {
          peggyError.location.source = options.filePath || 'stdin';
        }
        
        peggyFormatted = peggyError.format([{
          source: options.filePath || 'stdin',
          text: source
        }]);
        
        // Debug: Log what Peggy's format returns
        if (process.env.DEBUG_PEGGY) {
          console.log('Peggy formatted output:');
          console.log(peggyFormatted);
          console.log('---');
        }
      } catch (e) {
        // Fallback - format not available or failed
      }
    }
    
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
    
    // Use pattern-based error enhancement
    const enhancedError = await enhanceParseError(parseError, source, options.filePath);
    
    // If we got an enhanced error, add peggyFormatted to its details
    if (enhancedError) {
      if (peggyFormatted) {
        enhancedError.details = {
          ...enhancedError.details,
          peggyFormatted,
          sourceContent: source // Store source for error display
        };
      }
      throw enhancedError;
    }
    
    // Fallback to the old enhancement logic for now
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
        filePath: options.filePath,
        context: peggyFormatted ? { peggyFormatted, sourceContent: source } : undefined
      }
    );
  }
  
  const ast = parseResult.ast;
  
  // Find the project root for lock file discovery
  // If we have a filePath, start from its directory, otherwise use basePath
  const basePath = options.basePath || process.cwd();
  const searchStartPath = options.filePath 
    ? path.dirname(path.resolve(basePath, options.filePath))
    : basePath;
  const projectRoot = await findProjectRoot(searchStartPath, options.fileSystem);
  
  // Create the root environment with the project root
  const env = new Environment(
    options.fileSystem,
    options.pathService,
    projectRoot
  );
  
  // If the project root is different from basePath, we may need to update
  // the current file path to be relative to the project root
  if (projectRoot !== basePath && options.filePath) {
    // Keep the filePath as-is, it's already absolute or relative to basePath
  }
  
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
  
  if (process.env.DEBUG_WHEN) {
    console.log('Final nodes count:', nodes.length);
    nodes.forEach((node, i) => {
      console.log(`Node ${i}:`, node.type, node.type === 'Text' ? node.content : '');
    });
  }
  
  // Format the output
  const output = await formatOutput(nodes, {
    format: options.format || 'markdown',
    variables: env.getAllVariables(),
    useMarkdownFormatter: options.useMarkdownFormatter,
    normalizeBlankLines: options.normalizeBlankLines
  });
  
  // Call captureEnvironment callback if provided
  if (options.captureEnvironment) {
    options.captureEnvironment(env);
  }
  
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