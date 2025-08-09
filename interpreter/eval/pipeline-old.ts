import type { Environment } from '../env/Environment';
import type { PipelineCommand } from '@core/types';
import { MlldCommandExecutionError, MlldError } from '@core/errors';
import { interpolate } from '../core/interpreter';
import { createPipelineInput, isPipelineInput } from '../utils/pipeline-input';
import { 
  createSimpleTextVariable, 
  createPipelineInputVariable,
  type VariableSource 
} from '@core/types/variable';
import { logger } from '@core/utils/logger';

/**
 * System-level pipeline state for internal execution tracking
 * This tracks the actual execution state and retry logic
 */
interface SystemPipelineState {
  // Core execution tracking
  previousOutputs: string[];                    // Outputs from completed stages
  currentStageIndex: number;                    // Current stage being executed
  
  // 🏆 RETRY OWNERSHIP MODEL - The elegant solution
  stageLastRetrySource: Map<number, number>;    // stage → which retry stage last affected it
  retrySourceCounts: Map<number, number>;       // retry_stage → count of retries from that source
  stageAttemptHistory: Map<number, string[]>;   // Previous outputs per stage
  
  // Named variables from for loops
  stageVariables: Map<string, any>;             // Named variables from for loops
  
  // Global retry tracking
  retryGeneration: number;                      // Number of full pipeline restarts
  lastRetryStage: number;                       // Which stage caused the last retry (-1 if no retry)
  
  // 🏆 UNIFIED RETRY TRACKING - Ledger as Source of Truth
  attemptLedger: Array<{
    attemptNumber: number;
    progressMade: string;      // Key output before retry occurred
    retrySource: number;       // ✨ Unified terminology: which stage caused retry
    cascadeScope: number[];    // Which stages this retry affects
    stagesCompleted: number;   // How far we got
  }>;
  currentAttemptNumber: number;    // Global attempt counter (1, 2, 3...)
  currentAttemptOutputs: string[]; // Outputs from current attempt
}

/**
 * Interface-level pipeline context for @pipeline variable
 * This is what user functions see - clean, stage-specific interface
 */
interface InterfacePipelineContext {
  // Current stage info (what the function executing sees)
  try: number;                                  // This stage's attempt number
  tries: string[];                              // This stage's previous attempts
  stage: number;                                // Current stage number (1-indexed)
  
  // Pipeline data access
  [index: number]: string;                      // Indexed access to pipeline outputs
  length: number;                               // Number of previous outputs
  
  // Named variables from for loops
  [name: string]: any;                          // Dynamic properties from stageVariables
}

/**
 * 🏆 UNIFIED RETRY TRACKING: Compute ownership state from ledger
 * 
 * This function calculates the ownership maps from the ledger events,
 * ensuring the ledger is the single source of truth for retry information.
 */
function updateOwnershipFromLedger(systemState: SystemPipelineState): void {
  // Store existing ownership before clearing (if any)
  const existingOwnership = new Map(systemState.stageLastRetrySource);
  
  // Reset ownership maps
  systemState.stageLastRetrySource.clear();
  systemState.retrySourceCounts.clear();
  
  // Process ledger entries to compute ownership
  for (const entry of systemState.attemptLedger) {
    const { retrySource, cascadeScope } = entry;
    
    // Count retries per source
    const currentCount = systemState.retrySourceCounts.get(retrySource) || 0;
    systemState.retrySourceCounts.set(retrySource, currentCount + 1);
    
    // Set ownership for affected stages, but preserve existing ownership from before this update
    // WHY: Each stage should be owned by the FIRST retry source that affected it,
    // not the most recent one. This prevents cascade interference between independent retry units.
    for (const stageIndex of cascadeScope) {
      if (!systemState.stageLastRetrySource.has(stageIndex)) {
        // Check if stage had existing ownership that should be preserved
        const existingOwner = existingOwnership.get(stageIndex);
        if (existingOwner !== undefined) {
          systemState.stageLastRetrySource.set(stageIndex, existingOwner);
        } else {
          systemState.stageLastRetrySource.set(stageIndex, retrySource);
        }
      }
    }
  }
}

/**
 * Execute a pipeline of transformation commands with @input threading
 */
