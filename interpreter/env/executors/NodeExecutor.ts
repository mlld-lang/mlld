import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import { BaseCommandExecutor, type CommandExecutionOptions, type CommandExecutionResult } from './BaseCommandExecutor';
import type { ErrorUtils, CommandExecutionContext } from '../ErrorUtils';
import { MlldCommandExecutionError } from '@core/errors';
import type { NodeShadowEnvironment } from '../NodeShadowEnvironment';
import { prepareParamsForShadow, createMlldHelpers } from '../variable-proxy';
import { resolveShadowEnvironment } from '../../eval/helpers/shadowEnvResolver';
import { enhanceJSError } from '@core/errors/patterns/init';

export interface NodeShadowEnvironmentProvider {
  /**
   * Get the Node.js shadow environment instance
   */
  getNodeShadowEnv(): NodeShadowEnvironment | undefined;
  
  /**
   * Get or create Node.js shadow environment instance
   */
  getOrCreateNodeShadowEnv(): NodeShadowEnvironment;
  
  /**
   * Get current file path for determining execution directory
   */
  getCurrentFilePath(): string | undefined;
}

/**
 * Executes Node.js code using VM-based shadow environment or subprocess fallback
 */
export class NodeExecutor extends BaseCommandExecutor {
  constructor(
    errorUtils: ErrorUtils,
    workingDirectory: string,
    private nodeShadowProvider: NodeShadowEnvironmentProvider
  ) {
    super(errorUtils, workingDirectory);
  }

  async execute(
    code: string,
    options?: CommandExecutionOptions,
    context?: CommandExecutionContext,
    params?: Record<string, any>,
    metadata?: Record<string, any>
  ): Promise<string> {
    
    // For Node.js execution, always halt on errors (don't use continue behavior)
    // This ensures that Node.js errors propagate properly for testing and error handling
    const nodeOptions = { ...options, errorBehavior: 'halt' as const };
    return this.executeWithCommonHandling(
      `node: ${code.substring(0, 50)}...`,
      nodeOptions,
      context,
      () => this.executeNodeCode(code, params, metadata, context)
    );
  }

