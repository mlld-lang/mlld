import type { DirectiveNode, VariableReferenceNode } from '@core/types';
import type { 
  OutputTarget, 
  OutputTargetFile, 
  OutputTargetStream, 
  OutputTargetEnv, 
  OutputTargetResolver,
  isFileTarget,
  isStreamTarget,
  isEnvTarget,
  isResolverTarget
} from '@core/types/output';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { evaluate, interpolate } from '../core/interpreter';
import { MlldOutputError } from '@core/errors';
import { evaluateDataValue } from './data-value-evaluator';
import { isTextLike, isExecutable, isTemplate, createSimpleTextVariable } from '@core/types/variable';
import { logger } from '@core/utils/logger';
import * as path from 'path';

/**
 * Evaluates @output directive with enhanced syntax.
 * 
 * Legacy syntax (backward compatible):
 * 1. @output [file.md] - outputs the complete document
 * 2. @output @variable [file.md] - outputs a specific variable's content
 * 3. @output @template(args) [file.md] - outputs parameterized template result
 * 4. @output @command(args) [file.md] - outputs parameterized command result
 * 5. @output "text content" [file.md] - outputs literal text
 * 
 * Enhanced syntax:
 * 1. @output @variable to "path/to/file.md" - file output
 * 2. @output @variable to stdout - standard output
 * 3. @output @variable to stderr - standard error
 * 4. @output @variable to env - environment variable (MLLD_VARIABLE)
 * 5. @output @variable to env:CUSTOM_NAME - custom environment variable
 * 6. @output @variable to @resolver/path/file.md - resolver output
 * 7. @output @variable to "file.json" as json - with format specification
 */
export async function evaluateOutput(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  // Check if we're importing - skip execution if so
  if (env.getIsImporting()) {
    return {
      type: 'directive',
      value: null
    };
  }

  const hasSource = directive.meta?.hasSource;
  const sourceType = directive.meta?.sourceType;
  const targetType = directive.meta?.targetType || 'file'; // Default to file
  const format = directive.meta?.format;
  // Removed: isLegacy flag - bracket syntax no longer supported



  try {
    // Get the content to output
    let content: string;
    
    if (!hasSource) {
      // @output [file.md] or @output to target - output full document
      // Get the accumulated document from effect handler (includes both markdown and directive outputs)
      const effectHandler = env.getEffectHandler();
      if (effectHandler && typeof effectHandler.getDocument === 'function') {
        content = effectHandler.getDocument();
      } else {
        // Fallback to node formatting if no effect handler
        try {
          const nodes = env.getNodes();
          const { formatOutput } = await import('../output/formatter');
          content = await formatOutput(nodes, {
            format: format || 'markdown',
            variables: env.getAllVariables()
          });
        } catch (formatError) {
          // If there's an error, log it in debug mode
          if (env.hasVariable('DEBUG')) {
            const debug = env.getVariable('DEBUG');
            if (debug && debug.value) {
              logger.error('Output format error', { error: formatError.message });
            }
          }
          throw formatError;
        }
      }
    } else {
      // Evaluate source content
      content = await evaluateOutputSource(directive, env, sourceType);
    }
    
    // Apply format transformation if specified
    if (format) {
      content = await applyOutputFormat(content, format, env);
    }
    
    // Handle the target
    // Check if this is a simplified structure from @when actions (has values.path instead of values.target)
    let target: OutputTarget;
    if (directive.values.target) {
      target = directive.values.target as OutputTarget;
    } else if (directive.values.path) {
      // Legacy structure from @when actions - create a file target
      target = {
        type: 'file',
        path: directive.values.path,
        raw: directive.raw?.path || '',
        meta: { bracketed: true }
      } as OutputTargetFile;
    } else {
      throw new MlldOutputError(
        'No target specified for output directive',
        'unknown',
        { sourceLocation: directive.location, env }
      );
    }
    
    if (targetType === 'file') {
      // File output
      await outputToFile(target as OutputTargetFile, content, env, directive);
    } else if (targetType === 'stream') {
      // Stream output (stdout/stderr)
      await outputToStream(target as OutputTargetStream, content, env);
    } else if (targetType === 'env') {
      // Environment variable output
      await outputToEnv(target as OutputTargetEnv, content, env, hasSource ? directive.values.source : null);
    } else if (targetType === 'resolver') {
      // Resolver output
      await outputToResolver(target as OutputTargetResolver, content, env, directive);
    } else {
      throw new MlldOutputError(
        `Unknown target type: ${targetType}`,
        'unknown',
        { location: directive.location }
      );
    }
    
    // Mark that output was used (to suppress default output)
    (env as any).hasExplicitOutput = true;
    
    // Return successful result (no direct output to document)
    return { value: '', env };
    
  } catch (error) {
    // Log the actual error for debugging
    if (env.hasVariable('DEBUG')) {
      const debug = env.getVariable('DEBUG');
      if (debug && debug.value) {
        logger.error('Output directive error', { 
          error: error.message,
          stack: error.stack 
        });
      }
    }
    
    if (error instanceof Error) {
      throw new MlldOutputError(
        `Failed to process output: ${error.message}`,
        format || 'unknown',
        { sourceLocation: directive.location, env, cause: error }
      );
    }
    throw error;
  }
}

