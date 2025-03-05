# Test Pattern Analysis

Below is a structured analysis of the recent failing tests in the Meld codebase, focusing on how each failure relates to clone() usage, transformation states, mock implementations, and state inheritance. All references to line numbers and code snippets are taken directly from the logs provided.

--------------------------------------------------------------------------------
## 1. Failing Test Patterns

Each failing test is presented as an object with the requested structure:

- testFile
- testName
- pattern
  - setupSteps
  - stateManagement
    - usesClone
    - usesChildState
    - transformationEnabled
  - mockUsage
    - mockType
    - methodsCalled
  - failureType
  - errorMessage
- similarPassingTests
- keyDifferences

All line numbers correspond to the logs shown in “FAIL” sections and error stacks.

---

### 1.1 “api/api.test.ts > Format Conversion > should handle definition directives correctly”

```typescript
{
  testFile: "api/api.test.ts",
  testName: "SDK Integration Tests > Format Conversion > should handle definition directives correctly",
  pattern: {
    setupSteps: [
      "Parse input with definition directives",
      "Attempt to convert output to LLM XML via convertToLLMXML() (line 163 in OutputService.ts per log)",
    ],
    stateManagement: {
      usesClone: false,
      usesChildState: false,
      transformationEnabled: true  // Evidence: “Unexpected directive in transformed nodes” message
    },
    mockUsage: {
      mockType: "OutputService / LLMXML",
      methodsCalled: ["convertToMarkdown", "convertToLLMXML"]
    },
    failureType: "Transformation mismatch / Unexpected node type",
    errorMessage: "Output error (llm): Failed to convert to LLM XML - ... Unexpected directive in transformed nodes"
  },
  similarPassingTests: [
    "services/OutputService/OutputService.test.ts > LLM XML Output > should preserve text content",
    "services/OutputService/OutputService.test.ts > LLM XML Output > should preserve code fence content"
  ],
  keyDifferences: [
    "The failing test includes definition directives in the transformed nodes, triggering an 'Unexpected directive' error.",
    "The similar passing tests only deal with text, code fences, or recognized directive types."
  }
}
```

- Evidentiary References:
  - Logged at “FAIL  api/api.test.ts > SDK Integration Tests > … definition directives.”  
  - Code reference: “OutputService.convertToLLMXML (line 163)” from the error stack.  
  - Transformation error logs mention “Unexpected directive in transformed nodes,” indicating that transformation was enabled but encountered an unhandled directive kind.

---

### 1.2 “api/api.test.ts > Format Conversion > should handle execution directives correctly”

```typescript
{
  testFile: "api/api.test.ts",
  testName: "SDK Integration Tests > Format Conversion > should handle execution directives correctly",
  pattern: {
    setupSteps: [
      "Parse input with execution directives",
      "Interpret the meld file (line 1, column 2) causing clone() call inside the interpreter"
    ],
    stateManagement: {
      usesClone: true,   // Error: “currentState.clone is not a function”
      usesChildState: false,
      transformationEnabled: false // No mention of transformation flags in the error message
    },
    mockUsage: {
      mockType: "InterpreterService or DirectiveService",
      methodsCalled: []
    },
    failureType: "Missing clone() implementation / TypeError",
    errorMessage: "MeldInterpreterError: currentState.clone is not a function at line 1, column 2"
  },
  similarPassingTests: [
    "services/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts > basic run directive usage"
  ],
  keyDifferences: [
    "Passing tests do not invoke state.clone(), or they run with a fully implemented StateService providing clone().",
    "The failing test references a partial or stubbed StateService without a working clone() method."
  }
}
```

- Evidentiary References:
  - Logged at “FAIL  api/api.test.ts > SDK Integration Tests > Format Conversion > should handle execution directives correctly.”  
  - Error: “currentState.clone is not a function at line 1, column 2.”  
  - Indicates code is calling clone() but the underlying object does not have the method (or it is not properly bound).

---