export async function executePipeline(
  baseOutput: string,
  pipeline: PipelineCommand[],
  env: Environment,
  location?: any,
  format?: string
): Promise<string> {
  let currentOutput = baseOutput;
  
  // System-level pipeline state tracking with RETRY OWNERSHIP MODEL
  const systemState: SystemPipelineState = {
    previousOutputs: [],
    currentStageIndex: 0,
    stageLastRetrySource: new Map(),        // 🏆 Ownership tracking
    retrySourceCounts: new Map(),           // 🏆 Source-based counting
    stageAttemptHistory: new Map(),
    stageVariables: new Map(),
    retryGeneration: 0,
    lastRetryStage: -1,
    
    // 🏆 PIPELINE ATTEMPT LEDGER - Global coordination
    attemptLedger: [],                      // History of previous attempts
    currentAttemptNumber: 1,               // Start with attempt 1
    currentAttemptOutputs: []              // Track current attempt outputs
  };
  
  for (let i = 0; i < pipeline.length; i++) {
    const command = pipeline[i];
    
    // Update current stage index in system state
    systemState.currentStageIndex = i;
    
    // Set enhanced pipeline context in the environment
    // Calculate attempt count using ownership model for environment context
    const getStageAttemptCountForEnv = (stageIndex: number): number => {
      // Defensive check: ensure Maps exist
      if (!systemState.stageLastRetrySource || !systemState.retrySourceCounts) {
        return 1; // Fallback to first attempt
      }
      
      const retrySource = systemState.stageLastRetrySource.get(stageIndex);
      if (retrySource === undefined) {
        return 1;
      }
      const sourceRetryCount = systemState.retrySourceCounts.get(retrySource) || 0;
      return sourceRetryCount + 1;
    };
    
    env.setPipelineContext({
      stage: i + 1,
      totalStages: pipeline.length,
      currentCommand: command.rawIdentifier,
      input: currentOutput,
      previousOutputs: [...systemState.previousOutputs],
      format: format,  // Don't default - let it be undefined for backwards compatibility
      attemptCount: getStageAttemptCountForEnv(i),
      attemptHistory: systemState.stageAttemptHistory.get(i) || [],
      stageVariables: Object.fromEntries(systemState.stageVariables)
    });
    
    // Create child environment with @input variable
    const pipelineEnv = env.createChild();
    
    /**
     * Create pipeline input for this stage
     * WHY: Each pipeline stage receives either a simple string (no format) or
     * a special PipelineInput object (with format) that provides both raw text
     * and lazily-parsed format-specific data (JSON, CSV, XML).
     * CRITICAL: When no format is specified, we pass raw strings for backwards
     * compatibility. Only create PipelineInput when format is explicitly set.
     * CONTEXT: Pipeline functions work with raw data transformations, not mlld
     * Variable types, so we extract values at pipeline boundaries.
     */
    const inputSource: VariableSource = {
      directive: 'var',
      syntax: 'template',
      hasInterpolation: false,
      isMultiLine: false
    };
    
    let inputVar;
    
    if (format) {
      // Only create PipelineInput when format is specified
      if (process.env.MLLD_DEBUG === 'true') {
        logger.debug('Creating PipelineInput with format:', {
          stage: i + 1,
          format,
          currentOutputType: typeof currentOutput,
          currentOutputLength: typeof currentOutput === 'string' ? currentOutput.length : 'N/A'
        });
      }
      
      const pipelineInputObj = createPipelineInput(currentOutput, format);
      
      inputVar = createPipelineInputVariable(
        'input',
        pipelineInputObj,
        format as 'json' | 'csv' | 'xml' | 'text',
        currentOutput,
        inputSource,
        i + 1, // stage number
        {
          isSystem: true,
          isPipelineInput: true
        }
      );
    } else {
      // No format - create a simple text variable for backwards compatibility
      if (process.env.MLLD_DEBUG === 'true') {
        logger.debug('Creating simple text input (no format):', {
          stage: i + 1,
          currentOutputType: typeof currentOutput,
          currentOutputLength: typeof currentOutput === 'string' ? currentOutput.length : 'N/A'
        });
      }
      
      inputVar = createSimpleTextVariable(
        'input',
        currentOutput,
        inputSource,
        {
          isSystem: true,
          isPipelineParameter: true
        }
      );
    }
    
    /**
     * Set @input as parameter variable
     * WHY: Parameter variables can override reserved names and are accessible in
     * all execution contexts (templates, commands, functions).
     * CONTEXT: Child environment ensures @input is scoped to this pipeline stage only.
     */
    pipelineEnv.setParameterVariable('input', inputVar);
    
    /**
     * Initialize stage attempt history if needed
     * WHY: Ensure the stage has an empty array to start with if it hasn't been created yet
     */
    if (!systemState.stageAttemptHistory.has(i)) {
      systemState.stageAttemptHistory.set(i, []);
    }

    /**
     * Create clean interface context for this stage
     * WHY: Each stage should see its own attempt count and history, not the global state.
     * This implements the two-layer architecture: system state vs interface context.
     */
    const createStageContext = () => {
      const interfaceContext = createInterfacePipelineContext(baseOutput, systemState, i);
      const pipelineVar = createPipelineContextVariable('pipeline', interfaceContext, inputSource);
      pipelineEnv.setParameterVariable('pipeline', pipelineVar);
      
      // Also set @p as an alias for convenience in pipeline contexts
      pipelineEnv.setParameterVariable('p', pipelineVar);
      
      if (process.env.MLLD_DEBUG === 'true') {
        const retrySource = systemState.stageLastRetrySource?.get(i);
        const ownershipInfo = retrySource !== undefined ? `owned_by=s${retrySource + 1}` : 'unowned';
        console.log(`🔧 STAGE CONTEXT CREATED: stage=${i + 1}, try=${interfaceContext.try}, tries=${interfaceContext.tries.length}, ${ownershipInfo}`);
        console.error(`🚨 DEBUG MARKER: Stage ${i + 1} context creation reached! Try count: ${interfaceContext.try}`);
      }
      
      return interfaceContext;
    };
    
    try {
      /**
       * CRITICAL: Create fresh interface context right before execution
       * This ensures the stage sees up-to-date attempt counts after any retries.
       */
      const currentStageContext = createStageContext();
      
      // Resolve the command reference
      const commandVar = await resolveCommandReference(command, pipelineEnv);
      
      if (!commandVar) {
        throw new MlldCommandExecutionError(
          `Pipeline command ${command.rawIdentifier} not found`,
          location,
          {
            command: command.rawIdentifier,
            exitCode: 1,
            duration: 0,
            workingDirectory: process.cwd()
          }
        );
      }
      
      // Debug logging
      if (process.env.MLLD_DEBUG === 'true') {
        logger.debug('Pipeline command resolved:', {
          rawIdentifier: command.rawIdentifier,
          commandVarType: commandVar?.type,
          hasValue: !!commandVar?.value,
          valueType: commandVar?.value?.type
        });
      }
      
      // Execute the command with @INPUT as the first argument if no args provided
      let args = command.args || [];
      
      // Validate arguments - prevent explicit @input passing
      for (const arg of args) {
        if (arg && typeof arg === 'object') {
          const isInputVariable = 
            (arg.type === 'variable' && arg.name === 'input') ||
            (arg.type === 'VariableReference' && arg.identifier === 'input');
          
          if (isInputVariable) {
            throw new MlldError(
              '@input is a special variable that is automatically available in pipelines - you don\'t need to pass it explicitly.\n\n' +
              'In pipelines, @input is implicitly passed to the first parameter of your function.\n\n' +
              'Instead of: /var @result = "test"|@myFunc(@input)\n' +
              'Just use:   /var @result = "test"|@myFunc\n\n' +
              'Your function should declare a parameter to receive @input:\n' +
              '/exe @myFunc(data) = js { return data.toUpperCase(); }',
              location
            );
          }
        }
      }
      
      // Evaluate arguments if they are variable references or other nodes
      const evaluatedArgs = [];
      for (const arg of args) {
        if (process.env.MLLD_DEBUG === 'true') {
          logger.debug('Pipeline arg evaluation:', {
            argType: typeof arg,
            argNodeType: arg?.type,
            argContent: typeof arg === 'string' ? arg : arg?.content,
            argIdentifier: arg?.identifier
          });
        }
        
        if (typeof arg === 'string') {
          evaluatedArgs.push({ type: 'Text', content: arg });
        } else if (arg && typeof arg === 'object') {
          // Check if this is already a resolved Variable (not a VariableReference node)
          if (arg.type === 'variable' || (arg.name && arg.value !== undefined)) {
            // This is likely a variable reference that needs to be looked up
            // Try pipeline environment first for pipeline-specific variables (@p, @input)
            let actualVariable = pipelineEnv.getVariable(arg.name);
            if (!actualVariable) {
              // Fall back to parent environment for user variables
              actualVariable = env.getVariable(arg.name);
            }
            
            if (actualVariable) {
              const { extractVariableValue } = await import('../utils/variable-resolution');
              const value = await extractVariableValue(actualVariable, env);
              evaluatedArgs.push({ type: 'Text', content: value });
            } else {
              evaluatedArgs.push({ type: 'Text', content: arg });
            }
          } else if (arg.type === 'VariableReference') {
            // Handle variable references directly
            const varRef = arg as any;
            
            // Try pipeline environment first for pipeline-specific variables (@p, @input)
            let variable = pipelineEnv.getVariable(varRef.identifier);
            
            // Fall back to parent environment for user variables
            if (!variable) {
              variable = env.getVariable(varRef.identifier);
            }
            
            if (!variable) {
              throw new Error(`Variable not found: ${varRef.identifier}`);
            }
            
            // Extract variable value for pipeline arguments - WHY: Pipeline arguments need raw values
            const { resolveVariable, ResolutionContext } = await import('../utils/variable-resolution');
            
            if (process.env.MLLD_DEBUG === 'true') {
              logger.debug('Resolving pipeline argument variable:', {
                identifier: varRef.identifier,
                variableType: variable?.type,
                variableValue: typeof variable?.value === 'string' ? variable.value : typeof variable?.value,
                hasValue: variable?.value !== undefined
              });
            }
            
            // Use env (not pipelineEnv) for resolution since the variable might be from parent scope
            const value = await resolveVariable(variable, env, ResolutionContext.PipelineInput);
            
            
            if (process.env.MLLD_DEBUG === 'true') {
              logger.debug('Resolved pipeline argument value:', {
                identifier: varRef.identifier,
                resolvedType: typeof value,
                resolvedValue: typeof value === 'string' ? value : typeof value,
                isNull: value === null,
                isUndefined: value === undefined
              });
            }
            
            // Apply field access if present
            let finalValue = value;
            if (varRef.fields && varRef.fields.length > 0) {
              const { accessFields } = await import('../utils/field-access');
              finalValue = await accessFields(value, varRef.fields);
            }
            
            // Pass the actual value, not stringified
            // WHY: JavaScript functions need the actual object, not a JSON string
            // CONTEXT: When passing @p (pipeline context) to functions, they need the object
            
            if (process.env.MLLD_DEBUG === 'true') {
              logger.debug('Evaluated variable reference:', {
                identifier: varRef.identifier,
                resolvedValue: value,
                valueType: typeof finalValue
              });
            }
            
            // Pass objects directly, only stringify primitives for text content
            evaluatedArgs.push({ 
              type: 'Text', 
              content: typeof finalValue === 'object' ? finalValue : String(finalValue)
            });
          } else {
            // For other node types, interpolate using pipelineEnv for variable resolution
            const value = await interpolate([arg], pipelineEnv);
            evaluatedArgs.push({ type: 'Text', content: value });
          }
        }
      }
      args = evaluatedArgs;
      
      /**
       * Smart parameter binding for pipeline functions
       * WHY: When piping to functions without explicit arguments (e.g., @uppercase),
       * we need to intelligently bind the pipeline data to function parameters.
       * GOTCHA: Multi-parameter functions attempt JSON destructuring - if the input
       * is a JSON object with matching property names, values are extracted and
       * mapped to parameters by name.
       * CONTEXT: This enables patterns like: echo '{"name": "Alice", "age": 30}' | @process
       * where @process(name, age) receives the destructured values.
       */
      if (args.length === 0) {
        // Get the actual parameter names from the executable definition
        let paramNames: string[] | undefined;
        if (commandVar && commandVar.type === 'executable' && commandVar.value) {
          paramNames = commandVar.value.paramNames;
        } else if (commandVar && commandVar.paramNames) {
          paramNames = commandVar.paramNames;
        }
        
        if (paramNames && paramNames.length > 0) {
          // Auto-unwrap LoadContentResult objects before passing to functions
          const { AutoUnwrapManager } = await import('./auto-unwrap-manager');
          const unwrappedOutput = AutoUnwrapManager.unwrap(currentOutput);
          
          // Single parameter - pass unwrapped input directly
          if (paramNames.length === 1) {
            args = [{ type: 'Text', content: unwrappedOutput }];
          } 
          // Multiple parameters - try smart JSON destructuring
          else {
            try {
              const parsed = JSON.parse(unwrappedOutput);
              if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                // Map JSON object properties to parameters by name
                args = paramNames.map(name => {
                  const value = parsed[name];
                  const content = value !== undefined ? 
                    (typeof value === 'string' ? value : JSON.stringify(value)) : 
                    '';
                  return {
                    type: 'Text',
                    content
                  };
                });
              } else {
                // Not an object, just pass as first parameter
                args = [{ type: 'Text', content: unwrappedOutput }];
              }
            } catch {
              // Not JSON, pass as first parameter
              args = [{ type: 'Text', content: unwrappedOutput }];
            }
          }
        }
      }
      
      // Execute pipeline stage with metadata preservation for LoadContentResult objects
      const { AutoUnwrapManager } = await import('./auto-unwrap-manager');
      
      if (process.env.MLLD_DEBUG === 'true') {
        logger.debug('[pipeline] About to execute stage with preservation:', {
          stage: i + 1,
          currentOutputType: typeof currentOutput,
          currentOutputConstructor: currentOutput?.constructor?.name,
          hasContentProperty: currentOutput && typeof currentOutput === 'object' && 'content' in currentOutput,
          hasFilenameProperty: currentOutput && typeof currentOutput === 'object' && 'filename' in currentOutput
        });
      }
      
      const result = await AutoUnwrapManager.executeWithPreservation(async () => {
        if (process.env.MLLD_DEBUG === 'true') {
          logger.debug('[pipeline] Inside executeWithPreservation callback');
        }
        return await executeCommandVariable(commandVar, args, pipelineEnv, currentOutput);
      });
      
      if (process.env.MLLD_DEBUG === 'true') {
        logger.debug('Pipeline stage result:', {
          stage: i,
          command: command.rawIdentifier,
          resultLength: result?.length,
          resultPreview: result ? String(result).substring(0, 100) : null,
          resultType: typeof result
        });
      }
      
      /**
       * Check for retry signal in result
       * WHY: Functions can return 'retry' to signal pipeline should re-execute current stage.
       * CONTEXT: Retry mechanism enables sophisticated validation and retry logic.
       */
      if (isRetrySignal(result)) {
        /**
         * TWO-LAYER RETRY ARCHITECTURE
         * 
         * When a stage retries, we need to:
         * 1. Update system state - track the retry event  
         * 2. Increment attempt counters for ALL stages that will re-execute
         * 3. Clear previous outputs and restart from stage 0
         * 4. Each stage will then see its correct attempt count in interface context
         */
        
        const failingStage = i;
        
        // Calculate current attempts using ownership model
        const getStageAttemptCount = (stageIndex: number): number => {
          const retrySource = systemState.stageLastRetrySource.get(stageIndex);
          if (retrySource === undefined) {
            return 1; // First attempt
          }
          const sourceRetryCount = systemState.retrySourceCounts.get(retrySource) || 0;
          return sourceRetryCount + 1;
        };
        
        const currentAttempts = getStageAttemptCount(failingStage);
        
        // Store this attempt's output in the failing stage's history
        const attempts = systemState.stageAttemptHistory.get(failingStage) || [];
        attempts.push(currentOutput);
        systemState.stageAttemptHistory.set(failingStage, attempts);
        
        // Check retry limit for the failing stage
        if (currentAttempts >= 10) {
          throw new MlldCommandExecutionError(
            `Maximum retry attempts (10) exceeded at pipeline stage ${failingStage + 1}`,
            location,
            {
              command: command.rawIdentifier,
              attempts: currentAttempts,
              exitCode: 1
            }
          );
        }
        
        // Update global retry tracking
        systemState.retryGeneration++;
        systemState.lastRetryStage = failingStage;
        
        /**
         * 🏆 UNIFIED RETRY TRACKING: Record this attempt in the ledger (source of truth)
         */
        const retrySource = failingStage;
        
        /**
         * 🎯 CASCADE SCOPE: Include all stages from 0 to failing stage
         * WHY: When stage N retries, all previous stages need to be re-executed.
         * The ownership preservation logic in updateOwnershipFromLedger prevents
         * interference between independent retry units.
         */
        const cascadeScope = Array.from({ length: failingStage + 1 }, (_, i) => i); // [0, 1, ..., failingStage]
        
        systemState.attemptLedger.push({
          attemptNumber: systemState.currentAttemptNumber,
          progressMade: systemState.previousOutputs[systemState.previousOutputs.length - 1] || baseOutput,        // Last successful output before retry
          retrySource: retrySource,          // ✨ Unified terminology: stage that caused retry
          cascadeScope: cascadeScope,        // Which stages will be affected by restart
          stagesCompleted: failingStage      // How far we got (0-indexed)
        });
        
        // Increment global attempt number for next attempt
        systemState.currentAttemptNumber++;
        systemState.currentAttemptOutputs = []; // Reset for next attempt
        
        /**
         * 🏆 COMPUTED OWNERSHIP STATE: Calculate ownership from ledger (derived state)
         * This ensures ledger and ownership stay perfectly in sync
         */
        updateOwnershipFromLedger(systemState);
        
        if (process.env.MLLD_DEBUG === 'true') {
          console.log(`📝 ATTEMPT LEDGER: Recorded attempt ${systemState.currentAttemptNumber - 1}, progress: "${currentOutput.substring(0, 50)}..."`);
          console.log(`🔢 NEXT ATTEMPT: ${systemState.currentAttemptNumber}`);
          console.log(`🧮 OWNERSHIP RECOMPUTED: from ${systemState.attemptLedger.length} ledger entries`);
        }
        
        /**
         * PIPELINE RESTART: Clear outputs and restart from beginning
         * WHY: We need all previous stages to re-execute with new attempt counts
         */
        systemState.previousOutputs = [];
        systemState.currentStageIndex = 0;
        currentOutput = baseOutput;  // Reset to original input
        
        // Restart pipeline from stage 0  
        i = -1;  // Will become 0 after continue increments
        continue;
      }
      
      /**
       * Pipeline termination check
       * WHY: Empty output signals intentional pipeline termination, allowing
       * early exit from multi-stage pipelines.
       * CONTEXT: This is a control flow mechanism, not an error condition.
       */
      if (!result || result.trim() === '') {
        // Pipeline terminates early with empty result
        return '';
      }
      
      /**
       * Stage output becomes next stage input
       * WHY: Pipeline stages are sequential transformations where each stage's
       * output feeds into the next stage as a raw string.
       * GOTCHA: The output is always stringified, even if the function returned
       * an object or array - serialization happens at stage boundaries.
       */
      // Ensure result is a string for next pipeline stage
      if (typeof result === 'string') {
        currentOutput = result;
      } else if (result && typeof result === 'object') {
        // Check if this looks like a LoadContentResult object
        if ('content' in result && 'filename' in result && typeof result.content === 'string') {
          currentOutput = result.content;
        } else {
          // For other objects, use JSON stringification
          currentOutput = JSON.stringify(result);
        }
      } else {
        // For other types (numbers, booleans, null), convert to string
        currentOutput = String(result);
      }
      
      // Store this stage's output in pipeline state
      systemState.previousOutputs.push(currentOutput);
      
      // NOTE: We don't clear attempt counters on success in the new architecture
      // The attempt counts persist to show the final try count each stage reached
      // This is intentional - each stage remembers how many attempts it took
      
    } catch (error) {
      // Clear pipeline context on error
      env.clearPipelineContext();
      
      // Enhance error with pipeline context
      if (error instanceof MlldCommandExecutionError) {
        throw new MlldCommandExecutionError(
          `Pipeline step ${i + 1} failed: ${error.message}`,
          location || error.sourceLocation,
          {
            command: command.rawIdentifier,
            exitCode: error.exitCode || 1,
            duration: 0,
            stdout: error.output,
            workingDirectory: process.cwd()
          }
        );
      }
      throw error;
    }
  }
  
  // Clear pipeline context when done
  env.clearPipelineContext();
  
  // Debug logging
  if (process.env.MLLD_DEBUG === 'true') {
    logger.debug('executePipeline returning:', {
      currentOutput,
      currentOutputType: typeof currentOutput,
      isNull: currentOutput === null,
      isUndefined: currentOutput === undefined,
      length: typeof currentOutput === 'string' ? currentOutput.length : 'N/A'
    });
  }
  
  return currentOutput;
}

