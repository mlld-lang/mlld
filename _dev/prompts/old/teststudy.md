We are dealing with the following issue:

\======= ISSUE DETAILS

# [State Snapshot Retrieval Failure] Issue Investigation

## Issue Description

The test `should handle execution directives correctly` in `api/api.test.ts` is failing because the state debugger service is unable to retrieve state data for the test file's state ID. The error occurs during the `traceOperation` call when attempting to get a state snapshot.

The root cause appears to be in the state registration flow between file path changes and state tracking. When a new file is written with the same path as an existing state, the state isn't properly re-registered or updated in the tracking service.

## Related Code

### Code Files
- `api/api.test.ts`: Contains the failing test
- `services/StateDebuggerService/StateDebuggerService.ts`: Contains the debugging service implementation
- `services/StateTrackingService/StateTrackingService.ts`: Manages state tracking and relationships
- `services/StateService/StateService.ts`: Core state management implementation
- `tests/utils/TestContext.ts`: Test context setup and service initialization

### Test Files
- `api/api.test.ts`: The failing test file
- `tests/utils/TestContext.ts`: Test context setup and service initialization

## Evidence

### Test Expectations
1. The test writes a file with a `@run [echo test]` directive
2. Starts a debug session with enhanced configuration
3. Expects to be able to:
   - Get initial state visualization
   - Trace the operation with debugging
   - Get final state visualization
   - Generate transition diagrams

### Current Behavior
1. Test context initializes with 'test.meld' as default file path
2. Test writes new file at 'test.meld'
3. State service updates file path but doesn't trigger new state registration
4. Debug session starts
5. Fails when trying to get state snapshot with error:
   ```
   Failed to get state snapshot: Failed to retrieve state data for ID: test.meld
   ```

### Code Analysis

#### Test Structure
1. Test context initialization:
   ```typescript
   const state = new StateService();
   state.setCurrentFilePath('test.meld'); // Set initial file path
   state.setTrackingService(tracking); // Enable state tracking
   ```

2. Test setup:
   ```typescript
   await context.fs.writeFile(testFilePath, '@run [echo test]');
   const initialStateId = context.services.state.getStateId() || context.services.state.getCurrentFilePath() || 'unknown';
   ```

3. State update flow:
   ```typescript
   private updateState(updates: Partial<StateNode>, source: string): void {
     this.currentState = this.stateFactory.updateState(this.currentState, updates);
     // Emits event but doesn't update tracking service
   }
   ```

#### Related Tests
- Other format conversion tests in the same suite
- State tracking service tests
- State debugger service tests

### Debug Output

#### Visualization
Initial state hierarchy visualization attempt fails due to state snapshot retrieval error

#### Instrumentation Analysis
1. State tracking service is not receiving updates when file path changes
2. State ID exists but isn't properly tracked after file path update
3. The state service emits events but doesn't update tracking service metadata

## Attempted Solutions
No solutions attempted yet, but the fix should involve one of:

1. Register new state when file path changes:
   ```typescript
   setCurrentFilePath(path: string): void {
     this.checkMutable();
     this.updateState({ filePath: path }, 'setCurrentFilePath');
     // Add: Register new state with tracking service
     if (this.trackingService) {
       this.trackingService.registerState({
         id: this.currentState.stateId,
         source: 'filePathChange',
         filePath: path,
         transformationEnabled: this._transformationEnabled
       });
     }
   }
   ```

2. Update existing state metadata in tracking service:
   ```typescript
   private updateState(updates: Partial<StateNode>, source: string): void {
     this.currentState = this.stateFactory.updateState(this.currentState, updates);
     // Add: Update tracking service
     if (this.trackingService && this.currentState.stateId) {
       this.trackingService.registerState({
         id: this.currentState.stateId,
         source,
         filePath: this.currentState.filePath,
         transformationEnabled: this._transformationEnabled
       });
     }
   }
   ```

## Attempted Fix Results

### Fix Implementation
We implemented a two-part solution to address the state tracking issue:

1. Enhanced `setCurrentFilePath`:
```typescript
setCurrentFilePath(path: string): void {
  this.checkMutable();
  this.updateState({ filePath: path }, 'setCurrentFilePath');

  // Re-register the updated state with the tracking service
  if (this.trackingService && this.currentState?.stateId) {
    this.trackingService.registerState({
      id: this.currentState.stateId,
      source: 'filePathChange',
      filePath: path,
      transformationEnabled: this._transformationEnabled
    });
  }
}
```

2. Improved state initialization in constructor:
```typescript
constructor(parentState?: IStateService) {
  // ... existing initialization ...

  // Initialize state ID first
  this.currentState.stateId = crypto.randomUUID();

  // Register state with tracking service if available
  if (this.trackingService) {
    const parentId = parentState ? (parentState as StateService).currentState.stateId : undefined;

    this.trackingService.registerState({
      id: this.currentState.stateId,
      source: 'new',
      parentId,
      filePath: this.currentState.filePath,
      transformationEnabled: this._transformationEnabled
    });

    if (parentId) {
      this.trackingService.addRelationship(
        parentId,
        this.currentState.stateId!,
        'parent-child'
      );
    }
  }
}
```

### Results Analysis
1. The fix revealed that state tracking issues extend beyond just file path changes:
   - State IDs need to be generated immediately in the constructor
   - Parent-child relationships need to be established early
   - All state mutations need to consider tracking service updates

2. Key Learnings:
   - The state lifecycle is more complex than initially thought, involving:
     * Initial state creation and ID assignment
     * Parent-child relationship tracking
     * State mutations and updates
     * Service relationship management (event service, tracking service)

   - The tracking service needs to be notified of state changes in multiple scenarios:
     * File path changes
     * State cloning
     * Child state creation
     * State merging

3. Additional Considerations:
   - State ID generation timing is critical - must happen before any tracking service registration
   - Parent-child relationships need explicit management
   - Service inheritance patterns need to be consistent across all state operations
   - Event emission and state tracking need to be coordinated

### Impact on Test Failures
The fix addresses the immediate test failure by ensuring that:
1. States always have a valid ID from creation
2. The tracking service is kept up-to-date with state changes
3. File path changes trigger proper state registration updates

However, this investigation suggests we may need a more comprehensive review of state lifecycle management across the codebase.

### Future Recommendations
1. Add explicit state lifecycle documentation
2. Create state transition diagrams for common operations
3. Add validation checks for state tracking consistency
4. Consider adding a state validation service
5. Add more comprehensive tests for state tracking scenarios

