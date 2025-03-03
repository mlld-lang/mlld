# Variable Copying Utility Proposal

## Problem Statement

The Meld codebase currently duplicates variable copying logic across multiple components, especially in directive handlers (ImportDirectiveHandler, EmbedDirectiveHandler) and the InterpreterService. This duplication:

1. Creates maintenance challenges when logic needs to be updated
2. Increases the risk of inconsistent implementation
3. Makes it difficult to ensure all variable types are properly handled
4. Obscures the core architectural pattern of variable propagation

## Current State Analysis

### Current Implementation Examples

#### 1. In the ImportDirectiveHandler:

```typescript
private importAllVariables(sourceState: IStateService, targetState: IStateService): void {
  // Track context boundary before import (safely)
  let filePath: string | null | undefined = null;
  try {
    filePath = sourceState.getCurrentFilePath();
  } catch (error) {
    // Handle the case where getCurrentFilePath is not available
    logger.debug('Error getting current file path', { error });
  }
  this.trackContextBoundary(sourceState, targetState, filePath ? filePath : undefined);
  
  // Import all text variables
  const textVars = sourceState.getAllTextVars();
  textVars.forEach((value, name) => {
    targetState.setTextVar(name, value);
    this.trackVariableCrossing(name, 'text', sourceState, targetState);
  });
  
  // Import all data variables
  const dataVars = sourceState.getAllDataVars();
  dataVars.forEach((value, name) => {
    targetState.setDataVar(name, value);
    this.trackVariableCrossing(name, 'data', sourceState, targetState);
  });
  
  // Import all path variables
  const pathVars = sourceState.getAllPathVars();
  pathVars.forEach((value, name) => {
    targetState.setPathVar(name, value);
    this.trackVariableCrossing(name, 'path', sourceState, targetState);
  });
  
  // Import all commands
  const commands = sourceState.getAllCommands();
  commands.forEach((value, name) => {
    targetState.setCommand(name, value);
    this.trackVariableCrossing(name, 'command', sourceState, targetState);
  });
  
  // Track context boundary after import (safely)
  this.trackContextBoundary(sourceState, targetState, filePath ? filePath : undefined);
}
```

#### 2. In the EmbedDirectiveHandler:

```typescript
// Copy all variables from the interpreted state to the context state
// Track text variables
if (typeof interpretedState.getAllTextVars === 'function') {
  const textVars = interpretedState.getAllTextVars();
  for (const [key, value] of Object.entries(textVars)) {
    newState.setTextVar(key, value);
    
    // Track variable crossing for debugging
    this.trackVariableCrossing(key, 'text', interpretedState, newState);
  }
}

// Track data variables
if (typeof interpretedState.getAllDataVars === 'function') {
  const dataVars = interpretedState.getAllDataVars();
  for (const [key, value] of Object.entries(dataVars)) {
    newState.setDataVar(key, value);
    
    // Track variable crossing for debugging
    this.trackVariableCrossing(key, 'data', interpretedState, newState);
  }
}
// ... similar for path variables and commands
```

#### 3. In the InterpreterService:

```typescript
// Special handling for imports in transformation mode:
// Copy all variables from the imported file to the original state
if (isImportDirective && 
    currentState.isTransformationEnabled && 
    currentState.isTransformationEnabled()) {
  try {
    logger.debug('Import directive in transformation mode, copying variables to original state');
    
    // Copy text variables from result to original state
    if (typeof currentState.getAllTextVars === 'function' && 
        typeof originalState.setTextVar === 'function') {
      const textVars = currentState.getAllTextVars();
      textVars.forEach((value, key) => {
        originalState.setTextVar(key, value);
      });
    }
    
    // Copy data variables
    if (typeof currentState.getAllDataVars === 'function' && 
        typeof originalState.setDataVar === 'function') {
      const dataVars = currentState.getAllDataVars();
      dataVars.forEach((value, key) => {
        originalState.setDataVar(key, value);
      });
    }
    // ... similar for path variables and commands
  } catch (e) {
    logger.debug('Error copying variables from import to original state', { error: e });
  }
}
```

### Observed Issues with Current Approach

1. **Inconsistent Implementations**: Each implementation has slight variations in how variables are copied.
2. **Type Safety Challenges**: Different components handle types slightly differently.
3. **Debugging Integration Varies**: Some implementations include tracking, others don't.
4. **Error Handling Discrepancies**: Different approaches to handling errors during copying.
5. **Method Existence Checking**: Inconsistent approaches to checking if methods exist.