  private async executeNodeCode(
    code: string,
    params?: Record<string, any>,
    metadata?: Record<string, any>,
    context?: CommandExecutionContext
  ): Promise<CommandExecutionResult> {
    const startTime = Date.now();

    try {
      // Always use shadow environment for Node.js execution
      const nodeShadowEnv = this.nodeShadowProvider.getOrCreateNodeShadowEnv();
      
      // NEW CODE: Extract and handle captured shadow environments
      const capturedEnvs = params?.__capturedShadowEnvs;
      if (params && '__capturedShadowEnvs' in params) {
        delete params.__capturedShadowEnvs;
      }
      
      // Prepare parameters with Variable proxies
      const sanitizedParams = params ? { ...params } : undefined;
      let shadowParams = sanitizedParams;

      if (sanitizedParams) {
        shadowParams = prepareParamsForShadow(sanitizedParams);
        const primitiveMetadata = (shadowParams as any).__mlldPrimitiveMetadata;
        if (primitiveMetadata) {
          delete (shadowParams as any).__mlldPrimitiveMetadata;
        }
        // Also add mlld helpers with metadata
        if (!shadowParams.mlld) {
          const mergedMetadata = {
            ...(metadata as Record<string, any> | undefined),
            ...(primitiveMetadata || {})
          };
          const helperMetadata = Object.keys(mergedMetadata || {}).length ? mergedMetadata : undefined;
          shadowParams.mlld = createMlldHelpers(helperMetadata);
        }
      }
      
      // Merge captured shadow environments if they exist
      if (capturedEnvs) {
        // Resolve shadow environment for Node.js - look for 'node' or 'nodejs' keys
        const nodeEnv = capturedEnvs.node || capturedEnvs.nodejs;
        if (nodeEnv) {
          nodeShadowEnv.mergeCapturedFunctions(nodeEnv);
        }
      }
      
      // Use shadow environment with VM
      const result = await nodeShadowEnv.execute(code, shadowParams);
      
      // Format result (same as subprocess version)
      let output = '';
      if (result !== undefined) {
        if (typeof result === 'object') {
          output = JSON.stringify(result);
        } else {
          output = String(result);
        }
      }
      
      const duration = Date.now() - startTime;
      return {
        output,
        duration,
        exitCode: 0
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      // For shadow environment errors, extract the original message
      // The NodeShadowEnvironment may wrap errors, so extract the original
      let originalError = errorMessage;
      if (errorMessage.includes('Node shadow environment error:')) {
        // Extract the original error message after the prefix
        originalError = errorMessage.replace('Node shadow environment error: ', '');
      }
      
      // Try to enhance the error with patterns
      const enhanced = enhanceJSError(
        error as Error,
        code,
        params,
        { language: 'node' }
      );
      
      // Use enhanced message if available
      const finalMessage = enhanced?.message || `Node.js error: ${originalError}`;
      
      // Create a proper MlldError for Node.js errors
      throw new MlldCommandExecutionError(
        finalMessage,
        context?.sourceLocation,
        {
          command: `node code execution`,
          exitCode: 1,
          duration: Date.now() - startTime,
          stderr: originalError, // Use the unwrapped original error message
          stdout: '',
          workingDirectory: this.workingDirectory,
          directiveType: context?.directiveType || 'exec',
          // Include stack for debugging if available
          ...(errorStack && { errorStack })
        }
      );
    }
  }

  private async executeNodeSubprocess(
    code: string,
    params?: Record<string, any>
  ): Promise<CommandExecutionResult> {
    const startTime = Date.now();
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `mlld_exec_${Date.now()}.js`);
    
    // Build Node.js code with parameters
    let nodeCode = '';
    
    if (params && typeof params === 'object') {
      // Prepare parameters with Variable proxies
      const shadowParams = prepareParamsForShadow(params);
      
      // Inject parameters as constants
      for (const [key, value] of Object.entries(shadowParams)) {
        nodeCode += `const ${key} = ${JSON.stringify(value)};\n`;
      }
      
      // Always add mlld helpers
      if (!shadowParams.mlld) {
        const mlldHelpers = createMlldHelpers(metadata);
        nodeCode += `const mlld = ${JSON.stringify(mlldHelpers)};\n`;
      }
    }
    
    // Add mlld built-in values
    if (!params || !params['mlld_now']) {
      nodeCode += `const mlld_now = () => new Date().toISOString();\n`;
    }
    
    // Wrap the code to capture return values
    const wrappedCode = `
${nodeCode}
// mlld return value capture
(async () => {
  try {
    const __mlld_result = await (async () => {
${code}
    })();
    
    // If there's a return value, output it as JSON
    if (__mlld_result !== undefined) {
      // Use a special marker to distinguish return values from regular output
      console.log('__MLLD_RETURN__:' + JSON.stringify(__mlld_result));
    }
  } catch (err) {
    // Output error with special marker
    console.error('__MLLD_ERROR__:' + err.message);
    if (err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  }
})();
`;
    
    // Debug: log the generated code
    if (process.env.DEBUG_NODE_EXEC) {
      console.log('Generated Node.js code:');
      console.log(wrappedCode);
      console.log('Params:', params);
    }
    
    // Write to temp file
    fs.writeFileSync(tmpFile, wrappedCode);
    
    try {
      // Execute Node.js in the directory of the current mlld file
      const currentDir = this.nodeShadowProvider.getCurrentFilePath() 
        ? path.dirname(this.nodeShadowProvider.getCurrentFilePath()!) 
        : this.workingDirectory;
      
      // Build NODE_PATH for module resolution
      const nodePaths = this.buildNodePaths();
      
      let result: string;
      try {
        result = execSync(`node ${tmpFile}`, {
          encoding: 'utf8',
          cwd: currentDir,
          env: { 
            ...process.env,
            NODE_PATH: nodePaths.join(path.delimiter)
          },
          maxBuffer: 10 * 1024 * 1024 // 10MB limit
        });
      } catch (execError: any) {
        // Handle subprocess execution errors
        // execSync error includes both stdout and stderr
        const stderr = execError.stderr || '';
        const stdout = execError.stdout || '';
        
        // Look for our error marker in stderr
        let errorMessage = 'Node.js execution failed';
        if (stderr.includes('__MLLD_ERROR__:')) {
          const errorLines = stderr.split('\n');
          const errorLine = errorLines.find(line => line.includes('__MLLD_ERROR__:'));
          if (errorLine) {
            errorMessage = errorLine.replace('__MLLD_ERROR__:', '');
          }
        }
        
        
        const duration = Date.now() - startTime;
        
        // Throw with preserved error message in stderr field
        throw new MlldCommandExecutionError(
          `Node.js error: ${errorMessage}`,
          undefined,
          {
            command: `node ${tmpFile}`,
            exitCode: execError.status || 1,
            duration,
            stderr: errorMessage, // Use the extracted error message
            stdout,
            workingDirectory: currentDir,
            directiveType: 'exec'
          }
        );
      }
        
      // Process the output to separate return value from stdout
      const output = result.toString();
      const lines = output.split('\n');
      const returnLineIndex = lines.findIndex((line: string) => line.startsWith('__MLLD_RETURN__:'));
      
      if (returnLineIndex !== -1) {
        // Found a return value
        const returnLine = lines[returnLineIndex];
        const jsonStr = returnLine.substring('__MLLD_RETURN__:'.length);
        
        // Remove the return line from output
        lines.splice(returnLineIndex, 1);
        const stdoutOnly = lines.join('\n').trimEnd();
        
        // Store the stdout separately if needed for debugging
        if (stdoutOnly && process.env.DEBUG_NODE_EXEC) {
          console.log('Node.js stdout (excluding return):', stdoutOnly);
        }
        
        // Return the JSON string (will be parsed by data evaluator if needed)
        const duration = Date.now() - startTime;
        return {
          output: jsonStr,
          duration,
          exitCode: 0
        };
      } else {
        // No return value, just use stdout as before
        const duration = Date.now() - startTime;
        return {
          output: output.trimEnd(),
          duration,
          exitCode: 0
        };
      }
    } finally {
      // Clean up temp file
      fs.unlinkSync(tmpFile);
    }
  }

