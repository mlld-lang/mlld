You are an expert at identifying root causes of failing tests.

You've previously provided advice on fixing these tests and each suggestion had valuable insights but none was complete on its own. (The `test-answer-1` (etc) answers referred to in the document below are yours.)

Here's our current analysis of the test failures based on what our devs have uncovered so far.

We're not confident in this analysis and would appreciate your review of the code, noting that we have failed previously.

Rather than just guessing at the solution,focus on designing a strategic approach to root out the core of these test failures.

\=== ANALYSIS ===

# Test Failure Analysis

## Current Test Failures

We currently have 7 failing tests across two main areas:

### 1. API Integration Tests (4 failures)

All failing with the same error: "currentState.clone is not a function"

- `api/api.test.ts > SDK Integration Tests > Format Conversion > should handle execution directives correctly`
- `api/api.test.ts > SDK Integration Tests > Format Conversion > should handle complex meld content with mixed directives`
- `api/api.test.ts > SDK Integration Tests > Full Pipeline Integration > should handle the complete parse -> interpret -> convert pipeline`
- `api/api.test.ts > SDK Integration Tests > Full Pipeline Integration > should preserve state and content in transformation mode`

### 2. OutputService Tests (3 failures)

All failing with transformation-related issues:

- `services/OutputService/OutputService.test.ts > OutputService > Transformation Mode > should use transformed nodes when transformation is enabled`
- `services/OutputService/OutputService.test.ts > OutputService > Transformation Mode > should handle mixed content in transformation mode`
- `services/OutputService/OutputService.test.ts > OutputService > Transformation Mode > should handle LLM output in both modes`

## Root Causes Analysis

### 1. State Service Clone Implementation

The `StateService` class has a `clone()` method implementation, but it's not being recognized in some contexts. Looking at the code:

```typescript
clone(): IStateService {
  const cloned = new StateService();

  // Create a completely new state without parent reference
  cloned.currentState = this.stateFactory.createState({
    source: 'clone',
    filePath: this.currentState.filePath
  });

  // Copy all state
  cloned.updateState({
    variables: {
      text: new Map(this.currentState.variables.text),
      data: new Map(this.currentState.variables.data),
      path: new Map(this.currentState.variables.path)
    },
    commands: new Map(this.currentState.commands),
    nodes: [...this.currentState.nodes],
    transformedNodes: this.currentState.transformedNodes ? [...this.currentState.transformedNodes] : undefined,
    imports: new Set(this.currentState.imports)
  }, 'clone');

  // Copy flags
  cloned._isImmutable = this._isImmutable;
  cloned._transformationEnabled = this._transformationEnabled;

  return cloned;
}
```

The implementation looks correct, but the error suggests that either:
1. The mock state service in the tests isn't properly implementing the clone method
2. The real state service isn't being used where expected
3. Type casting issues are preventing the clone method from being recognized

### 2. OutputService Transformation Handling

The `OutputService` has several issues with transformation handling:

1. **Node Processing Logic**: The service tries to use transformed nodes when available:
```typescript
const nodesToProcess = state.isTransformationEnabled?.() && state.getTransformedNodes?.()
  ? state.getTransformedNodes()
  : nodes;
```

2. **Directive Node Handling**: The service has special handling for directive nodes in transformation mode:
```typescript
case 'Directive':
  // If we're processing transformed nodes, we shouldn't see any directives
  // They should have been transformed into Text or CodeFence nodes
  if (isTransformed) {
    throw new MeldOutputError('Unexpected directive in transformed nodes', 'markdown');
  }
```

3. **Test Expectations**: The tests expect:
   - Original command: `echo test`
   - Transformed output: `test output`
   But they're getting the original command instead of the transformed output.

### 3. RunDirectiveHandler Transformation

The `RunDirectiveHandler` is responsible for transforming run directives into text nodes:

```typescript
if (clonedState.isTransformationEnabled()) {
  const content = stdout && stderr ? `${stdout}\n${stderr}` : stdout || stderr;
  const replacementNode: MeldNode = {
    type: 'text',
    content,
    location: node.location
  };
  return { state: clonedState, replacementNode };
}
```

The issue might be that:
1. The transformation isn't being applied correctly
2. The transformed nodes aren't being stored in the state
3. The OutputService isn't using the transformed nodes even when available

## Mock Implementation Analysis

The mock state service in `OutputService.test.ts` has its own implementation of transformation-related methods:

```typescript
isTransformationEnabled(): boolean {
  return this.transformationEnabled;
}

enableTransformation(enable: boolean): void {
  this.transformationEnabled = enable;
}

getTransformedNodes(): MeldNode[] {
  return [...this.transformedNodes];
}

setTransformedNodes(nodes: MeldNode[]): void {
  this.transformedNodes = [...nodes];
}
```

This implementation looks correct, but there might be issues with:
1. How the transformed nodes are being stored
2. When and how the transformation state is being updated
3. Whether the mock is properly simulating the real service's behavior

## Analysis of Proposed Solutions

### Solution 1 (test-answer-2.md)

#### What it Got Right:
1. Correctly identified that `clone()` was missing from the `IStateService` interface
2. Recognized that the issue was systemic across all four failing tests
3. Accurately noted that the interpreter and integration tests rely on `clone()` for state management
4. Correctly suggested that all state fields need to be copied in the clone implementation

#### What it Missed:
1. Oversimplified the state structure by suggesting a basic node array implementation
2. Did not address the transformation mode issues in the OutputService tests
3. Did not recognize the potential issues with the mock implementations

### Solution 2 (test-answer-3.md)

#### What it Got Right:
1. Identified three distinct but related issues
2. Correctly noted that `setTransformedNodes` was missing
3. Accurately identified issues with node transformation behavior
4. Provided a more complete implementation including transformation state

#### What it Missed:
1. The `StateService` already had a more sophisticated implementation with `stateFactory`
2. Did not address the optional chaining issues in the OutputService
3. Overlooked the potential type casting issues in the API tests

