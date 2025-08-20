import type { ExecInvocation, WithClause } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { ExecutableDefinition } from '@core/types/executable';
import type { Variable } from '@core/types/variable';
import type { IEvaluator } from '@core/universal-context';

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
  private autoUnwrapManager: AutoUnwrapManager;
  
  constructor() {
    this.contextManager = new ExecContextManager();
    this.commandResolver = new CommandResolver();
    this.variableFactory = new VariableFactory();
    this.shadowManager = new ShadowEnvironmentManager();
    this.autoUnwrapManager = new AutoUnwrapManager();
  }
  
  /**
   * Main evaluation entry point - orchestrates the visitor pattern
   */
  async evaluate(
    node: ExecInvocation,
    env: Environment,
    evaluator?: IEvaluator
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
      const executableDef = this.extractExecutableDefinition(commandVariable);
      const executableNode = createExecutableNode(executableDef);
      
      // 4. Process arguments and create execution environment
      const processedArgs = await this.processArguments(args, env);
      
      const parentContext = evaluator?.getContext?.();
      const execContext = this.contextManager.createExecContext(
        parentContext,
        executableDef,
        commandName
      );
      
      const execEnv = await this.createExecutionEnvironment(
        env,
        commandVariable,
        executableDef,
        processedArgs,
        node.withClause,
        execContext
      );
      
      // 5. Handle pipeline if present (with universal context)
      if (node.withClause?.pipeline?.length > 0) {
        return await this.executeWithPipeline(
          node,
          executableNode,
          execEnv,
          processedArgs,
          execContext,
          evaluator
        );
      }
      
      // 6. Execute via visitor pattern (double dispatch)
      const result = await executableNode.accept(this, execEnv);
      
      // 7. Apply non-pipeline withClause features
      if (node.withClause) {
        return await applyWithClause(result, node.withClause, execEnv);
      }
      
      return result;
      
    } finally {
      // Always clear metadata shelf after execution
      globalMetadataShelf.clear();
    }
  }
  
  // ============================================================================
  // VISITOR METHODS - One per execution type
  // ============================================================================
  
  /**
   * Visit template executable - String interpolation
   */
  async visitTemplate(node: ExecutableDefinition, env: Environment): Promise<EvalResult> {
    if (!isTemplateExecutable(node)) {
      throw new Error('Invalid node type for visitTemplate');
    }
    
    if (process.env.DEBUG_EXEC) {
      logger.debug('Executing template', {
        template: node.template?.substring(0, 100),
        hasInterpolation: node.syntaxInfo?.hasInterpolation
      });
    }
    
    const context = new InterpolationContext(env, {
      autoExecute: true,
      preserveUndefined: false
    });
    
    const interpolated = await interpolate(node.template || '', context);
    
    // Normalize line endings for multi-line templates
    const result = node.syntaxInfo?.isMultiLine 
      ? interpolated.replace(/\r\n/g, '\n')
      : interpolated;
    
    return { value: result, env };
  }
  
  /**
   * Visit code executable - JS/Python/Bash execution with shadow environments
   */
  async visitCode(node: ExecutableDefinition, env: Environment): Promise<EvalResult> {
    if (!isCodeExecutable(node)) {
      throw new Error('Invalid node type for visitCode');
    }
    
    const language = node.language?.toLowerCase();
    const code = node.template || '';
    
    if (process.env.DEBUG_EXEC) {
      logger.debug('Executing code', {
        language,
        codeLength: code.length,
        codePreview: code.substring(0, 100)
      });
    }
    
    // Handle language-specific execution
    switch (language) {
      case 'javascript':
      case 'js':
        return await this.executeJavaScript(code, env);
      
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
  async visitCommand(node: ExecutableDefinition, env: Environment): Promise<EvalResult> {
    if (!isCommandExecutable(node)) {
      throw new Error('Invalid node type for visitCommand');
    }
    
    const commandTemplate = node.template || '';
    
    if (process.env.DEBUG_EXEC) {
      logger.debug('Executing command', {
        template: commandTemplate.substring(0, 100),
        hasInterpolation: node.syntaxInfo?.hasInterpolation
      });
    }
    
    // Perform interpolation if needed
    let command: string;
    if (node.syntaxInfo?.hasInterpolation !== false) {
      const context = new InterpolationContext(env, {
        autoExecute: true,
        preserveUndefined: false
      });
      command = await interpolate(commandTemplate, context);
    } else {
      command = commandTemplate;
    }
    
    // Execute the command
    const result = await env.executeCommand(command);
    
    return {
      value: result.stdout || '',
      env
    };
  }
  
  /**
   * Visit commandRef executable - Recursive exec invocation
   * THE KEY FIX: Natural recursion without circular imports!
   */
  async visitCommandRef(node: ExecutableDefinition, env: Environment): Promise<EvalResult> {
    if (!isCommandRefExecutable(node)) {
      throw new Error('Invalid node type for visitCommandRef');
    }
    
    const cmdRef = node.commandRef;
    if (!cmdRef) {
      throw new Error('CommandRef node missing commandRef');
    }
    
    // Build ExecInvocation for recursion
    const refInvocation: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: cmdRef
    };
    
    // NATURAL RECURSION - No circular imports!
    // The visitor can call back to evaluate() on the same instance
    return this.evaluate(refInvocation, env);
  }
  
  /**
   * Visit when executable - Conditional control flow
   */
  async visitWhen(node: ExecutableDefinition, env: Environment): Promise<EvalResult> {
    // Check for whenExpression
    const whenExpr = (node as any).whenExpression;
    if (!whenExpr) {
      throw new Error('When node missing whenExpression');
    }
    
    if (process.env.DEBUG_WHEN || process.env.DEBUG_EXEC) {
      logger.debug('Executing when expression', {
        hasConditions: !!whenExpr.conditions,
        conditionCount: whenExpr.conditions?.length
      });
    }
    
    // Evaluate mlld-when expression
    const { evaluateWhenExpression } = await import('@interpreter/eval/when');
    
    // Create a child environment for when evaluation
    const whenEnv = env.createChild();
    const result = await evaluateWhenExpression(whenExpr, whenEnv);
    
    // Merge the child environment back
    env.mergeChild(whenEnv);
    
    return result;
  }
  
  /**
   * Visit for executable - Iteration with shadow environments
   */
  async visitFor(node: ExecutableDefinition, env: Environment): Promise<EvalResult> {
    // Check for forExpression
    const forExpr = (node as any).forExpression;
    if (!forExpr) {
      throw new Error('For node missing forExpression');
    }
    
    if (process.env.DEBUG_FOR || process.env.DEBUG_EXEC) {
      logger.debug('Executing for expression', {
        itemName: forExpr.itemName,
        hasAction: !!forExpr.action
      });
    }
    
    // Handle mlld-for with shadow environments
    const { evaluateForExpression } = await import('@interpreter/eval/foreach');
    
    // Create shadow for iteration
    const forEnv = env.createChild();
    const result = await evaluateForExpression(forExpr, forEnv);
    
    // Merge back results
    env.mergeChild(forEnv);
    
    return result;
  }
  
  /**
   * Visit transformer executable - Built-in pure functions
   */
  async visitTransformer(node: ExecutableDefinition, env: Environment): Promise<EvalResult> {
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
  async visitSection(node: ExecutableDefinition, env: Environment): Promise<EvalResult> {
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
  async visitResolver(node: ExecutableDefinition, env: Environment): Promise<EvalResult> {
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
          typeInfo = `executable (${execType})`;
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
    return {
      type: execVar.executableType,
      template: execVar.template,
      language: execVar.language,
      syntaxInfo: execVar.syntaxInfo,
      body: execVar.body,
      whenExpression: execVar.whenExpression,
      forExpression: execVar.forExpression,
      sectionSelector: execVar.sectionSelector,
      resolverInfo: execVar.resolverInfo,
      commandRef: execVar.commandRef
    } as ExecutableDefinition;
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
          const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');
          const value = await extractVariableValue(arg, env);
          processed.push(value);
        } else if (arg.type === 'Text') {
          processed.push(arg.content || '');
        } else if (arg.type === 'Number') {
          processed.push(arg.value);
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
        const value = i < args.length ? args[i] : undefined;
        
        // Create parameter variable preserving type information
        const paramVar = VariableFactory.createParameter(paramName, value);
        execEnv.setVariable(paramName, paramVar);
      }
    }
    
    // Apply captured shadow environments if present
    if (commandVariable.metadata?.capturedShadowEnvs) {
      ShadowEnvironmentManager.applyCaptured(
        execEnv,
        commandVariable.metadata.capturedShadowEnvs
      );
    }
    
    // Handle pipeline context if needed
    if (withClause?.pipeline) {
      // If we have execContext, use context manager for pipeline variables
      if (execContext) {
        this.contextManager.createPipelineVariables(execContext, execEnv);
      }
    }
    
    return execEnv;
  }
  
  /**
   * Execute with pipeline
   */
  private async executeWithPipeline(
    node: ExecInvocation,
    executableNode: ExecutableNode,
    env: Environment,
    args: any[],
    execContext: any,
    evaluator?: IEvaluator
  ): Promise<EvalResult> {
    if (!node.withClause?.pipeline) {
      throw new Error('executeWithPipeline called without pipeline');
    }
    
    // Import pipeline executor
    const { executePipeline } = await import('@interpreter/eval/pipeline/unified-processor');
    
    // Use context manager to create retryable source
    const retryableSource = this.contextManager.createRetryableSource(
      executableNode.getDefinition(),
      execContext,
      this,
      env,
      args
    );
    
    // NO SYNTHETIC SOURCE NEEDED WITH UNIVERSAL CONTEXT!
    const normalizedPipeline = node.withClause.pipeline;
    
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[ExecInvocationEvaluator] Universal Context Pipeline:', {
        hasRetryableSource: !!retryableSource,
        pipelineLength: normalizedPipeline.length,
        stages: normalizedPipeline.map((p: any) => p.rawIdentifier || 'unknown')
      });
    }
    
    // Get initial value from first execution
    const initialResult = await executableNode.accept(this, env);
    const initialValue = typeof initialResult.value === 'string'
      ? initialResult.value
      : JSON.stringify(initialResult.value);
    
    // Execute the pipeline with universal context
    const pipelineResult = await executePipeline(
      initialValue,
      normalizedPipeline,
      env,
      node.location,
      node.withClause.format,
      true,  // isRetryable - ALWAYS true in universal context
      retryableSource,
      false  // hasSyntheticSource - ALWAYS false with universal context!
    );
    
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
    env: Environment
  ): Promise<EvalResult> {
    // Prepare parameters for auto-unwrapping
    const params = new Map<string, any>();
    env.getAllVariables().forEach((value, key) => {
      params.set(key, value);
    });
    
    // Store metadata before unwrapping
    for (const [name, value] of params) {
      if (isLoadContentResultArray(value.value)) {
        globalMetadataShelf.storeMetadata(value.value);
      }
    }
    
    // Auto-unwrap parameters for JS execution
    const unwrappedParams = await this.autoUnwrapManager.unwrapForJavaScript(params, env);
    
    // Execute JavaScript code
    const result = await env.executeJavaScript(code, unwrappedParams);
    
    // Restore metadata if needed
    if (Array.isArray(result)) {
      const restored = globalMetadataShelf.restoreMetadata(result);
      return { value: restored, env };
    }
    
    return { value: result, env };
  }
  
  /**
   * Execute Python code
   */
  private async executePython(
    code: string,
    env: Environment
  ): Promise<EvalResult> {
    // Capture shadow environment for Python
    const shadowEnv = ShadowEnvironmentManager.prepare(env, 'python');
    
    // Execute Python code with shadow environment
    const result = await env.executePython(code, {
      variables: shadowEnv.variables
    });
    
    return { value: result.output || '', env };
  }
  
  /**
   * Execute Bash code
   */
  private async executeBash(
    code: string,
    env: Environment
  ): Promise<EvalResult> {
    // Prepare environment variables for Bash
    const envVars: Record<string, string> = {};
    
    env.getAllVariables().forEach((variable, name) => {
      // Convert variables to string representation for Bash
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
    });
    
    // Execute Bash script
    const result = await env.executeCommand(code, {
      env: envVars
    });
    
    return {
      value: result.stdout || '',
      env
    };
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