### 1.3 “api/api.test.ts > Format Conversion > should handle complex meld content with mixed directives”

```typescript
{
  testFile: "api/api.test.ts",
  testName: "SDK Integration Tests > Format Conversion > should handle complex meld content with mixed directives",
  pattern: {
    setupSteps: [
      "Parse meld file with multiple directive types (text, data, import, run, etc.)",
      "Call interpret(...) which tries currentState.clone() (line 5, column 10 in snippet logs)"
    ],
    stateManagement: {
      usesClone: true,
      usesChildState: false,
      transformationEnabled: false // The error references clone(), not a transformation mismatch
    },
    mockUsage: {
      mockType: "InterpreterService / DirectiveService",
      methodsCalled: []
    },
    failureType: "Missing clone() implementation / TypeError",
    errorMessage: "MeldInterpreterError: currentState.clone is not a function at line 5, column 10"
  },
  similarPassingTests: [
    "services/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts > basic importing (when it doesn't call clone())"
  ],
  keyDifferences: [
    "Passing tests do not rely on clone() or have it properly available.",
    "Failing test triggers code paths requiring a working clone() on the StateService."
  }
}
```

- Evidentiary References:
  - Logged at “FAIL  api/api.test.ts > … mixed directives.”  
  - Specific log: “currentState.clone is not a function at line 5, column 10.”

---

### 1.4 “api/api.test.ts > Full Pipeline Integration > should handle the complete parse -> interpret -> convert pipeline”

```typescript
{
  testFile: "api/api.test.ts",
  testName: "SDK Integration Tests > Full Pipeline Integration > should handle the complete parse -> interpret -> convert pipeline",
  pattern: {
    setupSteps: [
      "Full pipeline test: parse the meld file, interpret it, then convert output",
      "Interpretation calls currentState.clone() (line 3, column 10 logged)"
    ],
    stateManagement: {
      usesClone: true,
      usesChildState: false,
      transformationEnabled: false
    },
    mockUsage: {
      mockType: "Full pipeline mocking (FileSystem, Path, etc.)",
      methodsCalled: []
    },
    failureType: "Missing clone() implementation / TypeError",
    errorMessage: "MeldInterpreterError: currentState.clone is not a function at line 3, column 10"
  },
  similarPassingTests: [
    "api/api.test.ts > Full Pipeline Integration > (skipped or passing cases that do not trigger clone())"
  ],
  keyDifferences: [
    "Failing test hits a code path that requires a functional clone() on the loaded StateService.",
    "Passing tests presumably avoid that path or have a stub that returns a valid cloned state."
  }
}
```

- Evidentiary References:
  - Logged at “FAIL  api/api.test.ts > … complete parse -> interpret -> convert pipeline.”  
  - “Line 3, column 10” indicates clone usage early in the interpret step.

---

### 1.5 “api/api.test.ts > Full Pipeline Integration > should preserve state and content in transformation mode”

```typescript
{
  testFile: "api/api.test.ts",
  testName: "SDK Integration Tests > Full Pipeline Integration > should preserve state and content in transformation mode",
  pattern: {
    setupSteps: [
      "Enable transformation mode on the state",
      "Call interpret(...) which invokes currentState.clone() (line 4, column 10 logged)"
    ],
    stateManagement: {
      usesClone: true,
      usesChildState: false,
      transformationEnabled: true  // Specifically mentions transformation mode
    },
    mockUsage: {
      mockType: "InterpreterService / transformation-enabled pipeline",
      methodsCalled: []
    },
    failureType: "Missing clone() implementation / TypeError",
    errorMessage: "MeldInterpreterError: currentState.clone is not a function at line 4, column 10"
  },
  similarPassingTests: [
    "services/StateService/StateService.transformation.test.ts > transformation toggling tests (which pass in logs)"
  ],
  keyDifferences: [
    "In the failing test, transformation is on, and the code expects a working clone() that copies transformation flags.",
    "The passing StateService transformation tests likely rely on a real clone() or do not call clone() at runtime."
  }
}
```

