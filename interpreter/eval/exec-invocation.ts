import type { ExecInvocation, WithClause } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { ExecutableDefinition } from '@core/types/executable';
import { isCommandExecutable, isCodeExecutable, isTemplateExecutable, isCommandRefExecutable, isSectionExecutable, isResolverExecutable } from '@core/types/executable';
import { interpolate, resolveVariableValue } from '../core/interpreter';
import { applyWithClause } from './with-clause';
import { MlldInterpreterError } from '@core/errors';
import { extractSection } from './show';

/**
 * Evaluate an ExecInvocation node
 * This executes a previously defined exec command with arguments and optional tail modifiers
 */
export async function evaluateExecInvocation(
  node: ExecInvocation,
  env: Environment
): Promise<EvalResult> {
  // Get the command name from the command reference
  let commandName: string;
  
  // Handle different command reference structures
  if (typeof node.commandRef.identifier === 'string') {
    commandName = node.commandRef.identifier;
  } else if (Array.isArray(node.commandRef.identifier) && node.commandRef.identifier.length > 0) {
    // Extract from array of nodes
    const identifierNode = node.commandRef.identifier[0];
    if (identifierNode.type === 'Text' && identifierNode.content) {
      commandName = identifierNode.content;
    } else {
      commandName = node.commandRef.name || '';
    }
  } else {
    commandName = node.commandRef.name || '';
  }
  
  if (!commandName) {
    throw new MlldInterpreterError('ExecInvocation has no command identifier');
  }
  
  // Look up the command in the environment
  const variable = env.getVariable(commandName);
  if (!variable) {
    throw new MlldInterpreterError(`Command not found: ${commandName}`);
  }
  
  // Ensure it's an executable variable
  if (variable.type !== 'executable') {
    throw new MlldInterpreterError(`Variable ${commandName} is not executable (type: ${variable.type})`);
  }
  
  // Special handling for built-in transformers
  if (variable.metadata?.isBuiltinTransformer && variable.metadata?.transformerImplementation) {
    // Get command arguments from the node
    const args = node.commandRef.args || [];
    
    // Evaluate the first argument to get the input value
    let inputValue = '';
    if (args.length > 0) {
      const arg = args[0];
      if (typeof arg === 'string') {
        inputValue = arg;
      } else if (arg && typeof arg === 'object') {
        inputValue = await interpolate([arg], env);
      } else {
        inputValue = String(arg);
      }
    }
    
    // Call the transformer implementation directly
    const result = await variable.metadata.transformerImplementation(inputValue);
    
    // Apply withClause transformations if present
    if (node.withClause) {
      return applyWithClause(String(result), node.withClause, env);
    }
    
    return {
      value: String(result),
      env,
      stdout: String(result),
      stderr: '',
      exitCode: 0
    };
  }
  
  const definition = variable.value as ExecutableDefinition;
  
  // Create a child environment for parameter substitution
  const execEnv = env.createChild();
  
  // Handle command arguments
  const args = node.commandRef.args || [];
  const params = definition.paramNames || [];
  
  // Evaluate arguments to get their actual values
  const evaluatedArgs: string[] = [];
  for (const arg of args) {
    if (typeof arg === 'string') {
      evaluatedArgs.push(arg);
    } else if (arg && typeof arg === 'object') {
      // Check if this is a nested ExecInvocation
      if (arg.type === 'ExecInvocation') {
        // Recursively evaluate the nested function call
        const nestedResult = await evaluateExecInvocation(arg, env);
        // Convert result to string appropriately
        const resultValue = nestedResult.value;
        let stringValue: string;
        if (typeof resultValue === 'string') {
          stringValue = resultValue;
        } else if (resultValue === null || resultValue === undefined) {
          stringValue = String(resultValue);
        } else if (typeof resultValue === 'object') {
          // For objects and arrays, use JSON.stringify
          stringValue = JSON.stringify(resultValue);
        } else {
          stringValue = String(resultValue);
        }
        evaluatedArgs.push(stringValue);
      } else if (arg.type === 'VariableReference') {
        // Handle variable references directly
        const varRef = arg as any;
        const variable = env.getVariable(varRef.identifier);
        if (!variable) {
          throw new Error(`Variable not found: ${varRef.identifier}`);
        }
        
        // Resolve the variable value
        const value = await resolveVariableValue(variable, env);
        
        // Apply field access if present
        let finalValue = value;
        if (varRef.fields && varRef.fields.length > 0) {
          const { accessField } = await import('../utils/field-access');
          finalValue = await accessField(value, varRef.fields, varRef.identifier);
        }
        
        // Convert to string appropriately
        let stringValue: string;
        if (typeof finalValue === 'string') {
          stringValue = finalValue;
        } else if (finalValue === null || finalValue === undefined) {
          stringValue = String(finalValue);
        } else if (typeof finalValue === 'object') {
          // For objects and arrays, use JSON.stringify
          stringValue = JSON.stringify(finalValue);
        } else {
          stringValue = String(finalValue);
        }
        evaluatedArgs.push(stringValue);
      } else {
        // Otherwise interpolate as usual
        const evaluated = await interpolate([arg], env);
        evaluatedArgs.push(evaluated);
      }
    } else {
      evaluatedArgs.push(String(arg));
    }
  }
  
  // Bind evaluated arguments to parameters
  for (let i = 0; i < params.length; i++) {
    const paramName = params[i];
    const argValue = evaluatedArgs[i];
    
    if (argValue !== undefined) {
      execEnv.setVariable(paramName, {
        type: 'text',
        name: paramName,
        value: argValue,
        metadata: {
          isSystem: true, // Mark as system variable to bypass reserved name check
          isParameter: true
        }
      });
    }
  }
  
  let result: string;
  
  // Handle template executables
  if (isTemplateExecutable(definition)) {
    // Interpolate the template with the bound parameters
    result = await interpolate(definition.template, execEnv);
  }
  // Handle command executables
  else if (isCommandExecutable(definition)) {
    // Interpolate the command template with parameters
    const command = await interpolate(definition.commandTemplate, execEnv);
    
    // Build environment variables from parameters for shell execution
    const envVars: Record<string, string> = {};
    for (let i = 0; i < params.length; i++) {
      const paramName = params[i];
      const argValue = evaluatedArgs[i];
      if (argValue !== undefined) {
        envVars[paramName] = String(argValue);
      }
    }
    
    // Execute the command with environment variables
    result = await execEnv.executeCommand(command, { env: envVars });
  }
  // Handle code executables
  else if (isCodeExecutable(definition)) {
    // Interpolate the code template with parameters
    const code = await interpolate(definition.codeTemplate, execEnv);
    
    // Build params object for code execution
    const codeParams: Record<string, any> = {};
    for (let i = 0; i < params.length; i++) {
      const paramName = params[i];
      const argValue = evaluatedArgs[i];
      // Always include the parameter, even if undefined
      // This ensures the code can reference all declared parameters
      codeParams[paramName] = argValue;
    }
    
    // Execute the code with parameters
    const codeResult = await execEnv.executeCode(
      code,
      definition.language || 'javascript',
      codeParams
    );
    
    // If the result looks like JSON (from return statement), parse it
    if (typeof codeResult === 'string' && 
        (codeResult.startsWith('"') || codeResult.startsWith('{') || codeResult.startsWith('[') || 
         codeResult === 'null' || codeResult === 'true' || codeResult === 'false' ||
         /^-?\d+(\.\d+)?$/.test(codeResult))) {
      try {
        const parsed = JSON.parse(codeResult);
        // Keep the parsed value as the result
        result = parsed;
      } catch {
        // Not valid JSON, use as-is
        result = codeResult;
      }
    } else {
      result = codeResult;
    }
  }
  // Handle command reference executables
  else if (isCommandRefExecutable(definition)) {
    const refName = definition.commandRef;
    if (!refName) {
      throw new MlldInterpreterError(`Command reference ${commandName} has no target command`);
    }
    
    // Look up the referenced command
    const refCommand = env.getVariable(refName);
    if (!refCommand) {
      throw new MlldInterpreterError(`Referenced command not found: ${refName}`);
    }
    
    // Create a new invocation node for the referenced command
    const refInvocation: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: {
        identifier: refName,
        args: evaluatedArgs.map(arg => ({
          type: 'Text',
          content: arg
        }))
      }
    };
    
    // Recursively evaluate the referenced command
    const refResult = await evaluateExecInvocation(refInvocation, env);
    result = refResult.value as string;
  }
  // Handle section executables
  else if (isSectionExecutable(definition)) {
    // Interpolate the path template to get the file path
    const filePath = await interpolate(definition.pathTemplate, execEnv);
    
    // Interpolate the section template to get the section name
    const sectionName = await interpolate(definition.sectionTemplate, execEnv);
    
    // Read the file content
    const fileContent = await execEnv.readFile(filePath);
    
    // Extract the section using llmxml or fallback to basic extraction
    const llmxmlInstance = env.getLlmxml();
    let sectionContent: string;
    
    try {
      // getSection expects just the title without the # prefix
      const titleWithoutHash = sectionName.replace(/^#+\s*/, '');
      sectionContent = await llmxmlInstance.getSection(fileContent, titleWithoutHash, {
        includeNested: true
      });
    } catch (error) {
      // Fallback to basic extraction if llmxml fails
      sectionContent = extractSection(fileContent, sectionName);
    }
    
    // Handle rename if present
    if (definition.renameTemplate) {
      const newTitle = await interpolate(definition.renameTemplate, execEnv);
      const lines = sectionContent.split('\n');
      if (lines.length > 0 && lines[0].match(/^#+\s/)) {
        const newTitleTrimmed = newTitle.trim();
        const newHeadingMatch = newTitleTrimmed.match(/^(#+)(\s+(.*))?$/);
        
        if (newHeadingMatch) {
          if (!newHeadingMatch[3]) {
            // Just header level
            const originalText = lines[0].replace(/^#+\s*/, '');
            lines[0] = `${newHeadingMatch[1]} ${originalText}`;
          } else {
            // Full replacement
            lines[0] = newTitleTrimmed;
          }
        } else {
          // Just text - keep original level
          const originalLevel = lines[0].match(/^#+/)?.[0] || '#';
          lines[0] = `${originalLevel} ${newTitleTrimmed}`;
        }
        
        sectionContent = lines.join('\n');
      }
    }
    
    result = sectionContent;
  }
  // Handle resolver executables
  else if (isResolverExecutable(definition)) {
    // For resolver executables, we need to construct the full resolver path
    // with parameter interpolation
    let resolverPath = definition.resolverPath;
    
    // Replace parameter placeholders in the resolver path
    for (let i = 0; i < params.length; i++) {
      const paramName = params[i];
      const argValue = evaluatedArgs[i];
      if (argValue !== undefined) {
        // Replace @paramName in the resolver path
        resolverPath = resolverPath.replace(new RegExp(`@${paramName}\\b`, 'g'), argValue);
      }
    }
    
    // Prepare payload if present
    let payload: any = undefined;
    if (definition.payloadTemplate) {
      // Interpolate the payload template
      const payloadStr = await interpolate(definition.payloadTemplate, execEnv);
      try {
        // Try to parse as JSON
        payload = JSON.parse(payloadStr);
      } catch {
        // If not valid JSON, use as string
        payload = payloadStr;
      }
    }
    
    // Invoke the resolver through the ResolverManager
    const resolverManager = env.getResolverManager();
    if (!resolverManager) {
      throw new MlldInterpreterError('Resolver manager not available');
    }
    
    // Resolve the resolver with the appropriate context
    const resolverResult = await resolverManager.resolve(resolverPath, {
      context: 'exec-invocation',
      basePath: env.getBasePath(),
      payload
    });
    
    // Extract content from resolver result
    if (resolverResult && typeof resolverResult === 'object' && 'content' in resolverResult) {
      // ResolverContent interface
      result = resolverResult.content;
    } else if (typeof resolverResult === 'string') {
      result = resolverResult;
    } else if (resolverResult && typeof resolverResult === 'object') {
      // For objects, serialize to JSON
      result = JSON.stringify(resolverResult, null, 2);
    } else {
      result = String(resolverResult);
    }
  } else {
    throw new MlldInterpreterError(`Unknown executable type: ${(definition as any).type}`);
  }
  
  // Apply withClause transformations if present
  if (node.withClause) {
    return applyWithClause(result, node.withClause, env);
  }
  
  return {
    value: result,
    env,
    // For stdout, convert the parsed value back to string for backward compatibility
    // but preserve the actual value in the value field for truthiness checks
    stdout: typeof result === 'string' ? result : String(result),
    stderr: '',
    exitCode: 0
  };
}