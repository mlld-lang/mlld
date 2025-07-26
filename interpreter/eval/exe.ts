import type { DirectiveNode, TextNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { ExecutableDefinition, CommandExecutable, CommandRefExecutable, CodeExecutable, TemplateExecutable, SectionExecutable, ResolverExecutable } from '@core/types/executable';
import { interpolate } from '../core/interpreter';
import { astLocationToSourceLocation } from '@core/types';
import { createExecutableVariable, createSimpleTextVariable, type VariableSource } from '@core/types/variable';
import { ExecParameterConflictError } from '@core/errors/ExecParameterConflictError';
import { resolveShadowEnvironment, mergeShadowFunctions } from './helpers/shadowEnvResolver';
import { isLoadContentResult, isLoadContentResultArray } from '@core/types/load-content';

/**
 * Auto-unwrap LoadContentResult objects to their content property
 * WHY: LoadContentResult objects should behave like their content when passed to JS functions,
 * maintaining consistency with how they work in mlld contexts (interpolation, display, etc).
 * GOTCHA: LoadContentResultArray objects are unwrapped to arrays of content strings.
 * @param value - The value to potentially unwrap
 * @returns The unwrapped content or the original value
 */
function autoUnwrapLoadContent(value: any): any {
  // Handle single LoadContentResult
  if (isLoadContentResult(value)) {
    return value.content;
  }
  
  // Handle LoadContentResultArray - unwrap to array of content strings
  if (isLoadContentResultArray(value)) {
    return value.map(item => item.content);
  }
  
  // Return original value if not a LoadContentResult
  return value;
}

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
 * Check if any parameter names conflict with existing variables.
 * WHY: Parameter names shadow parent variables during execution, so we need to
 * warn users about potential confusion when a parameter has the same name as
 * an existing variable they might expect to access.
 * GOTCHA: This only checks the current environment, not parent scopes. Parameters
 * CAN shadow parent variables - this is by design for proper scoping.
 * CONTEXT: Called before creating executable definitions to provide early feedback
 * about naming conflicts.
 * Throws ExecParameterConflictError if a conflict is found.
 */
function checkParameterConflicts(
  paramNames: string[],
  execName: string,
  execLocation: any,
  env: Environment
): void {
  for (const paramName of paramNames) {
    if (env.hasVariable(paramName)) {
      const existingVar = env.getVariable(paramName);
      if (existingVar && existingVar.metadata?.definedAt) {
        throw new ExecParameterConflictError(
          paramName,
          execName,
          existingVar.metadata.definedAt,
          astLocationToSourceLocation(execLocation, env.getCurrentFilePath())
        );
      }
    }
  }
}

/**
 * Evaluate @exec directives.
 * Defines executable commands/code but doesn't run them.
 * 
 * Ported from ExecDirectiveHandler.
 */
export async function evaluateExe(
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
    
    // With improved type consistency, identifierNodes is always VariableReferenceNode[]
    if (identifierNode.type === 'VariableReference' && 'identifier' in identifierNode) {
      language = identifierNode.identifier;
    } else {
      throw new Error('Exec environment language must be a simple string');
    }
    
    const envRefs = directive.values?.environment || [];
    
    // Collect functions to inject
    const shadowFunctions = new Map<string, any>();
    
    // First, set up the shadow environment so it's available for capture
    for (const ref of envRefs) {
      const funcName = ref.identifier;
      const funcVar = env.getVariable(funcName);
      
      if (!funcVar || funcVar.type !== 'executable') {
        throw new Error(`${funcName} is not a defined exec function`);
      }
      
      // Create wrapper function that calls the mlld exec
      const wrapper = createExecWrapper(funcName, funcVar, env);
      
      // For JavaScript shadow functions, create a synchronous wrapper when possible
      let effectiveWrapper = wrapper;
      if (language === 'js' || language === 'javascript') {
        // Only create sync wrapper for JavaScript code (not commands or other types)
        if (funcVar.value.type === 'code' && 
            (funcVar.value.language === 'javascript' || funcVar.value.language === 'js')) {
          // Get the executable definition from metadata
          const execDef = (funcVar.metadata as any)?.executableDef;
          if (execDef && execDef.type === 'code') {
            // NEW: Pass captured shadow envs through the definition
            (execDef as any).capturedShadowEnvs = (funcVar.metadata as any)?.capturedShadowEnvs;
            effectiveWrapper = createSyncJsWrapper(funcName, execDef, env);
          }
        }
      }
      
      // Store the wrapper (sync for JS when possible, async otherwise)
      shadowFunctions.set(funcName, effectiveWrapper);
    }
    
    // Store in environment FIRST
    env.setShadowEnv(language, shadowFunctions);
    
    // NOW retroactively update all the executables in the shadow environment
    // to capture the complete shadow environment (including each other)
    if (env.hasShadowEnvs()) {
      const capturedEnvs = env.captureAllShadowEnvs();
      
      if (process.env.DEBUG_MODULE_EXPORT || process.env.DEBUG_EXEC) {
        console.error('[DEBUG] Retroactively updating shadow env executables with captured envs:', {
          language,
          functions: Array.from(shadowFunctions.keys()),
          capturedEnvs
        });
      }
      
      // Update each function variable's metadata to include the captured shadow envs
      for (const ref of envRefs) {
        const funcName = ref.identifier;
        const funcVar = env.getVariable(funcName);
        
        if (funcVar && funcVar.type === 'executable' && funcVar.metadata) {
          // Update the metadata to include captured shadow environments
          (funcVar.metadata as any).capturedShadowEnvs = capturedEnvs;
          
          // Also update the executableDef if it exists
          const execDef = (funcVar.metadata as any).executableDef;
          if (execDef) {
            (execDef as any).capturedShadowEnvs = capturedEnvs;
          }
        }
      }
    }
    
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
  
  // With improved type consistency, identifierNodes is always VariableReferenceNode[]
  if (identifierNode.type === 'VariableReference' && 'identifier' in identifierNode) {
    identifier = identifierNode.identifier;
  } else {
    throw new Error('Exec directive identifier must be a simple command name');
  }
  
  let executableDef: ExecutableDefinition;
  
  
  if (directive.subtype === 'exeCommand') {
    // Check if this is a command reference
    const commandRef = directive.values?.commandRef;
    if (commandRef) {
      // This is a reference to another exec command
      const refName = await interpolate(commandRef, env);
      const args = directive.values?.args || [];
      
      // Get parameter names if any
      const params = directive.values?.params || [];
      const paramNames = extractParamNames(params);
      
      // Check for parameter conflicts
      checkParameterConflicts(paramNames, identifier, directive.location, env);
      
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
      
      // Check for parameter conflicts
      checkParameterConflicts(paramNames, identifier, directive.location, env);
      
      // Store the command template (not interpolated yet)
      executableDef = {
        type: 'command',
        commandTemplate: commandNodes,
        paramNames,
        sourceDirective: 'exec'
      } satisfies CommandExecutable;
    }
    
  } else if (directive.subtype === 'exeCode') {
    /**
     * Handle code executable definitions
     * WHY: Code executables run language-specific code (JS, Python, etc) with
     * parameter binding and shadow environment access.
     * GOTCHA: The code template is stored as AST nodes for lazy interpolation -
     * parameters are only substituted at execution time, not definition time.
     * CONTEXT: Enables patterns like /exe @transform(data) = js {@data.map(x => x * 2)}
     */
    const codeNodes = directive.values?.code;
    if (!codeNodes) {
      throw new Error('Exec code directive missing code');
    }
    
    // Get parameter names if any
    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);
    
    // Check for parameter conflicts
    checkParameterConflicts(paramNames, identifier, directive.location, env);
    
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
    
  } else if (directive.subtype === 'exeResolver') {
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
    
    // Check for parameter conflicts
    checkParameterConflicts(paramNames, identifier, directive.location, env);
    
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
    
  } else if (directive.subtype === 'exeTemplate') {
    /**
     * Handle template executable definitions
     * WHY: Template executables provide simple text interpolation with parameter
     * substitution, useful for generating formatted output without code execution.
     * GOTCHA: Templates use double square brackets [[...]] syntax and support full
     * mlld interpolation including nested directives.
     * CONTEXT: Common for report generation, formatted messages, and string templates
     * Example: /exe @greeting(name) = [[Hello, @name!]]
     */
    const templateNodes = directive.values?.template;
    if (!templateNodes) {
      throw new Error('Exec template directive missing template');
    }
    
    // Get parameter names if any
    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);
    
    // Check for parameter conflicts
    checkParameterConflicts(paramNames, identifier, directive.location, env);
    
    // Create template executable definition
    executableDef = {
      type: 'template',
      template: templateNodes,
      paramNames,
      sourceDirective: 'exec'
    } satisfies TemplateExecutable;
    
  } else if (directive.subtype === 'exeSection') {
    // Handle section exec: @exec name(file, section) = [@file # @section]
    const pathNodes = directive.values?.path;
    const sectionNodes = directive.values?.section;
    if (!pathNodes || !sectionNodes) {
      throw new Error('Exec section directive missing path or section');
    }
    
    // Get parameter names if any
    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);
    
    // Check for parameter conflicts
    checkParameterConflicts(paramNames, identifier, directive.location, env);
    
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
  
  // Create variable source metadata
  const source: VariableSource = {
    directive: 'var', // exe directives create variables in the new system
    syntax: 'code', // Default to code syntax
    hasInterpolation: false,
    isMultiLine: false
  };
  
  // Adjust syntax based on executable type
  if (executableDef.type === 'command' || executableDef.type === 'commandRef') {
    source.syntax = 'command';
  } else if (executableDef.type === 'template') {
    source.syntax = 'template';
  }
  
  // Extract language for code executables
  const language = executableDef.type === 'code' 
    ? (executableDef.language as 'js' | 'node' | 'python' | 'sh' | undefined)
    : undefined;
  
  /**
   * Create the executable variable
   * WHY: Executable variables wrap command/code/template definitions with parameter
   * metadata, enabling them to be invoked like functions with argument binding.
   * GOTCHA: The variable.value.template is set AFTER creation because the executable
   * definition structure varies by type (commandTemplate vs codeTemplate vs template).
   * CONTEXT: These variables are used by /run directives, pipelines, and anywhere
   * a parameterized executable can be invoked.
   */
  const location = astLocationToSourceLocation(directive.location, env.getCurrentFilePath());
  
  // Debug shadow environment capture
  if (process.env.DEBUG_MODULE_EXPORT || process.env.DEBUG_EXEC) {
    console.error(`[DEBUG] Creating executable '${identifier}', shadow envs available:`, env.hasShadowEnvs());
    if (env.hasShadowEnvs()) {
      const captured = env.captureAllShadowEnvs();
      console.error('[DEBUG] Captured shadow environments:', captured);
    }
  }
  
  const variable = createExecutableVariable(
    identifier,
    executableDef.type,
    '', // Template will be filled from executableDef
    executableDef.paramNames || [],
    language,
    source,
    {
      definedAt: location,
      executableDef, // Store the full definition in metadata
      // NEW: Capture shadow environments if they exist
      ...(env.hasShadowEnvs() ? { 
        capturedShadowEnvs: env.captureAllShadowEnvs() 
      } : {})
    }
  );
  
  // Set the actual template/command content
  if (executableDef.type === 'command') {
    variable.value.template = executableDef.commandTemplate;
  } else if (executableDef.type === 'code') {
    variable.value.template = executableDef.codeTemplate;
  } else if (executableDef.type === 'template') {
    variable.value.template = executableDef.template;
  }
  
  env.setVariable(identifier, variable);
  
  // Return the executable definition (no output for variable definitions)
  return { value: executableDef, env };
}