- Evidentiary References:
  - Logged at “FAIL  api/api.test.ts > … preserve state and content in transformation mode.”  
  - Error “currentState.clone is not a function at line 4, column 10.”

---

### 1.6 “services/DirectiveService/DirectiveService.test.ts > DirectiveService > Directive processing > Import directives > should process basic import”

```typescript
{
  testFile: "services/DirectiveService/DirectiveService.test.ts",
  testName: "DirectiveService > Directive processing > Import directives > should process basic import",
  pattern: {
    setupSteps: [
      "Load import directive from test data",
      "Invoke DirectiveService.processDirectives(...) on state"
    ],
    stateManagement: {
      usesClone: false,
      usesChildState: true,  // Evidence: import logic often calls createChildState()
      transformationEnabled: false
    },
    mockUsage: {
      mockType: "FileSystemService (mocking file existence)",
      methodsCalled: ["exists", "readFile"]
    },
    failureType: "Service mismatch / missing method on returned result object",
    errorMessage: "TypeError: result.getTextVar is not a function (line 145 in DirectiveService.test.ts)"
  },
  similarPassingTests: [
    "services/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts > basic importing"
  ],
  keyDifferences: [
    "Passing tests typically operate directly on the StateService or call getTextVar on the known state instance.",
    "Failing test calls getTextVar on 'result' (an unexpected object type), indicating a mismatch between the test’s assumptions and the actual returned structure."
  }
}
```

- Evidentiary References:
  - Logged at “FAIL  services/DirectiveService/DirectiveService.test.ts … should process basic import.”  
  - Lines shown in the log: “TypeError: result.getTextVar is not a function (services/DirectiveService/DirectiveService.test.ts:145:23).”  
  - The test code snippet on line 145:  
    ```typescript
    expect(result.getTextVar('greeting')).toBe('Hello');
    ```

---

### 1.7 “services/DirectiveService/DirectiveService.test.ts > DirectiveService > Directive processing > Import directives > should handle nested imports”

```typescript
{
  testFile: "services/DirectiveService/DirectiveService.test.ts",
  testName: "DirectiveService > Directive processing > Import directives > should handle nested imports",
  pattern: {
    setupSteps: [
      "Import multiple (nested) meld files in sequence",
      "DirectiveService merges child states back into the parent"
    ],
    stateManagement: {
      usesClone: false,
      usesChildState: true,
      transformationEnabled: false
    },
    mockUsage: {
      mockType: "FileSystemService (mocking multiple nested files)",
      methodsCalled: ["exists", "readFile"]
    },
    failureType: "Service mismatch / missing method on result",
    errorMessage: "TypeError: result.getTextVar is not a function (line 157 in DirectiveService.test.ts)"
  },
  similarPassingTests: [
    "services/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts > basic importing with nested includes"
  ],
  keyDifferences: [
    "Similar passing tests might return a real StateService object (with getTextVar).",
    "This failing test returns an unexpected type or partial object as 'result' from DirectiveService."
  }
}
```

- Evidentiary References:
  - Logged at “FAIL  services/DirectiveService/DirectiveService.test.ts … nested imports.”  
  - “Line 157: `expect(result.getTextVar('greeting')).toBe('Hello');` leads to TypeError.”

---

### 1.8 “services/OutputService/OutputService.test.ts > Transformation Mode > should use transformed nodes when transformation is enabled”

