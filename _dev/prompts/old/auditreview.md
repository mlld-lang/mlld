<YourRole>
You are an expert in building reliable and maintainable DSL systems, particularly in structuring state interpreters.

You are passionate about SOLID architecture, taking methodical approaches, and making incremental and testable changes.

You're the architect for meld, an LLM prompt scripting language designed to make it easy to assemble complex context in modular ways using directives:

- @embed to embed text
- @run to run commands
- @define to create commands that can take parameters
- @path, @data, and @text variable types
- @import for importing variables and command definitions from other meld files

We have come a long way and you strongly want to ship meld. You're balancing pragmatism and a yagni spirit with a desire to have absolutely rock solid architecture that's going to serve as the foundation for a widely used open source project.
</YourRole>

In the course of building this project, we encountered some challenges with our DirectiveService, StateService, OutputService centered around the complexity of state tracking.

**Problem:**
- Meld's directive transformation system is failing in several ways:
  1. State management errors ("currentState.clone is not a function")
  2. Inconsistent directive transformation (raw directives like "@run [echo test]" showing up in output instead of their processed results)
  3. Mismatches between real service implementations and test mocks
  4. 7 failing tests (4 API tests, 3 OutputService transformation tests)

**Solution:**

- Align and fix three key components:
  1. Service Interfaces
     - Ensure IStateService interface matches actual implementation
     - Make all mocks fully implement the interface
     - Fix partial/incomplete mock implementations

  2. State Management
     - Properly implement state cloning
     - Ensure transformation state is preserved during cloning
     - Fix state inheritance in nested operations

  3. Transformation Rules
     - Establish consistent rules for directive transformation
     - Ensure directives are properly replaced with their output in transformation mode
     - Standardize how transformed nodes are handled across all services

Our current task is to review the work performed in the audit and create a detailed punchlist of the changes required to the current codebase.

\======= AUDIT

# Interface & Implementation Audit for StateService

Below is a detailed analysis of the StateService interface (IStateService.ts) and its implementation (StateService.ts), including method comparisons, usage patterns in production code, and notes about test coverage or mock usage.

--------------------------------------------------------------------------------
## 1. Method Inventory & Signature Comparison

This table compares all methods defined in IStateService (left) with the corresponding implementations in StateService (right). Line numbers refer to the code blocks provided in your snippet.

| IStateService                          | Approx. Line in IStateService.ts | StateService                                   | Approx. Line in StateService.ts | Match?  | Notes                                                                                  |
|----------------------------------------|-----------------------------------|-------------------------------------------------|---------------------------------|---------|----------------------------------------------------------------------------------------|
| getTextVar(name: string): string|undefined                            | L6-7                                   | getTextVar(name: string): string|undefined                            | L34-37                                 | Yes     | Signatures match exactly                                                              |
| setTextVar(name: string, value: string): void                          | L8-9                                   | setTextVar(name: string, value: string): void                           | L39-48                                 | Yes     | Signatures match exactly                                                              |
| getAllTextVars(): Map<string,string>                                    | L10-11                                 | getAllTextVars(): Map<string,string>                                    | L49-52                                 | Yes     | Matches                                                                               |
| getLocalTextVars(): Map<string,string>                                  | L12-13                                 | getLocalTextVars(): Map<string,string>                                  | L54-57                                 | Yes     | Matches                                                                               |
| getDataVar(name: string): any                                           | L15                                     | getDataVar(name: string): unknown                                      | L61-64                                 | Partial | Return type mismatch: Interface uses "any", Implementation uses "unknown"             |
| setDataVar(name: string, value: any): void                              | L16-17                                 | setDataVar(name: string, value: unknown): void                          | L66-74                                 | Partial | Parameter type mismatch: Interface uses "any", Implementation uses "unknown"          |
| getAllDataVars(): Map<string,any>                                       | L18-19                                 | getAllDataVars(): Map<string,unknown>                                   | L76-79                                 | Partial | Return type mismatch: "Map<string, any>" vs "Map<string, unknown>"                    |
| getLocalDataVars(): Map<string, any>                                    | L20-21                                 | getLocalDataVars(): Map<string,unknown>                                 | L81-84                                 | Partial | Same mismatch: "any" vs "unknown"                                                     |
| getPathVar(name: string): string|undefined                              | L23                                     | getPathVar(name: string): string|undefined                              | L88-91                                 | Yes     | Matches                                                                               |
| setPathVar(name: string, value: string): void                           | L24-25                                 | setPathVar(name: string, value: string): void                           | L93-96                                 | Yes     | Matches                                                                               |
| getAllPathVars(): Map<string, string>                                   | L26-27                                 | getAllPathVars(): Map<string, string>                                   | L98-102                                | Yes     | Matches                                                                               |
| getCommand(name: string): { command: string; options?: Record<string,unknown> } | L29                   | getCommand(name: string): { command: string; options?: Record<string,unknown> } | L105-110                               | Yes     | Matches                                                                               |
| setCommand(name: string, command: string|{command:string;options?:Record<string,unknown>}): void | L30-31        | setCommand(name: string, command: string|{command:string;options?:Record<string,unknown>}): void | L112-123                                | Yes     | Matches                                                                               |
| getAllCommands(): Map<string,{command:string;options?:Record<string,unknown>}> | L32-33      | getAllCommands(): Map<string,{command:string;options?:Record<string,unknown>}> | L125-139                               | Yes     | Matches                                                                               |
| getNodes(): MeldNode[]                                                  | L35                                     | getNodes(): MeldNode[]                                                 | L141-144                                | Yes     | Matches                                                                               |
| addNode(node: MeldNode): void                                           | L36-37                                 | addNode(node: MeldNode): void                                           | L158-171                                | Yes     | Matches                                                                               |
| appendContent(content: string): void                                    | L38-39                                 | appendContent(content: string): void                                    | L213-222                                | Yes     | Matches                                                                               |
| getTransformedNodes(): MeldNode[]                                       | L41-42                                 | getTransformedNodes(): MeldNode[]                                       | L146-149                                | Yes     | Matches                                                                               |
| setTransformedNodes(nodes: MeldNode[]): void                            | L43-44                                 | setTransformedNodes(nodes: MeldNode[]): void                            | L151-156                                | Yes     | Matches                                                                               |
| transformNode(original: MeldNode, transformed: MeldNode): void          | L45-46                                 | transformNode(original: MeldNode, transformed: MeldNode): void          | L173-188                                | Yes     | Matches                                                                               |
| isTransformationEnabled(): boolean                                      | L47-48                                 | isTransformationEnabled(): boolean                                      | L190-193                                | Yes     | Matches                                                                               |
| enableTransformation(enable: boolean): void                             | L49-50                                 | enableTransformation(enable: boolean): void                             | L195-211                                | Yes     | Matches                                                                               |
| addImport(path: string): void                                           | L52-53                                 | addImport(path: string): void                                           | L224-231                                | Yes     | Matches                                                                               |
| removeImport(path: string): void                                        | L54-55                                 | removeImport(path: string): void                                        | L233-240                                | Yes     | Matches                                                                               |
| hasImport(path: string): boolean                                        | L56-57                                 | hasImport(path: string): boolean                                        | L242-245                                | Yes     | Matches                                                                               |
| getImports(): Set<string>                                               | L58-59                                 | getImports(): Set<string>                                               | L247-252                                | Yes     | Matches                                                                               |
| getCurrentFilePath(): string|null                                       | L61-62                                 | getCurrentFilePath(): string|null                                       | L255-258                                | Yes     | Matches                                                                               |
| setCurrentFilePath(path: string): void                                  | L63-64                                 | setCurrentFilePath(path: string): void                                  | L260-263                                | Yes     | Matches                                                                               |
| hasLocalChanges(): boolean                                              | L66-67                                 | hasLocalChanges(): boolean                                              | L265-267                                | Yes     | Matches (Implementation always returns true)                                          |
| getLocalChanges(): string[]                                             | L68-69                                 | getLocalChanges(): string[]                                             | L269-272                                | Yes     | Matches (Implementation always returns ["state"])                                     |
| setImmutable(): void                                                    | L70-71                                 | setImmutable(): void                                                    | L275-277                                | Yes     | Matches                                                                               |
| isImmutable: boolean (read-only)                                        | L72-73                                 | get isImmutable(): boolean                                              | L279-282                                | Yes     | Implementation uses a getter_ property `_isImmutable`; consistent with read-only      |
| createChildState(): IStateService                                       | L74-75                                 | createChildState(): IStateService                                       | L284-290                                | Yes     | Matches                                                                               |
| mergeChildState(childState: IStateService): void                        | L76-77                                 | mergeChildState(childState: IStateService): void                        | L292-296                                | Yes     | Matches                                                                               |
| clone(): IStateService                                                  | L78-79                                 | clone(): IStateService                                                  | L298-334                                | Yes     | Matches                                                                               |

### Additional Implementation-Only Methods
• checkMutable(): void (line 336-340 in StateService.ts)
• updateState(updates: Partial<StateNode>, source: string): void (line 342-351 in StateService.ts)

These two methods are private/internal helpers (not in IStateService). No issues unless they are invoked externally, which they do not appear to be.

--------------------------------------------------------------------------------
## 2. Implementation vs. Usage in Production Code

Below are key observations on how StateService methods are used in the provided production code, primarily in DirectiveService and related directive handlers:

1. In DirectiveService.ts:
   • processDirectives (around line 244) calls "currentState.createChildState()" and "mergeChildState(updatedState)".
   • handleDataDirective (around line 419) calls "this.stateService!.setDataVar(directive.identifier, value)".
   • handleTextDirective (around line 354) calls "this.stateService!.setTextVar(directive.identifier, directive.value)".
   • handleImportDirective and handleEmbedDirective both create child states via "createChildState()" and eventually merge them. (See lines ~507-516 for embed, ~451-480 for import)

2. In various DirectiveHandlers (e.g., DataDirectiveHandler.ts, DefineDirectiveHandler.ts, PathDirectiveHandler.ts):
   • setDataVar, getDataVar, setTextVar, and setPathVar are used exactly as in the interface.
   • setCommand(...) is used in DefineDirectiveHandler (line ~67).
   • No calls to checkMutable() or updateState() from outside; they remain internal.

3. OutputService.ts frequently checks:
   • isTransformationEnabled() → lines ~56-59 in OutputService.ts.
   • getTransformedNodes() → lines ~57, ~60 in OutputService.ts.
   • getAllTextVars(), getAllDataVars() → lines ~141, ~151 for formatting the state in the output.

4. Implementation Parameter Types vs. Interface:
   • For data variables, the interface uses “any” while the implementation has “unknown”. No runtime breakage is observed in the usage, but it is a strict type mismatch in TypeScript terms.

5. Return Types in Usage:
   • No example found where the rest of the code depends on getDataVar(...) being “any” vs. “unknown”. Most consumption sites treat the value as a generic object or parse JSON from it.
   • No undocumented assumptions about getLocalChanges() or hasLocalChanges()—these return simple stubbed values but are not widely used in the directive logic.

Overall, there are no calls to methods that do not exist in the interface. All usage patterns align with the declared interface methods, except for the minor “any” vs. “unknown” mismatch on data variable methods.

--------------------------------------------------------------------------------
## 3. Test Coverage & Mock Usage

Based on the provided snippets:
• No dedicated test files or mocks for StateService are shown.
• There are no references in the provided code suggesting tests call methods outside the interface.
• No mocking examples of StateService appear in the snippet, so we cannot identify any inconsistencies between test mocks and the real interface.
• The test usage summary is inconclusive because no direct test code was included.

--------------------------------------------------------------------------------
## 4. Findings & Recommendations

1. Type Mismatch on Data Variables
   - Evidence: “getDataVar”, “setDataVar”, “getAllDataVars”, “getLocalDataVars” use “unknown” in StateService.ts (lines 61, 66, 76, 81) but “any” in IStateService.ts.
   - Impact: Potential TypeScript warnings or confusion for developers expecting “any” vs. “unknown”.
   - Recommendation: Standardize on one type across interface and implementation, preferably “unknown” or a narrower type as needed.

2. Private Methods (checkMutable, updateState)
   - Evidence: Lines 336 & 342 in StateService.ts.
   - Impact: None externally, but developer confusion if not strictly private.
   - Recommendation: Confirm these are marked “private” or “protected” in TypeScript to prevent external usage.

3. hasLocalChanges() and getLocalChanges() Hardcoded Behavior
   - Evidence: Lines 265 and 269 in StateService.ts always return “true” and [“state”].
   - Impact: Possibly incomplete state-change tracking. Currently no usage found that contradicts the interface, but it might be a placeholder.
   - Recommendation: Confirm the intended local-change detection logic or document that these methods are placeholders.

4. No Direct Test Coverage Observed
   - Evidence: No references to .spec/.test files or mocking frameworks that call StateService.
   - Impact: Potential test gap for verifying mutation, transformation, and import logic.
   - Recommendation: Add explicit coverage or provide test references to ensure consistent usage of each method.

--------------------------------------------------------------------------------
## 5. Conclusion

• Most of the IStateService interface is correctly implemented by StateService.
• All methods required by the interface exist with matching signatures, except for the minor type mismatch (“any” vs. “unknown” on data variable methods).
• No methods from the implementation are called externally that do not appear in the interface.
• The transformation-related methods (getTransformedNodes, setTransformedNodes, transformNode, enableTransformation) match exactly and are used in OutputService and directive code.
• No test or mock inconsistencies can be confirmed from the snippets provided.

--------------------------------------------------------------------------------
### Next Steps

• Align the interface with the implementation types for data variables (use either “any” or “unknown” consistently).
• Formalize local-change tracking if hasLocalChanges() and getLocalChanges() must do more than return placeholders.
• Ensure any private methods (updateState, checkMutable) remain inaccessible from outside.
• Add or reference tests that confirm correct usage of child states, transformation flags, and clone/merge behaviors.

--------------------------------------------------------------------------------
End of Audit.

-------------------------
Model: o1
System: _meld/audit/partials/auditor.md
Response:
## StateService Mock Audit

Because the provided file references (“/Users/adam/dev/meld/_meld/audit/services/StateService/IStateService.ts”, “/Users/adam/dev/meld/_meld/audit/services/StateService/StateService.ts”, and any mock/stub test files) could not be read, there is currently no accessible code to analyze. In compliance with your requirement to avoid speculation and remain evidence-based, the findings below reflect the unavailability of the source files. Where code is missing, the analysis is necessarily incomplete.

Nonetheless, this report outlines the structure of the requested audit, indicating the exact information that would be captured and reported if the relevant code were accessible.

---

## 1. Complete Mock Inventory

| Mock Name       | File Path              | Methods Implemented         | Matches IStateService?       | Notes                         |
|-----------------|------------------------|-----------------------------|------------------------------|-------------------------------|
| (No Data)       | (No Data)             | (No Data)                   | (No Data)                    | Source file not found         |

### Observations
- No mock/stub files were successfully read from the designated paths.
- Without concrete file contents, it is impossible to list or compare any discovered mocks with IStateService.

---

## 2. Mock Behavior Analysis

Because no mock implementations could be retrieved, the following sub-points illustrate the analysis that would normally be completed:

1. Checking clone() Implementation
   - We would check if each mock implements a “clone()” method as defined by IStateService (or if the real interface includes that method).
   - We would verify parameter usage, return types, and any transformation logic.

2. Transformation Mode Handling
   - If the interface or real service uses transformation modes, we would confirm that each mock handles these modes accurately (e.g., “edit” vs. “view” transforms).

3. Return Types Verification
   - We would ensure each mock method’s return type aligns with the expected return type in IStateService.

4. Simplified/Stubbed Behavior
   - We would note any method that simply returns static values or incomplete data structures, which might cause test contradictions.

Since no code is available, none of these verifications can be performed at this time.

---

## 3. Mapping Mock Usage in Failing Tests

| Test File                | Mock Used        | Usage Description        | Status/Finding                          |
|--------------------------|------------------|--------------------------|-----------------------------------------|
| (No Data)               | (No Data)        | (No Data)                | (No Data)                               |

### Observations
- No test files referencing StateService mocks were read successfully.
- With no test data, we cannot map which mocks are used, how they are injected, or whether they contribute to failing test scenarios.

---

## 4. Evidence and Code References

Below is how evidence would typically be presented if the code were available:

• File: “tests/services/MockStateService.ts”, Lines 45–52
  ```ts
  // Example of how references and line numbers would appear:
  public clone(): IStateService {
      // mock logic
  }
  ```
• File: “tests/services/StateService.spec.ts”, Lines 10–12
  ```ts
  // Example test usage referencing the mock
  const mockService = new MockStateService();
  expect(mockService.clone()).toBeDefined();
  ```

Because the files were not found or could not be read, we have no actual code snippets to display.

---

## Potential Architectural or Implementation Issues (Hypothetical)

If actual code were available, we would check for:

1. Inconsistent Parameter Definitions
   - Mocks might have different parameters than the interface requires.
2. Missing Methods
   - Mocks might omit required IStateService methods entirely.
3. Partial Implementations
   - Some mocks might only implement a subset of methods or rely on placeholders.
4. Contradictory Return Types
   - A clone() method returning non-IStateService objects, for example.

Without access to the actual code, these items remain purely hypothetical.

---

## Recommended Next Steps

1. Ensure All Source Files Are Accessible
   - Verify the paths and permissions for “/Users/adam/dev/meld/_meld/audit/services/StateService/…” and any test mock/stub files.
2. Re-run Audit with Correct File Paths
   - Once you have the correct file references, reattempt reading the code to produce a detailed, evidence-driven report.
3. Perform a Full Interface vs. Implementation Comparison
   - After retrieving the files, systematically compare IStateService method signatures to each mock’s methods.
4. Validate Test Coverage and Behavior
   - Identify which mocks are used in failing tests and confirm that test logic is consistent with the real StateService interface.

---

## Conclusion

No usable code artifacts were found at the specified paths. Consequently, this audit cannot verify method signatures, implementations, or test behavior. For a complete, evidence-based analysis—complete with line-by-line references, mock-to-interface comparisons, and failing test mappings—the actual StateService interface, real implementation, and mock files must be accessible. Once those files are located and readable, this report structure can be filled with precise findings, code snippets, and references to the relevant lines.

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
# Transformation Mode Audit

Below is a detailed, evidence-based analysis of the transformation mode implementation and usage within the provided Meld codebase. All findings reference specific lines from the shared code snippets. Where exact line numbers are approximate, they are marked with a tilde (e.g., “~line 125”).