### Solution 3 (test-answer-4.md)

#### What it Got Right:
1. Correctly identified that the RunDirectiveHandler was returning the wrong content
2. Recognized the issue with OutputService not properly using transformed nodes
3. Noted the importance of transformation mode being properly enabled
4. Identified the need to check both the command execution and its output handling

#### What it Missed:
1. Suggested adding `useNewTransformation` which doesn't exist in the current implementation
2. Did not recognize that the `OutputService` already has transformation handling
3. Overlooked the existing `stateFactory` pattern in the `StateService`

### Solution 5 (test-answer-5.md)

#### What it Got Right:
1. Most precise and minimal solution of all attempts
2. Correctly identified that the fixes should align with existing architecture
3. Recognized the optional chaining issue in OutputService's transformation check
4. Provided exact code changes with proper context
5. Understood that the RunDirectiveHandler needs to use actual command output
6. Correctly noted that the transformation mode check should use `isTransformationEnabled()`

#### Key Improvements Over Previous Solutions:
1. No unnecessary architectural changes or new flags
2. Works within existing patterns rather than suggesting alternatives
3. Addresses the optional chaining issue that others missed
4. Provides more specific guidance about command output handling
5. Better understanding of the existing transformation mode infrastructure

### Updated Synthesis

Solution 5 helps us refine our previous synthesis. The most effective fix should:

1. Make minimal interface changes:
   - Add only `clone()` to `IStateService`
   - No additional transformation-related methods needed

2. Fix the RunDirectiveHandler:
   - Use actual command output instead of raw command
   - Ensure proper stdout/stderr handling
   - Keep existing transformation mode checks

3. Improve OutputService:
   - Replace optional chaining with direct `isTransformationEnabled()` check
   - Keep existing transformation handling logic
   - No need for new transformation flags

4. Update mock implementations:
   - Ensure they implement `clone()`
   - Match real service behavior for command execution
   - Properly handle transformation state

This refined approach is more surgical and better aligned with the existing codebase than our previous synthesis.

## Revised Next Steps

Based on this analysis, our next steps should be:

1. **Interface Completion**:
   - Add `clone()` to `IStateService`
   - Ensure all necessary transformation methods are declared

2. **StateService Implementation**:
   - Implement `clone()` using the existing `stateFactory` pattern
   - Verify all state fields are properly copied

3. **Mock Service Alignment**:
   - Update mock implementations to match the real service behavior
   - Add proper transformation state handling to mocks

4. **Transformation Flow**:
   - Fix RunDirectiveHandler output handling
   - Ensure OutputService correctly uses transformed nodes
   - Verify transformation mode is properly enabled and detected

5. **Test Infrastructure**:
   - Add tests specifically for state cloning
   - Verify transformation behavior in isolation
   - Add integration tests for the complete pipeline

## Additional Observations

1. The error "currentState.clone is not a function" suggests a fundamental issue with how the state service is being used or mocked in the API tests.

2. The transformation tests failing in OutputService suggest that while the basic transformation infrastructure is in place, there are issues with how transformed content is being handled and passed through the system.

3. The mock services might be oversimplified, not fully replicating the behavior of the real services, especially regarding state management and transformation.

4. The transformation feature seems to work in isolation (as evidenced by some passing tests) but fails in more complex scenarios, suggesting integration issues rather than fundamental implementation problems.

## What We've Learned From Failed Attempts

### 1. Path Service Initialization Issue
Our attempt to fix the issue by initializing the path service in the `main` function did not resolve the core problems. This revealed that:
- Simply initializing services in the correct order is not sufficient
- The issue likely lies deeper in how state is being managed across service boundaries
- Path service initialization, while necessary, is not the root cause of our test failures

### 2. State Management Complexity
Our investigation revealed several layers of state management issues:
- The `clone()` method exists in the real `StateService` but is missing from mocks and interfaces
- State transformation is handled inconsistently across different parts of the system
- The relationship between state cloning and transformation is more complex than initially assumed
- Mock implementations in tests may not be fully replicating the real service behavior

### 3. Service Initialization Order Dependencies
We've discovered that:
- The order of service initialization matters more than previously thought
- Services have implicit dependencies that aren't clearly documented
- The test context setup may not be fully replicating the production initialization sequence
- Some services require explicit initialization while others initialize implicitly

### 4. Test Context Limitations
Our attempts highlighted several issues with the test context:
- The test context may not be properly preserving state between operations
- Mock implementations might be oversimplified
- The test context's service initialization may not match production exactly
- Some service interactions that work in production may be breaking in tests

### 5. Transformation Mode Inconsistencies
We found that:
- Transformation mode is not consistently respected across all services
- The OutputService's transformation handling is more complex than initially understood
- There are edge cases in transformation that our tests aren't properly covering
- The interaction between transformation mode and state cloning needs more attention

### 6. Failed Approaches
The following approaches did not work:
1. Simply adding `clone()` to the interface without addressing the underlying state management
2. Initializing services in a different order
3. Modifying the OutputService transformation logic without addressing state management
4. Trying to fix the RunDirectiveHandler without addressing the state cloning issue
5. Adding path service initialization in isolation

### 7. Next Steps Based on Failed Attempts
Our failed attempts suggest we should:
1. Start with a complete audit of the `IStateService` interface and its implementations
2. Verify that all mock implementations properly support state cloning
3. Review the transformation mode implementation across all services
4. Ensure test context initialization matches production service initialization
5. Add more comprehensive tests for state cloning and transformation interactions

### 8. Key Insights
1. The issues are more interconnected than they initially appeared
2. Fixing individual services in isolation is not effective
3. We need a more holistic approach to state management
4. Test infrastructure may need improvements to better match production behavior
5. Service initialization and dependencies need better documentation and possibly refactoring

These learnings suggest we need to take a step back and address the fundamental state management and service initialization issues before trying to fix individual test failures.