/**
 * Evaluates the source content for output
 */
async function evaluateOutputSource(
  directive: DirectiveNode,
  env: Environment,
  sourceType: string
): Promise<string> {
  switch (sourceType) {
    case 'literal':
      // @output "text content" to target
      // Handle unified quote/template content
      const source = directive.values.source;
      
      // All literal sources should now be arrays of nodes from UnifiedQuoteOrTemplate
      if (Array.isArray(source)) {
        const { interpolate } = await import('../core/interpreter');
        return await interpolate(source, env);
      }
      
      // Fallback for any unexpected format
      console.warn('Unexpected literal source format:', source);
      return String(source);
      
    case 'variable':
      return await evaluateVariableSource(directive, env);
      
    case 'command':
      return await evaluateCommandSource(directive, env);
      
    case 'exec':
    case 'execInvocation':
      return await evaluateExecSource(directive, env);
      
    default:
      throw new MlldOutputError(
        `Unknown source type: ${sourceType}`,
        'unknown',
        { sourceLocation: directive.location, env }
      );
  }
}

/**
 * Evaluates variable source (includes templates and simple variables)
 */
async function evaluateVariableSource(
  directive: DirectiveNode,
  env: Environment
): Promise<string> {
  // Check if the source has args, which indicates it's an invocation
  const source = directive.values.source;
  const hasArgs = source.args && Array.isArray(source.args) && source.args.length > 0;
  
  if (hasArgs || directive.subtype === 'outputInvocation' || directive.subtype === 'outputExecInvocation') {
    // @output @template(args) to target or @output @command(args) to target
    return await evaluateInvocationSource(directive, env);
  } else {
    // @output @variable to target - simple variable reference
    return await evaluateSimpleVariableSource(directive, env);
  }
}

/**
 * Evaluates parameterized invocation source
 */
