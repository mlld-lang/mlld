# Test Pattern Analysis

# Meld Codebase Audit

This is part of a systematic audit of the Meld codebase, focusing on transformation issues, state management bugs, and service implementation mismatches.

## FORMATTING REQUIREMENTS

- Use markdown tables for comparisons
- Use code blocks with language tags
- Include line numbers for all code references
- Format method signatures consistently
- Separate sections with clear headers
- Include evidence for all findings

## ANALYSIS REQUIREMENTS

- Base all findings on concrete evidence from the code
- Do not make assumptions without supporting code
- Highlight any contradictions found
- Note any missing or incomplete implementations
- Identify patterns across multiple files
- Flag any potential architectural issues

## PREVIOUS FINDINGS

-------------------------
Model: o1
System: _meld/audit/partials/auditor.md
Response:
# StateService Clone Analysis

Below is a focused analysis of the StateService's clone() implementation and its usage (based on the provided code snippets). All findings are supported by direct references to code.

---

## 1. clone() Implementation Analysis

### 1.1 Method Signature

• Location: StateService.ts
• Lines 324–350 (approx.)
• Signature:
```typescript
clone(): IStateService
```
This matches the IStateService interface return type (IStateService).

### 1.2 Fields Cloned

When clone() is called, a new StateService instance is created (line 325). The new instance’s internal state (currentState) is then updated using a fresh StateNode created by StateFactory and populated with copies of the original state’s fields (lines 328–344).

Below is a matrix detailing each field, the approach used to clone it, and the relevant lines of code:

| Field                     | Cloning Approach                                                                                          | Lines (approx.) | Notes                                                                                             |
|---------------------------|-----------------------------------------------------------------------------------------------------------|-----------------|---------------------------------------------------------------------------------------------------|
| variables.text           | New Map created with identical key-value pairs                                                            | 336–339         | Shallow copy of the map contents (the map object is new, but string values remain the same refs)  |
| variables.data           | New Map created with identical key-value pairs                                                            | 336–339         | Shallow copy of the map contents (the map object is new, but object values remain the same refs)  |
| variables.path           | New Map created with identical key-value pairs                                                            | 336–339         | Shallow copy of the map contents (the map object is new, but string values remain the same refs)  |
| commands                 | New Map created with identical key-value pairs                                                            | 340             | Shallow copy of commands (each command definition remains the same reference)                     |
| nodes                    | New array created by spreading the existing nodes array                                                   | 341             | Shallow copy of node objects (the node elements themselves remain the same references)           |
| transformedNodes         | If present, new array created by spreading the existing transformedNodes array                            | 342             | Shallow copy of node objects (the node elements themselves remain the same references)           |
| imports                  | New Set created with identical items                                                                      | 343             | Shallow copy of import strings (the set is new, but each string item is the same reference)       |
| _isImmutable             | Boolean flag copied directly                                                                              | 347             | No transformation or modification                                                                  |
| _transformationEnabled   | Boolean flag copied directly                                                                              | 348             | No transformation or modification                                                                  |

### 1.3 Deep vs. Shallow Copy

• Maps, arrays, and sets are re-created (new containers), but their contents (keys, values, or elements) are not deeply cloned.
• Nodes (MeldNode objects) are copied by reference: the new array references the same node objects.
• Command definitions (CommandDefinition objects) are also copied by reference.
• No custom logic for nested objects (e.g., if a Map value is an object, that object is not cloned).

### 1.4 Transformation State Handling

• The clone method copies the transformation-enabled flag (_transformationEnabled) on line 348.
• transformedNodes, if present, is shallow-copied on line 342.
• Therefore, the new clone retains any transformation state exactly as is.

---

## 2. clone() Test Coverage

From the provided snippets and test logs:

1. No direct references to clone() are visible in the “FAILING TESTS” section.
2. No mention of clone() occurs in OutputService.test.ts or in the “services/DirectiveService” handlers tests shown.
3. The snippet “CLONE USAGE IN TESTS” is empty (“Processing…”), indicating no explicit tests were found in the snippet provided.

Consequently, there is no direct, confirmed test coverage for clone() based on the code shown:

• No test cases assert that cloned text/data/path variables are distinct from the original.
• No tests verify that nodes are copied shallowly or that transformation flags remain consistent.

Potential Missing Test Scenarios:
- Verifying that a cloned state has separate Map instances for variables (e.g., changing a variable in the clone does not affect the original).
- Confirming that the cloned nodes array references the same MeldNode objects (expected shallow copy) or tests that it should fully deep-copy them (if desired).
- Checking that _isImmutable is properly copied.
- Verifying that transformation-related data remains consistent in clone.

---

## 3. Production clone() Usage

### 3.1 Call Sites