\=== END ANALYSIS ===

Here's our test status:

\=== TEST STATUS ===

> meld@10.0.0 test
> vitest run

 RUN  v2.1.9 /Users/adam/dev/meld

 ✓ services/DirectiveService/handlers/definition/DefineDirectiveHandler.test.ts (16 tests) 11ms
 ✓ services/DirectiveService/handlers/execution/EmbedDirectiveHandler.test.ts (8 tests) 10ms
stdout | services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts > RunDirectiveHandler > error handling > should handle validation errors
2025-02-21 09:04:31 [error] [directive] Error executing run directive: Directive error (run): Invalid command
{
  "kind": "run",
  "code": "VALIDATION_FAILED",
  "name": "DirectiveError",
  "stack": "DirectiveError: Directive error (run): Invalid command\n    at /Users/adam/dev/meld/services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts:183:9\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11\n    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)\n    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)\n    at processTicksAndRejections (node:internal/process/task_queues:105:5)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)"
}

stdout | services/InterpreterService/InterpreterService.unit.test.ts > InterpreterService Unit > node interpretation > throws on unknown node types
2025-02-21 09:04:31 [error] [interpreter] Interpretation failed
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
2025-02-21 09:04:31 [error] [interpreter] Interpretation failed
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
2025-02-21 09:04:31 [error] [interpreter] Interpretation failed
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
2025-02-21 09:04:31 [error] [interpreter] Interpretation failed
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

stdout | services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts > RunDirectiveHandler > error handling > should handle resolution errors
2025-02-21 09:04:31 [error] [directive] Error executing run directive: Variable not found
{
  "stack": "Error: Variable not found\n    at /Users/adam/dev/meld/services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts:199:9\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11\n    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)\n    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)\n    at processTicksAndRejections (node:internal/process/task_queues:105:5)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)"
}

stdout | services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts > RunDirectiveHandler > error handling > should handle command execution errors
2025-02-21 09:04:31 [error] [directive] Error executing run directive: Command failed
{
  "stack": "Error: Command failed\n    at /Users/adam/dev/meld/services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts:216:9\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11\n    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)\n    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)\n    at processTicksAndRejections (node:internal/process/task_queues:105:5)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)"
}

stdout | services/InterpreterService/InterpreterService.unit.test.ts > InterpreterService Unit > child context creation > handles errors in child context creation
2025-02-21 09:04:31 [error] [interpreter] Failed to create child context
{
  "error": {}
}

stdout | services/InterpreterService/InterpreterService.unit.test.ts > InterpreterService Unit > edge cases > handles state initialization failures
2025-02-21 09:04:31 [error] [interpreter] Interpretation failed
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
2025-02-21 09:04:31 [error] [interpreter] Interpretation failed
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

 ✓ services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts (10 tests) 14ms
 ✓ services/InterpreterService/InterpreterService.unit.test.ts (22 tests) 31ms
 ↓ cli/cli.test.ts (33 tests | 33 skipped)
stdout | cli/cli.test.ts
2025-02-21 09:04:31 [error] [cli] CLI execution failed
{
  "error": "Paths with slashes must start with $. or $~ - use $. for project-relative paths and $~ for home-relative paths"
}

stdout | services/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts > ImportDirectiveHandler > special path variables > should throw error if resolved path does not exist
2025-02-21 09:04:31 [error] [directive] Failed to process import directive
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
2025-02-21 09:04:31 [error] [directive] Failed to process import directive
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
2025-02-21 09:04:31 [error] [directive] Failed to process import directive
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

stdout | services/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts > ImportDirectiveHandler > error handling > should handle circular imports
2025-02-21 09:04:31 [error] [directive] Failed to process import directive
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
2025-02-21 09:04:31 [error] [directive] Failed to process import directive
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
2025-02-21 09:04:31 [error] [directive] Failed to process import directive
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
2025-02-21 09:04:31 [error] [directive] Failed to process import directive
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

 ✓ services/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts (15 tests | 2 skipped) 21ms
stdout | services/CLIService/CLIService.test.ts > CLIService > Format Conversion > should output llm format by default
test output
2025-02-21 09:04:31 [info] [cli] Successfully wrote output to stdout

stdout | services/CLIService/CLIService.test.ts > CLIService > Format Conversion > should handle format aliases correctly
test output
2025-02-21 09:04:31 [info] [cli] Successfully wrote output to stdout

stdout | services/CLIService/CLIService.test.ts > CLIService > Format Conversion > should preserve markdown with markdown format
test output
2025-02-21 09:04:31 [info] [cli] Successfully wrote output to stdout

stdout | services/CLIService/CLIService.test.ts > CLIService > Command Line Options > should display version when --version flag is used
meld version 10.0.0

stdout | services/CLIService/CLIService.test.ts > CLIService > Command Line Options > should respect --stdout option
test output
2025-02-21 09:04:31 [info] [cli] Successfully wrote output to stdout

stdout | services/CLIService/CLIService.test.ts > CLIService > Command Line Options > should use default output path when not specified
2025-02-21 09:04:31 [info] [cli] Successfully wrote output file
{
  "path": "test.xml"
}

stdout | services/CLIService/CLIService.test.ts > CLIService > Command Line Options > should handle project path option
2025-02-21 09:04:31 [info] [cli] Successfully wrote output file
{
  "path": "/project/test.xml"
}

stdout | services/CLIService/CLIService.test.ts > CLIService > Command Line Options > should handle home path option
2025-02-21 09:04:31 [info] [cli] Successfully wrote output file
{
  "path": "test.xml"
}

stdout | services/CLIService/CLIService.test.ts > CLIService > Command Line Options > should handle verbose option
2025-02-21 09:04:31 [info] [cli] Verbose mode enabled
2025-02-21 09:04:31 [info] [cli] Successfully wrote output file
{
  "path": "test.xml"
}