/**
 * Helper function to detect retry signal
 */
function isRetrySignal(result: any): boolean {
  // Check both direct string and evaluate result structure
  return result === 'retry' || (result && result.value === 'retry');
}

/**
 * Create pipeline context object with array indexing support
 */
/**
 * Create clean interface context from system state for a specific stage
 * This separates what the user sees from internal execution tracking
 */
function createInterfacePipelineContext(
  baseOutput: string, 
  systemState: SystemPipelineState, 
  currentStage: number
): InterfacePipelineContext {
  // 🏆 RETRY OWNERSHIP MODEL: Calculate try count based on ownership
  const getStageAttemptCount = (stageIndex: number): number => {
    // Defensive check: ensure Maps exist
    if (!systemState.stageLastRetrySource || !systemState.retrySourceCounts) {
      console.error('Pipeline state maps not initialized:', {
        hasStageLastRetrySource: !!systemState.stageLastRetrySource,
        hasRetrySourceCounts: !!systemState.retrySourceCounts,
        systemState: Object.keys(systemState || {})
      });
      return 1; // Fallback to first attempt
    }
    
    const retrySource = systemState.stageLastRetrySource.get(stageIndex);
    if (retrySource === undefined) {
      // Stage never affected by any retry - first attempt
      return 1;
    }
    // Stage owned by retry source - use source's retry count + 1
    const sourceRetryCount = systemState.retrySourceCounts.get(retrySource) || 0;
    const finalTryCount = sourceRetryCount + 1;
    
    // Debug logging for multi-stage try count issue
    if (process.env.MLLD_DEBUG === 'true') {
      console.log(`🔍 TRY COUNT CALC: stage=${stageIndex}, retrySource=${retrySource}, sourceRetryCount=${sourceRetryCount}, finalTryCount=${finalTryCount}`);
    }
    
    return finalTryCount;
  };


  const context: any = {
    // 🏆 STAGE-SCOPED ATTEMPT DATA: Each stage sees its own try count and history
    try: getStageAttemptCount(currentStage),  // Stage-specific attempt number
    tries: systemState.stageAttemptHistory.get(currentStage) || [],  // Stage-specific attempt history (as array)
    stage: currentStage + 1,
    
    // Global coordination (for debugging/diagnostics)
    globalTry: systemState.currentAttemptNumber,
    
    // Pipeline data access
    0: baseOutput,                                    // Input to pipeline
    length: systemState.previousOutputs.length,      // Number of previous outputs
    
    // Named variables from for loops (if any)
    ...Object.fromEntries(systemState.stageVariables)
  };
  
  // Add previous stage outputs with 1-indexed access  
  systemState.previousOutputs.forEach((output, idx) => {
    context[idx + 1] = output;
  });
  
  // Add negative indexing support via getters
  Object.defineProperty(context, -1, {
    get: () => systemState.previousOutputs[systemState.previousOutputs.length - 1],
    enumerable: false
  });
  
  Object.defineProperty(context, -2, {
    get: () => systemState.previousOutputs[systemState.previousOutputs.length - 2],
    enumerable: false
  });
  
  // Add more negative indices as needed
  for (let i = 3; i <= Math.max(10, systemState.previousOutputs.length); i++) {
    Object.defineProperty(context, -i, {
      get: () => systemState.previousOutputs[systemState.previousOutputs.length - i],
      enumerable: false
    });
  }
  
  return context as InterfacePipelineContext;
}