async function evaluateInvocationSource(
  directive: DirectiveNode,
  env: Environment
): Promise<string> {
  const identifierNodes = directive.values.source.identifier;
  const varName = (identifierNodes && Array.isArray(identifierNodes) && identifierNodes[0]?.identifier) 
    ? identifierNodes[0].identifier 
    : undefined;
  
  if (!varName) {
    throw new MlldOutputError(`Invalid variable reference in output directive`, 'unknown', { sourceLocation: directive.location, env });
  }
  const args = directive.values.source.args || [];
  
  // Get the variable
  const variable = env.getVariable(varName);
  
  if (!variable) {
    throw new MlldOutputError(
      `Variable ${varName} not found`,
      'unknown',
      { sourceLocation: directive.location, env }
    );
  }
  
  // For any variable with args, treat it as an invocation
  if (args.length > 0) {
    // Create an ExecInvocation node and use the standard evaluator
    const execNode = {
      type: 'ExecInvocation',
      commandRef: {
        name: varName,
        identifier: [{
          type: 'Text',
          content: varName
        }],
        args: args
      },
      withClause: null
    };
    
    // Use the standard exec invocation evaluator
    const { evaluateExecInvocation } = await import('./exec-invocation');
    const result = await evaluateExecInvocation(execNode as any, env);
    return String(result.value);
    
  } else if (isTextLike(variable)) {
    // It's a regular text variable (not a template)
    const templateContent = variable.value;
    
    // Create a child environment for parameter substitution
    const childEnv = env.createChild();
    
    // For regular text variables, interpolate the string
    return await childEnv.interpolate(templateContent);
    
  } else if (isExecutable(variable)) {
    // It's an executable - need to invoke it properly
    const definition = variable.value;
    
    // Create a child environment for parameter substitution
    const childEnv = env.createChild();
    
    // Bind parameters if any
    const params = definition.paramNames || [];
    if (params.length > 0) {
      for (let i = 0; i < params.length && i < args.length; i++) {
        const paramName = params[i];
        const argValue = await evaluateDataValue(args[i], env);
        const paramVar = createSimpleTextVariable(
          paramName,
          String(argValue),
          {
            directive: 'var',
            syntax: 'quoted',
            hasInterpolation: false,
            isMultiLine: false
          },
          {
            isSystem: true,
            isParameter: true
          }
        );
        childEnv.set(paramName, paramVar);
      }
    }
    
    // Execute based on the type
    let result: string;
    if (definition.type === 'template') {
      result = await interpolate(definition.template, childEnv);
    } else if (definition.type === 'command') {
      const command = await interpolate(definition.commandTemplate, childEnv);
      result = await childEnv.executeCommand(command);
    } else if (definition.type === 'code') {
      const code = await interpolate(definition.codeTemplate, childEnv);
      result = await childEnv.executeCode(code, definition.language || 'javascript');
    } else {
      throw new MlldOutputError(
        `Unsupported executable type: ${definition.type}`,
        'unknown',
        { sourceLocation: directive.location, env }
      );
    }
    
    return String(result || '');
    
  } else {
    throw new MlldOutputError(
      `Variable ${varName} is not a template or executable`,
      'unknown',
      { sourceLocation: directive.location, env }
    );
  }
}

/**
 * Evaluates simple variable source
 */
async function evaluateSimpleVariableSource(
  directive: DirectiveNode,
  env: Environment
): Promise<string> {
  // The source can be either an object with identifier array or a direct node
  let varName: string;
  
  // Handle different source structures
  if (directive.values.source.identifier) {
    // Standard structure from grammar
    const identifierNodes = directive.values.source.identifier;
    varName = (identifierNodes && Array.isArray(identifierNodes) && identifierNodes[0]?.identifier) 
      ? identifierNodes[0].identifier 
      : undefined;
  } else if (Array.isArray(directive.values.source) && directive.values.source[0]?.type === 'VariableReference') {
    // Legacy structure from older when-actions
    varName = directive.values.source[0].identifier;
  } else if (Array.isArray(directive.values.source) && directive.values.source[0]?.type === 'Text') {
    // Gracefully handle template-as-array passed directly
    const parts = directive.values.source as any[];
    const { interpolate } = await import('../core/interpreter');
    return await interpolate(parts as any, env);
  } else {
    throw new MlldOutputError(
      'Invalid source structure for variable output',
      'unknown',
      { sourceLocation: directive.location, env }
    );
  }
  
  const variable = env.getVariable(varName);
  
  if (!variable) {
    throw new MlldOutputError(
      `Variable ${varName} not found`,
      'unknown',
      { sourceLocation: directive.location, env }
    );
  }
  
  // Get the variable value based on type
  let value: any;
  
  if (isTextLike(variable)) {
    value = variable.value;
  } else if ('value' in variable) {
    // Extract Variable value for output - WHY: Output requires raw values to write/display
    const { extractVariableValue } = await import('../utils/variable-resolution');
    value = await extractVariableValue(variable, env);
  } else {
    throw new MlldOutputError(
      `Cannot output variable ${varName} - unknown variable type`,
      'unknown',
      { sourceLocation: directive.location, env }
    );
  }
  
  // Handle field access if present (only for standard structure)
  const sourceFields = directive.values.source.fields;
  if (sourceFields && sourceFields.length > 0) {
    // Process field access
    for (const field of sourceFields) {
      if (value === null || value === undefined) {
        throw new MlldOutputError(
          `Cannot access field on null or undefined value`,
          directive.location
        );
      }
      
      if (field.type === 'arrayIndex') {
        const index = Number(field.value);
        if (Array.isArray(value)) {
          value = value[index];
        } else {
          throw new MlldOutputError(
            `Cannot index non-array value with [${index}]`,
            directive.location
          );
        }
      } else if (field.type === 'field' || field.type === 'stringIndex' || field.type === 'numericField' || field.type === 'dot') {
        const fieldName = String(field.value);
        if (typeof value === 'object' && value !== null) {
          value = value[fieldName];
        } else {
          throw new MlldOutputError(
            `Cannot access property '${fieldName}' on non-object value`,
            directive.location
          );
        }
      }
    }
  }
  
  // Import LoadContentResult type check
  const { isLoadContentResult, isLoadContentResultArray } = await import('@core/types/load-content');
  
  // Convert value to string
  if (typeof value === 'string') {
    return value;
  } else if (isLoadContentResult(value)) {
    // For LoadContentResult, output the content by default (matching /show behavior)
    return value.content;
  } else if (isLoadContentResultArray(value)) {
    // For array of LoadContentResult, concatenate content with double newlines
    return value.map(item => item.content).join('\n\n');
  } else if (typeof value === 'object') {
    // For objects/arrays, convert to JSON
    return JSON.stringify(value, null, 2);
  } else {
    return String(value || '');
  }
}

