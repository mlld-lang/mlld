import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';
import { stateLogger as logger } from '@core/utils/logger.js';

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
  public copyAllVariables(
    sourceState: IStateService, 
    targetState: IStateService,
    options: VariableCopyOptions = {}
  ): number {
    const {
      skipExisting = false,
      trackContextBoundary = true,
      trackVariableCrossing = true
    } = options;

    let totalCopied = 0;
    
    // Track boundary if requested and tracking service exists
    if (trackContextBoundary && this.trackingService) {
      let filePath: string | undefined;
      try {
        filePath = sourceState.getCurrentFilePath?.() || undefined;
      } catch (error) {
        logger.debug('Error getting current file path', { error });
      }
      this.trackContextBoundary(sourceState, targetState, filePath);
    }

    // Copy text variables
    totalCopied += this.copyVariableType(
      sourceState, 
      targetState, 
      'text', 
      skipExisting,
      trackVariableCrossing
    );
    
    // Copy data variables
    totalCopied += this.copyVariableType(
      sourceState, 
      targetState, 
      'data', 
      skipExisting,
      trackVariableCrossing
    );
    
    // Copy path variables
    totalCopied += this.copyVariableType(
      sourceState, 
      targetState, 
      'path', 
      skipExisting,
      trackVariableCrossing
    );
    
    // Copy commands
    totalCopied += this.copyVariableType(
      sourceState, 
      targetState, 
      'command', 
      skipExisting,
      trackVariableCrossing
    );
    
    // Track boundary again if requested and tracking service exists
    if (trackContextBoundary && this.trackingService) {
      let filePath: string | undefined;
      try {
        filePath = sourceState.getCurrentFilePath?.() || undefined;
      } catch (error) {
        logger.debug('Error getting current file path', { error });
      }
      this.trackContextBoundary(sourceState, targetState, filePath);
    }

    return totalCopied;
  }

  /**
   * Copy variables of a specific type between states
   */
  private copyVariableType(
    sourceState: IStateService,
    targetState: IStateService,
    variableType: VariableType,
    skipExisting: boolean,
    trackVariableCrossing: boolean
  ): number {
    let getMethod: keyof IStateService;
    let setMethod: keyof IStateService;
    let copied = 0;
    
    // Select the appropriate methods based on variable type
    switch (variableType) {
      case 'text':
        getMethod = 'getAllTextVars';
        setMethod = 'setTextVar';
        break;
      case 'data':
        getMethod = 'getAllDataVars';
        setMethod = 'setDataVar';
        break;
      case 'path':
        getMethod = 'getAllPathVars';
        setMethod = 'setPathVar';
        break;
      case 'command':
        getMethod = 'getAllCommands';
        setMethod = 'setCommand';
        break;
    }
    
    // Check if methods exist
    if (typeof sourceState[getMethod] !== 'function' || 
        typeof targetState[setMethod] !== 'function') {
      return 0;
    }
    
    try {
      // Get all variables of the specified type
      const variables = (sourceState[getMethod] as Function)();
      
      // Copy each variable
      variables.forEach((value: any, name: string) => {
        // Skip if variable exists and skipExisting is true
        if (skipExisting) {
          // Determine the appropriate get method for checking existence
          let existsMethod: keyof IStateService;
          switch (variableType) {
            case 'text':
              existsMethod = 'getTextVar';
              break;
            case 'data':
              existsMethod = 'getDataVar';
              break;
            case 'path':
              existsMethod = 'getPathVar';
              break;
            case 'command':
              existsMethod = 'getCommand';
              break;
          }
          
          // Check if variable exists in target state
          if (typeof targetState[existsMethod] === 'function' && 
              (targetState[existsMethod] as Function)(name) !== undefined) {
            return;
          }
        }
        
        // Set the variable
        (targetState[setMethod] as Function)(name, value);
        copied++;
        
        // Track variable crossing if requested and tracking service exists
        if (trackVariableCrossing && this.trackingService) {
          this.trackVariableCrossing(name, variableType, sourceState, targetState);
        }
      });
      
      return copied;
    } catch (error) {
      logger.debug(`Error copying ${variableType} variables`, { error });
      return 0;
    }
  }

  /**
   * Copy specific variables by name from source state to target state
   * @param sourceState Source state containing variables
   * @param targetState Target state to receive variables
   * @param variableNames List of variable names to copy with optional aliases
   * @param options Additional options for copying
   * @returns Number of variables copied
   */
  public copySpecificVariables(
    sourceState: IStateService,
    targetState: IStateService,
    variableNames: Array<{ name: string; alias?: string }>,
    options: VariableCopyOptions = {}
  ): number {
    const {
      skipExisting = false,
      trackContextBoundary = true,
      trackVariableCrossing = true
    } = options;

    let totalCopied = 0;

    // Track boundary if requested and tracking service exists
    if (trackContextBoundary && this.trackingService) {
      let filePath: string | undefined;
      try {
        filePath = sourceState.getCurrentFilePath?.() || undefined;
      } catch (error) {
        logger.debug('Error getting current file path', { error });
      }
      this.trackContextBoundary(sourceState, targetState, filePath);
    }

    for (const { name, alias } of variableNames) {
      // Try to copy as a text variable
      const textValue = sourceState.getTextVar?.(name);
      if (textValue !== undefined) {
        // Skip if variable exists and skipExisting is true
        if (skipExisting && targetState.getTextVar?.(alias || name) !== undefined) {
          continue;
        }
        
        targetState.setTextVar(alias || name, textValue);
        totalCopied++;
        
        if (trackVariableCrossing && this.trackingService) {
          this.trackVariableCrossing(name, 'text', sourceState, targetState, alias);
        }
        continue;
      }

      // Try to copy as a data variable
      const dataValue = sourceState.getDataVar?.(name);
      if (dataValue !== undefined) {
        // Skip if variable exists and skipExisting is true
        if (skipExisting && targetState.getDataVar?.(alias || name) !== undefined) {
          continue;
        }
        
        targetState.setDataVar(alias || name, dataValue);
        totalCopied++;
        
        if (trackVariableCrossing && this.trackingService) {
          this.trackVariableCrossing(name, 'data', sourceState, targetState, alias);
        }
        continue;
      }

      // Try to copy as a path variable
      const pathValue = sourceState.getPathVar?.(name);
      if (pathValue !== undefined) {
        // Skip if variable exists and skipExisting is true
        if (skipExisting && targetState.getPathVar?.(alias || name) !== undefined) {
          continue;
        }
        
        targetState.setPathVar(alias || name, pathValue);
        totalCopied++;
        
        if (trackVariableCrossing && this.trackingService) {
          this.trackVariableCrossing(name, 'path', sourceState, targetState, alias);
        }
        continue;
      }

      // Try to copy as a command
      const commandValue = sourceState.getCommand?.(name);
      if (commandValue !== undefined) {
        // Skip if variable exists and skipExisting is true
        if (skipExisting && targetState.getCommand?.(alias || name) !== undefined) {
          continue;
        }
        
        targetState.setCommand(alias || name, commandValue);
        totalCopied++;
        
        if (trackVariableCrossing && this.trackingService) {
          this.trackVariableCrossing(name, 'command', sourceState, targetState, alias);
        }
        continue;
      }
    }

    // Track boundary again if requested and tracking service exists
    if (trackContextBoundary && this.trackingService) {
      let filePath: string | undefined;
      try {
        filePath = sourceState.getCurrentFilePath?.() || undefined;
      } catch (error) {
        logger.debug('Error getting current file path', { error });
      }
      this.trackContextBoundary(sourceState, targetState, filePath);
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