## Additional Notes
1. The state tracking system involves multiple services that need to be properly coordinated:
   - StateService: Creates and manages state
   - StateTrackingService: Tracks state relationships
   - StateDebuggerService: Provides debugging capabilities
2. The issue is in the handoff between these services, specifically around state updates
3. The current design doesn't clearly specify when state should be re-registered vs. updated

## Next Steps
1. Decide on the correct state lifecycle behavior:
   - Should file path changes create new states?
   - Or should they update existing state metadata?
2. Implement the chosen solution in StateService
3. Add tests specifically for state lifecycle events
4. Update documentation to clarify state lifecycle behavior
5. Consider adding state validation in the debugger service to provide better error messages

\======= END ISSUE

\======= STATE SERVICES CODE AND TESTS

Processing...

\======= END STATE SERVICES CODE AND TESTS

\======= TEST RESULTS

> meld@10.0.0 test
> vitest run services

 RUN  v2.1.9 /Users/adam/dev/meld

stdout | services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts > RunDirectiveHandler > error handling > should handle validation errors
2025-02-23 15:33:02 [error] [directive] Error executing run directive: Directive error (run): Invalid command
{
  "kind": "run",
  "code": "VALIDATION_FAILED",
  "name": "DirectiveError",
  "stack": "DirectiveError: Directive error (run): Invalid command\n    at /Users/adam/dev/meld/services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts:183:9\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11\n    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)\n    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)\n    at processTicksAndRejections (node:internal/process/task_queues:105:5)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)"
}

stdout | services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts > RunDirectiveHandler > error handling > should handle resolution errors
2025-02-23 15:33:02 [error] [directive] Error executing run directive: Variable not found
{
  "stack": "Error: Variable not found\n    at /Users/adam/dev/meld/services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts:199:9\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11\n    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)\n    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)\n    at processTicksAndRejections (node:internal/process/task_queues:105:5)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)"
}

stdout | services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts > RunDirectiveHandler > error handling > should handle command execution errors
2025-02-23 15:33:02 [error] [directive] Error executing run directive: Command failed
{
  "stack": "Error: Command failed\n    at /Users/adam/dev/meld/services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts:216:9\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11\n    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)\n    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)\n    at processTicksAndRejections (node:internal/process/task_queues:105:5)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)"
}

stdout | services/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts > ImportDirectiveHandler > special path variables > should throw error if resolved path does not exist
2025-02-23 15:33:02 [error] [directive] Failed to process import directive
{
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "name": "DirectiveError",
    "message": "Directive error (import): Import file not found: [$./nonexistent.meld] at line 1, column 1",
    "kind": "import",
    "code": "FILE_NOT_FOUND",
    "location": {
      "start": {
        "line": 1,
        "column": 1
      },
      "end": {
        "line": 1,
        "column": 1
      }
    }
  }
}

stdout | services/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts > ImportDirectiveHandler > basic importing > should handle invalid import list syntax
2025-02-23 15:33:02 [error] [directive] Failed to process import directive
{
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "name": "DirectiveError",
    "message": "Directive error (import): Variable not found: invalid syntax",
    "kind": "import",
    "code": "VARIABLE_NOT_FOUND"
  }
}

stdout | services/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts > ImportDirectiveHandler > error handling > should handle validation errors
2025-02-23 15:33:02 [error] [directive] Failed to process import directive
{
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "name": "DirectiveError",
    "message": "Directive error (import): Invalid import",
    "kind": "import"
  }
}

 ✓ services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts (10 tests) 12ms
stdout | services/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts > ImportDirectiveHandler > error handling > should handle circular imports
2025-02-23 15:33:02 [error] [directive] Failed to process import directive
{
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "name": "DirectiveError",
    "message": "Directive error (import): Directive error (import): Circular import detected at line 1, column 1 in test.meld | Caused by: Directive error (import): Circular import detected",
    "kind": "import",
    "location": {
      "start": {
        "line": 1,
        "column": 1
      },
      "end": {
        "line": 1,
        "column": 1
      }
    },
    "filePath": "test.meld",
    "cause": "Directive error (import): Circular import detected",
    "fullCauseMessage": "Directive error (import): Circular import detected"
  }
}

stdout | services/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts > ImportDirectiveHandler > error handling > should handle parse errors
2025-02-23 15:33:02 [error] [directive] Failed to process import directive
{
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "name": "DirectiveError",
    "message": "Directive error (import): Import file not found: [[invalid.meld]] at line 1, column 1 in test.meld",
    "kind": "import",
    "code": "FILE_NOT_FOUND",
    "location": {
      "start": {
        "line": 1,
        "column": 1
      },
      "end": {
        "line": 1,
        "column": 1
      }
    },
    "filePath": "test.meld"
  }
}

stdout | services/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts > ImportDirectiveHandler > error handling > should handle interpretation errors
2025-02-23 15:33:02 [error] [directive] Failed to process import directive
{
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "name": "DirectiveError",
    "message": "Directive error (import): Import file not found: [[error.meld]] at line 1, column 1 in test.meld",
    "kind": "import",
    "code": "FILE_NOT_FOUND",
    "location": {
      "start": {
        "line": 1,
        "column": 1
      },
      "end": {
        "line": 1,
        "column": 1
      }
    },
    "filePath": "test.meld"
  }
}

stdout | services/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts > ImportDirectiveHandler > cleanup > should always end import tracking
2025-02-23 15:33:02 [error] [directive] Failed to process import directive
{
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {}
}

 ✓ services/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts (15 tests | 2 skipped) 17ms
stdout | services/StateTrackingService/StateTrackingService.test.ts > StateTrackingService > Merge Operations > should handle merge target relationships
Created source state: 80418b37-3734-4659-a4f8-eadc95e30423
Created target state: 51d01c3f-4225-4b7f-9898-bd925b8fe805
Created parent state: 197b98a5-a924-48d4-924d-0e5e46281508

Initial States:
graph TD;

Added parent-child relationship: {
  parent: '197b98a5-a924-48d4-924d-0e5e46281508',
  child: '51d01c3f-4225-4b7f-9898-bd925b8fe805',
  parentMetadata: {
    id: '197b98a5-a924-48d4-924d-0e5e46281508',
    source: 'new',
    parentId: undefined,
    filePath: undefined,
    transformationEnabled: true,
    createdAt: 1740353582262
  },
  childMetadata: {
    id: '51d01c3f-4225-4b7f-9898-bd925b8fe805',
    source: 'new',
    parentId: '197b98a5-a924-48d4-924d-0e5e46281508',
    filePath: undefined,
    transformationEnabled: true,
    createdAt: 1740353582262
  },
  parentRelationships: [
    {
      targetId: '51d01c3f-4225-4b7f-9898-bd925b8fe805',
      type: 'parent-child'
    }
  ],
  childRelationships: []
}

