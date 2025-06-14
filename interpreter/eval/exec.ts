import type { DirectiveNode, TextNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { ExecutableDefinition, CommandExecutable, CommandRefExecutable, CodeExecutable, TemplateExecutable, SectionExecutable, ResolverExecutable } from '@core/types/executable';
import { interpolate } from '../core/interpreter';
import { createExecutableVariable } from '@core/types/executable';
import { astLocationToSourceLocation } from '@core/types';

/**
 * Extract parameter names from the params array.
 * 
 * TODO: Remove workaround when issue #50 is fixed.
 * The grammar currently returns VariableReference nodes for params,
 * but they should be simple strings or Parameter nodes.
 */
function extractParamNames(params: any[]): string[] {
  return params.map(p => {
    // Once fixed, this should just be: return p; (if params are strings)
    // or: return p.name; (if params are Parameter nodes)
    if (typeof p === 'string') {
      return p;
    } else if (p.type === 'VariableReference') {
      // Current workaround for grammar issue #50
      return p.identifier;
    } else if (p.type === 'Parameter') {
      // Future-proofing for when grammar is fixed
      return p.name;
    }
    return '';
  }).filter(Boolean);
}

/**
 * Evaluate @exec directives.
 * Defines executable commands/code but doesn't run them.
 * 
 * Ported from ExecDirectiveHandler.
 */
export async function evaluateExec(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  // Handle environment declaration first
  if (directive.subtype === 'environment') {
    // Handle @exec js = { ... }
    const identifierNodes = directive.values?.identifier;
    if (!identifierNodes || !Array.isArray(identifierNodes) || identifierNodes.length === 0) {
      throw new Error('Exec environment directive missing language identifier');
    }
    
    const identifierNode = identifierNodes[0];
    let language: string;
    
    if (identifierNode.type === 'Text' && 'content' in identifierNode) {
      language = (identifierNode as TextNode).content;
    } else {
      throw new Error('Exec environment language must be a simple string');
    }
    
    const envRefs = directive.values?.environment || [];
    
    // Collect functions to inject
    const shadowFunctions = new Map<string, any>();
    
    for (const ref of envRefs) {
      const funcName = ref.identifier;
      const funcVar = env.getVariable(funcName);
      
      if (!funcVar || funcVar.type !== 'executable') {
        throw new Error(`${funcName} is not a defined exec function`);
      }
      
      // Create wrapper function that calls the mlld exec
      const wrapper = createExecWrapper(funcName, funcVar, env);
      shadowFunctions.set(funcName, wrapper);
    }
    
    
    // Store in environment
    env.setShadowEnv(language, shadowFunctions);
    
    return {
      value: null,
      env
    };
  }
  
  // Extract identifier - this is a command name, not content to interpolate
  const identifierNodes = directive.values?.identifier;
  if (!identifierNodes || !Array.isArray(identifierNodes) || identifierNodes.length === 0) {
    throw new Error('Exec directive missing identifier');
  }
  
  // For exec directives, extract the command name
  const identifierNode = identifierNodes[0];
  let identifier: string;
  
  if (identifierNode.type === 'Text' && 'content' in identifierNode) {
    // eslint-disable-next-line mlld/no-ast-string-manipulation
    identifier = (identifierNode as TextNode).content;
  } else if (identifierNode.type === 'VariableReference' && 'identifier' in identifierNode) {
    identifier = (identifierNode as any).identifier;
  } else {
    throw new Error('Exec directive identifier must be a simple command name');
  }
  
  let executableDef: ExecutableDefinition;
  
  if (directive.subtype === 'execCommand') {
    // Check if this is a command reference
    const commandRef = directive.values?.commandRef;
    if (commandRef) {
      // This is a reference to another exec command
      const refName = await interpolate(commandRef, env);
      const args = directive.values?.args || [];
      
      // Get parameter names if any
      const params = directive.values?.params || [];
      const paramNames = extractParamNames(params);
      
      // Store the reference definition
      executableDef = {
        type: 'commandRef',
        commandRef: refName,
        commandArgs: args,
        paramNames,
        sourceDirective: 'exec'
      } satisfies CommandRefExecutable;
    } else {
      // Handle regular command definition
      const commandNodes = directive.values?.command;
      if (!commandNodes) {
        throw new Error('Exec command directive missing command');
      }
      
      // Command template is properly parsed with variable interpolation
      
      // Get parameter names if any
      const params = directive.values?.params || [];
      const paramNames = extractParamNames(params);
      
      // Store the command template (not interpolated yet)
      executableDef = {
        type: 'command',
        commandTemplate: commandNodes,
        paramNames,
        sourceDirective: 'exec'
      } satisfies CommandExecutable;
    }
    
  } else if (directive.subtype === 'execCode') {
    // Handle code definition
    const codeNodes = directive.values?.code;
    if (!codeNodes) {
      throw new Error('Exec code directive missing code');
    }
    
    // Get parameter names if any
    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);
    
    // Language is stored in meta, not raw
    const language = directive.meta?.language || 'javascript';
    
    // Store the code template (not interpolated yet)
    executableDef = {
      type: 'code',
      codeTemplate: codeNodes,
      language,
      paramNames,
      sourceDirective: 'exec'
    } satisfies CodeExecutable;
    
  } else if (directive.subtype === 'execResolver') {
    // Handle resolver executable: @exec name(params) = @resolver/path { @payload }
    const resolverNodes = directive.values?.resolver;
    if (!resolverNodes) {
      throw new Error('Exec resolver directive missing resolver path');
    }
    
    // Get the resolver path (it's a literal string, not interpolated)
    const resolverPath = await interpolate(resolverNodes, env);
    
    // Get parameter names if any
    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);
    
    // Get payload nodes if present
    const payloadNodes = directive.values?.payload;
    
    // Special case: If resolver is "run", this is likely a grammar parsing issue
    // where "@exec name() = @run [command]" was parsed as execResolver instead of execCommand
    if (resolverPath === 'run') {
      // Look for command content immediately following in the AST
      // This is a workaround for a grammar issue
      throw new Error('Grammar parsing issue: @exec with @run should be parsed as execCommand, not execResolver');
    }
    
    // Create resolver executable definition
    executableDef = {
      type: 'resolver',
      resolverPath,
      payloadTemplate: payloadNodes,
      paramNames,
      sourceDirective: 'exec'
    } satisfies ResolverExecutable;
    
  } else if (directive.subtype === 'execTemplate') {
    // Handle template exec: @exec name(params) = [[template]]
    const templateNodes = directive.values?.template;
    if (!templateNodes) {
      throw new Error('Exec template directive missing template');
    }
    
    // Get parameter names if any
    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);
    
    // Create template executable definition
    executableDef = {
      type: 'template',
      template: templateNodes,
      paramNames,
      sourceDirective: 'exec'
    } satisfies TemplateExecutable;
    
  } else if (directive.subtype === 'execSection') {
    // Handle section exec: @exec name(file, section) = [@file # @section]
    const pathNodes = directive.values?.path;
    const sectionNodes = directive.values?.section;
    if (!pathNodes || !sectionNodes) {
      throw new Error('Exec section directive missing path or section');
    }
    
    // Get parameter names if any
    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);
    
    // Get rename nodes if present
    const renameNodes = directive.values?.rename;
    
    // Create section executable definition
    executableDef = {
      type: 'section',
      pathTemplate: pathNodes,
      sectionTemplate: sectionNodes,
      renameTemplate: renameNodes,
      paramNames,
      sourceDirective: 'exec'
    } satisfies SectionExecutable;
    
  } else {
    throw new Error(`Unsupported exec subtype: ${directive.subtype}`);
  }
  
  // Create and store the executable variable
  const variable = createExecutableVariable(identifier, executableDef, {
    definedAt: astLocationToSourceLocation(directive.location, env.getCurrentFilePath())
  });
  env.setVariable(identifier, variable);
  
  // Return the executable definition (no output for variable definitions)
  return { value: executableDef, env };
}