  private buildNodePaths(): string[] {
    // Determine mlld's node_modules path
    let mlldNodeModules: string | undefined;
    
    // First check if we're in development (mlld source directory)
    const devNodeModules = path.join(process.cwd(), 'node_modules');
    if (fs.existsSync(devNodeModules) && fs.existsSync(path.join(process.cwd(), 'package.json'))) {
      const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
      if (packageJson.name === 'mlld') {
        mlldNodeModules = devNodeModules;
      }
    }
    
    // If not in dev, try to find mlld's installation directory
    if (!mlldNodeModules) {
      try {
        // Get the path to mlld's main module
        const mlldPath = require.resolve('mlld/package.json');
        mlldNodeModules = path.join(path.dirname(mlldPath), 'node_modules');
      } catch {
        // If that fails, try common global install locations
        const possiblePaths = [
          '/opt/homebrew/lib/node_modules/mlld/node_modules',
          '/usr/local/lib/node_modules/mlld/node_modules',
          '/usr/lib/node_modules/mlld/node_modules',
          path.join(process.env.HOME || '', '.npm-global/lib/node_modules/mlld/node_modules')
        ];
        
        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            mlldNodeModules = p;
            break;
          }
        }
      }
    }
    
    // Build the NODE_PATH
    const existingNodePath = process.env.NODE_PATH || '';
    const nodePaths = existingNodePath ? existingNodePath.split(path.delimiter) : [];
    if (mlldNodeModules && !nodePaths.includes(mlldNodeModules)) {
      nodePaths.unshift(mlldNodeModules);
    }
    
    return nodePaths;
  }
}