After Parent-Child Relationship:
graph TD;
    51d01c3f-4225-4b7f-9898-bd925b8fe805 -->|parent-child| parent-child style="solid,#000000";

Added merge-target relationship: {
  source: '80418b37-3734-4659-a4f8-eadc95e30423',
  target: '51d01c3f-4225-4b7f-9898-bd925b8fe805',
  sourceMetadata: {
    id: '80418b37-3734-4659-a4f8-eadc95e30423',
    source: 'new',
    parentId: '197b98a5-a924-48d4-924d-0e5e46281508',
    filePath: undefined,
    transformationEnabled: true,
    createdAt: 1740353582262
  },
  targetMetadata: {
    id: '51d01c3f-4225-4b7f-9898-bd925b8fe805',
    source: 'new',
    parentId: '197b98a5-a924-48d4-924d-0e5e46281508',
    filePath: undefined,
    transformationEnabled: true,
    createdAt: 1740353582262
  },
  sourceRelationships: [
    {
      targetId: '51d01c3f-4225-4b7f-9898-bd925b8fe805',
      type: 'merge-target'
    }
  ],
  targetRelationships: []
}

After Merge-Target Relationship:
graph TD;
    51d01c3f-4225-4b7f-9898-bd925b8fe805 -->|parent-child| parent-child style="solid,#000000";
    80418b37-3734-4659-a4f8-eadc95e30423 -->|parent-child| parent-child style="solid,#000000";

State Transitions:

State Lineage: {
  sourceId: '80418b37-3734-4659-a4f8-eadc95e30423',
  targetId: '51d01c3f-4225-4b7f-9898-bd925b8fe805',
  parentId: '197b98a5-a924-48d4-924d-0e5e46281508',
  lineage: [
    '197b98a5-a924-48d4-924d-0e5e46281508',
    '51d01c3f-4225-4b7f-9898-bd925b8fe805',
    '80418b37-3734-4659-a4f8-eadc95e30423'
  ],
  sourceMetadata: {
    id: '80418b37-3734-4659-a4f8-eadc95e30423',
    source: 'new',
    parentId: '197b98a5-a924-48d4-924d-0e5e46281508',
    filePath: undefined,
    transformationEnabled: true,
    createdAt: 1740353582262
  },
  targetMetadata: {
    id: '51d01c3f-4225-4b7f-9898-bd925b8fe805',
    source: 'new',
    parentId: '197b98a5-a924-48d4-924d-0e5e46281508',
    filePath: undefined,
    transformationEnabled: true,
    createdAt: 1740353582262
  },
  parentMetadata: {
    id: '197b98a5-a924-48d4-924d-0e5e46281508',
    source: 'new',
    parentId: undefined,
    filePath: undefined,
    transformationEnabled: true,
    createdAt: 1740353582262
  },
  sourceRelationships: [
    {
      targetId: '51d01c3f-4225-4b7f-9898-bd925b8fe805',
      type: 'merge-target'
    }
  ],
  targetRelationships: [],
  parentRelationships: [
    {
      targetId: '51d01c3f-4225-4b7f-9898-bd925b8fe805',
      type: 'parent-child'
    }
  ]
}

Complete Debug Report: Debug Session Report (65f09968-6133-4fa3-bfda-f2f4c563876f)
Duration: 0.003s

Diagnostics:

Metrics:

Snapshots:

 ✓ services/StateTrackingService/StateTrackingService.test.ts (14 tests) 13ms
 ✓ services/StateVisualizationService/StateVisualizationService.test.ts (26 tests) 17ms
stdout | services/StateService/StateService.test.ts > StateService > State Tracking > should track state lineage
Initial State:
graph TD;

After Creating Child:
graph TD;
    2d02c2f8-3d37-40ee-9435-1bc33f73826e -->|parent-child| parent-child style="solid,#000000";

After Creating Grandchild:
graph TD;
    2d02c2f8-3d37-40ee-9435-1bc33f73826e -->|parent-child| parent-child style="solid,#000000";
    c0307f5b-460e-4796-9bd7-5a28175c6824 -->|parent-child| parent-child style="solid,#000000";

State Lineage: [
  'bfc56dcd-90ea-4675-b220-512097c43049',
  '2d02c2f8-3d37-40ee-9435-1bc33f73826e',
  'c0307f5b-460e-4796-9bd7-5a28175c6824'
]

State Transitions:

Complete Debug Report: Debug Session Report (b9bfd1c3-a84d-4a87-835d-ea48ddd120a5)
Duration: 0.003s

Diagnostics:

Metrics:

Snapshots:

 ✓ services/StateService/StateService.test.ts (39 tests) 17ms
stdout | services/InterpreterService/InterpreterService.unit.test.ts > InterpreterService Unit > node interpretation > throws on unknown node types
2025-02-23 15:33:02 [error] [interpreter] Interpretation failed
{
  "nodeCount": 1,
  "filePath": "",
  "error": {
    "name": "MeldInterpreterError",
    "message": "Unknown node type: Unknown at line 1, column 1",
    "nodeType": "unknown_node",
    "location": {
      "line": 1,
      "column": 1
    }
  }
}

stdout | services/InterpreterService/InterpreterService.unit.test.ts > InterpreterService Unit > error handling > wraps non-interpreter errors
2025-02-23 15:33:02 [error] [interpreter] Interpretation failed
{
  "nodeCount": 1,
  "filePath": "",
  "error": {
    "name": "MeldInterpreterError",
    "message": "Test error at line 1, column 1",
    "nodeType": "Directive",
    "location": {
      "line": 1,
      "column": 1
    },
    "cause": "Test error",
    "fullCauseMessage": "Test error",
    "context": {
      "nodeType": "Directive"
    }
  }
}

stdout | services/InterpreterService/InterpreterService.unit.test.ts > InterpreterService Unit > error handling > preserves interpreter errors
2025-02-23 15:33:02 [error] [interpreter] Interpretation failed
{
  "nodeCount": 1,
  "filePath": "",
  "error": {
    "name": "MeldInterpreterError",
    "message": "Test error",
    "nodeType": "test"
  }
}