/**
 * Legacy wrapper for backwards compatibility
 * TODO: Remove once all callers are updated
 */
function createPipelineContextObject(baseOutput: string, pipelineState: any, currentStage: number): any {
  return createInterfacePipelineContext(baseOutput, pipelineState, currentStage);
}

/**
 * Create pipeline context variable wrapper
 */
function createPipelineContextVariable(name: string, context: any, source: VariableSource): any {
  return {
    type: 'object',
    name,
    value: context,
    metadata: {
      isPipelineContext: true,
      source,
      isSystem: true
    }
  };
}

/**
 * Resolve a command reference to an executable variable
 */
async function resolveCommandReference(
  command: PipelineCommand,
  env: Environment
): Promise<any> {
  // The command.identifier is already an array of nodes from the parser
  if (!command.identifier || command.identifier.length === 0) {
    return null;
  }
  
  // Use the first node (should be a VariableReference node)
  const varRefNode = command.identifier[0];
  
  // Check if this is a variable reference with field access
  if (varRefNode.type === 'VariableReference') {
    const varRef = varRefNode as any;
    const baseVar = env.getVariable(varRef.identifier);
    
    if (!baseVar) {
      return null;
    }
    
    // For executable variables (like transformers), return the variable itself
    // For other types, we might need to resolve field access
    if (baseVar.type === 'executable') {
      return baseVar;
    }
    
    /**
     * Extract value for non-executable variables
     * WHY: Pipeline commands need raw values, not Variable wrappers. Only
     * executable variables (functions) are preserved for invocation.
     * CONTEXT: This extraction point ensures data variables are unwrapped
     * before being used as pipeline transformers.
     */
    const { extractVariableValue } = await import('../utils/variable-resolution');
    let value = await extractVariableValue(baseVar, env);
    
    // Navigate through field access if present
    if (varRef.fields && varRef.fields.length > 0) {
      for (const field of varRef.fields) {
        if ((field.type === 'field' || field.type === 'stringIndex' || field.type === 'numericField') && typeof value === 'object' && value !== null) {
          value = (value as Record<string, unknown>)[String(field.value)];
        } else if (field.type === 'arrayIndex' && Array.isArray(value)) {
          value = value[Number(field.value)];
        } else {
          const fieldName = String(field.value);
          throw new Error(`Cannot access field '${fieldName}' on ${typeof value}`);
        }
      }
    }
    
    // Return the resolved value
    return value;
  }
  
  return null;
}