stdout | services/CLIService/CLIService.test.ts > CLIService > Command Line Options > should handle watch option
2025-02-21 09:04:31 [info] [cli] Starting watch mode
{
  "input": "test.meld"
}
2025-02-21 09:04:31 [info] [cli] Watching for changes
{
  "directory": "."
}

stdout | services/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > State management > handles state rollback on merge errors
2025-02-21 09:04:31 [error] [interpreter] Interpretation failed
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

stdout | services/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > Error handling > handles circular imports
2025-02-21 09:04:31 [warn] [import] Attempted to end import for file not in stack
{
  "filePath": "project/src/circular1.meld",
  "currentStack": []
}
2025-02-21 09:04:31 [error] [directive] Failed to process import directive
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
2025-02-21 09:04:31 [error] [interpreter] Interpretation failed
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

stdout | services/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > Error handling > provides location information in errors
2025-02-21 09:04:31 [error] [interpreter] Interpretation failed
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
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"warningLevel":"all"},"timestamp":"2025-02-21T17:04:31.792Z"}

stdout | services/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > Error handling > maintains state consistency after errors
2025-02-21 09:04:31 [error] [interpreter] Interpretation failed
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

stdout | services/CLIService/CLIService.test.ts > CLIService > Command Line Options > should handle watch option
2025-02-21 09:04:31 [info] [cli] Change detected
{
  "file": "test.meld"
}
2025-02-21 09:04:31 [info] [cli] Successfully wrote output file
{
  "path": "test.xml"
}

stdout | services/OutputService/OutputService.test.ts > OutputService > LLM XML Output > should preserve code fence content
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"warningLevel":"all"},"timestamp":"2025-02-21T17:04:31.801Z"}

stdout | services/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > Error handling > includes state context in interpreter errors
2025-02-21 09:04:31 [error] [interpreter] Interpretation failed
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

stdout | services/OutputService/OutputService.test.ts > OutputService > LLM XML Output > should handle directives according to type
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"warningLevel":"all"},"timestamp":"2025-02-21T17:04:31.809Z"}

stdout | services/OutputService/OutputService.test.ts > OutputService > LLM XML Output > should handle directives according to type
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"warningLevel":"all"},"timestamp":"2025-02-21T17:04:31.810Z"}

stdout | services/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > Error handling > rolls back state on directive errors
2025-02-21 09:04:31 [error] [interpreter] Interpretation failed
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
2025-02-21 09:04:31 [warn] [import] Attempted to end import for file not in stack
{
  "filePath": "project/src/circular1.meld",
  "currentStack": []
}
2025-02-21 09:04:31 [error] [directive] Failed to process import directive
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
2025-02-21 09:04:31 [error] [interpreter] Interpretation failed
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

stdout | services/OutputService/OutputService.test.ts > OutputService > LLM XML Output > should preserve state variables when requested
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"warningLevel":"all"},"timestamp":"2025-02-21T17:04:31.811Z"}

stdout | services/OutputService/OutputService.test.ts > OutputService > Transformation Mode > should handle LLM output in both modes
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"warningLevel":"all"},"timestamp":"2025-02-21T17:04:31.824Z"}

stdout | services/OutputService/OutputService.test.ts > OutputService > Transformation Mode > should handle LLM output in both modes
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"warningLevel":"all"},"timestamp":"2025-02-21T17:04:31.826Z"}

stdout | services/OutputService/OutputService.test.ts > OutputService > Error Handling > should throw MeldOutputError for unknown node types
2025-02-21 09:04:31 [error] [output] Failed to convert output
{
  "format": "markdown",
  "error": {
    "format": "markdown",
    "cause": {
      "format": "markdown",
      "cause": {
        "format": "markdown",
        "name": "MeldOutputError"
      },
      "name": "MeldOutputError"
    },
    "name": "MeldOutputError"
  }
}

stdout | services/OutputService/OutputService.test.ts > OutputService > Error Handling > should wrap errors from format converters
2025-02-21 09:04:31 [error] [output] Failed to convert output
{
  "format": "error",
  "error": {}
}

stdout | services/OutputService/OutputService.test.ts > OutputService > Error Handling > should preserve MeldOutputError when thrown from converters
2025-02-21 09:04:31 [error] [output] Failed to convert output
{
  "format": "error",
  "error": {
    "format": "error",
    "name": "MeldOutputError"
  }
}

 ❯ services/OutputService/OutputService.test.ts (22 tests | 3 failed) 186ms
   × OutputService > Transformation Mode > should use transformed nodes when transformation is enabled 6ms
     → expected 'echo test\n' to be 'test output\n' // Object.is equality
   × OutputService > Transformation Mode > should handle mixed content in transformation mode 1ms
     → expected 'Before\necho test\nAfter\n' to be 'Before\ntest output\nAfter\n' // Object.is equality
   × OutputService > Transformation Mode > should handle LLM output in both modes 10ms
     → expected 'Before\necho test\nAfter' to contain 'test output'
 ✓ services/InterpreterService/InterpreterService.integration.test.ts (24 tests | 4 skipped) 207ms
 ✓ services/DirectiveService/handlers/execution/EmbedDirectiveHandler.transformation.test.ts (7 tests) 7ms
stdout | services/ValidationService/ValidationService.test.ts > ValidationService > Text directive validation > should throw on missing name
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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

 ✓ services/DirectiveService/handlers/definition/DataDirectiveHandler.test.ts (9 tests) 23ms
stdout | services/ValidationService/ValidationService.test.ts > ValidationService > Path directive validation > should throw on invalid identifier format
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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
2025-02-21 09:04:31 [error] [validation] Directive validation failed
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

 ✓ services/ValidationService/ValidationService.test.ts (30 tests) 23ms
 ✓ services/DirectiveService/handlers/definition/TextDirectiveHandler.test.ts (15 tests) 15ms
 ✓ services/ParserService/ParserService.test.ts (17 tests) 54ms