stdout | services/InterpreterService/InterpreterService.unit.test.ts > InterpreterService Unit > error handling > includes node location in errors
2025-02-23 15:33:02 [error] [interpreter] Interpretation failed
{
  "nodeCount": 1,
  "filePath": "",
  "error": {
    "name": "MeldInterpreterError",
    "message": "Test error at line 42, column 10",
    "nodeType": "Directive",
    "location": {
      "line": 42,
      "column": 10
    },
    "cause": "Test error",
    "fullCauseMessage": "Test error",
    "context": {
      "nodeType": "Directive"
    }
  }
}

stdout | services/InterpreterService/InterpreterService.unit.test.ts > InterpreterService Unit > child context creation > handles errors in child context creation
2025-02-23 15:33:02 [error] [interpreter] Failed to create child context
{
  "error": {}
}

stdout | services/InterpreterService/InterpreterService.unit.test.ts > InterpreterService Unit > edge cases > handles state initialization failures
2025-02-23 15:33:02 [error] [interpreter] Interpretation failed
{
  "nodeCount": 0,
  "filePath": "",
  "error": {
    "name": "MeldInterpreterError",
    "message": "Failed to initialize state for interpretation",
    "nodeType": "initialization"
  }
}

stdout | services/InterpreterService/InterpreterService.unit.test.ts > InterpreterService Unit > edge cases > handles state rollback on partial failures
2025-02-23 15:33:02 [error] [interpreter] Interpretation failed
{
  "nodeCount": 3,
  "filePath": "",
  "error": {
    "name": "MeldInterpreterError",
    "message": "Test error at line 2, column 1",
    "nodeType": "Directive",
    "location": {
      "line": 2,
      "column": 1
    },
    "cause": "Test error",
    "fullCauseMessage": "Test error",
    "context": {
      "nodeType": "Directive"
    }
  }
}

 ✓ services/InterpreterService/InterpreterService.unit.test.ts (22 tests) 33ms
stdout | services/CLIService/CLIService.test.ts > CLIService > Format Conversion > should output llm format by default
test output
2025-02-23 15:33:02 [info] [cli] Successfully wrote output to stdout

stdout | services/CLIService/CLIService.test.ts > CLIService > Format Conversion > should handle format aliases correctly
test output
2025-02-23 15:33:02 [info] [cli] Successfully wrote output to stdout

stdout | services/CLIService/CLIService.test.ts > CLIService > Format Conversion > should preserve markdown with markdown format
test output
2025-02-23 15:33:02 [info] [cli] Successfully wrote output to stdout

stdout | services/CLIService/CLIService.test.ts > CLIService > Command Line Options > should display version when --version flag is used
meld version 10.0.0

stdout | services/CLIService/CLIService.test.ts > CLIService > Command Line Options > should respect --stdout option
test output
2025-02-23 15:33:02 [info] [cli] Successfully wrote output to stdout

stdout | services/CLIService/CLIService.test.ts > CLIService > Command Line Options > should use default output path when not specified
2025-02-23 15:33:02 [info] [cli] Successfully wrote output file
{
  "path": "test.xml"
}

stdout | services/CLIService/CLIService.test.ts > CLIService > Command Line Options > should handle project path option
2025-02-23 15:33:02 [info] [cli] Successfully wrote output file
{
  "path": "/project/test.xml"
}

stdout | services/CLIService/CLIService.test.ts > CLIService > Command Line Options > should handle home path option
2025-02-23 15:33:02 [info] [cli] Successfully wrote output file
{
  "path": "test.xml"
}

stdout | services/CLIService/CLIService.test.ts > CLIService > Command Line Options > should handle verbose option
2025-02-23 15:33:02 [info] [cli] Verbose mode enabled
2025-02-23 15:33:02 [info] [cli] Successfully wrote output file
{
  "path": "test.xml"
}

stdout | services/CLIService/CLIService.test.ts > CLIService > Command Line Options > should handle watch option
2025-02-23 15:33:02 [info] [cli] Starting watch mode
{
  "input": "test.meld"
}
2025-02-23 15:33:02 [info] [cli] Watching for changes
{
  "directory": "."
}

stdout | services/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > State management > handles state rollback on merge errors
2025-02-23 15:33:02 [error] [interpreter] Interpretation failed
{
  "nodeCount": 1,
  "filePath": "test.meld",
  "error": {
    "name": "MeldInterpreterError",
    "message": "Directive error (text): Failed to resolve variables in text directive at line 1, column 1 in test.meld | Caused by: Resolution error (UNDEFINED_VARIABLE): Undefined variable: nonexistent at line 1, column 1",
    "nodeType": "Directive",
    "location": {
      "line": 1,
      "column": 1
    },
    "cause": "Directive error (text): Failed to resolve variables in text directive at line 1, column 1 in test.meld | Caused by: Resolution error (UNDEFINED_VARIABLE): Undefined variable: nonexistent",
    "fullCauseMessage": "Directive error (text): Failed to resolve variables in text directive at line 1, column 1 in test.meld | Caused by: Resolution error (UNDEFINED_VARIABLE): Undefined variable: nonexistent | Caused by: Resolution error (UNDEFINED_VARIABLE): Undefined variable: nonexistent",
    "context": {
      "nodeType": "Directive"
    }
  }
}

stdout | services/OutputService/OutputService.test.ts > OutputService > LLM XML Output > should preserve text content
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-02-23T23:33:02.354Z"}

stdout | services/OutputService/OutputService.test.ts > OutputService > LLM XML Output > should preserve code fence content
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-02-23T23:33:02.371Z"}

stdout | services/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > Error handling > handles circular imports
2025-02-23 15:33:02 [warn] [import] Attempted to end import for file not in stack
{
  "filePath": "project/src/circular1.meld",
  "currentStack": []
}
2025-02-23 15:33:02 [error] [directive] Failed to process import directive
{
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "name": "DirectiveError",
    "message": "Directive error (import): Import file not found: [project/src/circular1.meld] at line 1, column 1 in test.meld",
    "kind": "import",
    "code": "FILE_NOT_FOUND",
    "location": {
      "start": {
        "line": 1,
        "column": 1
      },
      "end": {
        "line": 1,
        "column": 1
      }
    },
    "filePath": "test.meld"
  }
}
2025-02-23 15:33:02 [error] [interpreter] Interpretation failed
{
  "nodeCount": 1,
  "filePath": "test.meld",
  "error": {
    "name": "MeldInterpreterError",
    "message": "Directive error (import): Import file not found: [project/src/circular1.meld] at line 1, column 1 in test.meld at line 1, column 1",
    "nodeType": "Directive",
    "location": {
      "line": 1,
      "column": 1
    },
    "cause": "Directive error (import): Import file not found: [project/src/circular1.meld] at line 1, column 1 in test.meld",
    "fullCauseMessage": "Directive error (import): Import file not found: [project/src/circular1.meld] at line 1, column 1 in test.meld",
    "context": {
      "nodeType": "Directive"
    }
  }
}

