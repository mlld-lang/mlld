import type { PipelineCommand } from '@core/types';

export interface LogicalStage {
  command: PipelineCommand;
  effects: PipelineCommand[];  // Keep original builtin commands
  originalIndices: number[];    // Track original positions for debugging
  isImplicitIdentity: boolean;  // True for leading/only-builtin cases
}

export interface PreprocessedPipeline {
  logicalStages: LogicalStage[];
  hasLeadingBuiltins: boolean;
  hasTrailingBuiltins: boolean;
  totalBuiltins: number;
}

/**
 * Check if a command is a builtin command (show, log, output)
 */
function isBuiltinCommand(cmd: PipelineCommand): boolean {
  // Check if it has a type field set to 'builtinCommand'
  if (cmd && 'type' in cmd && cmd.type === 'builtinCommand') {
    return true;
  }
  
  // Also check by command name for backwards compatibility
  if (cmd && 'command' in cmd) {
    const builtinCommands = ['show', 'log', 'output'];
    return builtinCommands.includes((cmd as any).command);
  }
  
  // Check rawIdentifier for builtin commands
  if (cmd && cmd.rawIdentifier) {
    const builtinCommands = ['show', 'log', 'output'];
    return builtinCommands.includes(cmd.rawIdentifier);
  }
  
  return false;
}

/**
 * Create an identity command that passes input through unchanged
 */
function createIdentityCommand(): PipelineCommand {
  return {
    type: 'identity' as any,
    rawIdentifier: '__identity__',
    identifier: [],
    args: [],
    fields: [],
    rawArgs: []
  };
}

/**
 * Create a real command from a source function for universal context
 * This converts retryable sources into actual pipeline stages
 */
function createSourceCommand(sourceFunction: any): PipelineCommand {
  return {
    type: 'execInvocation' as any,
    rawIdentifier: sourceFunction.identifier || 'source',
    identifier: sourceFunction.identifier ? [sourceFunction.identifier] : [],
    args: [],
    fields: [],
    rawArgs: [],
    sourceFunction  // Preserve the source function for execution
  };
}


/**
 * Preprocess a pipeline to separate logical stages from effects
 */
export function preprocessPipeline(
  pipeline: PipelineCommand[],
  isRetryable: boolean = false,
  sourceFunction?: () => Promise<string>
): PreprocessedPipeline {
  const logicalStages: LogicalStage[] = [];
  let pendingEffects: PipelineCommand[] = [];
  let pendingIndices: number[] = [];
  let hasLeadingBuiltins = false;
  let totalBuiltins = 0;
  
  if (process.env.MLLD_DEBUG === 'true') {
    console.error('[preprocessor] Starting preprocessing:', {
      pipelineLength: pipeline.length,
      isRetryable,
      hasSourceFunction: !!sourceFunction,
      commands: pipeline.map(p => p.rawIdentifier || (p as any).command || 'unknown')
    });
  }
  
  // First pass: separate stages from effects
  // Effects are attached BEFORE the stage they precede
  for (let i = 0; i < pipeline.length; i++) {
    const cmd = pipeline[i];
    
    if (isBuiltinCommand(cmd)) {
      if (process.env.MLLD_DEBUG === 'true') {
        console.error(`[preprocessor] Found builtin at index ${i}:`, cmd.rawIdentifier || (cmd as any).command);
      }
      pendingEffects.push(cmd);
      pendingIndices.push(i);
      totalBuiltins++;
      
      // Track if we have leading builtins
      if (logicalStages.length === 0) {
        hasLeadingBuiltins = true;
      }
    } else {
      // Real command - becomes a logical stage with preceding effects
      if (process.env.MLLD_DEBUG === 'true') {
        console.error(`[preprocessor] Found logical stage at index ${i}:`, {
          command: cmd.rawIdentifier,
          precedingEffects: pendingEffects.length
        });
      }
      
      logicalStages.push({
        command: cmd,
        effects: [...pendingEffects],  // Effects that should run BEFORE this stage
        originalIndices: [...pendingIndices, i],
        isImplicitIdentity: false
      });
      pendingEffects = [];
      pendingIndices = [];
    }
  }
  
  // Handle trailing or only-builtins cases
  const hasTrailingBuiltins = pendingEffects.length > 0;
  
  if (hasTrailingBuiltins) {
    if (logicalStages.length > 0) {
      // Attach trailing effects to last stage
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[preprocessor] Attaching trailing effects to last stage:', {
          effectsCount: pendingEffects.length
        });
      }
      const lastStage = logicalStages[logicalStages.length - 1];
      lastStage.effects.push(...pendingEffects);
      lastStage.originalIndices.push(...pendingIndices);
    } else {
      // Only builtins - create implicit identity stage
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[preprocessor] Only builtins found, creating implicit identity stage');
      }
      logicalStages.push({
        command: createIdentityCommand(),
        effects: pendingEffects,
        originalIndices: pendingIndices,
        isImplicitIdentity: true
      });
    }
  }
  
  // Convert retryable source functions into real pipeline stages
  // This implements universal context - sources ARE pipeline stages
  
  // Case 1: Explicit sourceFunction parameter (from run/code directives)
  if (isRetryable && sourceFunction && logicalStages.length > 0) {
    // Check if we already have a source command as first stage
    const firstStage = logicalStages[0];
    const isAlreadySourceCommand = firstStage.command.type === 'execInvocation' && 
                                   (firstStage.command as any).sourceFunction;
    
    if (!isAlreadySourceCommand) {
      // Convert source function to a real command stage
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[preprocessor] Converting source function to real pipeline stage');
      }
      logicalStages.unshift({
        command: createSourceCommand(sourceFunction),
        effects: [],
        originalIndices: [-1], // Mark as source-generated
        isImplicitIdentity: false
      });
    }
  }
  
  // Case 2: First pipeline stage is an exec function (e.g., @source() | @validator())
  // In pipelines, ALL stages are retryable, including the first one
  // No special handling needed - the first stage IS the source and will be retried as stage 0
  
  if (process.env.MLLD_DEBUG === 'true') {
    console.error('[preprocessor] Preprocessing complete:', {
      logicalStagesCount: logicalStages.length,
      totalBuiltins,
      hasLeadingBuiltins,
      hasTrailingBuiltins,
      stages: logicalStages.map(s => ({
        command: s.command.rawIdentifier,
        effectsCount: s.effects.length,
        isImplicit: s.isImplicitIdentity
      }))
    });
  }
  
  return {
    logicalStages,
    hasLeadingBuiltins,
    hasTrailingBuiltins,
    totalBuiltins
  };
}