• Searching through the provided production code snippets (StateService.ts, OutputService.ts) reveals no calls to state.clone().
• An attempt to read files from “DirectiveService/handlers/*.ts” failed (no such file or directory), so no further usage was found there.
• Therefore, based on the visible code, clone() is not invoked in production logic or in the output generation process.

### 3.2 State Before/After clone()

Since there are no discovered call sites, it is unclear how the cloned state is being integrated into any workflow. There is no error handling around clone() calls in the snippet, nor is there direct usage that might hint at lifecycle or transformation concerns.

### 3.3 Transformation Mode Interaction

Although the clone method copies the _transformationEnabled flag and transforms the transformedNodes array, there are no direct references in the logs or tests to confirm how that interacts with real transformations. There is no discovered production code verifying the behavior of the clone in transformation scenarios.

---

## Summary of Findings

1. The clone() method (lines 324–350 in StateService.ts) creates a new StateService and shallow-copies core data structures (Maps, arrays, Sets).
2. No deeper object-level cloning is performed; node objects and command definitions remain the same references, meaning changes to a node’s internal properties would still be shared.
3. The transformation flag and transformedNodes are preserved exactly, but there is no test or production code shown that verifies cloned transformation behavior.
4. No unit tests explicitly target clone() functionality in the provided snippets or logs.
5. No calls to clone() were identified in production code segments that were successfully read.

---

## Recommended Next Steps

• Add dedicated tests for clone() verifying that:
  - The new instance’s Maps/arrays/Sets are separate references from the original.
  - Node objects remain shallow copies (or implement deeper logic if desired).
  - _isImmutable and _transformationEnabled are copied correctly.
• Investigate whether transformation scenarios expect truly separate node objects (deep clone vs. shallow clone). If a deep copy is needed, update the clone() method accordingly.
• Search the broader codebase (especially DirectiveService handlers) after resolving file read issues to confirm whether clone() is used there. Provide tests or usage examples if discovered.

---

> All evidence is drawn from lines 324–350 of StateService.ts (clone code) and from the absence of clone references in the provided test logs and OutputService.ts.
 -------------------------
Model: o1
System: _meld/audit/partials/auditor.md
Response:
# Failing Tests Analysis

Below is a structured audit of the reported test failures and error outputs, focusing on:

• Transformation issues
• State management bugs
• Service implementation mismatches

All findings reference the provided code snippets and error logs.

--------------------------------------------------------------------------------
## 1. FAILURE ANALYSIS MATRIX

Below is a summary table mapping the reported errors to the relevant test file, the visible error message, and the approximate location in the code where the error originates.

| Test / File (Reported in Logs)                                                                            | Error Message                                                                                                                | Relevant Code (Approx.)                                              | Observations                                                                                                                         |
|------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------|
| ImportDirectiveHandler.transformation.test.ts <br> (“transformation behavior”)                                                                   | Failed to process import directive <br> "Import file not found: [missing.meld]"                                             | DirectiveService.ts <br> handleImportDirective() <br> Lines 156–159, 186–187                     | • Throws an error if the file does not exist. <br> • Error rethrown as MeldDirectiveError. <br> • Tests appear to expect this error to confirm error handling logic.        |
| RunDirectiveHandler.transformation.test.ts <br> (“transformation behavior”)                                                                      | Error executing run directive: Command failed                                                                                | RunDirectiveHandler (not fully shown) <br> Called from processDirective() <br> Lines ~297–327 in DirectiveService.ts | • The test logs show the directive fails due to an invalid or failing command. <br> • The error is propagated by the directive handler and caught in the test as expected. |
| RunDirectiveHandler.test.ts <br> (“error handling”)                                                                                              | Directive error (run): Invalid command <br> Directive error (run): Variable not found <br> Command failed                    | Same location as above (DirectiveService.ts) <br> The specific “run” handler is executed after validation                                | • The logs show multiple scenario-based errors: invalid command, missing variable, or a command exception. <br> • Appears to validate that error paths work properly.       |
| ImportDirectiveHandler.test.ts <br> (“basic importing” / “error handling” / “cleanup”)                                                           | Directive error (import): Import file not found <br> Directive error (import): Invalid import <br> Circular import detected  | DirectiveService.ts <br> handleImportDirective() <br> Lines 156–159, 186–187                     | • Includes tests for nonexistent files, invalid syntax, and circular imports. <br> • All cases trigger an error in handleImportDirective() and are rethrown as expected.    |

NOTES:
• Despite the log lines marked with [error], the final test summary shows all tests “passed” or were “skipped/ todo.” Many of these appear to be negative tests that intentionally trigger and verify error handling.
• No explicit “OutputService” failures appear in the snippet. The logs do not show a failing test specifically named “OutputService.test.ts.”

--------------------------------------------------------------------------------
## 2. API TEST FAILURES

This section details the API-level tests that triggered errors in the logs (largely involving “ImportDirectiveHandler,” “RunDirectiveHandler,” and other directive handlers). While the final summary indicates these tests passed, each test logs an error that appears intentional. Below are key findings.

### 2.1 Documented Error Messages

The primary error messages seen in the logs:

1. "Directive error (import): Import file not found: [missing.meld]"
2. "Directive error (run): Invalid command"
3. "Directive error (import): Circular import detected"
4. "Error executing run directive: Command failed"

These messages all originate from directive handling code that checks file existence, command validity, or recursion detection.

### 2.2 Execution Path to Failure

• For “ImportDirectiveHandler,” failures are thrown at:
  - Lines 156–159 in DirectiveService.ts (snippet reference), within:
    ┌ (line 156)  if (!await this.fileSystemService!.exists(fullPath)) {
    └ (line 157)    throw new Error(`Import file not found: ${fullPath}`);

  - Then re-caught and wrapped in a MeldDirectiveError at lines 186–187.

• For “RunDirectiveHandler,” failures are triggered in the execution logic (e.g., invalid command or command failure), then forwarded through DirectiveService’s processDirective(...) around lines 297–327.

### 2.3 Mock Service Usage

• The code frequently references (this.fileSystemService!.exists) or (this.pathService!.resolvePath). Tests mocking these services could be returning false to ensure the directive code raises “file not found” errors.
• No direct evidence of mock inconsistencies is visible in the logs themselves (the logs do not list changed mocks at runtime), but the repeated “file not found” suggests a forced negative test path.

### 2.4 State Management Flow

• In ImportDirectiveHandler (DirectiveService.ts lines ~222–225), the code calls createChildState() before parsing/ interpreting the imported file:
  ┌ (line 222)  const childState = await this.stateService!.createChildState();
  This child state merges back into the parent if no error occurs.
• Errors short-circuit the merge by throwing a MeldDirectiveError. The logs confirm that the error is caught and logged, which is apparently expected in negative test cases.

--------------------------------------------------------------------------------
## 3. OUTPUTSERVICE FAILURES

From the provided logs, there are no explicit errors referencing OutputService methods (e.g., convertToMarkdown, convertToLLMXML, etc.):

• The test command invoked “tests/api/api.test.ts tests/services/OutputService/OutputService.test.ts,” but the snippet does not show failing OutputService tests.
• All transformation or directive-based errors come from DirectiveService.

Therefore, based on the shared logs:

1. No failing transformation tests specifically mention OutputService methods.
2. If OutputService tests failed, they are not shown in these logs.

--------------------------------------------------------------------------------
## 4. COMPARISON: FAILING VS. PASSING TESTS

Although the logs repeatedly show “error” statements, the final summary indicates all relevant test files passed or were skipped. Below are observed patterns:

| Aspect                       | Failing Tests (Logged Errors)                                                            | Passing Tests (No Errors Logged)                                                    |
|-----------------------------|-------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------|
| Error Handling              | Tests log “Import file not found,” “Command failed,” etc. but exit successfully (✓).     | Many directive handler tests also pass silently if they do not trigger negative paths. |
| Mocks / Setup               | Negative tests likely mock file existence checks or commands to fail.                    | Passing tests either mock with valid file paths/ commands or do not rely on them.   |
| State Management            | Tests where a child state is created but the code throws expected errors (circular import, missing files). | Standard usage likely merges child states without error.                            |
| Transformation Mode         | Test logs referencing “transformation” appear to confirm that error handling is preserved (rather than break in transformed code). | Passing tests confirm normal directives also function with transformations off.     |

### 4.1 Patterns in Failures

• All reported “failures” are negative test scenarios verifying correct error handling.
• The same directive pipeline is used (DirectiveService → [Handler].execute → throw) but with different input conditions.
• The “mock” or “setup” difference is that these negative tests intentionally ensure a missing file, an invalid command, or an invalid directive.

### 4.2 Shared Assumptions

• That “file not found” should always raise a MeldDirectiveError(“FILE_NOT_FOUND”).
• That “invalid command” or “variable not found” is verified by RunDirectiveHandler.
• The existence of transformation mode does not override or skip error checks; it is still tested for correctness.

--------------------------------------------------------------------------------
## 5. KEY FINDINGS & NEXT STEPS

Below is a concise list of actionable findings based on the logs and code:

1. ▶ All Logged Errors Appear Intentional
   • Each “error” from the logs corresponds to a negative test verifying that DirectiveService raises correct exceptions.
   • Final test results show these are not truly failing tests; they pass by expecting these exceptions.

2. ▶ No Confirmed OutputService Failures in Logs
   • Despite the mention of “OutputService.test.ts,” no failing test steps reference OutputService code or transformations.
   • If there are OutputService issues, they are not shown in the snippet’s logs.

3. ▶ State Management Observations
   • DirectiveService calls createChildState() (DirectiveService.ts around line 222) and may merge or discard it on error. This behavior is consistent with an immutable or partial-merge approach from StateService.
   • No direct evidence of a mismatch in the logs; all negative tests confirm the expected short-circuit on error.

4. ▶ Potential Areas for Future Investigation
   • Validate whether the same negative tests exist for OutputService transformations (e.g., calling convert with an invalid format).
   • Confirm that partial merges for child states are tested under multiple transformations and that no leftover or partial merges occur.

--------------------------------------------------------------------------------
## 6. RECOMMENDED ACTIONS

1. Double-check OutputService Tests
   • If there are known issues, ensure logs are captured or that the tests are not silently skipped.
   • Verify transformation mode in OutputService by testing “isTransformationEnabled()” usage (OutputService.ts, lines ~50–59).

2. Confirm All Negative Test Flows for Directives
   • The logs show repeated “file not found” or “command failed” errors. Ensure no duplication of negative test coverage.
   • Confirm consistent mocking of file existence and command success/failure.

3. Review Child-State Merges in Edge Cases
   • Because each failing example uses a throw before merging, confirm that no partial merges occur.
   • Add logs or assertions confirming the final parent state remains unchanged on error.

--------------------------------------------------------------------------------

> NOTE: All line numbers above refer to approximate positions in the provided “DirectiveService.ts” snippet. Actual line offsets may differ slightly in the real codebase.

## CODE TO ANALYZE

\=== TESTS OUTPUT ===

> meld@10.0.0 test
> vitest run

 RUN  v2.1.9 /Users/adam/dev/meld

 ✓ services/DirectiveService/handlers/definition/DefineDirectiveHandler.test.ts (16 tests) 12ms
stdout | services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts > RunDirectiveHandler > error handling > should handle validation errors
2025-02-21 15:02:24 [error] [directive] Error executing run directive: Directive error (run): Invalid command
{
  "kind": "run",
  "code": "VALIDATION_FAILED",
  "name": "DirectiveError",
  "stack": "DirectiveError: Directive error (run): Invalid command\n    at /Users/adam/dev/meld/services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts:183:9\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11\n    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)\n    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)\n    at processTicksAndRejections (node:internal/process/task_queues:105:5)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)"
}

stdout | services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts > RunDirectiveHandler > error handling > should handle resolution errors
2025-02-21 15:02:24 [error] [directive] Error executing run directive: Variable not found
{
  "stack": "Error: Variable not found\n    at /Users/adam/dev/meld/services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts:199:9\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11\n    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)\n    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)\n    at processTicksAndRejections (node:internal/process/task_queues:105:5)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)"
}

stdout | services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts > RunDirectiveHandler > error handling > should handle command execution errors
2025-02-21 15:02:24 [error] [directive] Error executing run directive: Command failed
{
  "stack": "Error: Command failed\n    at /Users/adam/dev/meld/services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts:216:9\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11\n    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)\n    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)\n    at processTicksAndRejections (node:internal/process/task_queues:105:5)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)"
}

 ✓ services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts (10 tests) 15ms
 ✓ services/DirectiveService/handlers/execution/EmbedDirectiveHandler.test.ts (8 tests) 13ms
stdout | services/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts > ImportDirectiveHandler > special path variables > should throw error if resolved path does not exist
2025-02-21 15:02:24 [error] [directive] Failed to process import directive
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
2025-02-21 15:02:24 [error] [directive] Failed to process import directive
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
2025-02-21 15:02:24 [error] [directive] Failed to process import directive
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
2025-02-21 15:02:24 [error] [directive] Failed to process import directive
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
2025-02-21 15:02:24 [error] [directive] Failed to process import directive
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
2025-02-21 15:02:24 [error] [directive] Failed to process import directive
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
2025-02-21 15:02:24 [error] [directive] Failed to process import directive
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

 ✓ services/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts (15 tests | 2 skipped) 18ms
stdout | services/InterpreterService/InterpreterService.unit.test.ts > InterpreterService Unit > node interpretation > throws on unknown node types
2025-02-21 15:02:24 [error] [interpreter] Interpretation failed
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
2025-02-21 15:02:24 [error] [interpreter] Interpretation failed
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
2025-02-21 15:02:24 [error] [interpreter] Interpretation failed
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
2025-02-21 15:02:24 [error] [interpreter] Interpretation failed
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
2025-02-21 15:02:24 [error] [interpreter] Failed to create child context
{
  "error": {}
}

stdout | services/InterpreterService/InterpreterService.unit.test.ts > InterpreterService Unit > edge cases > handles state initialization failures
2025-02-21 15:02:24 [error] [interpreter] Interpretation failed
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
2025-02-21 15:02:24 [error] [interpreter] Interpretation failed
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

 ✓ services/InterpreterService/InterpreterService.unit.test.ts (22 tests) 31ms
 ↓ cli/cli.test.ts (33 tests | 33 skipped)
stdout | cli/cli.test.ts
2025-02-21 15:02:24 [error] [cli] CLI execution failed
{
  "error": "Paths with slashes must start with $. or $~ - use $. for project-relative paths and $~ for home-relative paths"
}

stdout | services/CLIService/CLIService.test.ts > CLIService > Format Conversion > should output llm format by default
test output
2025-02-21 15:02:24 [info] [cli] Successfully wrote output to stdout

stdout | services/CLIService/CLIService.test.ts > CLIService > Format Conversion > should handle format aliases correctly
test output
2025-02-21 15:02:24 [info] [cli] Successfully wrote output to stdout

stdout | services/CLIService/CLIService.test.ts > CLIService > Format Conversion > should preserve markdown with markdown format
test output
2025-02-21 15:02:24 [info] [cli] Successfully wrote output to stdout

stdout | services/CLIService/CLIService.test.ts > CLIService > Command Line Options > should display version when --version flag is used
meld version 10.0.0

stdout | services/CLIService/CLIService.test.ts > CLIService > Command Line Options > should respect --stdout option
test output
2025-02-21 15:02:24 [info] [cli] Successfully wrote output to stdout

stdout | services/CLIService/CLIService.test.ts > CLIService > Command Line Options > should use default output path when not specified
2025-02-21 15:02:24 [info] [cli] Successfully wrote output file
{
  "path": "test.xml"
}

stdout | services/CLIService/CLIService.test.ts > CLIService > Command Line Options > should handle project path option
2025-02-21 15:02:24 [info] [cli] Successfully wrote output file
{
  "path": "/project/test.xml"
}

stdout | services/CLIService/CLIService.test.ts > CLIService > Command Line Options > should handle home path option
2025-02-21 15:02:24 [info] [cli] Successfully wrote output file
{
  "path": "test.xml"
}

stdout | services/CLIService/CLIService.test.ts > CLIService > Command Line Options > should handle verbose option
2025-02-21 15:02:24 [info] [cli] Verbose mode enabled
2025-02-21 15:02:24 [info] [cli] Successfully wrote output file
{
  "path": "test.xml"
}

stdout | services/CLIService/CLIService.test.ts > CLIService > Command Line Options > should handle watch option
2025-02-21 15:02:24 [info] [cli] Starting watch mode
{
  "input": "test.meld"
}
2025-02-21 15:02:24 [info] [cli] Watching for changes
{
  "directory": "."
}

stdout | services/OutputService/OutputService.test.ts > OutputService > LLM XML Output > should preserve text content
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"warningLevel":"all"},"timestamp":"2025-02-21T23:02:24.541Z"}

stdout | services/OutputService/OutputService.test.ts > OutputService > LLM XML Output > should preserve code fence content
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"warningLevel":"all"},"timestamp":"2025-02-21T23:02:24.547Z"}

stdout | services/OutputService/OutputService.test.ts > OutputService > LLM XML Output > should handle directives according to type
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"warningLevel":"all"},"timestamp":"2025-02-21T23:02:24.549Z"}

stdout | services/OutputService/OutputService.test.ts > OutputService > LLM XML Output > should handle directives according to type
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"warningLevel":"all"},"timestamp":"2025-02-21T23:02:24.551Z"}

stdout | services/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > State management > handles state rollback on merge errors
2025-02-21 15:02:24 [error] [interpreter] Interpretation failed
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
2025-02-21 15:02:24 [warn] [import] Attempted to end import for file not in stack
{
  "filePath": "project/src/circular1.meld",
  "currentStack": []
}
2025-02-21 15:02:24 [error] [directive] Failed to process import directive
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
2025-02-21 15:02:24 [error] [interpreter] Interpretation failed
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
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"warningLevel":"all"},"timestamp":"2025-02-21T23:02:24.553Z"}

stdout | services/OutputService/OutputService.test.ts > OutputService > Transformation Mode > should handle LLM output in both modes
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"warningLevel":"all"},"timestamp":"2025-02-21T23:02:24.566Z"}

stdout | services/OutputService/OutputService.test.ts > OutputService > Transformation Mode > should handle LLM output in both modes
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"warningLevel":"all"},"timestamp":"2025-02-21T23:02:24.568Z"}

stdout | services/OutputService/OutputService.test.ts > OutputService > Error Handling > should throw MeldOutputError for unknown node types
2025-02-21 15:02:24 [error] [output] Failed to convert output
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
2025-02-21 15:02:24 [error] [output] Failed to convert output
{
  "format": "error",
  "error": {}
}

stdout | services/OutputService/OutputService.test.ts > OutputService > Error Handling > should preserve MeldOutputError when thrown from converters
2025-02-21 15:02:24 [error] [output] Failed to convert output
{
  "format": "error",
  "error": {
    "format": "error",
    "name": "MeldOutputError"
  }
}

stdout | services/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > Error handling > provides location information in errors
2025-02-21 15:02:24 [error] [interpreter] Interpretation failed
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

 ❯ services/OutputService/OutputService.test.ts (22 tests | 3 failed) 109ms
   × OutputService > Transformation Mode > should use transformed nodes when transformation is enabled 6ms
     → expected 'echo test\n' to be 'test output\n' // Object.is equality
   × OutputService > Transformation Mode > should handle mixed content in transformation mode 1ms
     → expected 'Before\necho test\nAfter\n' to be 'Before\ntest output\nAfter\n' // Object.is equality
   × OutputService > Transformation Mode > should handle LLM output in both modes 8ms
     → expected 'Before\necho test\nAfter' to contain 'test output'
stdout | services/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > Error handling > maintains state consistency after errors
2025-02-21 15:02:24 [error] [interpreter] Interpretation failed
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

stdout | services/InterpreterService/InterpreterService.integration.test.ts > InterpreterService Integration > Error handling > includes state context in interpreter errors
2025-02-21 15:02:24 [error] [interpreter] Interpretation failed
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
2025-02-21 15:02:24 [error] [interpreter] Interpretation failed
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
2025-02-21 15:02:24 [warn] [import] Attempted to end import for file not in stack
{
  "filePath": "project/src/circular1.meld",
  "currentStack": []
}
2025-02-21 15:02:24 [error] [directive] Failed to process import directive
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
2025-02-21 15:02:24 [error] [interpreter] Interpretation failed
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
2025-02-21 15:02:24 [info] [cli] Change detected
{
  "file": "test.meld"
}
2025-02-21 15:02:24 [info] [cli] Successfully wrote output file
{
  "path": "test.xml"
}

 ✓ services/InterpreterService/InterpreterService.integration.test.ts (24 tests | 4 skipped) 177ms
stdout | services/ValidationService/ValidationService.test.ts > ValidationService > Text directive validation > should throw on missing name
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
stdout | services/ValidationService/ValidationService.test.ts > ValidationService > Embed directive validation > should throw on invalid fuzzy threshold (above 1)
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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
2025-02-21 15:02:24 [error] [validation] Directive validation failed
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

 ✓ services/DirectiveService/handlers/definition/DataDirectiveHandler.test.ts (9 tests) 23ms
 ✓ services/DirectiveService/handlers/execution/EmbedDirectiveHandler.transformation.test.ts (7 tests) 9ms
 ✓ services/DirectiveService/handlers/definition/TextDirectiveHandler.test.ts (15 tests) 15ms
stdout | services/ResolutionService/ResolutionService.test.ts > ResolutionService > extractSection > should extract section by heading
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"warningLevel":"none"},"timestamp":"2025-02-21T23:02:24.849Z"}

stdout | services/ResolutionService/ResolutionService.test.ts > ResolutionService > extractSection > should include content until next heading of same or higher level
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"warningLevel":"none"},"timestamp":"2025-02-21T23:02:24.858Z"}

 ✓ services/ParserService/ParserService.test.ts (17 tests) 37ms
stdout | services/ResolutionService/ResolutionService.test.ts > ResolutionService > extractSection > should throw when section is not found
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"warningLevel":"none"},"timestamp":"2025-02-21T23:02:24.861Z"}

 ✓ services/ResolutionService/ResolutionService.test.ts (18 tests) 79ms
stdout | services/DirectiveService/handlers/execution/ImportDirectiveHandler.transformation.test.ts > ImportDirectiveHandler Transformation > transformation behavior > should preserve error handling in transformation mode
2025-02-21 15:02:24 [error] [directive] Failed to process import directive
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
 ✓ services/StateService/StateFactory.test.ts (10 tests) 5ms
 ✓ services/ResolutionService/resolvers/PathResolver.test.ts (15 tests | 1 skipped) 6ms
stdout | services/DirectiveService/DirectiveService.test.ts > DirectiveService > Directive processing > Text directives > should process basic text directive
test.meld exists: true
test.meld content: @text greeting = "Hello"

 ✓ services/StateService/StateService.test.ts (26 tests) 7ms
stdout | tests/utils/tests/TestSnapshot.test.ts > TestSnapshot > directory-specific snapshots > returns empty snapshot for non-existent directory
2025-02-21 15:02:25 [error] [filesystem] Directory not found
{
  "dirPath": "/project/nonexistent",
  "memfsPath": "project/nonexistent"
}

 ✓ tests/utils/tests/TestSnapshot.test.ts (13 tests) 24ms
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
2025-02-21 15:02:25 [info] [cli] Successfully wrote output file
{
  "path": "test.xml"
}

 ✓ services/CLIService/CLIService.test.ts (20 tests | 3 skipped) 661ms
   ✓ CLIService > Command Line Options > should handle watch option 606ms
stdout | services/DirectiveService/handlers/execution/RunDirectiveHandler.transformation.test.ts > RunDirectiveHandler Transformation > transformation behavior > should preserve error handling during transformation
2025-02-21 15:02:25 [error] [directive] Error executing run directive: Command failed
{
  "stack": "Error: Command failed\n    at /Users/adam/dev/meld/services/DirectiveService/handlers/execution/RunDirectiveHandler.transformation.test.ts:150:69\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:146:14\n    at file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:533:11\n    at runWithTimeout (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:39:7)\n    at runTest (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1056:17)\n    at processTicksAndRejections (node:internal/process/task_queues:105:5)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runSuite (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1205:15)\n    at runFiles (file:///Users/adam/dev/meld/node_modules/@vitest/runner/dist/index.js:1262:5)"
}

 ✓ services/DirectiveService/handlers/execution/RunDirectiveHandler.transformation.test.ts (5 tests) 9ms
stdout | services/DirectiveService/DirectiveService.test.ts > DirectiveService > Directive processing > Import directives > should detect circular imports
2025-02-21 15:02:25 [error] [validation] Directive validation failed
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
2025-02-21 15:02:25 [error] [directive] Failed to validate directive
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
2025-02-21 15:02:25 [error] [interpreter] Interpretation failed
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
2025-02-21 15:02:25 [warn] [import] Attempted to end import for file not in stack
{
  "filePath": "b.meld",
  "currentStack": []
}
2025-02-21 15:02:25 [error] [directive] Failed to process import directive
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

 ❯ services/DirectiveService/DirectiveService.test.ts (9 tests | 2 failed) 81ms
   × DirectiveService > Directive processing > Import directives > should process basic import 19ms
     → result.getTextVar is not a function
   × DirectiveService > Directive processing > Import directives > should handle nested imports 7ms
     → result.getTextVar is not a function
stdout | services/FileSystemService/FileSystemService.test.ts > FileSystemService > File operations > throws MeldError when reading non-existent file
2025-02-21 15:02:25 [error] [filesystem] File not found
{
  "filePath": "project/nonexistent.txt",
  "memfsPath": "project/project/nonexistent.txt"
}
2025-02-21 15:02:25 [error] [filesystem] File not found
{
  "operation": "readFile",
  "path": "project/nonexistent.txt",
  "error": {}
}

stdout | services/StateService/migration.test.ts > State Migration > error handling > should handle migration errors gracefully
2025-02-21 15:02:25 [error] [state] State migration failed
{
  "error": {}
}

 ✓ services/StateService/migration.test.ts (8 tests) 11ms
stdout | services/FileSystemService/FileSystemService.test.ts > FileSystemService > Directory operations > throws MeldError when reading non-existent directory
2025-02-21 15:02:25 [error] [filesystem] Directory not found
{
  "dirPath": "project/nonexistent",
  "memfsPath": "project/project/nonexistent"
}
2025-02-21 15:02:25 [error] [filesystem] Failed to read directory
{
  "operation": "readDir",
  "path": "project/nonexistent",
  "error": {}
}

 ✓ services/FileSystemService/FileSystemService.test.ts (17 tests) 157ms
 ✓ services/ResolutionService/resolvers/ContentResolver.test.ts (6 tests) 8ms
 ✓ services/PathService/PathService.tmp.test.ts (14 tests | 8 skipped) 11ms
 ✓ services/ResolutionService/resolvers/CommandResolver.test.ts (11 tests | 2 skipped) 28ms
stdout | services/DirectiveService/handlers/definition/PathDirectiveHandler.test.ts > PathDirectiveHandler > error handling > should handle validation errors
2025-02-21 15:02:25 [error] [directive] Failed to process path directive
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
2025-02-21 15:02:25 [error] [directive] Failed to process path directive
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
2025-02-21 15:02:25 [error] [directive] Failed to process path directive
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
 ✓ services/PathService/PathService.test.ts (12 tests) 32ms
stdout | api/api.test.ts > SDK Integration Tests > Format Conversion > should handle definition directives correctly
2025-02-21 15:02:25 [error] [output] Failed to convert output
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

 ✓ tests/utils/tests/ProjectBuilder.test.ts (10 tests) 29ms
stdout | api/api.test.ts > SDK Integration Tests > Format Conversion > should handle execution directives correctly
2025-02-21 15:02:25 [error] [interpreter] Interpretation failed
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
2025-02-21 15:02:25 [error] [interpreter] Interpretation failed
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
2025-02-21 15:02:25 [error] [interpreter] Interpretation failed
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

stdout | tests/utils/tests/MemfsTestFileSystem.test.ts > MemfsTestFileSystem > error handling > throws when reading non-existent file
2025-02-21 15:02:25 [error] [filesystem] File not found
{
  "filePath": "/project/nonexistent.txt",
  "memfsPath": "project/nonexistent.txt"
}

stdout | tests/utils/tests/MemfsTestFileSystem.test.ts > MemfsTestFileSystem > error handling > throws when getting stats of non-existent path
2025-02-21 15:02:25 [error] [filesystem] Error getting stats
{
  "filePath": "/project/nonexistent",
  "memfsPath": "project/nonexistent",
  "error": {
    "code": "ENOENT",
    "path": "project/nonexistent"
  }
}

 ✓ tests/utils/tests/MemfsTestFileSystem.test.ts (14 tests) 36ms
stdout | api/api.test.ts > SDK Integration Tests > Full Pipeline Integration > should preserve state and content in transformation mode
2025-02-21 15:02:25 [error] [interpreter] Interpretation failed
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

 ✓ services/DirectiveService/handlers/definition/TextDirectiveHandler.integration.test.ts (8 tests | 4 skipped) 8ms
 ✓ services/ResolutionService/resolvers/TextResolver.test.ts (11 tests | 2 skipped) 8ms
stdout | api/api.test.ts > SDK Integration Tests > Error Handling > should handle empty files
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"warningLevel":"all"},"timestamp":"2025-02-21T23:02:25.698Z"}

 ❯ api/api.test.ts (10 tests | 5 failed | 3 skipped) 231ms
   × SDK Integration Tests > Format Conversion > should handle definition directives correctly 20ms
     → Output error (llm): Failed to convert to LLM XML - Output error (markdown): Failed to convert to markdown - Output error (markdown): Failed to convert node to markdown - Output error (markdown): Unexpected directive in transformed nodes
   × SDK Integration Tests > Format Conversion > should handle execution directives correctly 34ms
     → currentState.clone is not a function at line 1, column 2
   × SDK Integration Tests > Format Conversion > should handle complex meld content with mixed directives 35ms
     → currentState.clone is not a function at line 5, column 10
   × SDK Integration Tests > Full Pipeline Integration > should handle the complete parse -> interpret -> convert pipeline 33ms
     → currentState.clone is not a function at line 3, column 10
   × SDK Integration Tests > Full Pipeline Integration > should preserve state and content in transformation mode 14ms
     → currentState.clone is not a function at line 4, column 10
 ✓ tests/utils/tests/FixtureManager.test.ts (9 tests) 6ms
 ✓ services/ResolutionService/resolvers/DataResolver.test.ts (13 tests | 5 skipped) 5ms
 ✓ services/ResolutionService/resolvers/StringLiteralHandler.test.ts (18 tests) 4ms
 ✓ services/ResolutionService/resolvers/VariableReferenceResolver.test.ts (12 tests) 11ms
stdout | tests/utils/tests/TestContext.test.ts > TestContext > xml conversion > converts content to xml
info: LLMXML instance created {"options":{"defaultFuzzyThreshold":0.7,"warningLevel":"all"},"timestamp":"2025-02-21T23:02:25.895Z"}

 ✓ tests/utils/tests/TestContext.test.ts (11 tests) 144ms
 ✓ services/ResolutionService/resolvers/StringConcatenationHandler.test.ts (11 tests) 5ms
 ✓ services/StateService/StateService.transformation.test.ts (8 tests) 4ms
stdout | services/CircularityService/CircularityService.test.ts > CircularityService > Circular import detection > should detect direct circular imports
2025-02-21 15:02:25 [error] [import] Circular import detected
{
  "filePath": "fileA.meld",
  "importChain": [
    "fileA.meld",
    "fileA.meld"
  ]
}

stdout | services/CircularityService/CircularityService.test.ts > CircularityService > Circular import detection > should detect indirect circular imports
2025-02-21 15:02:25 [error] [import] Circular import detected
{
  "filePath": "fileA.meld",
  "importChain": [
    "fileA.meld",
    "fileB.meld",
    "fileA.meld"
  ]
}

stdout | services/CircularityService/CircularityService.test.ts > CircularityService > Circular import detection > should include import chain in error
2025-02-21 15:02:25 [error] [import] Circular import detected
{
  "filePath": "fileA.meld",
  "importChain": [
    "fileA.meld",
    "fileB.meld",
    "fileA.meld"
  ]
}

stdout | services/CircularityService/CircularityService.test.ts > CircularityService > Stack management > should handle ending import for file not in stack
2025-02-21 15:02:25 [warn] [import] Attempted to end import for file not in stack
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
 ✓ services/FileSystemService/PathOperationsService.test.ts (8 tests) 2ms
 ✓ services/ValidationService/validators/FuzzyMatchingValidator.test.ts (6 tests | 4 skipped) 3ms

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
   Start at  15:02:23
   Duration  2.09s (transform 725ms, setup 7.37s, collect 890ms, tests 2.11s, environment 4ms, prepare 2.48s)

\==== FAILING TESTS ===

Processing...

\=== PASSING TESTS WITH SIMILAR PATTERNS ===

Processing...

## YOUR TASK

Create a detailed analysis of test patterns, focusing on clone() and transformation:

1. For each failing test, analyze the pattern:
   ```typescript
   {
     testFile: string;
     testName: string;
     pattern: {
       setupSteps: string[];
       stateManagement: {
         usesClone: boolean;
         usesChildState: boolean;
         transformationEnabled: boolean;
       };
       mockUsage: {
         mockType: string;
         methodsCalled: string[];
       };
       failureType: string;
       errorMessage: string;
     };
     similarPassingTests: string[];  // Names of similar tests that pass
     keyDifferences: string[];      // What's different in passing tests
   }
   ```

2. Group the failures by pattern:
   - Tests failing due to missing clone()
   - Tests failing due to transformation state
   - Tests failing due to mock implementation
   - Tests failing due to state inheritance

BE SPECIFIC about the differences between failing and passing tests.
INCLUDE line numbers for all findings.
FOCUS on patterns that could indicate systematic issues.

## RESPONSE QUALITY REQUIREMENTS

1. EVIDENCE-BASED ANALYSIS
   - Every finding must reference specific code
   - Include relevant line numbers and file paths
   - Quote critical code segments when relevant
   - Link findings to specific test failures or logs

2. STRUCTURED OUTPUT
   - Use tables for comparisons and summaries
   - Use bullet points for lists of findings
   - Use code blocks for code examples
   - Use headers to organize sections

3. ACTIONABLE RESULTS
   - Clearly state each issue found
   - Provide concrete examples of problems
   - Link issues to specific code locations
   - Suggest specific next steps or areas for investigation

DO NOT GUESS. DO NOT GIVE HAND-WAVY ADVICE. BE EVIDENCE-BASED, EXPLICIT, AND DECISIVE.