stdout | services/OutputService/OutputService.test.ts > OutputService > LLM XML Output > should handle directives according to type
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-02-23T23:33:02.401Z"}

stdout | services/OutputService/OutputService.test.ts > OutputService > LLM XML Output > should handle directives according to type
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-02-23T23:33:02.410Z"}

stdout | services/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > Error handling > provides location information in errors
2025-02-23 15:33:02 [error] [interpreter] Interpretation failed
{
  "nodeCount": 1,
  "filePath": "test.meld",
  "error": {
    "name": "MeldInterpreterError",
    "message": "Directive error (text): Failed to resolve variables in text directive at line 1, column 1 in test.meld | Caused by: Resolution error (UNDEFINED_VARIABLE): Undefined variable: nonexistent at line 1, column 1",
    "nodeType": "Directive",
    "location": {
      "line": 1,
      "column": 1
    },
    "cause": "Directive error (text): Failed to resolve variables in text directive at line 1, column 1 in test.meld | Caused by: Resolution error (UNDEFINED_VARIABLE): Undefined variable: nonexistent",
    "fullCauseMessage": "Directive error (text): Failed to resolve variables in text directive at line 1, column 1 in test.meld | Caused by: Resolution error (UNDEFINED_VARIABLE): Undefined variable: nonexistent | Caused by: Resolution error (UNDEFINED_VARIABLE): Undefined variable: nonexistent",
    "context": {
      "nodeType": "Directive"
    }
  }
}

stdout | services/OutputService/OutputService.test.ts > OutputService > LLM XML Output > should preserve state variables when requested
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-02-23T23:33:02.412Z"}

stdout | services/OutputService/OutputService.test.ts > OutputService > Transformation Mode > should handle LLM output in both modes
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-02-23T23:33:02.415Z"}

stdout | services/OutputService/OutputService.test.ts > OutputService > Transformation Mode > should handle LLM output in both modes
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"all"},"timestamp":"2025-02-23T23:33:02.418Z"}

stdout | services/OutputService/OutputService.test.ts > OutputService > Error Handling > should throw MeldOutputError for unknown node types
2025-02-23 15:33:02 [error] [output] Failed to convert output
{
  "format": "markdown",
  "error": {
    "format": "markdown",
    "cause": {
      "format": "markdown",
      "name": "MeldOutputError"
    },
    "name": "MeldOutputError"
  }
}

stdout | services/OutputService/OutputService.test.ts > OutputService > Error Handling > should wrap errors from format converters
2025-02-23 15:33:02 [error] [output] Failed to convert output
{
  "format": "error",
  "error": {}
}

stdout | services/OutputService/OutputService.test.ts > OutputService > Error Handling > should preserve MeldOutputError when thrown from converters
2025-02-23 15:33:02 [error] [output] Failed to convert output
{
  "format": "error",
  "error": {
    "format": "error",
    "name": "MeldOutputError"
  }
}

stdout | services/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > Error handling > maintains state consistency after errors
2025-02-23 15:33:02 [error] [interpreter] Interpretation failed
{
  "nodeCount": 2,
  "filePath": "test.meld",
  "error": {
    "name": "MeldInterpreterError",
    "message": "Directive error (text): Failed to resolve variables in text directive at line 2, column 1 in test.meld | Caused by: Resolution error (UNDEFINED_VARIABLE): Undefined variable: nonexistent at line 2, column 1",
    "nodeType": "Directive",
    "location": {
      "line": 2,
      "column": 1
    },
    "cause": "Directive error (text): Failed to resolve variables in text directive at line 2, column 1 in test.meld | Caused by: Resolution error (UNDEFINED_VARIABLE): Undefined variable: nonexistent",
    "fullCauseMessage": "Directive error (text): Failed to resolve variables in text directive at line 2, column 1 in test.meld | Caused by: Resolution error (UNDEFINED_VARIABLE): Undefined variable: nonexistent | Caused by: Resolution error (UNDEFINED_VARIABLE): Undefined variable: nonexistent",
    "context": {
      "nodeType": "Directive"
    }
  }
}

 ✓ services/OutputService/OutputService.test.ts (22 tests) 150ms
stdout | services/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > Error handling > includes state context in interpreter errors
2025-02-23 15:33:02 [error] [interpreter] Interpretation failed
{
  "nodeCount": 1,
  "filePath": "test.meld",
  "error": {
    "name": "MeldInterpreterError",
    "message": "Directive error (text): Failed to resolve variables in text directive at line 1, column 1 in test.meld | Caused by: Resolution error (UNDEFINED_VARIABLE): Undefined variable: nonexistent at line 1, column 1",
    "nodeType": "Directive",
    "location": {
      "line": 1,
      "column": 1
    },
    "cause": "Directive error (text): Failed to resolve variables in text directive at line 1, column 1 in test.meld | Caused by: Resolution error (UNDEFINED_VARIABLE): Undefined variable: nonexistent",
    "fullCauseMessage": "Directive error (text): Failed to resolve variables in text directive at line 1, column 1 in test.meld | Caused by: Resolution error (UNDEFINED_VARIABLE): Undefined variable: nonexistent | Caused by: Resolution error (UNDEFINED_VARIABLE): Undefined variable: nonexistent",
    "context": {
      "nodeType": "Directive"
    }
  }
}

stdout | services/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > Error handling > rolls back state on directive errors
2025-02-23 15:33:02 [error] [interpreter] Interpretation failed
{
  "nodeCount": 3,
  "filePath": "test.meld",
  "error": {
    "name": "MeldInterpreterError",
    "message": "Directive error (text): Failed to resolve variables in text directive at line 2, column 1 in test.meld | Caused by: Resolution error (UNDEFINED_VARIABLE): Undefined variable: nonexistent at line 2, column 1",
    "nodeType": "Directive",
    "location": {
      "line": 2,
      "column": 1
    },
    "cause": "Directive error (text): Failed to resolve variables in text directive at line 2, column 1 in test.meld | Caused by: Resolution error (UNDEFINED_VARIABLE): Undefined variable: nonexistent",
    "fullCauseMessage": "Directive error (text): Failed to resolve variables in text directive at line 2, column 1 in test.meld | Caused by: Resolution error (UNDEFINED_VARIABLE): Undefined variable: nonexistent | Caused by: Resolution error (UNDEFINED_VARIABLE): Undefined variable: nonexistent",
    "context": {
      "nodeType": "Directive"
    }
  }
}

