# Variable Copying Utility Implementation Guide

## Problem Statement

The Meld codebase currently duplicates variable copying logic across multiple components, especially in directive handlers (ImportDirectiveHandler, EmbedDirectiveHandler) and the InterpreterService. This duplication:

1. Creates maintenance challenges when logic needs to be updated
2. Increases the risk of inconsistent implementation
3. Makes it difficult to ensure all variable types are properly handled
4. Obscures the core architectural pattern of variable propagation

## Current Implementation Overview

Currently, variable copying logic is duplicated across:
- `ImportDirectiveHandler`: Copies variables from imported files
- `EmbedDirectiveHandler`: Copies variables from embedded content
- `InterpreterService`: Handles special cases for transformation mode

Each implementation has slight variations in error handling, type safety, and debugging integration.

## Implementation Plan

This guide outlines a phased approach to implementing the `StateVariableCopier` utility with comprehensive testing at each stage.

### Phase 1: Create and Test the StateVariableCopier Utility ✅

**Steps:**
1. Create the utility class in `services/state/utilities/StateVariableCopier.ts`
2. Implement core functionality with thorough error handling
3. Create comprehensive unit tests in `services/state/utilities/StateVariableCopier.test.ts`

**Testing Requirements:**
- Unit tests for all public methods
- Tests for all variable types (text, data, path, command)
- Edge case testing for error handling
- Tests for tracking functionality
- Test with `skipExisting` option

**Exit Criteria:**
- All unit tests pass
- Code coverage > 90% for the utility
- No regressions in existing tests

### Phase 2: Integrate with ImportDirectiveHandler

**Steps:**
1. Import the `createStateVariableCopier` factory function in the `ImportDirectiveHandler`
2. Add a property to the handler and initialize it with the factory function
3. Replace the existing variable copying code with calls to the utility

```typescript
// At the top of ImportDirectiveHandler.ts
import { createStateVariableCopier } from '@services/state/utilities/StateVariableCopier.js';
import { trackingService } from '@tests/utils/debug/StateTrackingService/index.js'; // if used

// In the ImportDirectiveHandler class
private stateVariableCopier = createStateVariableCopier(trackingService);

// Current code in ImportDirectiveHandler
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

// Replace with:
private importAllVariables(sourceState: IStateService, targetState: IStateService): void {
  this.stateVariableCopier.copyAllVariables(sourceState, targetState, {
    skipExisting: false,
    trackContextBoundary: true,
    trackVariableCrossing: true
  });
}
```

**Testing Requirements:**
- Run existing `ImportDirectiveHandler` tests
- Add tests specifically for variable copying
- Verify that variables are correctly copied with the utility
- Confirm tracking functionality works correctly

**Exit Criteria:**
- All `ImportDirectiveHandler` tests pass
- All integration tests involving imports pass
- No regressions in full test suite
- Manually test import functionality

### Phase 3: Integrate with EmbedDirectiveHandler

**Steps:**
1. Import the `createStateVariableCopier` factory function in the `EmbedDirectiveHandler`
2. Add a property to the handler and initialize it with the factory function
3. Replace the existing variable copying code with calls to the utility

```typescript
// At the top of EmbedDirectiveHandler.ts
import { createStateVariableCopier } from '@services/state/utilities/StateVariableCopier.js';
import { trackingService } from '@tests/utils/debug/StateTrackingService/index.js'; // if used

// In the EmbedDirectiveHandler class
private stateVariableCopier = createStateVariableCopier(trackingService);

// Replace embedded variable copying logic with:
this.stateVariableCopier.copyAllVariables(interpretedState, newState, {
  skipExisting: false,
  trackContextBoundary: true,
  trackVariableCrossing: true
});
```

**Testing Requirements:**
- Run existing `EmbedDirectiveHandler` tests
- Add tests specifically for variable copying
- Test with multiple variable types
- Verify tracking functionality