/**
 * Evaluates command source
 */
async function evaluateCommandSource(
  directive: DirectiveNode,
  env: Environment
): Promise<string> {
  // @output @run @command to target
  // Execute the command reference
  const cmdName = directive.values.source.identifier[0].identifier;
  const cmdArgs = directive.values.source.args || [];
  
  // Get the command variable
  const cmdVariable = env.getVariable(cmdName);
  
  if (!isCommandVariable(cmdVariable)) {
    throw new MlldOutputError(
      `Variable ${cmdName} is not a command`,
      directive.location
    );
  }
  
  // Create a child environment for parameter substitution
  const cmdChildEnv = env.createChild();
  
  // Bind parameters if any
  if (cmdVariable.params && cmdVariable.params.length > 0) {
    for (let i = 0; i < cmdVariable.params.length && i < cmdArgs.length; i++) {
      const paramName = cmdVariable.params[i];
      const argValue = await evaluateDataValue(cmdArgs[i], env);
      const paramVar = createSimpleTextVariable(
        paramName,
        String(argValue),
        {
          directive: 'var',
          syntax: 'quoted',
          hasInterpolation: false,
          isMultiLine: false
        },
        {
          isSystem: true,
          isParameter: true
        }
      );
      cmdChildEnv.setParameterVariable(paramName, paramVar);
    }
  }
  
  // Execute the command
  const cmdResult = await evaluate(cmdVariable.value, cmdChildEnv);
  return String(cmdResult.value || '');
}

/**
 * Evaluates exec source with tail modifiers
 */
async function evaluateExecSource(
  directive: DirectiveNode,
  env: Environment
): Promise<string> {
  // @output @command() to target with tail modifiers
  // Handle ExecInvocation nodes
  const execInvocationNode = directive.values.source || directive.values.execInvocation;
  if (execInvocationNode && execInvocationNode.type === 'ExecInvocation') {
    const { evaluateExecInvocation } = await import('./exec-invocation');
    const result = await evaluateExecInvocation(execInvocationNode, env);
    return String(result.value);
  } else {
    throw new MlldOutputError(
      `Invalid exec invocation source`,
      'unknown',
      { sourceLocation: directive.location, env }
    );
  }
}

/**
 * Outputs content to a file
 */
async function outputToFile(
  target: OutputTargetFile,
  content: string,
  env: Environment,
  directive: DirectiveNode
): Promise<void> {
  
  
  // Evaluate the file path
  const pathResult = await interpolate(target.path, env);
  let targetPath = String(pathResult);
  
  
  // TODO: This is a hack to handle @base in quoted output paths
  // The proper fix requires rethinking how @identifier resolution works
  // across variables, resolvers, and paths in a unified way
  if (targetPath.startsWith('@base/')) {
    const projectRoot = env.getProjectRoot();
    targetPath = path.join(projectRoot, targetPath.substring(6));
  }
  
  // Resolve relative paths from the base path
  if (!path.isAbsolute(targetPath)) {
    targetPath = path.resolve(env.getBasePath(), targetPath);
  }
  
  // Write the file using the environment's file system
  const fileSystem = (env as any).fileSystem;
  if (!fileSystem) {
    throw new MlldOutputError(
      'File system not available',
      'unknown',
      { sourceLocation: directive.location, env }
    );
  }
  
  // Ensure directory exists
  const dirPath = path.dirname(targetPath);
  try {
    await fileSystem.mkdir(dirPath, { recursive: true });
  } catch (err) {
    // Directory might already exist, that's okay
  }
  
  // Write the file
  await fileSystem.writeFile(targetPath, content);
  
  // Also emit a file effect for tracking/logging purposes
  env.emitEffect('file', content, { 
    path: targetPath,
    source: directive.location 
  });
}

