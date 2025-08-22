import type { ExecInvocation, WithClause } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { ExecutableDefinition } from '@core/types/executable';
import type { Variable } from '@core/types/variable';
import type { IEvaluator } from '@core/universal-context';

import { USE_UNIVERSAL_CONTEXT } from '@core/feature-flags';
import { ExecVisitor, ExecutableNode } from './visitor';
import { createExecutableNode } from './nodes';
import { CommandResolver } from './helpers/command-resolver';
import { VariableFactory } from './helpers/variable-factory';
import { ShadowEnvironmentManager } from './helpers/shadow-manager';
import { globalMetadataShelf } from './helpers/metadata-shelf';
import { ExecContextManager } from './context-manager';

import { MlldInterpreterError } from '@core/errors';
import { logger } from '@core/utils/logger';
import { applyWithClause } from '../with-clause';
import { interpolate } from '@interpreter/core/interpreter';
import { InterpolationContext } from '@interpreter/core/interpolation-context';
import { prepareValueForShadow } from '@interpreter/env/variable-proxy';
import { isRetrySignal } from '../retry-helper';
import { 
  isTemplateExecutable, 
  isCodeExecutable, 
  isCommandExecutable,
  isCommandRefExecutable,
  isSectionExecutable,
  isResolverExecutable
} from '@core/types/executable';
import { AutoUnwrapManager } from '../auto-unwrap-manager';
import { isLoadContentResultArray } from '@core/types/load-content';

/**
 * Evaluates exec invocations using the Visitor pattern
 * 
 * Refactored from Strategy pattern to Visitor pattern to enable natural
 * recursion for CommandRef nodes without circular imports.
 * 
 * KEY FEATURES:
 * - Visitor pattern with double dispatch
 * - Natural recursion for CommandRef (THE FIX!)
 * - Preserves all helper utilities from previous refactor
 * - Universal context support for retry capabilities
 * - Effect-aware execution (exec returns values, directives emit effects)
 * 
 * ARCHITECTURE: Implements ExecVisitor interface with one method per execution type
 */
export class ExecInvocationEvaluator implements ExecVisitor {
  // Keep all existing helpers - they're well-designed!
  private contextManager: ExecContextManager;
  private commandResolver: CommandResolver;
  private variableFactory: VariableFactory;
  private shadowManager: ShadowEnvironmentManager;
  // AutoUnwrapManager is used statically, no instance needed
  private currentCapturedShadowEnvs?: any; // Temporary storage for captured shadow envs
  private currentBoundParams?: string[]; // Track current function's bound parameters
  private currentEvaluatedArgs?: any[]; // Track evaluated args for CommandRef passthrough
  
  constructor() {
    this.contextManager = new ExecContextManager();
    this.commandResolver = new CommandResolver();
    this.variableFactory = new VariableFactory();
    this.shadowManager = new ShadowEnvironmentManager();
  }
  