## Benefits of a Unified Utility Approach

1. **Consistent Implementation**: All variable copying follows the same pattern
2. **Centralized Maintenance**: Updates to copying logic occur in one place
3. **Enhanced Debugging**: Consistent tracking and logging across all copying operations
4. **Safer Type Handling**: Unified approach to TypeScript safety
5. **Better Error Handling**: Standardized approach to error handling
6. **Self-Documenting Architecture**: Makes the variable propagation pattern explicit

## Proposed Implementation

### 1. Create a Variable Copying Utility Module

Location: `services/state/utilities/StateVariableCopier.ts`

```typescript
/**
 * Utility for consistently copying variables between state objects
 */
export class StateVariableCopier {
  private logger = getLogger('StateVariableCopier');
  private trackingService?: IStateTrackingService;

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
    options: {
      skipExisting?: boolean;
      trackContextBoundary?: boolean;
      trackVariableCrossing?: boolean;
    } = {}
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
        this.logger.debug('Error getting current file path', { error });
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
        this.logger.debug('Error getting current file path', { error });
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
    variableType: 'text' | 'data' | 'path' | 'command',
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
          const existsMethod = `get${variableType.charAt(0).toUpperCase()}${variableType.slice(1)}Var`;
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
    } catch (error) {
      this.logger.debug(`Error copying ${variableType} variables`, { error });
    }
    
    return copied;
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
      this.trackingService.recordContextBoundary({
        fromStateId: sourceState.getStateId?.() || 'unknown',
        toStateId: targetState.getStateId?.() || 'unknown',
        filePath,
        timestamp: Date.now()
      });
    } catch (error) {
      this.logger.debug('Error tracking context boundary', { error });
    }
  }

  /**
   * Track variable crossing for debugging
   */
  private trackVariableCrossing(
    name: string,
    type: 'text' | 'data' | 'path' | 'command',
    sourceState: IStateService,
    targetState: IStateService
  ): void {
    if (!this.trackingService) return;
    
    try {
      this.trackingService.recordVariableCrossing({
        name,
        type,
        fromStateId: sourceState.getStateId?.() || 'unknown',
        toStateId: targetState.getStateId?.() || 'unknown',
        timestamp: Date.now()
      });
    } catch (error) {
      this.logger.debug('Error tracking variable crossing', { error });
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
```

### 2. Integration with Directive Handlers

Update ImportDirectiveHandler:

```typescript
// In ImportDirectiveHandler constructor
constructor(
  // ... existing parameters
  private stateVariableCopier: StateVariableCopier
) {
  // ... existing code
}

// Replace importAllVariables method
private importAllVariables(sourceState: IStateService, targetState: IStateService): void {
  this.stateVariableCopier.copyAllVariables(sourceState, targetState, {
    skipExisting: false,
    trackContextBoundary: true,
    trackVariableCrossing: true
  });
}
```

Similar updates for EmbedDirectiveHandler and InterpreterService.

### 3. Options to Control Variable Copying Behavior

The utility provides options to:
- Skip existing variables (`skipExisting`)
- Control tracking (`trackContextBoundary`, `trackVariableCrossing`)

### 4. Error Handling

The utility includes consistent error handling to:
- Safely check if methods exist before calling them
- Catch and log errors during copying
- Provide detailed debug information

## Migration Plan

1. Create and test the `StateVariableCopier` utility
2. Update test cases to verify utility behavior
3. Refactor ImportDirectiveHandler to use the utility
4. Refactor EmbedDirectiveHandler to use the utility
5. Refactor InterpreterService to use the utility
6. Update existing tests to verify functionality is preserved
7. Add documentation about the variable copying pattern

## Future Enhancements

1. **Conflict Resolution Strategies**: Add options for handling variable name conflicts
2. **Variable Transformation**: Support transforming variables during copying
3. **Selective Copying**: Support copying only specific variables
4. **Performance Optimization**: Implement batch copying for large state objects

## Conclusion

Implementing a unified variable copying utility will significantly improve the maintainability, consistency, and reliability of the Meld codebase. It makes the architectural pattern of variable propagation explicit and ensures all components follow the same approach to handling state operations.

The utility also lays groundwork for future enhancements like immutable variables, conflict detection, and improved debugging capabilities. 