/**
 * Create a wrapper function that bridges JS function calls to mlld exec invocations
 */
function createExecWrapper(
  execName: string, 
  execVar: { type: 'executable'; value: ExecutableDefinition },
  env: Environment
): Function {
  return async function(...args: any[]) {
    // Get the executable definition
    const definition = execVar.value;
    
    // Get parameter names from the definition
    const params = definition.paramNames || [];
    
    // Create a child environment for parameter substitution
    const execEnv = env.createChild();
    
    // Bind arguments to parameters
    for (let i = 0; i < params.length; i++) {
      const paramName = params[i];
      const argValue = args[i];
      if (argValue !== undefined) {
        execEnv.setVariable(paramName, {
          type: 'text',
          value: argValue,
          nodeId: '',
          location: { line: 0, column: 0 }
        });
      }
    }
    
    let result: string;
    
    if (definition.type === 'command') {
      // Execute command with interpolated template
      const commandTemplate = definition.commandTemplate;
      if (!commandTemplate) {
        throw new Error(`Command ${execName} has no command template`);
      }
      
      // Interpolate the command template with parameters
      const command = await interpolate(commandTemplate, execEnv);
      
      // Build environment variables from parameters for shell execution
      const envVars: Record<string, string> = {};
      for (let i = 0; i < params.length; i++) {
        const paramName = params[i];
        const argValue = args[i];
        if (argValue !== undefined) {
          envVars[paramName] = String(argValue);
        }
      }
      
      // Execute the command with environment variables
      result = await execEnv.executeCommand(command, { env: envVars });
    } else if (definition.type === 'code') {
      // Execute code with interpolated template
      const codeTemplate = definition.codeTemplate;
      if (!codeTemplate) {
        throw new Error(`Code command ${execName} has no code template`);
      }
      
      // Interpolate the code template with parameters
      const code = await interpolate(codeTemplate, execEnv);
      
      // Build params object for code execution
      const codeParams: Record<string, any> = {};
      for (let i = 0; i < params.length; i++) {
        const paramName = params[i];
        let argValue = args[i];
        if (argValue !== undefined) {
          // Ensure we await any promises in arguments
          argValue = argValue instanceof Promise ? await argValue : argValue;
          
          // Try to parse numeric values
          if (typeof argValue === 'string') {
            const numValue = Number(argValue);
            if (!isNaN(numValue) && argValue.trim() !== '') {
              // If it's a valid number, use the numeric value
              argValue = numValue;
            }
          }
          
          codeParams[paramName] = argValue;
        }
      }
      
      // Debug logging
      // Note: Don't use console.log in exec functions as it's captured
      // if (process.env.MLLD_DEBUG) {
      //   console.log(`Executing ${execName} with:`, { code, params: codeParams });
      // }
      // Execute the code with parameters
      result = await execEnv.executeCode(
        code,
        definition.language || 'javascript',
        codeParams
      );
    } else if (definition.type === 'template') {
      // Execute template with interpolated content
      const templateNodes = definition.template;
      if (!templateNodes) {
        throw new Error(`Template ${execName} has no template content`);
      }
      
      // Interpolate the template with parameters
      result = await interpolate(templateNodes, execEnv);
    } else if (definition.type === 'section') {
      // Extract section from file
      throw new Error(`Section executables cannot be invoked from shadow environments yet`);
    } else if (definition.type === 'resolver') {
      // Invoke resolver
      throw new Error(`Resolver executables cannot be invoked from shadow environments yet`);
    } else if (definition.type === 'commandRef') {
      // Handle command references
      throw new Error(`Command reference executables cannot be invoked from shadow environments yet`);
    } else {
      throw new Error(`Unknown command type: ${definition.type}`);
    }
    
    // Try to parse result as JSON for better JS integration
    try {
      return JSON.parse(result);
    } catch {
      return result; // Return as string if not JSON
    }
  };
}