/**
 * Create a synchronous wrapper for JavaScript shadow functions
 * This allows simple JS expressions to be called without await
 */
function createSyncJsWrapper(
  funcName: string,
  definition: CodeExecutable,
  env: Environment
): Function {
  return function(...args: any[]) {
    // Get parameter names from the definition
    const params = definition.paramNames || [];
    
    // Create a child environment for parameter substitution
    const execEnv = env.createChild();
    
    // Build params object for code execution
    const codeParams: Record<string, any> = {};
    for (let i = 0; i < params.length; i++) {
      const paramName = params[i];
      let argValue = args[i];
      
      // Always add the parameter, even if undefined
      // This ensures JS code can reference all declared parameters
      if (argValue !== undefined) {
        // Auto-unwrap LoadContentResult objects
        argValue = autoUnwrapLoadContent(argValue);
        
        // Try to parse numeric values (same logic as async wrapper)
        if (typeof argValue === 'string') {
          const numValue = Number(argValue);
          if (!isNaN(numValue) && argValue.trim() !== '') {
            // If it's a valid number, use the numeric value
            argValue = numValue;
          }
        }
      }
      
      // Set the parameter value (will be undefined if not provided)
      codeParams[paramName] = argValue;
    }
    
    // Get the code template
    const codeTemplate = definition.codeTemplate;
    if (!codeTemplate) {
      throw new Error(`Function ${funcName} has no code template`);
    }
    
    // For synchronous execution, we need to evaluate the code directly
    // Since this is for 'js' (not 'node'), we can use the in-process execution
    let code: string;
    try {
      // Simple interpolation for Text nodes
      code = codeTemplate.map(node => {
        if (node.type === 'Text') {
          return node.content;
        }
        // For now, only support simple text templates
        throw new Error(`Synchronous shadow functions only support simple code templates`);
      }).join('');
    } catch (error) {
      throw new Error(`Cannot create synchronous wrapper for ${funcName}: ${error.message}`);
    }
    
    // OLD CODE TO REPLACE:
    // const shadowEnv = env.getShadowEnv('js') || env.getShadowEnv('javascript');
    
    // NEW CODE:
    // Resolve shadow environment with capture support
    const capturedEnvs = (definition as any).capturedShadowEnvs;
    const shadowEnv = resolveShadowEnvironment('js', capturedEnvs, env);
    
    // OLD CODE TO REPLACE:
    // const shadowFunctions: Record<string, any> = {};
    // const shadowNames: string[] = [];
    // const shadowValues: any[] = [];
    // 
    // if (shadowEnv) {
    //   for (const [name, func] of shadowEnv) {
    //     if (!codeParams[name]) { // Don't override parameters
    //       shadowFunctions[name] = func;
    //       shadowNames.push(name);
    //       shadowValues.push(func);
    //     }
    //   }
    // }
    
    // NEW CODE:
    // Merge shadow functions (avoiding parameter conflicts)
    const paramSet = new Set(Object.keys(codeParams));
    const { names: shadowNames, values: shadowValues } = 
      mergeShadowFunctions(shadowEnv, undefined, paramSet);
    
    // Rest of the function remains the same...
    const allParamNames = [...Object.keys(codeParams), ...shadowNames];
    const allParamValues = [...Object.values(codeParams), ...shadowValues];
    
    // Build function body
    let functionBody = code;
    const trimmedCode = code.trim();
    
    // Check if this is an expression that should be returned
    const isExpression = (
      (!code.includes('return') && !code.includes(';')) ||
      (trimmedCode.startsWith('(') && trimmedCode.endsWith(')'))
    );
    
    if (isExpression) {
      functionBody = `return (${functionBody})`;
    }
    
    // Create and execute the function with shadow functions in scope
    const fn = new Function(...allParamNames, functionBody);
    return fn(...allParamValues);
  };
}

