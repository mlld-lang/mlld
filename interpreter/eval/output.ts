import type { DirectiveNode, VariableReferenceNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { evaluate, interpolate } from '../core/interpreter';
import { MlldOutputError } from '@core/errors';
import { evaluateDataValue } from './data-value-evaluator';
import { isTextVariable, isCommandVariable } from '@core/types';
import { logger } from '@core/utils/logger';
import * as path from 'path';

/**
 * Evaluates @output directive.
 * 
 * Supports multiple forms:
 * 1. @output [file.md] - outputs the complete document
 * 2. @output @variable [file.md] - outputs a specific variable's content
 * 3. @output @template(args) [file.md] - outputs parameterized template result
 * 4. @output @command(args) [file.md] - outputs parameterized command result
 * 5. @output "text content" [file.md] - outputs literal text
 */
export async function evaluateOutput(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const hasSource = directive.meta?.hasSource;
  const sourceType = directive.meta?.sourceType;
  
  // Debug logging
  if (env.hasVariable('DEBUG')) {
    const debug = env.getVariable('DEBUG');
    if (debug && debug.value) {
      logger.debug('Evaluating output directive', { 
        directive: directive.subtype,
        source: sourceType,
        hasSource: hasSource 
      });
    }
  }
  
  try {
    // Evaluate the file path
    const pathResult = await evaluateDataValue(directive.values.path, env);
    let targetPath = String(pathResult);
    
    // Resolve relative paths from the base path
    if (!path.isAbsolute(targetPath)) {
      targetPath = path.resolve(env.getBasePath(), targetPath);
    }
    
    let content: string;
    
    if (!hasSource) {
      // @output [file.md] - output full document
      // Get the full document content by formatting all nodes
      try {
        const nodes = env.getNodes();
        const { formatOutput } = await import('../output/formatter');
        content = await formatOutput(nodes, {
          format: 'markdown',
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
    } else {
      // Handle different source types
      switch (sourceType) {
        case 'literal':
          // @output "text content" [file.md]
          const literalResult = await evaluateDataValue(directive.values.source, env);
          content = String(literalResult);
          break;
          
        case 'variable':
          if (directive.subtype === 'outputInvocation') {
            // @output @template(args) [file.md] or @output @command(args) [file.md]
            // This is a parameterized invocation
            const varName = directive.values.source.identifier?.[0]?.content || directive.values.source.identifier;
            const args = directive.values.source.args || [];
            
            // Get the variable
            const variable = env.getVariable(varName);
            
            if (!variable) {
              throw new MlldOutputError(
                `Variable ${varName} not found`,
                directive.location
              );
            }
            
            if (isTextVariable(variable) || variable.type === 'textTemplate') {
              // It's a text template - evaluate it with arguments
              let templateContent: string;
              let templateNodes: any[];
              
              if (variable.type === 'textTemplate') {
                // Parameterized text template - has content nodes instead of value string
                templateNodes = variable.content || [];
              } else {
                // Regular text variable
                templateContent = variable.value;
              }
              
              // Create a child environment for parameter substitution
              const childEnv = env.createChild();
              
              // If the template has parameters, bind them
              if (variable.params && variable.params.length > 0) {
                for (let i = 0; i < variable.params.length && i < args.length; i++) {
                  const paramName = variable.params[i];
                  const argValue = await evaluateDataValue(args[i], env);
                  childEnv.setVariable(paramName, {
                    type: 'text',
                    value: String(argValue)
                  });
                }
              }
              
              // Evaluate the template with the child environment
              if (variable.type === 'textTemplate') {
                // For parameterized templates, evaluate the content nodes
                content = await interpolate(templateNodes, childEnv);
              } else {
                // For regular text variables, interpolate the string
                content = await childEnv.interpolate(templateContent);
              }
              
            } else if (isCommandVariable(variable)) {
              // It's a command - execute it with arguments
              const commandNode = variable.value;
              
              // Create a child environment for parameter substitution
              const childEnv = env.createChild();
              
              // Bind parameters if any
              if (variable.params && variable.params.length > 0) {
                for (let i = 0; i < variable.params.length && i < args.length; i++) {
                  const paramName = variable.params[i];
                  const argValue = await evaluateDataValue(args[i], env);
                  childEnv.setVariable(paramName, {
                    type: 'text',
                    value: String(argValue)
                  });
                }
              }
              
              // Execute the command
              const result = await evaluate(commandNode, childEnv);
              content = String(result.value || '');
              
            } else {
              throw new MlldOutputError(
                `Variable ${varName} is not a template or command`,
                directive.location
              );
            }
          } else {
            // @output @variable [file.md] - simple variable reference
            // The source can be either an object with identifier array or a direct node
            let varName: string;
            
            // Handle different source structures
            if (directive.values.source.identifier) {
              // Standard structure from grammar
              varName = directive.values.source.identifier[0]?.content || directive.values.source.identifier;
            } else if (Array.isArray(directive.values.source) && directive.values.source[0]?.type === 'VariableReference') {
              // Structure from @when action
              varName = directive.values.source[0].identifier;
            } else {
              throw new MlldOutputError(
                'Invalid source structure for variable output',
                directive.location
              );
            }
            
            const variable = env.getVariable(varName);
            
            if (!variable) {
              throw new MlldOutputError(
                `Variable ${varName} not found`,
                directive.location
              );
            }
            
            // Get the variable value based on type
            let value: any;
            
            if (isTextVariable(variable)) {
              value = variable.value;
            } else if ('value' in variable) {
              value = variable.value;
            } else {
              throw new MlldOutputError(
                `Cannot output variable ${varName} - unknown variable type`,
                directive.location
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
                  const index = field.index;
                  if (Array.isArray(value)) {
                    value = value[index];
                  } else {
                    throw new MlldOutputError(
                      `Cannot index non-array value with [${index}]`,
                      directive.location
                    );
                  }
                } else if (field.type === 'field' || field.type === 'dot') {
                  const fieldName = field.value || field.name;
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
            
            // Convert value to string
            if (typeof value === 'string') {
              content = value;
            } else if (typeof value === 'object') {
              // For objects/arrays, convert to JSON
              content = JSON.stringify(value, null, 2);
            } else {
              content = String(value || '');
            }
          }
          break;
          
        case 'command':
          // @output @run @command [file.md]
          // Execute the command reference
          const cmdName = directive.values.source.identifier[0].content;
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
              cmdChildEnv.setVariable(paramName, {
                type: 'text',
                value: String(argValue)
              });
            }
          }
          
          // Execute the command
          const cmdResult = await evaluate(cmdVariable.value, cmdChildEnv);
          content = String(cmdResult.value || '');
          break;
          
        default:
          throw new MlldOutputError(
            `Unknown source type: ${sourceType}`,
            directive.location
          );
      }
    }
    
    // Write the file using the environment's file system
    const fileSystem = (env as any).fileSystem;
    if (!fileSystem) {
      throw new MlldOutputError(
        'File system not available',
        directive.location
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
        `Failed to write output file: ${error.message}`,
        directive.location
      );
    }
    throw error;
  }
}