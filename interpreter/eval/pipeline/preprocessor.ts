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
  requiresSyntheticSource: boolean;
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
 * Create a synthetic source command placeholder
 * WHY: Not all pipeline sources are retryable:
 *      - "Hello" | @validate  → literal string can't be re-executed
 *      - @varString | @validate → depends: if @varString = "text", not retryable
 *                                          if @varString = @generate(), retryable
 *      - @generate() | @validate → function CAN be re-executed
 *      The synthetic source enables uniform retry handling - stage 1 always
 *      retries stage 0, which either re-runs the function or throws an error.
 * CONTEXT: Only added when isRetryable=true and sourceFunction exists (stored in variable metadata)
 */
function createSyntheticSourceCommand(): PipelineCommand {
  return {
    type: 'synthetic' as any,
    rawIdentifier: 'source',  // User-friendly name instead of __source__
    identifier: [],
    args: [],
    fields: [],
    rawArgs: []
  };
}

/**
 * Check if stages already have a synthetic source stage
 */
function hasSyntheticSourceStage(stages: LogicalStage[]): boolean {
  return stages.some(s => s.command.rawIdentifier === 'source');
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
  
  // Check if the first stage is already a synthetic source
  const alreadyHasSyntheticSource = logicalStages.length > 0 && 
    logicalStages[0].command.rawIdentifier === 'source';
  
  // Determine if we need a synthetic source stage
  const requiresSyntheticSource = isRetryable && 
    sourceFunction && 
    !alreadyHasSyntheticSource;
  
  if (requiresSyntheticSource) {
    /**
     * Add synthetic source as first logical stage
     * WHY: Allows retry of non-repeatable sources. "Hello" can't be retried,
     *      but @generate() can be re-executed for fresh data.
     * GOTCHA: This shifts all stage numbers by 1, requiring adjustment in user-facing output
     */
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[preprocessor] Adding synthetic source stage');
    }
    logicalStages.unshift({
      command: createSyntheticSourceCommand(),
      effects: [],
      originalIndices: [-1], // Special index for synthetic
      isImplicitIdentity: false
    });
  }
  
  if (process.env.MLLD_DEBUG === 'true') {
    console.error('[preprocessor] Preprocessing complete:', {
      logicalStagesCount: logicalStages.length,
      totalBuiltins,
      hasLeadingBuiltins,
      hasTrailingBuiltins,
      requiresSyntheticSource,
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
    totalBuiltins,
    requiresSyntheticSource
  };
}