stdout | services/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > Error handling > handles cleanup on circular imports
2025-02-23 15:33:02 [warn] [import] Attempted to end import for file not in stack
{
  "filePath": "project/src/circular1.meld",
  "currentStack": []
}
2025-02-23 15:33:02 [error] [directive] Failed to process import directive
{
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "name": "DirectiveError",
    "message": "Directive error (import): Import file not found: [project/src/circular1.meld] at line 1, column 1 in test.meld",
    "kind": "import",
    "code": "FILE_NOT_FOUND",
    "location": {
      "start": {
        "line": 1,
        "column": 1
      },
      "end": {
        "line": 1,
        "column": 1
      }
    },
    "filePath": "test.meld"
  }
}
2025-02-23 15:33:02 [error] [interpreter] Interpretation failed
{
  "nodeCount": 1,
  "filePath": "test.meld",
  "error": {
    "name": "MeldInterpreterError",
    "message": "Directive error (import): Import file not found: [project/src/circular1.meld] at line 1, column 1 in test.meld at line 1, column 1",
    "nodeType": "Directive",
    "location": {
      "line": 1,
      "column": 1
    },
    "cause": "Directive error (import): Import file not found: [project/src/circular1.meld] at line 1, column 1 in test.meld",
    "fullCauseMessage": "Directive error (import): Import file not found: [project/src/circular1.meld] at line 1, column 1 in test.meld",
    "context": {
      "nodeType": "Directive"
    }
  }
}

stdout | services/CLIService/CLIService.test.ts > CLIService > Command Line Options > should handle watch option
2025-02-23 15:33:02 [info] [cli] Change detected
{
  "file": "test.meld"
}
2025-02-23 15:33:02 [info] [cli] Successfully wrote output file
{
  "path": "test.xml"
}

 ✓ services/InterpreterService/InterpreterService.integration.test.ts (24 tests | 4 skipped) 210ms
 ✓ services/DirectiveService/handlers/execution/EmbedDirectiveHandler.test.ts (8 tests) 12ms
 ✓ services/DirectiveService/handlers/definition/DefineDirectiveHandler.test.ts (16 tests) 16ms
stdout | services/ValidationService/ValidationService.test.ts > ValidationService > Text directive validation > should throw on missing name
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "text",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "text",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "text",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "text",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}

stdout | services/ValidationService/ValidationService.test.ts > ValidationService > Text directive validation > should throw on missing value
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "text",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "text",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "text",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "text",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}

stdout | services/ValidationService/ValidationService.test.ts > ValidationService > Text directive validation > should throw on invalid name format
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "text",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "text",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "text",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "text",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}

stdout | services/ValidationService/ValidationService.test.ts > ValidationService > Data directive validation > should throw on invalid JSON string
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "data",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "data",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "data",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "data",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}

stdout | services/ValidationService/ValidationService.test.ts > ValidationService > Data directive validation > should throw on missing name
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "data",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "data",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "data",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "data",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}

stdout | services/ValidationService/ValidationService.test.ts > ValidationService > Data directive validation > should throw on invalid name format
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "data",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "data",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "data",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "data",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}

stdout | services/ValidationService/ValidationService.test.ts > ValidationService > Path directive validation > should throw on missing identifier
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "path",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "path",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "path",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "path",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}

stdout | services/ValidationService/ValidationService.test.ts > ValidationService > Path directive validation > should throw on invalid identifier format
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "path",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "path",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "path",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "path",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}

stdout | services/ValidationService/ValidationService.test.ts > ValidationService > Path directive validation > should throw on missing value
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "path",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "path",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "path",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "path",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}

stdout | services/ValidationService/ValidationService.test.ts > ValidationService > Path directive validation > should throw on empty path value
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "path",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "path",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "path",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "path",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}

stdout | services/ValidationService/ValidationService.test.ts > ValidationService > Import directive validation > should throw on missing path
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "import",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "import",
    "location": {
      "start": {
        "line": 1,
        "column": 1
      },
      "end": {
        "line": 1,
        "column": 1
      }
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "import",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "import",
    "location": {
      "start": {
        "line": 1,
        "column": 1
      },
      "end": {
        "line": 1,
        "column": 1
      }
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}

stdout | services/ValidationService/ValidationService.test.ts > ValidationService > Embed directive validation > should throw on missing path
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "embed",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "embed",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "embed",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "embed",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}

stdout | services/ValidationService/ValidationService.test.ts > ValidationService > Embed directive validation > should throw on invalid fuzzy threshold (below 0)
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "embed",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "embed",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "embed",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "embed",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}

stdout | services/ValidationService/ValidationService.test.ts > ValidationService > Embed directive validation > should throw on invalid fuzzy threshold (above 1)
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "embed",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "embed",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}
2025-02-23 15:33:02 [error] [validation] Directive validation failed
{
  "kind": "embed",
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "directiveKind": "embed",
    "location": {
      "line": 1,
      "column": 1
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}

 ✓ services/ValidationService/ValidationService.test.ts (30 tests) 16ms
 ✓ services/DirectiveService/handlers/definition/DataDirectiveHandler.test.ts (9 tests) 21ms
 ✓ services/DirectiveService/handlers/definition/TextDirectiveHandler.test.ts (15 tests) 17ms
stdout | services/ResolutionService/ResolutionService.test.ts > ResolutionService > extractSection > should extract section by heading
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"none"},"timestamp":"2025-02-23T23:33:02.658Z"}

stdout | services/ResolutionService/ResolutionService.test.ts > ResolutionService > extractSection > should include content until next heading of same or higher level
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"none"},"timestamp":"2025-02-23T23:33:02.666Z"}

stdout | services/ResolutionService/ResolutionService.test.ts > ResolutionService > extractSection > should throw when section is not found
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"includeHlevel":false,"includeTitle":false,"tagFormat":"PascalCase","verbose":false,"warningLevel":"none"},"timestamp":"2025-02-23T23:33:02.668Z"}

 ✓ services/ResolutionService/ResolutionService.test.ts (18 tests) 99ms
 ✓ services/DirectiveService/handlers/execution/EmbedDirectiveHandler.transformation.test.ts (7 tests) 10ms
 ✓ services/ParserService/ParserService.test.ts (17 tests) 41ms
 ✓ services/ResolutionService/resolvers/PathResolver.test.ts (15 tests | 1 skipped) 6ms
 ✓ services/StateDebuggerService/StateDebuggerService.test.ts (15 tests) 7ms
 ✓ services/StateService/StateFactory.test.ts (10 tests) 6ms