stdout | services/ResolutionService/ResolutionService.test.ts > ResolutionService > extractSection > should extract section by heading
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"warningLevel":"none"},"timestamp":"2025-02-21T17:04:32.102Z"}

stdout | services/ResolutionService/ResolutionService.test.ts > ResolutionService > extractSection > should include content until next heading of same or higher level
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"warningLevel":"none"},"timestamp":"2025-02-21T17:04:32.110Z"}

stdout | services/ResolutionService/ResolutionService.test.ts > ResolutionService > extractSection > should throw when section is not found
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"warningLevel":"none"},"timestamp":"2025-02-21T17:04:32.113Z"}

 ✓ services/ResolutionService/ResolutionService.test.ts (18 tests) 140ms
 ✓ services/StateService/StateFactory.test.ts (10 tests) 10ms
stdout | services/DirectiveService/handlers/execution/ImportDirectiveHandler.transformation.test.ts > ImportDirectiveHandler Transformation > transformation behavior > should preserve error handling in transformation mode
2025-02-21 09:04:32 [error] [directive] Failed to process import directive
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

 ✓ services/DirectiveService/handlers/execution/ImportDirectiveHandler.transformation.test.ts (4 tests) 9ms
 ✓ services/ResolutionService/resolvers/PathResolver.test.ts (15 tests | 1 skipped) 7ms
 ✓ services/StateService/StateService.test.ts (26 tests) 8ms
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

stdout | services/CLIService/CLIService.test.ts > CLIService > File Overwrite Handling > should prompt for overwrite when file exists
2025-02-21 09:04:32 [info] [cli] Successfully wrote output file
{
  "path": "test.xml"
}

 ✓ services/CLIService/CLIService.test.ts (20 tests | 3 skipped) 651ms
   ✓ CLIService > Command Line Options > should handle watch option 603ms
stdout | tests/utils/tests/TestSnapshot.test.ts > TestSnapshot > directory-specific snapshots > returns empty snapshot for non-existent directory
2025-02-21 09:04:32 [error] [filesystem] Directory not found
{
  "dirPath": "/project/nonexistent",
  "memfsPath": "project/nonexistent"
}

 ✓ tests/utils/tests/TestSnapshot.test.ts (13 tests) 44ms
stdout | services/DirectiveService/handlers/execution/RunDirectiveHandler.transformation.test.ts > RunDirectiveHandler Transformation > transformation behavior > should preserve error handling during transformation
2025-02-21 09:04:32 [error] [directive] Error executing run directive: Command failed
{
  "stack": "Error: Command failed\n    at /Users/adam/dev/meld/services/DirectiveService/handlers/execution/RunDirectiveHandler.transformation.test.ts:150:69\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11\n    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)\n    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)\n    at processTicksAndRejections (node:internal/process/task_queues:105:5)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)"
}

 ✓ services/DirectiveService/handlers/execution/RunDirectiveHandler.transformation.test.ts (5 tests) 8ms
stdout | services/DirectiveService/DirectiveService.test.ts > DirectiveService > Directive processing > Import directives > should detect circular imports
2025-02-21 09:04:32 [error] [validation] Directive validation failed
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
2025-02-21 09:04:32 [error] [directive] Failed to validate directive
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
2025-02-21 09:04:32 [error] [interpreter] Interpretation failed
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
2025-02-21 09:04:32 [warn] [import] Attempted to end import for file not in stack
{
  "filePath": "b.meld",
  "currentStack": []
}
2025-02-21 09:04:32 [error] [directive] Failed to process import directive
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

 ❯ services/DirectiveService/DirectiveService.test.ts (9 tests | 2 failed) 130ms
   × DirectiveService > Directive processing > Import directives > should process basic import 33ms
     → result.getTextVar is not a function
   × DirectiveService > Directive processing > Import directives > should handle nested imports 10ms
     → result.getTextVar is not a function
stdout | services/FileSystemService/FileSystemService.test.ts > FileSystemService > File operations > throws MeldError when reading non-existent file
2025-02-21 09:04:32 [error] [filesystem] File not found
{
  "filePath": "project/nonexistent.txt",
  "memfsPath": "project/project/nonexistent.txt"
}
2025-02-21 09:04:32 [error] [filesystem] File not found
{
  "operation": "readFile",
  "path": "project/nonexistent.txt",
  "error": {}
}

stdout | services/StateService/migration.test.ts > State Migration > error handling > should handle migration errors gracefully
2025-02-21 09:04:32 [error] [state] State migration failed
{
  "error": {}
}

 ✓ services/StateService/migration.test.ts (8 tests) 7ms
stdout | services/FileSystemService/FileSystemService.test.ts > FileSystemService > Directory operations > throws MeldError when reading non-existent directory
2025-02-21 09:04:32 [error] [filesystem] Directory not found
{
  "dirPath": "project/nonexistent",
  "memfsPath": "project/project/nonexistent"
}
2025-02-21 09:04:32 [error] [filesystem] Failed to read directory
{
  "operation": "readDir",
  "path": "project/nonexistent",
  "error": {}
}

 ✓ services/ResolutionService/resolvers/ContentResolver.test.ts (6 tests) 6ms
 ✓ services/FileSystemService/FileSystemService.test.ts (17 tests) 126ms
 ✓ services/PathService/PathService.tmp.test.ts (14 tests | 8 skipped) 25ms
 ✓ services/PathService/PathService.test.ts (12 tests) 19ms
stdout | services/DirectiveService/handlers/definition/PathDirectiveHandler.test.ts > PathDirectiveHandler > error handling > should handle validation errors
2025-02-21 09:04:32 [error] [directive] Failed to process path directive
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
2025-02-21 09:04:32 [error] [directive] Failed to process path directive
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
2025-02-21 09:04:32 [error] [directive] Failed to process path directive
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
 ✓ services/ResolutionService/resolvers/CommandResolver.test.ts (11 tests | 2 skipped) 23ms