/**
 * Outputs content to a stream (stdout/stderr)
 */
async function outputToStream(
  target: OutputTargetStream,
  content: string,
  env: Environment
): Promise<void> {
  if (target.stream === 'stdout') {
    // Use effect type 'stdout' - outputs to stdout only, bypasses document
    env.emitEffect('stdout', content + '\n');
  } else if (target.stream === 'stderr') {
    // Use effect type 'stderr' - outputs to stderr only
    env.emitEffect('stderr', content + '\n');
  }
}

/**
 * Outputs content to an environment variable
 */
async function outputToEnv(
  target: OutputTargetEnv,
  content: string,
  env: Environment,
  source: any
): Promise<void> {
  let varName: string;
  
  if (target.varname) {
    // Custom environment variable name
    varName = target.varname;
  } else {
    // Default pattern: MLLD_VARIABLE
    if (source && source.identifier) {
      const identifierNodes = source.identifier;
      const sourceVarName = (identifierNodes && Array.isArray(identifierNodes) && identifierNodes[0]?.identifier) 
        ? identifierNodes[0].identifier 
        : undefined;
      varName = sourceVarName ? `MLLD_${sourceVarName.toUpperCase()}` : 'MLLD_OUTPUT';
    } else {
      varName = 'MLLD_OUTPUT';
    }
  }
  
  // Set the environment variable
  process.env[varName] = content;
}

/**
 * Outputs content through a resolver
 */
async function outputToResolver(
  target: OutputTargetResolver,
  content: string,
  env: Environment,
  directive: DirectiveNode
): Promise<void> {
  // Get the resolver manager from environment
  const resolverManager = (env as any).resolverManager;
  if (!resolverManager) {
    throw new MlldOutputError(
      'Resolver manager not available',
      'unknown',
      { sourceLocation: directive.location, env }
    );
  }
  
  // Construct the resolver path
  const resolverPath = `@${target.resolver}/${target.path.map(p => p.content).join('/')}`;
  
  // Heuristic: if resolver name matches a defined variable, user likely meant a variable in the path (needs quotes)
  const looksLikeVariable = !!env.getVariable(target.resolver);
  if (looksLikeVariable) {
    const hintQuoted = `/output @<source> to "@${target.resolver}/${target.path.map(p => p.content).join('/')}"`;
    const hintExplain = `The target '@${target.resolver}/...' is interpreted as a resolver name, not a variable. Quote the path to interpolate variables.`;
    throw new MlldOutputError(
      `Unquoted variable in /output target: '@${target.resolver}' is interpreted as a resolver name` +
        `\nHint: ${hintExplain}\nExample: ${hintQuoted}`,
      'unknown',
      { sourceLocation: directive.location, env, context: { resolverPath } }
    );
  }

  // Placeholder until resolver write support exists
  throw new MlldOutputError(
    `Resolver output not yet implemented for ${resolverPath}`,
    'unknown',
    { sourceLocation: directive.location, env }
  );
}

/**
 * Applies format transformation to content
 */
async function applyOutputFormat(
  content: string,
  format: string,
  env: Environment
): Promise<string> {
  switch (format) {
    case 'json':
      // Try to parse and pretty-print JSON
      try {
        const parsed = JSON.parse(content);
        return JSON.stringify(parsed, null, 2);
      } catch {
        // If not valid JSON, return as-is
        return content;
      }
      
    case 'yaml':
      // TODO: Implement YAML formatting
      // For now, return as-is
      return content;
      
    case 'text':
      // Plain text - strip any formatting
      return content;
      
    default:
      // Unknown format - return as-is
      return content;
  }
}