stdout | services/StateEventService/StateInstrumentation.test.ts > State Instrumentation > Error Handling > should handle errors in event handlers without affecting others
2025-02-23 15:33:02 [error] [state] Error in error event handler
{
  "error": "Handler error",
  "stateId": "test"
}

 ❯ services/StateEventService/StateInstrumentation.test.ts (7 tests | 1 failed) 27ms
   × State Instrumentation > Event Filtering > should support complex filtering patterns 5ms
     → expected [ 'transform:test-1', …(3) ] to deeply equal [ 'transform:test-1', …(2) ]
stdout | services/DirectiveService/handlers/execution/ImportDirectiveHandler.transformation.test.ts > ImportDirectiveHandler Transformation > transformation behavior > should preserve error handling in transformation mode
2025-02-23 15:33:02 [error] [directive] Failed to process import directive
{
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "name": "DirectiveError",
    "message": "Directive error (import): Import file not found: [missing.meld] at line 1, column 1 in test.meld",
    "kind": "import",
    "code": "FILE_NOT_FOUND",
    "location": {
      "start": {
        "line": 1,
        "column": 1
      },
      "end": {
        "line": 1,
        "column": 1
      }
    },
    "filePath": "test.meld"
  }
}

 ✓ services/DirectiveService/handlers/execution/ImportDirectiveHandler.transformation.test.ts (4 tests) 8ms
 ✓ services/CLIService/CLIService.test.ts (20 tests | 3 skipped) 665ms
   ✓ CLIService > Command Line Options > should handle watch option 605ms
stdout | services/CLIService/CLIService.test.ts > CLIService > File Overwrite Handling > should prompt for overwrite when file exists
2025-02-23 15:33:02 [info] [cli] Successfully wrote output file
{
  "path": "test.xml"
}

stdout | services/DirectiveService/DirectiveService.test.ts > DirectiveService > Directive processing > Text directives > should process basic text directive
test.meld exists: true
test.meld content: @text greeting = "Hello"

stdout | services/DirectiveService/DirectiveService.test.ts > DirectiveService > Directive processing > Text directives > should process basic text directive
Parsed nodes: [
  {
    type: 'Directive',
    directive: {
      kind: 'text',
      identifier: 'greeting',
      source: 'literal',
      value: 'Hello'
    },
    location: { start: [Object], end: [Object] }
  }
]