  /**
   * Main evaluation entry point - orchestrates the visitor pattern
   */
  async evaluate(
    node: ExecInvocation,
    env: Environment,
    evaluator?: IEvaluator | any  // Allow context as third param or evaluator
  ): Promise<EvalResult> {
    try {
      // Debug logging
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[ExecInvocationEvaluator] Entry:', {
          hasCommandRef: !!node.commandRef,
          hasWithClause: !!node.withClause,
          hasPipeline: !!(node.withClause?.pipeline)
        });
      }
      
      // 1. Extract and resolve command
      const { commandName, args, objectReference } = 
        CommandResolver.extractCommandInfo(node);
      
      if (process.env.DEBUG_EXEC && args.length > 0) {
        console.error('[evaluate] Raw args:', JSON.stringify(args, null, 2));
      }
      
      const commandVariable = await CommandResolver.resolveCommand(
        commandName,
        objectReference,
        env
      );
      
      // 2. Handle special cases (@typeof needs Variable metadata)
      const specialResult = await this.handleSpecialCases(
        commandVariable,
        args,
        env
      );
      if (specialResult) return specialResult;
      
      // 3. Extract executable and convert to visitable node
      if (process.env.DEBUG_EXEC) {
        console.error('[evaluate] Extracting executable definition from:', {
          variableName: commandVariable.name,
          variableType: commandVariable.type
        });
      }
      const executableDef = this.extractExecutableDefinition(commandVariable);
      if (process.env.DEBUG_EXEC) {
        console.error('[evaluate] Extracted executable:', {
          type: executableDef.type,
          hasParamNames: !!(executableDef as any).paramNames
        });
      }
      const executableNode = createExecutableNode(executableDef);
      
      // 4. Create execution context early for pipeline variables
      // Handle both old (evaluator) and new (context) parameter formats
      let parentContext: any;
      let actualEvaluator: IEvaluator | undefined;
      
      // Check if third param is a context object or evaluator
      if (evaluator && typeof evaluator === 'object') {
        if ('evaluate' in evaluator && typeof evaluator.evaluate === 'function') {
          // It's an evaluator
          actualEvaluator = evaluator as IEvaluator;
          parentContext = evaluator.getContext?.();
        } else if ('stage' in evaluator || 'try' in evaluator || 'isPipeline' in evaluator) {
          // It's a context object
          parentContext = evaluator;
          // No evaluator in this case
        }
      }
      
      const execContext = this.contextManager.createExecContext(
        parentContext,
        executableDef,
        commandName
      );
      
      // 4a. If pipeline is present, create pipeline variables BEFORE evaluating arguments
      // This allows arguments to reference @p or @pipeline
      let argEvalEnv = env;
      if (node.withClause?.pipeline && execContext) {
        argEvalEnv = env.createChild();
        this.contextManager.createPipelineVariables(execContext, argEvalEnv);
      }
      
      // 4b. Process arguments with pipeline-aware environment
      if (process.env.DEBUG_EXEC) {
        console.error('[evaluate] Processing arguments, count:', args.length);
      }
      const processedArgs = await this.processArguments(args, argEvalEnv);
      if (process.env.DEBUG_EXEC) {
        console.error('[evaluate] Processed args:', processedArgs);
      }
      
      // Store evaluated args for CommandRef passthrough
      this.currentEvaluatedArgs = processedArgs;
      
      if (process.env.DEBUG_EXEC) {
        console.error('[evaluate] Creating execution environment...');
      }
      const execEnv = await this.createExecutionEnvironment(
        env,
        commandVariable,
        executableDef,
        processedArgs,
        node.withClause,
        execContext
      );
      if (process.env.DEBUG_EXEC) {
        console.error('[evaluate] Created exec env, has pipeline:', !!(node.withClause?.pipeline?.length));
      }
      
      // 5. Handle pipeline if present (with universal context)
      // Check both invocation pipeline AND definition pipeline (for exec definitions)
      const invocationPipeline = node.withClause?.pipeline;
      const definitionPipeline = (executableDef as any).withClause?.pipeline;
      
      if (process.env.MLLD_DEBUG === 'true' || process.env.DEBUG_EXEC) {
        console.error('[evaluate] Pipeline detection:', {
          hasInvocationPipeline: !!invocationPipeline,
          invocationPipelineLength: invocationPipeline?.length,
          hasDefinitionPipeline: !!definitionPipeline,
          definitionPipelineLength: definitionPipeline?.length,
          executableDefType: executableDef?.type
        });
      }
      
      if ((invocationPipeline?.length > 0) || (definitionPipeline?.length > 0)) {
        // Use invocation pipeline if present, otherwise use definition pipeline
        const pipelineToUse = invocationPipeline || definitionPipeline;
        
        // Create a modified node with the pipeline
        const nodeWithPipeline = {
          ...node,
          withClause: {
            ...node.withClause,
            pipeline: pipelineToUse
          }
        };
        
        return await this.executeWithPipeline(
          nodeWithPipeline,
          executableNode,
          execEnv,
          processedArgs,
          execContext,
          actualEvaluator
        );
      }
      
      // 6. Execute the function (NO self-retry - retry only works in pipelines)
      if (process.env.MLLD_DEBUG === 'true' || process.env.DEBUG_EXEC) {
        console.error('[ExecInvocationEvaluator] Executing node:', {
          nodeType: executableDef.type,
          hasParams: (executableDef as any).paramNames?.length > 0,
          paramNames: (executableDef as any).paramNames,
          argCount: args.length
        });
      }
      
      // Pass context to visitor for proper pipeline context propagation
      const result = await executableNode.accept(this, execEnv, parentContext);
      
      if (process.env.MLLD_DEBUG === 'true' || process.env.DEBUG_EXEC) {
        console.error('[ExecInvocationEvaluator] Result:', {
          hasValue: result.value !== undefined,
          valueType: typeof result.value,
          valueLength: typeof result.value === 'string' ? result.value.length : undefined,
          value: result.value,
          isRetry: isRetrySignal(result.value)
        });
      }
      
      // If a retry signal is returned outside of a pipeline, that's an error
      if (isRetrySignal(result.value)) {
        throw new MlldInterpreterError(
          `Function '${commandName}' returned a retry signal, but retry is only supported within pipelines`
        );
      }
      
      // 7. Apply non-pipeline withClause features
      if (node.withClause) {
        return await applyWithClause(result, node.withClause, execEnv);
      }
      
      return result;
      
    } finally {
      // Always clear metadata shelf, captured shadow envs, and bound params after execution
      globalMetadataShelf.clear();
      this.currentCapturedShadowEnvs = undefined;
      this.currentBoundParams = undefined;
    }
  }
  
  // ============================================================================
  // VISITOR METHODS - One per execution type
  // ============================================================================
  
  /**
   * Visit template executable - String interpolation
   */
  async visitTemplate(node: ExecutableDefinition, env: Environment, context?: any): Promise<EvalResult> {
    if (!isTemplateExecutable(node)) {
      throw new Error('Invalid node type for visitTemplate');
    }
    
    if (process.env.DEBUG_EXEC) {
      logger.debug('Executing template', {
        template: node.template?.substring(0, 100),
        hasInterpolation: node.syntaxInfo?.hasInterpolation
      });
    }
    
    // Template nodes need simple interpolation  
    // node.template is already an array of nodes
    if (process.env.DEBUG_EXEC) {
      console.error('[visitTemplate] Environment check:', {
        hasVariables: env.getAllVariables().size > 0,
        variables: Array.from(env.getAllVariables().keys()),
        templateLength: node.template?.length
      });
    }
    const interpolated = await interpolate(node.template || [], env, InterpolationContext.Default);
    
    // Normalize line endings for multi-line templates
    const result = node.syntaxInfo?.isMultiLine 
      ? interpolated.replace(/\r\n/g, '\n')
      : interpolated;
    
    return { value: result, env };
  }
  
  /**
   * Visit code executable - JS/Python/Bash execution with shadow environments
   */
  async visitCode(node: ExecutableDefinition, env: Environment, context?: any): Promise<EvalResult> {
    if (!isCodeExecutable(node)) {
      throw new Error('Invalid node type for visitCode');
    }
    
    const language = node.language?.toLowerCase();
    // CodeExecutable uses codeTemplate, not template
    const codeNodes = (node as any).codeTemplate || [];
    
    if (process.env.DEBUG_EXEC) {
      console.error('[visitCode] Executing code:', {
        language,
        codeNodesLength: codeNodes.length,
        firstNodeType: codeNodes[0]?.type
      });
    }
    
    // Interpolate code nodes to get the actual code string
    const code = await interpolate(codeNodes, env, InterpolationContext.Default);
    
    if (process.env.DEBUG_EXEC) {
      console.error('[visitCode] Executing code:', {
        language,
        code: code.substring(0, 100),
        envVarCount: env.getAllVariables().size
      });
    }
    
    // Handle language-specific execution
    switch (language) {
      case 'javascript':
      case 'js':
        return await this.executeJavaScript(code, env, context);
      
      case 'node':
      case 'nodejs':
        return await this.executeNode(code, env);
      
      case 'python':
      case 'py':
        return await this.executePython(code, env);
      
      case 'bash':
      case 'sh':
        return await this.executeBash(code, env);
      
      default:
        throw new Error(`Unsupported code language: ${language}`);
    }
  }
  
  /**
   * Visit command executable - Shell command execution
   */
  async visitCommand(node: ExecutableDefinition, env: Environment, context?: any): Promise<EvalResult> {
    if (process.env.DEBUG_EXEC) {
      console.error('[visitCommand] Called with node type:', node.type);
    }
    
    if (!isCommandExecutable(node)) {
      throw new Error('Invalid node type for visitCommand');
    }
    
    // CommandExecutable uses commandTemplate, not template
    const commandTemplate = (node as any).commandTemplate || node.template || [];
    
    if (process.env.DEBUG_EXEC) {
      console.error('[visitCommand] Executing command:', {
        templateLength: commandTemplate.length,
        hasInterpolation: node.syntaxInfo?.hasInterpolation,
        firstNode: commandTemplate[0]
      });
    }
    
    // Perform interpolation - command template is an array of nodes
    // Use ShellCommand context for proper escaping of metacharacters
    const command = await interpolate(commandTemplate, env, InterpolationContext.ShellCommand);
    
    if (process.env.DEBUG_EXEC) {
      console.error('[visitCommand] Interpolated command:', command);
    }
    
    // Prepare environment variables for shell command - only bound parameters
    const envVars: Record<string, string> = {};
    
    // Get all variables from the environment that are marked as parameters
    const allVars = env.getAllVariables();
    for (const [name, variable] of allVars) {
      if (variable.metadata?.isParameter) {
        // Convert variables to string representation for shell
        const value = variable.value;
        if (typeof value === 'string') {
          envVars[name] = value;
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          envVars[name] = String(value);
        } else if (value && typeof value === 'object') {
          try {
            envVars[name] = JSON.stringify(value);
          } catch {
            // Skip variables that can't be serialized
          }
        }
      }
    }
    
    // Execute the command with environment variables
    const commandOutput = await env.executeCommand(command, {
      env: envVars
    });
    
    // Try to parse as JSON if it looks like JSON
    let result: any;
    if (typeof commandOutput === 'string' && commandOutput.trim()) {
      const trimmed = commandOutput.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
          (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          result = JSON.parse(trimmed);
        } catch {
          // Not valid JSON, use as-is
          result = commandOutput;
        }
      } else {
        result = commandOutput;
      }
    } else {
      result = commandOutput || '';
    }
    
    if (process.env.DEBUG_EXEC) {
      console.error('[visitCommand] Command result:', {
        originalOutput: commandOutput,
        parsedResult: result,
        resultType: typeof result
      });
    }
    
    return {
      value: result,
      env
    };
  }
  
  /**
   * Visit commandRef executable - Recursive exec invocation
   * THE KEY FIX: Natural recursion without circular imports!
   */
  async visitCommandRef(node: ExecutableDefinition, env: Environment, context?: any): Promise<EvalResult> {
    if (!isCommandRefExecutable(node)) {
      throw new Error('Invalid node type for visitCommandRef');
    }
    
    const refName = node.commandRef;
    if (!refName) {
      throw new Error('CommandRef node missing commandRef');
    }
    
    // Look up the referenced command
    const refCommand = env.getVariable(refName);
    if (!refCommand) {
      throw new MlldInterpreterError(`Referenced command not found: ${refName}`);
    }
    
    // Build arguments for the recursive invocation
    let refArgs: any[] = [];
    
    // The commandArgs contains the original AST nodes for how to call the referenced command
    // We need to evaluate these nodes with the current invocation's parameters bound
    if (node.commandArgs && node.commandArgs.length > 0) {
      // Evaluate each arg individually since they are VariableReference nodes
      const { evaluate } = await import('@interpreter/core/interpreter');
      
      for (const argNode of node.commandArgs) {
        // Evaluate the individual argument node
        const argResult = await evaluate(argNode, env, { isExpression: true });
        
        // Extract the actual value
        if (argResult && argResult.value !== undefined) {
          refArgs.push(argResult.value);
        }
      }
    } else {
      // No commandArgs means pass through the current invocation's args
      // These were stored during evaluate() for this purpose
      const originalArgs = this.currentEvaluatedArgs;
      if (originalArgs && originalArgs.length > 0) {
        refArgs = originalArgs;
      }
    }
    
    // Get the withClause from the referenced command's definition
    // The pipeline is defined on the referenced command, not the commandRef
    let refWithClause = node.withClause; // Start with commandRef's withClause if any
    
    // Extract the referenced command's definition to get its withClause
    if (refCommand && refCommand.metadata?.executableDef) {
      const refExecDef = refCommand.metadata.executableDef;
      if (refExecDef.withClause) {
        // Merge withClause - pipeline from definition takes precedence
        refWithClause = refWithClause ? 
          { ...refWithClause, ...refExecDef.withClause } : 
          refExecDef.withClause;
      }
    } else if (refCommand && (refCommand as any).withClause) {
      // Check if the variable itself has withClause
      refWithClause = refWithClause ?
        { ...refWithClause, ...(refCommand as any).withClause } :
        (refCommand as any).withClause;
    }
    
    // Create a new invocation node for the referenced command with the evaluated args
    const refInvocation: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: {
        identifier: refName,
        args: refArgs.map(arg => ({
          type: 'Text',
          content: typeof arg === 'string' ? arg : JSON.stringify(arg)
        }))
      },
      // Pass along the merged withClause (including pipeline from definition)
      ...(refWithClause ? { withClause: refWithClause } : {})
    };
    
    // NATURAL RECURSION - No circular imports!
    // The visitor can call back to evaluate() on the same instance
    // Use parent environment to avoid parameter pollution
    // CRITICAL: Pass context to maintain pipeline context through recursion
    return this.evaluate(refInvocation, env.parent || env, context);
  }
  
  /**
   * Visit when executable - Conditional control flow
   */
  async visitWhen(node: ExecutableDefinition, env: Environment, context?: any): Promise<EvalResult> {
    // For mlld-when executable, the WhenExpression is in codeTemplate array
    let whenExpr: any;
    
    if ((node as any).whenExpression) {
      // Direct whenExpression (shouldn't happen with exec definitions)
      whenExpr = (node as any).whenExpression;
    } else if ((node as any).codeTemplate) {
      // CodeExecutable with language='mlld-when'
      // The codeTemplate is an array with the WhenExpression as first element
      const codeTemplate = (node as any).codeTemplate;
      if (Array.isArray(codeTemplate) && codeTemplate.length > 0) {
        // Find the WhenExpression node
        whenExpr = codeTemplate.find((n: any) => n.type === 'WhenExpression') || codeTemplate[0];
      }
    }
    
    if (!whenExpr) {
      throw new Error('When node missing WhenExpression');
    }
    
    if (process.env.DEBUG_WHEN || process.env.DEBUG_EXEC) {
      logger.debug('Executing when expression', {
        hasConditions: !!whenExpr.conditions,
        conditionCount: whenExpr.conditions?.length
      });
    }
    
    // Evaluate mlld-when expression
    const { evaluateWhenExpression } = await import('@interpreter/eval/when-expression');
    
    // Pass environment directly like old implementation
    const result = await evaluateWhenExpression(whenExpr, env);
    
    // Return the result which includes both value and updated environment
    return result;
  }
  
  /**
   * Visit for executable - Iteration with shadow environments
   */
  async visitFor(node: ExecutableDefinition, env: Environment, context?: any): Promise<EvalResult> {
    // For mlld-for executable, the ForExpression is in codeTemplate array
    let forExpr: any;
    
    if ((node as any).forExpression) {
      // Direct forExpression (shouldn't happen with exec definitions)
      forExpr = (node as any).forExpression;
    } else if ((node as any).codeTemplate) {
      // CodeExecutable with language='mlld-for'
      // The codeTemplate is an array with the ForExpression as first element
      const codeTemplate = (node as any).codeTemplate;
      if (Array.isArray(codeTemplate) && codeTemplate.length > 0) {
        // Find the ForExpression node
        forExpr = codeTemplate.find((n: any) => n.type === 'ForExpression') || codeTemplate[0];
      }
    }
    
    if (!forExpr) {
      throw new Error('For node missing ForExpression');
    }
    
    if (process.env.DEBUG_FOR || process.env.DEBUG_EXEC) {
      logger.debug('Executing for expression', {
        variable: forExpr.variable?.name,
        hasExpression: !!forExpr.expression
      });
    }
    
    // Handle mlld-for with shadow environments
    const { evaluateForExpression } = await import('@interpreter/eval/for');
    
    // evaluateForExpression handles child environment creation internally for iterations
    const result = await evaluateForExpression(forExpr, env);
    
    // evaluateForExpression returns an ArrayVariable directly
    return {
      value: result,
      env: env
    };
  }
  
  /**
   * Visit transformer executable - Built-in pure functions
   */
  async visitTransformer(node: ExecutableDefinition, env: Environment, context?: any): Promise<EvalResult> {
    const transformerNode = node as any;
    
    if (!transformerNode.transformerImplementation) {
      throw new Error('Transformer node missing implementation');
    }
    
    if (process.env.DEBUG_EXEC) {
      logger.debug('Executing transformer', {
        name: transformerNode.name
      });
    }
    
    // Get the transformer implementation
    const impl = transformerNode.transformerImplementation;
    
    // Get arguments from environment
    const args: any[] = [];
    
    // Check for common parameter names used by transformers
    const paramNames = ['value', 'input', 'data', 'arg', 'param'];
    for (const name of paramNames) {
      const variable = env.getVariable(name);
      if (variable) {
        const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');
        const value = await extractVariableValue(variable, env);
        args.push(value);
      }
    }
    
    // Execute the transformer
    const result = await impl(...args);
    
    return {
      value: result,
      env
    };
  }
  
  /**
   * Visit section executable - File section extraction
   */
  async visitSection(node: ExecutableDefinition, env: Environment, context?: any): Promise<EvalResult> {
    if (!isSectionExecutable(node)) {
      throw new Error('Invalid node type for visitSection');
    }
    
    if (!node.sectionSelector) {
      throw new Error('Section node missing sectionSelector');
    }
    
    const selector = node.sectionSelector;
    
    if (process.env.DEBUG_EXEC) {
      logger.debug('Executing section selector', {
        file: selector.file,
        section: selector.section
      });
    }
    
    // Extract the section content
    const { extractSection } = await import('@interpreter/eval/show');
    const content = await extractSection(
      selector.file,
      selector.section,
      env
    );
    
    return {
      value: content,
      env
    };
  }
  
  /**
   * Visit resolver executable - Module resolution
   */
  async visitResolver(node: ExecutableDefinition, env: Environment, context?: any): Promise<EvalResult> {
    if (!isResolverExecutable(node)) {
      throw new Error('Invalid node type for visitResolver');
    }
    
    // Module resolution - currently stub
    throw new MlldInterpreterError('Resolver executables not yet implemented');
  }
  
  // ============================================================================
  // HELPER METHODS - Reused from previous refactor
  // ============================================================================
  
  /**
   * Handle special cases like @typeof transformer
   */
  private async handleSpecialCases(
    commandVariable: Variable,
    args: any[],
    env: Environment
  ): Promise<EvalResult | null> {
    // Check for @typeof transformer special case
    if (commandVariable.metadata?.isBuiltinTransformer && 
        commandVariable.metadata?.transformerImplementation) {
      
      const impl = commandVariable.metadata.transformerImplementation;
      const commandName = commandVariable.name;
      
      // Special handling for @typeof - needs Variable metadata
      if (commandName === 'typeof' || commandName === 'TYPEOF') {
        return await this.handleTypeofTransformer(args, env);
      }
      
      // Other transformers can be handled normally
      const processedArgs = await this.processArguments(args, env);
      const result = await impl(...processedArgs);
      return { value: result, env };
    }
    
    return null;
  }
  
  /**
   * Handle @typeof transformer special case
   */
  private async handleTypeofTransformer(
    args: any[],
    env: Environment
  ): Promise<EvalResult> {
    if (args.length === 0) {
      return { value: 'undefined', env };
    }
    
    const arg = args[0];
    
    // Check if it's a variable reference
    if (arg && typeof arg === 'object' && 'type' in arg && arg.type === 'VariableReference') {
      const varRef = arg as any;
      const varName = varRef.identifier;
      const varObj = env.getVariable(varName);
      
      if (varObj) {
        // Generate type information from Variable object
        let typeInfo = varObj.type;
        
        // Handle subtypes for different variable types
        const sourceDirective = (varObj as any).sourceDirective || 'var';
        
        if (varObj.type === 'simple-text' && 'subtype' in varObj) {
          const subtype = (varObj as any).subtype;
          if (subtype && subtype !== 'simple' && subtype !== 'interpolated-text') {
            typeInfo = subtype;
          }
        } else if (varObj.type === 'primitive' && 'primitiveType' in varObj) {
          typeInfo = `primitive (${(varObj as any).primitiveType})`;
        } else if (varObj.type === 'object') {
          const objValue = varObj.value;
          if (objValue && typeof objValue === 'object') {
            const keys = Object.keys(objValue);
            typeInfo = `object (${keys.length} properties)`;
          }
        } else if (varObj.type === 'array') {
          const arrValue = varObj.value;
          if (Array.isArray(arrValue)) {
            typeInfo = `array (${arrValue.length} items)`;
          }
        } else if (varObj.type === 'executable') {
          const execType = (varObj as any).executableType || 'unknown';
          const sourceDirective = (varObj as any).sourceDirective || 'exec';
          typeInfo = `executable (${execType} from /${sourceDirective})`;
        }
        
        // Add source directive info for non-executables
        if (varObj.type !== 'executable') {
          typeInfo = `${typeInfo} [from /${sourceDirective}]`;
        }
        
        return { value: typeInfo, env };
      }
    }
    
    // Fallback to regular type checking
    const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');
    const value = await extractVariableValue(arg, env);
    const typeInfo = typeof value;
    return { value: typeInfo, env };
  }
  
  /**
   * Extract executable definition from a Variable
   */
  private extractExecutableDefinition(variable: Variable): ExecutableDefinition {
    // Check metadata for executableDef (from imports)
    if (variable.metadata?.executableDef) {
      return variable.metadata.executableDef;
    }
    
    // Extract from variable properties
    const execVar = variable as any;
    
    if (!execVar.executableType) {
      throw new MlldInterpreterError(`Variable ${variable.name} is not properly configured as executable`);
    }
    
    // Build ExecutableDefinition from Variable properties
    // Map field names correctly based on executable type
    const base: any = {
      type: execVar.executableType,
      paramNames: execVar.paramNames || [],  // Add parameter names
      sourceDirective: execVar.sourceDirective || 'exec',  // Add source directive
      language: execVar.language,
      syntaxInfo: execVar.syntaxInfo,
      body: execVar.body,
      whenExpression: execVar.whenExpression,
      forExpression: execVar.forExpression,
      sectionSelector: execVar.sectionSelector,
      resolverInfo: execVar.resolverInfo,
      commandRef: execVar.commandRef,
      commandArgs: execVar.commandArgs,
      withClause: execVar.withClause
    };
    
    // Map the template/content field based on type
    switch (execVar.executableType) {
      case 'template':
        base.template = execVar.template || execVar.body;
        break;
      case 'code':
        // CodeExecutable uses codeTemplate
        base.codeTemplate = execVar.codeTemplate || execVar.template || execVar.body;
        break;
      case 'command':
        // CommandExecutable uses commandTemplate
        base.commandTemplate = execVar.commandTemplate || execVar.template || execVar.body;
        break;
      default:
        // For other types, use template as fallback
        base.template = execVar.template || execVar.body;
    }
    
    return base as ExecutableDefinition;
  }
  
  /**
   * Process arguments, evaluating any expressions
   */
  private async processArguments(
    args: any[],
    env: Environment
  ): Promise<any[]> {
    const processed: any[] = [];
    
    for (const arg of args) {
      // Handle Variable references that need evaluation
      if (arg && typeof arg === 'object') {
        if (arg.type === 'VariableReference') {
          const varRef = arg as any;
          const varName = varRef.identifier;
          let variable = env.getVariable(varName);
          
          // UNIVERSAL CONTEXT: If @p, @pipeline, or @ctx are requested but not found,
          // provide the universal context (pipeline context if in pipeline, or default)
          if (!variable && (varName === 'p' || varName === 'pipeline' || varName === 'ctx')) {
            const pipelineContext = env.getPipelineContext();
            if (pipelineContext) {
              // We're in a pipeline - the variable should already exist from context-builder
              // Try looking in parent environment (stage environment might be a child)
              variable = env.getVariable(varName);
              // If still not found, there's a scope issue - don't create duplicate
              if (!variable && process.env.DEBUG_EXEC) {
                console.error('[processArguments] WARNING: Pipeline context exists but @p variable not found in scope');
              }
            } else if (USE_UNIVERSAL_CONTEXT) {
              // Not in a pipeline but universal context is enabled - provide default context
              const defaultContext = {
                try: 1,
                tries: [],
                stage: 0,
                isPipeline: false
              };
              const { VariableFactory } = await import('./helpers/variable-factory');
              variable = VariableFactory.createParameter(varName, defaultContext);
              env.setParameterVariable(varName, variable); // Store the variable in environment
            }
          }
          
          if (process.env.DEBUG_EXEC) {
            console.error('[processArguments] Evaluating VariableReference:', varName, 'fields:', varRef.fields, 'found:', !!variable);
          }
          
          if (variable) {
            // Handle field access (e.g., @user.name)
            if (varRef.fields && varRef.fields.length > 0) {
              // Navigate through nested fields on the value
              let value = variable.value;
              for (const field of varRef.fields) {
                if (value && typeof value === 'object' && (field.type === 'field' || field.type === 'numericField')) {
                  // Handle object field access (including numeric fields)
                  value = value[field.value];
                } else if (Array.isArray(value) && (field.type === 'index' || field.type === 'arrayIndex')) {
                  // Handle array index access
                  const index = parseInt(field.value, 10);
                  value = isNaN(index) ? undefined : value[index];
                } else {
                  // Can't navigate further
                  value = undefined;
                  break;
                }
              }
              // When field access is used, we extract the value
              if (process.env.DEBUG_EXEC) {
                console.error('[processArguments] Field access result:', value);
              }
              processed.push(value);
            } else {
              // No field access - but check if the Variable is complex and needs resolution
              if ((variable as any).isComplex && variable.value && typeof variable.value === 'object' && 'type' in variable.value) {
                // Complex Variable with AST - extract value
                const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');
                const resolvedValue = await extractVariableValue(variable, env);
                if (process.env.DEBUG_EXEC) {
                  console.error('[processArguments] Resolved complex Variable:', variable.name, 'to:', resolvedValue);
                }
                // Create a new Variable with the resolved value but preserving metadata
                const resolvedVar = {
                  ...variable,
                  value: resolvedValue,
                  isComplex: false  // Mark as no longer complex since we've resolved it
                };
                processed.push(resolvedVar);
              } else {
                // No field access - preserve the entire Variable
                if (process.env.DEBUG_EXEC) {
                  console.error('[processArguments] Preserving Variable:', variable.name, 'with metadata:', variable.metadata);
                }
                processed.push(variable);
              }
            }
          } else {
            // Variable not found
            processed.push(undefined);
          }
        } else if (arg.type === 'Text') {
          processed.push(arg.content || '');
        } else if (arg.type === 'Number') {
          processed.push(arg.value);
        } else if (arg.type === 'FileReference') {
          // Handle FileReference nodes (alligator syntax)
          const { evaluate } = await import('@interpreter/core/interpreter');
          const result = await evaluate(arg, env);
          processed.push(result.value);
        } else if (arg.type === 'Object' || arg.type === 'Array') {
          // Handle Object and Array literal nodes
          const { evaluate } = await import('@interpreter/core/interpreter');
          const result = await evaluate(arg, env);
          if (process.env.DEBUG_EXEC) {
            console.error('[processArguments] Evaluated Object/Array:', {
              type: arg.type,
              resultValue: result.value,
              resultType: typeof result.value,
              keys: typeof result.value === 'object' && result.value !== null ? Object.keys(result.value) : 'not-object'
            });
          }
          processed.push(result.value);
        } else {
          // For other AST nodes, evaluate them
          const { evaluate } = await import('@interpreter/core/interpreter');
          const result = await evaluate(arg, env);
          processed.push(result.value);
        }
      } else {
        processed.push(arg);
      }
    }
    
    return processed;
  }
  
  /**
   * Create execution environment with bound parameters
   */
  private async createExecutionEnvironment(
    env: Environment,
    commandVariable: Variable,
    executableDef: ExecutableDefinition,
    args: any[],
    withClause?: WithClause,
    execContext?: any
  ): Promise<Environment> {
    const execVar = commandVariable as any;
    const paramNames = execVar.paramNames || [];
    
    // Store bound parameter names for use by language executors
    this.currentBoundParams = paramNames;
    
    // Use context manager to create environment with proper context
    let execEnv: Environment;
    
    if (execContext) {
      // Use context manager for binding
      execEnv = this.contextManager.bindParameterContext(
        execContext,
        paramNames,
        args,
        env
      );
    } else {
      // Fallback to manual binding
      execEnv = env.createChild();
      
      // Bind parameters manually
      for (let i = 0; i < paramNames.length; i++) {
        const paramName = paramNames[i];
        const arg = i < args.length ? args[i] : undefined;
        
        // Check if the argument is already a Variable
        let paramVar;
        if (arg && typeof arg === 'object' && 'type' in arg && 'name' in arg && 'value' in arg) {
          // It's a Variable - pass it as the third parameter to preserve metadata
          if (process.env.DEBUG_EXEC) {
            console.error('[createExecutionEnvironment] Binding Variable parameter:', {
              paramName,
              argType: arg.type,
              argValue: arg.value,
              valueType: typeof arg.value,
              isComplex: (arg as any).isComplex,
              valueKeys: typeof arg.value === 'object' && arg.value !== null ? Object.keys(arg.value).slice(0, 5) : 'not-object'
            });
          }
          // If the Variable is complex (has AST), we need to extract its actual value
          if ((arg as any).isComplex && arg.value && typeof arg.value === 'object' && 'type' in arg.value) {
            // Complex Variable with AST - extract value
            const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');
            const resolvedValue = await extractVariableValue(arg, env);
            paramVar = VariableFactory.createParameter(paramName, resolvedValue, arg);
          } else {
            paramVar = VariableFactory.createParameter(paramName, arg.value, arg);
          }
        } else {
          // Raw value - create new Variable
          paramVar = VariableFactory.createParameter(paramName, arg);
        }
        
        // Mark as parameter to bypass reserved name check
        paramVar.metadata = {
          ...paramVar.metadata,
          isSystem: true,
          isParameter: true
        };
        execEnv.setParameterVariable(paramName, paramVar);
      }
    }
    
    // Apply captured shadow environments if present
    if (commandVariable.metadata?.capturedShadowEnvs) {
      // Store for later use by language executors
      this.currentCapturedShadowEnvs = commandVariable.metadata.capturedShadowEnvs;
      
      ShadowEnvironmentManager.applyCaptured(
        execEnv,
        commandVariable.metadata.capturedShadowEnvs
      );
    }
    
    // Handle pipeline context
    // CRITICAL: Create pipeline variables if:
    // 1. This exec has a pipeline (withClause.pipeline)
    // 2. OR we're being called FROM a pipeline (execContext.isPipeline)
    if (withClause?.pipeline || execContext?.isPipeline) {
      // If we have execContext, use context manager for pipeline variables
      if (execContext) {
        this.contextManager.createPipelineVariables(execContext, execEnv);
      }
    }
    
    // Also check if parent environment has pipeline context
    const parentPipelineCtx = env.getPipelineContext();
    if (parentPipelineCtx && !withClause?.pipeline) {
      // We're being called from a pipeline - inherit the context
      execEnv.setPipelineContext(parentPipelineCtx);
    }
    
    return execEnv;
  }
  
  /**
   * Execute with pipeline
   */
  private async executeWithPipeline(
    node: ExecInvocation,
    executableNode: ExecutableNode,
    env: Environment,  // This is actually execEnv with parameters bound!
    args: any[],
    execContext: any,
    evaluator?: IEvaluator
  ): Promise<EvalResult> {
    if (process.env.MLLD_DEBUG === 'true' || process.env.DEBUG_EXEC) {
      console.error('[executeWithPipeline] CALLED!', {
        hasPipeline: !!node.withClause?.pipeline,
        pipelineLength: node.withClause?.pipeline?.length
      });
    }
    
    if (!node.withClause?.pipeline) {
      throw new Error('executeWithPipeline called without pipeline');
    }
    
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[executeWithPipeline] Called with:', {
        nodeType: node.type,
        hasCommandRef: !!node.commandRef,
        commandRefName: node.commandRef?.name,
        pipelineLength: node.withClause.pipeline.length,
        args: args
      });
    }
    
    // Import pipeline executor
    const { processPipeline } = await import('@interpreter/eval/pipeline/unified-processor');
    
    // CRITICAL FIX: The exec function itself should be the first stage of the pipeline!
    // Don't execute it separately and pass a retryableSource.
    // Instead, add it as stage 0 of the pipeline.
    
    // Get the actual executable definition
    let actualExecutableDef = executableNode.getDefinition();
    
    // If this is a CommandRef, we need to extract the actual command it references
    // For example: @shout(msg) = @upper(@msg) | @exclaim
    // The CommandRef stores the full definition including pipeline
    // We need to extract just @upper for stage 0
    let sourceIdentifier = node.commandRef?.name || execContext?.metadata?.execName || 'source';
    let sourceArgs = args || [];
    
    if (actualExecutableDef?.type === 'commandRef') {
      // The CommandRef points to another command
      // Extract the actual command name and args from the CommandRef
      sourceIdentifier = actualExecutableDef.commandRef || sourceIdentifier;
      // Use the args from the CommandRef definition if they exist
      if (actualExecutableDef.commandArgs) {
        sourceArgs = actualExecutableDef.commandArgs;
      }
      
      if (process.env.MLLD_DEBUG === 'true' || process.env.DEBUG_EXEC === 'true') {
        console.error('[executeWithPipeline] CommandRef resolution:', {
          originalName: node.commandRef?.name,
          resolvedName: sourceIdentifier,
          hasCommandArgs: !!actualExecutableDef.commandArgs,
          commandArgsCount: actualExecutableDef.commandArgs?.length
        });
      }
    }
    
    // Create a command for this exec invocation to be stage 0
    const sourceCommand = {
      type: 'execInvocation' as any,
      identifier: [{
        type: 'VariableReference',
        valueType: 'varIdentifier', 
        identifier: sourceIdentifier
      }],
      args: sourceArgs,
      fields: [],
      rawIdentifier: sourceIdentifier,
      rawArgs: sourceArgs,
      // Store the executable definition for execution
      executableDef: actualExecutableDef
    };
    
    // Combine source as stage 0 with the rest of the pipeline
    const fullPipeline = [sourceCommand, ...node.withClause.pipeline];
    
    if (process.env.MLLD_DEBUG === 'true' || process.env.DEBUG_EXEC === 'true') {
      console.error('[ExecInvocationEvaluator] Pipeline Construction:', {
        sourceCommand: sourceCommand.rawIdentifier,
        sourceCommandArgs: sourceCommand.args?.map((a: any) => ({ 
          type: a?.type, 
          identifier: a?.identifier,
          content: a?.content 
        })),
        pipelineStages: node.withClause.pipeline.map((p: any) => ({
          name: p.rawIdentifier || 'unknown',
          args: p.args?.map((a: any) => ({ type: a?.type, identifier: a?.identifier }))
        })),
        fullPipelineLength: fullPipeline.length,
        fullPipelineStages: fullPipeline.map((p: any, i: number) => ({
          index: i,
          name: p.rawIdentifier || 'unknown',
          hasExecutableDef: !!p.executableDef,
          argsCount: p.args?.length || 0
        }))
      });
    }
    
    // Execute the full pipeline starting with empty input
    // The source (stage 0) will generate the initial value
    const pipelineResult = await processPipeline({
      value: '', // Empty initial value - stage 0 will generate it
      env,
      node,
      directive: 'exec',
      identifier: execContext?.metadata?.execName || 'exec',
      pipeline: fullPipeline,
      format: node.withClause.format,
      isRetryable: true,  // ALWAYS true in universal context
      hasSyntheticSource: false  // ALWAYS false with universal context!
    });
    
    // Apply other withClause features (trust, needs)
    if (node.withClause) {
      const withClauseWithoutPipeline = { ...node.withClause, pipeline: undefined };
      return await applyWithClause(pipelineResult, withClauseWithoutPipeline, env);
    }
    
    return pipelineResult;
  }
  
  /**
   * Execute JavaScript code
   */
  private async executeJavaScript(
    code: string,
    env: Environment,
    pipelineContext?: any
  ): Promise<EvalResult> {
    // Prepare parameters for auto-unwrapping - only get bound parameters
    const params = new Map<string, any>();
    
    // First, ensure ALL expected parameters are included (even undefined ones)
    // This prevents ReferenceError when code checks if a param is undefined
    if (this.currentBoundParams) {
      for (const paramName of this.currentBoundParams) {
        // Initialize with undefined - will be overwritten if actual value exists
        params.set(paramName, undefined);
      }
    }
    
    // Get all variables from the environment that are marked as parameters
    const allVars = env.getAllVariables();
    
    if (process.env.DEBUG_EXEC) {
      console.error('[executeJavaScript] Looking for parameters:', {
        totalVars: allVars.size,
        varNames: Array.from(allVars.keys()).slice(0, 10)
      });
    }
    
    for (const [name, variable] of allVars) {
      // Check if this is a parameter (marked during parameter binding)
      if (variable.metadata?.isParameter) {
        params.set(name, variable);
        if (process.env.DEBUG_EXEC) {
          console.error('[executeJavaScript] Found parameter:', name, 'value:', variable.value);
        }
      }
    }
    
    // Prepare parameters with Variable proxies for JS execution
    const processedParams: Record<string, any> = {};
    const variableMetadata: Record<string, any> = {};
    
    for (const [key, variable] of params) {
      // Handle case where variable might not have a value property
      if (!variable || variable.value === undefined) {
        processedParams[key] = variable;
        continue;
      }
      
      // Store metadata shelf for LoadContentResult
      if (isLoadContentResultArray(variable.value)) {
        globalMetadataShelf.storeMetadata(variable.value);
      }
      
      // Auto-unwrap LoadContentResult objects
      const unwrappedValue = AutoUnwrapManager.unwrap(variable.value);
      if (unwrappedValue !== variable.value) {
        // Value was unwrapped, create a new variable with unwrapped content
        const unwrappedVar = {
          ...variable,
          value: unwrappedValue,
          type: Array.isArray(unwrappedValue) ? 'array' : 'text'
        };
        processedParams[key] = prepareValueForShadow(unwrappedVar);
      } else {
        // Use original Variable with proxy
        if (process.env.DEBUG_EXEC) {
          console.error('[executeJavaScript] Preparing variable for shadow:', {
            key,
            variableType: variable.type,
            variableValue: variable.value,
            isObject: typeof variable.value === 'object',
            objectKeys: typeof variable.value === 'object' && variable.value !== null ? Object.keys(variable.value) : 'not-object'
          });
        }
        processedParams[key] = prepareValueForShadow(variable);
      }
      
      // Store metadata for primitives that can't be proxied
      if (variable.value === null || typeof variable.value !== 'object') {
        variableMetadata[key] = {
          type: variable.type,
          subtype: variable.subtype || (variable as any).primitiveType,
          metadata: variable.metadata,
          isVariable: true
        };
      }
    }
    
    // Add captured shadow environments if present
    if (this.currentCapturedShadowEnvs) {
      processedParams['__capturedShadowEnvs'] = this.currentCapturedShadowEnvs;
    }
    
    // Add pipeline context if present
    if (pipelineContext) {
      processedParams['context'] = pipelineContext;
      if (process.env.DEBUG_EXEC) {
        console.error('[executeJavaScript] Adding pipeline context:', pipelineContext);
      }
    } else {
      // Try to get pipeline context from environment
      const envContext = env.getPipelineContext();
      if (envContext) {
        processedParams['context'] = envContext;
        if (process.env.DEBUG_EXEC) {
          console.error('[executeJavaScript] Adding env pipeline context:', envContext);
        }
      }
    }
    
    if (process.env.DEBUG_EXEC) {
      console.error('[executeJavaScript] Passing params:', {
        paramKeys: Object.keys(processedParams),
        hasCapturedShadowEnvs: '__capturedShadowEnvs' in processedParams,
        hasMetadata: Object.keys(variableMetadata).length > 0
      });
    }
    
    // Get universal context from environment and pass it in metadata
    const universalContext = env.getUniversalContext?.();
    const metadata = {
      ...variableMetadata,
      universalContext
    };
    
    // Execute JavaScript code using executeCode - pass both params and metadata
    const result = await env.executeCode(code, 'javascript', processedParams, metadata);
    
    // Handle the result - parse JSON if it looks like JSON
    let processedResult: any;
    
    // If the result looks like JSON (from return statement), parse it
    if (typeof result === 'string' && 
        (result.startsWith('"') || result.startsWith('{') || result.startsWith('[') || 
         result === 'null' || result === 'true' || result === 'false' ||
         /^-?\d+(\.\d+)?$/.test(result))) {
      try {
        const parsed = JSON.parse(result);
        processedResult = parsed;
      } catch {
        // Not valid JSON, use as-is
        processedResult = result;
      }
    } else {
      processedResult = result || '';
    }
    
    // Restore metadata if needed
    if (Array.isArray(processedResult)) {
      const restored = globalMetadataShelf.restoreMetadata(processedResult);
      return { value: restored, env };
    }
    
    return { value: processedResult, env };
  }
  
  /**
   * Execute Node.js code
   */
  private async executeNode(
    code: string,
    env: Environment
  ): Promise<EvalResult> {
    // Prepare parameters with Variable proxies for Node
    const processedParams: Record<string, any> = {};
    const variableMetadata: Record<string, any> = {};
    
    // First, ensure ALL expected parameters are included (even undefined ones)
    // This prevents ReferenceError when code checks if a param is undefined
    if (this.currentBoundParams) {
      for (const paramName of this.currentBoundParams) {
        // Initialize with undefined - will be overwritten if actual value exists
        processedParams[paramName] = undefined;
      }
    }
    
    // Get all variables from the environment that are marked as parameters
    const allVars = env.getAllVariables();
    for (const [name, variable] of allVars) {
      if (variable.metadata?.isParameter) {
        // Auto-unwrap LoadContentResult
        const unwrappedValue = AutoUnwrapManager.unwrap(variable.value);
        if (unwrappedValue !== variable.value) {
          const unwrappedVar = {
            ...variable,
            value: unwrappedValue,
            type: Array.isArray(unwrappedValue) ? 'array' : 'text'
          };
          processedParams[name] = prepareValueForShadow(unwrappedVar);
        } else {
          // Use original Variable with proxy
          processedParams[name] = prepareValueForShadow(variable);
        }
        
        // Store metadata for primitives
        if (variable.value === null || typeof variable.value !== 'object') {
          variableMetadata[name] = {
            type: variable.type,
            subtype: variable.subtype || (variable as any).primitiveType,
            metadata: variable.metadata,
            isVariable: true
          };
        }
      }
    }
    
    // Add captured shadow environments if present
    if (this.currentCapturedShadowEnvs) {
      processedParams['__capturedShadowEnvs'] = this.currentCapturedShadowEnvs;
    }
    
    // Get universal context from environment and pass it in metadata
    const universalContext = env.getUniversalContext?.();
    const metadata = {
      ...variableMetadata,
      universalContext
    };
    
    // Execute Node code using executeCode - pass metadata for primitives and context
    const result = await env.executeCode(code, 'node', processedParams, metadata);
    
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[executeNode] Result from executeCode:', {
        resultType: typeof result,
        isString: typeof result === 'string',
        resultLength: typeof result === 'string' ? result.length : undefined,
        startsWithBrace: typeof result === 'string' ? result.startsWith('{') : false,
        endsWithBrace: typeof result === 'string' ? result.endsWith('}') : false,
        result
      });
    }
    
    // Handle the result - it could be an object, not just a string
    // If it's a JSON string that looks like an object, try to parse it
    if (typeof result === 'string' && result.startsWith('{') && result.endsWith('}')) {
      try {
        const parsed = JSON.parse(result);
        if (process.env.MLLD_DEBUG === 'true') {
          console.error('[executeNode] Successfully parsed JSON:', parsed);
        }
        return { value: parsed, env };
      } catch (e) {
        if (process.env.MLLD_DEBUG === 'true') {
          console.error('[executeNode] Failed to parse JSON:', e);
        }
        // If parsing fails, return as string
        return { value: result || '', env };
      }
    }
    
    // Also check for arrays
    if (typeof result === 'string' && result.startsWith('[') && result.endsWith(']')) {
      try {
        const parsed = JSON.parse(result);
        if (process.env.MLLD_DEBUG === 'true') {
          console.error('[executeNode] Successfully parsed JSON array:', parsed);
        }
        return { value: parsed, env };
      } catch (e) {
        if (process.env.MLLD_DEBUG === 'true') {
          console.error('[executeNode] Failed to parse JSON array:', e);
        }
        // If parsing fails, return as string
        return { value: result || '', env };
      }
    }
    
    // Return the result as-is (could be object or string)
    return { value: result || '', env };
  }
  
  /**
   * Execute Python code
   */
  private async executePython(
    code: string,
    env: Environment
  ): Promise<EvalResult> {
    // Prepare parameters with Variable proxies for Python
    const processedParams: Record<string, any> = {};
    const variableMetadata: Record<string, any> = {};
    
    // Get all variables from the environment that are marked as parameters
    const allVars = env.getAllVariables();
    for (const [name, variable] of allVars) {
      if (variable.metadata?.isParameter) {
        // Auto-unwrap LoadContentResult
        const unwrappedValue = AutoUnwrapManager.unwrap(variable.value);
        if (unwrappedValue !== variable.value) {
          const unwrappedVar = {
            ...variable,
            value: unwrappedValue,
            type: Array.isArray(unwrappedValue) ? 'array' : 'text'
          };
          processedParams[name] = prepareValueForShadow(unwrappedVar);
        } else {
          // Use original Variable with proxy
          processedParams[name] = prepareValueForShadow(variable);
        }
        
        // Store metadata for primitives
        if (variable.value === null || typeof variable.value !== 'object') {
          variableMetadata[name] = {
            type: variable.type,
            subtype: variable.subtype || (variable as any).primitiveType,
            metadata: variable.metadata,
            isVariable: true
          };
        }
      }
    }
    
    // Add captured shadow environments if present
    if (this.currentCapturedShadowEnvs) {
      processedParams['__capturedShadowEnvs'] = this.currentCapturedShadowEnvs;
    }
    
    // Execute Python code using executeCode - pass metadata for primitives
    const result = await env.executeCode(code, 'python', processedParams, variableMetadata);
    
    // Handle the result - parse JSON if it looks like JSON
    let processedResult: any;
    
    // If the result looks like JSON (from return statement), parse it
    if (typeof result === 'string' && 
        (result.startsWith('"') || result.startsWith('{') || result.startsWith('[') || 
         result === 'null' || result === 'true' || result === 'false' ||
         /^-?\d+(\.\d+)?$/.test(result))) {
      try {
        const parsed = JSON.parse(result);
        processedResult = parsed;
      } catch {
        // Not valid JSON, use as-is
        processedResult = result;
      }
    } else {
      processedResult = result || '';
    }
    
    return { value: processedResult, env };
  }
  
  /**
   * Execute Bash code
   */
  private async executeBash(
    code: string,
    env: Environment
  ): Promise<EvalResult> {
    // Prepare parameters for Bash - collect bound parameters
    const processedParams: Record<string, any> = {};
    const variableMetadata: Record<string, any> = {};
    
    // Get all variables from the environment that are marked as parameters
    const allVars = env.getAllVariables();
    for (const [name, variable] of allVars) {
      if (variable.metadata?.isParameter) {
        // Pass the variable value directly - BashExecutor will handle conversion
        processedParams[name] = variable.value;
        
        // Store metadata for primitives
        if (variable.type === 'primitive' && 'primitiveType' in variable) {
          variableMetadata[name] = {
            primitiveType: (variable as any).primitiveType,
            isPrimitive: true
          };
        }
      }
    }
    
    // Execute Bash code using executeCode - pass parameters
    if (process.env.DEBUG_EXEC) {
      console.error('[executeBash] Executing:', { code, paramCount: Object.keys(processedParams).length });
    }
    
    const result = await env.executeCode(code, 'bash', processedParams, variableMetadata);
    
    if (process.env.DEBUG_EXEC) {
      console.error('[executeBash] Result:', result);
    }
    
    return {
      value: result || '',
      env
    };
  }
  /**
   * Execute with strategy - adapter method for context manager
   * Routes to the visitor pattern execution
   */
  async executeWithStrategy(
    executable: ExecutableDefinition,
    env: Environment
  ): Promise<EvalResult> {
    const executableNode = createExecutableNode(executable);
    return await executableNode.accept(this, env);
  }
}

// Singleton instance
let evaluatorInstance: ExecInvocationEvaluator | null = null;

/**
 * Get or create the evaluator instance
 */
export function getEvaluator(): ExecInvocationEvaluator {
  if (!evaluatorInstance) {
    evaluatorInstance = new ExecInvocationEvaluator();
  }
  return evaluatorInstance;
}