```typescript
{
  testFile: "services/OutputService/OutputService.test.ts",
  testName: "OutputService > Transformation Mode > should use transformed nodes when transformation is enabled",
  pattern: {
    setupSteps: [
      "Provide originalNodes including a directive that has a 'run' or 'echo test' output",
      "Enable transformation mode in the state (line ~385 of OutputService.test.ts per logs)"
    ],
    stateManagement: {
      usesClone: false,
      usesChildState: false,
      transformationEnabled: true
    },
    mockUsage: {
      mockType: "No explicit mocking shown in the log snippet",
      methodsCalled: []
    },
    failureType: "Assertion mismatch in transformed content",
    errorMessage: "AssertionError: expected 'echo test\\n' to be 'test output\\n' (line 385 in OutputService.test.ts)"
  },
  similarPassingTests: [
    "services/OutputService/OutputService.test.ts > LLM XML Output > should handle directives according to type"
  ],
  keyDifferences: [
    "Passing tests do not rely on substituting 'echo test' with 'test output'; they handle recognized directive transformations differently.",
    "The failing test expects a transformation that modifies 'echo test' into 'test output,' but that logic is not present or was not triggered."
  }
}
```

- Evidentiary References:
  - From the failure log: “Line 385: expect(output).toBe('test output\\n'); received 'echo test\\n'.”  
  - Indicates the transformation did not replace the directive text as expected.

---

### 1.9 “services/OutputService/OutputService.test.ts > Transformation Mode > should handle mixed content in transformation mode”

```typescript
{
  testFile: "services/OutputService/OutputService.test.ts",
  testName: "OutputService > Transformation Mode > should handle mixed content in transformation mode",
  pattern: {
    setupSteps: [
      "Input nodes: 'Before', a directive or code block 'echo test', and 'After'",
      "State transformation enabled, expecting 'echo test' to become 'test output'"
    ],
    stateManagement: {
      usesClone: false,
      usesChildState: false,
      transformationEnabled: true
    },
    mockUsage: {
      mockType: "No explicit mocking in snippet",
      methodsCalled: []
    },
    failureType: "Assertion mismatch in transformed content",
    errorMessage: "AssertionError: expected 'Before\\necho test\\nAfter\\n' to be 'Before\\ntest output\\nAfter\\n' (line 405 in OutputService.test.ts)"
  },
  similarPassingTests: [
    "services/OutputService/OutputService.test.ts > LLM XML Output > should preserve code fence content"
  ],
  keyDifferences: [
    "Passing code-fence tests only preserve the content, whereas failing test expects a transformation rewrite from 'echo test' to 'test output.'",
    "This mismatch suggests the transformation logic is incomplete or not invoked."
  }
}
```

- Evidentiary References:
  - Logged at “Line 405: expect(output).toBe('Before\\ntest output\\nAfter\\n').”  
  - The code only produced “Before\\necho test\\nAfter\\n.”

---

### 1.10 “services/OutputService/OutputService.test.ts > Transformation Mode > should handle LLM output in both modes”

```typescript
{
  testFile: "services/OutputService/OutputService.test.ts",
  testName: "OutputService > Transformation Mode > should handle LLM output in both modes",
  pattern: {
    setupSteps: [
      "Generate output in normal mode and in transformation mode",
      "Check if 'echo test' was replaced by 'test output'"
    ],
    stateManagement: {
      usesClone: false,
      usesChildState: false,
      transformationEnabled: true
    },
    mockUsage: {
      mockType: "No explicit mocking in snippet",
      methodsCalled: []
    },
    failureType: "Assertion mismatch in LLM output",
    errorMessage: "AssertionError: expected 'Before\\necho test\\nAfter' to contain 'test output' (line 468 in OutputService.test.ts)"
  },
  similarPassingTests: [
    "services/OutputService/OutputService.test.ts > LLM XML Output > should handle directives according to type"
  ],
  keyDifferences: [
    "The passing LLM XML tests handle recognized directive transformations (e.g., text, code fences).",
    "This failing test specifically wants 'echo test' replaced, which indicates an unimplemented or missing directive transformation."
  }
}
```

- Evidentiary References:
  - “Line 468: expected output to contain 'test output'; got 'echo test'.”  
  - Transformation logic apparently not applied or insufficient.

--------------------------------------------------------------------------------
## 2. Grouping the Failures by Pattern

