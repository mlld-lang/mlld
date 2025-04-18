import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';
import { stateLogger as logger } from '@core/utils/logger.js';
import type { MeldVariable, VariableType } from '@core/types';

/**
 * Variable type supported by the State service
 */
export type VariableType = 'text' | 'data' | 'path' | 'command';

/**
 * Options for copying variables between state objects
 */
export interface VariableCopyOptions {
  /**
   * Skip variables that already exist in the target state
   * @default false
   */
  skipExisting?: boolean;
  
  /**
   * Track context boundary before and after copying (requires tracking service)
   * @default true
   */
  trackContextBoundary?: boolean;
  
  /**
   * Track each variable crossing (requires tracking service)
   * @default true
   */
  trackVariableCrossing?: boolean;
}

/**
 * Utility for consistently copying variables between state objects
 */
export class StateVariableCopier {
  private trackingService?: IStateTrackingService;

  /**
   * Create a new StateVariableCopier
   * @param trackingService Optional tracking service for debugging
   */
  constructor(trackingService?: IStateTrackingService) {
    this.trackingService = trackingService;
  }

  /**
   * Copy all variables from source state to target state
   * @param sourceState Source state containing variables
   * @param targetState Target state to receive variables
   * @param options Additional options for copying
   * @returns Number of variables copied
   */
  public async copyAllVariables(
    sourceState: IStateService,
    targetState: IStateService,
    options: VariableCopyOptions = {}
  ): Promise<number> {
    const {
      skipExisting = false,
      trackContextBoundary = true,
      trackVariableCrossing = true,
    } = options;

    let totalCopied = 0;

    if (trackContextBoundary && this.trackingService) {
      this.trackContextBoundary(sourceState, targetState, sourceState.getCurrentFilePath() ?? undefined);
    }

    const sourceNode = sourceState.getInternalStateNode();
    const variableMaps = {
      text: sourceNode.variables?.text,
      data: sourceNode.variables?.data,
      path: sourceNode.variables?.path,
      command: sourceNode.commands,
    };

    for (const [type, map] of Object.entries(variableMaps)) {
      if (!map) {
         logger.debug(`Variable map for type '${type}' is undefined in sourceNode, skipping.`);
         continue;
      }
      const varType = type as VariableType;
      for (const [name, variable] of map.entries()) {
        if (skipExisting && targetState.hasVariable(name, varType)) {
          continue;
        }
        // Directly use the existing MeldVariable object from the source map
        await targetState.setVariable(variable);
        totalCopied++;
        if (trackVariableCrossing && this.trackingService) {
          this.trackVariableCrossing(name, varType, sourceState, targetState);
        }
      }
    }

    if (trackContextBoundary && this.trackingService) {
      this.trackContextBoundary(sourceState, targetState, sourceState.getCurrentFilePath() ?? undefined);
    }

    return totalCopied;
  }

  /**
   * Copy specific variables by name from source state to target state
   * @param sourceState Source state containing variables
   * @param targetState Target state to receive variables
   * @param variableNames List of variable names to copy with optional aliases
   * @param options Additional options for copying
   * @returns Number of variables copied
   */
  public async copySpecificVariables(
    sourceState: IStateService,
    targetState: IStateService,
    variableNames: Array<{ name: string; alias?: string }>,
    options: VariableCopyOptions = {}
  ): Promise<number> {
    const {
      skipExisting = false,
      trackContextBoundary = true,
      trackVariableCrossing = true,
    } = options;

    let totalCopied = 0;

    if (trackContextBoundary && this.trackingService) {
      this.trackContextBoundary(sourceState, targetState, sourceState.getCurrentFilePath() ?? undefined);
    }

    for (const { name, alias } of variableNames) {
      const targetName = alias || name;
      const sourceVariable = sourceState.getVariable(name); // Find variable regardless of type first

      if (sourceVariable) {
        // Check existence in target using targetName and the source variable's type
        if (skipExisting && targetState.hasVariable(targetName, sourceVariable.type)) {
          continue;
        }

        // Create a copy for the target, potentially with a new name (alias)
        // Use a structured clone or similar deep copy mechanism if available/necessary
        // For now, assume a basic spread might suffice, but be wary of nested objects/metadata
        // IMPORTANT: Need a proper deep cloning mechanism here, especially for metadata and complex values.
        // Using structuredClone if available, otherwise a placeholder.
        let targetVariable: MeldVariable;
        try {
           targetVariable = structuredClone(sourceVariable);
           targetVariable.name = targetName; // Assign the alias/target name
        } catch (e) { // structuredClone might fail on certain types or environments
          logger.warn(`StructuredClone failed for variable ${name}, using shallow copy.`, { error: e });
          targetVariable = { ...sourceVariable, name: targetName };
          // Consider adding more robust deep copy logic here if needed
        }

        await targetState.setVariable(targetVariable);
        totalCopied++;

        if (trackVariableCrossing && this.trackingService) {
          this.trackVariableCrossing(name, sourceVariable.type, sourceState, targetState, alias);
        }
      } else {
         logger.debug(`Variable '${name}' not found in source state ${sourceState.getStateId()}`);
      }
    }

    if (trackContextBoundary && this.trackingService) {
      this.trackContextBoundary(sourceState, targetState, sourceState.getCurrentFilePath() ?? undefined);
    }

    return totalCopied;
  }

  /**
   * Track context boundary for debugging
   */
  private trackContextBoundary(
    sourceState: IStateService,
    targetState: IStateService,
    filePath?: string
  ): void {
    if (!this.trackingService) return;
    
    try {
      const sourceId = sourceState.getStateId?.() || 'unknown';
      const targetId = targetState.getStateId?.() || 'unknown';
      
      // Default to 'import' as boundary type since we're copying variables
      this.trackingService.trackContextBoundary(
        sourceId,
        targetId,
        'import',
        filePath
      );
    } catch (error) {
      logger.debug('Error tracking context boundary', { error });
    }
  }

  /**
   * Track variable crossing for debugging
   */
  private trackVariableCrossing(
    name: string,
    type: VariableType,
    sourceState: IStateService,
    targetState: IStateService,
    alias?: string
  ): void {
    if (!this.trackingService) return;
    
    try {
      const sourceId = sourceState.getStateId?.() || 'unknown';
      const targetId = targetState.getStateId?.() || 'unknown';
      
      this.trackingService.trackVariableCrossing(
        sourceId,
        targetId,
        name,
        type,
        alias
      );
    } catch (error) {
      logger.debug('Error tracking variable crossing', { error });
    }
  }
}

/**
 * Create a StateVariableCopier instance with optional tracking
 */
export function createStateVariableCopier(
  trackingService?: IStateTrackingService
): StateVariableCopier {
  return new StateVariableCopier(trackingService);
} 