**Exit Criteria:**
- All `EmbedDirectiveHandler` tests pass
- All integration tests involving embeds pass
- No regressions in full test suite
- Manually test embed functionality

### Phase 4: Integrate with InterpreterService

**Steps:**
1. Import the `createStateVariableCopier` factory function in the `InterpreterService`
2. Add a property to the service and initialize it with the factory function
3. Replace the existing variable copying code with calls to the utility

```typescript
// At the top of InterpreterService.ts
import { createStateVariableCopier } from '@services/state/utilities/StateVariableCopier.js';
import { trackingService } from '@tests/utils/debug/StateTrackingService/index.js'; // if used

// In the InterpreterService class
private stateVariableCopier = createStateVariableCopier(trackingService);

// Replace code in InterpreterService with:
if (isImportDirective && 
    currentState.isTransformationEnabled && 
    currentState.isTransformationEnabled()) {
  try {
    logger.debug('Import directive in transformation mode, copying variables to original state');
    this.stateVariableCopier.copyAllVariables(currentState, originalState, {
      skipExisting: false,
      trackContextBoundary: false, // May not be needed in this context
      trackVariableCrossing: false // May not be needed in this context
    });
  } catch (e) {
    logger.debug('Error copying variables from import to original state', { error: e });
  }
}
```

**Testing Requirements:**
- Run existing `InterpreterService` tests
- Add tests for transformation mode variable copying
- Verify behavior with different combinations of options
- Test error handling cases

**Exit Criteria:**
- All `InterpreterService` tests pass
- Integration tests for transformation mode pass
- No regressions in full test suite
- Manually test transformation functionality

### Phase 5: Comprehensive Testing and Verification

**Steps:**
1. Run the full test suite
2. Perform manual testing of key features
3. Add additional tests for any edge cases discovered
4. Document the variable copying pattern

**Testing Requirements:**
- Full test suite must pass
- Test with complex real-world examples
- Test with large state objects for performance
- Test circular import handling
- Test error recovery scenarios

**Exit Criteria:**
- 100% of tests pass
- No regressions observed
- Documentation complete
- Performance within acceptable parameters

## Verification Strategies

### Running Tests

Always run the specific component tests after making changes:

```bash
# Run specific component tests
npm test -- -t "StateVariableCopier"
npm test -- -t "ImportDirectiveHandler"
npm test -- -t "EmbedDirectiveHandler"
npm test -- -t "InterpreterService"

# Run all tests to check for regressions
npm test
```

### Manual Testing Scenarios

For each phase, manually test the following scenarios:

1. **Basic Variable Copying**: Verify that all variable types are copied correctly
2. **Nested Imports**: Test with files that import other files
3. **Circular Imports**: Test handling of circular import references
4. **Error Handling**: Test with missing or corrupt files
5. **Transformation Mode**: Test with transformation enabled and disabled

### Regression Prevention

1. Before modifying any component, capture its current behavior with tests
2. After integration, verify that the behavior remains unchanged
3. If there are legitimate behavior changes, document them clearly
4. For any test failures, determine if they are:
   - Expected behavior changes
   - Bugs in the implementation
   - Issues with the tests themselves

## Rollback Procedure

If issues are discovered that cannot be immediately resolved:

1. Revert the changes to the affected component
2. Keep the `StateVariableCopier` utility in place
3. Update the implementation plan with lessons learned
4. Address issues in the utility before attempting reintegration

## Documentation

After implementation, update documentation to:

1. Explain the variable copying pattern
2. Document the `StateVariableCopier` API
3. Provide examples of using the utility
4. Update architecture documentation to reflect the new pattern

## Conclusion

Implementing the `StateVariableCopier` utility will significantly improve code maintainability and consistency. By following this phased approach with comprehensive testing at each stage, we can ensure a smooth transition without regressions.

Remember: **Each phase must pass all tests before proceeding to the next phase.** Prioritize stability and correctness over implementation speed. 