stdout | services/DirectiveService/DirectiveService.test.ts > DirectiveService > Directive processing > Import directives > should detect circular imports
2025-02-23 15:33:03 [error] [validation] Directive validation failed
{
  "kind": "import",
  "location": {
    "start": {
      "line": 1,
      "column": 2
    },
    "end": {
      "line": 1,
      "column": 17
    }
  },
  "error": {
    "directiveKind": "import",
    "location": {
      "start": {
        "line": 1,
        "column": 2
      },
      "end": {
        "line": 1,
        "column": 17
      }
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}
2025-02-23 15:33:03 [error] [directive] Failed to validate directive
{
  "kind": "import",
  "location": {
    "start": {
      "line": 1,
      "column": 2
    },
    "end": {
      "line": 1,
      "column": 17
    }
  },
  "error": {
    "directiveKind": "import",
    "location": {
      "start": {
        "line": 1,
        "column": 2
      },
      "end": {
        "line": 1,
        "column": 17
      }
    },
    "name": "MeldDirectiveError",
    "code": "VALIDATION_FAILED"
  }
}
2025-02-23 15:33:03 [error] [interpreter] Interpretation failed
{
  "nodeCount": 1,
  "filePath": "b.meld",
  "error": {
    "name": "MeldInterpreterError",
    "message": "Directive error (import): Directive error (import): Invalid import syntax. Expected either @import [file.md] or @import [x,y,z] from [file.md] at line undefined, column undefined at line 1, column 2 at line 1, column 2",
    "nodeType": "Directive",
    "location": {
      "line": 1,
      "column": 2
    },
    "cause": "Directive error (import): Directive error (import): Invalid import syntax. Expected either @import [file.md] or @import [x,y,z] from [file.md] at line undefined, column undefined at line 1, column 2",
    "fullCauseMessage": "Directive error (import): Directive error (import): Invalid import syntax. Expected either @import [file.md] or @import [x,y,z] from [file.md] at line undefined, column undefined at line 1, column 2",
    "context": {
      "nodeType": "Directive"
    }
  }
}
2025-02-23 15:33:03 [warn] [import] Attempted to end import for file not in stack
{
  "filePath": "b.meld",
  "currentStack": []
}
2025-02-23 15:33:03 [error] [directive] Failed to process import directive
{
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "name": "MeldInterpreterError",
    "message": "Directive error (import): Directive error (import): Invalid import syntax. Expected either @import [file.md] or @import [x,y,z] from [file.md] at line undefined, column undefined at line 1, column 2 at line 1, column 2",
    "nodeType": "Directive",
    "location": {
      "line": 1,
      "column": 2
    },
    "cause": "Directive error (import): Directive error (import): Invalid import syntax. Expected either @import [file.md] or @import [x,y,z] from [file.md] at line undefined, column undefined at line 1, column 2",
    "fullCauseMessage": "Directive error (import): Directive error (import): Invalid import syntax. Expected either @import [file.md] or @import [x,y,z] from [file.md] at line undefined, column undefined at line 1, column 2",
    "context": {
      "nodeType": "Directive"
    }
  }
}

 ✓ services/DirectiveService/DirectiveService.test.ts (9 tests) 114ms
stdout | services/DirectiveService/handlers/execution/RunDirectiveHandler.transformation.test.ts > RunDirectiveHandler Transformation > transformation behavior > should preserve error handling during transformation
2025-02-23 15:33:03 [error] [directive] Error executing run directive: Command failed
{
  "stack": "Error: Command failed\n    at /Users/adam/dev/meld/services/DirectiveService/handlers/execution/RunDirectiveHandler.transformation.test.ts:150:69\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11\n    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)\n    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)\n    at processTicksAndRejections (node:internal/process/task_queues:105:5)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)"
}

 ✓ services/DirectiveService/handlers/execution/RunDirectiveHandler.transformation.test.ts (5 tests) 7ms
 ✓ services/StateHistoryService/StateHistoryService.test.ts (9 tests) 8ms
stdout | services/StateService/migration.test.ts > State Migration > error handling > should handle migration errors gracefully
2025-02-23 15:33:03 [error] [state] State migration failed
{
  "error": {}
}

 ✓ services/StateService/migration.test.ts (8 tests) 6ms
 ✓ services/PathService/PathService.tmp.test.ts (14 tests | 8 skipped) 13ms
 ✓ services/ResolutionService/resolvers/CommandResolver.test.ts (11 tests | 2 skipped) 24ms
 ✓ services/ResolutionService/resolvers/ContentResolver.test.ts (6 tests) 7ms
stdout | services/FileSystemService/FileSystemService.test.ts > FileSystemService > File operations > throws MeldError when reading non-existent file
2025-02-23 15:33:03 [error] [filesystem] File not found
{
  "filePath": "project/nonexistent.txt",
  "memfsPath": "project/project/nonexistent.txt"
}
2025-02-23 15:33:03 [error] [filesystem] File not found
{
  "operation": "readFile",
  "path": "project/nonexistent.txt",
  "error": {}
}

stdout | services/FileSystemService/FileSystemService.test.ts > FileSystemService > Directory operations > throws MeldError when reading non-existent directory
2025-02-23 15:33:03 [error] [filesystem] Directory not found
{
  "dirPath": "project/nonexistent",
  "memfsPath": "project/project/nonexistent"
}
2025-02-23 15:33:03 [error] [filesystem] Failed to read directory
{
  "operation": "readDir",
  "path": "project/nonexistent",
  "error": {}
}

 ✓ services/FileSystemService/FileSystemService.test.ts (17 tests) 97ms
 ✓ services/PathService/PathService.test.ts (12 tests) 25ms
stdout | services/DirectiveService/handlers/definition/PathDirectiveHandler.test.ts > PathDirectiveHandler > error handling > should handle validation errors
2025-02-23 15:33:03 [error] [directive] Failed to process path directive
{
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {
    "name": "DirectiveError",
    "message": "Directive error (path): Invalid path",
    "kind": "path"
  }
}

stdout | services/DirectiveService/handlers/definition/PathDirectiveHandler.test.ts > PathDirectiveHandler > error handling > should handle resolution errors
2025-02-23 15:33:03 [error] [directive] Failed to process path directive
{
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {}
}

stdout | services/DirectiveService/handlers/definition/PathDirectiveHandler.test.ts > PathDirectiveHandler > error handling > should handle state errors
2025-02-23 15:33:03 [error] [directive] Failed to process path directive
{
  "location": {
    "start": {
      "line": 1,
      "column": 1
    },
    "end": {
      "line": 1,
      "column": 1
    }
  },
  "error": {}
}

 ✓ services/DirectiveService/handlers/definition/PathDirectiveHandler.test.ts (6 tests) 7ms
 ✓ services/DirectiveService/handlers/definition/TextDirectiveHandler.integration.test.ts (8 tests | 4 skipped) 4ms
 ✓ services/ResolutionService/resolvers/TextResolver.test.ts (11 tests | 2 skipped) 5ms
 ✓ services/ResolutionService/resolvers/StringLiteralHandler.test.ts (18 tests) 7ms
 ✓ services/ResolutionService/resolvers/DataResolver.test.ts (13 tests | 5 skipped) 7ms
 ✓ services/ResolutionService/resolvers/StringConcatenationHandler.test.ts (11 tests) 5ms
 ✓ services/ResolutionService/resolvers/VariableReferenceResolver.test.ts (12 tests) 14ms
stdout | services/StateEventService/StateEventService.test.ts > StateEventService > should continue processing handlers after error
2025-02-23 15:33:03 [error] [state] Error in error event handler
{
  "error": "test error",
  "stateId": "test-state"
}

 ✓ services/StateEventService/StateEventService.test.ts (8 tests) 25ms
 ✓ services/StateService/StateService.transformation.test.ts (8 tests) 5ms
 ✓ services/FileSystemService/PathOperationsService.test.ts (8 tests) 3ms
stdout | services/CircularityService/CircularityService.test.ts > CircularityService > Circular import detection > should detect direct circular imports
2025-02-23 15:33:03 [error] [import] Circular import detected
{
  "filePath": "fileA.meld",
  "importChain": [
    "fileA.meld",
    "fileA.meld"
  ]
}

stdout | services/CircularityService/CircularityService.test.ts > CircularityService > Circular import detection > should detect indirect circular imports
2025-02-23 15:33:03 [error] [import] Circular import detected
{
  "filePath": "fileA.meld",
  "importChain": [
    "fileA.meld",
    "fileB.meld",
    "fileA.meld"
  ]
}

stdout | services/CircularityService/CircularityService.test.ts > CircularityService > Circular import detection > should include import chain in error
2025-02-23 15:33:03 [error] [import] Circular import detected
{
  "filePath": "fileA.meld",
  "importChain": [
    "fileA.meld",
    "fileB.meld",
    "fileA.meld"
  ]
}

stdout | services/CircularityService/CircularityService.test.ts > CircularityService > Stack management > should handle ending import for file not in stack
2025-02-23 15:33:03 [warn] [import] Attempted to end import for file not in stack
{
  "filePath": "nonexistent.meld",
  "currentStack": []
}

 ✓ services/CircularityService/CircularityService.test.ts (10 tests) 5ms
 ✓ services/ValidationService/validators/FuzzyMatchingValidator.test.ts (6 tests | 4 skipped) 2ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  services/StateEventService/StateInstrumentation.test.ts > State Instrumentation > Event Filtering > should support complex filtering patterns
AssertionError: expected [ 'transform:test-1', …(3) ] to deeply equal [ 'transform:test-1', …(2) ]

- Expected
+ Received

  Array [
    "transform:test-1",
    "source:variable-update",
    "file:test.meld",
+   "source:variable-update",
  ]

 ❯ services/StateEventService/StateInstrumentation.test.ts:95:23
     93|       });
     94|
     95|       expect(results).toEqual([
       |                       ^
     96|         'transform:test-1',
     97|         'source:variable-update',

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed | 42 passed (43)
      Tests  1 failed | 537 passed | 8 skipped | 27 todo (573)
   Start at  15:33:01
   Duration  2.00s (transform 642ms, setup 7.63s, collect 731ms, tests 1.81s, environment 4ms, prepare 2.20s)

\======= END TEST RESULTS

\======= YOUR TASK

From this information, are you able to confidently identify the improvements needed in order to solve issue and pass its failing test?

If so, grade your confidence on a 100 point scale, provide your analysis, cite evidence in detail, and provide your recommended solution, including the atomic changes to code required.

If your confidence is below 80%, design a strategy for gathinger additional information that would enable you to increase your confidence in an analysis of identifying the root cause and providing a solution.