/**
 * Execute a command variable with arguments
 */
async function executeCommandVariable(
  commandVar: any,
  args: any[],
  env: Environment,
  stdinInput?: string
): Promise<string> {
  /**
   * Built-in transformer handling
   * WHY: Built-in transformers like @JSON, @CSV, @XML have direct implementations
   * that don't go through the executable variable system for performance.
   * CONTEXT: These transformers receive raw string input and return transformed strings.
   */
  if (commandVar && commandVar.metadata?.isBuiltinTransformer && commandVar.metadata?.transformerImplementation) {
    try {
      const result = await commandVar.metadata.transformerImplementation(stdinInput || '');
      return String(result);
    } catch (error) {
      throw new MlldCommandExecutionError(
        `Transformer ${commandVar.name} failed: ${error.message}`,
        undefined,
        {
          command: commandVar.name,
          exitCode: 1,
          duration: 0,
          workingDirectory: process.cwd()
        }
      );
    }
  }
  
  // Handle both wrapped executable variables and direct definitions
  let execDef: any;
  
  if (commandVar && commandVar.type === 'executable' && commandVar.value) {
    // Check if we have the full ExecutableDefinition in metadata
    if (commandVar.metadata?.executableDef) {
      // Use the full definition from metadata
      execDef = commandVar.metadata.executableDef;
      
      // Also copy paramNames from the variable if not in execDef
      if (!execDef.paramNames && commandVar.paramNames) {
        execDef.paramNames = commandVar.paramNames;
      }
    } else {
      // Fall back to the simplified value structure
      // Map the simplified structure to what the pipeline expects
      const simplifiedValue = commandVar.value;
      if (simplifiedValue.type === 'code') {
        execDef = {
          type: 'code',
          codeTemplate: simplifiedValue.template, // template is already nodes from exe.ts
          language: simplifiedValue.language || 'javascript',
          paramNames: commandVar.paramNames || []
        };
      } else if (simplifiedValue.type === 'command') {
        execDef = {
          type: 'command',
          commandTemplate: simplifiedValue.template, // template is already nodes from exe.ts
          paramNames: commandVar.paramNames || []
        };
      } else {
        execDef = simplifiedValue;
      }
    }
    
    // Debug logging
    if (process.env.MLLD_DEBUG === 'true') {
      logger.debug('Executable definition extracted:', {
        type: execDef?.type,
        hasParamNames: !!execDef?.paramNames,
        hasCommandTemplate: !!execDef?.commandTemplate,
        hasCodeTemplate: !!execDef?.codeTemplate,
        hasTemplateContent: !!execDef?.templateContent,
        hasTemplate: !!execDef?.template,
        language: execDef?.language,
        fromMetadata: !!commandVar.metadata?.executableDef
      });
    }
  } else if (commandVar && (commandVar.type === 'command' || commandVar.type === 'code' || commandVar.type === 'template') && (commandVar.commandTemplate || commandVar.codeTemplate || commandVar.templateContent)) {
    // This is a direct executable definition
    execDef = commandVar;
  } else {
    // Enhanced error message with more detail
    const varInfo = {
      type: commandVar?.type,
      hasValue: !!commandVar?.value,
      valueType: commandVar?.value?.type,
      valueKeys: commandVar?.value ? Object.keys(commandVar.value) : [],
      hasCommandTemplate: !!(commandVar?.commandTemplate),
      hasCodeTemplate: !!(commandVar?.codeTemplate),
      hasTemplateContent: !!(commandVar?.templateContent),
      hasTemplate: !!(commandVar?.template),
      keys: commandVar ? Object.keys(commandVar) : [],
      // Deep inspection of value structure
      valueStructure: commandVar?.value ? {
        type: commandVar.value.type,
        hasTemplate: !!(commandVar.value.template),
        hasCodeTemplate: !!(commandVar.value.codeTemplate),
        hasCommandTemplate: !!(commandVar.value.commandTemplate),
        language: commandVar.value.language,
        paramNames: commandVar.value.paramNames
      } : null
    };
    throw new Error(`Cannot execute non-executable variable in pipeline: ${JSON.stringify(varInfo, null, 2)}`);
  }
  
  // Create environment with parameter bindings
  const execEnv = env.createChild();
  
  // Get the format from the pipeline context
  const pipelineCtx = env.getPipelineContext();
  const format = pipelineCtx?.format; // Don't default to json - let it be undefined
  
  /**
   * Parameter binding for executable functions
   * WHY: Pipeline functions need parameters bound from either explicit arguments
   * or the pipeline input. The first parameter gets special handling.
   * CRITICAL: In pipelines, @input ALWAYS binds to the first parameter,
   * and explicit arguments bind to subsequent parameters (starting from the second).
   * CONTEXT: This creates the execution environment where functions can access
   * their parameters by name (e.g., @text in templates).
   */
  if (execDef.paramNames) {
    for (let i = 0; i < execDef.paramNames.length; i++) {
      const paramName = execDef.paramNames[i];
      // In pipelines, explicit args bind starting from the SECOND parameter
      // First parameter always gets @input (stdinInput) implicitly
      const argIndex = pipelineCtx !== undefined && stdinInput !== undefined ? i - 1 : i;
      const argValue = argIndex >= 0 && argIndex < args.length ? args[argIndex] : null;
      
      // First parameter in pipeline context ALWAYS gets @input
      const isPipelineParam = i === 0 && pipelineCtx !== undefined && stdinInput !== undefined;
      
      if (process.env.MLLD_DEBUG === 'true') {
        logger.debug('Parameter binding check:', {
          i,
          paramName,
          argIndex,
          stdinInput: stdinInput ? String(stdinInput).substring(0, 50) + '...' : undefined,
          hasPipelineCtx: !!pipelineCtx,
          isPipelineParam,
          argValue: argValue ? String(argValue).substring(0, 50) + '...' : null
        });
      }
      
      if (isPipelineParam) {
        // First parameter ALWAYS gets the pipeline input (stdinInput)
        // Auto-unwrap LoadContentResult objects before parameter binding
        const { AutoUnwrapManager } = await import('./auto-unwrap-manager');
        const unwrappedStdin = AutoUnwrapManager.unwrap(stdinInput || '');
        const textValue = unwrappedStdin || '';
        
        /**
         * Format-aware parameter binding
         * WHY: Pipeline functions can receive either raw strings (legacy) or
         * format-aware PipelineInput objects that provide lazy parsing.
         * GOTCHA: No format means backwards compatibility - pass raw string.
         * With format, functions get an object with .text, .data, .csv, etc.
         * CONTEXT: This enables format-aware processing while maintaining
         * compatibility with existing string-based functions.
         */
        if (!format) {
          // Create a simple text variable instead of PipelineInput
          const textSource: VariableSource = {
            directive: 'var',
            syntax: 'quoted',
            hasInterpolation: false,
            isMultiLine: false
          };
          
          const textVar = createSimpleTextVariable(
            paramName,
            textValue,
            textSource,
            { isPipelineParameter: true }
          );
          
          execEnv.setParameterVariable(paramName, textVar);
        } else {
          // Create wrapped input with format
          const wrappedInput = createPipelineInput(textValue, format);
          
          // Debug logging
          if (process.env.MLLD_DEBUG === 'true') {
            logger.debug('Creating pipeline parameter:', {
              paramName,
              format,
              textValue: typeof textValue === 'string' ? textValue.substring(0, 50) + '...' : String(textValue),
              wrappedInputKeys: Object.keys(wrappedInput)
            });
          }
          
          // Create a pipeline input variable
          const pipelineSource: VariableSource = {
            directive: 'var',
            syntax: 'template',
            hasInterpolation: false,
            isMultiLine: false
          };
          
          const pipelineVar = createPipelineInputVariable(
            paramName,
            wrappedInput,
            format as 'json' | 'csv' | 'xml' | 'text',
            textValue,
            pipelineSource,
            pipelineCtx?.stage
          );
          
          if (process.env.MLLD_DEBUG === 'true') {
            logger.debug('Setting pipeline parameter variable:', {
              paramName,
              hasMetadata: !!pipelineVar.metadata,
              isPipelineInput: pipelineVar.metadata?.isPipelineInput,
              wrappedInputType: typeof wrappedInput
            });
          }
          
          execEnv.setParameterVariable(paramName, pipelineVar);
        }
      } else {
        // Regular parameter handling
        // Note: argValue has already been evaluated and has { type: 'Text', content: actualValue } structure
        // IMPORTANT: content can be an object (like @p pipeline context) that needs to be passed as-is
        let paramValue: any;
        
        if (argValue === null) {
          paramValue = '';
        } else if (typeof argValue === 'string') {
          paramValue = argValue;
        } else if (argValue.type === 'Text' && argValue.content !== undefined) {
          // The content might be an object (e.g., pipeline context)
          paramValue = argValue.content;
        } else if (argValue.content !== undefined) {
          paramValue = argValue.content;
        } else {
          paramValue = String(argValue);
        }
        
        if (process.env.MLLD_DEBUG === 'true') {
          logger.debug('Regular parameter handling:', {
            paramName,
            paramValueType: typeof paramValue,
            isObject: typeof paramValue === 'object',
            argValueType: typeof argValue,
            hasContent: argValue?.content !== undefined
          });
        }
        
        // Check if we're passing an object (like @p pipeline context)
        if (typeof paramValue === 'object' && paramValue !== null) {
          // For objects, create an object variable that preserves the actual object
          const paramVar = {
            type: 'object',
            name: paramName,
            value: paramValue,
            metadata: { 
              isParameter: true,
              isPipelineContext: paramValue.stage !== undefined // Check if it's pipeline context
            }
          };
          
          if (process.env.MLLD_DEBUG === 'true') {
            logger.debug('Setting object parameter:', {
              paramName,
              hasStage: paramValue.stage !== undefined,
              hasTry: paramValue.try !== undefined,
              keys: Object.keys(paramValue)
            });
          }
          
          execEnv.setParameterVariable(paramName, paramVar);
        } else {
          // For non-objects, create a text variable as before
          const paramSource: VariableSource = {
            directive: 'var',
            syntax: 'quoted',
            hasInterpolation: false,
            isMultiLine: false
          };
          
          const paramVar = createSimpleTextVariable(
            paramName,
            String(paramValue), // Ensure it's a string for text variables
            paramSource,
            { isParameter: true }
          );
          
          execEnv.setParameterVariable(paramName, paramVar);
        }
      }
    }
  }
  
  // Execute based on type
  if (execDef.type === 'command' && execDef.commandTemplate) {
    // Interpolate command template with parameters
    const { interpolate } = await import('../core/interpreter');
    const { InterpolationContext } = await import('../core/interpolation-context');
    
    const command = await interpolate(execDef.commandTemplate, execEnv, InterpolationContext.ShellCommand);
    
    // Always pass pipeline input as stdin when available
    // This allows Unix utilities to work naturally while preserving @INPUT variable access
    const result = await env.executeCommand(command, { input: stdinInput } as any);
    return result;
  } else if (execDef.type === 'code' && execDef.codeTemplate) {
    // Special handling for mlld-when expressions
    if (execDef.language === 'mlld-when') {
      // The codeTemplate contains the WhenExpression node
      const whenExprNode = execDef.codeTemplate[0];
      if (!whenExprNode || whenExprNode.type !== 'WhenExpression') {
        throw new Error('mlld-when executable missing WhenExpression node');
      }
      
      // Evaluate the when expression with the parameter environment
      const { evaluateWhenExpression } = await import('./when-expression');
      const whenResult = await evaluateWhenExpression(whenExprNode, execEnv);
      
      // Return the result
      return String(whenResult.value || '');
    }
    
    // Regular JavaScript/code execution
    // Interpolate code template
    const { interpolate } = await import('../core/interpreter');
    const { InterpolationContext } = await import('../core/interpolation-context');
    
    const code = await interpolate(execDef.codeTemplate, execEnv, InterpolationContext.Default);
    
    // Build parameters object from bound variables
    const params: Record<string, any> = {};
    if (execDef.paramNames) {
      for (const paramName of execDef.paramNames) {
        const paramVar = execEnv.getVariable(paramName);
        if (paramVar) {
          // Debug logging
          if (process.env.MLLD_DEBUG === 'true') {
            logger.debug('Processing parameter for JS execution:', {
              paramName,
              varType: paramVar.type,
              hasMetadata: !!paramVar.metadata,
              isPipelineInput: paramVar.metadata?.isPipelineInput,
              hasPipelineInput: !!paramVar.metadata?.pipelineInput,
              metadataKeys: paramVar.metadata ? Object.keys(paramVar.metadata) : []
            });
          }
          
          // Check if this is a pipeline input variable
          if (paramVar.type === 'pipeline-input') {
            // PipelineInputVariable stores the PipelineInput object in value
            params[paramName] = paramVar.value;
            
            if (process.env.MLLD_DEBUG === 'true') {
              logger.debug('Using PipelineInputVariable value for param:', paramName);
              logger.debug('PipelineInput object details:', {
                type: typeof paramVar.value,
                isObject: typeof paramVar.value === 'object',
                keys: paramVar.value ? Object.keys(paramVar.value) : [],
                hasText: paramVar.value && 'text' in paramVar.value,
                hasType: paramVar.value && 'type' in paramVar.value,
                hasData: paramVar.value && 'data' in paramVar.value
              });
            }
          } else if (paramVar.metadata?.isPipelineInput && paramVar.metadata?.pipelineInput) {
            // Legacy: Use the wrapped pipeline input from metadata
            params[paramName] = paramVar.metadata.pipelineInput;
            
            if (process.env.MLLD_DEBUG === 'true') {
              logger.debug('Using wrapped pipeline input from metadata for param:', paramName);
            }
          } else {
            // Regular variable - use the value directly
            params[paramName] = paramVar.value;
          }
        }
      }
    }
    
    if (process.env.MLLD_DEBUG === 'true') {
      logger.debug('[executeCommandVariable] About to executeCode with params:', {
        paramNames: Object.keys(params),
        paramTypes: Object.entries(params).map(([k, v]) => [k, typeof v, v?.constructor?.name])
      });
    }
    
    const result = await env.executeCode(code, execDef.language || 'javascript', params);
    
    // If the function returns a PipelineInput object, extract the text
    // This can happen if the function just returns its input parameter
    if (result && typeof result === 'object' && 'text' in result && 'type' in result) {
      if (process.env.MLLD_DEBUG === 'true') {
        logger.debug('Pipeline function returned PipelineInput object, extracting text');
      }
      return String(result.text);
    }
    
    return String(result);
  } else if (execDef.type === 'template' && execDef.template) {
    // Interpolate template
    const { interpolate } = await import('../core/interpreter');
    const { InterpolationContext } = await import('../core/interpolation-context');
    
    const result = await interpolate(execDef.template, execEnv, InterpolationContext.Default);
    return result;
  } else if (execDef.type === 'commandRef') {
    // Handle command references - recursively call the referenced command
    const refExecVar = env.getVariable(execDef.commandRef);
    if (!refExecVar || !isExecutableVariable(refExecVar)) {
      throw new Error(`Referenced executable not found: ${execDef.commandRef}`);
    }
    
    // Recursively execute the referenced command with the same input
    const result = await executeCommandVariable(
      refExecVar,
      execDef.commandArgs ?? [],
      env,
      currentOutput
    );
    return result;
  }
  
  throw new Error(`Unsupported executable type in pipeline: ${execDef.type}`);
}