stdout | api/api.test.ts > SDK Integration Tests > Format Conversion > should handle definition directives correctly
2025-02-21 09:04:32 [error] [output] Failed to convert output
{
  "format": "llm",
  "error": {
    "format": "llm",
    "cause": {
      "format": "markdown",
      "cause": {
        "format": "markdown",
        "cause": {
          "format": "markdown",
          "name": "MeldOutputError"
        },
        "name": "MeldOutputError"
      },
      "name": "MeldOutputError"
    },
    "name": "MeldOutputError"
  }
}

stdout | api/api.test.ts > SDK Integration Tests > Format Conversion > should handle execution directives correctly
2025-02-21 09:04:32 [error] [interpreter] Interpretation failed
{
  "nodeCount": 1,
  "filePath": "test.meld",
  "error": {
    "name": "MeldInterpreterError",
    "message": "currentState.clone is not a function at line 1, column 2",
    "nodeType": "Directive",
    "location": {
      "line": 1,
      "column": 2
    },
    "cause": "currentState.clone is not a function",
    "fullCauseMessage": "currentState.clone is not a function",
    "context": {
      "nodeType": "Directive"
    }
  }
}

stdout | api/api.test.ts > SDK Integration Tests > Format Conversion > should handle complex meld content with mixed directives
2025-02-21 09:04:32 [error] [interpreter] Interpretation failed
{
  "nodeCount": 7,
  "filePath": "test.meld",
  "error": {
    "name": "MeldInterpreterError",
    "message": "currentState.clone is not a function at line 5, column 10",
    "nodeType": "Directive",
    "location": {
      "line": 5,
      "column": 10
    },
    "cause": "currentState.clone is not a function",
    "fullCauseMessage": "currentState.clone is not a function",
    "context": {
      "nodeType": "Directive"
    }
  }
}

stdout | api/api.test.ts > SDK Integration Tests > Full Pipeline Integration > should handle the complete parse -> interpret -> convert pipeline
2025-02-21 09:04:32 [error] [interpreter] Interpretation failed
{
  "nodeCount": 5,
  "filePath": "test.meld",
  "error": {
    "name": "MeldInterpreterError",
    "message": "currentState.clone is not a function at line 3, column 10",
    "nodeType": "Directive",
    "location": {
      "line": 3,
      "column": 10
    },
    "cause": "currentState.clone is not a function",
    "fullCauseMessage": "currentState.clone is not a function",
    "context": {
      "nodeType": "Directive"
    }
  }
}

stdout | api/api.test.ts > SDK Integration Tests > Full Pipeline Integration > should preserve state and content in transformation mode
2025-02-21 09:04:32 [error] [interpreter] Interpretation failed
{
  "nodeCount": 7,
  "filePath": "test.meld",
  "error": {
    "name": "MeldInterpreterError",
    "message": "currentState.clone is not a function at line 4, column 10",
    "nodeType": "Directive",
    "location": {
      "line": 4,
      "column": 10
    },
    "cause": "currentState.clone is not a function",
    "fullCauseMessage": "currentState.clone is not a function",
    "context": {
      "nodeType": "Directive"
    }
  }
}

 ✓ tests/utils/tests/ProjectBuilder.test.ts (10 tests) 36ms
 ✓ services/DirectiveService/handlers/definition/TextDirectiveHandler.integration.test.ts (8 tests | 4 skipped) 4ms
stdout | tests/utils/tests/MemfsTestFileSystem.test.ts > MemfsTestFileSystem > error handling > throws when reading non-existent file
2025-02-21 09:04:32 [error] [filesystem] File not found
{
  "filePath": "/project/nonexistent.txt",
  "memfsPath": "project/nonexistent.txt"
}

stdout | tests/utils/tests/MemfsTestFileSystem.test.ts > MemfsTestFileSystem > error handling > throws when getting stats of non-existent path
2025-02-21 09:04:32 [error] [filesystem] Error getting stats
{
  "filePath": "/project/nonexistent",
  "memfsPath": "project/nonexistent",
  "error": {
    "code": "ENOENT",
    "path": "project/nonexistent"
  }
}

 ✓ tests/utils/tests/MemfsTestFileSystem.test.ts (14 tests) 21ms
 ✓ services/ResolutionService/resolvers/TextResolver.test.ts (11 tests | 2 skipped) 5ms
stdout | api/api.test.ts > SDK Integration Tests > Error Handling > should handle empty files
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"warningLevel":"all"},"timestamp":"2025-02-21T17:04:32.879Z"}

 ❯ api/api.test.ts (10 tests | 5 failed | 3 skipped) 242ms
   × SDK Integration Tests > Format Conversion > should handle definition directives correctly 25ms
     → Output error (llm): Failed to convert to LLM XML - Output error (markdown): Failed to convert to markdown - Output error (markdown): Failed to convert node to markdown - Output error (markdown): Unexpected directive in transformed nodes
   × SDK Integration Tests > Format Conversion > should handle execution directives correctly 14ms
     → currentState.clone is not a function at line 1, column 2
   × SDK Integration Tests > Format Conversion > should handle complex meld content with mixed directives 26ms
     → currentState.clone is not a function at line 5, column 10
   × SDK Integration Tests > Full Pipeline Integration > should handle the complete parse -> interpret -> convert pipeline 18ms
     → currentState.clone is not a function at line 3, column 10
   × SDK Integration Tests > Full Pipeline Integration > should preserve state and content in transformation mode 42ms
     → currentState.clone is not a function at line 4, column 10
 ✓ services/ResolutionService/resolvers/VariableReferenceResolver.test.ts (12 tests) 23ms
 ✓ services/ResolutionService/resolvers/DataResolver.test.ts (13 tests | 5 skipped) 5ms
 ✓ tests/utils/tests/FixtureManager.test.ts (9 tests) 5ms
 ✓ services/ResolutionService/resolvers/StringConcatenationHandler.test.ts (11 tests) 5ms
 ✓ services/ResolutionService/resolvers/StringLiteralHandler.test.ts (18 tests) 5ms
 ✓ services/StateService/StateService.transformation.test.ts (8 tests) 7ms