--------------------------------------------------------------------------------
## Table of Contents
1. [Transformation State Management](#transformation-state-management)
   1.1 [Enabling Transformation](#enabling-transformation)
   1.2 [Propagation of the Mode Flag](#propagation-of-the-mode-flag)
   1.3 [State Persistence and clone() Behavior](#state-persistence-and-clone-behavior)
   1.4 [Issues / Observations](#issues--observations-1)

2. [Directive Transformation](#directive-transformation)
   2.1 [Run Directive Flow](#run-directive-flow)
   2.2 [Embed Directive Flow](#embed-directive-flow)
   2.3 [Node Replacement Logic](#node-replacement-logic)
   2.4 [Verification of Transformed Node Storage](#verification-of-transformed-node-storage)
   2.5 [Issues / Observations](#issues--observations-2)

3. [Output Generation](#output-generation)
   3.1 [Use of Transformed Nodes](#use-of-transformed-nodes)
   3.2 [Directive Removal in Output](#directive-removal-in-output)
   3.3 [Error Handling](#error-handling)
   3.4 [Issues / Observations](#issues--observations-3)

4. [Transformation Flow Diagram](#transformation-flow-diagram)

5. [Transformation Flags & Checks](#transformation-flags--checks)

6. [Summary of Findings & Next Steps](#summary-of-findings--next-steps)

--------------------------------------------------------------------------------
## 1. Transformation State Management

### 1.1 Enabling Transformation

• In StateService.ts, the private boolean flag “_transformationEnabled” is declared around line 13.
• The method “enableTransformation(enable: boolean)” (~line 146) updates this flag:

```typescript
(Approx lines 146-159 in StateService.ts)
enableTransformation(enable: boolean): void {
  if (this._transformationEnabled === enable) {
    return;
  }
  this._transformationEnabled = enable;

  // Initialize transformed nodes if enabling
  if (enable) {
    this.updateState({
      transformedNodes: [...this.currentState.nodes]
    }, 'enableTransformation');
  }
}
```

• When enabling is set to true, the code immediately copies the current “nodes” array into “transformedNodes,” ensuring that there is a starting snapshot for transformation.

### 1.2 Propagation of the Mode Flag

• The flag is checked in multiple places. For instance, in “transformNode(original, transformed)” (~line 122), the method returns early if `!this._transformationEnabled`.
• The output layer (OutputService.ts) also checks “state.isTransformationEnabled()” (~line 51 in OutputService.ts) before deciding whether to use transformed nodes.

### 1.3 State Persistence and clone() Behavior

• The “clone()” method is at ~lines 304–338 in StateService.ts. It copies both the `_transformationEnabled` and `_isImmutable` flags:

```typescript
(Approx lines 334-339 in StateService.ts)
cloned._isImmutable = this._isImmutable;
cloned._transformationEnabled = this._transformationEnabled;
```

• This ensures that a cloned state service preserves the transformation mode exactly.
• Persistent state changes (e.g., text variables, data variables, etc.) are likewise mirrored through the “updateState” mechanism.

### 1.4 Issues / Observations

1. If transformation is disabled, calls to “transformNode” (~line 122) effectively do nothing, which can lead to partial or unexpected transformations if the caller assumed the transform would always happen.
2. By default, “enableTransformation(true)” always reinitializes “transformedNodes” from “nodes,” ignoring any prior transformations (line ~153). This is by design, but it means re-enabling transformation overwrites prior partial transformations.
3. In “clone()” (~line 334), copying `_transformationEnabled` can result in the clone having the same transformation state, even if the user wants a “fresh” state that is not transformed. This appears intentional but might need to be documented more clearly.

--------------------------------------------------------------------------------
## 2. Directive Transformation

### 2.1 Run Directive Flow

• The actual “RunDirectiveHandler” code is not present, but from the test logs (e.g., “RunDirectiveHandler.transformation.test.ts > transformation behavior > should preserve error handling…”), we see transformations are tested and do pass.
• The logs imply that when transformation is on, the run directive is eventually replaced or has its nodes transformed (or an error is thrown if something fails).

### 2.2 Embed Directive Flow

• Similarly, “EmbedDirectiveHandler” is not in the provided snippet. Tests for embed directives (e.g., “EmbedDirectiveHandler.transformation.test.ts”) also pass without direct code here.
• We can infer that embed directives are transformed into textual or code-fence nodes, or else some content is appended to the state via “appendContent()” (~line 184 in StateService.ts).

### 2.3 Node Replacement Logic

• “StateService.transformNode(original, transformed)” (~lines 122–143) searches for the original node in the active “transformedNodes” array (or falls back to “nodes” if “transformedNodes” is null, though the code sets it before usage if enabled).
• If the original node is found, it is replaced with the new node:

```typescript
(Approx lines 127-139 in StateService.ts)
const index = transformedNodes.findIndex(node => node === original);
if (index === -1) {
  throw new Error('Cannot transform node: original node not found');
}

const updatedNodes = [...transformedNodes];
updatedNodes[index] = transformed;
this.updateState({
  transformedNodes: updatedNodes
}, 'transformNode');
```

• An error is thrown if the original node does not exist in that array, guarding against invalid transformations.

### 2.4 Verification of Transformed Node Storage

• Once `_transformationEnabled` is set, any new transformations update the “transformedNodes” array in place (~line 139).
• The “getTransformedNodes()” method (~line 52) returns either the “transformedNodes” array if it exists or “nodes” if transformation is not enabled, ensuring consistent downstream usage.

### 2.5 Issues / Observations

1. No direct code for “RunDirectiveHandler” or “EmbedDirectiveHandler” was located, so we cannot confirm the full transformation logic in these handlers. Tests pass, but the process is opaque from the snippet.
2. If a directive node is never replaced or removed, it may remain in `transformedNodes`. However, from the output code in OutputService (~line 156), any directive still present in the “transformedNodes” array causes an error, prompting forced replacement or removal.

--------------------------------------------------------------------------------
## 3. Output Generation

### 3.1 Use of Transformed Nodes

• In OutputService.ts “convert()” (~lines 50–66), the code chooses either `state.getTransformedNodes()` if transformation is enabled (and not empty) or the original node list:

```typescript
(Approx lines 57-62 in OutputService.ts)
const nodesToProcess = state.isTransformationEnabled() && state.getTransformedNodes().length > 0
  ? state.getTransformedNodes()
  : nodes;
```

### 3.2 Directive Removal in Output

• The private method “nodeToMarkdown()” (~lines 140–185) specifically checks if `isTransformed` is `true` and throws an error if it encounters a directive node. This ensures that once transformation mode is active, directive nodes must have been removed or replaced:

```typescript
(Approx lines 156-161 in OutputService.ts)
case 'Directive':
  if (isTransformed) {
    throw new MeldOutputError('Unexpected directive in transformed nodes', 'markdown');
  }
  ...
```

• This mechanism effectively forces “directive removal” or “directive transformation” prior to final output.

### 3.3 Error Handling

• If the converter (e.g., “convertToMarkdown”) cannot process a node or if a directive remains, a MeldOutputError is thrown (~line 161).
• The test logs confirm that transformation-phase errors (e.g., invalid command or missing file) are logged consistently but do not appear to be output generation failures unless leftover directives remain in the final stage.

### 3.4 Issues / Observations

1. The code will throw an error if any directive node remains in a transformed array, so any partial transformation leaves the system in a failing state.
2. Test logs show multiple directive error messages, but none for transformation as such, indicating that these run-time directive fails are separate from the output’s transformation checks.

--------------------------------------------------------------------------------
## 4. Transformation Flow Diagram

Below is a high-level textual diagram illustrating how transformation mode is triggered and how transformed nodes flow into the output.

```
┌─────────────────────┐
│  [Directive Handler]│ (e.g. RunDirectiveHandler, EmbedDirectiveHandler)
└───────────┬─────────┘
            │ 1) parse or interpret directive
            │
            v
┌──────────────────────────────────────┐
│ StateService.enableTransformation() │
│  - sets _transformationEnabled=true │
│  - copies nodes into transformedNodes
└───────────┬─────────────────────────┘
            │ 2) transformations
            v
┌─────────────────────────────────────────────┐
│ StateService.transformNode(original, new)  │
│  - checks if _transformationEnabled        │
│  - replaces node in transformedNodes       │
└───────────┬─────────────────────────────┬──┘
            │                             │
            │ 3) output processing        │
            v                             v
┌─────────────────────────────────────────────────┐
│ OutputService.convert(nodes, state, format)    │
│  - if transformation is enabled, uses          │
│    state.getTransformedNodes() instead of nodes│
│  - nodeToMarkdown() throws if directive found  │
└─────────────────────────────────────────────────┘
```

--------------------------------------------------------------------------------
## 5. Transformation Flags & Checks

Below is a comparison table of relevant internal flags and how they are checked.

| Flag/Method Name          | Purpose                                                                        | Location in Code                |
|---------------------------|--------------------------------------------------------------------------------|---------------------------------|
| _transformationEnabled    | Indicates whether transformation is active.                                    | StateService.ts (~line 13)      |
| isTransformationEnabled() | Public getter returning `_transformationEnabled`.                              | StateService.ts (~line 142)     |
| enableTransformation()    | Activates or deactivates transformation, reinitializes transformedNodes if on. | StateService.ts (~line 146)     |
| transformNode()           | Replaces a node only if `_transformationEnabled` is true.                      | StateService.ts (~line 122)     |
| clone()                   | Copies `_transformationEnabled` to the new state object.                        | StateService.ts (~line 304)     |

Key checks in code:
• transformNode(...) returns immediately if `_transformationEnabled === false`.
• OutputService.convert(...) decides which array (original vs. transformed) to process based on `isTransformationEnabled()`.
• nodeToMarkdown(...) raises an error if transformations remain incomplete and a directive node is still present in what should be a fully transformed array.

--------------------------------------------------------------------------------
## 6. Summary of Findings & Next Steps

Below is a concise list of each issue or observation, along with recommended follow-up actions.

1. Partial Transformations When Disabled
   • Description: If “transformNode” is called while `_transformationEnabled = false`, the transformation is skipped with no warning.
   • Evidence: See StateService.ts ~line 123 (return if `!_transformationEnabled`).
   • Next Steps: Consider logging a warning or throwing if transformations are attempted while disabled.

2. Automatic Reinitialization of “transformedNodes”
   • Description: Calling `enableTransformation(true)` more than once discards any existing transformations.
   • Evidence: StateService.ts ~line 153: newly copies `this.currentState.nodes`.
   • Next Steps: Decide if re-enabling transformation should preserve or overwrite prior transformations.

3. Directive Must Be Removed or Replaced Prior to Output
   • Description: OutputService throws an error if a directive node remains in “transformedNodes.”
   • Evidence: OutputService.ts ~line 156, “throw new MeldOutputError('Unexpected directive...')” if `isTransformed`.
   • Next Steps: Ensure directive handlers always replace directive nodes or disable transformation if directives must remain.

4. Cloning Behavior Inherits Transformation State
   • Description: clone() replicates `_transformationEnabled` in the new instance.
   • Evidence: StateService.ts ~line 334.
   • Next Steps: Confirm that this is the desired behavior or provide a parameter to force transformation to be turned off in the clone.

5. Potential Gap in Directive Handler Code
   • Description: The transformation logic in “RunDirectiveHandler” and “EmbedDirectiveHandler” is tested but not visible in the snippet.
   • Evidence: Test logs referencing “RunDirectiveHandler...transformation.test.ts” pass, but we cannot confirm logic from code.
   • Next Steps: Review actual directive handler code to confirm correct node replacement (e.g., turning directives into text or code fences).

--------------------------------------------------------------------------------

Please note that no untested code paths specific to transformation mode were clearly identified; tests regarding transformation and error handling are passing. However, verifying the full directive transformation logic requires reviewing the missing DirectiveHandler files. The above findings are based solely on the provided code and logs.

If you have further questions about specific transformations, partial or incremental transformations, or want deeper integration tests, you might implement additional test cases explicitly toggling transformation mode mid-operation and examining resulting node arrays.

---

End of Transformation Mode Audit.

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

\=== ANALYSIS

# Detailed Method Inventory: Transformation & State Management

Below is an evidence‐based inventory of only the transformation‐related and state‐management methods in “IStateService.ts” and “StateService.ts,” along with line references and observations about copying behavior. All line numbers refer to the snippets provided in your request.

--------------------------------------------------------------------------------
## 1. Transformation Methods

These methods control or respond to node transformation states.
Each entry follows the requested JSON structure:

--------------------------------------------------------------------------------
### getTransformedNodes

• Interface: IStateService.ts (lines 41-42)
• Implementation: StateService.ts (lines 146-149)

```json
{
  "name": "getTransformedNodes",
  "signature": "getTransformedNodes(): MeldNode[]",
  "inInterface": true,
  "inImplementation": true,
  "transformationFlags": [],
  "stateModification": [],
  "usageCount": 0
}
```

EVIDENCE & NOTES
• Code excerpt (StateService.ts, L146-149):
  » return this.currentState.transformedNodes ? […this.currentState.transformedNodes] : […this.currentState.nodes];
• No mention of _transformationEnabled. Purely read‐only.
• No usage within StateService.ts snippet.

--------------------------------------------------------------------------------
### setTransformedNodes

• Interface: IStateService.ts (lines 43-44)
• Implementation: StateService.ts (lines 151-156)

```json
{
  "name": "setTransformedNodes",
  "signature": "setTransformedNodes(nodes: MeldNode[]): void",
  "inInterface": true,
  "inImplementation": true,
  "transformationFlags": [],
  "stateModification": [
    "currentState.transformedNodes"
  ],
  "usageCount": 0
}
```

EVIDENCE & NOTES
• Code excerpt (StateService.ts, L151-156):
  » this.checkMutable();
  » this.updateState({ transformedNodes: […nodes] }, 'setTransformedNodes');
• No direct usage found in the snippet.

--------------------------------------------------------------------------------
### transformNode

• Interface: IStateService.ts (lines 45-46)
• Implementation: StateService.ts (lines 173-188)

```json
{
  "name": "transformNode",
  "signature": "transformNode(original: MeldNode, transformed: MeldNode): void",
  "inInterface": true,
  "inImplementation": true,
  "transformationFlags": [
    "_transformationEnabled"
  ],
  "stateModification": [
    "currentState.transformedNodes"
  ],
  "usageCount": 0
}
```

EVIDENCE & NOTES
• Code excerpt (StateService.ts, L179-181):
  » if (!this._transformationEnabled) {
  »   return;
  » }
• Modifies the transformedNodes array if transformation is enabled.
• Not invoked anywhere within the snippet.

--------------------------------------------------------------------------------
### isTransformationEnabled

• Interface: IStateService.ts (lines 47-48)
• Implementation: StateService.ts (lines 190-193)

```json
{
  "name": "isTransformationEnabled",
  "signature": "isTransformationEnabled(): boolean",
  "inInterface": true,
  "inImplementation": true,
  "transformationFlags": [
    "_transformationEnabled"
  ],
  "stateModification": [],
  "usageCount": 0
}
```

EVIDENCE & NOTES
• Code excerpt (StateService.ts, L190-193):
  » return this._transformationEnabled;
• Read‐only check, no state change.

--------------------------------------------------------------------------------
### enableTransformation

• Interface: IStateService.ts (lines 49-50)
• Implementation: StateService.ts (lines 195-211)

```json
{
  "name": "enableTransformation",
  "signature": "enableTransformation(enable: boolean): void",
  "inInterface": true,
  "inImplementation": true,
  "transformationFlags": [
    "_transformationEnabled"
  ],
  "stateModification": [
    "currentState.transformedNodes"
  ],
  "usageCount": 0
}
```

EVIDENCE & NOTES
• Code excerpt (StateService.ts, L205-209):
  » if (enable) {
  »   this.updateState({ transformedNodes: […this.currentState.nodes] }, 'enableTransformation');
  » }
• Sets _transformationEnabled and may (re)initialize transformedNodes.
• Not invoked within this snippet.

--------------------------------------------------------------------------------
## 2. State Management Methods

These methods handle cloning, child states, immutability, and basic “local changes” checks.
Each entry follows the requested JSON structure, noting deep vs. shallow copying.

--------------------------------------------------------------------------------
### createChildState

• Interface: IStateService.ts (lines 74-75)
• Implementation: StateService.ts (lines 284-290)

```json
{
  "name": "createChildState",
  "signature": "createChildState(): IStateService",
  "inInterface": true,
  "inImplementation": true,
  "deepCopyFields": [],
  "shallowCopyFields": [],
  "usageCount": 0
}
```

EVIDENCE & NOTES
• Code excerpt (StateService.ts, L287-288):
  » const child = new StateService(this);
  » return child;
• Does not directly copy fields; references parent state via constructor.

--------------------------------------------------------------------------------
### mergeChildState

• Interface: IStateService.ts (lines 76-77)
• Implementation: StateService.ts (lines 292-296)

```json
{
  "name": "mergeChildState",
  "signature": "mergeChildState(childState: IStateService): void",
  "inInterface": true,
  "inImplementation": true,
  "deepCopyFields": [],
  "shallowCopyFields": [],
  "usageCount": 0
}
```

EVIDENCE & NOTES
• Code excerpt (StateService.ts, L295):
  » this.currentState = this.stateFactory.mergeStates(this.currentState, child.currentState);
• Actual merging logic is in StateFactory (not shown). Unable to confirm deep vs. shallow merges.

--------------------------------------------------------------------------------
### clone

• Interface: IStateService.ts (lines 78-79)
• Implementation: StateService.ts (lines 298-334)

```json
{
  "name": "clone",
  "signature": "clone(): IStateService",
  "inInterface": true,
  "inImplementation": true,
  "deepCopyFields": [],
  "shallowCopyFields": [
    "variables.text",
    "variables.data",
    "variables.path",
    "commands",
    "nodes",
    "transformedNodes",
    "imports"
  ],
  "usageCount": 0
}
```

EVIDENCE & NOTES
• Code excerpt (StateService.ts, L313-321):
  » variables: {
  »   text: new Map(this.currentState.variables.text),
  »   data: new Map(this.currentState.variables.data),
  »   path: new Map(this.currentState.variables.path)
  » },
  » commands: new Map(this.currentState.commands),
  » nodes: […this.currentState.nodes],
  » transformedNodes: this.currentState.transformedNodes ? […this.currentState.transformedNodes] : undefined,
  » imports: new Set(this.currentState.imports)
• All Maps and Sets get new containers (shallow copies of entries). Actual nested objects or data remain references.

--------------------------------------------------------------------------------
### setImmutable

• Interface: IStateService.ts (lines 70-71)
• Implementation: StateService.ts (lines 275-277)

```json
{
  "name": "setImmutable",
  "signature": "setImmutable(): void",
  "inInterface": true,
  "inImplementation": true,
  "deepCopyFields": [],
  "shallowCopyFields": [],
  "usageCount": 0
}
```

EVIDENCE & NOTES
• Code excerpt (StateService.ts, L275-277):
  » this._isImmutable = true;
• No copying performed. Prevents further modifications.

--------------------------------------------------------------------------------
### hasLocalChanges

• Interface: IStateService.ts (lines 66-67)
• Implementation: StateService.ts (lines 265-267)

```json
{
  "name": "hasLocalChanges",
  "signature": "hasLocalChanges(): boolean",
  "inInterface": true,
  "inImplementation": true,
  "deepCopyFields": [],
  "shallowCopyFields": [],
  "usageCount": 0
}
```

EVIDENCE & NOTES
• Code excerpt (StateService.ts, L265-267):
  » return true;
• Stub implementation only. No data copying.

--------------------------------------------------------------------------------
### getLocalChanges

• Interface: IStateService.ts (lines 68-69)
• Implementation: StateService.ts (lines 269-272)

```json
{
  "name": "getLocalChanges",
  "signature": "getLocalChanges(): string[]",
  "inInterface": true,
  "inImplementation": true,
  "deepCopyFields": [],
  "shallowCopyFields": [],
  "usageCount": 0
}
```

EVIDENCE & NOTES
• Code excerpt (StateService.ts, L269-272):
  » return ["state"];
• Also a stub. No copying or real diff tracking.

--------------------------------------------------------------------------------
## 3. Observations & Recommendations

1. All transformation methods are correctly present in both interface and implementation.
   • No direct usage surfaced in the snippet for transformNode, getTransformedNodes, setTransformedNodes, isTransformationEnabled, or enableTransformation.

2. The “clone()” method performs shallow copying of all state fields.
   • Evidence: new Map(...) and new Set(...) only replicate references for nested objects.
   • Recommendation: If true deep copying is needed (e.g., for nested objects in data variables), consider a more thorough approach.

3. “mergeChildState()” calls StateFactory’s mergeStates, but the snippet does not show if merging is deep or shallow.
   • Recommendation: Confirm the final structure after merging if child states contain references or complex objects.

4. “hasLocalChanges()” and “getLocalChanges()” are hardcoded, returning “true” and [“state”].
   • Recommendation: Implement or document these stubs if real local‐change tracking is required.

5. “createChildState()” references the parentState but does not copy any fields itself.
   • Recommendation: Verify the intended inheritance or layering approach in StateFactory.

6. “setImmutable()” effectively locks further modification by throwing errors in checkMutable().
   • No direct conflict found, but confirm that external callers respect the error path.

--------------------------------------------------------------------------------
# End of Method Inventory

All findings are derived strictly from the code references above. No external assumptions or tests were provided, so usage counts reflect only the immediate snippet. Please review these recommendations where deeper or specialized copying may be required.

# Mock Implementation Coverage Analysis

Below is an evidence-based report focusing on the coverage of key transformation and state management methods in any StateService mocks. Because no actual mock files were provided (see the “=== MOCK IMPLEMENTATIONS ===” section, which resulted in an error reading files), this analysis cannot list or compare real mock code. Instead, this report provides:

1. A placeholder “Mock Coverage Matrix” (currently empty due to missing mock data).
2. References to the real StateService.ts implementation (lines 1–304) that shows how each critical method is defined.
3. Guidance on where mock implementations would be expected to align with the real code.

All line numbers in this report refer to the “StateService.ts” snippet included in your request.

---

## 1. Mock Coverage Matrix

Since no mock files were successfully read, the table below contains placeholders only. It shows the structure of how any discovered mocks would be compared to the real interface.

| mockFile                    | mockName                  | criticalMethods                                                                                                 | testFiles        | testCases        |
|----------------------------|---------------------------|------------------------------------------------------------------------------------------------------------------|------------------|------------------|
| (No Data)                  | (No Data)                 | clone: { implemented: (No Data), matchesReal: (No Data), differences: [] }<br>createChildState: … etc. (No Data)| (No Data)        | (No Data)        |

### Observations

- No mock or stub files could be analyzed, so each row in the table is marked as “No Data”.
- If mock code were available, each method below (clone, createChildState, enableTransformation, etc.) would be examined line-by-line against the real StateService interface.

---

## 2. Critical Methods in the Real “StateService.ts”

Below is a quick reference to the actual lines in StateService.ts (lines 1–304) for the methods most relevant to transformation and state management. Mocks should align with these signatures and behaviors:

1. clone (line 267–292):
   - Creates a new instance of StateService, copying all properties from the original (line 270).
   - Initializes a fresh state via StateFactory (line 270–273).
   - Copies variables, commands, nodes, transformedNodes, and imports (lines 275–285).
   - Retains immutability and transformation flags (lines 288–289).

2. createChildState (line 252–259):
   - Creates a new StateService instance that references the current state as its parent (line 253).
   - Logs creation details (line 254–257).
   - Returns an instance of IStateService (line 258).

3. enableTransformation (line 176–189):
   - Toggles _transformationEnabled (line 180).
   - Optionally initializes transformedNodes to a copy of nodes if enabling (lines 183–188).

4. transformNode (line 153–170):
   - Only applies if _transformationEnabled is true (line 155–157).
   - Locates the original node (line 160–161) and replaces it with the transformed version (line 166–169).

5. setTransformedNodes (line 132–137):
   - Directly sets the currentState’s transformedNodes[] with a new array (line 135).

6. addNode (line 139–151):
   - Appends a new node to the currentState’s nodes array (line 142).
   - Also appends to transformedNodes if transformations are enabled (lines 145–148).

7. mergeChildState (line 261–265):
   - Merges childState’s data into the currentState via StateFactory (line 264).

8. isTransformationEnabled (line 172–174):
   - Returns the internal boolean _transformationEnabled (line 173).

### Why These Methods Are “Critical”
All of these methods directly affect how data or transformation workflows evolve within StateService. Mocks must consistently replicate this behavior—especially if tests rely on transformation toggles, node transformations, or the ability to clone and chain states.

---

## 3. Where Mocks Should Match the Real Implementation

If mock code were accessible, each critical method would be checked against:

• Parameter signatures:
  - For example, does the mock’s clone() method return an object conforming to IStateService?
• Return types:
  - Ensure the mock claims to return the same shape (e.g., returning an IStateService instead of a raw object).
• Behavioral contracts:
  - Mocks must enforce immutability rules if setImmutable() has been called (line 244–246).
  - Mocks must handle transformation checks (isTransformationEnabled, line 172–174) consistently.

---

## 4. Potential Missing or Incomplete Mock Implementations

Since the actual mock files were not found, we cannot list any missing methods. Were mocks available, findings could include:

1. clone() not returning a new IStateService instance or ignoring state variables.
2. enableTransformation() missing logic to copy nodes into transformedNodes.
3. transformNode() not throwing an error when original node is not found.
4. createChildState() returning a plain object instead of a functional IStateService.

In each case, we would specify:
• The exact file and line number in the mock.
• The discrepancy from the real method.
• Specific test files impacted.

---

## 5. Recommendations and Next Steps

1. Locate Missing Mock Files
   - Confirm the file paths for your mock/stub test files.
   - Ensure version control or file system references match the actual project structure.

2. Compare Mocks to the Real Code
   - Once located, do a method-by-method comparison (clone, createChildState, enableTransformation, etc.) against the real StateService.

3. Validate Test Coverage
   - Identify tests that rely on transformations or state cloning.
   - Ensure that each test uses a mock replicating the real StateService’s logic, especially for immutability checks and node transformations.

4. Document Each Discrepancy with Evidence
   - For every mismatch, reference the exact line in the mock and the corresponding line in StateService.ts.
   - Clarify any differences in parameter usage, return types, and internal checks.

---

## Conclusion

Because no mock or stub files were accessible, this audit cannot display a detailed coverage matrix for how mocks implement clone(), createChildState(), enableTransformation(), transformNode(), or other critical methods. The real implementation in “StateService.ts” (lines 1–304) provides a comprehensive set of behaviors that mocks must replicate to ensure consistent testing and transformation workflows. Once actual mock files are retrieved, re-run this audit with the correct paths to produce a full, line-by-line coverage matrix and identify any specific gaps or inconsistencies in the mock implementations.

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

# Detailed Method Inventory: Transformation & State Management

Below is an inventory of only the transformation-related and state-management methods found in IStateService and their corresponding implementation in StateService. All line numbers refer to the provided interface (IStateService.ts) and implementation (StateService.ts) snippets.

--------------------------------------------------------------------------------
## 1. Transformation-Related Methods

These methods govern how nodes are transformed and whether transformation features are enabled.

| Name                   | Signature                                                      | In Interface? | Interface Lines | In Implementation? | Implementation Lines | transformationFlags                | stateModification                                              | usageCount |
|------------------------|---------------------------------------------------------------|---------------|-----------------|--------------------|----------------------|-------------------------------------|----------------------------------------------------------------|-----------|
| getTransformedNodes    | getTransformedNodes(): MeldNode[]                            | Yes           | 41–42           | Yes                | 146–149             | []                                  | [] (read-only)                                                | 0         |
| setTransformedNodes    | setTransformedNodes(nodes: MeldNode[]): void                | Yes           | 43–44           | Yes                | 151–156             | []                                  | [transformedNodes]                                            | 0         |
| transformNode          | transformNode(original: MeldNode, transformed: MeldNode): void | Yes           | 45–46         | Yes                | 173–188             | [_transformationEnabled]            | [transformedNodes]                                            | 0         |
| isTransformationEnabled| isTransformationEnabled(): boolean                           | Yes           | 47–48           | Yes                | 190–193             | [_transformationEnabled]            | [] (read-only)                                                | 0         |
| enableTransformation   | enableTransformation(enable: boolean): void                  | Yes           | 49–50           | Yes                | 195–211             | [_transformationEnabled]            | [transformedNodes (initialized if enable == true)]            | 0         |

### Evidence from Code

• IStateService.ts (lines 41–50):
  » Declares the five transformation methods above.
• StateService.ts (lines 146–211):
  » Implements each method, referencing the class-internal “_transformationEnabled” flag and “transformedNodes” array.

--------------------------------------------------------------------------------
## 2. State-Management Methods

These methods handle immutability, child-state creation, merging, cloning, and local-change tracking.

| Name             | Signature                                                | In Interface? | Interface Lines | In Implementation? | Implementation Lines | deepCopyFields                                        | shallowCopyFields                                                                      | usageCount |
|------------------|----------------------------------------------------------|---------------|-----------------|--------------------|----------------------|-------------------------------------------------------|----------------------------------------------------------------------------------------|-----------|
| createChildState | createChildState(): IStateService                        | Yes           | 74–75           | Yes                | 284–290             | []                                                    | []                                                                                     | 0         |
| mergeChildState  | mergeChildState(childState: IStateService): void         | Yes           | 76–77           | Yes                | 292–296             | Unknown (handled by stateFactory.mergeStates)         | Unknown (depends on internal merges)                                                   | 0         |
| clone            | clone(): IStateService                                   | Yes           | 78–79           | Yes                | 298–334             | []                                                    | [variables.text, variables.data, variables.path, commands, nodes, transformedNodes, imports] | 0         |
| setImmutable     | setImmutable(): void                                     | Yes           | 70–71           | Yes                | 275–277             | []                                                    | []                                                                                     | 0         |
| hasLocalChanges  | hasLocalChanges(): boolean                               | Yes           | 66–67           | Yes                | 265–267             | []                                                    | []                                                                                     | 0         |
| getLocalChanges  | getLocalChanges(): string[]                              | Yes           | Yes (68–69)     | Yes                | 269–272             | []                                                    | []                                                                                     | 0         |

### Deep vs. Shallow Copy Details

• createChildState (lines 284–290):
  – No direct copying. Instantiates a new StateService with a reference to the parent’s currentState as a parent pointer.
• mergeChildState (lines 292–296):
  – Invokes this.stateFactory.mergeStates(...) (not shown), so exact copy depth cannot be confirmed.
• clone (lines 298–334):
  – Creates new Map/Set/Array containers for text, data, path, commands, nodes, transformedNodes, and imports.
  – The individual MeldNode objects, command definitions, or strings remain the same references (shallow copy).
• setImmutable (lines 275–277):
  – Simply sets “this._isImmutable = true”; no copying.
• hasLocalChanges/getLocalChanges (lines 265–272):
  – Returns stub values; no copying or modifications.

### Evidence from Code

• IStateService.ts (lines 66–79):
  » Declares hasLocalChanges, getLocalChanges, setImmutable, createChildState, mergeChildState, and clone.
• StateService.ts (lines 265–296, 298–334):
  » Implements each method. “clone” creates new containers but references the same underlying data, resulting in shallow copies.

--------------------------------------------------------------------------------
## Usage Counts

In the provided snippet (StateService.ts alone), none of these methods are invoked internally (beyond their own definitions). Hence, all have a current usageCount of 0 based on this file. External usage (e.g., from other services or tests) was not available in the snippet.

--------------------------------------------------------------------------------
## Notable Observations

• All transformation methods match exactly between interface and implementation.
• The clone() method performs shallow copies of collection containers (Maps, Sets, Arrays).
• mergeChildState delegates merging logic to stateFactory.mergeStates, which is not shown.

No incomplete or contradictory implementations were identified in the snippet itself. Further verification may be required against test files or other services that call these methods.

--------------------------------------------------------------------------------
End of Inventory.

# 1. Transformation & State Management Method Inventory

Below is a focused inventory of only the transformation-related and state-management-related methods in StateService, with line references drawn from the provided StateService.ts snippet. All usage counts are based on searching within the same snippet (i.e., there are no internal calls to these methods in the snippet itself). No external code was provided that invokes them, so usageCount is listed as 0 for each.

--------------------------------------------------------------------------------
## 1.1 Transformation-Related Methods

For each transformation-related method, we provide:
• Name
• Signature (as declared in the snippet)
• Whether it appears in the IStateService interface and in the StateService implementation
• Any transformation-related flags used
• Which parts of state are modified
• Internal usage count (from this snippet only)

Below is an array of objects in TypeScript-like format:

```typescript
[
  {
    name: "getTransformedNodes",
    signature: "getTransformedNodes(): MeldNode[]",
    inInterface: true,
    inImplementation: true,
    line: 143, // approx.
    transformationFlags: [],
    stateModification: [],
    usageCount: 0
  },
  {
    name: "setTransformedNodes",
    signature: "setTransformedNodes(nodes: MeldNode[]): void",
    inInterface: true,
    inImplementation: true,
    line: 146, // approx.
    transformationFlags: [],
    stateModification: ["transformedNodes"],
    usageCount: 0
  },
  {
    name: "transformNode",
    signature: "transformNode(original: MeldNode, transformed: MeldNode): void",
    inInterface: true,
    inImplementation: true,
    line: 173, // approx.
    transformationFlags: ["_transformationEnabled"],
    stateModification: ["transformedNodes"],
    usageCount: 0
  },
  {
    name: "isTransformationEnabled",
    signature: "isTransformationEnabled(): boolean",
    inInterface: true,
    inImplementation: true,
    line: 190, // approx.
    transformationFlags: ["_transformationEnabled"],
    stateModification: [],
    usageCount: 0
  },
  {
    name: "enableTransformation",
    signature: "enableTransformation(enable: boolean): void",
    inInterface: true,
    inImplementation: true,
    line: 195, // approx.
    transformationFlags: ["_transformationEnabled"],
    stateModification: ["_transformationEnabled", "transformedNodes"],
    usageCount: 0
  }
];
```

--------------------------------------------------------------------------------
## 1.2 State Management Methods

For each state-management method, we provide:
• Name
• Signature
• Whether it appears in IStateService and in StateService
• Which fields are deep-copied vs. shallow-copied (if applicable)
• Internal usage count (from this snippet only)

Below is an array of objects (again, TypeScript-like) for the relevant methods. Note that some methods (e.g., hasLocalChanges) do not actually copy data or manipulate subfields.

```typescript
[
  {
    name: "hasLocalChanges",
    signature: "hasLocalChanges(): boolean",
    inInterface: true,
    inImplementation: true,
    line: 265, // approx.
    deepCopyFields: [],
    shallowCopyFields: [],
    usageCount: 0
  },
  {
    name: "getLocalChanges",
    signature: "getLocalChanges(): string[]",
    inInterface: true,
    inImplementation: true,
    line: 269, // approx.
    deepCopyFields: [],
    shallowCopyFields: [],
    usageCount: 0
  },
  {
    name: "setImmutable",
    signature: "setImmutable(): void",
    inInterface: true,
    inImplementation: true,
    line: 275, // approx.
    deepCopyFields: [],
    shallowCopyFields: [],
    usageCount: 0
  },
  {
    name: "isImmutable",
    signature: "get isImmutable(): boolean",
    inInterface: true,
    inImplementation: true,
    line: 279, // approx.
    deepCopyFields: [],
    shallowCopyFields: [],
    usageCount: 0
  },
  {
    name: "createChildState",
    signature: "createChildState(): IStateService",
    inInterface: true,
    inImplementation: true,
    line: 284, // approx.
    deepCopyFields: [],
    shallowCopyFields: [],
    usageCount: 0
  },
  {
    name: "mergeChildState",
    signature: "mergeChildState(childState: IStateService): void",
    inInterface: true,
    inImplementation: true,
    line: 292, // approx.
    // Actual merging is delegated to stateFactory; no direct copying in this method.
    deepCopyFields: [],
    shallowCopyFields: [],
    usageCount: 0
  },
  {
    name: "clone",
    signature: "clone(): IStateService",
    inInterface: true,
    inImplementation: true,
    line: 298, // approx.
    // The current snippet shallow-copies data structures; see next sections for more detail.
    deepCopyFields: [],
    shallowCopyFields: [
      "variables.text",
      "variables.data",
      "variables.path",
      "commands",
      "nodes",
      "transformedNodes",
      "imports"
    ],
    usageCount: 0
  }
];
```

--------------------------------------------------------------------------------
# 2. Test Pattern Analysis for clone() & Transformation

The failing tests (e.g., “MeldInterpreterError: currentState.clone is not a function”) and others referencing transformation issues suggest:

1) Some test code calls currentState.clone() directly, implying that test or interpreter logic believes the “currentState” object should also have a clone() method. However, currentState in StateService is just a StateNode (a plain data structure) without clone().
2) Optical issues also arise around partial transformation usage, where tests expect that enabling transformation changes node output to “test output” instead of “echo test.”

Common Patterns in Failing Tests:
• “MeldInterpreterError: currentState.clone is not a function at line X” indicates code expecting a service-like clone() on a plain object.
• OutputService transformation tests: “expected 'test output' but received 'echo test'” show that transformNode or setTransformedNodes was not used, or transformation was not recognized at runtime.

Similar Passing Tests often:
• Use this.stateService.clone() instead of currentState.clone().
• Provide valid transformations or disable them explicitly.
• Do not rely on direct calls to the plain data object’s methods.

Key Differences:
• Failing tests rely on a direct property access (e.g., something calls “.clone()” on a property that is not a StateService).
• Some transformation-mode tests that fail do not set or replace the actual nodes in “transformedNodes.” They expect a different final output than the real state is producing.

# 3. Precise Implementation Fix for clone()

Below is a structured outline and a proposed code fix to handle the issues identified:

--------------------------------------------------------------------------------
## 3.1 Required Implementation Details

We must ensure that calling .clone() on the StateService:
1. Copies all relevant fields in a way that preserves transformation state (including transformedNodes).
2. Properly supports or avoids circular references within data or commands.
3. Maintains type safety (StateService returns IStateService; internal “this.currentState” remains a StateNode).
4. Does not confuse “currentState” with a full service object (so tests calling “currentState.clone()” are presumably fixed or clarified).

Below is a structured specification:

```typescript
{
  methodSignature: "clone(): IStateService",
  fields: [
    {
      name: "variables.text",
      type: "Map<string, string>",
      copyStrategy: "deep" // creates a new Map, string keys/values are strings
    },
    {
      name: "variables.data",
      type: "Map<string, unknown>",
      copyStrategy: "deep" // creates a new Map, also handles nested references if needed
    },
    {
      name: "variables.path",
      type: "Map<string, string>",
      copyStrategy: "deep"
    },
    {
      name: "commands",
      type: "Map<string, CommandDefinition>",
      copyStrategy: "deep" // creates a new Map, each CommandDefinition is also newly allocated
    },
    {
      name: "nodes",
      type: "MeldNode[]",
      copyStrategy: "shallow" // new array, but each MeldNode is reused unless deeper copying is required
    },
    {
      name: "transformedNodes",
      type: "MeldNode[] | undefined",
      copyStrategy: "shallow"
    },
    {
      name: "imports",
      type: "Set<string>",
      copyStrategy: "deep" // new Set, but each string is reused
    }
  ],
  transformationHandling: {
    flags: ["_transformationEnabled"],
    preservation: "Retain _transformationEnabled flag and reuse or copy transformedNodes as needed",
    inheritance: "The cloned instance receives the same boolean state for transformation"
  },
  edgeCases: [
    {
      scenario: "Circular references in data or commands",
      handling: "Use a visited map or similar approach to avoid infinite recursion if objects refer to themselves"
    },
    {
      scenario: "Empty or undefined state subfields",
      handling: "Gracefully create empty structures where needed"
    }
  ]
}
```

--------------------------------------------------------------------------------
## 3.2 Example TypeScript Implementation

Below is a sample revised “clone” method for StateService. The key changes from the current code are:

• A helper (deepCloneValue) that can handle nested Maps, Sets, Arrays, or Objects to avoid infinite loops in case of circular references.
• The final cloned object includes fully separated containers for variables, commands, imports, etc.
• MeldNodes themselves remain shallow-copied unless you specifically want to clone each node’s internal fields.

Replace the existing clone() (lines ~298–334) with this approach:

```typescript
// StateService.ts

public clone(): IStateService {
  const cloned = new StateService();
  // Create a fresh StateNode with the same file path
  cloned.currentState = this.stateFactory.createState({
    source: 'clone',
    filePath: this.currentState.filePath
  });

  // Use a WeakMap to track visited objects (for circular reference checks)
  const visited = new WeakMap();

  // Build a partial StateNode using deep clone for each relevant field
  const clonedVariables = {
    text: this.deepCloneValue(this.currentState.variables.text, visited),
    data: this.deepCloneValue(this.currentState.variables.data, visited),
    path: this.deepCloneValue(this.currentState.variables.path, visited)
  };

  const clonedCommands = this.deepCloneValue(this.currentState.commands, visited);
  const clonedNodes = [ ...this.currentState.nodes ]; // shallow copy of meld nodes
  const clonedTransformed = this.currentState.transformedNodes
    ? [ ...this.currentState.transformedNodes ]
    : undefined;
  const clonedImports = this.deepCloneValue(this.currentState.imports, visited);

  // Apply them via updateState so we keep consistent logs & immutability checks
  cloned.updateState({
    variables: clonedVariables,
    commands: clonedCommands,
    nodes: clonedNodes,
    transformedNodes: clonedTransformed,
    imports: clonedImports
  }, 'clone');

  // Copy flags
  cloned._isImmutable = this._isImmutable;
  cloned._transformationEnabled = this._transformationEnabled;

  return cloned;
}

/**
 * Recursively deep-clones supported data types (Map, Set, Array, Object),
 * returning the same instance if a primitive or if encountered again in `visited`.
 */
private deepCloneValue<T>(value: T, visited: WeakMap<any, any>): T {
  // Handle null or primitive
  if (value === null || typeof value !== 'object') {
    return value;
  }

  // If we've cloned this exact object before, return that reference
  if (visited.has(value)) {
    return visited.get(value);
  }

  // Arrays
  if (Array.isArray(value)) {
    const arrClone: unknown[] = [];
    visited.set(value, arrClone);
    for (const item of value) {
      arrClone.push(this.deepCloneValue(item, visited));
    }
    return arrClone as T;
  }

  // Map
  if (value instanceof Map) {
    const mapClone = new Map();
    visited.set(value, mapClone);
    for (const [k, v] of value) {
      const kClone = this.deepCloneValue(k, visited);
      const vClone = this.deepCloneValue(v, visited);
      mapClone.set(kClone, vClone);
    }
    return mapClone as T;
  }

  // Set
  if (value instanceof Set) {
    const setClone = new Set();
    visited.set(value, setClone);
    for (const item of value) {
      setClone.add(this.deepCloneValue(item, visited));
    }
    return setClone as T;
  }

  // Plain object
  const objClone: Record<string, unknown> = {};
  visited.set(value, objClone);
  for (const key of Object.keys(value)) {
    objClone[key] = this.deepCloneValue(
      (value as Record<string, unknown>)[key],
      visited
    );
  }
  return objClone as T;
}
```

Notes on the above fix:

1. MeldNode arrays (nodes, transformedNodes) are still shallow-copied. If you need deeper copying for each node’s fields, you can apply deepCloneValue there as well.
2. This method resolves a potential test complaining about “currentState.clone is not a function” only insofar as the code uses service.clone() properly. If test code truly calls currentState.clone(), you must fix that usage or wrap StateNode in a service-like object.
3. Circular references in variables.data or commands are now handled by a WeakMap. Any repeated reference to the same object returns the same cloned object, preventing infinite loops.

By applying this revised clone() implementation, all state fields are genuinely isolated in the cloned service, transformations are preserved, and circular references can be tolerated. This should address the failing test scenarios that rely on a robust clone plus an intact transformation state.

--------------------------------------------------------------------------------
# End of Report

# Transformation & State Management Method Inventory and Proposed Fixes

Below is a systematic, evidence-based analysis of only the transformation-related methods and state management methods in StateService. Following the inventory is a set of targeted implementation fixes addressing known transformation-mode issues (e.g., overwriting transformed nodes, “currentState.clone is not a function,” and incomplete directive replacement).

-------------------------------------------------------------------------------
## 1. Transformation Method Inventory

Below are the methods in StateService.ts (lines refer to the snippet provided) that directly relate to node transformation.

| Method Name              | Signature                                                                 | In Interface? | In Implementation? | transformationFlags                       | stateModification                               | usageCount (snippet) |
|--------------------------|----------------------------------------------------------------------------|--------------|--------------------|--------------------------------------------|-------------------------------------------------|----------------------|
| getTransformedNodes      | getTransformedNodes(): MeldNode[]                                         | Yes (L41-42) | Yes (~L105-108)   | None                                       | None (returns copy of array)                    | 0                    |
| setTransformedNodes      | setTransformedNodes(nodes: MeldNode[]): void                              | Yes (L43-44) | Yes (~L146-149)   | None                                       | Writes currentState.transformedNodes            | 0                    |
| transformNode            | transformNode(original: MeldNode, transformed: MeldNode): void            | Yes (L45-46) | Yes (~L173-188)   | ["_transformationEnabled" (read check)]    | Mutates transformedNodes array                  | 0                    |
| isTransformationEnabled  | isTransformationEnabled(): boolean                                        | Yes (L47-48) | Yes (~L190-193)   | ["_transformationEnabled" (read)]          | None                                            | 0                    |
| enableTransformation     | enableTransformation(enable: boolean): void                               | Yes (L49-50) | Yes (~L195-211)   | ["_transformationEnabled" (write/read)]    | May overwrite currentState.transformedNodes     | 0                    |

NOTES / EVIDENCE:
• Snippet lines refer to the approximate interface definitions in IStateService (L41-50) and matching implementations in StateService (transformNode around line 173, enableTransformation around line 195, etc.).
• No direct calls to these methods appear within StateService.ts itself (usageCount=0 in the snippet). External usage is inferred from test logs and other services.

-------------------------------------------------------------------------------
## 2. State Management Method Inventory

Below are the methods in StateService.ts (lines refer to the snippet provided) that manage overall state lifecycle (clone, child states, immutability, local changes). Only those explicitly concerning state management are included.

| Method Name       | Signature                                                | In Interface? | In Implementation? | deepCopyFields                                                                                                                          | shallowCopyFields                                                                                                                  | usageCount (snippet) |
|-------------------|---------------------------------------------------------|--------------|--------------------|-----------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------|----------------------|
| clone             | clone(): IStateService                                  | Yes (L78-79) | Yes (~L298-334)   | (none) → no recursive or nested object cloning for MeldNodes/Commands; everything is container-level only                               | variables.text → new Map(...) <br> variables.data → new Map(...) <br> variables.path → new Map(...) <br> commands → new Map(...) <br> nodes → copy array <br> transformedNodes → copy array <br> imports → new Set(...) | 0                    |
| createChildState  | createChildState(): IStateService                       | Yes (L74-75) | Yes (~L284-290)   | n/a (creates a new child StateService object referencing parent’s currentState)                                                         | n/a                                                                                                                                 | 0                    |
| mergeChildState   | mergeChildState(childState: IStateService): void        | Yes (L76-77) | Yes (~L292-296)   | Cannot confirm → calls stateFactory.mergeStates(...) with two StateNodes, not shown                                                    | Cannot confirm                                                                                                                     | 0                    |
| setImmutable      | setImmutable(): void                                    | Yes (L70-71) | Yes (~L275-277)   | n/a → sets internal boolean _isImmutable only                                                                                           | n/a                                                                                                                                 | 0                    |
| isImmutable (prop)| get isImmutable(): boolean                              | Yes (L72-73) | Yes (~L279-282)   | n/a → read-only accessor for _isImmutable                                                                                               | n/a                                                                                                                                 | 0                    |
| hasLocalChanges   | hasLocalChanges(): boolean                              | Yes (L66-67) | Yes (~L265-267)   | n/a → always returns true                                                                                                               | n/a                                                                                                                                 | 0                    |
| getLocalChanges   | getLocalChanges(): string[]                             | Yes (L68-69) | Yes (~L269-272)   | n/a → always returns ["state"]                                                                                                          | n/a                                                                                                                                 | 0                    |

NOTES / EVIDENCE:
• clone() creates new containers (Maps, arrays, Sets) but does not deeply clone their contents.
• createChildState() and mergeChildState() rely on StateFactory logic not shown, so the nature of copying or merging is partially unknown.
• None of these are invoked within StateService.ts in the snippet (usageCount=0). External usage is indicated in test logs (DirectiveService, partial merges, etc.).

-------------------------------------------------------------------------------
## 3. Proposed Implementation Fixes for Transformation-Related Issues

Several transformation-mode test failures point to inconsistent or overwritten transformations, as well as misuse of “currentState.clone()” outside StateService. Below are targeted fixes and their recommended TypeScript changes.

--------------------------------------------------------------------------------
### 3.1 “enableTransformation” Overwriting Existing Transformations

• Observed Issue: Re-enabling transformation discards any previously transformed nodes by overwriting currentState.transformedNodes with a fresh copy of currentState.nodes.
• Snippet Reference: StateService.enableTransformation (~lines 195–211).

Use Case: When a service calls enableTransformation(true) multiple times, it can erase partial transformations already performed.

--------------------------------------------------------------------------------
Proposed Fix Data:

```typescript
{
  file: "StateService.ts",
  methodName: "enableTransformation",
  currentIssues: [
    "Re-enabling transformation overwrites transformedNodes instead of preserving them."
  ],
  proposedFix: `
    enableTransformation(enable: boolean): void {
      if (this._transformationEnabled === enable) {
        return;
      }
      this._transformationEnabled = enable;

      if (enable && !this.currentState.transformedNodes) {
        // Only initialize if we have no existing transformedNodes
        this.updateState({
          transformedNodes: [...this.currentState.nodes]
        }, 'enableTransformation');
      }
    }
  `,
  transformationFlags: [
    { name: "_transformationEnabled", handling: "Set/unset the mode. Init transformedNodes only if undefined." }
  ],
  statePreservation: {
    whatToPreserve: "Existing partial transformations in currentState.transformedNodes",
    howToPreserve: "Check if currentState.transformedNodes is null/undefined before re-initializing"
  }
}
```

Explanation:
• The fix only sets “transformedNodes” on the first enable, preserving existing transformations if enableTransformation(true) is called again.
• This prevents accidental data loss partway through a multi-step transformation sequence.

--------------------------------------------------------------------------------
### 3.2 Avoiding “currentState.clone()” Calls (Outside of StateService)

• Observed Issue: Integration tests show “MeldInterpreterError: currentState.clone is not a function,” indicating external code tries to do “currentState.clone()” though “currentState” is a plain StateNode.
• Likely Root Cause: The snippet reveals that “this.currentState” is typed as StateNode, which does not have a .clone() method. The correct approach is “myStateService.clone()”.

--------------------------------------------------------------------------------
Proposed Fix Data:

```typescript
{
  file: "DirectiveService.ts"  /* or relevant caller */,
  methodName: "N/A (call sites)",
  currentIssues: [
    "Attempting to invoke .clone() on a plain StateNode object instead of on the StateService instance."
  ],
  proposedFix: `
    // Example scenario:
    // INCORRECT:
    //   const cloned = this.currentState.clone();
    //
    // CORRECT:
    //   const clonedState = this.clone();
    //   // Use clonedState as IStateService
  `,
  transformationFlags: [
    { name: "_transformationEnabled", handling: "No direct effect; fix ensures we call the service-level clone." }
  ],
  statePreservation: {
    whatToPreserve: "Full state, including transformation flags and transformed nodes",
    howToPreserve: "Use the official .clone() method on StateService, never the raw StateNode"
  }
}
```

Explanation:
• The fix is external to StateService itself: any code calling “currentState.clone()” must be changed to “this.clone()” on the actual StateService instance.
• This ensures the entire state is duplicated according to the existing clone() logic (lines ~298–334), including transformation flags and partial transformations.

--------------------------------------------------------------------------------
### 3.3 Handling Directive Replacement in Transformation

• Observed Issue: OutputService tests fail if directive nodes remain in the final transformedNodes array (e.g., “Output error (markdown): Unexpected directive in transformed nodes”).
• Possible Cause: Some directive handlers do not explicitly replace or remove directive nodes. If transformation mode is on, the final output must be free of directive nodes or it raises an error.

--------------------------------------------------------------------------------
Proposed Fix Data:

```typescript
{
  file: "RunDirectiveHandler.ts / EmbedDirectiveHandler.ts",
  methodName: "execute() or similar directive handle method",
  currentIssues: [
    "Some tests fail with leftover directive nodes in transformation mode, e.g. 'echo test' is not replaced with 'test output'."
  ],
  proposedFix: `
// Inside each directive's execution method:
if (this.stateService.isTransformationEnabled()) {
  // Option A) Replace the directive node with a new Text or CodeFence node:
  this.stateService.transformNode(directiveNode, transformedTextNode);
  // Option B) If directive is no longer needed, remove it or transform to an empty node
}
`,
  transformationFlags: [
    { name: "_transformationEnabled", handling: "Check if active; apply transformNode accordingly." }
  ],
  statePreservation: {
    whatToPreserve: "All previously transformed nodes; only replace the specific directive node.",
    howToPreserve: "Use stateService.transformNode(...) for partial replacement without rewriting entire arrays."
  }
}
```

Explanation:
• Each directive-based node must be removed or replaced with a suitable text/code node when transformation is on.
• This fix ensures no directive node remains, preventing OutputService from throwing “Unexpected directive in transformed nodes.”

--------------------------------------------------------------------------------
### 3.4 Full Fix Example Code

Below is an example revised excerpt from StateService.ts using the proposed fix for enableTransformation, around line 195:

```typescript
// StateService.ts (approx lines 195-211)
public enableTransformation(enable: boolean): void {
  if (this._transformationEnabled === enable) {
    return;
  }
  this._transformationEnabled = enable;

  // Initialize transformed nodes only if we do not already have them
  if (enable && !this.currentState.transformedNodes) {
    this.updateState({
      transformedNodes: [...this.currentState.nodes]
    }, 'enableTransformation');
  }
}
```

And for directive handlers (pseudo-code) to ensure directives are replaced:

```typescript
// RunDirectiveHandler.ts (pseudo-code for transformation)
execute(directiveNode: MeldNode, ...): void {
  if (this.stateService.isTransformationEnabled()) {
    const transformedTextNode: MeldNode = {
      type: 'Text',
      content: 'test output',
      location: directiveNode.location
    };
    // Replace the directive node with text
    this.stateService.transformNode(directiveNode, transformedTextNode);
  }
}
```

-------------------------------------------------------------------------------
## Summary & Next Steps

• The above inventories confirm which methods control transformation mode and overall state life cycle.
• Key fixes include (1) preserving partial transformations when “enableTransformation” is called multiple times, (2) calling “this.clone()” instead of “currentState.clone(),” and (3) ensuring directive handlers remove/replace directive nodes in transformation mode.
• These changes align with the failing test scenarios (overwritten transformations, leftover directives, or “clone is not a function”).
• After implementing these fixes, re-run the failing tests for “OutputService … transformation mode,” “DirectiveService … import directives,” and “API integration … clone is not a function” to confirm resolution.

End of Report.

\======= END AUDIT

\======= SERVICES CODE AND TESTS

Processing...Processing....Processing.....Processing......Processing.......# IStateService.ts

## Content
```typescript
import type { MeldNode } from 'meld-spec';
import type { IStateEventService } from '../StateEventService/IStateEventService.js';
import type { IStateTrackingService } from '../StateTrackingService/IStateTrackingService.js';

export interface IStateService {
  // Event system
  setEventService(eventService: IStateEventService): void;

  // State tracking
  setTrackingService(trackingService: IStateTrackingService): void;
  getStateId(): string | undefined;

  // Text variables
  getTextVar(name: string): string | undefined;
  setTextVar(name: string, value: string): void;
  getAllTextVars(): Map<string, string>;
  getLocalTextVars(): Map<string, string>;

  // Data variables
  getDataVar(name: string): any;
  setDataVar(name: string, value: any): void;
  getAllDataVars(): Map<string, any>;
  getLocalDataVars(): Map<string, any>;

  // Path variables
  getPathVar(name: string): string | undefined;
  setPathVar(name: string, value: string): void;
  getAllPathVars(): Map<string, string>;

  // Commands
  getCommand(name: string): { command: string; options?: Record<string, unknown> } | undefined;
  setCommand(name: string, command: string | { command: string; options?: Record<string, unknown> }): void;
  getAllCommands(): Map<string, { command: string; options?: Record<string, unknown> }>;

  // Nodes
  getNodes(): MeldNode[];
  addNode(node: MeldNode): void;
  appendContent(content: string): void;

  // Node transformation
  getTransformedNodes(): MeldNode[];
  setTransformedNodes(nodes: MeldNode[]): void;
  transformNode(original: MeldNode, transformed: MeldNode): void;
  isTransformationEnabled(): boolean;
  enableTransformation(enable: boolean): void;

  // Imports
  addImport(path: string): void;
  removeImport(path: string): void;
  hasImport(path: string): boolean;
  getImports(): Set<string>;

  // File path
  getCurrentFilePath(): string | null;
  setCurrentFilePath(path: string): void;

  // State management
  hasLocalChanges(): boolean;
  getLocalChanges(): string[];
  setImmutable(): void;
  readonly isImmutable: boolean;
  createChildState(): IStateService;
  mergeChildState(childState: IStateService): void;
  clone(): IStateService;
}
```
# StateFactory.ts

## Functions
- StateFactory
- StateFactory.createState
- StateFactory.createChildState
- StateFactory.mergeStates
- StateFactory.updateState
- StateFactory.logOperation

## Content
```typescript
import type { StateNode, StateNodeOptions, IStateFactory, StateOperation } from './types.js';
import { stateLogger as logger } from '@core/utils/logger.js';

export class StateFactory implements IStateFactory {
  private operations: StateOperation[] = [];

  createState(options?: StateNodeOptions): StateNode {
    const state: StateNode = {
      variables: {
        text: new Map(options?.parentState?.variables.text ?? []),
        data: new Map(options?.parentState?.variables.data ?? []),
        path: new Map(options?.parentState?.variables.path ?? [])
      },
      commands: new Map(options?.parentState?.commands ?? []),
      imports: new Set(options?.parentState?.imports ?? []),
      nodes: [...(options?.parentState?.nodes ?? [])],
      transformedNodes: options?.parentState?.transformedNodes ? [...options.parentState.transformedNodes] : undefined,
      filePath: options?.filePath ?? options?.parentState?.filePath,
      parentState: options?.parentState
    };

    this.logOperation({
      type: 'create',
      timestamp: Date.now(),
      source: options?.source ?? 'createState',
      details: {
        operation: 'createState',
        value: state
      }
    });

    return state;
  }

  createChildState(parent: StateNode, options?: StateNodeOptions): StateNode {
    const child = this.createState({
      ...options,
      parentState: parent,
      source: options?.source ?? 'createChildState'
    });

    this.logOperation({
      type: 'create',
      timestamp: Date.now(),
      source: options?.source ?? 'createChildState',
      details: {
        operation: 'createChildState',
        value: child
      }
    });

    return child;
  }

  mergeStates(parent: StateNode, child: StateNode): StateNode {
    // Create new maps with parent values as base
    const text = new Map(parent.variables.text);
    const data = new Map(parent.variables.data);
    const path = new Map(parent.variables.path);
    const commands = new Map(parent.commands);

    // Merge child variables - last write wins
    for (const [key, value] of child.variables.text) {
      text.set(key, value);
    }
    for (const [key, value] of child.variables.data) {
      data.set(key, value);
    }
    for (const [key, value] of child.variables.path) {
      path.set(key, value);
    }
    for (const [key, value] of child.commands) {
      commands.set(key, value);
    }

    // Create new state with merged values
    const merged: StateNode = {
      variables: {
        text,
        data,
        path
      },
      commands,
      imports: new Set([...parent.imports, ...child.imports]),
      // Preserve node order by appending all child nodes
      nodes: [...parent.nodes, ...child.nodes],
      // Merge transformed nodes if either parent or child has them
      transformedNodes: child.transformedNodes !== undefined ? [...child.transformedNodes] :
                       parent.transformedNodes !== undefined ? [...parent.transformedNodes] :
                       undefined,
      filePath: child.filePath ?? parent.filePath,
      parentState: parent.parentState
    };

    this.logOperation({
      type: 'merge',
      timestamp: Date.now(),
      source: 'mergeStates',
      details: {
        operation: 'mergeStates',
        value: merged
      }
    });

    return merged;
  }

  updateState(state: StateNode, updates: Partial<StateNode>): StateNode {
    const updated: StateNode = {
      variables: {
        text: updates.variables?.text ?? new Map(state.variables.text),
        data: updates.variables?.data ?? new Map(state.variables.data),
        path: updates.variables?.path ?? new Map(state.variables.path)
      },
      commands: updates.commands ?? new Map(state.commands),
      imports: new Set(updates.imports ?? state.imports),
      nodes: [...(updates.nodes ?? state.nodes)],
      transformedNodes: updates.transformedNodes !== undefined ? [...updates.transformedNodes] : state.transformedNodes,
      filePath: updates.filePath ?? state.filePath,
      parentState: updates.parentState ?? state.parentState
    };

    this.logOperation({
      type: 'update',
      timestamp: Date.now(),
      source: 'updateState',
      details: {
        operation: 'updateState',
        value: updated
      }
    });

    return updated;
  }

  private logOperation(operation: StateOperation): void {
    this.operations.push(operation);
    logger.debug('State operation', operation);
  }
}
```
# StateService.ts

## Functions
- StateService
- StateService.constructor
- StateService.setEventService
- StateService.emitEvent
- StateService.getTextVar
- StateService.setTextVar
- StateService.getAllTextVars
- StateService.getLocalTextVars
- StateService.getDataVar
- StateService.setDataVar
- StateService.getAllDataVars
- StateService.getLocalDataVars
- StateService.getPathVar
- StateService.setPathVar
- StateService.getAllPathVars
- StateService.getCommand
- StateService.setCommand
- StateService.getAllCommands
- StateService.getNodes
- StateService.getTransformedNodes
- StateService.setTransformedNodes
- StateService.addNode
- StateService.transformNode
- StateService.isTransformationEnabled
- StateService.enableTransformation
- StateService.appendContent
- StateService.addImport
- StateService.removeImport
- StateService.hasImport
- StateService.getImports
- StateService.getCurrentFilePath
- StateService.setCurrentFilePath
- StateService.hasLocalChanges
- StateService.getLocalChanges
- StateService.setImmutable
- StateService.createChildState
- StateService.mergeChildState
- StateService.clone
- StateService.checkMutable
- StateService.updateState
- StateService.setTrackingService
- StateService.getStateId

## Content
```typescript
import type { MeldNode, TextNode } from 'meld-spec';
import { stateLogger as logger } from '@core/utils/logger.js';
import type { IStateService } from './IStateService.js';
import type { StateNode, CommandDefinition } from './types.js';
import { StateFactory } from './StateFactory.js';
import type { IStateEventService, StateEvent } from '../StateEventService/IStateEventService.js';
import type { IStateTrackingService } from '../StateTrackingService/IStateTrackingService.js';

export class StateService implements IStateService {
  private stateFactory: StateFactory;
  private currentState: StateNode;
  private _isImmutable: boolean = false;
  private _transformationEnabled: boolean = false;
  private eventService?: IStateEventService;
  private trackingService?: IStateTrackingService;

  constructor(parentState?: IStateService) {
    this.stateFactory = new StateFactory();
    this.currentState = this.stateFactory.createState({
      source: 'new',
      parentState: parentState ? (parentState as StateService).currentState : undefined
    });

    // If parent has services, inherit them
    if (parentState) {
      const parent = parentState as StateService;
      if (parent.eventService) {
        this.eventService = parent.eventService;
      }
      if (parent.trackingService) {
        this.trackingService = parent.trackingService;
      }
    }

    // Initialize state ID first
    this.currentState.stateId = crypto.randomUUID();

    // Register state with tracking service if available
    if (this.trackingService) {
      const parentId = parentState ? (parentState as StateService).currentState.stateId : undefined;

      // Register the state with the pre-generated ID
      this.trackingService.registerState({
        id: this.currentState.stateId,
        source: 'new',
        parentId,
        filePath: this.currentState.filePath,
        transformationEnabled: this._transformationEnabled
      });

      // Add relationship if this is a child state and parent has an ID
      if (parentId) {
        try {
          this.trackingService.addRelationship(parentId, this.currentState.stateId, 'parent-child');
        } catch (error) {
          logger.warn('Failed to add child relationship', { error, parentId, childId: this.currentState.stateId });
        }
      }
    }
  }

  setEventService(eventService: IStateEventService): void {
    this.eventService = eventService;
  }

  private async emitEvent(event: StateEvent): Promise<void> {
    if (this.eventService) {
      await this.eventService.emit(event);
    }
  }

  // Text variables
  getTextVar(name: string): string | undefined {
    return this.currentState.variables.text.get(name);
  }

  setTextVar(name: string, value: string): void {
    this.checkMutable();
    const text = new Map(this.currentState.variables.text);
    text.set(name, value);
    this.updateState({
      variables: {
        ...this.currentState.variables,
        text
      }
    }, `setTextVar:${name}`);
  }

  getAllTextVars(): Map<string, string> {
    return new Map(this.currentState.variables.text);
  }

  getLocalTextVars(): Map<string, string> {
    return new Map(this.currentState.variables.text);
  }

  // Data variables
  getDataVar(name: string): unknown {
    return this.currentState.variables.data.get(name);
  }

  setDataVar(name: string, value: unknown): void {
    this.checkMutable();
    const data = new Map(this.currentState.variables.data);
    data.set(name, value);
    this.updateState({
      variables: {
        ...this.currentState.variables,
        data
      }
    }, `setDataVar:${name}`);
  }

  getAllDataVars(): Map<string, unknown> {
    return new Map(this.currentState.variables.data);
  }

  getLocalDataVars(): Map<string, unknown> {
    return new Map(this.currentState.variables.data);
  }

  // Path variables
  getPathVar(name: string): string | undefined {
    return this.currentState.variables.path.get(name);
  }

  setPathVar(name: string, value: string): void {
    this.checkMutable();
    const path = new Map(this.currentState.variables.path);
    path.set(name, value);
    this.updateState({
      variables: {
        ...this.currentState.variables,
        path
      }
    }, `setPathVar:${name}`);
  }

  getAllPathVars(): Map<string, string> {
    return new Map(this.currentState.variables.path);
  }

  // Commands
  getCommand(name: string): CommandDefinition | undefined {
    return this.currentState.commands.get(name);
  }

  setCommand(name: string, command: string | CommandDefinition): void {
    this.checkMutable();
    const commands = new Map(this.currentState.commands);
    const commandDef = typeof command === 'string' ? { command } : command;
    commands.set(name, commandDef);
    this.updateState({ commands }, `setCommand:${name}`);
  }

  getAllCommands(): Map<string, CommandDefinition> {
    return new Map(this.currentState.commands);
  }

  // Nodes
  getNodes(): MeldNode[] {
    return [...this.currentState.nodes];
  }

  getTransformedNodes(): MeldNode[] {
    if (this._transformationEnabled) {
      return this.currentState.transformedNodes ? [...this.currentState.transformedNodes] : [...this.currentState.nodes];
    }
    return [...this.currentState.nodes];
  }

  setTransformedNodes(nodes: MeldNode[]): void {
    this.checkMutable();
    this.updateState({ transformedNodes: nodes }, 'setTransformedNodes');
  }

  addNode(node: MeldNode): void {
    this.checkMutable();
    const nodes = [...this.currentState.nodes, node];
    const transformedNodes = this._transformationEnabled ?
      (this.currentState.transformedNodes ? [...this.currentState.transformedNodes, node] : [...nodes]) :
      undefined;
    this.updateState({ nodes, transformedNodes }, 'addNode');
  }

  transformNode(original: MeldNode, transformed: MeldNode): void {
    this.checkMutable();
    if (!this._transformationEnabled) {
      return;
    }

    // Initialize transformed nodes if needed
    let transformedNodes = this.currentState.transformedNodes ?
      [...this.currentState.transformedNodes] :
      [...this.currentState.nodes];

    // Find the original node by comparing content and location
    const index = transformedNodes.findIndex(node =>
      node.type === original.type &&
      JSON.stringify(node.location) === JSON.stringify(original.location) &&
      (node as any).content === (original as any).content
    );

    if (index !== -1) {
      transformedNodes[index] = transformed;
    } else {
      // If not found, check if it's in the original nodes array
      const originalIndex = this.currentState.nodes.findIndex(node =>
        node.type === original.type &&
        JSON.stringify(node.location) === JSON.stringify(original.location) &&
        (node as any).content === (original as any).content
      );

      if (originalIndex === -1) {
        throw new Error('Cannot transform node: original node not found');
      }

      transformedNodes.push(transformed);
    }

    this.updateState({ transformedNodes }, 'transformNode');
  }

  isTransformationEnabled(): boolean {
    return this._transformationEnabled;
  }

  enableTransformation(enable: boolean): void {
    this._transformationEnabled = enable;
    if (enable && (!this.currentState.transformedNodes || this.currentState.transformedNodes.length === 0)) {
      // Initialize transformed nodes with current nodes when enabling transformation
      this.updateState({ transformedNodes: [...this.currentState.nodes] }, 'enableTransformation');
    }
  }

  appendContent(content: string): void {
    this.checkMutable();
    // Create a text node and add it
    const textNode: TextNode = {
      type: 'Text',
      content,
      location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }
    };
    this.addNode(textNode);
  }

  // Imports
  addImport(path: string): void {
    this.checkMutable();
    const imports = new Set(this.currentState.imports);
    imports.add(path);
    this.updateState({ imports }, `addImport:${path}`);
  }

  removeImport(path: string): void {
    this.checkMutable();
    const imports = new Set(this.currentState.imports);
    imports.delete(path);
    this.updateState({ imports }, `removeImport:${path}`);
  }

  hasImport(path: string): boolean {
    return this.currentState.imports.has(path);
  }

  getImports(): Set<string> {
    return new Set(this.currentState.imports);
  }

  // File path
  getCurrentFilePath(): string | null {
    return this.currentState.filePath ?? null;
  }

  setCurrentFilePath(path: string): void {
    this.checkMutable();
    this.updateState({ filePath: path }, 'setCurrentFilePath');
  }

  // State management
  hasLocalChanges(): boolean {
    return true; // In immutable model, any non-empty state has local changes
  }

  getLocalChanges(): string[] {
    return ['state']; // In immutable model, the entire state is considered changed
  }

  setImmutable(): void {
    this._isImmutable = true;
  }

  get isImmutable(): boolean {
    return this._isImmutable;
  }

  createChildState(): IStateService {
    const child = new StateService(this);
    logger.debug('Created child state', {
      parentPath: this.getCurrentFilePath(),
      childPath: child.getCurrentFilePath()
    });

    // Emit create event
    this.emitEvent({
      type: 'create',
      stateId: child.currentState.filePath || 'unknown',
      source: 'createChildState',
      timestamp: Date.now(),
      location: {
        file: this.getCurrentFilePath() || undefined
      }
    });

    return child;
  }

  mergeChildState(childState: IStateService): void {
    this.checkMutable();
    const child = childState as StateService;
    this.currentState = this.stateFactory.mergeStates(this.currentState, child.currentState);

    // Add merge relationship if tracking enabled
    if (this.trackingService && child.currentState.stateId) {
      this.trackingService.addRelationship(
        this.currentState.stateId!,
        child.currentState.stateId,
        'merge-source'
      );
    }

    // Emit merge event
    this.emitEvent({
      type: 'merge',
      stateId: this.currentState.stateId || 'unknown',
      source: 'mergeChildState',
      timestamp: Date.now(),
      location: {
        file: this.getCurrentFilePath() || undefined
      }
    });
  }

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

    // Copy service references
    if (this.eventService) {
      cloned.setEventService(this.eventService);
    }
    if (this.trackingService) {
      cloned.setTrackingService(this.trackingService);

      // Add clone relationship as parent-child since we don't track clones separately anymore
      this.trackingService.addRelationship(
        this.currentState.stateId!,
        cloned.currentState.stateId!,
        'parent-child'
      );
    }

    // Emit clone event
    this.emitEvent({
      type: 'clone',
      stateId: cloned.currentState.stateId || 'unknown',
      source: 'clone',
      timestamp: Date.now(),
      location: {
        file: this.getCurrentFilePath() || undefined
      }
    });

    return cloned;
  }

  private checkMutable(): void {
    if (this._isImmutable) {
      throw new Error('Cannot modify immutable state');
    }
  }

  private updateState(updates: Partial<StateNode>, source: string): void {
    this.currentState = this.stateFactory.updateState(this.currentState, updates);

    // Emit transform event for state updates
    if (source !== 'clone' && source !== 'createChildState') {
      this.emitEvent({
        type: 'transform',
        stateId: this.currentState.stateId || 'unknown',
        source,
        timestamp: Date.now(),
        location: {
          file: this.getCurrentFilePath() || undefined
        }
      });
    }
  }

  // Add new methods for state tracking
  setTrackingService(trackingService: IStateTrackingService): void {
    this.trackingService = trackingService;

    // Register existing state if not already registered
    if (this.currentState.stateId) {
      try {
        this.trackingService.registerState({
          id: this.currentState.stateId,
          source: 'implicit',
          filePath: this.currentState.filePath,
          transformationEnabled: this._transformationEnabled
        });
      } catch (error) {
        logger.warn('Failed to register existing state with tracking service', { error, stateId: this.currentState.stateId });
      }
    }
  }

  getStateId(): string | undefined {
    return this.currentState.stateId;
  }
}
```
# migration.ts

## Functions
- migrateState
- validateMigration

## Content
```typescript
import type { IStateService } from './IStateService.js';
import type { StateNode } from './types.js';
import { StateFactory } from './StateFactory.js';
import { stateLogger as logger } from '@core/utils/logger.js';

/**
 * Options for migrating state
 */
export interface MigrationOptions {
  /**
   * Whether to preserve immutability status
   * @default true
   */
  preserveImmutability?: boolean;

  /**
   * Whether to validate the migrated state
   * @default true
   */
  validate?: boolean;

  /**
   * Whether to throw on validation errors
   * @default false
   */
  strict?: boolean;
}

/**
 * Result of state migration
 */
export interface MigrationResult {
  /**
   * The migrated state node
   */
  state: StateNode;

  /**
   * Any validation warnings that occurred during migration
   */
  warnings: string[];

  /**
   * Whether the migration was successful
   */
  success: boolean;
}

/**
 * Migrates an old state service instance to a new immutable state node
 */
export function migrateState(oldState: IStateService, options: MigrationOptions = {}): MigrationResult {
  const {
    preserveImmutability = true,
    validate = true,
    strict = false
  } = options;

  const warnings: string[] = [];
  const factory = new StateFactory();

  try {
    // Create base state
    const state = factory.createState({
      source: 'migration',
      filePath: oldState.getCurrentFilePath() ?? undefined
    });

    // Migrate variables
    const text = new Map(oldState.getAllTextVars());
    const data = new Map(oldState.getAllDataVars());
    const path = new Map(oldState.getAllPathVars());

    // Migrate commands
    const commands = new Map(oldState.getAllCommands());

    // Migrate imports
    const imports = oldState.getImports();

    // Migrate nodes
    const nodes = oldState.getNodes();

    // Create migrated state
    const migrated = factory.updateState(state, {
      variables: { text, data, path },
      commands,
      imports,
      nodes
    });

    // Validate migrated state
    if (validate) {
      validateMigration(oldState, migrated, warnings);
      if (strict && warnings.length > 0) {
        throw new Error('Migration validation failed:\n' + warnings.join('\n'));
      }
    }

    logger.debug('Migrated state', {
      textVars: text.size,
      dataVars: data.size,
      pathVars: path.size,
      commands: commands.size,
      imports: imports.size,
      nodes: nodes.length,
      warnings: warnings.length
    });

    return {
      state: migrated,
      warnings,
      success: true
    };
  } catch (error) {
    logger.error('State migration failed', { error });
    return {
      state: factory.createState(),
      warnings: [...warnings, String(error)],
      success: false
    };
  }
}

/**
 * Validates that the migrated state matches the original
 */
export function validateMigration(oldState: IStateService, newState: StateNode, warnings: string[]): void {
  // Validate text variables
  for (const [key, value] of oldState.getAllTextVars()) {
    const newValue = newState.variables.text.get(key);
    if (newValue !== value) {
      warnings.push(`Text variable mismatch: ${key}`);
    }
  }

  // Validate data variables
  for (const [key, value] of oldState.getAllDataVars()) {
    const newValue = newState.variables.data.get(key);
    if (JSON.stringify(newValue) !== JSON.stringify(value)) {
      warnings.push(`Data variable mismatch: ${key}`);
    }
  }

  // Validate path variables
  for (const [key, value] of oldState.getAllPathVars()) {
    const newValue = newState.variables.path.get(key);
    if (newValue !== value) {
      warnings.push(`Path variable mismatch: ${key}`);
    }
  }

  // Validate commands
  for (const [key, value] of oldState.getAllCommands()) {
    const newValue = newState.commands.get(key);
    if (!newValue || JSON.stringify(newValue) !== JSON.stringify(value)) {
      warnings.push(`Command mismatch: ${key}`);
    }
  }

  // Validate imports
  for (const importPath of oldState.getImports()) {
    if (!newState.imports.has(importPath)) {
      warnings.push(`Missing import: ${importPath}`);
    }
  }

  // Validate nodes
  const oldNodes = oldState.getNodes();
  if (oldNodes.length !== newState.nodes.length) {
    warnings.push(`Node count mismatch: ${oldNodes.length} vs ${newState.nodes.length}`);
  } else {
    for (let i = 0; i < oldNodes.length; i++) {
      if (JSON.stringify(oldNodes[i]) !== JSON.stringify(newState.nodes[i])) {
        warnings.push(`Node mismatch at index ${i}`);
      }
    }
  }

  // Validate file path
  const oldPath = oldState.getCurrentFilePath();
  const newPath = newState.filePath;
  if (oldPath !== (newPath ?? null)) {
    warnings.push(`File path mismatch: ${oldPath} vs ${newPath}`);
  }
}
```
# types.ts

## Content
```typescript
import type { MeldNode } from 'meld-spec';
import type { IStateService } from '@services/StateService/IStateService.js';

/**
 * Result of directive execution
 */
export interface DirectiveResult {
  /** The updated state after directive execution */
  state: IStateService;
  /** Optional replacement node for transformation */
  replacement?: MeldNode;
}
```
# DirectiveService.ts

## Functions
- MeldLLMXMLError
- DirectiveService
- MeldLLMXMLError.constructor
- DirectiveService.constructor
- DirectiveService.initialize
- DirectiveService.registerDefaultHandlers
- DirectiveService.registerHandler
- DirectiveService.handleDirective
- DirectiveService.processDirectives
- DirectiveService.createContext
- DirectiveService.updateInterpreterService
- DirectiveService.hasHandler
- DirectiveService.validateDirective
- DirectiveService.createChildContext
- DirectiveService.supportsDirective
- DirectiveService.getSupportedDirectives
- DirectiveService.ensureInitialized
- DirectiveService.handleTextDirective
- DirectiveService.handleDataDirective
- DirectiveService.handleImportDirective
- DirectiveService.extractSection
- DirectiveService.calculateSimilarity
- DirectiveService.handleEmbedDirective
- DirectiveService.processDirective

## Content
```typescript
import type { DirectiveNode, DirectiveKind, DirectiveData } from 'meld-spec';
import { directiveLogger } from '../../core/utils/logger.js';
import { IDirectiveService, IDirectiveHandler, DirectiveContext } from './IDirectiveService.js';
import { IValidationService } from '@services/ValidationService/IValidationService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { IPathService } from '@services/PathService/IPathService.js';
import { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/ParserService/IParserService.js';
import { IInterpreterService } from '@services/InterpreterService/IInterpreterService.js';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { ICircularityService } from '@services/CircularityService/ICircularityService.js';
import { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import { DirectiveError, DirectiveErrorCode } from './errors/DirectiveError.js';
import type { ILogger } from './handlers/execution/EmbedDirectiveHandler.js';

// Import all handlers
import { TextDirectiveHandler } from './handlers/definition/TextDirectiveHandler.js';
import { DataDirectiveHandler } from './handlers/definition/DataDirectiveHandler.js';
import { PathDirectiveHandler } from './handlers/definition/PathDirectiveHandler.js';
import { DefineDirectiveHandler } from './handlers/definition/DefineDirectiveHandler.js';
import { RunDirectiveHandler } from './handlers/execution/RunDirectiveHandler.js';
import { EmbedDirectiveHandler } from './handlers/execution/EmbedDirectiveHandler.js';
import { ImportDirectiveHandler } from './handlers/execution/ImportDirectiveHandler.js';

export class MeldLLMXMLError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'MeldLLMXMLError';
    Object.setPrototypeOf(this, MeldLLMXMLError.prototype);
  }
}

/**
 * Service responsible for handling directives
 */
export class DirectiveService implements IDirectiveService {
  private validationService?: IValidationService;
  private stateService?: IStateService;
  private pathService?: IPathService;
  private fileSystemService?: IFileSystemService;
  private parserService?: IParserService;
  private interpreterService?: IInterpreterService;
  private circularityService?: ICircularityService;
  private resolutionService?: IResolutionService;
  private initialized = false;
  private logger: ILogger;

  private handlers: Map<string, IDirectiveHandler> = new Map();

  constructor(logger?: ILogger) {
    this.logger = logger || directiveLogger;
  }

  initialize(
    validationService: IValidationService,
    stateService: IStateService,
    pathService: IPathService,
    fileSystemService: IFileSystemService,
    parserService: IParserService,
    interpreterService: IInterpreterService,
    circularityService: ICircularityService,
    resolutionService: IResolutionService
  ): void {
    this.validationService = validationService;
    this.stateService = stateService;
    this.pathService = pathService;
    this.fileSystemService = fileSystemService;
    this.parserService = parserService;
    this.interpreterService = interpreterService;
    this.circularityService = circularityService;
    this.resolutionService = resolutionService;
    this.initialized = true;

    // Register default handlers
    this.registerDefaultHandlers();

    this.logger.debug('DirectiveService initialized', {
      handlers: Array.from(this.handlers.keys())
    });
  }

  /**
   * Register all default directive handlers
   */
  public registerDefaultHandlers(): void {
    // Definition handlers
    this.registerHandler(
      new TextDirectiveHandler(
        this.validationService!,
        this.stateService!,
        this.resolutionService!
      )
    );

    this.registerHandler(
      new DataDirectiveHandler(
        this.validationService!,
        this.stateService!,
        this.resolutionService!
      )
    );

    this.registerHandler(
      new PathDirectiveHandler(
        this.validationService!,
        this.stateService!,
        this.resolutionService!
      )
    );

    this.registerHandler(
      new DefineDirectiveHandler(
        this.validationService!,
        this.stateService!,
        this.resolutionService!
      )
    );

    // Execution handlers
    this.registerHandler(
      new RunDirectiveHandler(
        this.validationService!,
        this.resolutionService!,
        this.stateService!,
        this.fileSystemService!
      )
    );

    this.registerHandler(
      new EmbedDirectiveHandler(
        this.validationService!,
        this.resolutionService!,
        this.stateService!,
        this.circularityService!,
        this.fileSystemService!,
        this.parserService!,
        this.interpreterService!,
        this.logger
      )
    );

    this.registerHandler(
      new ImportDirectiveHandler(
        this.validationService!,
        this.resolutionService!,
        this.stateService!,
        this.fileSystemService!,
        this.parserService!,
        this.interpreterService!,
        this.circularityService!
      )
    );
  }

  /**
   * Register a new directive handler
   */
  registerHandler(handler: IDirectiveHandler): void {
    if (!this.initialized) {
      throw new Error('DirectiveService must be initialized before registering handlers');
    }

    if (!handler.kind) {
      throw new Error('Handler must have a kind property');
    }

    this.handlers.set(handler.kind, handler);
    this.logger.debug(`Registered handler for directive: ${handler.kind}`);
  }

  /**
   * Handle a directive node
   */
  public async handleDirective(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    return this.processDirective(node, context);
  }

  /**
   * Process multiple directives in sequence
   */
  async processDirectives(nodes: DirectiveNode[], parentContext?: DirectiveContext): Promise<IStateService> {
    let currentState = parentContext?.state?.clone() || this.stateService!.createChildState();

    for (const node of nodes) {
      // Create a new context with the current state as parent and a new child state
      const nodeContext = {
        currentFilePath: parentContext?.currentFilePath || '',
        parentState: currentState,
        state: currentState.createChildState()
      };

      // Process directive and get the updated state
      const updatedState = await this.processDirective(node, nodeContext);

      // Merge the updated state back into the current state
      currentState.mergeChildState(updatedState);
    }

    return currentState;
  }

  /**
   * Create execution context for a directive
   */
  private createContext(node: DirectiveNode, parentContext?: DirectiveContext): DirectiveContext {
    return {
      currentFilePath: node.location?.start.line ? node.location.start.line.toString() : '',
      parentState: parentContext?.state,
      state: parentContext?.state?.clone() || this.stateService!.createChildState()
    };
  }

  /**
   * Update the interpreter service reference
   */
  updateInterpreterService(interpreterService: IInterpreterService): void {
    this.interpreterService = interpreterService;
    this.logger.debug('Updated interpreter service reference');
  }

  /**
   * Check if a handler exists for a directive kind
   */
  hasHandler(kind: string): boolean {
    return this.handlers.has(kind);
  }

  /**
   * Validate a directive node
   */
  async validateDirective(node: DirectiveNode): Promise<void> {
    try {
      await this.validationService!.validate(node);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorForLog = error instanceof Error ? error : new Error(String(error));

      this.logger.error('Failed to validate directive', {
        kind: node.directive.kind,
        location: node.location,
        error: errorForLog
      });

      throw new DirectiveError(
        errorMessage,
        node.directive.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        {
          node
        }
      );
    }
  }

  /**
   * Create a child context for nested directives
   */
  public createChildContext(parentContext: DirectiveContext, filePath: string): DirectiveContext {
    return {
      currentFilePath: filePath,
      state: parentContext.state.createChildState(),
      parentState: parentContext.state
    };
  }

  supportsDirective(kind: string): boolean {
    return this.handlers.has(kind);
  }

  getSupportedDirectives(): string[] {
    return Array.from(this.handlers.keys());
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('DirectiveService must be initialized before use');
    }
  }

  private async handleTextDirective(node: DirectiveNode): Promise<void> {
    const directive = node.directive;

    this.logger.debug('Processing text directive', {
      identifier: directive.identifier,
      location: node.location
    });

    try {
      // Value is already interpolated by meld-ast
      await this.stateService!.setTextVar(directive.identifier, directive.value);

      this.logger.debug('Text directive processed successfully', {
        identifier: directive.identifier,
        location: node.location
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorForLog = error instanceof Error ? error : new Error(String(error));

      this.logger.error('Failed to process text directive', {
        identifier: directive.identifier,
        location: node.location,
        error: errorForLog
      });

      throw new MeldDirectiveError(
        errorMessage,
        'text',
        node.location?.start
      );
    }
  }

  private async handleDataDirective(node: DirectiveNode): Promise<void> {
    const directive = node.directive;

    this.logger.debug('Processing data directive', {
      identifier: directive.identifier,
      location: node.location
    });

    try {
      // Value is already interpolated by meld-ast
      let value = directive.value;
      if (typeof value === 'string') {
        value = JSON.parse(value);
      }

      await this.stateService!.setDataVar(directive.identifier, value);

      this.logger.debug('Data directive processed successfully', {
        identifier: directive.identifier,
        location: node.location
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorForLog = error instanceof Error ? error : new Error(String(error));

      this.logger.error('Failed to process data directive', {
        identifier: directive.identifier,
        location: node.location,
        error: errorForLog
      });

      throw new MeldDirectiveError(
        errorMessage,
        'data',
        node.location?.start
      );
    }
  }

  private async handleImportDirective(node: DirectiveNode): Promise<void> {
    const directive = node.directive;

    this.logger.debug('Processing import directive', {
      path: directive.path,
      section: directive.section,
      fuzzy: directive.fuzzy,
      location: node.location
    });

    try {
      // Path is already interpolated by meld-ast
      const fullPath = await this.pathService!.resolvePath(directive.path);

      // Check for circular imports
      this.circularityService!.beginImport(fullPath);

      try {
        // Check if file exists
        if (!await this.fileSystemService!.exists(fullPath)) {
          throw new Error(`Import file not found: ${fullPath}`);
        }

        // Create a child state for the import
        const childState = await this.stateService!.createChildState();

        // Read the file content
        const content = await this.fileSystemService!.readFile(fullPath);

        // If a section is specified, extract it (section name is already interpolated)
        let processedContent = content;
        if (directive.section) {
          processedContent = await this.extractSection(
            content,
            directive.section,
            directive.fuzzy || 0
          );
        }

        // Parse and interpret the content
        const parsedNodes = await this.parserService!.parse(processedContent);
        await this.interpreterService!.interpret(parsedNodes, {
          initialState: childState,
          filePath: fullPath,
          mergeState: true
        });

        this.logger.debug('Import content processed', {
          path: fullPath,
          section: directive.section,
          location: node.location
        });
      } finally {
        // Always end import tracking, even if there was an error
        this.circularityService!.endImport(fullPath);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorForLog = error instanceof Error ? error : new Error(String(error));

      this.logger.error('Failed to process import directive', {
        path: directive.path,
        section: directive.section,
        location: node.location,
        error: errorForLog
      });

      throw new MeldDirectiveError(
        errorMessage,
        'import',
        node.location?.start
      );
    }
  }

  private async extractSection(
    content: string,
    section: string,
    fuzzyMatch: number
  ): Promise<string> {
    try {
      // Split content into lines
      const lines = content.split('\n');
      const headings: { title: string; line: number; level: number }[] = [];

      // Find all headings and their levels
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (match) {
          headings.push({
            title: match[2],
            line: i,
            level: match[1].length
          });
        }
      }

      // Find best matching heading
      let bestMatch: typeof headings[0] | undefined;
      let bestScore = 0;

      for (const heading of headings) {
        const score = this.calculateSimilarity(heading.title, section);
        if (score > fuzzyMatch && score > bestScore) {
          bestScore = score;
          bestMatch = heading;
        }
      }

      if (!bestMatch) {
        // Find closest match for error message
        let closestMatch = '';
        let closestScore = 0;
        for (const heading of headings) {
          const score = this.calculateSimilarity(heading.title, section);
          if (score > closestScore) {
            closestScore = score;
            closestMatch = heading.title;
          }
        }

        throw new MeldLLMXMLError(
          'Section not found',
          'SECTION_NOT_FOUND',
          { title: section, bestMatch: closestMatch }
        );
      }

      // Find the end of the section (next heading of same or higher level)
      let endLine = lines.length;
      for (let i = bestMatch.line + 1; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^(#{1,6})\s+/);
        if (match && match[1].length <= bestMatch.level) {
          endLine = i;
          break;
        }
      }

      // Extract the section content
      return lines.slice(bestMatch.line, endLine).join('\n');
    } catch (error) {
      if (error instanceof MeldLLMXMLError) {
        throw error;
      }
      throw new MeldLLMXMLError(
        error instanceof Error ? error.message : 'Unknown error during section extraction',
        'PARSE_ERROR',
        error
      );
    }
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // Convert strings to lowercase for case-insensitive comparison
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    if (s1 === s2) return 1.0;

    // Calculate Levenshtein distance
    const len1 = s1.length;
    const len2 = s2.length;
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    // Convert distance to similarity score between 0 and 1
    const maxLen = Math.max(len1, len2);
    return maxLen === 0 ? 1.0 : 1.0 - matrix[len1][len2] / maxLen;
  }

  private async handleEmbedDirective(node: DirectiveNode): Promise<void> {
    const directive = node.directive;

    this.logger.debug('Processing embed directive', {
      path: directive.path,
      section: directive.section,
      fuzzy: directive.fuzzy,
      names: directive.names,
      location: node.location
    });

    try {
      // Path is already interpolated by meld-ast
      const fullPath = await this.pathService!.resolvePath(directive.path);

      // Check for circular imports
      this.circularityService!.beginImport(fullPath);

      try {
        // Check if file exists
        if (!await this.fileSystemService!.exists(fullPath)) {
          throw new Error(`Embed file not found: ${fullPath}`);
        }

        // Create a child state for the import
        const childState = await this.stateService!.createChildState();

        // Read the file content
        const content = await this.fileSystemService!.readFile(fullPath);

        // If a section is specified, extract it (section name is already interpolated)
        let processedContent = content;
        if (directive.section) {
          processedContent = await this.extractSection(
            content,
            directive.section,
            directive.fuzzy || 0
          );
        }

        // Parse and interpret the content
        const parsedNodes = await this.parserService!.parse(processedContent);
        await this.interpreterService!.interpret(parsedNodes, {
          initialState: childState,
          filePath: fullPath,
          mergeState: true
        });

        this.logger.debug('Embed content processed', {
          path: fullPath,
          section: directive.section,
          location: node.location
        });
      } finally {
        // Always end import tracking, even if there was an error
        this.circularityService!.endImport(fullPath);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorForLog = error instanceof Error ? error : new Error(String(error));

      this.logger.error('Failed to process embed directive', {
        path: directive.path,
        section: directive.section,
        location: node.location,
        error: errorForLog
      });

      throw new MeldDirectiveError(
        errorMessage,
        'embed',
        node.location?.start
      );
    }
  }

  /**
   * Process a directive node, validating and executing it
   * Values in the directive will already be interpolated by meld-ast
   * @returns The updated state after directive execution
   * @throws {MeldDirectiveError} If directive processing fails
   */
  public async processDirective(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    try {
      // Get the handler for this directive kind
      const { kind } = node.directive;
      const handler = this.handlers.get(kind);

      if (!handler) {
        throw new DirectiveError(
          `No handler found for directive: ${kind}`,
          kind,
          DirectiveErrorCode.HANDLER_NOT_FOUND,
          { node }
        );
      }

      // Validate directive before handling
      await this.validateDirective(node);

      // Execute the directive and handle both possible return types
      const result = await handler.execute(node, context);

      // If result is a DirectiveResult, return its state
      if ('state' in result) {
        return result.state;
      }

      // Otherwise, result is already an IStateService
      return result;
    } catch (error) {
      if (error instanceof DirectiveError) {
        throw error;
      }

      // Simplify error messages for common cases
      let message = error instanceof Error ? error.message : String(error);
      let code = DirectiveErrorCode.EXECUTION_FAILED;

      if (message.includes('file not found') || message.includes('no such file')) {
        message = `Referenced file not found: ${node.directive.path || node.directive.value}`;
        code = DirectiveErrorCode.FILE_NOT_FOUND;
      } else if (message.includes('circular import') || message.includes('circular reference')) {
        message = 'Circular import detected';
        code = DirectiveErrorCode.CIRCULAR_REFERENCE;
      } else if (message.includes('parameter count') || message.includes('wrong number of parameters')) {
        message = 'Invalid parameter count';
        code = DirectiveErrorCode.VALIDATION_FAILED;
      } else if (message.includes('invalid path') || message.includes('path validation failed')) {
        message = 'Invalid path';
        code = DirectiveErrorCode.VALIDATION_FAILED;
      }

      throw new DirectiveError(
        message,
        node.directive?.kind || 'unknown',
        code,
        { node, cause: error instanceof Error ? error : undefined }
      );
    }
  }
}
```
# IDirectiveService.ts

## Content
```typescript
import { DirectiveNode } from 'meld-spec';
import { IStateService } from '@services/StateService/IStateService.js';
import type { IValidationService } from '@services/ValidationService/IValidationService.js';
import type { IPathService } from '@services/PathService/IPathService.js';
import type { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import type { IParserService } from '@services/ParserService/IParserService.js';
import type { IInterpreterService } from '@services/InterpreterService/IInterpreterService.js';
import type { ICircularityService } from '@services/CircularityService/ICircularityService.js';
import type { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import type { DirectiveResult } from './types.js';

/**
 * Context for directive execution
 */
export interface DirectiveContext {
  /** Current file being processed */
  currentFilePath?: string;
  /** Parent state for nested contexts */
  parentState?: IStateService;
  /** Current state for this directive */
  state: IStateService;
  /** Working directory for command execution */
  workingDirectory?: string;
}

/**
 * Interface for directive handlers
 */
export interface IDirectiveHandler {
  /** The directive kind this handler processes */
  readonly kind: string;

  /**
   * Execute the directive
   * @returns The updated state after directive execution, or a DirectiveResult containing both state and optional replacement node
   */
  execute(
    node: DirectiveNode,
    context: DirectiveContext
  ): Promise<DirectiveResult | IStateService>;
}

/**
 * Service responsible for handling directives
 */
export interface IDirectiveService {
  /**
   * Initialize the DirectiveService with required dependencies
   */
  initialize(
    validationService: IValidationService,
    stateService: IStateService,
    pathService: IPathService,
    fileSystemService: IFileSystemService,
    parserService: IParserService,
    interpreterService: IInterpreterService,
    circularityService: ICircularityService,
    resolutionService: IResolutionService
  ): void;

  /**
   * Update the interpreter service reference
   * This is needed to handle circular dependencies in initialization
   */
  updateInterpreterService(interpreterService: IInterpreterService): void;

  /**
   * Handle a directive node
   * @returns The updated state after directive execution
   */
  handleDirective(
    node: DirectiveNode,
    context: DirectiveContext
  ): Promise<IStateService>;

  /**
   * Register a new directive handler
   */
  registerHandler(handler: IDirectiveHandler): void;

  /**
   * Check if a handler exists for a directive kind
   */
  hasHandler(kind: string): boolean;

  /**
   * Validate a directive node
   */
  validateDirective(node: DirectiveNode): Promise<void>;

  /**
   * Create a child context for nested directives
   */
  createChildContext(
    parentContext: DirectiveContext,
    filePath: string
  ): DirectiveContext;

  /**
   * Process a directive node, validating and executing it
   * Values in the directive will already be interpolated by meld-ast
   * @returns The updated state after directive execution
   * @throws {MeldDirectiveError} If directive processing fails
   */
  processDirective(node: DirectiveNode, parentContext?: DirectiveContext): Promise<IStateService>;

  /**
   * Process multiple directive nodes in sequence
   * @returns The final state after processing all directives
   * @throws {MeldDirectiveError} If any directive processing fails
   */
  processDirectives(nodes: DirectiveNode[], parentContext?: DirectiveContext): Promise<IStateService>;

  /**
   * Check if a directive kind is supported
   */
  supportsDirective(kind: string): boolean;

  /**
   * Get a list of all supported directive kinds
   */
  getSupportedDirectives(): string[];
}
```
# DirectiveError.ts

## Functions
- DirectiveError
- DirectiveError.constructor
- DirectiveError.toJSON
- DirectiveError.getFullCauseMessage

## Content
```typescript
import { DirectiveNode } from 'meld-spec';
import { DirectiveContext } from '@services/DirectiveService/IDirectiveService.js';
import type { Location } from '@core/types/index.js';

/**
 * Error codes for directive failures
 */
export enum DirectiveErrorCode {
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  RESOLUTION_FAILED = 'RESOLUTION_FAILED',
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  HANDLER_NOT_FOUND = 'HANDLER_NOT_FOUND',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  CIRCULAR_REFERENCE = 'CIRCULAR_REFERENCE',
  VARIABLE_NOT_FOUND = 'VARIABLE_NOT_FOUND',
  STATE_ERROR = 'STATE_ERROR',
  INVALID_CONTEXT = 'INVALID_CONTEXT'
}

interface SerializedDirectiveError {
  name: string;
  message: string;
  kind: string;
  code: DirectiveErrorCode;
  location?: Location;
  filePath?: string;
  cause?: string;
  fullCauseMessage?: string;
}

/**
 * Error thrown when directive handling fails
 */
export class DirectiveError extends Error {
  public readonly location?: Location;
  public readonly filePath?: string;
  private readonly errorCause?: Error;

  constructor(
    message: string,
    public readonly kind: string,
    public readonly code: DirectiveErrorCode,
    public readonly details?: {
      node?: DirectiveNode;
      context?: DirectiveContext;
      cause?: Error;
      location?: Location;
      details?: {
        node?: DirectiveNode;
        location?: Location;
      };
    }
  ) {
    // Create message with location if available
    const loc = details?.location ?? details?.node?.location;
    const locationStr = loc ?
      ` at line ${loc.start.line}, column ${loc.start.column}` : '';
    const filePathStr = details?.context?.currentFilePath ?
      ` in ${details.context.currentFilePath}` : '';

    // Include cause message in the full error message if available
    const causeStr = details?.cause ? ` | Caused by: ${details.cause.message}` : '';

    super(`Directive error (${kind}): ${message}${locationStr}${filePathStr}${causeStr}`);
    this.name = 'DirectiveError';

    // Store essential properties
    this.location = details?.location ?? details?.node?.location;
    this.filePath = details?.context?.currentFilePath;
    this.errorCause = details?.cause;

    // Set cause property for standard error chaining
    if (details?.cause) {
      Object.defineProperty(this, 'cause', {
        value: details.cause,
        enumerable: true,
        configurable: true,
        writable: false
      });
    }

    // Ensure proper prototype chain
    Object.setPrototypeOf(this, DirectiveError.prototype);
  }

  // Add public getter for cause that ensures we always return the full error
  public get cause(): Error | undefined {
    return this.errorCause;
  }

  /**
   * Custom serialization to avoid circular references and include only essential info
   */
  toJSON(): SerializedDirectiveError {
    return {
      name: this.name,
      message: this.message,
      kind: this.kind,
      code: this.code,
      location: this.location,
      filePath: this.filePath,
      cause: this.errorCause?.message,
      fullCauseMessage: this.errorCause ? this.getFullCauseMessage(this.errorCause) : undefined
    };
  }

  /**
   * Helper to get the full cause message chain
   */
  private getFullCauseMessage(error: Error): string {
    let message = error.message;
    if ('cause' in error && error.cause instanceof Error) {
      message += ` | Caused by: ${this.getFullCauseMessage(error.cause)}`;
    }
    return message;
  }
}
```
# DataDirectiveHandler.ts

## Functions
- DataDirectiveHandler
- DataDirectiveHandler.constructor
- DataDirectiveHandler.execute
- DataDirectiveHandler.resolveObjectFields
- DataDirectiveHandler.validateSchema

## Content
```typescript
import { DirectiveNode } from 'meld-spec';
// TODO: Use meld-ast nodes and types instead of meld-spec directly
// TODO: Import MeldDirectiveError from core/errors for proper error hierarchy

import { IDirectiveHandler, DirectiveContext } from '@services/DirectiveService/IDirectiveService.js';
import { IValidationService } from '@services/ValidationService/IValidationService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { IResolutionService, ResolutionContext } from '@services/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/ResolutionService/ResolutionContextFactory.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { DirectiveError, DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';

/**
 * Handler for @data directives
 * Stores data values in state after resolving variables and processing embedded content
 */
export class DataDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'data';

  constructor(
    private validationService: IValidationService,
    private stateService: IStateService,
    private resolutionService: IResolutionService
  ) {}

  public async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    await this.validationService.validate(node);

    const { identifier, value } = node.directive;
    const resolutionContext: ResolutionContext = {
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      currentFilePath: context.currentFilePath,
      state: context.state
    };

    try {
      let parsedValue: unknown;

      // Handle both string and object values
      if (typeof value === 'string') {
        // First resolve any variables in the JSON string
        const resolvedJsonString = await this.resolutionService.resolveInContext(value, resolutionContext);

        // Then parse the JSON
        try {
          parsedValue = JSON.parse(resolvedJsonString);
          // Recursively resolve any variables in the parsed object
          parsedValue = await this.resolveObjectFields(parsedValue, resolutionContext);
        } catch (error) {
          if (error instanceof Error) {
            throw new DirectiveError(
              `Invalid JSON in data directive: ${error.message}`,
              'data',
              DirectiveErrorCode.VALIDATION_FAILED,
              { node, context }
            );
          }
          throw error;
        }
      } else {
        // Value is already an object, resolve variables in it
        parsedValue = await this.resolveObjectFields(value, resolutionContext);
      }

      // Store the resolved value in a new state
      const newState = context.state.clone();
      newState.setDataVar(identifier, parsedValue);
      return newState;
    } catch (error) {
      if (error instanceof Error) {
        throw new DirectiveError(
          `Error processing data directive: ${error.message}`,
          'data',
          DirectiveErrorCode.EXECUTION_FAILED,
          { node, context }
        );
      }
      throw error;
    }
  }

  /**
   * Recursively resolve variables in object fields
   */
  private async resolveObjectFields(
    obj: any,
    context: ResolutionContext
  ): Promise<any> {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      // If the string contains any variable references, resolve them
      if (obj.includes('${') || obj.includes('#{') || obj.includes('$') || obj.includes('`')) {
        return this.resolutionService.resolveInContext(obj, context);
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      return Promise.all(
        obj.map(item => this.resolveObjectFields(item, context))
      );
    }

    if (typeof obj === 'object') {
      const resolved: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        // Keep original key, only resolve value
        resolved[key] = await this.resolveObjectFields(value, context);
      }
      return resolved;
    }

    // For other primitive types (number, boolean, etc), return as is
    return obj;
  }

  /**
   * Validate resolved value against schema
   */
  private async validateSchema(
    value: any,
    schema: string,
    node: DirectiveNode
  ): Promise<void> {
    try {
      // TODO: Implement schema validation once schema system is defined
      // For now, just log that we would validate
      logger.debug('Schema validation requested', {
        schema,
        location: node.location
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new DirectiveError(
          `Schema validation failed: ${error.message}`,
          'data',
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }
      throw error;
    }
  }
}
```
# DefineDirectiveHandler.ts

## Functions
- DefineDirectiveHandler
- DefineDirectiveHandler.constructor
- DefineDirectiveHandler.execute
- DefineDirectiveHandler.parseIdentifier
- DefineDirectiveHandler.processCommand
- DefineDirectiveHandler.validateParameters
- DefineDirectiveHandler.extractParameterReferences

## Content
```typescript
import { IDirectiveHandler, DirectiveContext } from '../../IDirectiveService.js';
import { IValidationService } from '@services/ValidationService/IValidationService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import { DirectiveNode } from 'meld-spec';
import { DirectiveError, DirectiveErrorCode } from '../../errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger.js';

interface CommandDefinition {
  parameters: string[];
  command: string;
  metadata?: {
    risk?: 'high' | 'med' | 'low';
    about?: string;
    meta?: Record<string, unknown>;
  };
}

export class DefineDirectiveHandler implements IDirectiveHandler {
  public readonly kind = 'define';

  constructor(
    private validationService: IValidationService,
    private stateService: IStateService,
    private resolutionService: IResolutionService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Extract and validate identifier parts
      const { identifier, value } = node.directive;
      const { name, metadata } = this.parseIdentifier(identifier);

      // 3. Process command value
      const commandDef = await this.processCommand(value, node);

      // 4. Create new state for modifications
      const newState = context.state.clone();

      // 5. Store command with metadata
      newState.setCommand(name, {
        ...commandDef,
        ...(metadata && { metadata })
      });

      return newState;
    } catch (error) {
      // Wrap in DirectiveError if needed
      if (error instanceof DirectiveError) {
        // Ensure location is set by creating a new error if needed
        if (!error.details?.location && node.location) {
          const wrappedError = new DirectiveError(
            error.message,
            error.kind,
            error.code,
            {
              ...error.details,
              location: node.location
            }
          );
          throw wrappedError;
        }
        throw error;
      }

      // Handle resolution errors
      const resolutionError = new DirectiveError(
        error instanceof Error ? error.message : 'Unknown error in define directive',
        this.kind,
        DirectiveErrorCode.RESOLUTION_FAILED,
        {
          node,
          context,
          cause: error instanceof Error ? error : undefined,
          location: node.location
        }
      );

      throw resolutionError;
    }
  }

  private parseIdentifier(identifier: string): { name: string; metadata?: CommandDefinition['metadata'] } {
    // Check for metadata fields
    const parts = identifier.split('.');
    const name = parts[0];

    if (!name) {
      throw new DirectiveError(
        'Define directive requires a valid identifier',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }

    // Handle metadata if present
    if (parts.length > 1) {
      const metaType = parts[1];
      const metaValue = parts[2];

      if (metaType === 'risk') {
        if (!['high', 'med', 'low'].includes(metaValue)) {
          throw new DirectiveError(
            'Invalid risk level. Must be high, med, or low',
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED
          );
        }
        return { name, metadata: { risk: metaValue as 'high' | 'med' | 'low' } };
      }

      if (metaType === 'about') {
        return { name, metadata: { about: 'This is a description' } };
      }

      throw new DirectiveError(
        'Invalid metadata field. Only risk and about are supported',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }

    return { name };
  }

  private async processCommand(value: string, node: DirectiveNode): Promise<Omit<CommandDefinition, 'metadata'>> {
    // For empty commands, just return empty string
    if (!value) {
      return {
        parameters: [],
        command: ''
      };
    }

    // Extract parameters from command value
    const paramRefs = this.extractParameterReferences(value);

    // Try to parse as JSON first (for test factory format)
    try {
      const parsed = JSON.parse(value);
      if (parsed.command?.kind === 'run' && typeof parsed.command.command === 'string') {
        // Validate parameters before processing command
        const parameters = this.validateParameters(parsed.parameters || [], paramRefs, node);

        // Store the raw command
        const command = parsed.command.command.trim();
        return {
          parameters,
          command
        };
      }
    } catch (e) {
      // Not JSON, treat as raw command
    }

    // Extract command from directive value
    const commandMatch = value.match(/=\s*@run\s*\[(.*?)\]/);
    if (!commandMatch) {
      throw new DirectiveError(
        'Invalid command format. Expected @run directive',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        { node }
      );
    }

    // Extract parameters from the command definition
    const paramMatch = value.match(/^(\w+)(?:\((.*?)\))?/);
    const declaredParams = paramMatch?.[2]?.split(',').map(p => p.trim()).filter(Boolean) || [];

    // Validate parameters after ensuring command format
    const parameters = this.validateParameters(declaredParams, paramRefs, node);

    // Store just the command portion
    return {
      parameters,
      command: commandMatch[1].trim()
    };
  }

  private validateParameters(declaredParams: string[], referencedParams: string[], node: DirectiveNode): string[] {
    // Check for duplicates first
    const uniqueParams = new Set(declaredParams);
    if (uniqueParams.size !== declaredParams.length) {
      throw new DirectiveError(
        'Duplicate parameter names are not allowed',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        { node }
      );
    }

    // Validate parameter names
    for (const param of declaredParams) {
      if (!/^[a-zA-Z_]\w*$/.test(param)) {
        throw new DirectiveError(
          `Invalid parameter name: ${param}. Must start with letter or underscore and contain only letters, numbers, and underscores`,
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }
    }

    // Validate that all referenced parameters are declared
    for (const ref of referencedParams) {
      if (!uniqueParams.has(ref)) {
        throw new DirectiveError(
          `Parameter ${ref} is referenced in command but not declared`,
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }
    }

    return Array.from(uniqueParams);
  }

  private extractParameterReferences(command: string): string[] {
    const paramPattern = /\${(\w+)}/g;
    const params = new Set<string>();
    let match;

    while ((match = paramPattern.exec(command)) !== null) {
      params.add(match[1]);
    }

    return Array.from(params);
  }
}
```
# PathDirectiveHandler.ts

## Functions
- PathDirectiveHandler
- PathDirectiveHandler.constructor
- PathDirectiveHandler.execute

## Content
```typescript
import { DirectiveNode, DirectiveData } from 'meld-spec';
import { IDirectiveHandler, DirectiveContext } from '@services/DirectiveService/IDirectiveService.js';
import { IValidationService } from '@services/ValidationService/IValidationService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/ResolutionService/ResolutionContextFactory.js';
import { DirectiveError, DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger';

interface PathDirective extends DirectiveData {
  kind: 'path';
  identifier: string;
  value: string;
}

/**
 * Handler for @path directives
 * Stores path values in state after resolving variables
 */
export class PathDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'path';

  constructor(
    private validationService: IValidationService,
    private stateService: IStateService,
    private resolutionService: IResolutionService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    logger.debug('Processing path directive', {
      location: node.location,
      context
    });

    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Get identifier and value from directive
      const { identifier, value } = node.directive;

      // 3. Process value based on type
      if (!value) {
        throw new DirectiveError(
          'Path directive requires a value',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }

      // Create a new state for modifications
      const newState = context.state.clone();

      // Create resolution context
      const resolutionContext = ResolutionContextFactory.forPathDirective(
        context.currentFilePath
      );

      // Resolve variables in the value
      const resolvedValue = await this.resolutionService.resolveInContext(
        value,
        resolutionContext
      );

      // 4. Store in state
      newState.setPathVar(identifier, resolvedValue);

      logger.debug('Path directive processed successfully', {
        identifier,
        value: resolvedValue,
        location: node.location
      });

      return newState;
    } catch (error: any) {
      logger.error('Failed to process path directive', {
        location: node.location,
        error
      });

      // Wrap in DirectiveError if needed
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        error?.message || 'Unknown error',
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          node,
          context,
          cause: error instanceof Error ? error : new Error(String(error))
        }
      );
    }
  }
}
```
# TextDirectiveHandler.ts

## Functions
- TextDirectiveHandler
- TextDirectiveHandler.constructor
- TextDirectiveHandler.isStringLiteral
- TextDirectiveHandler.execute

## Content
```typescript
import { DirectiveNode } from 'meld-spec';
import { IDirectiveHandler, DirectiveContext } from '@services/DirectiveService/IDirectiveService.js';
import { IValidationService } from '@services/ValidationService/IValidationService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/ResolutionService/ResolutionContextFactory.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { DirectiveError, DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';
import { StringLiteralHandler } from '@services/ResolutionService/resolvers/StringLiteralHandler.js';
import { StringConcatenationHandler } from '@services/ResolutionService/resolvers/StringConcatenationHandler.js';
import { VariableReferenceResolver } from '@services/ResolutionService/resolvers/VariableReferenceResolver.js';
import { ResolutionError } from '@services/ResolutionService/errors/ResolutionError.js';

/**
 * Handler for @text directives
 * Stores text values in state after resolving variables and processing embedded content
 */
export class TextDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'text';
  private stringLiteralHandler: StringLiteralHandler;
  private stringConcatenationHandler: StringConcatenationHandler;
  private variableReferenceResolver: VariableReferenceResolver;

  constructor(
    private validationService: IValidationService,
    private stateService: IStateService,
    private resolutionService: IResolutionService
  ) {
    this.stringLiteralHandler = new StringLiteralHandler();
    this.stringConcatenationHandler = new StringConcatenationHandler(resolutionService);
    this.variableReferenceResolver = new VariableReferenceResolver(
      stateService,
      resolutionService
    );
  }

  /**
   * Checks if a value appears to be a string literal
   * This is a preliminary check before full validation
   */
  private isStringLiteral(value: string): boolean {
    const firstChar = value[0];
    const lastChar = value[value.length - 1];
    const validQuotes = ["'", '"', '`'];

    // Check for matching quotes
    if (!validQuotes.includes(firstChar) || firstChar !== lastChar) {
      return false;
    }

    // Check for unclosed quotes
    let isEscaped = false;
    for (let i = 1; i < value.length - 1; i++) {
      if (value[i] === '\\') {
        isEscaped = !isEscaped;
      } else if (value[i] === firstChar && !isEscaped) {
        return false; // Found an unescaped quote in the middle
      } else {
        isEscaped = false;
      }
    }

    return true;
  }

  public async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    try {
      // 1. Create a new state for modifications
      const newState = context.state.clone();

      // 2. Validate directive structure
      try {
        if (!node || !node.directive) {
          throw new DirectiveError(
            'Invalid directive: missing required fields',
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED,
            { node, context }
          );
        }
        await this.validationService.validate(node);
      } catch (error) {
        // If it's already a DirectiveError, just rethrow
        if (error instanceof DirectiveError) {
          throw error;
        }
        // Otherwise wrap in DirectiveError
        const errorMessage = error instanceof Error ? error.message : 'Text directive validation failed';
        throw new DirectiveError(
          errorMessage,
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          {
            node,
            context,
            cause: error instanceof Error ? error : new Error(errorMessage),
            location: node.location
          }
        );
      }

      // 3. Get identifier and value from directive
      const { identifier, value } = node.directive;

      // 4. Handle the value based on its type
      let resolvedValue: string;

      // Create a resolution context that includes the original state
      const resolutionContext = {
        currentFilePath: context.currentFilePath,
        allowedVariableTypes: {
          text: true,
          data: true,
          path: true,
          command: true
        },
        state: context.state
      };

      // Check for string concatenation first
      if (this.stringConcatenationHandler.hasConcatenation(value)) {
        try {
          resolvedValue = await this.stringConcatenationHandler.resolveConcatenation(value, resolutionContext);
        } catch (error) {
          if (error instanceof ResolutionError) {
            throw new DirectiveError(
              'Failed to resolve string concatenation',
              this.kind,
              DirectiveErrorCode.RESOLUTION_FAILED,
              {
                node,
                context,
                cause: error,
                location: node.location
              }
            );
          }
          throw error;
        }
      } else if (this.stringLiteralHandler.isStringLiteral(value)) {
        // For string literals, strip the quotes and handle escapes
        resolvedValue = this.stringLiteralHandler.parseLiteral(value);
      } else {
        // For values with variables, resolve them using the resolution service
        try {
          resolvedValue = await this.resolutionService.resolveInContext(value, resolutionContext);
        } catch (error) {
          if (error instanceof ResolutionError) {
            throw new DirectiveError(
              'Failed to resolve variables in text directive',
              this.kind,
              DirectiveErrorCode.RESOLUTION_FAILED,
              {
                node,
                context,
                cause: error,
                location: node.location
              }
            );
          }
          throw error;
        }
      }

      // 5. Set the resolved value in the new state
      newState.setTextVar(identifier, resolvedValue);

      return newState;
    } catch (error) {
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        'Failed to process text directive',
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          node,
          context,
          cause: error instanceof Error ? error : undefined,
          location: node.location
        }
      );
    }
  }
}
```
# EmbedDirectiveHandler.ts

## Functions
- EmbedDirectiveHandler
- EmbedDirectiveHandler.constructor
- EmbedDirectiveHandler.execute
- EmbedDirectiveHandler.applyHeadingLevel
- EmbedDirectiveHandler.wrapUnderHeader

## Content
```typescript
import { DirectiveNode, MeldNode, TextNode } from 'meld-spec';
import { IDirectiveHandler, DirectiveContext } from '@services/DirectiveService/IDirectiveService.js';
import { DirectiveResult } from '@services/DirectiveService/types.js';
import { IValidationService } from '@services/ValidationService/IValidationService.js';
import { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { ICircularityService } from '@services/CircularityService/ICircularityService.js';
import { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/ParserService/IParserService.js';
import { IInterpreterService } from '@services/InterpreterService/IInterpreterService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';
import { embedLogger } from '@core/utils/logger.js';

export interface ILogger {
  debug: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
}

/**
 * Handler for @embed directives
 * Embeds content from files or sections of files
 */
export class EmbedDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'embed';

  constructor(
    private validationService: IValidationService,
    private resolutionService: IResolutionService,
    private stateService: IStateService,
    private circularityService: ICircularityService,
    private fileSystemService: IFileSystemService,
    private parserService: IParserService,
    private interpreterService: IInterpreterService,
    private logger: ILogger = embedLogger
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
    this.logger.debug('Processing embed directive', {
      location: node.location,
      context
    });

    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Get path and section from directive
      const { path, section, headingLevel, underHeader } = node.directive;

      // 3. Process path
      if (!path) {
        throw new DirectiveError(
          'Embed directive requires a path',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }

      // Create a new state for modifications
      const newState = context.state.clone();

      // Create resolution context
      const resolutionContext = {
        currentFilePath: context.currentFilePath,
        state: context.state,
        allowedVariableTypes: {
          text: true,
          data: true,
          path: true,
          command: false
        }
      };

      // Resolve variables in path
      const resolvedPath = await this.resolutionService.resolveInContext(
        path,
        resolutionContext
      );

      // Check for circular imports
      this.circularityService.beginImport(resolvedPath);

      try {
        // Check if file exists
        if (!await this.fileSystemService.exists(resolvedPath)) {
          throw new DirectiveError(
            `Embed file not found: ${resolvedPath}`,
            this.kind,
            DirectiveErrorCode.FILE_NOT_FOUND,
            { node, context }
          );
        }

        // Read file content
        const content = await this.fileSystemService.readFile(resolvedPath);

        // Extract section if specified
        let processedContent = content;
        if (section) {
          const resolvedSection = await this.resolutionService.resolveInContext(
            section,
            resolutionContext
          );
          processedContent = await this.resolutionService.extractSection(
            content,
            resolvedSection
          );
        }

        // Apply heading level if specified
        if (headingLevel !== undefined) {
          processedContent = this.applyHeadingLevel(processedContent, headingLevel);
        }

        // Apply under header if specified
        if (underHeader) {
          processedContent = this.wrapUnderHeader(processedContent, underHeader);
        }

        // Parse content
        const nodes = await this.parserService.parse(processedContent);

        // Create child state for interpretation
        const childState = newState.createChildState();

        // Interpret content
        const interpretedState = await this.interpreterService.interpret(nodes, {
          initialState: childState,
          filePath: resolvedPath,
          mergeState: true
        });

        // Merge interpreted state back
        newState.mergeChildState(interpretedState);

        this.logger.debug('Embed directive processed successfully', {
          path: resolvedPath,
          section,
          location: node.location
        });

        // If transformation is enabled, return a replacement node
        if (context.state.isTransformationEnabled?.()) {
          const replacement: TextNode = {
            type: 'Text',
            content: processedContent,
            location: node.location
          };
          return { state: newState, replacement };
        }

        return { state: newState };
      } finally {
        // Always end import tracking
        this.circularityService.endImport(resolvedPath);
      }
    } catch (error) {
      this.logger.error('Failed to process embed directive', {
        location: node.location,
        error
      });

      // Wrap in DirectiveError if needed
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        error instanceof Error ? error.message : 'Unknown error',
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          node,
          context,
          cause: error instanceof Error ? error : new Error(String(error))
        }
      );
    }
  }

  private applyHeadingLevel(content: string, level: number): string {
    // Validate level is between 1 and 6
    if (level < 1 || level > 6) {
      throw new DirectiveError(
        `Invalid heading level: ${level}. Must be between 1 and 6.`,
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }

    // Add the heading markers
    return '#'.repeat(level) + ' ' + content;
  }

  private wrapUnderHeader(content: string, header: string): string {
    return `${header}\n\n${content}`;
  }
}
```
# ImportDirectiveHandler.ts

## Functions
- ImportDirectiveHandler
- ImportDirectiveHandler.constructor
- ImportDirectiveHandler.execute
- ImportDirectiveHandler.extractPath
- ImportDirectiveHandler.parseImportList
- ImportDirectiveHandler.importAllVariables
- ImportDirectiveHandler.importVariable

## Content
```typescript
import { DirectiveNode, MeldNode, TextNode } from 'meld-spec';
import type { DirectiveContext, IDirectiveHandler } from '@services/DirectiveService/IDirectiveService.js';
import type { DirectiveResult } from '@services/DirectiveService/types.js';
import { IValidationService } from '@services/ValidationService/IValidationService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import { IParserService } from '@services/ParserService/IParserService.js';
import { IInterpreterService } from '@services/InterpreterService/IInterpreterService.js';
import { ICircularityService } from '@services/CircularityService/ICircularityService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger.js';

/**
 * Handler for @import directives
 * Imports variables from other files
 * When transformation is enabled, the directive is removed from output
 */
export class ImportDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'import';

  constructor(
    private validationService: IValidationService,
    private resolutionService: IResolutionService,
    private stateService: IStateService,
    private fileSystemService: IFileSystemService,
    private parserService: IParserService,
    private interpreterService: IInterpreterService,
    private circularityService: ICircularityService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult | IStateService> {
    let resolvedFullPath: string | undefined;

    try {
      // Validate the directive
      await this.validationService.validate(node);

      // Get path and import list from directive
      const { path, value, identifier, importList } = node.directive;
      const resolvedPath = path || this.extractPath(value);
      // Only use identifier as import list if it's not 'import' (which is the directive identifier)
      const resolvedImportList = importList || (identifier !== 'import' ? identifier : undefined);

      if (!resolvedPath) {
        throw new DirectiveError(
          'Import directive requires a path',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }

      // Create a new state for modifications
      const clonedState = context.state.clone();

      // Create resolution context
      const resolutionContext = {
        currentFilePath: context.currentFilePath,
        state: context.state,
        allowedVariableTypes: {
          text: true,
          data: true,
          path: true,
          command: false
        }
      };

      // Resolve the path using the resolution service
      resolvedFullPath = await this.resolutionService.resolveInContext(
        resolvedPath,
        resolutionContext
      );

      // Check for circular imports before proceeding
      try {
        this.circularityService.beginImport(resolvedFullPath);
      } catch (error) {
        throw new DirectiveError(
          error?.message || 'Circular import detected',
          this.kind,
          DirectiveErrorCode.CIRCULAR_IMPORT,
          { node, context, cause: error }
        );
      }

      try {
        // Check if file exists
        if (!await this.fileSystemService.exists(resolvedFullPath)) {
          throw new DirectiveError(
            `Import file not found: [${resolvedPath}]`,
            this.kind,
            DirectiveErrorCode.FILE_NOT_FOUND,
            { node, context }
          );
        }

        // Read and parse the file
        const content = await this.fileSystemService.readFile(resolvedFullPath);
        const nodes = await this.parserService.parse(content);

        // Create child state for interpretation
        const childState = clonedState.createChildState();

        // Interpret content
        const interpretedState = await this.interpreterService.interpret(nodes, {
          initialState: childState,
          filePath: resolvedFullPath,
          mergeState: false
        });

        // Import variables based on import list
        const imports = this.parseImportList(resolvedImportList || '*');
        for (const { name, alias } of imports) {
          if (name === '*') {
            this.importAllVariables(interpretedState, clonedState);
          } else {
            this.importVariable(name, alias, interpretedState, clonedState);
          }
        }

        logger.debug('Import directive processed successfully', {
          path: resolvedPath,
          importList: resolvedImportList,
          location: node.location
        });

        // If transformation is enabled, return an empty text node to remove the directive from output
        if (context.state.isTransformationEnabled?.()) {
          const replacement: TextNode = {
            type: 'Text',
            content: '',
            location: node.location
          };
          return { state: clonedState, replacement };
        }

        return clonedState;
      } finally {
        // Always end import tracking
        if (resolvedFullPath) {
          this.circularityService.endImport(resolvedFullPath);
        }
      }
    } catch (error) {
      // Always end import tracking on error
      if (resolvedFullPath) {
        this.circularityService.endImport(resolvedFullPath);
      }

      logger.error('Failed to process import directive', {
        location: node.location,
        error
      });

      // Wrap in DirectiveError if needed
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        error?.message || 'Unknown error',
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          node,
          context,
          cause: error instanceof Error ? error : new Error(String(error))
        }
      );
    }
  }

  private extractPath(value: string): string | undefined {
    if (!value) return undefined;
    // Remove brackets if present and trim whitespace
    return value.replace(/^\[(.*)\]$/, '$1').trim();
  }

  private parseImportList(importList: string): Array<{ name: string; alias?: string }> {
    if (!importList) return [{ name: '*' }];  // Default to importing everything
    if (importList === '*') return [{ name: '*' }];

    // Remove brackets if present and split by commas
    const cleanList = importList.replace(/^\[(.*)\]$/, '$1');
    const parts = cleanList.split(',').map(part => part.trim());

    return parts.map(part => {
      // Handle colon syntax (var:alias)
      if (part.includes(':')) {
        const [name, alias] = part.split(':').map(s => s.trim());
        return { name, alias };
      }

      // Handle 'as' syntax (var as alias)
      const asParts = part.split(/\s+as\s+/);
      if (asParts.length > 1) {
        const [name, alias] = asParts.map(s => s.trim());
        return { name, alias };
      }

      // Single variable import
      return { name: part };
    });
  }

  private importAllVariables(sourceState: IStateService, targetState: IStateService): void {
    // Import all text variables
    const textVars = sourceState.getAllTextVars();
    for (const [name, value] of textVars.entries()) {
      targetState.setTextVar(name, value);
    }

    // Import all data variables
    const dataVars = sourceState.getAllDataVars();
    for (const [name, value] of dataVars.entries()) {
      targetState.setDataVar(name, value);
    }

    // Import all path variables
    const pathVars = sourceState.getAllPathVars();
    for (const [name, value] of pathVars.entries()) {
      targetState.setPathVar(name, value);
    }

    // Import all commands
    const commands = sourceState.getAllCommands();
    for (const [name, value] of commands.entries()) {
      targetState.setCommand(name, value);
    }
  }

  private importVariable(name: string, alias: string | undefined, sourceState: IStateService, targetState: IStateService): void {
    // Try each variable type in order
    const textValue = sourceState.getTextVar(name);
    if (textValue !== undefined) {
      targetState.setTextVar(alias || name, textValue);
      return;
    }

    const dataValue = sourceState.getDataVar(name);
    if (dataValue !== undefined) {
      targetState.setDataVar(alias || name, dataValue);
      return;
    }

    const pathValue = sourceState.getPathVar(name);
    if (pathValue !== undefined) {
      targetState.setPathVar(alias || name, pathValue);
      return;
    }

    const commandValue = sourceState.getCommand(name);
    if (commandValue !== undefined) {
      targetState.setCommand(alias || name, commandValue);
      return;
    }

    // If we get here, the variable wasn't found
    throw new DirectiveError(
      `Variable not found: ${name}`,
      this.kind,
      DirectiveErrorCode.VARIABLE_NOT_FOUND
    );
  }
}
```
# RunDirectiveHandler.ts

## Functions
- RunDirectiveHandler
- RunDirectiveHandler.constructor
- RunDirectiveHandler.execute

## Content
```typescript
import type { DirectiveNode, DirectiveContext, MeldNode, TextNode } from 'meld-spec';
import type { IValidationService } from '@services/ValidationService/IValidationService.js';
import type { IStateService } from '@services/StateService/IStateService.js';
import type { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/FileSystemService/IFileSystemService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';
import { directiveLogger } from '../../../../core/utils/logger.js';
import type { DirectiveResult } from '@services/DirectiveService/types.js';
import type { IDirectiveHandler } from '@services/DirectiveService/IDirectiveService.js';

/**
 * Handler for @run directives
 * Executes commands and stores their output in state
 */
export class RunDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'run';

  constructor(
    private validationService: IValidationService,
    private resolutionService: IResolutionService,
    private stateService: IStateService,
    private fileSystemService: IFileSystemService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
    const { directive } = node;
    const { state } = context;
    const clonedState = state.clone();

    try {
      // Validate the directive
      await this.validationService.validate(node);

      // Resolve the command
      const resolvedCommand = await this.resolutionService.resolveInContext(
        directive.command,
        context
      );

      // Execute the command
      const { stdout, stderr } = await this.fileSystemService.executeCommand(
        resolvedCommand,
        {
          cwd: context.workingDirectory || this.fileSystemService.getCwd()
        }
      );

      // Store the output in state variables
      if (directive.output) {
        clonedState.setTextVar(directive.output, stdout);
      } else {
        clonedState.setTextVar('stdout', stdout);
        if (stderr) {
          clonedState.setTextVar('stderr', stderr);
        }
      }

      // If transformation is enabled, return a replacement node with the command output
      if (clonedState.isTransformationEnabled()) {
        const content = stdout && stderr ? `${stdout}\n${stderr}` : stdout || stderr;
        const replacement: TextNode = {
          type: 'Text',
          content,
          location: node.location
        };
        return { state: clonedState, replacementNode: replacement };
      }

      return { state: clonedState };
    } catch (error) {
      directiveLogger.error('Error executing run directive:', error);
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        `Failed to execute command: ${error.message}`,
        'run',
        DirectiveErrorCode.EXECUTION_FAILED
      );
    }
  }
}
```
# IOutputService.ts

## Content
```typescript
import type { MeldNode } from 'meld-spec';
import type { IStateService } from '@services/StateService/IStateService.js';

export type OutputFormat = 'markdown' | 'llm';

export interface OutputOptions {
  /**
   * Whether to include state variables in the output
   * @default false
   */
  includeState?: boolean;

  /**
   * Whether to preserve original formatting (whitespace, newlines)
   * @default true
   */
  preserveFormatting?: boolean;

  /**
   * Custom format-specific options
   */
  formatOptions?: Record<string, unknown>;
}

export interface IOutputService {
  /**
   * Convert Meld nodes and state to the specified output format.
   * If state.isTransformationEnabled() is true and state.getTransformedNodes() is available,
   * the transformed nodes will be used instead of the input nodes.
   *
   * In non-transformation mode:
   * - Definition directives (@text, @data, @path, @import, @define) are omitted
   * - Execution directives (@run, @embed) show placeholders
   *
   * In transformation mode:
   * - All directives are replaced with their transformed results
   * - Plain text and code fences are preserved as-is
   *
   * @throws {MeldOutputError} If conversion fails
   */
  convert(
    nodes: MeldNode[],
    state: IStateService,
    format: OutputFormat,
    options?: OutputOptions
  ): Promise<string>;

  /**
   * Register a custom format converter
   */
  registerFormat(
    format: string,
    converter: (nodes: MeldNode[], state: IStateService, options?: OutputOptions) => Promise<string>
  ): void;

  /**
   * Check if a format is supported
   */
  supportsFormat(format: string): boolean;

  /**
   * Get a list of all supported formats
   */
  getSupportedFormats(): string[];
}
```
# OutputService.ts

## Functions
- OutputService
- OutputService.constructor
- OutputService.convert
- OutputService.registerFormat
- OutputService.supportsFormat
- OutputService.getSupportedFormats
- OutputService.convertToMarkdown
- OutputService.convertToLLMXML
- OutputService.formatStateVariables
- OutputService.nodeToMarkdown

## Content
```typescript
import type { IStateService } from '@services/StateService/IStateService.js';
import { IOutputService, type OutputFormat, type OutputOptions } from './IOutputService.js';
import type { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import type { MeldNode, TextNode, CodeFenceNode, DirectiveNode } from 'meld-spec';
import { outputLogger as logger } from '@core/utils/logger.js';
import { MeldOutputError } from '@core/errors/MeldOutputError.js';

type FormatConverter = (
  nodes: MeldNode[],
  state: IStateService,
  options?: OutputOptions
) => Promise<string>;

const DEFAULT_OPTIONS: Required<OutputOptions> = {
  includeState: false,
  preserveFormatting: true,
  formatOptions: {}
};

export class OutputService implements IOutputService {
  private formatters = new Map<string, FormatConverter>();

  constructor() {
    // Register default formatters
    this.registerFormat('markdown', this.convertToMarkdown.bind(this));
    this.registerFormat('md', this.convertToMarkdown.bind(this));
    this.registerFormat('llm', this.convertToLLMXML.bind(this));

    logger.debug('OutputService initialized with default formatters', {
      formats: Array.from(this.formatters.keys())
    });
  }

  async convert(
    nodes: MeldNode[],
    state: IStateService,
    format: OutputFormat,
    options?: OutputOptions
  ): Promise<string> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    logger.debug('Converting output', {
      format,
      nodeCount: nodes.length,
      options: opts
    });

    // Use transformed nodes if available in state
    const nodesToProcess = state.isTransformationEnabled() && state.getTransformedNodes().length > 0
      ? state.getTransformedNodes()
      : nodes;

    const formatter = this.formatters.get(format);
    if (!formatter) {
      throw new MeldOutputError(`Unsupported format: ${format}`, format);
    }

    try {
      const result = await formatter(nodesToProcess, state, opts);

      logger.debug('Successfully converted output', {
        format,
        resultLength: result.length
      });

      return result;
    } catch (error) {
      logger.error('Failed to convert output', {
        format,
        error
      });

      if (error instanceof MeldOutputError) {
        throw error;
      }

      throw new MeldOutputError(
        'Failed to convert output',
        format,
        error instanceof Error ? error : undefined
      );
    }
  }

  registerFormat(
    format: string,
    converter: FormatConverter
  ): void {
    if (!format || typeof format !== 'string') {
      throw new Error('Format must be a non-empty string');
    }
    if (typeof converter !== 'function') {
      throw new Error('Converter must be a function');
    }

    this.formatters.set(format, converter);
    logger.debug('Registered format converter', { format });
  }

  supportsFormat(format: string): boolean {
    return this.formatters.has(format);
  }

  getSupportedFormats(): string[] {
    return Array.from(this.formatters.keys());
  }

  private async convertToMarkdown(
    nodes: MeldNode[],
    state: IStateService,
    options?: OutputOptions
  ): Promise<string> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    try {
      let output = '';

      // Add state variables if requested
      if (opts.includeState) {
        output += this.formatStateVariables(state);
        if (nodes.length > 0) {
          output += '\n\n';
        }
      }

      // Check if we're using transformed nodes
      const isTransformed = state.isTransformationEnabled() && state.getTransformedNodes() !== undefined;

      // Process nodes
      for (const node of nodes) {
        output += await this.nodeToMarkdown(node, opts, isTransformed, state);
      }

      // Clean up extra newlines if not preserving formatting
      if (!opts.preserveFormatting) {
        output = output.replace(/\n{3,}/g, '\n\n').trim();
      }

      return output;
    } catch (error) {
      throw new MeldOutputError(
        'Failed to convert to markdown',
        'markdown',
        error instanceof Error ? error : undefined
      );
    }
  }

  private async convertToLLMXML(
    nodes: MeldNode[],
    state: IStateService,
    options?: OutputOptions
  ): Promise<string> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    try {
      // First convert everything to markdown format
      const markdown = await this.convertToMarkdown(nodes, state, opts);

      // Use llmxml to handle sectioning the markdown content
      const { createLLMXML } = await import('llmxml');
      const llmxml = createLLMXML();
      return llmxml.toXML(markdown);
    } catch (error) {
      throw new MeldOutputError(
        'Failed to convert to LLM XML',
        'llm',
        error instanceof Error ? error : undefined
      );
    }
  }

  private formatStateVariables(state: IStateService): string {
    let output = '';

    // Format text variables
    const textVars = state.getAllTextVars();
    if (textVars.size > 0) {
      output += '# Text Variables\n\n';
      for (const [name, value] of textVars) {
        output += `@text ${name} = "${value}"\n`;
      }
    }

    // Format data variables
    const dataVars = state.getAllDataVars();
    if (dataVars.size > 0) {
      if (output) output += '\n';
      output += '# Data Variables\n\n';
      for (const [name, value] of dataVars) {
        output += `@data ${name} = ${JSON.stringify(value, null, 2)}\n`;
      }
    }

    return output;
  }

  private async nodeToMarkdown(
    node: MeldNode,
    options: OutputOptions,
    isTransformed: boolean = false,
    state: IStateService
  ): Promise<string> {
    try {
      switch (node.type) {
        case 'Text':
          const textNode = node as TextNode;
          return textNode.content;
        case 'CodeFence':
          const codeNode = node as CodeFenceNode;
          return `\`\`\`${codeNode.language || ''}\n${codeNode.content}\n\`\`\`\n`;
        case 'Directive':
          const directiveNode = node as DirectiveNode;
          const kind = directiveNode.directive.kind;

          // In transformed mode, directives should be treated as their transformed output
          if (isTransformed) {
            // For run directives, show the command output
            if (kind === 'run') {
              return directiveNode.directive.command + '\n';
            }
            // For embed directives, show the embedded content
            if (kind === 'embed') {
              return directiveNode.directive.path + '\n';
            }
            // For other directives in transformed mode, return empty string
            return '';
          }

          // In non-transformation mode, handle directives normally
          if (['text', 'data', 'path', 'import', 'define'].includes(kind)) {
            return '';
          }
          if (kind === 'run') {
            const command = directiveNode.directive.command;
            return `${command}\n`;
          }
          // For other execution directives, return empty string for now
          return '';
        default:
          throw new MeldOutputError(`Unknown node type: ${(node as any).type}`, 'markdown');
      }
    } catch (error) {
      throw new MeldOutputError(
        'Failed to convert node to markdown',
        'markdown',
        error instanceof Error ? error : undefined
      );
    }
  }
}
```

\======= END SERVICES CODE AND TESTS

\======= YOUR TASK

Deliver a complete punch list of every change required.

It is not necessary to write the code, just create an exhaustive and detailed list of the changes required to each file in order to ensure the code and tests are aligned based on the deficiencies identified in the audit.

BE SPECIFIC AND DECISIVE. DO NOT PROVIDE ANYTHING HAND-WAVY. DO NOT HALLUCINATE OR GUESS.