/**
 * Create a wrapper function that bridges JS function calls to mlld exec invocations
 */
function createExecWrapper(
  execName: string, 
  execVar: ExecutableVariable,
  env: Environment
): Function {
  return async function(...args: any[]) {
    // Get the executable definition from metadata
    const definition = (execVar.metadata as any)?.executableDef;
    if (!definition) {
      throw new Error(`Executable ${execName} has no definition in metadata`);
    }
    
    // Get parameter names from the definition
    const params = definition.paramNames || [];
    
    // Create a child environment for parameter substitution
    const execEnv = env.createChild();
    
    // Bind arguments to parameters
    for (let i = 0; i < params.length; i++) {
      const paramName = params[i];
      const argValue = args[i];
      if (argValue !== undefined) {
        // For template interpolation, we need string representation
        const stringValue = typeof argValue === 'string' ? argValue :
                           argValue === null || argValue === undefined ? String(argValue) :
                           typeof argValue === 'object' ? JSON.stringify(argValue) :
                           String(argValue);
        
        const paramVar = createSimpleTextVariable(
          paramName,
          stringValue,
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
        if (process.env.DEBUG_PARAM_EXEC) {
          console.error(`[DEBUG] Setting parameter '${paramName}' in exec environment`);
        }
        execEnv.setParameterVariable(paramName, paramVar);
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
        
        // Always add the parameter, even if undefined
        // This ensures Node.js code can reference all declared parameters
        if (argValue !== undefined) {
          // Ensure we await any promises in arguments
          argValue = argValue instanceof Promise ? await argValue : argValue;
          
          // Auto-unwrap LoadContentResult objects
          argValue = autoUnwrapLoadContent(argValue);
          
          // Try to parse numeric values
          if (typeof argValue === 'string') {
            const numValue = Number(argValue);
            if (!isNaN(numValue) && argValue.trim() !== '') {
              // If it's a valid number, use the numeric value
              argValue = numValue;
            }
          }
        }
        
        // Set the parameter value (will be undefined if not provided)
        codeParams[paramName] = argValue;
      }
      
      // NEW CODE: Pass captured shadow environments to executors
      // Get captured shadow environments from executable metadata
      const capturedEnvs = (execVar.metadata as any)?.capturedShadowEnvs;
      
      if (process.env.DEBUG_MODULE_EXPORT || process.env.DEBUG_EXEC) {
        console.error('[DEBUG] createExecWrapper passing shadow envs:', {
          execName,
          hasCapturedEnvs: !!capturedEnvs,
          capturedEnvs,
          language: definition.language
        });
      }
      
      // For JS/Node execution, pass captured envs through params
      // Using __ prefix following mlld's internal property pattern
      if (capturedEnvs && (definition.language === 'js' || definition.language === 'javascript' || 
                           definition.language === 'node' || definition.language === 'nodejs')) {
        (codeParams as any).__capturedShadowEnvs = capturedEnvs;
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