stdout | tests/utils/tests/TestContext.test.ts > TestContext > xml conversion > converts content to xml
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"warningLevel":"all"},"timestamp":"2025-02-21T17:04:33.111Z"}

 ✓ tests/utils/tests/TestContext.test.ts (11 tests) 111ms
stdout | services/CircularityService/CircularityService.test.ts > CircularityService > Circular import detection > should detect direct circular imports
2025-02-21 09:04:33 [error] [import] Circular import detected
{
  "filePath": "fileA.meld",
  "importChain": [
    "fileA.meld",
    "fileA.meld"
  ]
}

stdout | services/CircularityService/CircularityService.test.ts > CircularityService > Circular import detection > should detect indirect circular imports
2025-02-21 09:04:33 [error] [import] Circular import detected
{
  "filePath": "fileA.meld",
  "importChain": [
    "fileA.meld",
    "fileB.meld",
    "fileA.meld"
  ]
}

stdout | services/CircularityService/CircularityService.test.ts > CircularityService > Circular import detection > should include import chain in error
2025-02-21 09:04:33 [error] [import] Circular import detected
{
  "filePath": "fileA.meld",
  "importChain": [
    "fileA.meld",
    "fileB.meld",
    "fileA.meld"
  ]
}

stdout | services/CircularityService/CircularityService.test.ts > CircularityService > Stack management > should handle ending import for file not in stack
2025-02-21 09:04:33 [warn] [import] Attempted to end import for file not in stack
{
  "filePath": "nonexistent.meld",
  "currentStack": []
}

 ✓ services/CircularityService/CircularityService.test.ts (10 tests) 5ms
stdout | tests/meld-ast-nested-fences.test.ts > meld-ast nested code fence behavior > should terminate code fence with same-length backticks
Parse result: {
  "ast": [
    {
      "type": "CodeFence",
      "content": "```\nouter\n```",
      "location": {
        "start": {
          "line": 1,
          "column": 1
        },
        "end": {
          "line": 3,
          "column": 4
        }
      }
    }
  ]
}

stdout | tests/meld-ast-nested-fences.test.ts > meld-ast nested code fence behavior > should preserve inner fences when outer fence has more backticks
Parse result: {
  "ast": [
    {
      "type": "CodeFence",
      "content": "````\nouter\n```\ninner\n```\n````",
      "location": {
        "start": {
          "line": 1,
          "column": 1
        },
        "end": {
          "line": 6,
          "column": 5
        }
      }
    }
  ]
}

stdout | tests/meld-ast-nested-fences.test.ts > meld-ast nested code fence behavior > should handle language identifiers and termination correctly
Parse result: {
  "ast": [
    {
      "type": "CodeFence",
      "language": "typescript",
      "content": "```typescript\nconst x = 1;\n```",
      "location": {
        "start": {
          "line": 1,
          "column": 1
        },
        "end": {
          "line": 3,
          "column": 4
        }
      }
    }
  ]
}

stdout | tests/meld-ast-nested-fences.test.ts > meld-ast nested code fence behavior > should handle language identifiers with nested fences
Parse result: {
  "ast": [
    {
      "type": "CodeFence",
      "language": "typescript",
      "content": "````typescript\nouter\n```js\ninner\n```\n````",
      "location": {
        "start": {
          "line": 1,
          "column": 1
        },
        "end": {
          "line": 6,
          "column": 5
        }
      }
    }
  ]
}

 ✓ tests/meld-ast-nested-fences.test.ts (4 tests) 4ms
 ✓ services/FileSystemService/PathOperationsService.test.ts (8 tests) 4ms
 ✓ services/ValidationService/validators/FuzzyMatchingValidator.test.ts (6 tests | 4 skipped) 2ms

⎯⎯⎯⎯⎯⎯ Failed Tests 10 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  api/api.test.ts > SDK Integration Tests > Format Conversion > should handle definition directives correctly
MeldOutputError: Output error (llm): Failed to convert to LLM XML - Output error (markdown): Failed to convert to markdown - Output error (markdown): Failed to convert node to markdown - Output error (markdown): Unexpected directive in transformed nodes
 ❯ OutputService.convertToLLMXML services/OutputService/OutputService.ts:163:13
    161|       return llmxml.toXML(markdown);
    162|     } catch (error) {
    163|       throw new MeldOutputError(
       |             ^
    164|         'Failed to convert to LLM XML',
    165|         'llm',
 ❯ OutputService.convert services/OutputService/OutputService.ts:59:22
 ❯ Module.main api/index.ts:74:25
 ❯ api/api.test.ts:24:22

Caused by: MeldOutputError: Output error (markdown): Failed to convert to markdown - Output error (markdown): Failed to convert node to markdown - Output error (markdown): Unexpected directive in transformed nodes
 ❯ OutputService.convertToMarkdown services/OutputService/OutputService.ts:140:13
 ❯ OutputService.convertToLLMXML services/OutputService/OutputService.ts:156:24
 ❯ OutputService.convert services/OutputService/OutputService.ts:59:22
 ❯ Module.main api/index.ts:74:25
 ❯ api/api.test.ts:24:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Serialized Error: { format: 'markdown' }
Caused by: MeldOutputError: Output error (markdown): Failed to convert node to markdown - Output error (markdown): Unexpected directive in transformed nodes
 ❯ OutputService.nodeToMarkdown services/OutputService/OutputService.ts:234:13
 ❯ OutputService.convertToMarkdown services/OutputService/OutputService.ts:130:30
 ❯ OutputService.convertToLLMXML services/OutputService/OutputService.ts:156:35
 ❯ OutputService.convert services/OutputService/OutputService.ts:59:28
 ❯ Module.main api/index.ts:74:38
 ❯ api/api.test.ts:24:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Serialized Error: { format: 'markdown' }
Caused by: MeldOutputError: Output error (markdown): Unexpected directive in transformed nodes
 ❯ OutputService.nodeToMarkdown services/OutputService/OutputService.ts:214:19
 ❯ OutputService.convertToMarkdown services/OutputService/OutputService.ts:130:30
 ❯ OutputService.convertToLLMXML services/OutputService/OutputService.ts:156:35
 ❯ OutputService.convert services/OutputService/OutputService.ts:59:28
 ❯ Module.main api/index.ts:74:38
 ❯ api/api.test.ts:24:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
Serialized Error: { format: 'markdown' }
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/10]⎯

 FAIL  api/api.test.ts > SDK Integration Tests > Format Conversion > should handle execution directives correctly
MeldInterpreterError: currentState.clone is not a function at line 1, column 2
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/10]⎯

 FAIL  api/api.test.ts > SDK Integration Tests > Format Conversion > should handle complex meld content with mixed directives