The 10 failing tests can be grouped into four broader categories:

| Pattern Category                       | Tests                                                                                                                                                                                                                                      | Core Issue                                                                                                                                                   |
|----------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1. Missing clone() Implementation      | • (1.2) “api/api.test.ts > … execution directives”<br>• (1.3) “… complex meld content”<br>• (1.4) “… complete pipeline”<br>• (1.5) “… preserve state & content in transformation”                                                          | In each case, “currentState.clone is not a function.” A partial or stubbed StateService does not properly implement clone().                                 |
| 2. Transformation Mismatch in Output   | • (1.1) “api/api.test.ts > … definition directives”<br>• (1.8) “OutputService.test.ts > should use transformed nodes…”<br>• (1.9) “OutputService.test.ts > mixed content…”<br>• (1.10) “OutputService.test.ts > LLM output in both modes…” | Tests expect certain text or directive replacements (“echo test” → “test output”). The code that should do this transformation is incomplete or not invoked. |
| 3. Service Mismatch (Missing Method)   | • (1.6) “DirectiveService.test.ts > … basic import”<br>• (1.7) “DirectiveService.test.ts > … nested imports”                                                                                                                               | “result.getTextVar is not a function.” The test’s assumption about the returned object does not match the actual object shape.                               |
| 4. (None Observed) Mock Implementation | No failing tests in this batch appear to fail strictly due to mocking. Some do rely on mocks returning errors intentionally, but that is expected test behavior.                                                                           | —                                                                                                                                                            |

### Key Observations

1. Multiple “Missing clone()” failures indicate that the test is exercising interpret or transformation code paths which assume a valid StateService clone() exists. In logs:  
   - “currentState.clone is not a function” repeated in four separate tests (Sections 1.2, 1.3, 1.4, 1.5).

2. Transformation mismatches relate to unconverted “echo test” directives or “definition directives.” The test expects that transformation mode rewrites or removes certain directive text, but the actual code returns the original content.

3. The “DirectiveService” import tests fail because an unexpected return object (perhaps some partial object or void) is tested for a method getTextVar that does not exist.

4. No purely mock-based failures appear here. All test logs referencing file not found or invalid syntax are passing negative tests. The real failures revolve around missing or mismatched methods in actual service logic.

--------------------------------------------------------------------------------
## Next Steps and Action Items

1. Implement or fix the StateService.clone() method in all contexts:
   - Ensure that any custom build or partial environment also has the correct clone() code (lines ~324–350 in StateService.ts).
   - Update references so that “currentState.clone is not a function” no longer appears.

2. Validate and/or implement directive transformation logic for “echo test” → “test output” or similarly expected rewrites:
   - The failing OutputService transformation tests (sections 1.8, 1.9, 1.10) demonstrate that transformations are incomplete or not called.

3. Reconcile “result.getTextVar()” usage in DirectiveService tests:
   - Confirm what object is returned after import directives are processed. Either return a StateService-like object with a getTextVar method, or adapt the test assertions to the real shape of “result.”

4. For each failing test, confirm if the current test approach is correct:
   - If the code intentionally should not transform “echo test,” adjust the test expectations.
   - If it should transform, implement that transformation in the relevant service.

5. Double-check that no mock or partial stubs are overshadowing the real clone() or getTextVar() methods:
   - If so, remove or fix those stubs so the real service logic is tested.

--------------------------------------------------------------------------------
## References

• Line references from logs for each test failure:

- OutputService LLM failures: 
  - OutputService.ts lines 140–163 (conversion to Markdown / LLM XML).
- DirectiveService test failures:
  - DirectiveService.test.ts lines 145, 157 (“result.getTextVar is not a function”).
- StateService clone() calls:
  - “currentState.clone is not a function” reported at lines 1, 3, 4, 5 in multiple meld input files (api/api.test.ts).

All evidence above is grounded in the snippet logs, specifically the “FAIL” sections describing each test’s error message and the file/line references in the error stack.