MeldInterpreterError: currentState.clone is not a function at line 5, column 10
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/10]⎯

 FAIL  api/api.test.ts > SDK Integration Tests > Full Pipeline Integration > should handle the complete parse -> interpret -> convert pipeline
MeldInterpreterError: currentState.clone is not a function at line 3, column 10
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/10]⎯

 FAIL  api/api.test.ts > SDK Integration Tests > Full Pipeline Integration > should preserve state and content in transformation mode
MeldInterpreterError: currentState.clone is not a function at line 4, column 10
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/10]⎯

 FAIL  services/DirectiveService/DirectiveService.test.ts > DirectiveService > Directive processing > Import directives > should process basic import
TypeError: result.getTextVar is not a function
 ❯ services/DirectiveService/DirectiveService.test.ts:145:23
    143|         });
    144|
    145|         expect(result.getTextVar('greeting')).toBe('Hello');
       |                       ^
    146|       });
    147|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/10]⎯

 FAIL  services/DirectiveService/DirectiveService.test.ts > DirectiveService > Directive processing > Import directives > should handle nested imports
TypeError: result.getTextVar is not a function
 ❯ services/DirectiveService/DirectiveService.test.ts:157:23
    155|         });
    156|
    157|         expect(result.getTextVar('greeting')).toBe('Hello');
       |                       ^
    158|       });
    159|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/10]⎯

 FAIL  services/OutputService/OutputService.test.ts > OutputService > Transformation Mode > should use transformed nodes when transformation is enabled
AssertionError: expected 'echo test\n' to be 'test output\n' // Object.is equality

- Expected
+ Received

- test output
+ echo test

 ❯ services/OutputService/OutputService.test.ts:385:22
    383|
    384|       const output = await service.convert(originalNodes, state, 'mark…
    385|       expect(output).toBe('test output\n');
       |                      ^
    386|     });
    387|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/10]⎯

 FAIL  services/OutputService/OutputService.test.ts > OutputService > Transformation Mode > should handle mixed content in transformation mode
AssertionError: expected 'Before\necho test\nAfter\n' to be 'Before\ntest output\nAfter\n' // Object.is equality

- Expected
+ Received

  Before
- test output
+ echo test
  After

 ❯ services/OutputService/OutputService.test.ts:405:22
    403|
    404|       const output = await service.convert(originalNodes, state, 'mark…
    405|       expect(output).toBe('Before\ntest output\nAfter\n');
       |                      ^
    406|     });
    407|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[9/10]⎯

 FAIL  services/OutputService/OutputService.test.ts > OutputService > Transformation Mode > should handle LLM output in both modes
AssertionError: expected 'Before\necho test\nAfter' to contain 'test output'

- Expected
+ Received

- test output
+ Before
+ echo test
+ After

 ❯ services/OutputService/OutputService.test.ts:468:22
    466|       output = await service.convert(originalNodes, state, 'llm');
    467|       expect(output).toContain('Before');
    468|       expect(output).toContain('test output');
       |                      ^
    469|       expect(output).toContain('After');
    470|     });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[10/10]⎯

⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯

Vitest caught 1 unhandled error during the test run.
This might cause false positive tests. Resolve unhandled errors to make sure your tests are not affected.

⎯⎯⎯⎯ Unhandled Rejection ⎯⎯⎯⎯⎯
Error: process.exit unexpectedly called with "1"
 ❯ process.exit node_modules/vitest/dist/chunks/execute.2pr0rHgK.js:600:11
 ❯ cli/index.ts:91:11
     89| // Run the CLI if this is the main module
     90| main().catch(() => {
     91|   process.exit(1);
       |           ^
     92| });
 ❯ processTicksAndRejections node:internal/process/task_queues:105:5

This error originated in "cli/cli.test.ts" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
 Test Files  3 failed | 41 passed | 1 skipped (45)
      Tests  10 failed | 504 passed | 22 skipped | 49 todo (585)
     Errors  1 error
   Start at  09:04:31
   Duration  2.15s (transform 684ms, setup 8.07s, collect 850ms, tests 2.31s, environment 4ms, prepare 2.39s)

\=== END TEST STATUS ===

Here's our codebase:

\=== CODE AND TESTS ===

Processing...

\==== END CODE AND TESTS ===

YOUR TASK:

Acknowledging that our previous attempts to resolve these issues, have failed, step back and take a more analytical approach.

Develop a DEEP strategy for methodically approaching the remaining test failures with an evidence-collecting mindset.

Share as much insight as you can about what is revealed by the failing tests and failing attempts to fix them.

Look hard for **inconsistencies in the passing and failing tests themselves** which may be leading us to ping-pong between states due to incompatible expectations.

In addition to your insight, provide a plan for approaching the test failures in a methodical way based on your strategy.

DO NOT GIVE HAND-WAVY ADVICE. BE EVIDENCE-BASED, EXPLICIT, AND DECISIVE.
